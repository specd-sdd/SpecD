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

/**
 * All use cases instantiated from a single `SpecdConfig`, grouped by domain area.
 *
 * Delivery mechanisms (`@specd/cli`, `@specd/mcp`) receive a `Kernel` from
 * `createKernel()` and invoke individual use cases via `kernel.changes.*` or
 * `kernel.specs.*`. Runtime inputs (e.g. `schemaRef`, `workspaceSchemasPaths`)
 * are still passed at `execute()` time.
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
  }
  /** Use cases that operate on approval gates. */
  specs: {
    /** Records a spec approval and transitions to `spec-approved`. */
    approveSpec: ApproveSpec
    /** Records a sign-off and transitions to `signed-off`. */
    approveSignoff: ApproveSignoff
  }
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
 * @returns A fully-wired kernel with all use cases
 */
export function createKernel(config: SpecdConfig): Kernel {
  return {
    changes: {
      create: createCreateChange(config),
      status: createGetStatus(config),
      transition: createTransitionChange(config),
      draft: createDraftChange(config),
      restore: createRestoreChange(config),
      discard: createDiscardChange(config),
      archive: createArchiveChange(config),
      validate: createValidateArtifacts(config),
      compile: createCompileContext(config),
    },
    specs: {
      approveSpec: createApproveSpec(config),
      approveSignoff: createApproveSignoff(config),
    },
  }
}
