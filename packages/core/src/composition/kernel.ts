import fs from 'node:fs/promises'
import path from 'node:path'
import { CreateChange } from '../application/use-cases/create-change.js'
import { GetStatus } from '../application/use-cases/get-status.js'
import { TransitionChange } from '../application/use-cases/transition-change.js'
import { DraftChange } from '../application/use-cases/draft-change.js'
import { RestoreChange } from '../application/use-cases/restore-change.js'
import { DiscardChange } from '../application/use-cases/discard-change.js'
import { ArchiveChange } from '../application/use-cases/archive-change.js'
import { ValidateArtifacts } from '../application/use-cases/validate-artifacts.js'
import { CompileContext } from '../application/use-cases/compile-context.js'
import { ApproveSpec } from '../application/use-cases/approve-spec.js'
import { ApproveSignoff } from '../application/use-cases/approve-signoff.js'
import { ListChanges } from '../application/use-cases/list-changes.js'
import { ListDrafts } from '../application/use-cases/list-drafts.js'
import { ListDiscarded } from '../application/use-cases/list-discarded.js'
import { GetDraft } from '../application/use-cases/get-draft.js'
import { GetDiscarded } from '../application/use-cases/get-discarded.js'
import { ListArchived } from '../application/use-cases/list-archived.js'
import { GetArchivedChange } from '../application/use-cases/get-archived-change.js'
import { EditChange } from '../application/use-cases/edit-change.js'
import { InvalidateChange } from '../application/use-cases/invalidate-change.js'
import { UpdateSpecDeps } from '../application/use-cases/update-spec-deps.js'
import { SkipArtifact } from '../application/use-cases/skip-artifact.js'
import { ListSpecs } from '../application/use-cases/list-specs.js'
import { SearchSpecs } from '../application/use-cases/search-specs.js'
import { GetSpec } from '../application/use-cases/get-spec.js'
import { SaveSpecMetadata } from '../application/use-cases/save-spec-metadata.js'
import { InvalidateSpecMetadata } from '../application/use-cases/invalidate-spec-metadata.js'
import { GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { ResolveSchema } from '../application/use-cases/resolve-schema.js'
import { InitProject } from '../application/use-cases/init-project.js'
import { AddPlugin } from '../application/use-cases/add-plugin.js'
import { RemovePlugin } from '../application/use-cases/remove-plugin.js'
import { GetProjectContext } from '../application/use-cases/get-project-context.js'
import { GetConfig } from '../application/use-cases/get-config.js'
import { ValidateSpecs } from '../application/use-cases/validate-specs.js'
import { GetSpecContext } from '../application/use-cases/get-spec-context.js'
import { GenerateSpecMetadata } from '../application/use-cases/generate-spec-metadata.js'
import { RunStepHooks } from '../application/use-cases/run-step-hooks.js'
import { GetHookInstructions } from '../application/use-cases/get-hook-instructions.js'
import { GetArtifactInstruction } from '../application/use-cases/get-artifact-instruction.js'
import { ValidateSchema } from '../application/use-cases/validate-schema.js'
import { DetectOverlap } from '../application/use-cases/detect-overlap.js'
import { PreviewSpec } from '../application/use-cases/preview-spec.js'
import { GetSpecOutline } from '../application/use-cases/get-spec-outline.js'
import { UpdateImplementationTracking } from '../application/use-cases/update-implementation-tracking.js'
import { RefreshImplementationTracking } from '../application/use-cases/refresh-implementation-tracking.js'
import { GetImplementationReview } from '../application/use-cases/get-implementation-review.js'
import { UpdateSpecMetadata } from '../application/use-cases/update-spec-metadata.js'
import { UpdateProjectMetadata } from '../application/use-cases/update-project-metadata.js'
import { GetProjectMetadata } from '../application/use-cases/get-project-metadata.js'
import { ListWorkspaces } from '../application/use-cases/list-workspaces.js'
import { LifecycleEngine } from '../domain/services/lifecycle-engine.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type SchemaRegistry } from '../application/ports/schema-registry.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SpecdConfig } from '../application/specd-config.js'
import { Logger } from '../application/logger.js'
import { type LogDestination } from '../application/ports/logger.port.js'
import { createBuiltinKernelRegistry, createKernelInternals } from './kernel-internals.js'
import {
  createKernelRegistryView,
  type KernelRegistryInput,
  type KernelRegistryView,
} from './kernel-registries.js'
import { LazySchemaProvider } from './lazy-schema-provider.js'
import { createSpecWorkspaceRoutes } from './spec-workspace-routes.js'
import { buildCompileContextConfig } from './build-compile-context-config.js'
import { createDefaultLogger } from '../infrastructure/logging/pino-logger.js'
import { VcsImplementationDetector } from '../infrastructure/vcs/vcs-implementation-detector.js'
import { buildSchema } from '../domain/services/build-schema.js'

