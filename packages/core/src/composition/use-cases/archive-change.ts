import * as path from 'node:path'
import { ArchiveChange } from '../../application/use-cases/archive-change.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArchiveRepository } from '../archive-repository.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { type SchemaRepository } from '../../application/ports/schema-repository.js'
import { createSchemaRepository } from '../schema-repository.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createVcsActorResolver } from '../actor-resolver.js'
import { TemplateExpander } from '../../application/template-expander.js'
import { NodeHookRunner } from '../../infrastructure/node/hook-runner.js'
import { RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { GenerateSpecMetadata } from '../../application/use-cases/generate-spec-metadata.js'
import { SaveSpecMetadata } from '../../application/use-cases/save-spec-metadata.js'
import { createBuiltinExtractorTransforms } from '../extractor-transforms/index.js'
import { createSpecWorkspaceRoutes } from '../spec-workspace-routes.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import {
  FsArchiveBatchSnapshot,
  type ArchiveBatchSnapshotWorkspaceLayout,
} from '../../infrastructure/fs/archive-batch-snapshot.js'
import { type ArchiveBatchSnapshotPort } from '../../application/ports/archive-batch-snapshot.js'
import { FsSpecRepository } from '../../infrastructure/fs/spec-repository.js'
import {
  ListWorkspaces,
  type ProjectWorkspace,
} from '../../application/use-cases/list-workspaces.js'

/**
 * Builds workspace spec layout map for {@link FsArchiveBatchSnapshot}.
 *
 * @param workspaces - Orchestrated list of workspaces
 * @returns Layout map keyed by workspace name
 */
export function buildWorkspaceSpecLayouts(
  workspaces: readonly ProjectWorkspace[],
): ReadonlyMap<string, ArchiveBatchSnapshotWorkspaceLayout> {
  const layouts = new Map<string, ArchiveBatchSnapshotWorkspaceLayout>()
  for (const ws of workspaces) {
    const fsRepo = ws.specRepo as FsSpecRepository
    layouts.set(ws.name, {
      specsPath: fsRepo.specsPath,
      ...(fsRepo.prefix !== undefined ? { prefix: fsRepo.prefix } : {}),
    } as ArchiveBatchSnapshotWorkspaceLayout)
  }
  return layouts
}

/**
 * Resolves the batch snapshot port for archive composition.
 *
 * Uses explicit layouts when provided; otherwise derives from {@link FsSpecRepository}
 * instances in the spec repository map; falls back to a no-op adapter for stub-only tests.
 *
 * @param listWorkspaces - Orchestrated list of workspaces
 * @param layouts - Optional explicit workspace layouts
 * @returns Batch snapshot port for {@link ArchiveChange}
 */
export function resolveArchiveBatchSnapshotPort(
  listWorkspaces: ListWorkspaces,
  layouts?: ReadonlyMap<string, ArchiveBatchSnapshotWorkspaceLayout>,
): ArchiveBatchSnapshotPort {
  if (layouts !== undefined && layouts.size > 0) {
    return new FsArchiveBatchSnapshot(layouts)
  }

  return {
    snapshot: async (specId, changeName) => {
      const workspaces = await listWorkspaces.execute()
      const derived = buildWorkspaceSpecLayouts(workspaces)
      const port = new FsArchiveBatchSnapshot(derived)
      return port.snapshot(specId, changeName)
    },
    restoreBatch: async (specIds, publishOrder) => {
      const workspaces = await listWorkspaces.execute()
      const derived = buildWorkspaceSpecLayouts(workspaces)
      const port = new FsArchiveBatchSnapshot(derived)
      return port.restoreBatch(specIds, publishOrder)
    },
    detectOrphans: async (specIds, changeName) => {
      const workspaces = await listWorkspaces.execute()
      const derived = buildWorkspaceSpecLayouts(workspaces)
      const port = new FsArchiveBatchSnapshot(derived)
      return port.detectOrphans(specIds, changeName)
    },
    recordCreatedFile: async (specId, filename) => {
      const workspaces = await listWorkspaces.execute()
      const derived = buildWorkspaceSpecLayouts(workspaces)
      const port = new FsArchiveBatchSnapshot(derived)
      return port.recordCreatedFile(specId, filename)
    },
    cleanup: async (specIds) => {
      const workspaces = await listWorkspaces.execute()
      const derived = buildWorkspaceSpecLayouts(workspaces)
      const port = new FsArchiveBatchSnapshot(derived)
      return port.cleanup(specIds)
    },
  }
}

/**
 * Domain context for the primary (default) workspace used by `ArchiveChange`.
 */
export interface ArchiveChangeContext {
  /** The workspace name from `specd.yaml` (e.g. `'default'`). */
  readonly workspace: string
  /** Ownership level of this workspace. */
  readonly ownership: 'owned' | 'shared' | 'readOnly'
  /** Whether the workspace's specs live outside the current git root. */
  readonly isExternal: boolean
  readonly configPath: string
}

/**
 * Filesystem adapter paths and pre-built port instances for
 * `createArchiveChange(context, options)`.
 */
