import * as path from 'node:path'
import { type SpecdConfig } from '../application/specd-config.js'
import { ConfigValidationError } from '../domain/errors/config-validation-error.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../application/ports/artifact-parser.js'
import { type ContentHasher } from '../application/ports/content-hasher.js'
import { type FileReader } from '../application/ports/file-reader.js'
import { type FileWriter } from '../application/ports/file-writer.js'
import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type HookRunner } from '../application/ports/hook-runner.js'
import { type YamlSerializer } from '../application/ports/yaml-serializer.js'
import { TemplateExpander } from '../application/template-expander.js'
import { NodeHookRunner } from '../infrastructure/node/hook-runner.js'
import { NodeContentHasher } from '../infrastructure/node/content-hasher.js'
import { NodeYamlSerializer } from '../infrastructure/node/yaml-serializer.js'
import { FsFileReader } from '../infrastructure/fs/file-reader.js'
import { FsFileWriter } from '../infrastructure/fs/file-writer.js'
import { createSchemaRegistry } from './schema-registry.js'
import { resolveActorResolver } from './actor-resolver.js'
import { PrivacyActorResolver } from './privacy-actor-resolver.js'
import { createVcsAdapter } from './vcs-adapter.js'
import { getDefaultWorkspace } from './get-default-workspace.js'
import { type KernelOptions } from './kernel.js'
import { SpecPath } from '../domain/value-objects/spec-path.js'
import { parseSpecId } from '../domain/services/parse-spec-id.js'
import { type CompositionRegistryView } from './composition-registries.js'

/**
 * Resolves a named storage factory from the merged composition registry.
 *
 * @param configPath - Config file path for deferred validation errors
 * @param field - Config field path naming the adapter binding
 * @param registry - Storage factory registry keyed by adapter name
 * @param adapter - Selected adapter name from config
 * @returns The resolved storage factory
 * @throws {@link ConfigValidationError} When the adapter name is not registered
 */
function resolveStorageFactory<T>(
  configPath: string,
  field: string,
  registry: ReadonlyMap<string, T>,
  adapter: string,
): T {
  const factory = registry.get(adapter)
  if (factory === undefined) {
    throw new ConfigValidationError(configPath, `${field}.adapter '${adapter}' is not registered`)
  }
  return factory
}

/**
 * Ensures a related storage binding uses the same adapter as the primary one.
 *
 * `ChangeRepository` manages active, draft, and discarded changes through a
 * single factory instance, so those three bindings must agree on adapter name.
 *
 * @param configPath - Config file path for deferred validation errors
 * @param field - Related binding field path
 * @param actual - Related adapter name
 * @param expectedField - Primary binding field path
 * @param expected - Primary adapter name
 * @throws {@link ConfigValidationError} When the adapter names differ
 */
function assertMatchingAdapter(
  configPath: string,
  field: string,
  actual: string,
  expectedField: string,
  expected: string,
): void {
  if (actual !== expected) {
    throw new ConfigValidationError(
      configPath,
      `${field}.adapter '${actual}' must match ${expectedField}.adapter '${expected}'`,
    )
  }
}

/**
 * Shared adapter instances pre-built once for use across all kernel use cases.
 *
 * Eliminates redundant construction of identical adapters (e.g. ~11 duplicate
 * `GitVcsAdapter` instances, 6 duplicate `ChangeRepository` instances) that
 * occurred when each factory independently created its own adapters.
 */
export interface KernelInternals {
  /** The merged composition registry view exposed publicly on the kernel. */
  readonly registry: CompositionRegistryView
  /** Change repository for the default workspace. */
  readonly changes: ChangeRepository
  /** Archive repository for the default workspace. */
  readonly archive: ArchiveRepository
  /** Spec repositories keyed by workspace name. */
  readonly specs: ReadonlyMap<string, SpecRepository>
  /** Schema registry for schema resolution. */
  readonly schemas: SchemaRegistry
  /** Artifact parser registry. */
  readonly parsers: ArtifactParserRegistry
  /** Content hasher for artifact hash computation. */
  readonly hasher: ContentHasher
  /** File reader for context file resolution. */
  readonly files: FileReader
  /** File writer for project metadata and other on-disk operations. */
  readonly fileWriter: FileWriter
  /** Actor resolver for identity resolution. */
  readonly actor: ActorResolver
  /** VCS adapter for repository queries (rootDir, branch, isClean, ref, show). */
  readonly vcs: VcsAdapter
  /** Hook runner for lifecycle hooks. */
  readonly hooks: HookRunner
  /** Template expander for hook commands and instruction text. */
  readonly expander: TemplateExpander
  /** YAML serializer for metadata operations. */
  readonly yaml: YamlSerializer
  /** Schema reference string from config. */
  readonly schemaRef: string
  /** Schema plugin references from config, in declaration order. */
  readonly schemaPlugins: readonly string[]
  /** Inline schema override operations from config. */
  readonly schemaOverrides:
    | import('../domain/services/merge-schema-layers.js').SchemaOperations
    | undefined
}

/**
 * Builds all shared adapter instances from the project configuration.
 *
 * Called once by {@link createKernel} to avoid constructing duplicate adapters
 * across individual use case factories.
 *
 * @param config - The fully-resolved project configuration
 * @param registry - The merged composition registry view
 * @param options - Optional kernel-level overrides
 * @returns Pre-built adapter instances for all use cases
 */
