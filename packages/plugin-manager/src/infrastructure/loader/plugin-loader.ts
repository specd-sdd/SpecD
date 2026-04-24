import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import type { SpecdConfig } from '@specd/core'
import type { PluginLoader } from '../../application/ports/plugin-loader.js'
import type { SpecdPlugin } from '../../domain/types/specd-plugin.js'
import { isSpecdPlugin } from '../../domain/types/specd-plugin.js'
import { isAgentPlugin } from '../../domain/types/agent-plugin.js'
import { PluginNotFoundError } from '../../domain/errors/plugin-not-found.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'

/**
 * Factory options for creating plugin loaders.
 */
export interface PluginLoaderOptions {
  /**
   * Fully-resolved project configuration.
   */
  readonly config: SpecdConfig
}

/**
 * Manifest schema for `specd-plugin.json`.
 */
const manifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  pluginType: z.enum(['agent']),
  minCoreVersion: z.string().default('*'),
  description: z.string().optional(),
})

/**
 * Filesystem + dynamic-import implementation of `PluginLoader`.
 */
class RuntimePluginLoader implements PluginLoader {
  /**
   * Creates a loader anchored at a project root.
   *
   * @param config - Project configuration.
   */
  constructor(private readonly config: SpecdConfig) {}

  /**
   * Loads and validates a plugin package.
   *
   * @param pluginName - Plugin package name.
   * @returns Runtime plugin instance.
   */
  async load(pluginName: string): Promise<SpecdPlugin> {
    const resolved = await this.resolvePackagePaths(pluginName)
    if (resolved === null) {
      throw new PluginNotFoundError(pluginName)
    }
    const { packageRoot, entryPath } = resolved

    const manifestPath = path.join(packageRoot, 'specd-plugin.json')
    const manifestRaw = await this.readManifest(pluginName, manifestPath)
    const manifest = this.validateManifest(pluginName, manifestRaw)

    const createFunction = resolveCreateExport(
      (await import(pathToFileURL(entryPath).href)) as unknown,
    )
    if (createFunction === undefined) {
      throw new PluginValidationError(pluginName, ['create'])
    }

    const plugin = await createFunction({ config: this.config })
    this.validateRuntimePlugin(pluginName, plugin, manifest.pluginType)
    return plugin
  }

  /**
   * Reads a plugin manifest file.
   *
   * @param pluginName - Plugin package name.
   * @param manifestPath - Absolute manifest path.
   * @returns Raw manifest object.
   */
  private async readManifest(pluginName: string, manifestPath: string): Promise<unknown> {
    let content: string
    try {
      content = await readFile(manifestPath, 'utf8')
    } catch {
      throw new PluginValidationError(pluginName, ['specd-plugin.json'])
    }

    try {
      return JSON.parse(content) as unknown
    } catch {
      throw new PluginValidationError(pluginName, ['specd-plugin.json'])
    }
  }

