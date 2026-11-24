import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { PLUGIN_NAME_REGEX, type SpecdConfig } from '@specd/core'
import { z } from 'zod'
import type { LoadedPlugin, PluginLoader } from '../../application/ports/plugin-loader.js'
import { DuplicateContributionError } from '../../domain/errors/duplicate-contribution-error.js'
import { isSpecdError } from '../../domain/errors/is-specd-error.js'
import { PluginNotFoundError } from '../../domain/errors/plugin-not-found.js'
import { PluginValidationError } from '../../domain/errors/plugin-validation.js'
import { UnknownContributionKindError } from '../../domain/errors/unknown-contribution-kind-error.js'
import { mergeHandlers } from '../../domain/services/merge-handlers.js'
import {
  assertSupportedConfigSchema,
  resolvePluginConfig,
} from '../../domain/services/plugin-config-schema.js'
import type { ContributionKindHandler } from '../../domain/types/contribution-kind-handler.js'
import type { SpecdPluginManifest } from '../../domain/types/plugin-manifest.js'
import {
  baseContractFields,
  CONTRIBUTION_ID_REGEX,
  isSpecdPlugin,
} from '../../domain/types/specd-plugin.js'

/**
 * Factory options for creating plugin loaders.
 */
export interface PluginLoaderOptions {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /** Extra kind handlers merged with the built-in `agents` handler. */
  readonly handlers?: readonly ContributionKindHandler[]
}

const manifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    name: z.string().regex(PLUGIN_NAME_REGEX),
    version: z.string().min(1),
    description: z.string().optional(),
    minCoreVersion: z.string().default('*'),
    contributes: z.record(z.record(z.unknown())).default({}),
    configSchema: z.unknown().optional(),
    defaultConfig: z.record(z.unknown()).optional(),
  })
  .strict()

/**
 * Filesystem + dynamic-import implementation of `PluginLoader`.
 *
 * The manifest and contribution blocks are validated before the package is imported.
 * Lifecycle methods are never called.
 */
class RuntimePluginLoader implements PluginLoader {
  private readonly handlers: readonly ContributionKindHandler[]

  /**
   * Creates the loader.
   *
   * @param config - Project configuration used for `create()`
   * @param handlers - Kind handlers, including the built-in agents handler
   */
  constructor(
    private readonly config: SpecdConfig,
    handlers: readonly ContributionKindHandler[],
  ) {
    this.handlers = handlers
  }

  /**
   * Loads and validates a plugin package.
   *
   * @param pluginName - Plugin package name
   * @returns Loaded plugin and manifest
   */
  async load(pluginName: string): Promise<LoadedPlugin> {
    const projectRoot: unknown = this.config.projectRoot
    if (
      typeof projectRoot !== 'string' ||
      projectRoot.length === 0 ||
      !path.isAbsolute(projectRoot)
    ) {
      throw new PluginValidationError(pluginName, ['projectRoot'])
    }
    const resolved = await this.resolvePackagePaths(pluginName)
    if (resolved === null) throw new PluginNotFoundError(pluginName)

    const manifestPath = path.join(resolved.packageRoot, 'specd-plugin.json')
    const manifestRaw = await this.readManifest(pluginName, manifestPath)
    const manifest = this.validateManifest(pluginName, manifestRaw)

    let imported: unknown
    try {
      imported = (await import(pathToFileURL(resolved.entryPath).href)) as unknown
    } catch (error) {
      throw new PluginValidationError(pluginName, ['entry'], error)
    }
    let createFunction: ReturnType<typeof resolveCreateExport>
    try {
      createFunction = resolveCreateExport(imported)
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(pluginName, ['create'], error)
    }
    if (createFunction === undefined) {
      throw new PluginValidationError(pluginName, ['create'])
    }
    let plugin: unknown
    try {
      plugin = await createFunction({ config: this.config })
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(pluginName, ['create'], error)
    }
    try {
      await this.validateRuntimePlugin(pluginName, plugin, manifest)
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(pluginName, ['plugin'], error)
    }
    return { plugin: plugin as LoadedPlugin['plugin'], manifest }
  }

  /**
   * Reads and parses `specd-plugin.json`.
   *
   * @param pluginName - Plugin package name
   * @param manifestPath - Absolute path to the manifest
   * @returns The raw JSON value
   * @throws {PluginValidationError} When the file is missing or is not JSON
   */
  private async readManifest(pluginName: string, manifestPath: string): Promise<unknown> {
    let content: string
    try {
      content = await readFile(manifestPath, 'utf8')
    } catch (error) {
      throw new PluginValidationError(pluginName, ['specd-plugin.json'], error)
    }
    try {
      return JSON.parse(content) as unknown
    } catch (error) {
      throw new PluginValidationError(pluginName, ['specd-plugin.json'], error)
    }
  }