export async function createKernelInternals(
  config: SpecdConfig,
  registry: CompositionRegistryView,
  options?: KernelOptions,
): Promise<KernelInternals> {
  const defaultWs = getDefaultWorkspace(config)
  const wsContext = {
    workspace: defaultWs.name,
    ownership: defaultWs.ownership,
    isExternal: defaultWs.isExternal,
    configPath: config.configPath,
  }

  const nodeModulesPaths = [
    path.join(config.projectRoot, 'node_modules'),
    ...(options?.extraNodeModulesPaths ?? []),
  ]

  const specs = new Map<string, import('../application/ports/spec-repository.js').SpecRepository>()
  for (const ws of config.workspaces) {
    let metadataPath: string
    if (ws.specsAdapter.adapter === 'fs') {
      const vcsAdapter = await createVcsAdapter(ws.specsPath, registry.vcsProviders)
      try {
        const vcsRoot = await vcsAdapter.rootDir()
        metadataPath = path.join(vcsRoot, '.specd', 'metadata')
      } catch {
        // NullVcsAdapter or rootDir failure — fallback to specs parent
        metadataPath = path.join(ws.specsPath, '..', '.specd', 'metadata')
      }
    } else {
      metadataPath = path.join(config.projectRoot, '.specd', 'metadata')
    }
    const specFactory = resolveStorageFactory(
      config.configPath,
      `workspaces.${ws.name}.specs`,
      registry.storages.specs,
      ws.specsAdapter.adapter,
    )
    specs.set(
      ws.name,
      specFactory.create(
        {
          workspace: ws.name,
          ownership: ws.ownership,
          isExternal: ws.isExternal,
          configPath: config.configPath,
        },
        {
          ...ws.specsAdapter.config,
          metadataPath,
          ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        },
      ),
    )
  }

  const schemaRepositories = new Map<string, SchemaRepository>()
  for (const ws of config.workspaces) {
    if (ws.schemasAdapter !== null) {
      const schemaFactory = resolveStorageFactory(
        config.configPath,
        `workspaces.${ws.name}.schemas`,
        registry.storages.schemas,
        ws.schemasAdapter.adapter,
      )
      schemaRepositories.set(
        ws.name,
        schemaFactory.create(
          {
            workspace: ws.name,
            ownership: ws.ownership,
            isExternal: ws.isExternal,
            configPath: config.configPath,
          },
          ws.schemasAdapter.config,
        ),
      )
    }
  }

  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths,
    configDir: config.projectRoot,
    schemaRepositories,
  })

  assertMatchingAdapter(
    config.configPath,
    'storage.drafts',
    config.storage.draftsAdapter.adapter,
    'storage.changes',
    config.storage.changesAdapter.adapter,
  )
  assertMatchingAdapter(
    config.configPath,
    'storage.discarded',
    config.storage.discardedAdapter.adapter,
    'storage.changes',
    config.storage.changesAdapter.adapter,
  )

  const changesFactory = resolveStorageFactory(
    config.configPath,
    'storage.changes',
    registry.storages.changes,
    config.storage.changesAdapter.adapter,
  )
  const archiveFactory = resolveStorageFactory(
    config.configPath,
    'storage.archive',
    registry.storages.archive,
    config.storage.archiveAdapter.adapter,
  )

  const changes = changesFactory.create(wsContext, {
    ...config.storage.changesAdapter.config,
    drafts: config.storage.draftsAdapter.config,
    discarded: config.storage.discardedAdapter.config,
    resolveArtifactTypes: async () => {
      const schema = await schemas.resolve(config.schemaRef)
      return schema !== null ? schema.artifacts() : []
    },
    resolveSpecExists: async (specId: string) => {
      const { workspace, capPath } = parseSpecId(specId)
      const specRepo = specs.get(workspace)
      if (specRepo === undefined) return false
      const spec = await specRepo.get(SpecPath.parse(capPath))
      return spec !== null
    },
  })

  const archive = archiveFactory.create(wsContext, {
    ...config.storage.archiveAdapter.config,
    changes: config.storage.changesAdapter.config,
    drafts: config.storage.draftsAdapter.config,
    ...(config.storage.archivePattern !== undefined
      ? { pattern: config.storage.archivePattern }
      : {}),
  })

  const expander = new TemplateExpander({ project: { root: config.projectRoot } })

  const baseActor = await resolveActorResolver(
    config.projectRoot,
    registry.actorProviders,
    config.actorProvider,
  )

  return {
    registry,
    changes,
    archive,
    specs,
    schemas,
    parsers: registry.parsers,
    hasher: new NodeContentHasher(),
    files: new FsFileReader(),
    fileWriter: new FsFileWriter(),
    actor: config.privacy ? new PrivacyActorResolver(baseActor, config.privacy) : baseActor,
    vcs: await createVcsAdapter(config.projectRoot, registry.vcsProviders),
    hooks: new NodeHookRunner(expander),
    yaml: new NodeYamlSerializer(),
    expander,
    schemaRef: config.schemaRef,
    schemaPlugins: config.schemaPlugins ?? [],
    schemaOverrides: config.schemaOverrides,
  }
}