  /**
   * Validates a raw manifest payload.
   *
   * @param pluginName - Plugin package name.
   * @param manifestRaw - Raw manifest object.
   * @returns Parsed manifest.
   * @throws {PluginValidationError} When manifest fields are invalid.
   */
  private validateManifest(
    pluginName: string,
    manifestRaw: unknown,
  ): z.infer<typeof manifestSchema> {
    const parsed = manifestSchema.safeParse(manifestRaw)
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.') || 'manifest')
      throw new PluginValidationError(pluginName, fields)
    }
    return parsed.data
  }

  /**
   * Validates runtime plugin contract.
   *
   * @param pluginName - Plugin package name.
   * @param plugin - Runtime plugin instance.
   * @param pluginType - Manifest plugin type.
   * @throws {PluginValidationError} When runtime contract validation fails.
   */
  private validateRuntimePlugin(
    pluginName: string,
    plugin: unknown,
    pluginType: z.infer<typeof manifestSchema>['pluginType'],
  ): asserts plugin is SpecdPlugin {
    if (!isSpecdPlugin(plugin)) {
      throw new PluginValidationError(pluginName, [
        'name',
        'type',
        'version',
        'configSchema',
        'init',
        'destroy',
      ])
    }

    if (pluginType === 'agent' && !isAgentPlugin(plugin)) {
      throw new PluginValidationError(pluginName, ['install', 'uninstall'])
    }
  }

  /**
   * Resolves package and entry paths trying project-local first, then CLI runtime.
   *
   * @param pluginName - Plugin package name.
   * @returns Resolved paths or `null` when unresolved.
   */
  private resolvePackagePaths(
    pluginName: string,
  ): Promise<{ readonly packageRoot: string; readonly entryPath: string } | null> {
    return this.resolvePackagePathsInternal(pluginName)
  }

  /**
   * Internal async package resolution implementation.
   *
   * @param pluginName - Plugin package name.
   * @returns Resolved paths or `null` when unresolved.
   */
  private async resolvePackagePathsInternal(
    pluginName: string,
  ): Promise<{ readonly packageRoot: string; readonly entryPath: string } | null> {
    const resolvers = this.createResolvers()
    for (const resolver of resolvers) {
      try {
        const entryPath = resolver.resolve(pluginName, {
          conditions: new Set(['import', 'node', 'default']),
        } as unknown as NodeJS.RequireResolveOptions)
        const packageRoot = await this.derivePackageRoot(pluginName, entryPath)
        if (packageRoot === null) {
          continue
        }
        return { packageRoot, entryPath }
      } catch {
        // Try next resolver.
      }
    }
    return null
  }

  /**
   * Creates module resolvers in priority order.
   *
   * @returns Require resolvers in resolution order.
   */
  private createResolvers(): readonly NodeJS.Require[] {
    return [
      createRequire(path.join(this.config.projectRoot, 'package.json')),
      createRequire(import.meta.url),
    ]
  }

  /**
   * Derives package root from a resolved entry file path.
   *
   * @param pluginName - Plugin package name.
   * @param entryPath - Absolute resolved entry path.
   * @returns Package root path or `null` when derivation fails.
   */
  private async derivePackageRoot(pluginName: string, entryPath: string): Promise<string | null> {
    let current = path.dirname(entryPath)
    while (true) {
      const packageJsonPath = path.join(current, 'package.json')
      try {
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
          name?: unknown
        }
        if (packageJson.name === pluginName) {
          return current
        }
      } catch {
        // Keep walking up.
      }

      const parent = path.dirname(current)
      if (parent === current) {
        return null
      }
      current = parent
    }
  }
}

/**
 * Creates a plugin loader.
 *
 * @param options - Loader options.
 * @returns Plugin loader instance.
 */
export function createPluginLoader(options: PluginLoaderOptions): PluginLoader {
  return new RuntimePluginLoader(options.config)
}

/**
 * Resolves the exported `create()` factory function from a loaded module.
 *
 * @param moduleValue - Dynamically imported module namespace.
 * @returns Factory function when available.
 */
function resolveCreateExport(
  moduleValue: unknown,
): ((options: PluginLoaderOptions) => Promise<unknown>) | undefined {
  if (typeof moduleValue !== 'object' || moduleValue === null) return undefined

  const moduleObject = moduleValue as Record<string, unknown>
  const directCreate = moduleObject['create']
  if (typeof directCreate === 'function') {
    return directCreate as (options: PluginLoaderOptions) => Promise<unknown>
  }

  const defaultExport = moduleObject['default']
  if (typeof defaultExport === 'object' && defaultExport !== null) {
    const defaultCreate = (defaultExport as Record<string, unknown>)['create']
    if (typeof defaultCreate === 'function') {
      return defaultCreate as (options: PluginLoaderOptions) => Promise<unknown>
    }
  }

  return undefined
}
