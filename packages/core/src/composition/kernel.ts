import fs from 'node:fs/promises'
import path from 'node:path'
import { type ArchiveChange } from '../application/use-cases/archive-change.js'
import { type ApproveSignoff } from '../application/use-cases/approve-signoff.js'
import { type ApproveSpec } from '../application/use-cases/approve-spec.js'
import { type CompileContext } from '../application/use-cases/compile-context.js'
import { type CreateChange } from '../application/use-cases/create-change.js'
import { type DetectOverlap } from '../application/use-cases/detect-overlap.js'
import { type DiscardChange } from '../application/use-cases/discard-change.js'
import { type DraftChange } from '../application/use-cases/draft-change.js'
import { type EditChange } from '../application/use-cases/edit-change.js'
import { type GenerateSpecMetadata } from '../application/use-cases/generate-spec-metadata.js'
import { type GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { type GetArchivedChange } from '../application/use-cases/get-archived-change.js'
import { type GetArtifactInstruction } from '../application/use-cases/get-artifact-instruction.js'
import { type GetConfig } from '../application/use-cases/get-config.js'
import { type GetDiscarded } from '../application/use-cases/get-discarded.js'
import { type GetDraft } from '../application/use-cases/get-draft.js'
import { type GetHookInstructions } from '../application/use-cases/get-hook-instructions.js'
import { type GetImplementationReview } from '../application/use-cases/get-implementation-review.js'
import { type GetProjectContext } from '../application/use-cases/get-project-context.js'
import { type GetProjectMetadata } from '../application/use-cases/get-project-metadata.js'
import { type GetProjectSummary } from '../application/use-cases/get-project-summary.js'
import { type GetSpec } from '../application/use-cases/get-spec.js'
import { type GetSpecContext } from '../application/use-cases/get-spec-context.js'
import { type GetSpecOutline } from '../application/use-cases/get-spec-outline.js'
import { type GetSpecsHealth } from '../application/use-cases/get-specs-health.js'
import { type GetStatus } from '../application/use-cases/get-status.js'
import { type InvalidateChange } from '../application/use-cases/invalidate-change.js'
import { type InvalidateSpecMetadata } from '../application/use-cases/invalidate-spec-metadata.js'
import { type ListArchived } from '../application/use-cases/list-archived.js'
import { type ListChanges } from '../application/use-cases/list-changes.js'
import { type ListDiscarded } from '../application/use-cases/list-discarded.js'
import { type ListDrafts } from '../application/use-cases/list-drafts.js'
import { type ListSpecs } from '../application/use-cases/list-specs.js'
import { type ListWorkspaces } from '../application/use-cases/list-workspaces.js'
import { type PreviewSpec } from '../application/use-cases/preview-spec.js'
import { type RefreshImplementationTracking } from '../application/use-cases/refresh-implementation-tracking.js'
import { type ResolveSchema } from '../application/use-cases/resolve-schema.js'
import { type RestoreChange } from '../application/use-cases/restore-change.js'
import { type RunStepHooks } from '../application/use-cases/run-step-hooks.js'
import { type SaveSpecMetadata } from '../application/use-cases/save-spec-metadata.js'
import { type SearchSpecs } from '../application/use-cases/search-specs.js'
import { type SkipArtifact } from '../application/use-cases/skip-artifact.js'
import { type TransitionChange } from '../application/use-cases/transition-change.js'
import { type UpdateImplementationTracking } from '../application/use-cases/update-implementation-tracking.js'
import { type UpdateProjectMetadata } from '../application/use-cases/update-project-metadata.js'
import { type UpdateSpecDeps } from '../application/use-cases/update-spec-deps.js'
import { type UpdateSpecMetadata } from '../application/use-cases/update-spec-metadata.js'
import { type ValidateArtifacts } from '../application/use-cases/validate-artifacts.js'
import { type ValidateSchema } from '../application/use-cases/validate-schema.js'
import { type ValidateSpecs } from '../application/use-cases/validate-specs.js'
import { type ArchiveRepository } from '../application/ports/archive-repository.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { Logger } from '../application/logger.js'
import { type LogDestination } from '../application/ports/logger.port.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SpecdConfig } from '../application/specd-config.js'
import { createDefaultLogger } from '../infrastructure/logging/pino-logger.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from './composition-resolver.js'
import { createApproveSignoff, resolveApproveSignoffDeps } from './use-cases/approve-signoff.js'
import { createApproveSpec, resolveApproveSpecDeps } from './use-cases/approve-spec.js'
import { createArchiveChange, resolveArchiveChangeDeps } from './use-cases/archive-change.js'
import { createCompileContext, resolveCompileContextDeps } from './use-cases/compile-context.js'
import { createCreateChange, resolveCreateChangeDeps } from './use-cases/create-change.js'
import { createDetectOverlap, resolveDetectOverlapDeps } from './use-cases/detect-overlap.js'
import { createDiscardChange, resolveDiscardChangeDeps } from './use-cases/discard-change.js'
import { createDraftChange, resolveDraftChangeDeps } from './use-cases/draft-change.js'
import { createEditChange, resolveEditChangeDeps } from './use-cases/edit-change.js'
import {
  createGenerateSpecMetadata,
  resolveGenerateSpecMetadataDeps,
} from './use-cases/generate-spec-metadata.js'
import { createGetActiveSchema, resolveGetActiveSchemaDeps } from './use-cases/get-active-schema.js'
import {
  createGetArchivedChange,
  resolveGetArchivedChangeDeps,
} from './use-cases/get-archived-change.js'
import {
  createGetArtifactInstruction,
  resolveGetArtifactInstructionDeps,
} from './use-cases/get-artifact-instruction.js'
import { createGetConfig } from './use-cases/get-config.js'
import { createGetDiscarded, resolveGetDiscardedDeps } from './use-cases/get-discarded.js'
import { createGetDraft, resolveGetDraftDeps } from './use-cases/get-draft.js'
import {
  createGetHookInstructions,
  resolveGetHookInstructionsDeps,
} from './use-cases/get-hook-instructions.js'
import {
  createGetImplementationReview,
  resolveGetImplementationReviewDeps,
} from './use-cases/get-implementation-review.js'
import {
  createGetProjectContext,
  resolveGetProjectContextDeps,
} from './use-cases/get-project-context.js'
import { createGetProjectMetadata } from './use-cases/get-project-metadata.js'
import {
  createGetProjectSummary,
  resolveGetProjectSummaryDeps,
} from './use-cases/get-project-summary.js'
import { createGetSpec, resolveGetSpecDeps } from './use-cases/get-spec.js'
import { createGetSpecContext, resolveGetSpecContextDeps } from './use-cases/get-spec-context.js'
import { createGetSpecOutline, resolveGetSpecOutlineDeps } from './use-cases/get-spec-outline.js'
import { createGetSpecsHealth } from './use-cases/get-specs-health.js'
import { createGetStatus, resolveGetStatusDeps } from './use-cases/get-status.js'
import { createCountTasks, resolveCountTasksDeps } from './use-cases/count-tasks.js'
import { type CountTasks } from '../application/use-cases/count-tasks.js'
import {
  createInvalidateChange,
  resolveInvalidateChangeDeps,
} from './use-cases/invalidate-change.js'
import {
  createInvalidateSpecMetadata,
  resolveInvalidateSpecMetadataDeps,
} from './use-cases/invalidate-spec-metadata.js'
import { createListArchived, resolveListArchivedDeps } from './use-cases/list-archived.js'
import { createListChanges, resolveListChangesDeps } from './use-cases/list-changes.js'
import { createListDiscarded, resolveListDiscardedDeps } from './use-cases/list-discarded.js'
import { createListDrafts, resolveListDraftsDeps } from './use-cases/list-drafts.js'
import { createListSpecs, resolveListSpecsDeps } from './use-cases/list-specs.js'
import { createListWorkspaces, resolveListWorkspacesDeps } from './use-cases/list-workspaces.js'
import { createPreviewSpec, resolvePreviewSpecDeps } from './use-cases/preview-spec.js'
import {
  createRefreshImplementationTracking,
  resolveRefreshImplementationTrackingDeps,
} from './use-cases/refresh-implementation-tracking.js'
import { createResolveSchema, resolveResolveSchemaDeps } from './use-cases/resolve-schema.js'
import { createRestoreChange, resolveRestoreChangeDeps } from './use-cases/restore-change.js'
import { createRunStepHooks, resolveRunStepHooksDeps } from './use-cases/run-step-hooks.js'
import {
  createSaveSpecMetadata,
  resolveSaveSpecMetadataDeps,
} from './use-cases/save-spec-metadata.js'
import { createSearchSpecs, resolveSearchSpecsDeps } from './use-cases/search-specs.js'
import { createSkipArtifact, resolveSkipArtifactDeps } from './use-cases/skip-artifact.js'
import {
  createTransitionChange,
  resolveTransitionChangeDeps,
} from './use-cases/transition-change.js'
import {
  createUpdateImplementationTracking,
  resolveUpdateImplementationTrackingDeps,
} from './use-cases/update-implementation-tracking.js'
import { createUpdateProjectMetadata } from './use-cases/update-project-metadata.js'
import { createUpdateSpecDeps, resolveUpdateSpecDepsDeps } from './use-cases/update-spec-deps.js'
import { createUpdateSpecMetadata } from './use-cases/update-spec-metadata.js'
import {
  createValidateArtifacts,
  resolveValidateArtifactsDeps,
} from './use-cases/validate-artifacts.js'
import { createValidateSchema, resolveValidateSchemaDeps } from './use-cases/validate-schema.js'
import { createValidateSpecs, resolveValidateSpecsDeps } from './use-cases/validate-specs.js'
import { type CompositionRegistryView } from './composition-registries.js'

/**
 * All use cases instantiated from a single `SpecdConfig`, grouped by domain area.
 */
export interface Kernel {
  registry: CompositionRegistryView
  schemas: SchemaRegistry
  changes: {
    repo: ChangeRepository
    archiveRepo: ArchiveRepository
    create: CreateChange
    status: GetStatus
    countTasks: CountTasks
    transition: TransitionChange
    draft: DraftChange
    restore: RestoreChange
    discard: DiscardChange
    archive: ArchiveChange
    validate: ValidateArtifacts
    compile: CompileContext
    list: ListChanges
    listDrafts: ListDrafts
    getDraft: GetDraft
    listDiscarded: ListDiscarded
    getDiscarded: GetDiscarded
    edit: EditChange
    invalidate: InvalidateChange
    skipArtifact: SkipArtifact
    updateSpecDeps: UpdateSpecDeps
    listArchived: ListArchived
    getArchived: GetArchivedChange
    runStepHooks: RunStepHooks
    getHookInstructions: GetHookInstructions
    getArtifactInstruction: GetArtifactInstruction
    updateImplementationTracking: UpdateImplementationTracking
    refreshImplementationTracking: RefreshImplementationTracking
    getImplementationReview: GetImplementationReview
    detectOverlap: DetectOverlap
    preview: PreviewSpec
    approveSpec: ApproveSpec
    approveSignoff: ApproveSignoff
  }
  specs: {
    repos: ReadonlyMap<string, SpecRepository>
    list: ListSpecs
    search: SearchSpecs
    get: GetSpec
    getOutline: GetSpecOutline
    saveMetadata: SaveSpecMetadata
    invalidateMetadata: InvalidateSpecMetadata
    getActiveSchema: GetActiveSchema
    resolve: ResolveSchema
    validateSchema: ValidateSchema
    validate: ValidateSpecs
    getHealth: GetSpecsHealth
    generateMetadata: GenerateSpecMetadata
    updateMetadata: UpdateSpecMetadata
    getContext: GetSpecContext
  }
  project: {
    listWorkspaces: ListWorkspaces
    getProjectSummary: GetProjectSummary
    getProjectContext: GetProjectContext
    getConfig: GetConfig
    getMetadata: GetProjectMetadata
    updateMetadata: UpdateProjectMetadata
  }
}

/** Options for {@link createKernel}. */
export interface KernelOptions extends CompositionResolutionOptions {
  readonly additionalDestinations?: readonly LogDestination[]
}

/**
 * Factory function that creates and wires a new {@link Kernel} instance.
 *
 * @param config - Resolved project configuration
 * @param options - Optional kernel options
 * @returns The fully-wired specd kernel
 */
export async function createKernel(config: SpecdConfig, options?: KernelOptions): Promise<Kernel> {
  const logDir = path.join(config.configPath, 'log')
  const logFilePath = path.join(logDir, 'specd.log')
  await fs.mkdir(logDir, { recursive: true })
  const destinations: LogDestination[] = [
    {
      target: 'file',
      level: config.logging?.level ?? 'info',
      format: 'json',
      path: logFilePath,
    },
    ...(options?.additionalDestinations ?? []),
  ]
  Logger.setImplementation(createDefaultLogger(destinations))

  const resolver = createCompositionResolver(config, options)

  const changesRepo = resolver.getChangeRepository()
  const archiveRepo = resolver.getArchiveRepository()
  const specsRepos = resolver.getSpecRepositories()
  const schemas = resolver.getSchemaRegistry()

  const listWorkspaces = createListWorkspaces(resolveListWorkspacesDeps(resolver))
  const listChanges = createListChanges(resolveListChangesDeps(resolver))
  const listDrafts = createListDrafts(resolveListDraftsDeps(resolver))
  const listDiscarded = createListDiscarded(resolveListDiscardedDeps(resolver))
  const listArchived = createListArchived(resolveListArchivedDeps(resolver))
  const getDraft = createGetDraft(resolveGetDraftDeps(resolver))
  const getDiscarded = createGetDiscarded(resolveGetDiscardedDeps(resolver))
  const getArchived = createGetArchivedChange(resolveGetArchivedChangeDeps(resolver))
  const resolveSchema = createResolveSchema(resolveResolveSchemaDeps(resolver))
  const getActiveSchema = createGetActiveSchema(resolveGetActiveSchemaDeps(resolver))
  const runStepHooks = createRunStepHooks(resolveRunStepHooksDeps(resolver))
  const refreshImplementationTracking = createRefreshImplementationTracking(
    resolveRefreshImplementationTrackingDeps(resolver),
  )
  const detectOverlap = createDetectOverlap(resolveDetectOverlapDeps(resolver))
  const preview = createPreviewSpec(resolvePreviewSpecDeps(resolver))
  const generateMetadata = createGenerateSpecMetadata(resolveGenerateSpecMetadataDeps(resolver))
  const saveMetadata = createSaveSpecMetadata(resolveSaveSpecMetadataDeps(resolver))

  const create = createCreateChange(resolveCreateChangeDeps(resolver))
  const status = createGetStatus(resolveGetStatusDeps(resolver))
  const countTasks = createCountTasks(resolveCountTasksDeps(resolver))
  const transition = createTransitionChange(resolveTransitionChangeDeps(resolver))
  const draft = createDraftChange(resolveDraftChangeDeps(resolver))
  const restore = createRestoreChange(resolveRestoreChangeDeps(resolver))
  const discard = createDiscardChange(resolveDiscardChangeDeps(resolver))
  const archive = createArchiveChange(resolveArchiveChangeDeps(resolver))
  const validate = createValidateArtifacts(resolveValidateArtifactsDeps(resolver))
  const compile = createCompileContext(resolveCompileContextDeps(resolver))
  const edit = createEditChange(resolveEditChangeDeps(resolver))
  const invalidate = createInvalidateChange(resolveInvalidateChangeDeps(resolver))
  const skipArtifact = createSkipArtifact(resolveSkipArtifactDeps(resolver))
  const updateSpecDeps = createUpdateSpecDeps(resolveUpdateSpecDepsDeps(resolver))
  const getHookInstructions = createGetHookInstructions(resolveGetHookInstructionsDeps(resolver))
  const getArtifactInstruction = createGetArtifactInstruction(
    resolveGetArtifactInstructionDeps(resolver),
  )
  const updateImplementationTracking = createUpdateImplementationTracking(
    resolveUpdateImplementationTrackingDeps(resolver),
  )
  const getImplementationReview = createGetImplementationReview(
    resolveGetImplementationReviewDeps(resolver),
  )
  const approveSpec = createApproveSpec(resolveApproveSpecDeps(resolver))
  const approveSignoff = createApproveSignoff(resolveApproveSignoffDeps(resolver))

  const listSpecs = createListSpecs(resolveListSpecsDeps(resolver))
  const searchSpecs = createSearchSpecs(resolveSearchSpecsDeps(resolver))
  const getSpec = createGetSpec(resolveGetSpecDeps(resolver))
  const getOutline = createGetSpecOutline(resolveGetSpecOutlineDeps(resolver))
  const invalidateMetadata = createInvalidateSpecMetadata(
    resolveInvalidateSpecMetadataDeps(resolver),
  )
  const validateSchema = createValidateSchema(resolveValidateSchemaDeps(resolver))
  const validateSpecs = createValidateSpecs(resolveValidateSpecsDeps(resolver))
  const getHealth = createGetSpecsHealth({ validateSpecs })
  const updateMetadata = createUpdateSpecMetadata({
    generateMetadata: resolveGenerateSpecMetadataDeps(resolver),
    saveMetadata: resolveSaveSpecMetadataDeps(resolver),
  })
  const getContext = createGetSpecContext(resolveGetSpecContextDeps(resolver))

  const getProjectSummary = createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))
  const getProjectContext = createGetProjectContext(resolveGetProjectContextDeps(resolver))
  const getConfig = createGetConfig({ config: resolver.config })
  const getMetadata = createGetProjectMetadata({
    config: resolver.config,
    fileReader: resolver.getFileReader(),
  })
  const updateProjectMetadata = createUpdateProjectMetadata({
    config: resolver.config,
    listWorkspaces,
    specRepositories: specsRepos,
    fileReader: resolver.getFileReader(),
    fileWriter: resolver.getFileWriter(),
    contentHasher: resolver.getContentHasher(),
  })

  return {
    registry: resolver.registry,
    schemas,
    changes: {
      repo: changesRepo,
      archiveRepo,
      create,
      status,
      countTasks,
      transition,
      draft,
      restore,
      discard,
      archive,
      validate,
      compile,
      list: listChanges,
      listDrafts,
      getDraft,
      listDiscarded,
      getDiscarded,
      edit,
      invalidate,
      skipArtifact,
      updateSpecDeps,
      listArchived,
      getArchived,
      runStepHooks,
      getHookInstructions,
      getArtifactInstruction,
      updateImplementationTracking,
      refreshImplementationTracking,
      getImplementationReview,
      detectOverlap,
      preview,
      approveSpec,
      approveSignoff,
    },
    specs: {
      repos: specsRepos,
      list: listSpecs,
      search: searchSpecs,
      get: getSpec,
      getOutline,
      saveMetadata,
      invalidateMetadata,
      getActiveSchema,
      resolve: resolveSchema,
      validateSchema,
      validate: validateSpecs,
      getHealth,
      generateMetadata,
      updateMetadata,
      getContext,
    },
    project: {
      listWorkspaces,
      getProjectSummary,
      getProjectContext,
      getConfig,
      getMetadata,
      updateMetadata: updateProjectMetadata,
    },
  }
}
