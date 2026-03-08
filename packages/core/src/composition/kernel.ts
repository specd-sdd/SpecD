import { type CreateChange } from '../application/use-cases/create-change.js'
import { type GetStatus } from '../application/use-cases/get-status.js'
import { type TransitionChange } from '../application/use-cases/transition-change.js'
import { type DraftChange } from '../application/use-cases/draft-change.js'
import { type RestoreChange } from '../application/use-cases/restore-change.js'
import { type DiscardChange } from '../application/use-cases/discard-change.js'
import { type ArchiveChange } from '../application/use-cases/archive-change.js'
import { type ValidateArtifacts } from '../application/use-cases/validate-artifacts.js'
import { type CompileContext } from '../application/use-cases/compile-context.js'
import { type ApproveSpec } from '../application/use-cases/approve-spec.js'
import { type ApproveSignoff } from '../application/use-cases/approve-signoff.js'
import { type ListChanges } from '../application/use-cases/list-changes.js'
import { type ListDrafts } from '../application/use-cases/list-drafts.js'
import { type ListDiscarded } from '../application/use-cases/list-discarded.js'
import { type ListArchived } from '../application/use-cases/list-archived.js'
import { type GetArchivedChange } from '../application/use-cases/get-archived-change.js'
import { type EditChange } from '../application/use-cases/edit-change.js'
import { type SkipArtifact } from '../application/use-cases/skip-artifact.js'
import { type ListSpecs } from '../application/use-cases/list-specs.js'
import { type GetSpec } from '../application/use-cases/get-spec.js'
import { type SaveSpecMetadata } from '../application/use-cases/save-spec-metadata.js'
import { type GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { type InitProject } from '../application/use-cases/init-project.js'
import { type RecordSkillInstall } from '../application/use-cases/record-skill-install.js'
import { type GetSkillsManifest } from '../application/use-cases/get-skills-manifest.js'
import { type GetProjectContext } from '../application/use-cases/get-project-context.js'
import { type ValidateSpecs } from '../application/use-cases/validate-specs.js'
import { type InferSpecSections } from '../application/use-cases/infer-spec-sections.js'
import { type GetSpecContext } from '../application/use-cases/get-spec-context.js'
import { type SpecdConfig } from '../application/specd-config.js'
import { createCreateChange } from './use-cases/create-change.js'
import { createGetStatus } from './use-cases/get-status.js'
import { createTransitionChange } from './use-cases/transition-change.js'
import { createDraftChange } from './use-cases/draft-change.js'
import { createRestoreChange } from './use-cases/restore-change.js'
import { createDiscardChange } from './use-cases/discard-change.js'
import { createArchiveChange } from './use-cases/archive-change.js'
import { createValidateArtifacts } from './use-cases/validate-artifacts.js'
import { createCompileContext } from './use-cases/compile-context.js'
import { createApproveSpec } from './use-cases/approve-spec.js'
import { createApproveSignoff } from './use-cases/approve-signoff.js'
import { createListChanges } from './use-cases/list-changes.js'
import { createListDrafts } from './use-cases/list-drafts.js'
import { createListDiscarded } from './use-cases/list-discarded.js'
import { createListArchived } from './use-cases/list-archived.js'
import { createGetArchivedChange } from './use-cases/get-archived-change.js'
import { createEditChange } from './use-cases/edit-change.js'
import { createSkipArtifact } from './use-cases/skip-artifact.js'
import { createListSpecs } from './use-cases/list-specs.js'
import { createGetSpec } from './use-cases/get-spec.js'
import { createSaveSpecMetadata } from './use-cases/save-spec-metadata.js'
import { createGetActiveSchema } from './use-cases/get-active-schema.js'
import { createInitProject } from './use-cases/init-project.js'
import { createRecordSkillInstall } from './use-cases/record-skill-install.js'
import { createGetSkillsManifest } from './use-cases/get-skills-manifest.js'
import { createGetProjectContext } from './use-cases/get-project-context.js'
import { createValidateSpecs } from './use-cases/validate-specs.js'
import { createInferSpecSections } from './use-cases/infer-spec-sections.js'
import { createGetSpecContext } from './use-cases/get-spec-context.js'

/**
 * All use cases instantiated from a single `SpecdConfig`, grouped by domain area.
 *
 * Delivery mechanisms (`@specd/cli`, `@specd/mcp`) receive a `Kernel` from
 * `createKernel()` and invoke individual use cases via `kernel.changes.*`,
 * `kernel.specs.*`, or `kernel.project.*`. Runtime inputs (e.g. `schemaRef`,
 * `workspaceSchemasPaths`) are still passed at `execute()` time.
 */
export interface Kernel {
  /** Use cases that operate on changes. */
  changes: {
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
    /** Lists all archived changes. */
    listArchived: ListArchived
    /** Retrieves a single archived change by name. */
    getArchived: GetArchivedChange
  }
  /** Use cases that operate on specs and approval gates. */
  specs: {
    /** Records a spec approval and transitions to `spec-approved`. */
    approveSpec: ApproveSpec
    /** Records a sign-off and transitions to `signed-off`. */
    approveSignoff: ApproveSignoff
    /** Lists all specs across all configured workspaces. */
    list: ListSpecs
    /** Loads a spec and all of its artifact files. */
    get: GetSpec
    /** Writes a `.specd-metadata.yaml` file for a spec. */
    saveMetadata: SaveSpecMetadata
    /** Resolves and returns the active schema for the project. */
    getActiveSchema: GetActiveSchema
    /** Validates spec artifacts against the active schema's structural rules. */
    validate: ValidateSpecs
    /** Infers semantic sections (rules, constraints, scenarios) from spec artifacts. */
    inferSections: InferSpecSections
    /** Builds structured context entries for a spec with optional dependency traversal. */
    getContext: GetSpecContext
  }
  /** Use cases that operate on the project configuration. */
  project: {
    /** Initialises a new specd project. */
    init: InitProject
    /** Records that a skill set was installed for an agent. */
    recordSkillInstall: RecordSkillInstall
    /** Reads the installed skills manifest from `specd.yaml`. */
    getSkillsManifest: GetSkillsManifest
    /** Compiles the project-level context block without a specific change or step. */
    getProjectContext: GetProjectContext
  }
}

/** Options for {@link createKernel}. */
export interface KernelOptions {
  /**
   * Additional `node_modules` directories appended to the schema search path,
   * after the project's own `node_modules`. Pass the CLI installation's
   * `node_modules` here so that globally-installed schema packages are found
   * even when the project has no local copy.
   */
  readonly extraNodeModulesPaths?: readonly string[]
}

/**
 * Constructs all use cases from the fully-resolved project configuration and
 * returns them grouped into a {@link Kernel}.
 *
 * All internal ports (repositories, git adapter, hook runner, file reader,
 * schema registry, parser registry) are constructed internally. The delivery
 * mechanism receives a ready-to-use kernel and never imports concrete adapter
 * classes or use case constructors directly.
 *
 * @param config - The fully-resolved project configuration from `ConfigLoader`
 * @param options - Optional kernel construction options
 * @returns A fully-wired kernel with all use cases
 */
export function createKernel(config: SpecdConfig, options?: KernelOptions): Kernel {
  const schemaOpts = { extraNodeModulesPaths: options?.extraNodeModulesPaths ?? [] }
  return {
    changes: {
      create: createCreateChange(config),
      status: createGetStatus(config),
      transition: createTransitionChange(config),
      draft: createDraftChange(config),
      restore: createRestoreChange(config),
      discard: createDiscardChange(config),
      archive: createArchiveChange(config, schemaOpts),
      validate: createValidateArtifacts(config, schemaOpts),
      compile: createCompileContext(config, schemaOpts),
      list: createListChanges(config),
      listDrafts: createListDrafts(config),
      listDiscarded: createListDiscarded(config),
      edit: createEditChange(config),
      skipArtifact: createSkipArtifact(config),
      listArchived: createListArchived(config),
      getArchived: createGetArchivedChange(config),
    },
    specs: {
      approveSpec: createApproveSpec(config),
      approveSignoff: createApproveSignoff(config),
      list: createListSpecs(config),
      get: createGetSpec(config),
      saveMetadata: createSaveSpecMetadata(config),
      getActiveSchema: createGetActiveSchema(config, schemaOpts),
      validate: createValidateSpecs(config, schemaOpts),
      inferSections: createInferSpecSections(config, schemaOpts),
      getContext: createGetSpecContext(config),
    },
    project: {
      init: createInitProject(),
      recordSkillInstall: createRecordSkillInstall(),
      getSkillsManifest: createGetSkillsManifest(),
      getProjectContext: createGetProjectContext(config, schemaOpts),
    },
  }
}
