import * as fs from 'node:fs'
import * as path from 'node:path'
import { GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { ListWorkspaces } from '../application/use-cases/list-workspaces.js'
import { RefreshImplementationTracking } from '../application/use-cases/refresh-implementation-tracking.js'
import { ResolveSchema } from '../application/use-cases/resolve-schema.js'
import { RunStepHooks } from '../application/use-cases/run-step-hooks.js'
import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type ArtifactParserRegistry } from '../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ContentHasher } from '../application/ports/content-hasher.js'
import { type DiffGenerator } from '../application/ports/diff-generator.js'
import { type FileReader } from '../application/ports/file-reader.js'
import { type FileWriter } from '../application/ports/file-writer.js'
import { type HookRunner } from '../application/ports/hook-runner.js'
import { type SchemaProvider } from '../application/ports/schema-provider.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type ValidationResultCache } from '../application/ports/validation-result-cache.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type YamlSerializer } from '../application/ports/yaml-serializer.js'
import { type SpecdConfig, type SpecdWorkspaceConfig } from '../application/specd-config.js'
import { Logger } from '../application/logger.js'
import { TemplateExpander } from '../application/template-expander.js'
import { buildSchema } from '../domain/services/build-schema.js'
import { type ExtractorTransformRegistry } from '../domain/services/content-extraction.js'
import { ConfigValidationError } from '../domain/errors/config-validation-error.js'
import { parseSpecId } from '../domain/services/parse-spec-id.js'
import { LifecycleEngine } from '../domain/services/lifecycle-engine.js'
import { SpecPath } from '../domain/value-objects/spec-path.js'
import { FsFileReader } from '../infrastructure/fs/file-reader.js'
import { FsFileWriter } from '../infrastructure/fs/file-writer.js'
import { NodeContentHasher } from '../infrastructure/node/content-hasher.js'
import { NodeHookRunner } from '../infrastructure/node/hook-runner.js'
import { NodeYamlSerializer } from '../infrastructure/node/yaml-serializer.js'
import { VcsImplementationDetector } from '../infrastructure/vcs/vcs-implementation-detector.js'
import {
  createLazyActorResolver,
  createLazyVcsActorResolver,
  resolveActorResolver,
} from './actor-resolver.js'
import { buildCompileContextConfig } from './build-compile-context-config.js'
import { createDefaultDiffGenerator } from './diff-generator.js'
import { getDefaultWorkspace } from './get-default-workspace.js'
import {
  createBuiltinCompositionRegistry,
  createCompositionRegistryView,
  type CompositionRegistryInput,
  type CompositionRegistryView,
} from './composition-registries.js'
import { LazySchemaProvider } from './lazy-schema-provider.js'
import { PrivacyActorResolver } from './privacy-actor-resolver.js'
import { createSchemaRegistry } from './schema-registry.js'
import { createSpecWorkspaceRoutes } from './spec-workspace-routes.js'
import { createVcsAdapter } from './vcs-adapter.js'
import { FsValidationResultCache } from '../infrastructure/fs/fs-validation-result-cache.js'

/**
 * Additive composition options shared by standalone factories and kernel construction.
 */
export interface CompositionResolutionOptions extends CompositionRegistryInput {
  /** Additional `node_modules` directories searched after the project-local one. */
  readonly extraNodeModulesPaths?: readonly string[]
  readonly repositories?: {
    readonly changes?: ChangeRepository
    readonly archive?: ArchiveRepository
    readonly specs?: ReadonlyMap<string, SpecRepository>
    readonly schemas?: ReadonlyMap<string, SchemaRepository>
  }
}

/**
 * Shared resolver contract for config-based composition assembly.
 */
export interface CompositionResolver {
  /** Resolved project configuration for this composition session. */
  readonly config: SpecdConfig
  /** Additive composition options for this composition session. */
  readonly options: Readonly<CompositionResolutionOptions>
  /** Final merged registry view available to this session. */
  readonly registry: CompositionRegistryView

  /**
   * Returns the default change repository for the composition session.
   *
   * @returns The default change repository
   */
  getChangeRepository(): ChangeRepository

  /**
   * Returns the default archive repository for the composition session.
   *
   * @returns The default archive repository
   */
  getArchiveRepository(): ArchiveRepository

  /**
   * Returns spec repositories keyed by workspace name.
   *
   * @returns Workspace-keyed spec repositories
   */
  getSpecRepositories(): ReadonlyMap<string, SpecRepository>

