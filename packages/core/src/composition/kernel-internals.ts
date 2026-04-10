import * as path from 'node:path'
import { type SpecdConfig } from '../application/specd-config.js'
import { ConfigValidationError } from '../domain/errors/config-validation-error.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type ArtifactParserRegistry } from '../application/ports/artifact-parser.js'
import { type ContentHasher } from '../application/ports/content-hasher.js'
import { type FileReader } from '../application/ports/file-reader.js'
import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type HookRunner } from '../application/ports/hook-runner.js'
import { type ConfigWriter } from '../application/ports/config-writer.js'
import { type YamlSerializer } from '../application/ports/yaml-serializer.js'
import { TemplateExpander } from '../application/template-expander.js'
import { NodeHookRunner } from '../infrastructure/node/hook-runner.js'
import { NodeContentHasher } from '../infrastructure/node/content-hasher.js'
import { NodeYamlSerializer } from '../infrastructure/node/yaml-serializer.js'
import { FsFileReader } from '../infrastructure/fs/file-reader.js'
import { createArtifactParserRegistry } from '../infrastructure/artifact-parser/registry.js'
import { FsConfigWriter } from '../infrastructure/fs/config-writer.js'
import { createChangeRepository } from './change-repository.js'
import { createArchiveRepository } from './archive-repository.js'
import { createSpecRepository } from './spec-repository.js'
import { createSchemaRegistry } from './schema-registry.js'
import { createSchemaRepository } from './schema-repository.js'
import { type SchemaRepository } from '../application/ports/schema-repository.js'
import { BUILTIN_ACTOR_PROVIDERS, createVcsActorResolver } from './actor-resolver.js'
import { BUILTIN_VCS_PROVIDERS, createVcsAdapter } from './vcs-adapter.js'
import { getDefaultWorkspace } from './get-default-workspace.js'
import { type KernelOptions } from './kernel.js'
import { createBuiltinExtractorTransforms } from './extractor-transforms/index.js'
import {
  type ArchiveStorageFactory,
  type ChangeStorageFactory,
  type GraphStoreFactory,
  type KernelRegistryInput,
  type KernelRegistryView,
  type SchemaStorageFactory,
  type SpecStorageFactory,
} from './kernel-registries.js'

/**
 * Reads a required string option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Required property name
 * @returns The string option value
 * @throws {TypeError} When the option is missing or not a string
 */
function readStringOption(options: Readonly<Record<string, unknown>>, key: string): string {
  const value = options[key]
  if (typeof value !== 'string') {
    throw new TypeError(`expected string option '${key}'`)
  }
  return value
}

/**
 * Reads an optional string option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Optional property name
 * @returns The string option value, or `undefined` when absent
 * @throws {TypeError} When the option is present but not a string
 */
function readOptionalStringOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = options[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new TypeError(`expected string option '${key}'`)
  }
  return value
}

/**
 * Reads a required object option from an opaque factory options record.
 *
 * @param options - Adapter-owned resolved options
 * @param key - Required property name
 * @returns The nested object value
 * @throws {TypeError} When the option is missing or not an object
 */
function readRecordOption(
  options: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> {
  const value = options[key]
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`expected object option '${key}'`)
  }
  return value as Readonly<Record<string, unknown>>
}

/**
 * Reads an optional async artifact-type resolver from opaque factory options.
 *
 * @param options - Adapter-owned resolved options
 * @returns The resolver function when present
 */
function readResolveArtifactTypes(
  options: Readonly<Record<string, unknown>>,
):
  | (() => Promise<readonly import('../domain/value-objects/artifact-type.js').ArtifactType[]>)
  | undefined {
  const value = options.resolveArtifactTypes
  return typeof value === 'function'
    ? (value as () => Promise<
        readonly import('../domain/value-objects/artifact-type.js').ArtifactType[]
      >)
    : undefined
}

/** Built-in `fs` factory for spec repositories. */
const FS_SPEC_STORAGE_FACTORY: SpecStorageFactory = {
  create(context, options): SpecRepository {
    const prefix = readOptionalStringOption(options, 'prefix')
    return createSpecRepository('fs', context, {
      specsPath: readStringOption(options, 'path'),
      metadataPath: readStringOption(options, 'metadataPath'),
      ...(prefix !== undefined ? { prefix } : {}),
    })
  },
}

/** Built-in `fs` factory for schema repositories. */
const FS_SCHEMA_STORAGE_FACTORY: SchemaStorageFactory = {
  create(context, options): SchemaRepository {
    return createSchemaRepository('fs', context, {
      schemasPath: readStringOption(options, 'path'),
    })
  },
}