  /**
   * Validates the manifest schema, contributions, and default config.
   *
   * @param pluginName - Plugin package name
   * @param manifestRaw - Parsed manifest JSON
   * @returns The typed manifest
   * @throws {PluginValidationError} When the manifest shape is invalid
   */
  private validateManifest(pluginName: string, manifestRaw: unknown): SpecdPluginManifest {
    const parsed = manifestSchema.safeParse(manifestRaw)
    if (!parsed.success) {
      const fields = parsed.error.issues.flatMap((issue) => {
        if (issue.code === 'unrecognized_keys') {
          return issue.keys.map((key) => [...issue.path, key].join('.'))
        }
        return [issue.path.length === 0 ? 'manifest' : issue.path.join('.')]
      })
      throw new PluginValidationError(pluginName, fields)
    }
    const data = parsed.data
    if (data.name !== pluginName) {
      throw new PluginValidationError(pluginName, ['name'])
    }
    if (data.configSchema !== undefined) {
      assertSupportedConfigSchema(pluginName, data.configSchema)
    }
    // `JSON.parse` keeps a `__proto__` key as an own property but the schema parse would drop it,
    // so the raw (already shape-checked) map is validated to keep it visible as an unknown kind.
    const rawContributes = (manifestRaw as { contributes?: Readonly<Record<string, unknown>> })
      .contributes
    const contributes = validateContributions(
      pluginName,
      (rawContributes ?? data.contributes) as Readonly<
        Record<string, Readonly<Record<string, unknown>>>
      >,
      this.handlers,
    )
    const configSchema = data.configSchema
    if (data.defaultConfig !== undefined) {
      resolvePluginConfig(pluginName, configSchema, data.defaultConfig)
    }
    return {
      schemaVersion: 2,
      name: data.name,
      version: data.version,
      ...(data.description !== undefined ? { description: data.description } : {}),
      minCoreVersion: data.minCoreVersion,
      contributes,
      ...(configSchema !== undefined ? { configSchema } : {}),
      ...(data.defaultConfig !== undefined ? { defaultConfig: data.defaultConfig } : {}),
    }
  }

  /**
   * Checks the runtime plugin against the manifest and handler contracts.
   *
   * @param pluginName - Plugin package name
   * @param plugin - Value returned by `create()`
   * @param manifest - Validated manifest
   * @throws {PluginValidationError} When the runtime value does not match the manifest
   */
  private async validateRuntimePlugin(
    pluginName: string,
    plugin: unknown,
    manifest: SpecdPluginManifest,
  ): Promise<void> {
    let contractFields: readonly string[]
    try {
      contractFields = baseContractFields(plugin)
    } catch (error) {
      if (isSpecdError(error)) throw error
      throw new PluginValidationError(pluginName, ['plugin'], error)
    }
    if (contractFields.length > 0 || !isSpecdPlugin(plugin)) {
      throw new PluginValidationError(pluginName, contractFields)
    }
    if (plugin.name !== manifest.name) {
      throw new PluginValidationError(pluginName, ['name'])
    }
    if (plugin.version !== manifest.version) {
      throw new PluginValidationError(pluginName, ['version'])
    }
    for (const kind of Object.keys(manifest.contributes)) {
      const handler = this.handlers.find((candidate) => candidate.kind === kind)
      try {
        // An async handler hook is awaited so a rejection is a validation failure, not an
        // unhandled rejection.
        const outcome: unknown = handler?.validatePlugin?.(plugin, pluginName)
        await outcome
      } catch (error) {
        if (isSpecdError(error)) throw error
        throw new PluginValidationError(pluginName, [`contributes.${kind}`], error)
      }
    }
    const needsContribution = Object.keys(manifest.contributes).some((kind) => {
      const handler = this.handlers.find((candidate) => candidate.kind === kind)
      return handler?.activate !== undefined
    })
    if (needsContribution && typeof plugin.contribution !== 'function') {
      throw new PluginValidationError(pluginName, ['contribution'])
    }
  }

  /**
   * Resolves a package entry and its package root.
   *
   * @param pluginName - Plugin package name
   * @returns The package root and entry path, or `null` when unresolved
   */
  private resolvePackagePaths(
    pluginName: string,
  ): Promise<{ readonly packageRoot: string; readonly entryPath: string } | null> {
    return this.resolvePackagePathsInternal(pluginName)
  }

  /**
   * Tries each resolver until one package resolves.
   *
   * @param pluginName - Plugin package name
   * @returns The package root and entry path, or `null` when unresolved
   */
  private async resolvePackagePathsInternal(
    pluginName: string,
  ): Promise<{ readonly packageRoot: string; readonly entryPath: string } | null> {
    for (const resolver of this.createResolvers()) {
      try {
        const entryPath = resolver.resolve(pluginName, {
          conditions: new Set(['import', 'node', 'default']),
        } as unknown as NodeJS.RequireResolveOptions)
        const packageRoot = await this.derivePackageRoot(pluginName, entryPath)
        if (packageRoot === null) continue
        return { packageRoot, entryPath }
      } catch {
        // Try the next resolver.
      }
    }
    return null
  }

  /**
   * Builds require resolvers for the project and the loader package.
   *
   * @returns Resolvers tried in order
   */
  private createResolvers(): readonly NodeJS.Require[] {
    return [
      createRequire(path.join(this.config.projectRoot, 'package.json')),
      createRequire(import.meta.url),
    ]
  }

