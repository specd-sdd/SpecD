import {
  createDefaultConfigLoader,
  createVcsAdapter,
  ConfigNotFoundError,
  Logger,
  type Kernel,
  type KernelOptions,
  type SpecdConfig,
} from '@specd/core'
import { createKernelBuilder } from '@specd/core/extensions'
import { registerPlugins, type ContributionKindHandler } from '@specd/plugin-manager'
import {
  createCodeGraphProvider,
  createBootstrapGraphConfig,
  type CodeGraphCompositionOptions,
  type CodeGraphProvider,
} from '@specd/code-graph'

/**
 * Host context with a wired kernel and graph-provider factory bound to one config.
 *
 * The context is `AsyncDisposable`: `await using host = await openSpecdHost()` releases it
 * when the scope exits. Disposal delegates to the kernel and does not close graph providers
 * created through `createGraphProvider()`; callers own what they create.
 */
export interface SdkHostContext extends AsyncDisposable {
  /** Wired specd kernel for lifecycle and project queries. */
  readonly kernel: Kernel
  /** Creates a new {@link CodeGraphProvider} for the host config. */
  readonly createGraphProvider: () => CodeGraphProvider
  /**
   * Releases the kernel's disposers. Idempotent: repeated and concurrent calls share one
   * promise (see `Kernel.dispose`).
   */
  readonly dispose: () => Promise<void>
}

/**
 * SDK-owned bootstrap options for kernel and graph composition.
 */
export interface SdkContextOptions {
  /** Optional kernel construction overrides (e.g. logging). */
  readonly kernel?: KernelOptions
  /** Optional code-graph composition overrides bound to the same config. */
  readonly graph?: CodeGraphCompositionOptions
  /**
   * When `false`, configured plugins are not loaded or initialized.
   * Defaults to enabled.
   */
  readonly plugins?: boolean
  /** Extra contribution-kind handlers supplied by the host. */
  readonly pluginHandlers?: readonly ContributionKindHandler[]
}

/**
 * Input for {@link openSpecdHost}.
 *
 * Callers may bootstrap from one explicit config file via `configPath`, from one
 * discovery root via `startDir`, or from `process.cwd()` by omitting both fields.
 * `configPath` and `startDir` must never be provided together.
 */
export interface OpenSpecdHostInput {
  /** Absolute path to `specd.yaml` for forced load mode. */
  readonly configPath?: string
  /** Directory to start config discovery from without mutating `process.cwd()`. */
  readonly startDir?: string
  /** Permit discovery-mode graph bootstrap when no configuration exists. */
  readonly allowBootstrapFallback?: boolean
  /** Optional SDK-owned kernel and graph composition overrides. */
  readonly options?: SdkContextOptions
}

/**
 * Result of {@link openSpecdHost} including loaded config metadata.
 *
 * This is a thin bootstrap wrapper over the loaded {@link SpecdConfig} and the
 * shared {@link SdkHostContext}. Configuration warnings remain on
 * `config.warnings`; this result does not duplicate them as a top-level field.
 */
export interface OpenSpecdHostResult extends SdkHostContext {
  /** Resolved project configuration, including any load-time advisory warnings. */
  readonly config: SpecdConfig
  /** Absolute path to the loaded config file, or `null` when not locatable. */
  readonly configFilePath: string | null
}

/**
 * Builds host context from an already-loaded config.
 *
 * @param config - Resolved project configuration
 * @param options - Optional SDK-owned kernel and graph composition overrides
 * @returns Kernel plus graph-provider factory sharing the same config, with disposal members
 */
export async function createSdkContext(
  config: SpecdConfig,
  options?: SdkContextOptions,
): Promise<SdkHostContext> {
  const builder = createKernelBuilder(config, options?.kernel)
  const registration =
    options?.plugins === false
      ? undefined
      : await registerPlugins(builder, config, { handlers: options?.pluginHandlers ?? [] })
  let kernel: Kernel
  try {
    kernel = await builder.build()
  } catch (error) {
    if (registration !== undefined) {
      try {
        await registration.dispose()
      } catch (disposeError) {
        const failures = readRollbackFailures(disposeError)
        throw attachRollbackErrors(error, failures)
      }
    }
    throw error
  }
  const dispose = (): Promise<void> => kernel.dispose()
  return {
    kernel,
    createGraphProvider: () => createCodeGraphProvider(config, options?.graph),
    dispose,
    [Symbol.asyncDispose]: dispose,
  }
}