export interface FsArchiveChangeOptions {
  /** Absolute path to the `changes/` directory. */
  readonly changesPath: string
  /** Absolute path to the `drafts/` directory. */
  readonly draftsPath: string
  /** Absolute path to the `discarded/` directory. */
  readonly discardedPath: string
  /** Absolute path to the archive root directory. */
  readonly archivePath: string
  /** Optional archive directory pattern (e.g. `'{{year}}/{{change.archivedName}}'`). */
  readonly archivePattern?: string
  /** The project orchestrator. */
  readonly listWorkspaces: ListWorkspaces
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
  readonly schemaRef: string
  readonly schemaRepositories: ReadonlyMap<string, SchemaRepository>
  /** Absolute path to the project root. */
  readonly projectRoot: string
  /** Workspace routing metadata for cross-workspace spec reference resolution. */
  readonly workspaceRoutes?: readonly SpecWorkspaceRoute[]
  /** Workspace spec directory layouts for batch snapshot restore. */
  readonly workspaceSpecLayouts?: ReadonlyMap<string, ArchiveBatchSnapshotWorkspaceLayout>
}

/**
 * Constructs an `ArchiveChange` use case wired to all configured workspaces.
 *
 * @param configOrContext - Full project config or workspace-specific context
 * @param options - Filesystem adapter paths and pre-built port instances
 * @returns Fully-wired `ArchiveChange` use case
 */
export function createArchiveChange(
  configOrContext: SpecdConfig | ArchiveChangeContext,
  options?: FsArchiveChangeOptions | { extraNodeModulesPaths?: readonly string[] },
): ArchiveChange {
  if (isSpecdConfig(configOrContext)) {
    const config = configOrContext
    const kernelOpts = options as { extraNodeModulesPaths?: readonly string[] } | undefined
    const defaultWs = getDefaultWorkspace(config)
    const specRepos = new Map(
      config.workspaces.map((ws) => [
        ws.name,
        createSpecRepository(
          'fs',
          {
            workspace: ws.name,
            ownership: ws.ownership,
            isExternal: ws.isExternal,
            configPath: config.configPath,
          },
          {
            specsPath: ws.specsPath,
            metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
            ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
          },
        ),
      ]),
    )
    const schemaRepos = new Map(
      config.workspaces
        .filter((ws) => ws.schemasPath !== null)
        .map((ws) => [
          ws.name,
          createSchemaRepository(
            'fs',
            {
              workspace: ws.name,
              ownership: ws.ownership,
              isExternal: ws.isExternal,
              configPath: config.configPath,
            },
            { schemasPath: ws.schemasPath! },
          ),
        ]),
    ) as ReadonlyMap<string, SchemaRepository>
    const listWorkspaces = new ListWorkspaces(config, specRepos)
    return createArchiveChange(
      {
        workspace: defaultWs.name,
        ownership: defaultWs.ownership,
        isExternal: defaultWs.isExternal,
        configPath: config.configPath,
      },
      {
        changesPath: config.storage.changesPath,
        draftsPath: config.storage.draftsPath,
        discardedPath: config.storage.discardedPath,
        archivePath: config.storage.archivePath,
        ...(config.storage.archivePattern !== undefined
          ? { archivePattern: config.storage.archivePattern }
          : {}),
        listWorkspaces,
        nodeModulesPaths: [
          path.join(config.projectRoot, 'node_modules'),
          ...(kernelOpts?.extraNodeModulesPaths ?? []),
        ],
        configDir: config.projectRoot,
        schemaRef: config.schemaRef,
        schemaRepositories: schemaRepos,
        projectRoot: config.projectRoot,
        workspaceRoutes: createSpecWorkspaceRoutes(config.workspaces),
        workspaceSpecLayouts: buildWorkspaceSpecLayouts(
          Array.from(config.workspaces).map((w) => ({
            name: w.name,
            codeRoot: w.codeRoot,
            isExternal: w.isExternal,
            ownership: w.ownership,
            specRepo: specRepos.get(w.name)!,
          })),
        ),
      },
    )
  }

  const opts = options as FsArchiveChangeOptions
  const changeRepo = createChangeRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    discardedPath: opts.discardedPath,
  })
  const archiveRepo = createArchiveRepository('fs', configOrContext, {
    changesPath: opts.changesPath,
    draftsPath: opts.draftsPath,
    archivePath: opts.archivePath,
    ...(opts.archivePattern !== undefined ? { pattern: opts.archivePattern } : {}),
  })
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: opts.nodeModulesPaths,
    configDir: opts.configDir,
    schemaRepositories: opts.schemaRepositories,
  })
  const resolveSchema = new ResolveSchema(schemas, opts.schemaRef, [], undefined)
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const parsers = createArtifactParserRegistry()
  const expander = new TemplateExpander({ project: { root: opts.projectRoot } })
  const hooks = new NodeHookRunner(expander)
  const actor = createVcsActorResolver()
  const hasher = new NodeContentHasher()
  const generateMetadata = new GenerateSpecMetadata(
    opts.listWorkspaces,
    schemaProvider,
    parsers,
    hasher,
    createBuiltinExtractorTransforms(),
    opts.workspaceRoutes ?? [],
  )
  const saveMetadata = new SaveSpecMetadata(opts.listWorkspaces.repos)
  const runStepHooks = new RunStepHooks(changeRepo, archiveRepo, hooks, new Map(), schemaProvider)
  const batchSnapshot = resolveArchiveBatchSnapshotPort(
    opts.listWorkspaces,
    opts.workspaceSpecLayouts,
  )
  return new ArchiveChange(
    changeRepo,
    opts.listWorkspaces,
    archiveRepo,
    runStepHooks,
    actor,
    parsers,
    schemaProvider,
    generateMetadata,
    saveMetadata,
    createBuiltinExtractorTransforms(),
    opts.workspaceRoutes ?? [],
    opts.projectRoot,
    batchSnapshot,
  )
}
