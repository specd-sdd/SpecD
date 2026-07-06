/* eslint-disable jsdoc/require-jsdoc */
import { type ArchiveBatchSnapshotPort } from '../../application/ports/archive-batch-snapshot.js'
import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { ArchiveChange } from '../../application/use-cases/archive-change.js'
import { type GenerateSpecMetadata } from '../../application/use-cases/generate-spec-metadata.js'
import {
  ListWorkspaces,
  type ProjectWorkspace,
} from '../../application/use-cases/list-workspaces.js'
import { type RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { type SaveSpecMetadata } from '../../application/use-cases/save-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type ExtractorTransformRegistry } from '../../domain/services/extract-metadata.js'
import { type SpecWorkspaceRoute } from '../../application/use-cases/_shared/spec-reference-resolver.js'
import {
  FsArchiveBatchSnapshot,
  type ArchiveBatchSnapshotWorkspaceLayout,
} from '../../infrastructure/fs/archive-batch-snapshot.js'
import { FsSpecRepository } from '../../infrastructure/fs/spec-repository.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createGenerateSpecMetadata } from './generate-spec-metadata.js'
import { createSaveSpecMetadata } from './save-spec-metadata.js'

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

export interface ArchiveChangeDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly archive: ArchiveRepository
  readonly runStepHooks: RunStepHooks
  readonly actor: ActorResolver
  readonly parsers: ArtifactParserRegistry
  readonly schemaProvider: SchemaProvider
  readonly generateMetadata: GenerateSpecMetadata
  readonly saveMetadata: SaveSpecMetadata
  readonly extractorTransforms: ExtractorTransformRegistry
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  readonly projectRoot: string
  readonly batchSnapshot: ArchiveBatchSnapshotPort
}

export function resolveArchiveChangeDeps(resolver: CompositionResolver): ArchiveChangeDeps {
  const listWorkspaces = resolver.getListWorkspaces()
  const specRepositories = resolver.getSpecRepositories()
  const workspaceLayouts = buildWorkspaceSpecLayouts(
    resolver.config.workspaces.map((workspace) => ({
      name: workspace.name,
      prefix: workspace.prefix ?? null,
      codeRoot: workspace.codeRoot,
      isExternal: workspace.isExternal,
      ownership: workspace.ownership,
      specRepo: specRepositories.get(workspace.name) as SpecRepository,
    })),
  )

  return {
    changes: resolver.getChangeRepository(),
    listWorkspaces,
    archive: resolver.getArchiveRepository(),
    runStepHooks: resolver.getRunStepHooks(),
    actor: resolver.getActorResolver(),
    parsers: resolver.getArtifactParserRegistry(),
    schemaProvider: resolver.getSchemaProvider(),
    generateMetadata: createGenerateSpecMetadata(resolver.config, resolver.options),
    saveMetadata: createSaveSpecMetadata({
      specRepositories,
    }),
    extractorTransforms: resolver.getExtractorTransforms(),
    workspaceRoutes: resolver.getSpecWorkspaceRoutes(),
    projectRoot: resolver.config.projectRoot,
    batchSnapshot: resolveArchiveBatchSnapshotPort(listWorkspaces, workspaceLayouts),
  }
}

export function createArchiveChange(deps: ArchiveChangeDeps): ArchiveChange
export function createArchiveChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ArchiveChange
export function createArchiveChange(
  depsOrConfig: ArchiveChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ArchiveChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createArchiveChange',
    depsOrConfig,
    options,
    isArchiveChangeDeps,
  )
  return createArchiveChangeFromNormalized(normalized)
}

function createArchiveChangeFromNormalized(
  input: FactoryInput<ArchiveChangeDeps, CompositionResolutionOptions>,
): ArchiveChange {
  if (input.kind === 'deps') {
    const {
      changes,
      listWorkspaces,
      archive,
      runStepHooks,
      actor,
      parsers,
      schemaProvider,
      generateMetadata,
      saveMetadata,
      extractorTransforms,
      workspaceRoutes,
      projectRoot,
      batchSnapshot,
    } = input.deps

    return new ArchiveChange(
      changes,
      listWorkspaces,
      archive,
      runStepHooks,
      actor,
      parsers,
      schemaProvider,
      generateMetadata,
      saveMetadata,
      extractorTransforms,
      workspaceRoutes,
      projectRoot,
      batchSnapshot,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createArchiveChange(resolveArchiveChangeDeps(resolver))
}

function isArchiveChangeDeps(value: ArchiveChangeDeps | SpecdConfig): value is ArchiveChangeDeps {
  return (
    'changes' in value &&
    'listWorkspaces' in value &&
    'archive' in value &&
    'runStepHooks' in value &&
    'actor' in value &&
    'parsers' in value &&
    'schemaProvider' in value &&
    'generateMetadata' in value &&
    'saveMetadata' in value &&
    'extractorTransforms' in value &&
    'workspaceRoutes' in value &&
    'projectRoot' in value &&
    'batchSnapshot' in value
  )
}
