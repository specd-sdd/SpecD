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
import { SkipArtifact } from '../application/use-cases/skip-artifact.js'
import { ListSpecs } from '../application/use-cases/list-specs.js'
import { GetSpec } from '../application/use-cases/get-spec.js'
import { SaveSpecMetadata } from '../application/use-cases/save-spec-metadata.js'
import { InvalidateSpecMetadata } from '../application/use-cases/invalidate-spec-metadata.js'
import { GetActiveSchema } from '../application/use-cases/get-active-schema.js'
import { InitProject } from '../application/use-cases/init-project.js'
import { RecordSkillInstall } from '../application/use-cases/record-skill-install.js'
import { GetSkillsManifest } from '../application/use-cases/get-skills-manifest.js'
import { GetProjectContext } from '../application/use-cases/get-project-context.js'
import { ValidateSpecs } from '../application/use-cases/validate-specs.js'
import { InferSpecSections } from '../application/use-cases/infer-spec-sections.js'
import { GetSpecContext } from '../application/use-cases/get-spec-context.js'
import { type ChangeRepository } from '../application/ports/change-repository.js'
import { type SpecRepository } from '../application/ports/spec-repository.js'
import { type SpecdConfig } from '../application/specd-config.js'
import { parseSpecId } from '../domain/services/parse-spec-id.js'
import { createKernelInternals } from './kernel-internals.js'

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
    /** Lists all archived changes. */
    listArchived: ListArchived
    /** Retrieves a single archived change by name. */
    getArchived: GetArchivedChange
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
    /** Writes a `.specd-metadata.yaml` file for a spec. */
    saveMetadata: SaveSpecMetadata
    /** Invalidates a spec's metadata by removing its contentHashes. */
    invalidateMetadata: InvalidateSpecMetadata
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
 * Shared adapter instances (repositories, git adapter, hook runner, etc.) are
 * built once via {@link createKernelInternals} and reused across all use cases,
 * avoiding redundant construction of identical adapters.
 *
 * @param config - The fully-resolved project configuration from `ConfigLoader`
 * @param options - Optional kernel construction options
 * @returns A fully-wired kernel with all use cases
 */
export function createKernel(config: SpecdConfig, options?: KernelOptions): Kernel {
  const i = createKernelInternals(config, options)

  return {
    changes: {
      repo: i.changes,
      create: new CreateChange(i.changes, i.git),
      status: new GetStatus(i.changes),
      transition: new TransitionChange(i.changes, i.git),
      draft: new DraftChange(i.changes, i.git),
      restore: new RestoreChange(i.changes, i.git),
      discard: new DiscardChange(i.changes, i.git),
      archive: new ArchiveChange(
        i.changes,
        i.specs,
        i.archive,
        i.hooks,
        i.git,
        i.parsers,
        i.schemas,
      ),
      validate: new ValidateArtifacts(i.changes, i.specs, i.schemas, i.parsers, i.git, i.hasher),
      compile: new CompileContext(i.changes, i.specs, i.schemas, i.files, i.parsers, i.hasher),
      list: new ListChanges(i.changes),
      listDrafts: new ListDrafts(i.changes),
      listDiscarded: new ListDiscarded(i.changes),
      edit: new EditChange(i.changes, i.git, (specIds) => {
        const workspaces = new Set<string>()
        for (const specId of specIds) workspaces.add(parseSpecId(specId).workspace)
        return [...workspaces]
      }),
      skipArtifact: new SkipArtifact(i.changes, i.git),
      listArchived: new ListArchived(i.archive),
      getArchived: new GetArchivedChange(i.archive),
    },
    specs: {
      repos: i.specs,
      approveSpec: new ApproveSpec(i.changes, i.git, i.schemas, i.hasher),
      approveSignoff: new ApproveSignoff(i.changes, i.git, i.schemas, i.hasher),
      list: new ListSpecs(i.specs, i.hasher, i.yaml),
      get: new GetSpec(i.specs),
      saveMetadata: new SaveSpecMetadata(i.specs, i.yaml),
      invalidateMetadata: new InvalidateSpecMetadata(i.specs, i.yaml),
      getActiveSchema: new GetActiveSchema(i.schemas),
      validate: new ValidateSpecs(i.specs, i.schemas, i.parsers),
      inferSections: new InferSpecSections(i.schemas, i.parsers),
      getContext: new GetSpecContext(i.specs, i.hasher),
    },
    project: {
      init: new InitProject(i.configWriter),
      recordSkillInstall: new RecordSkillInstall(i.configWriter),
      getSkillsManifest: new GetSkillsManifest(i.configWriter),
      getProjectContext: new GetProjectContext(i.specs, i.schemas, i.files, i.parsers, i.hasher),
    },
  }
}
