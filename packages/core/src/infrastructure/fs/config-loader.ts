import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ConfigLoader } from '../../application/ports/config-loader.js'
import { isInvalidationPolicy } from '../../domain/value-objects/invalidation-policy.js'
import {
  type SpecdConfig,
  type SpecdAdapterBinding,
  type SpecdWorkspaceConfig,
  type SpecdStorageConfig,
  type SpecdContextEntry,
} from '../../application/specd-config.js'
import { type SchemaOperations } from '../../domain/services/merge-schema-layers.js'
import { ConfigValidationError } from '../../domain/errors/config-validation-error.js'
import { StorageDirectoryNotFoundError } from '../../domain/errors/index.js'
import {
  isRecord,
  formatZodPath,
  validateContextPatterns,
  SpecdYamlZodSchema,
} from '../../application/ports/config-schema.js'
import {
  type ConfigCascadeLayer,
  type ResolvedConfigCascade,
  findCandidateDirectory,
  discoverCandidateFiles,
  parseCascadeLayer,
  resolveActiveChain,
  resolveForcedCascade,
  tryLoadEnvFiles,
  applyEnvOverrides,
  mergeActiveLayers,
} from './config-cascade.js'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for constructing a {@link FsConfigLoader}.
 *
 * Two modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir`, bounded
 *   by the nearest git repository root, to find `specd.yaml`. Honouring any
 *   `specd.local.yaml` sibling found at the same directory level.
 * - **Forced mode** (`{ configPath }`) — uses the specified file exactly as
 *   given. No `specd.local.yaml` lookup takes place. Maps to the CLI
 *   `--config path/to/specd.yaml` flag.
 */
export type FsConfigLoaderOptions = { readonly startDir: string } | { readonly configPath: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses and normalizes the type and config block from raw adapter configuration,
 * handling legacy compatibility formats and collecting non-fatal warnings when a
 * legacy format is used.
 *
 * @param raw - Raw config object
 * @param adapterVal - Raw value of the adapter property
 * @param fieldPath - Config field path for error/warning messages
 * @param configPath - Config file path for error messages
 * @param warnings - Collected configuration warnings
 * @returns Object with resolved type and config record
 * @throws {@link ConfigValidationError} When the raw adapter configuration is invalid
 */
function parseRawAdapter(
  raw: Record<string, unknown>,
  adapterVal: unknown,
  fieldPath: string,
  configPath: string,
  warnings?: string[],
): { type: string; config: Record<string, unknown> } {
  if (typeof adapterVal === 'string') {
    if (adapterVal.length === 0) {
      throw new ConfigValidationError(
        configPath,
        `${fieldPath}.adapter: expected non-empty adapter name`,
      )
    }
    const type = adapterVal
    let config: Record<string, unknown> = {}
    const legacyConfig = raw[type]
    if (legacyConfig !== undefined) {
      if (!isRecord(legacyConfig)) {
        throw new ConfigValidationError(configPath, `${fieldPath}.${type}: expected object`)
      }
      config = { ...legacyConfig }
      if (warnings !== undefined) {
        warnings.push(
          `Legacy configuration format detected at '${fieldPath}'. Please migrate to 'adapter: { type: "${type}", config: ... }' (the legacy format will be removed in future versions).`,
        )
      }
    }
    return { type, config }
  }

  if (isRecord(adapterVal)) {
    const typeVal = adapterVal.type
    if (typeof typeVal !== 'string' || typeVal.length === 0) {
      throw new ConfigValidationError(
        configPath,
        `${fieldPath}.adapter.type: expected non-empty string`,
      )
    }
    const type = typeVal
    let config: Record<string, unknown> = {}
    const configVal = adapterVal.config
    if (configVal !== undefined) {
      if (!isRecord(configVal)) {
        throw new ConfigValidationError(configPath, `${fieldPath}.adapter.config: expected object`)
      }
      config = { ...configVal }
    }
    return { type, config }
  }

  throw new ConfigValidationError(configPath, `${fieldPath}.adapter: invalid structure`)
}

/**
 * Resolves a raw adapter binding from config into the normalized kernel-facing shape.
 *
 * For `fs`, the `path` field is required and resolved to an absolute path. For
 * all other adapters, the adapter-specific block is preserved opaquely and no
 * semantic validation is performed here.
 *
 * @param configDir - Absolute directory containing the loaded config file
 * @param configPath - Absolute config file path for validation errors
 * @param fieldPath - Config field path for error messages
 * @param raw - Raw adapter binding object from parsed YAML
 * @param fallbackLegacyPath - Compatibility-only path used when the adapter is not `fs`
 * @param allowPattern - Whether `pattern` is allowed for `fs` adapter options
 * @param warnings - Collected configuration warnings
 * @returns The normalized adapter binding and compatibility legacy path
 * @throws {@link ConfigValidationError} When the binding shape is invalid
 */
function resolveAdapterBinding(
  configDir: string,
  configPath: string,
  fieldPath: string,
  raw: Record<string, unknown>,
  fallbackLegacyPath: string,
  allowPattern = false,
  warnings?: string[],
): { binding: SpecdAdapterBinding; legacyPath: string } {
  const adapterVal = raw.adapter
  if (!adapterVal) {
    throw new ConfigValidationError(
      configPath,
      `${fieldPath}.adapter: expected non-empty adapter name or object`,
    )
  }

  const { type, config: rawConfig } = parseRawAdapter(
    raw,
    adapterVal,
    fieldPath,
    configPath,
    warnings,
  )
  let config = rawConfig

  // Normalize relative path in config
  if (typeof config.path === 'string' && !path.isAbsolute(config.path)) {
    config = { ...config, path: path.resolve(configDir, config.path) }
  }

  // Normalize relative metadataPath (spec specific) to absolute
  if (typeof config.metadataPath === 'string' && !path.isAbsolute(config.metadataPath)) {
    config = { ...config, metadataPath: path.resolve(configDir, config.metadataPath) }
  }

  // If type is 'fs', validate path
  if (type === 'fs') {
    const fsPath = config.path
    if (typeof fsPath !== 'string' || fsPath.length === 0) {
      throw new ConfigValidationError(configPath, `${fieldPath}.fs.path: expected string`)
    }
    const resolvedPath = path.resolve(configDir, fsPath)
    const normalizedConfig: Record<string, unknown> = { path: resolvedPath }
    if (typeof config.metadataPath === 'string' && config.metadataPath.length > 0) {
      normalizedConfig.metadataPath = path.isAbsolute(config.metadataPath)
        ? config.metadataPath
        : path.resolve(configDir, config.metadataPath)
    }
    if (allowPattern) {
      const pattern = config.pattern
      if (pattern !== undefined) {
        if (typeof pattern !== 'string') {
          throw new ConfigValidationError(configPath, `${fieldPath}.fs.pattern: expected string`)
        }
        normalizedConfig.pattern = pattern
      }
    }
    return { binding: { adapter: type, config: normalizedConfig }, legacyPath: resolvedPath }
  }

  return {
    binding: { adapter: type, config },
    legacyPath: fallbackLegacyPath,
  }
}

// ---------------------------------------------------------------------------
// FsConfigLoader
// ---------------------------------------------------------------------------

/**
 * Filesystem implementation of the {@link ConfigLoader} port.
 *
 * Supports two construction modes:
 * - **Discovery mode** (`{ startDir }`) — walks up from `startDir` to find
 *   candidate config files, resolving a cascade chain.
 * - **Forced mode** (`{ configPath }`) — uses the specified file directly as
 *   a closed chain.
 *
 * In both modes, candidate layers are deep-merged and the result is validated
 * against a Zod schema before any path resolution takes place. All relative
 * paths in the config are resolved relative to the config file's directory.
 * `isExternal` is inferred from whether each workspace's `specsPath` lies
 * outside the git repository root.
 */
export class FsConfigLoader extends ConfigLoader {
  private readonly _options: FsConfigLoaderOptions

  /**
   * Creates a new `FsConfigLoader`.
   *
   * @param rootPath - Resolved VCS root boundary, or `null` outside a repository
   * @param options - Discovery or forced-path options
   */
  constructor(rootPath: string | null, options: FsConfigLoaderOptions) {
    super(rootPath)
    this._options = options
  }

  /**
   * Loads, validates, and returns the fully-resolved project configuration.
   *
   * @param options - Loading options (e.g. skip directory existence checks)
   * @param options.skipDirCheck - Optional flag to skip directory existence checks
   * @returns The resolved `SpecdConfig` with all paths made absolute
   * @throws {@link ConfigValidationError} When no config file is found, the
   *   YAML is invalid, or required fields are missing
   */
  async load(options?: { readonly skipDirCheck?: boolean }): Promise<SpecdConfig> {
    const cascade = await this._resolveCascade()
    const mergedRaw = mergeActiveLayers(cascade)

    const configDir = path.dirname(cascade.rootPath)
    tryLoadEnvFiles(configDir)

    if (isRecord(mergedRaw)) {
      applyEnvOverrides(mergedRaw)
      if ('artifactRules' in mergedRaw) {
        throw new ConfigValidationError(
          cascade.rootPath,
          "'artifactRules' is not supported; use 'schemaOverrides' instead",
        )
      }
      if ('skills' in mergedRaw) {
        throw new ConfigValidationError(
          cascade.rootPath,
          "'skills' is not supported; skills are managed via the plugin system",
        )
      }
    }

    const parseResult = SpecdYamlZodSchema.safeParse(mergedRaw)
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0]
      const location = issue ? formatZodPath(issue.path) : ''
      const message = issue
        ? location
          ? `${location}: ${issue.message}`
          : issue.message
        : 'config validation failed'
      throw new ConfigValidationError(cascade.rootPath, message)
    }

    return this._buildConfig(parseResult.data, configDir, cascade.rootPath, options)
  }

  /**
   * Resolves the path to the active root config file without loading or parsing it.
   *
   * - **Discovery mode**: discovers candidates, resolves the active chain, and
   *   returns the root path. Never throws.
   * - **Forced mode**: returns `path.resolve(configPath)` without checking whether
   *   the file exists. Never throws.
   *
   * @returns Absolute path to the config file, or `null` if not found in discovery mode
   */
  async resolvePath(): Promise<string | null> {
    if ('configPath' in this._options) {
      return path.resolve(this._options.configPath)
    }
    try {
      const dir = await findCandidateDirectory(this._options.startDir, this.rootPath)
      if (dir === null) return null
      const candidatePaths = await discoverCandidateFiles(dir)
      const layers: ConfigCascadeLayer[] = []
      for (const cp of candidatePaths) {
        try {
          layers.push(await parseCascadeLayer(cp))
        } catch {
          continue
        }
      }
      if (layers.length === 0) return null
      const cascade = resolveActiveChain(layers)
      return cascade.rootPath
    } catch {
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolves the config cascade based on the loader mode.
   *
   * @returns The resolved cascade with active layers
   * @throws {@link ConfigValidationError} When discovery mode finds no candidates
   */
  private async _resolveCascade(): Promise<ResolvedConfigCascade> {
    if ('configPath' in this._options) {
      return resolveForcedCascade(this._options.configPath)
    }
    const dir = await findCandidateDirectory(this._options.startDir, this.rootPath)
    if (dir === null) {
      throw new ConfigValidationError(
        this._options.startDir,
        'no specd.yaml found (searched up to VCS root)',
      )
    }
    const candidatePaths = await discoverCandidateFiles(dir)
    const layers: ConfigCascadeLayer[] = []
    for (const cp of candidatePaths) {
      layers.push(await parseCascadeLayer(cp))
    }
    return resolveActiveChain(layers)
  }

  /**
   * Builds the final `SpecdConfig` from Zod-validated data, resolving all paths
   * relative to the config directory and inferring external workspace status.
   *
   * @param data - Zod-validated config data
   * @param configDir - Absolute directory containing the root config file
   * @param rootConfigPath - Absolute path to the root config file for error messages
   * @param options - Optional loader options
   * @param options.skipDirCheck - Optional flag to skip directory existence checks
   * @returns The fully resolved `SpecdConfig`
   * @throws {@link ConfigValidationError} When the resolved config violates required invariants
   */
  private _buildConfig(
    data: z.infer<typeof SpecdYamlZodSchema>,
    configDir: string,
    rootConfigPath: string,
    options?: { readonly skipDirCheck?: boolean },
  ): SpecdConfig {
    const specdPath = path.resolve(configDir, data.specdPath ?? '.specd')
    const resolvedConfigPath = path.resolve(
      configDir,
      data.configPath ?? path.join(specdPath, 'config'),
    )
    validateContextPatterns(data, rootConfigPath)
    if (!data.workspaces.default) {
      throw new ConfigValidationError(rootConfigPath, "'workspaces.default' is required")
    }
    if (data.workspaces.root) {
      throw new ConfigValidationError(
        rootConfigPath,
        "'workspaces.root' is invalid because 'root' is reserved for project-global graph identities",
      )
    }

    const warnings: string[] = []

    const workspaces: SpecdWorkspaceConfig[] = Object.entries(data.workspaces).map(([name, ws]) => {
      const specsBinding = resolveAdapterBinding(
        configDir,
        rootConfigPath,
        `workspaces.${name}.specs`,
        ws.specs as Record<string, unknown>,
        path.resolve(specdPath, 'virtual', 'workspaces', name, 'specs'),
        false,
        warnings,
      )
      const defaultSchemasPath = path.resolve(specdPath, 'schemas')
      const schemasBinding =
        ws.schemas !== undefined
          ? resolveAdapterBinding(
              configDir,
              rootConfigPath,
              `workspaces.${name}.schemas`,
              ws.schemas as Record<string, unknown>,
              path.resolve(specdPath, 'virtual', 'workspaces', name, 'schemas'),
              false,
              warnings,
            )
          : name === 'default'
            ? {
                binding: {
                  adapter: 'fs',
                  config: { path: defaultSchemasPath },
                } satisfies SpecdAdapterBinding,
                legacyPath: defaultSchemasPath,
              }
            : null
      let codeRoot: string
      if (ws.codeRoot !== undefined) codeRoot = path.resolve(configDir, ws.codeRoot)
      else if (name === 'default') codeRoot = configDir
      else {
        throw new ConfigValidationError(
          rootConfigPath,
          `'workspaces.${name}.codeRoot' is required for non-default workspaces`,
        )
      }
      const ownership = ws.ownership ?? (name === 'default' ? 'owned' : 'readOnly')
      const isExternal =
        this.rootPath !== null && specsBinding.binding.adapter === 'fs'
          ? !specsBinding.legacyPath.startsWith(this.rootPath + path.sep) &&
            specsBinding.legacyPath !== this.rootPath
          : false
      return {
        name,
        ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        specsPath: specsBinding.legacyPath,
        specsAdapter: specsBinding.binding,
        schemasPath: schemasBinding?.legacyPath ?? null,
        schemasAdapter: schemasBinding?.binding ?? null,
        codeRoot,
        ownership,
        isExternal,
        ...(ws.contextIncludeSpecs !== undefined
          ? { contextIncludeSpecs: ws.contextIncludeSpecs }
          : {}),
        ...(ws.contextExcludeSpecs !== undefined
          ? { contextExcludeSpecs: ws.contextExcludeSpecs }
          : {}),
        ...(ws.graph !== undefined
          ? {
              graph: {
                ...(ws.graph.respectGitignore !== undefined
                  ? { respectGitignore: ws.graph.respectGitignore }
                  : {}),
                ...(ws.graph.excludePaths !== undefined
                  ? { excludePaths: ws.graph.excludePaths }
                  : {}),
                ...(ws.graph.allowedPaths !== undefined
                  ? { allowedPaths: ws.graph.allowedPaths }
                  : {}),
              },
            }
          : {}),
      }
    })

    const storageRaw = data.storage ?? {}
    const changesRaw = storageRaw.changes ?? {
      adapter: {
        type: 'fs',
        config: { path: path.join(specdPath, 'changes') },
      },
    }
    const draftsRaw = storageRaw.drafts ?? {
      adapter: {
        type: 'fs',
        config: { path: path.join(specdPath, 'drafts') },
      },
    }
    const discardedRaw = storageRaw.discarded ?? {
      adapter: {
        type: 'fs',
        config: { path: path.join(specdPath, 'discarded') },
      },
    }
    const archiveRaw = storageRaw.archive ?? {
      adapter: {
        type: 'fs',
        config: { path: path.join(specdPath, 'archive') },
      },
    }

    const changesBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.changes',
      changesRaw as Record<string, unknown>,
      path.resolve(specdPath, 'virtual', 'storage', 'changes'),
      false,
      warnings,
    )
    const draftsBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.drafts',
      draftsRaw as Record<string, unknown>,
      path.resolve(specdPath, 'virtual', 'storage', 'drafts'),
      false,
      warnings,
    )
    const discardedBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.discarded',
      discardedRaw as Record<string, unknown>,
      path.resolve(specdPath, 'virtual', 'storage', 'discarded'),
      false,
      warnings,
    )
    const archiveBinding = resolveAdapterBinding(
      configDir,
      rootConfigPath,
      'storage.archive',
      archiveRaw as Record<string, unknown>,
      path.resolve(specdPath, 'virtual', 'storage', 'archive'),
      true,
      warnings,
    )

    if (this.rootPath !== null) {
      if (
        !resolvedConfigPath.startsWith(this.rootPath + path.sep) &&
        resolvedConfigPath !== this.rootPath
      ) {
        throw new ConfigValidationError(rootConfigPath, 'configPath resolves outside VCS root')
      }
      for (const [key, binding] of [
        ['changes', changesBinding],
        ['drafts', draftsBinding],
        ['discarded', discardedBinding],
        ['archive', archiveBinding],
      ] as const) {
        if (binding.binding.adapter !== 'fs') continue
        if (
          !binding.legacyPath.startsWith(this.rootPath + path.sep) &&
          binding.legacyPath !== this.rootPath
        ) {
          throw new ConfigValidationError(
            rootConfigPath,
            `storage path '${key}' resolves outside VCS root`,
          )
        }
      }
    }

    const storage: SpecdStorageConfig = {
      changesPath: changesBinding.legacyPath,
      changesAdapter: changesBinding.binding,
      draftsPath: draftsBinding.legacyPath,
      draftsAdapter: draftsBinding.binding,
      discardedPath: discardedBinding.legacyPath,
      discardedAdapter: discardedBinding.binding,
      archivePath: archiveBinding.legacyPath,
      archiveAdapter: archiveBinding.binding,
      ...(typeof archiveBinding.binding.config.pattern === 'string'
        ? { archivePattern: archiveBinding.binding.config.pattern }
        : {}),
    }

    const checkDir = (dirPath: string, description: string) => {
      if (
        options?.skipDirCheck ||
        process.env.NODE_ENV === 'test' ||
        process.env.VITEST !== undefined
      ) {
        return
      }
      if (!existsSync(dirPath)) {
        throw new StorageDirectoryNotFoundError(dirPath, `${description} directory does not exist`)
      }
    }

    checkDir(specdPath, 'specdPath')
    checkDir(storage.changesPath, 'changes staging')
    checkDir(storage.draftsPath, 'drafts staging')
    checkDir(storage.discardedPath, 'discarded staging')
    checkDir(storage.archivePath, 'archive staging')

    for (const ws of workspaces) {
      checkDir(ws.specsPath, `workspace '${ws.name}' specs`)
      const rawWs = data.workspaces[ws.name] as Record<string, unknown> | undefined
      if (ws.schemasPath !== null && rawWs?.schemas !== undefined) {
        checkDir(ws.schemasPath, `workspace '${ws.name}' schemas`)
      }
      checkDir(ws.codeRoot, `workspace '${ws.name}' codeRoot`)
    }

    const context: SpecdContextEntry[] | undefined = data.context
      ? (data.context as SpecdContextEntry[]).map((entry) => {
          if ('file' in entry && typeof entry.file === 'string') {
            const absoluteFile = path.isAbsolute(entry.file)
              ? entry.file
              : path.resolve(configDir, entry.file)
            return { ...entry, file: absoluteFile }
          }
          return entry
        })
      : undefined
    return {
      ...(warnings.length > 0 ? { warnings } : {}),
      projectRoot: configDir,
      specdPath,
      configPath: resolvedConfigPath,
      schemaRef: data.schema,
      workspaces,
      storage,
      approvals: { spec: data.approvals?.spec ?? false, signoff: data.approvals?.signoff ?? false },
      ...(data.graph !== undefined
        ? {
            graph: {
              ...(data.graph.includePaths !== undefined
                ? { includePaths: data.graph.includePaths }
                : {}),
              ...(data.graph.excludePaths !== undefined
                ? { excludePaths: data.graph.excludePaths }
                : {}),
            },
          }
        : {}),
      logging: { level: data.logging?.level ?? 'info' },
      ...(data.actorProvider !== undefined ? { actorProvider: data.actorProvider } : {}),
      ...(data.privacy !== undefined ? { privacy: data.privacy } : {}),
      ...(context !== undefined ? { context } : {}),
      ...(data.contextIncludeSpecs !== undefined
        ? { contextIncludeSpecs: data.contextIncludeSpecs }
        : {}),
      ...(data.contextExcludeSpecs !== undefined
        ? { contextExcludeSpecs: data.contextExcludeSpecs }
        : {}),
      ...(data.contextMode !== undefined ? { contextMode: data.contextMode } : {}),
      ...(data.llmOptimizedContext !== undefined
        ? { llmOptimizedContext: data.llmOptimizedContext }
        : {}),
      ...(data.schemaPlugins !== undefined ? { schemaPlugins: data.schemaPlugins } : {}),
      ...(data.schemaOverrides !== undefined
        ? { schemaOverrides: data.schemaOverrides as SchemaOperations }
        : {}),
      ...(data.invalidationPolicy !== undefined && isInvalidationPolicy(data.invalidationPolicy)
        ? { invalidationPolicy: data.invalidationPolicy }
        : {}),
      ...(data.plugins !== undefined
        ? {
            plugins: {
              ...(data.plugins.agents !== undefined
                ? {
                    agents: data.plugins.agents.map((plugin) => ({
                      name: plugin.name,
                      ...(plugin.config !== undefined ? { config: plugin.config } : {}),
                    })),
                  }
                : {}),
            },
          }
        : {}),
    }
  }
}