/**
 * All use cases instantiated from a single `SpecdConfig`, grouped by domain area.
 */
export interface Kernel {
  registry: KernelRegistryView
  schemas: SchemaRegistry
  changes: {
    repo: ChangeRepository
    create: CreateChange
    status: GetStatus
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
  }
  specs: {
    repos: ReadonlyMap<string, SpecRepository>
    approveSpec: ApproveSpec
    approveSignoff: ApproveSignoff
    list: ListSpecs
    search: SearchSpecs
    get: GetSpec
    getOutline: GetSpecOutline
    saveMetadata: SaveSpecMetadata
    invalidateMetadata: InvalidateSpecMetadata
    getActiveSchema: GetActiveSchema
    validateSchema: ValidateSchema
    validate: ValidateSpecs
    generateMetadata: GenerateSpecMetadata
    updateMetadata: UpdateSpecMetadata
    getContext: GetSpecContext
  }
  project: {
    init: InitProject
    addPlugin: AddPlugin
    removePlugin: RemovePlugin
    listWorkspaces: ListWorkspaces
    getProjectContext: GetProjectContext
    getConfig: GetConfig
    getMetadata: GetProjectMetadata
    updateMetadata: UpdateProjectMetadata
  }
}

/** Options for {@link createKernel}. */
export interface KernelOptions extends KernelRegistryInput {
  readonly extraNodeModulesPaths?: readonly string[]
  readonly graphStoreId?: string
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
  const registry = createKernelRegistryView(createBuiltinKernelRegistry(), options)
  const i = await createKernelInternals(config, registry, options)
  const workspaceRoutes = createSpecWorkspaceRoutes(config.workspaces)
  const defaultCompileContextConfig = buildCompileContextConfig(config)

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

  const resolveSchema = new ResolveSchema(
    i.schemas,
    i.schemaRef,
    i.schemaPlugins,
    i.schemaOverrides,
  )
  const schemaProvider = new LazySchemaProvider(resolveSchema)
  const runStepHooks = new RunStepHooks(
    i.changes,
    i.archive,
    i.hooks,
    i.registry.externalHookRunners,
    schemaProvider,
  )

  const previewSpec = new PreviewSpec(i.changes, i.specs, schemaProvider, i.parsers)
  const lifecycle = new LifecycleEngine(Logger.debug.bind(Logger))
  const implementationDetector = new VcsImplementationDetector(config.projectRoot, i.vcs)
  const listWorkspaces = new ListWorkspaces(config, i.specs)
  const refreshImplementationTracking = new RefreshImplementationTracking(
    i.changes,
    i.archive,
    implementationDetector,
    i.files,
    config.projectRoot,
  )

  const generateMetadata = new GenerateSpecMetadata(
    listWorkspaces,
    schemaProvider,
    i.parsers,
    i.hasher,
    i.registry.extractorTransforms,
    workspaceRoutes,
  )

  const saveMetadata = new SaveSpecMetadata(i.specs)
  const updateSpecMetadata = new UpdateSpecMetadata(generateMetadata, saveMetadata)
  const updateProjectMetadata = new UpdateProjectMetadata(
    config,
    listWorkspaces,
    i.specs,
    i.files,
    i.fileWriter,
    i.hasher,
  )
  const getProjectMetadata = new GetProjectMetadata(config, i.files)

  const getActiveSchema = new GetActiveSchema(
    resolveSchema,
    i.schemas,
    buildSchema,
    config.schemaRef,
  )
  const detectOverlap = new DetectOverlap(i.changes)