/**
 * Loads config and builds the SDK host context.
 *
 * Supports three bootstrap modes:
 * - forced-file mode via `configPath`
 * - discovery-root mode via `startDir`
 * - default discovery from `process.cwd()` when neither is provided
 *
 * @param input - Optional bootstrap input and SDK-owned composition overrides
 * @returns Loaded config, path, kernel, and graph-provider factory. Any
 * configuration warnings remain attached to `config.warnings`.
 * @throws {Error} When both `configPath` and `startDir` are provided together
 */
export async function openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult> {
  if (input?.configPath !== undefined && input.startDir !== undefined) {
    throw new Error('openSpecdHost accepts either configPath or startDir, but never both')
  }

  const startDir = input?.startDir ?? process.cwd()
  const loader = await createDefaultConfigLoader(
    input?.configPath !== undefined
      ? { configPath: input.configPath }
      : input?.startDir !== undefined
        ? { startDir: input.startDir }
        : { startDir },
  )
  let config: SpecdConfig
  let configFilePath: string | null
  try {
    ;[config, configFilePath] = await Promise.all([loader.load(), loader.resolvePath()])
  } catch (error) {
    if (
      input?.configPath !== undefined ||
      input?.allowBootstrapFallback !== true ||
      !(error instanceof ConfigNotFoundError)
    ) {
      throw error
    }
    const vcs = await createVcsAdapter(startDir)
    const root = vcs.rootDir()
    config = createBootstrapGraphConfig({ projectRoot: root, vcsRoot: root })
    configFilePath = null
  }
  const ctx = await createSdkContext(config, input?.options)
  return {
    config,
    configFilePath,
    ...ctx,
  }
}

/**
 * Collects the individual dispose failures behind a plugin disposal error.
 *
 * The plugin disposer rejects with a `PluginDestroyError` (or a plain
 * `AggregateError`) carrying one entry per failed `destroy`; those entries are
 * unpacked so `rollbackErrors` lists the real failures. Detection is
 * structural so the SDK does not depend on the concrete error class identity.
 *
 * @param disposeError - Failure from plugin disposal
 * @returns The individual dispose failures
 */
function readRollbackFailures(disposeError: unknown): readonly unknown[] {
  if (
    typeof disposeError === 'object' &&
    disposeError !== null &&
    'errors' in disposeError &&
    Array.isArray(disposeError.errors) &&
    (disposeError instanceof AggregateError ||
      ('code' in disposeError && disposeError.code === 'PLUGIN_DESTROY_FAILED'))
  ) {
    return [...(disposeError.errors as readonly unknown[])]
  }
  return [disposeError]
}

/**
 * Keeps dispose failures beside the build error that must still propagate.
 *
 * The build error is always the value that propagates, unchanged. An extensible
 * object build error carries the failures as `rollbackErrors` (identity preserved).
 * A primitive, `null`, or frozen/non-extensible build error cannot carry properties
 * (`Object.defineProperty` throws), so it is returned untouched and its rollback
 * failures are reported through core's `Logger` at `warn` instead of being lost.
 *
 * Limitation: `Logger` is the ambient core logger. `Logger.setImplementation` runs
 * inside the kernel build, after the log directory is created. When the build fails
 * before that point (or no kernel was ever built in this process) the ambient logger
 * is still the null implementation and the warning is silently dropped. The warning
 * does not reach `options.kernel.onLog` either. Only a non-carrying build error
 * combined with a dispose failure is affected.
 *
 * @param error - Original build failure
 * @param rollbackErrors - Failures from plugin disposal
 * @returns `error` itself, to be thrown by the caller
 */
function attachRollbackErrors(error: unknown, rollbackErrors: readonly unknown[]): unknown {
  if (rollbackErrors.length === 0) return error
  if (typeof error === 'object' && error !== null) {
    try {
      Object.defineProperty(error, 'rollbackErrors', {
        value: rollbackErrors,
        enumerable: true,
        configurable: true,
      })
      return error
    } catch {
      // Frozen or non-extensible: fall through to the logger.
    }
  }
  Logger.warn('plugin disposal failed after the kernel build failed', {
    rollbackErrors: rollbackErrors.map((failure) =>
      failure instanceof Error ? failure.message : String(failure),
    ),
  })
  return error
}
