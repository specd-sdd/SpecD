import { protocolEdge } from '../checks/protocol-edge.js'
import { workflowRequires } from '../checks/workflow-requires.js'
import { workflowTaskCompletion } from '../checks/workflow-task-completion.js'
import { workflowTasksEmpty } from '../checks/workflow-tasks-empty.js'
import { depsConsistent } from '../checks/deps-consistent.js'
import { workspaceReadOnly } from '../checks/workspace-read-only.js'
import { implFilesResolved } from '../checks/impl-files-resolved.js'
import { implLinksInScope } from '../checks/impl-links-in-scope.js'
import { approvalSpec } from '../checks/approval-spec.js'
import { approvalSignoff } from '../checks/approval-signoff.js'
import { schemaNameMatch } from '../checks/schema-name-match.js'
import { archiveArchivable } from '../checks/archive-archivable.js'
import { specOverlap } from '../checks/spec-overlap.js'
import { hookPre } from '../checks/hook-pre.js'
import { hookPost } from '../checks/hook-post.js'
import { verificationCurrent } from '../checks/verification-current.js'
import { type ChangeState } from '../value-objects/change-state.js'
import {
  applyBindingSpecs,
  type Check,
  type CheckBinding,
  type CheckBindingSpec,
} from './transition-checks.js'

/**
 * Transition applicability in registry order. Application `create*` instances
 * are attached by {@link applyBindingSpecs}.
 */
export const TRANSITION_BINDING_SPECS: readonly CheckBindingSpec[] = [
  {
    id: 'protocol.edge',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
    skippable: false,
  },
  {
    id: 'workflow.requires',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
    exceptAlong: ['recovery'],
    skippable: false,
  },
  {
    id: 'workflow.taskCompletion',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
    exceptAlong: ['recovery'],
    skippable: false,
  },
  {
    id: 'workflow.tasksEmpty',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'step-skip', step: 'implementing' }],
    skippable: false,
  },
  {
    id: 'deps.consistent',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'transition', from: '*', to: 'ready', along: 'any' }],
    skippable: false,
  },
  {
    id: 'workspace.readOnly',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'transition', from: '*', to: 'ready', along: 'any' }],
    skippable: false,
  },
  {
    id: 'impl.filesResolved',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [
      { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
      { scope: 'transition', from: '*', to: 'verifying', along: '*' },
      { scope: 'operation', operation: 'verification-start' },
      { scope: 'step-skip', step: 'implementing' },
    ],
    skippable: false,
  },
  {
    id: 'impl.linksInScope',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [
      { scope: 'transition', from: 'implementing', to: '*', along: 'forward' },
      { scope: 'transition', from: '*', to: 'verifying', along: '*' },
      { scope: 'operation', operation: 'verification-start' },
      { scope: 'step-skip', step: 'implementing' },
    ],
    skippable: true,
  },
  {
    id: 'approval.spec',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: 'ready', to: '*', along: 'forward' }],
    reportSkipWhenUnmatched: true,
    skippable: false,
  },
  {
    id: 'approval.signoff',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: 'done', to: 'archivable', along: 'forward' }],
    reportSkipWhenUnmatched: true,
    skippable: false,
  },
  {
    id: 'verification.current',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: 'verifying', to: 'done', along: 'forward' }],
    reportSkipWhenUnmatched: true,
    skippable: false,
  },
  {
    id: 'hook.post',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: 'forward' }],
    phase: 'before-persist',
    onFailure: 'abort',
  },
  {
    id: 'hook.pre',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    exceptAlong: ['recovery'],
    phase: 'before-persist',
    onFailure: 'abort',
  },
]

/**
 * Archive applicability in registry order. Publication is not a check.
 */
export const ARCHIVE_BINDING_SPECS: readonly CheckBindingSpec[] = [
  {
    id: 'schema.nameMatch',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'archive.archivable',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'spec.overlap',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'archive' }],
    skippable: true,
  },
  {
    id: 'workspace.readOnly',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'deps.consistent',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'impl.filesResolved',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'impl.linksInScope',
    allowBindingOverride: true,
    allowConfigOverride: true,
    allowDisable: true,
    applicability: [{ scope: 'archive' }],
    skippable: true,
  },
  {
    id: 'workflow.taskCompletion',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'verification.current',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    skippable: false,
  },
  {
    id: 'hook.pre',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    phase: 'before-persist',
    onFailure: 'abort',
  },
  {
    id: 'hook.post',
    allowBindingOverride: false,
    allowDisable: false,
    applicability: [{ scope: 'archive' }],
    phase: 'after-persist',
    onFailure: 'collect',
  },
]

/** Domain check instances for matcher tests (no application I/O). */
export const DOMAIN_CHECKS: Readonly<Record<string, Check>> = {
  'protocol.edge': protocolEdge,
  'workflow.requires': workflowRequires,
  'workflow.taskCompletion': workflowTaskCompletion,
  'workflow.tasksEmpty': workflowTasksEmpty,
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
  'verification.current': verificationCurrent,
}

/**
 * Domain-materialized transition bindings (test / matcher fixtures).
 * Use cases MUST compose {@link TRANSITION_BINDING_SPECS} with application `create*`.
 */
export const TRANSITION_BINDINGS: readonly CheckBinding[] = applyBindingSpecs(
  TRANSITION_BINDING_SPECS,
  DOMAIN_CHECKS,
)

/**
 * Domain-materialized archive bindings (test / matcher fixtures).
 */
export const ARCHIVE_BINDINGS: readonly CheckBinding[] = applyBindingSpecs(
  ARCHIVE_BINDING_SPECS,
  DOMAIN_CHECKS,
)

/**
 * Unique concrete states on transition bindings for one check.
 *
 * @param checkId - Check whose transition bindings to read
 * @param field - `from` or `to` side of the binding
 * @returns Distinct states (wildcards omitted)
 */
function boundStates(checkId: string, field: 'from' | 'to'): readonly ChangeState[] {
  const states: ChangeState[] = []
  for (const spec of TRANSITION_BINDING_SPECS) {
    if (spec.id !== checkId) {
      continue
    }
    for (const row of spec.applicability) {
      if (row.scope !== 'transition') {
        continue
      }
      const value = row[field]
      if (value === '*') {
        continue
      }
      if (!states.includes(value)) {
        states.push(value)
      }
    }
  }
  return states
}

/**
 * Unique concrete `from` states the binding table lists for a check.
 * ApproveSpec / ApproveSignoff use this instead of hardcoding `ready` / `done`.
 *
 * @param checkId - Check whose transition bindings to read
 * @returns Distinct `from` states (wildcards omitted)
 */
export function boundFromStates(checkId: string): readonly ChangeState[] {
  return boundStates(checkId, 'from')
}

/**
 * Unique concrete `to` states the binding table lists for a check.
 *
 * @param checkId - Check whose transition bindings to read
 * @returns Distinct `to` states (wildcards omitted)
 */
export function boundToStates(checkId: string): readonly ChangeState[] {
  return boundStates(checkId, 'to')
}
