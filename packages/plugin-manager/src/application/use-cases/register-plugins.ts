import { loadPluginSafely } from './load-plugin-safely.js'
import { Logger, type SpecdConfig, type SpecdError } from '@specd/core'
import type { KernelBuilder } from '@specd/core/extensions'
import { describeThrown } from '../../domain/errors/describe-thrown.js'
import { isSpecdError } from '../../domain/errors/is-specd-error.js'
import { PluginDestroyError } from '../../domain/errors/plugin-destroy-error.js'
import { PluginInitError } from '../../domain/errors/plugin-init-error.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import { mergeHandlers } from '../../domain/services/merge-handlers.js'
import { resolvePluginConfig } from '../../domain/services/plugin-config-schema.js'
import { resolveContributions } from '../../domain/services/resolve-contributions.js'
import type { ContributionKindHandler } from '../../domain/types/contribution-kind-handler.js'
import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import type { SpecdPluginManifest } from '../../domain/types/plugin-manifest.js'
import type { PluginLoader } from '../ports/plugin-loader.js'

/** Options for the application `registerPlugins` call. `loader` is required. */
interface RegisterPluginsCall {
  /** Extra kind handlers. The built-in `agents` handler is always included. */
  readonly handlers?: readonly ContributionKindHandler[]
  /** Loader used to validate manifests before any plugin is initialized. */
  readonly loader: PluginLoader
}

/**
 * Handle returned after plugins are initialized.
 */
export interface PluginRegistration {
  /**
   * Destroys initialized plugins in reverse order.
   *
   * Idempotent. Same function registered as the `specd-plugins` disposer.
   */
  readonly dispose: () => Promise<void>
}

/** One plugin after manifest validation and before `init`. */
interface PreparedPlugin {
  readonly name: string
  readonly plugin: SpecdPlugin
  readonly manifest: SpecdPluginManifest
  readonly pluginConfig: Readonly<Record<string, unknown>>
  readonly selected: readonly string[]
}

/**
 * Validates, initializes, and activates every plugin declared in `config.plugins`.
 *
 * Validation finishes before the first `init`. On success exactly one disposer
 * named `specd-plugins` is registered. On failure no disposer is registered and
 * plugins that already initialized are destroyed in reverse order.
 *
 * @param builder - Kernel builder that receives the disposer
 * @param config - Loaded project configuration
 * @param options - Handlers and optional loader
 * @returns A registration whose `dispose` matches the registered disposer
 */