  /**
   * Returns schema repositories keyed by workspace name where configured.
   *
   * @returns Workspace-keyed schema repositories
   */
  getSchemaRepositories(): ReadonlyMap<string, SchemaRepository>

  /**
   * Returns the shared schema registry.
   *
   * @returns The schema registry
   */
  getSchemaRegistry(): SchemaRegistry

  /**
   * Returns the lazy schema provider for the active project schema.
   *
   * @returns The schema provider
   */
  getSchemaProvider(): SchemaProvider

  /**
   * Returns the shared resolve-schema use case.
   *
   * @returns The resolve-schema use case
   */
  getResolveSchema(): ResolveSchema

  /**
   * Returns the shared get-active-schema use case.
   *
   * @returns The get-active-schema use case
   */
  getGetActiveSchema(): GetActiveSchema

  /**
   * Returns the shared list-workspaces use case.
   *
   * @returns The list-workspaces use case
   */
  getListWorkspaces(): ListWorkspaces

  /**
   * Returns the shared run-step-hooks use case.
   *
   * @returns The run-step-hooks use case
   */
  getRunStepHooks(): RunStepHooks

  /**
   * Returns the shared refresh-implementation-tracking use case.
   *
   * @returns The refresh-implementation-tracking use case
   */
  getRefreshImplementationTracking(): RefreshImplementationTracking

  /**
   * Returns the shared actor resolver.
   *
   * @returns The actor resolver
   */
  getActorResolver(): ActorResolver

  /**
   * Returns the VCS adapter for the project root.
   *
   * @returns The lazily-resolved VCS adapter
   */
  getVcsAdapter(): Promise<VcsAdapter>

  /**
   * Returns the shared hook runner.
   *
   * @returns The hook runner
   */
  getHookRunner(): HookRunner

  /**
   * Returns the shared artifact parser registry.
   *
   * @returns The parser registry
   */
  getArtifactParserRegistry(): ArtifactParserRegistry

  /**
   * Returns the shared diff generator.
   *
   * @returns The diff generator
   */
  getDiffGenerator(): DiffGenerator

  /**
   * Returns the shared extractor transform registry.
   *
   * @returns The extractor transform registry
   */
  getExtractorTransforms(): ExtractorTransformRegistry

  /**
   * Returns the shared content hasher.
   *
   * @returns The content hasher
   */
  getContentHasher(): ContentHasher

  /**
   * Returns the shared file reader.
   *
   * @returns The file reader
   */
  getFileReader(): FileReader

  /**
   * Returns the shared file writer.
   *
   * @returns The file writer
   */
  getFileWriter(): FileWriter

  /**
   * Returns the shared YAML serializer.
   *
   * @returns The YAML serializer
   */
  getYamlSerializer(): YamlSerializer

  /**
   * Returns the shared template expander.
   *
   * @returns The template expander
   */
  getTemplateExpander(): TemplateExpander

  /**
   * Returns the shared lifecycle engine.
   *
   * @returns The lifecycle engine
   */
  getLifecycleEngine(): LifecycleEngine

  /**
   * Returns the derived compile-context defaults for the project.
   *
   * @returns The compiled context defaults
   */
  getCompileContextConfig(): ReturnType<typeof buildCompileContextConfig>

  /**
   * Returns spec workspace routing metadata.
   *
   * @returns Workspace routing data for spec-aware use cases
   */
  getSpecWorkspaceRoutes(): ReturnType<typeof createSpecWorkspaceRoutes>

  /**
   * Returns validation result caches keyed by workspace name.
   *
   * @returns Workspace-keyed validation result cache instances
   */
  getValidationResultCaches(): ReadonlyMap<string, ValidationResultCache>
}

/**
 * Computes the metadata root path for one workspace.
 *
 * @param config - Resolved project configuration
 * @param workspace - Workspace configuration
 * @returns The metadata root path
 */
function resolveMetadataPathForWorkspace(
  config: SpecdConfig,
  workspace: SpecdWorkspaceConfig,
): string {
  const explicit = workspace.specsAdapter.config.metadataPath
  if (typeof explicit === 'string' && explicit.length > 0) {
    const metadataPath = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(config.projectRoot, explicit)
    if (!fs.existsSync(metadataPath)) {
      fs.mkdirSync(metadataPath, { recursive: true })
    }
    return metadataPath
  }

  const specdPath = config.specdPath ?? '.specd'
  let metadataPath: string
  if (workspace.specsAdapter.adapter !== 'fs') {
    metadataPath = path.join(specdPath, 'metadata')
  } else {
    let current = path.resolve(workspace.specsPath)
    const specdName = path.basename(specdPath)
    metadataPath = path.join(workspace.specsPath, '..', specdName, 'metadata')
    while (true) {
      if (fs.existsSync(path.join(current, '.git'))) {
        metadataPath = path.join(current, specdName, 'metadata')
        break
      }
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }
  }

  if (!fs.existsSync(metadataPath)) {
    fs.mkdirSync(metadataPath, { recursive: true })
  }

  return metadataPath
}