  /**
   * Walks up from an entry file until `package.json` names the plugin.
   *
   * @param pluginName - Plugin package name
   * @param entryPath - Resolved entry file
   * @returns The package root, or `null` when no matching package is found
   */
  private async derivePackageRoot(pluginName: string, entryPath: string): Promise<string | null> {
    let current = path.dirname(entryPath)
    while (true) {
      try {
        const packageJson = JSON.parse(
          await readFile(path.join(current, 'package.json'), 'utf8'),
        ) as {
          name?: unknown
        }
        if (packageJson.name === pluginName) return current
      } catch {
        // Keep walking up.
      }
      const parent = path.dirname(current)
      if (parent === current) return null
      current = parent
    }
  }
}

/**
 * Creates a plugin loader.
 *
 * @param options - Loader options
 * @returns Plugin loader instance
 */
export function createPluginLoader(options: PluginLoaderOptions): PluginLoader {
  return new RuntimePluginLoader(options.config, mergeHandlers(options.handlers ?? []))
}

/**
 * Validates contribution blocks against their kind handlers.
 *
 * @param pluginName - Plugin package name
 * @param contributes - Raw contribution map
 * @param handlers - Registered kind handlers
 * @returns The parsed contribution map
 * @throws {PluginValidationError} When a block or id is invalid
 * @throws {UnknownContributionKindError} When a kind has no handler
 * @throws {DuplicateContributionError} When an id is declared twice
 */
function validateContributions(
  pluginName: string,
  contributes: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
  handlers: readonly ContributionKindHandler[],
): SpecdPluginManifest['contributes'] {
  const seen = new Set<string>()
  const parsed: Record<string, Readonly<Record<string, unknown>>> = {}
  for (const [kind, block] of Object.entries(contributes)) {
    const handler = handlers.find((candidate) => candidate.kind === kind)
    if (handler === undefined) throw new UnknownContributionKindError(pluginName, kind)
    const value = parseBlock(pluginName, kind, block, handler, seen)
    parsed[kind] = value
  }
  return parsed
}

/**
 * Reads `create` from a module namespace or its default export.
 *
 * @param moduleValue - Imported module namespace
 * @returns The create function, or `undefined` when it is absent
 */
function resolveCreateExport(
  moduleValue: unknown,
): ((options: { config: SpecdConfig }) => Promise<unknown>) | undefined {
  if (typeof moduleValue !== 'object' || moduleValue === null) return undefined
  const moduleObject = moduleValue as Record<string, unknown>
  const directCreate = moduleObject['create']
  if (typeof directCreate === 'function') {
    return directCreate as (options: { config: SpecdConfig }) => Promise<unknown>
  }
  const defaultExport = moduleObject['default']
  if (typeof defaultExport === 'function') {
    return defaultExport as (options: { config: SpecdConfig }) => Promise<unknown>
  }
  if (typeof defaultExport === 'object' && defaultExport !== null) {
    const defaultCreate = (defaultExport as Record<string, unknown>)['create']
    if (typeof defaultCreate === 'function') {
      return defaultCreate as (options: { config: SpecdConfig }) => Promise<unknown>
    }
  }
  return undefined
}

/**
 * Validates one contribution block with its handler schema, whatever the schema returns.
 *
 * Any malformed schema outcome (a throw, `undefined`, a failure without `error`, hostile data)
 * becomes a `PluginValidationError` on `contributes.<kind>`; specd errors pass through.
 *
 * @param pluginName - Plugin package name
 * @param kind - Contribution kind
 * @param block - Raw block value
 * @param handler - Handler registered for the kind
 * @param seen - Ids already declared by earlier kinds, updated with this block's ids
 * @returns The parsed block
 * @throws {PluginValidationError} When the block or an id is invalid
 * @throws {DuplicateContributionError} When an id is declared twice
 */
function parseBlock(
  pluginName: string,
  kind: string,
  block: unknown,
  handler: ContributionKindHandler,
  seen: Set<string>,
): Readonly<Record<string, unknown>> {
  try {
    const result = handler.blockSchema.safeParse(block)
    if (!result.success) {
      throw new PluginValidationError(
        pluginName,
        result.error.issues.map((issue) =>
          ['contributes', kind, ...issue.path].filter((part) => part !== '').join('.'),
        ),
      )
    }
    if (typeof result.data !== 'object' || result.data === null || Array.isArray(result.data)) {
      throw new PluginValidationError(pluginName, [`contributes.${kind}`])
    }
    const value = result.data as Record<string, unknown>
    for (const id of Object.keys(value)) {
      if (!CONTRIBUTION_ID_REGEX.test(id)) {
        throw new PluginValidationError(pluginName, [`contributes.${kind}.${id}`])
      }
      if (seen.has(id)) throw new DuplicateContributionError(pluginName, id)
      seen.add(id)
    }
    return value
  } catch (error) {
    if (isSpecdError(error)) throw error
    throw new PluginValidationError(pluginName, [`contributes.${kind}`], error)
  }
}