export async function registerPlugins(
  builder: KernelBuilder,
  config: SpecdConfig,
  options: RegisterPluginsCall,
): Promise<PluginRegistration> {
  const handlers = mergeHandlers(options.handlers ?? [])
  const loader = options.loader
  const entries = config.plugins ?? []
  if (entries.length === 0) {
    return { dispose: async () => {} }
  }

  const seenNames = new Set<string>()
  for (const entry of entries) {
    if (seenNames.has(entry.name)) {
      throw new PluginValidationError(entry.name, ['name'])
    }
    seenNames.add(entry.name)
  }

  const prepared: PreparedPlugin[] = []
  for (const entry of entries) {
    const loaded = await loadPluginSafely(loader, entry.name)
    try {
      prepared.push({
        name: entry.name,
        plugin: loaded.plugin,
        manifest: loaded.manifest,
        pluginConfig: resolvePluginConfig(entry.name, loaded.manifest.configSchema, entry.config),
        selected: resolveContributions(entry.name, loaded.manifest, entry.contributions),
      })
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(entry.name, ['load'], error)
    }
  }

  const initialized: PreparedPlugin[] = []
  let disposed = false
  const destroyAll = async (
    plugins: readonly PreparedPlugin[],
  ): Promise<{ errors: unknown[]; names: string[] }> => {
    const errors: unknown[] = []
    const names: string[] = []
    for (let index = plugins.length - 1; index >= 0; index -= 1) {
      const entry = plugins[index]
      try {
        await entry?.plugin.destroy()
      } catch (error) {
        errors.push(error)
        names.push(entry?.name ?? '')
      }
    }
    return { errors, names }
  }
  let disposing: Promise<void> | undefined
  const destroyReverse = (plugins: readonly PreparedPlugin[]): Promise<void> => {
    if (disposing !== undefined) return disposing
    if (disposed) return Promise.resolve()
    disposed = true
    disposing = (async () => {
      try {
        const { errors, names } = await destroyAll(plugins)
        if (errors.length > 0) {
          throw new PluginDestroyError(errors, names)
        }
      } finally {
        disposing = undefined
      }
    })()
    return disposing
  }
  let current = ''
  const rollback = async (original: unknown): Promise<never> => {
    const surfaced = toSpecdError(current, original)
    if (!disposed) {
      disposed = true
      attachRollbackErrors(surfaced, (await destroyAll(initialized)).errors)
    }
    throw surfaced
  }

  try {
    for (const entry of prepared) {
      current = entry.name
      try {
        await entry.plugin.init({ config, pluginConfig: entry.pluginConfig })
      } catch (error) {
        await rollback(error)
      }
      initialized.push(entry)
    }

    for (const entry of prepared) {
      current = entry.name
      const byKind = new Map<string, Map<string, unknown>>()
      for (const id of entry.selected) {
        const located = locateContribution(entry.manifest, id)
        if (located === undefined) continue
        const bucket = byKind.get(located.kind) ?? new Map<string, unknown>()
        bucket.set(id, located.block)
        byKind.set(located.kind, bucket)
      }
      for (const [kind, contributions] of byKind) {
        const handler = handlers.find((candidate) => candidate.kind === kind)
        if (handler?.activate === undefined) continue
        try {
          await handler.activate({
            pluginName: entry.name,
            kind,
            plugin: entry.plugin,
            pluginConfig: entry.pluginConfig,
            contributions,
            builder,
          })
        } catch (error) {
          await rollback(error)
        }
      }
    }
  } catch (error) {
    await rollback(error)
  }

  const dispose = (): Promise<void> => destroyReverse(initialized)
  try {
    builder.registerDisposer('specd-plugins', dispose)
  } catch (error) {
    current = entries.map((entry) => entry.name).join(', ')
    await rollback(error)
  }
  return { dispose }
}

/**
 * Finds the kind and block for one contribution id.
 *
 * @param manifest - Parsed plugin manifest
 * @param id - Contribution id
 * @returns The kind and block, or `undefined` when the id is absent
 */
function locateContribution(
  manifest: SpecdPluginManifest,
  id: string,
): { kind: string; block: unknown } | undefined {
  for (const [kind, blocks] of Object.entries(manifest.contributes)) {
    if (Object.prototype.hasOwnProperty.call(blocks, id)) {
      return { kind, block: blocks[id] }
    }
  }
  return undefined
}

/**
 * Normalises any thrown value to a `SpecdError`.
 *
 * @param pluginName - Plugin being processed when the failure happened
 * @param error - Thrown value
 * @returns The same `SpecdError`, or a `PluginInitError` wrapping anything else
 */
function toSpecdError(pluginName: string, error: unknown): SpecdError {
  return isSpecdError(error) ? error : new PluginInitError(pluginName, error)
}

/**
 * Keeps rollback failures beside the startup error that must still propagate.
 *
 * When the error cannot carry extra properties (frozen or non-extensible) the
 * failures are logged at `warn` instead; the error itself is never replaced.
 *
 * @param error - Original startup failure
 * @param rollbackErrors - Failures from `destroy` during rollback
 */
function attachRollbackErrors(error: SpecdError, rollbackErrors: readonly unknown[]): void {
  if (rollbackErrors.length === 0) return
  try {
    Object.defineProperty(error, 'rollbackErrors', {
      value: rollbackErrors,
      enumerable: true,
      configurable: true,
    })
  } catch {
    Logger.warn('Plugin rollback failed and the startup error cannot carry rollbackErrors', {
      error: error.message,
      rollbackErrors: rollbackErrors.map((failure) => describeThrown(failure)),
    })
  }
}