/** Built-in `fs` factory for change repositories. */
const FS_CHANGE_STORAGE_FACTORY: ChangeStorageFactory = {
  create(context, options): ChangeRepository {
    const drafts = readRecordOption(options, 'drafts')
    const discarded = readRecordOption(options, 'discarded')
    const resolveArtifactTypes = readResolveArtifactTypes(options)
    return createChangeRepository('fs', context, {
      changesPath: readStringOption(options, 'path'),
      draftsPath: readStringOption(drafts, 'path'),
      discardedPath: readStringOption(discarded, 'path'),
      ...(resolveArtifactTypes !== undefined ? { resolveArtifactTypes } : {}),
    })
  },
}

/** Built-in `fs` factory for archive repositories. */
const FS_ARCHIVE_STORAGE_FACTORY: ArchiveStorageFactory = {
  create(context, options): ArchiveRepository {
    const changes = readRecordOption(options, 'changes')
    const drafts = readRecordOption(options, 'drafts')
    const pattern = readOptionalStringOption(options, 'pattern')
    return createArchiveRepository('fs', context, {
      changesPath: readStringOption(changes, 'path'),
      draftsPath: readStringOption(drafts, 'path'),
      archivePath: readStringOption(options, 'path'),
      ...(pattern !== undefined ? { pattern } : {}),
    })
  },
}

/** Opaque built-in registration marker for the Ladybug graph-store backend id. */
const LADYBUG_GRAPH_STORE_FACTORY: GraphStoreFactory = {
  create(): unknown {
    return undefined
  },
}

/** Opaque built-in registration marker for the SQLite graph-store backend id. */
const SQLITE_GRAPH_STORE_FACTORY: GraphStoreFactory = {
  create(): unknown {
    return undefined
  },
}

/**
 * Returns the built-in kernel registry set before additive extension.
 *
 * @returns The built-in storage factories, parsers, providers, and hook runners
 */
export function createBuiltinKernelRegistry(): KernelRegistryInput {
  return {
    specStorageFactories: { fs: FS_SPEC_STORAGE_FACTORY },
    schemaStorageFactories: { fs: FS_SCHEMA_STORAGE_FACTORY },
    changeStorageFactories: { fs: FS_CHANGE_STORAGE_FACTORY },
    archiveStorageFactories: { fs: FS_ARCHIVE_STORAGE_FACTORY },
    graphStoreFactories: {
      ladybug: LADYBUG_GRAPH_STORE_FACTORY,
      sqlite: SQLITE_GRAPH_STORE_FACTORY,
    },
    parsers: createArtifactParserRegistry(),
    extractorTransforms: createBuiltinExtractorTransforms(),
    vcsProviders: BUILTIN_VCS_PROVIDERS,
    actorProviders: BUILTIN_ACTOR_PROVIDERS,
    externalHookRunners: [],
  }
}

/**
 * Resolves a named storage factory from the merged kernel registry.
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
  /** The merged kernel registry view exposed publicly on the kernel. */
  readonly registry: KernelRegistryView
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
  /** Actor resolver for identity resolution. */
  readonly actor: ActorResolver
  /** VCS adapter for repository queries (rootDir, branch, isClean, ref, show). */
  readonly vcs: VcsAdapter
  /** Hook runner for lifecycle hooks. */
  readonly hooks: HookRunner
  /** Config writer for project init and skill recording. */
  readonly configWriter: ConfigWriter
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
 * @param registry - The merged kernel registry view
 * @param options - Optional kernel-level overrides
 * @returns Pre-built adapter instances for all use cases
 */
export async function createKernelInternals(
  config: SpecdConfig,
  registry: KernelRegistryView,
  options?: KernelOptions,
): Promise<KernelInternals> {
  const defaultWs = getDefaultWorkspace(config)
  const wsContext = {
    workspace: defaultWs.name,
    ownership: defaultWs.ownership,
    isExternal: defaultWs.isExternal,
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
        { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
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
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
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

  return {
    registry,
    changes,
    archive,
    specs,
    schemas,
    parsers: registry.parsers,
    hasher: new NodeContentHasher(),
    files: new FsFileReader(),
    actor: await createVcsActorResolver(config.projectRoot, registry.actorProviders),
    vcs: await createVcsAdapter(config.projectRoot, registry.vcsProviders),
    hooks: new NodeHookRunner(expander),
    configWriter: new FsConfigWriter(),
    yaml: new NodeYamlSerializer(),
    expander,
    schemaRef: config.schemaRef,
    schemaPlugins: config.schemaPlugins ?? [],
    schemaOverrides: config.schemaOverrides,
  }
}
