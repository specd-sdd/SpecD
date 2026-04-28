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
import { ListArchived } from '../application/use-cases/list-archived.js'
import { GetArchivedChange } from '../application/use-cases/get-archived-change.js'
import { EditChange } from '../application/use-cases/edit-change.js'
import { UpdateSpecDeps } from '../application/use-cases/update-spec-deps.js'
import { SkipArtifact } from '../application/use-cases/skip-artifact.js'
import { ListSpecs } from '../application/use-cases/list-specs.js'
import { GetSpec } from '../application/use-cases/get-spec.js'
import { SaveSpecMetadata } from '../application/use-cases/save-spec-metadata.js'
import { InvalidateSpecMetadata } from '../application/use-cases/invalidate-spec-metadata.js'
import { GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { ResolveSchema } from '../application/use-cases/resolve-schema.js'
import { InitProject } from '../application/use-cases/init-project.js'
import { AddPlugin } from '../application/use-cases/add-plugin.js'
import { RemovePlugin } from '../application/use-cases/remove-plugin.js'
import { ListPlugins } from '../application/use-cases/list-plugins.js'
import { GetProjectContext } from '../application/use-cases/get-project-context.js'
import { ValidateSpecs } from '../application/use-cases/validate-specs.js'
import { GetSpecContext } from '../application/use-cases/get-spec-context.js'
import { GenerateSpecMetadata } from '../application/use-cases/generate-spec-metadata.js'
import { RunStepHooks } from '../application/use-cases/run-step-hooks.js'
import { GetHookInstructions } from '../application/use-cases/get-hook-instructions.js'
import { GetArtifactInstruction } from '../application/use-cases/get-artifact-instruction.js'
import { ValidateSchema } from '../application/use-cases/validate-schema.js'
import { DetectOverlap } from '../application/use-cases/detect-overlap.js'
import { PreviewSpec } from '../application/use-cases/preview-spec.js'
import { buildSchema } from '../domain/services/build-schema.js'
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
import { createDefaultLogger } from '../infrastructure/logging/pino-logger.js'

/**
 * All use cases instantiated from a single `SpecdConfig`, grouped by domain area.
 *
 * Delivery mechanisms (`@specd/cli`, `@specd/mcp`) receive a `Kernel` from
 * `createKernel()` and invoke individual use cases via `kernel.changes.*`,
 * `kernel.specs.*`, or `kernel.project.*`. Config-derived inputs (e.g.
 * `schemaRef`, `schemaRepositories`) are injected at construction time.
 */
export interface Kernel {
  /** Final merged registry view exposed to consumers and builders. */
  registry: KernelRegistryView
  /** The schema registry for resolving arbitrary schema references. */
  schemas: SchemaRegistry
  /** Use cases that operate on changes. */
  changes: {
    /** The change repository — exposes existence checks for artifacts and deltas. */
    repo: ChangeRepository
    /** Creates a new change. */
    create: CreateChange
    /** Reports the current lifecycle state and artifact statuses. */
    status: GetStatus
    /** Performs a lifecycle state transition with approval-gate routing. */
    transition: TransitionChange
    /** Shelves a change to `drafts/`. */
    draft: DraftChange
    /** Recovers a drafted change back to `changes/`. */
    restore: RestoreChange
    /** Permanently abandons a change. */
    discard: DiscardChange
    /** Finalises a change: merges deltas, moves to archive, fires hooks. */
    archive: ArchiveChange
    /** Validates artifact files against the active schema. */
    validate: ValidateArtifacts
    /** Assembles the instruction block for the current lifecycle step. */
    compile: CompileContext
    /** Lists all active (non-drafted, non-discarded) changes. */
    list: ListChanges
    /** Lists all drafted (shelved) changes. */
    listDrafts: ListDrafts
    /** Lists all discarded changes. */
    listDiscarded: ListDiscarded
    /** Edits the spec scope of an existing change. */
    edit: EditChange
    /** Explicitly skips an optional artifact on a change. */
    skipArtifact: SkipArtifact
    /** Updates declared dependencies for a spec within a change. */
    updateSpecDeps: UpdateSpecDeps
    /** Lists all archived changes. */
    listArchived: ListArchived
    /** Retrieves a single archived change by name. */
    getArchived: GetArchivedChange
    /** Executes `run:` hooks for a workflow step and phase. */
    runStepHooks: RunStepHooks
    /** Returns `instruction:` hook text for a workflow step and phase. */
    getHookInstructions: GetHookInstructions
    /** Returns artifact-specific instructions, rules, and delta guidance. */
    getArtifactInstruction: GetArtifactInstruction
    /** Detects specs targeted by multiple active changes. */
    detectOverlap: DetectOverlap
    /** Previews a spec with deltas applied from a change. */
    preview: PreviewSpec
  }
  /** Use cases that operate on specs and approval gates. */
  specs: {
    /** Spec repositories keyed by workspace name — exposes path resolution. */
    repos: ReadonlyMap<string, SpecRepository>
    /** Records a spec approval and transitions to `spec-approved`. */
    approveSpec: ApproveSpec
    /** Records a sign-off and transitions to `signed-off`. */
    approveSignoff: ApproveSignoff
    /** Lists all specs across all configured workspaces. */
    list: ListSpecs
    /** Loads a spec and all of its artifact files. */
    get: GetSpec
    /** Writes metadata for a spec. */
    saveMetadata: SaveSpecMetadata
    /** Invalidates a spec's metadata by removing its contentHashes. */
    invalidateMetadata: InvalidateSpecMetadata
    /** Resolves and returns the active schema for the project. */
    getActiveSchema: GetActiveSchema
    /** Validates a schema (project resolved, project raw, or external file). */
    validateSchema: ValidateSchema
    /** Validates spec artifacts against the active schema's structural rules. */
    validate: ValidateSpecs
    /** Generates deterministic metadata from schema-declared extraction rules. */
    generateMetadata: GenerateSpecMetadata
    /** Builds structured context entries for a spec with optional dependency traversal. */
    getContext: GetSpecContext
  }
  /** Use cases that operate on the project configuration. */
  project: {
    /** Initialises a new specd project. */
    init: InitProject
    /** Adds or updates one plugin declaration in `specd.yaml`. */
    addPlugin: AddPlugin
    /** Removes one plugin declaration from `specd.yaml`. */
    removePlugin: RemovePlugin
    /** Lists declared plugins from `specd.yaml`. */
    listPlugins: ListPlugins
    /** Compiles the project-level context block without a specific change or step. */
    getProjectContext: GetProjectContext
  }
}

/** Options for {@link createKernel}. */
export interface KernelOptions extends KernelRegistryInput {
  /**
   * Additional `node_modules` directories appended to the schema search path,
   * after the project's own `node_modules`. Pass the CLI installation's
   * `node_modules` here so that globally-installed schema packages are found
   * even when the project has no local copy.
   */
  readonly extraNodeModulesPaths?: readonly string[]
  /** Selected graph-store backend id for code-graph composition. */
  readonly graphStoreId?: string
  /** Additional logging destinations registered by delivery adapters (for example CLI). */
  readonly additionalDestinations?: readonly LogDestination[]
}

/**
 * Constructs all use cases from the fully-resolved project configuration and
 * returns them grouped into a {@link Kernel}.
 *
 * Shared adapter instances (repositories, git adapter, hook runner, etc.) are
 * built once via {@link createKernelInternals} and reused across all use cases,
 * avoiding redundant construction of identical adapters.
 *
 * @param config - The fully-resolved project configuration from `ConfigLoader`
 * @param options - Optional kernel construction options
 * @returns A fully-wired kernel with all use cases
 */
export async function createKernel(config: SpecdConfig, options?: KernelOptions): Promise<Kernel> {
  const registry = createKernelRegistryView(createBuiltinKernelRegistry(), options)
  if (options?.graphStoreId !== undefined && !registry.graphStores.has(options.graphStoreId)) {
    throw new Error(`graph store '${options.graphStoreId}' is not registered`)
  }
  const i = await createKernelInternals(config, registry, options)
  const workspaceRoutes = createSpecWorkspaceRoutes(config.workspaces)

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

  // Shared ResolveSchema + LazySchemaProvider — resolves once with plugins and overrides
  const resolveSchema = new ResolveSchema(
    i.schemas,
    i.schemaRef,
    i.schemaPlugins,
    i.schemaOverrides,
  )
  const schemaProvider = new LazySchemaProvider(resolveSchema)

  // Shared RunStepHooks instance — used by TransitionChange, ArchiveChange, and exposed directly
  const runStepHooks = new RunStepHooks(
    i.changes,
    i.archive,
    i.hooks,
    i.registry.externalHookRunners,
    schemaProvider,
  )

  // PreviewSpec — used by CompileContext and exposed as changes.preview
  const previewSpec = new PreviewSpec(i.changes, i.specs, schemaProvider, i.parsers)

  return {
    registry,
    schemas: i.schemas,
    changes: {
      repo: i.changes,
      create: new CreateChange(i.changes, i.specs, i.actor),
      status: new GetStatus(i.changes, schemaProvider, {
        spec: config.approvals.spec,
        signoff: config.approvals.signoff,
      }),
      transition: new TransitionChange(i.changes, i.actor, schemaProvider, runStepHooks),
      draft: new DraftChange(i.changes, i.actor),
      restore: new RestoreChange(i.changes, i.actor),
      discard: new DiscardChange(i.changes, i.actor),
      archive: new ArchiveChange(
        i.changes,
        i.specs,
        i.archive,
        runStepHooks,
        i.actor,
        i.parsers,
        schemaProvider,
        new GenerateSpecMetadata(
          i.specs,
          schemaProvider,
          i.parsers,
          i.hasher,
          i.registry.extractorTransforms,
          workspaceRoutes,
        ),
        new SaveSpecMetadata(i.specs),
      ),
      validate: new ValidateArtifacts(
        i.changes,
        i.specs,
        schemaProvider,
        i.parsers,
        i.actor,
        i.hasher,
        i.registry.extractorTransforms,
        workspaceRoutes,
      ),
      compile: new CompileContext(
        i.changes,
        i.specs,
        schemaProvider,
        i.files,
        i.parsers,
        i.hasher,
        previewSpec,
        i.registry.extractorTransforms,
        workspaceRoutes,
      ),
      list: new ListChanges(i.changes),
      listDrafts: new ListDrafts(i.changes),
      listDiscarded: new ListDiscarded(i.changes),
      edit: new EditChange(i.changes, i.specs, i.actor),
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
      detectOverlap: new DetectOverlap(i.changes),
      preview: previewSpec,
      getArtifactInstruction: new GetArtifactInstruction(
        i.changes,
        i.specs,
        schemaProvider,
        i.parsers,
        i.expander,
      ),
    },
    specs: {
      repos: i.specs,
      approveSpec: new ApproveSpec(i.changes, i.actor, schemaProvider, i.hasher),
      approveSignoff: new ApproveSignoff(i.changes, i.actor, schemaProvider, i.hasher),
      list: new ListSpecs(i.specs, i.hasher, i.yaml),
      get: new GetSpec(i.specs),
      saveMetadata: new SaveSpecMetadata(i.specs),
      invalidateMetadata: new InvalidateSpecMetadata(i.specs),
      getActiveSchema: new GetActiveSchema(resolveSchema, i.schemas, buildSchema, i.schemaRef),
      validateSchema: new ValidateSchema(i.schemas, i.schemaRef, buildSchema, resolveSchema),
      validate: new ValidateSpecs(i.specs, schemaProvider, i.parsers),
      generateMetadata: new GenerateSpecMetadata(
        i.specs,
        schemaProvider,
        i.parsers,
        i.hasher,
        i.registry.extractorTransforms,
        workspaceRoutes,
      ),
      getContext: new GetSpecContext(i.specs, i.hasher),
    },
    project: {
      init: new InitProject(i.configWriter),
      addPlugin: new AddPlugin(i.configWriter),
      removePlugin: new RemovePlugin(i.configWriter),
      listPlugins: new ListPlugins(i.configWriter),
      getProjectContext: new GetProjectContext(
        i.specs,
        schemaProvider,
        i.files,
        i.parsers,
        i.hasher,
        i.registry.extractorTransforms,
        workspaceRoutes,
      ),
    },
  }
}
import fs from 'node:fs/promises'
import path from 'node:path'