  return {
    registry,
    schemas: i.schemas,
    changes: {
      repo: i.changes,
      create: new CreateChange(i.changes, listWorkspaces, i.actor, getActiveSchema, detectOverlap),
      status: new GetStatus(
        i.changes,
        schemaProvider,
        {
          spec: config.approvals.spec,
          signoff: config.approvals.signoff,
        },
        refreshImplementationTracking,
        lifecycle,
      ),
      transition: new TransitionChange(
        i.changes,
        i.actor,
        schemaProvider,
        runStepHooks,
        refreshImplementationTracking,
        lifecycle,
      ),
      draft: new DraftChange(i.changes, i.actor),
      restore: new RestoreChange(i.changes, i.actor),
      discard: new DiscardChange(i.changes, i.actor),
      archive: new ArchiveChange(
        i.changes,
        listWorkspaces,
        i.archive,
        runStepHooks,
        i.actor,
        i.parsers,
        schemaProvider,
        generateMetadata,
        saveMetadata,
        i.registry.extractorTransforms,
        workspaceRoutes,
        config.projectRoot,
      ),
      validate: new ValidateArtifacts(
        i.changes,
        listWorkspaces,
        schemaProvider,
        i.parsers,
        i.actor,
        i.hasher,
        i.registry.extractorTransforms,
        workspaceRoutes,
        lifecycle,
      ),
      compile: new CompileContext(
        i.changes,
        listWorkspaces,
        schemaProvider,
        i.files,
        i.parsers,
        i.hasher,
        previewSpec,
        i.registry.extractorTransforms,
        workspaceRoutes,
        lifecycle,
        defaultCompileContextConfig,
      ),
      list: new ListChanges(i.changes),
      listDrafts: new ListDrafts(i.changes),
      getDraft: new GetDraft(i.changes),
      listDiscarded: new ListDiscarded(i.changes),
      getDiscarded: new GetDiscarded(i.changes),
      edit: new EditChange(i.changes, listWorkspaces, i.actor, schemaProvider),
      invalidate: new InvalidateChange(i.changes, i.actor, schemaProvider),
      skipArtifact: new SkipArtifact(i.changes, i.actor),
      updateSpecDeps: new UpdateSpecDeps(i.changes),
      listArchived: new ListArchived(i.archive),
      getArchived: new GetArchivedChange(i.archive),
      runStepHooks,
      getHookInstructions: new GetHookInstructions(
        i.changes,
        i.archive,
        schemaProvider,
        i.expander,
      ),
      detectOverlap,
      preview: previewSpec,
      updateImplementationTracking: new UpdateImplementationTracking(
        i.changes,
        i.files,
        config.projectRoot,
      ),
      refreshImplementationTracking,
      getImplementationReview: new GetImplementationReview(i.changes),
      getArtifactInstruction: new GetArtifactInstruction(
        i.changes,
        i.specs,
        schemaProvider,
        i.parsers,
        i.expander,
        lifecycle,
      ),
    },
    specs: {
      repos: i.specs,
      approveSpec: new ApproveSpec(i.changes, i.actor, schemaProvider, i.hasher),
      approveSignoff: new ApproveSignoff(i.changes, i.actor, schemaProvider, i.hasher),
      list: new ListSpecs(listWorkspaces, i.hasher, i.yaml),
      search: new SearchSpecs(listWorkspaces, i.hasher, i.yaml),
      get: new GetSpec(i.specs),
      getOutline: new GetSpecOutline(i.specs, schemaProvider, i.parsers),
      saveMetadata,
      invalidateMetadata: new InvalidateSpecMetadata(i.specs),
      getActiveSchema,
      validateSchema: new ValidateSchema(i.schemas, config.schemaRef, buildSchema, resolveSchema),
      validate: new ValidateSpecs(i.specs, schemaProvider, i.parsers),
      generateMetadata,
      updateMetadata: updateSpecMetadata,
      getContext: new GetSpecContext(listWorkspaces, i.hasher),
    },
    project: {
      init: new InitProject(i.configWriter),
      addPlugin: new AddPlugin(i.configWriter),
      removePlugin: new RemovePlugin(i.configWriter),
      listWorkspaces,
      getProjectContext: new GetProjectContext(
        listWorkspaces,
        schemaProvider,
        i.files,
        i.parsers,
        i.hasher,
        i.registry.extractorTransforms,
        workspaceRoutes,
        defaultCompileContextConfig,
      ),
      getConfig: new GetConfig(config),
      getMetadata: getProjectMetadata,
      updateMetadata: updateProjectMetadata,
    },
  }
}
