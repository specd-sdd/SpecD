import {
  applyBindingSpecs,
  type Check,
  type CheckBinding,
  type CheckId,
} from '../../domain/services/transition-checks.js'
import {
  ARCHIVE_BINDING_SPECS,
  TRANSITION_BINDING_SPECS,
} from '../../domain/services/check-bindings.js'
import { type Change } from '../../domain/entities/change.js'
import { type CountTasks } from '../use-cases/count-tasks.js'
import { type RunStepHooks } from '../use-cases/run-step-hooks.js'
import { type ReadyPredicateFactsDeps } from '../services/ready-predicate-facts.js'
import { type ImplLinksInScopeDetection } from '../services/detect-impl-links-in-scope.js'
import { createApprovalSignoff } from './approval-signoff.js'
import { createApprovalSpec } from './approval-spec.js'
import { createArchiveArchivable } from './archive-archivable.js'
import { createDepsConsistent } from './deps-consistent.js'
import { createHookPost } from './hook-post.js'
import { createHookPre } from './hook-pre.js'
import { createImplFilesResolved } from './impl-files-resolved.js'
import { createImplLinksInScope } from './impl-links-in-scope.js'
import { createProtocolEdge } from './protocol-edge.js'
import { createSchemaNameMatch } from './schema-name-match.js'
import { createSpecOverlap, type SpecOverlapDetection } from './spec-overlap.js'
import { createWorkspaceReadOnly } from './workspace-read-only.js'
import { createWorkflowRequires } from './workflow-requires.js'
import { createWorkflowTaskCompletion } from './workflow-task-completion.js'

/**
 * Ports required to compose built-in workflow checks.
 */
export interface CreateWorkflowCheckRegistryDeps {
  /** Task-completion query. */
  readonly countTasks: CountTasks
  /** Hook runner. */
  readonly runStepHooks: RunStepHooks
  /** Extract / workspace ports for deps + readOnly. */
  readonly readyFacts: ReadyPredicateFactsDeps
  /** Out-of-scope implementation-link detector. */
  readonly detectImplLinksInScope: (change: Change) => ImplLinksInScopeDetection
  /**
   * Peer overlap detector for archive `spec.overlap`. When omitted, overlap never
   * blocks. GetStatus still only *executes* archive predicates in `archivable`;
   * other states treat overlap invalidation as review, not `OVERLAP_CONFLICT`.
   */
  readonly detectSpecOverlap?: (
    change: Change,
  ) => SpecOverlapDetection | Promise<SpecOverlapDetection>
}

/**
 * Built-in check instances plus binding tables for lifecycle use cases.
 */
export interface WorkflowCheckRegistry {
  /** Transition bindings in registry order. */
  readonly transitionBindings: readonly CheckBinding[]
  /** Archive bindings in registry order. */
  readonly archiveBindings: readonly CheckBinding[]
}

/**
 * Composes built-in checks (`create*`) onto the single domain binding-spec table.
 *
 * @param deps - Ports for I/O-backed checks
 * @returns Registry for GetStatus / TransitionChange / ArchiveChange
 */
export function createWorkflowCheckRegistry(
  deps: CreateWorkflowCheckRegistryDeps,
): WorkflowCheckRegistry {
  const taskCompletion = createWorkflowTaskCompletion({ countTasks: deps.countTasks })
  const hookPre = createHookPre({ runStepHooks: deps.runStepHooks })
  const hookPost = createHookPost({ runStepHooks: deps.runStepHooks })
  const protocolEdge = createProtocolEdge()
  const workflowRequires = createWorkflowRequires()
  const depsConsistent = createDepsConsistent(deps.readyFacts)
  const workspaceReadOnly = createWorkspaceReadOnly(deps.readyFacts)
  const implFilesResolved = createImplFilesResolved()
  const implLinksInScope = createImplLinksInScope({
    detectImplLinksInScope: deps.detectImplLinksInScope,
  })
  const approvalSpec = createApprovalSpec()
  const approvalSignoff = createApprovalSignoff()
  const schemaNameMatch = createSchemaNameMatch()
  const archiveArchivable = createArchiveArchivable()
  const specOverlap = createSpecOverlap({
    detectSpecOverlap: deps.detectSpecOverlap ?? (() => ({ blocked: false })),
  })

  const checks: Readonly<Partial<Record<CheckId, Check>>> = {
    'protocol.edge': protocolEdge,
    'workflow.requires': workflowRequires,
    'workflow.taskCompletion': taskCompletion,
    'deps.consistent': depsConsistent,
    'workspace.readOnly': workspaceReadOnly,
    'impl.filesResolved': implFilesResolved,
    'impl.linksInScope': implLinksInScope,
    'approval.spec': approvalSpec,
    'approval.signoff': approvalSignoff,
    'schema.nameMatch': schemaNameMatch,
    'archive.archivable': archiveArchivable,
    'spec.overlap': specOverlap,
    'hook.pre': hookPre,
    'hook.post': hookPost,
  }

  return {
    transitionBindings: applyBindingSpecs(TRANSITION_BINDING_SPECS, checks),
    archiveBindings: applyBindingSpecs(ARCHIVE_BINDING_SPECS, checks),
  }
}