/**
 * Resolves a named storage factory from the merged registry view.
 *
 * @param configPath - Project config path for diagnostics
 * @param field - Human-readable config field path
 * @param registryMap - Registry keyed by adapter id
 * @param adapter - Adapter id selected in config
 * @returns The resolved factory
 * @throws {ConfigValidationError} When the adapter id is not registered
 */
function resolveStorageFactory<T>(
  configPath: string,
  field: string,
  registryMap: ReadonlyMap<string, T>,
  adapter: string,
): T {
  const factory = registryMap.get(adapter)
  if (factory === undefined) {
    throw new ConfigValidationError(configPath, `${field}.adapter '${adapter}' is not registered`)
  }
  return factory
}

/**
 * Creates a new composition resolver scoped to one config/options session.
 *
 * @param config - Resolved project configuration for the session
 * @param options - Optional additive composition registrations
 * @returns The session-scoped composition resolver
 */
export function createCompositionResolver(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CompositionResolver {
  const resolvedOptions = options ?? {}
  const registry = createCompositionRegistryView(
    createBuiltinCompositionRegistry(),
    resolvedOptions,
  )
  const defaultWorkspace = getDefaultWorkspace(config)
  const defaultContext = {
    workspace: defaultWorkspace.name,
    ownership: defaultWorkspace.ownership,
    isExternal: defaultWorkspace.isExternal,
    configPath: config.configPath,
  }

  let specRepositories: ReadonlyMap<string, SpecRepository> | undefined =
    resolvedOptions.repositories?.specs
  let schemaRepositories: ReadonlyMap<string, SchemaRepository> | undefined =
    resolvedOptions.repositories?.schemas
  let schemaRegistry: SchemaRegistry | undefined
  let changeRepository: ChangeRepository | undefined = resolvedOptions.repositories?.changes
  let archiveRepository: ArchiveRepository | undefined = resolvedOptions.repositories?.archive
  let actorResolver: ActorResolver | undefined
  let vcsAdapterPromise: Promise<VcsAdapter> | undefined
  let hookRunner: HookRunner | undefined
  let parserRegistry: ArtifactParserRegistry | undefined
  let diffGenerator: DiffGenerator | undefined
  let extractorTransforms: ExtractorTransformRegistry | undefined
  let contentHasher: ContentHasher | undefined
  let fileReader: FileReader | undefined
  let fileWriter: FileWriter | undefined
  let yamlSerializer: YamlSerializer | undefined
  let templateExpander: TemplateExpander | undefined
  let resolveSchema: ResolveSchema | undefined
  let schemaProvider: SchemaProvider | undefined
  let getActiveSchema: GetActiveSchema | undefined
  let listWorkspaces: ListWorkspaces | undefined
  let lifecycleEngine: LifecycleEngine | undefined
  let runStepHooks: RunStepHooks | undefined
  let refreshImplementationTracking: RefreshImplementationTracking | undefined
  let compileContextConfig: ReturnType<typeof buildCompileContextConfig> | undefined
  let workspaceRoutes: ReturnType<typeof createSpecWorkspaceRoutes> | undefined
  let validationResultCaches: ReadonlyMap<string, ValidationResultCache> | undefined

  const resolver: CompositionResolver = {
    config,
    options: resolvedOptions,
    registry,

    getChangeRepository(): ChangeRepository {
      if (changeRepository !== undefined) return changeRepository
      const factory = resolveStorageFactory(
        config.configPath,
        'storage.changes',
        registry.storages.changes,
        config.storage.changesAdapter.adapter,
      )
      const context = {
        ...defaultContext,
        specdPath: config.specdPath ?? '.specd',
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        resolveArtifactTypes: async () => {
          const schema = await resolver.getSchemaRegistry().resolve(config.schemaRef)
          return schema !== null ? schema.artifacts() : []
        },
        resolveSpecExists: async (specId: string) => {
          const { workspace, capPath } = parseSpecId(specId)
          const specRepo = resolver.getSpecRepositories().get(workspace)
          if (specRepo === undefined) return false
          const spec = await specRepo.get(SpecPath.parse(capPath))
          return spec !== null
        },
      }
      const repoConfig = {
        ...config.storage.changesAdapter.config,
        path: config.storage.changesPath,
      }
      changeRepository = factory.create(context, repoConfig)
      return changeRepository
    },

    getArchiveRepository(): ArchiveRepository {
      if (archiveRepository !== undefined) return archiveRepository
      const factory = resolveStorageFactory(
        config.configPath,
        'storage.archive',
        registry.storages.archive,
        config.storage.archiveAdapter.adapter,
      )
      const context = {
        ...defaultContext,
        specdPath: config.specdPath ?? '.specd',
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
      }
      const repoConfig = {
        ...config.storage.archiveAdapter.config,
        path: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { pattern: config.storage.archivePattern }
          : {}),
      }
      archiveRepository = factory.create(context, repoConfig)
      return archiveRepository
    },

    getSpecRepositories(): ReadonlyMap<string, SpecRepository> {
      if (specRepositories !== undefined) return specRepositories
      const repositories = new Map<string, SpecRepository>()
      for (const workspace of config.workspaces) {
        const metadataPath = resolveMetadataPathForWorkspace(config, workspace)
        const factory = resolveStorageFactory(
          config.configPath,
          `workspaces.${workspace.name}.specs`,
          registry.storages.specs,
          workspace.specsAdapter.adapter,
        )
        repositories.set(
          workspace.name,
          factory.create(
            {
              workspace: workspace.name,
              ownership: workspace.ownership,
              isExternal: workspace.isExternal,
              configPath: config.configPath,
              ...(workspace.prefix !== undefined ? { prefix: workspace.prefix } : {}),
            },
            {
              ...workspace.specsAdapter.config,
              path: workspace.specsAdapter.config.path as string,
              metadataPath,
            },
          ),
        )
      }
      specRepositories = repositories
      return specRepositories
    },

    getSchemaRepositories(): ReadonlyMap<string, SchemaRepository> {
      if (schemaRepositories !== undefined) return schemaRepositories
      const repositories = new Map<string, SchemaRepository>()
      for (const workspace of config.workspaces) {
        if (workspace.schemasAdapter === null) continue
        const factory = resolveStorageFactory(
          config.configPath,
          `workspaces.${workspace.name}.schemas`,
          registry.storages.schemas,
          workspace.schemasAdapter.adapter,
        )
        repositories.set(
          workspace.name,
          factory.create(
            {
              workspace: workspace.name,
              ownership: workspace.ownership,
              isExternal: workspace.isExternal,
              configPath: config.configPath,
            },
            workspace.schemasAdapter.config,
          ),
        )
      }
      schemaRepositories = repositories
      return schemaRepositories
    },

    getSchemaRegistry(): SchemaRegistry {
      if (schemaRegistry !== undefined) return schemaRegistry
      schemaRegistry = createSchemaRegistry('fs', {
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(resolvedOptions.extraNodeModulesPaths ?? []),
        ],
        configDir: config.projectRoot,
        schemaRepositories: resolver.getSchemaRepositories(),
      })
      return schemaRegistry
    },

    getSchemaProvider(): SchemaProvider {
      if (schemaProvider !== undefined) return schemaProvider
      schemaProvider = new LazySchemaProvider(resolver.getResolveSchema())
      return schemaProvider
    },

    getResolveSchema(): ResolveSchema {
      if (resolveSchema !== undefined) return resolveSchema
      resolveSchema = new ResolveSchema(
        resolver.getSchemaRegistry(),
        config.schemaRef,
        config.schemaPlugins ?? [],
        config.schemaOverrides,
      )
      return resolveSchema
    },

    getGetActiveSchema(): GetActiveSchema {
      if (getActiveSchema !== undefined) return getActiveSchema
      getActiveSchema = new GetActiveSchema(
        resolver.getResolveSchema(),
        resolver.getSchemaRegistry(),
        buildSchema,
        config.schemaRef,
      )
      return getActiveSchema
    },

    getListWorkspaces(): ListWorkspaces {
      if (listWorkspaces !== undefined) return listWorkspaces
      listWorkspaces = new ListWorkspaces(config, resolver.getSpecRepositories())
      return listWorkspaces
    },

    getRunStepHooks(): RunStepHooks {
      if (runStepHooks !== undefined) return runStepHooks
      runStepHooks = new RunStepHooks(
        resolver.getChangeRepository(),
        resolver.getArchiveRepository(),
        resolver.getHookRunner(),
        registry.externalHookRunners,
        resolver.getSchemaProvider(),
      )
      return runStepHooks
    },

    getRefreshImplementationTracking(): RefreshImplementationTracking {
      if (refreshImplementationTracking !== undefined) return refreshImplementationTracking
      const implementationDetector = new VcsImplementationDetector(config.projectRoot, () =>
        resolver.getVcsAdapter(),
      )
      refreshImplementationTracking = new RefreshImplementationTracking(
        resolver.getChangeRepository(),
        resolver.getArchiveRepository(),
        implementationDetector,
        resolver.getFileReader(),
        config.projectRoot,
      )
      return refreshImplementationTracking
    },

    getActorResolver(): ActorResolver {
      if (actorResolver !== undefined) return actorResolver
      const baseActor =
        config.actorProvider === undefined
          ? createLazyVcsActorResolver(() => resolver.getVcsAdapter())
          : createLazyActorResolver(async () =>
              resolveActorResolver(
                config.projectRoot,
                registry.actorProviders,
                config.actorProvider,
              ),
            )
      actorResolver =
        config.privacy === undefined
          ? baseActor
          : new PrivacyActorResolver(baseActor, config.privacy)
      return actorResolver
    },

    getVcsAdapter(): Promise<VcsAdapter> {
      vcsAdapterPromise ??= createVcsAdapter(config.projectRoot, registry.vcsProviders)
      return vcsAdapterPromise
    },

    getHookRunner(): HookRunner {
      if (hookRunner !== undefined) return hookRunner
      hookRunner = new NodeHookRunner(resolver.getTemplateExpander())
      return hookRunner
    },

    getArtifactParserRegistry(): ArtifactParserRegistry {
      if (parserRegistry !== undefined) return parserRegistry
      parserRegistry = registry.parsers
      return parserRegistry
    },

    getDiffGenerator(): DiffGenerator {
      if (diffGenerator !== undefined) return diffGenerator
      diffGenerator = createDefaultDiffGenerator()
      return diffGenerator
    },

    getExtractorTransforms(): ExtractorTransformRegistry {
      if (extractorTransforms !== undefined) return extractorTransforms
      extractorTransforms = registry.extractorTransforms
      return extractorTransforms
    },

    getContentHasher(): ContentHasher {
      if (contentHasher !== undefined) return contentHasher
      contentHasher = new NodeContentHasher()
      return contentHasher
    },

    getFileReader(): FileReader {
      if (fileReader !== undefined) return fileReader
      fileReader = new FsFileReader()
      return fileReader
    },

    getFileWriter(): FileWriter {
      if (fileWriter !== undefined) return fileWriter
      fileWriter = new FsFileWriter()
      return fileWriter
    },

    getYamlSerializer(): YamlSerializer {
      if (yamlSerializer !== undefined) return yamlSerializer
      yamlSerializer = new NodeYamlSerializer()
      return yamlSerializer
    },

    getTemplateExpander(): TemplateExpander {
      if (templateExpander !== undefined) return templateExpander
      templateExpander = new TemplateExpander({ project: { root: config.projectRoot } })
      return templateExpander
    },

    getLifecycleEngine(): LifecycleEngine {
      if (lifecycleEngine !== undefined) return lifecycleEngine
      lifecycleEngine = new LifecycleEngine(Logger.debug.bind(Logger))
      return lifecycleEngine
    },

    getCompileContextConfig(): ReturnType<typeof buildCompileContextConfig> {
      if (compileContextConfig !== undefined) return compileContextConfig
      compileContextConfig = buildCompileContextConfig(config)
      return compileContextConfig
    },

    getSpecWorkspaceRoutes(): ReturnType<typeof createSpecWorkspaceRoutes> {
      if (workspaceRoutes !== undefined) return workspaceRoutes
      workspaceRoutes = createSpecWorkspaceRoutes(config.workspaces)
      return workspaceRoutes
    },

    getValidationResultCaches(): ReadonlyMap<string, ValidationResultCache> {
      if (validationResultCaches !== undefined) return validationResultCaches
      const specs = resolver.getSpecRepositories()
      const caches = new Map<string, ValidationResultCache>()
      for (const workspace of config.workspaces) {
        const specRepo = specs.get(workspace.name)
        if (specRepo === undefined) continue
        caches.set(
          workspace.name,
          new FsValidationResultCache({
            specRepository: specRepo,
            configPath: config.configPath,
            metadataPath: resolveMetadataPathForWorkspace(config, workspace),
          }),
        )
      }
      validationResultCaches = caches
      return validationResultCaches
    },
  }

  return resolver
}
