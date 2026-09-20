import { protocolEdge } from '../checks/protocol-edge.js'
import { workflowRequires } from '../checks/workflow-requires.js'
import { workflowTaskCompletion } from '../checks/workflow-task-completion.js'
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
import { type ChangeState } from '../value-objects/change-state.js'
import {
  applyBindingSpecs,
  type Check,
  type CheckBinding,
  type CheckBindingSpec,
  type CheckId,
} from './transition-checks.js'

/**
 * Transition applicability in registry order. Application `create*` instances
 * are attached by {@link applyBindingSpecs}.
 */
export const TRANSITION_BINDING_SPECS: readonly CheckBindingSpec[] = [
  {
    id: 'protocol.edge',
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
  },
  {
    id: 'workflow.requires',
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
    exceptAlong: ['recovery'],
  },
  {
    id: 'workflow.taskCompletion',
    applicability: [{ scope: 'transition', from: '*', to: '*', along: '*' }],
    reportSkipWhenUnmatched: true,
    exceptAlong: ['recovery'],
  },
  {
    id: 'deps.consistent',
    applicability: [{ scope: 'transition', from: '*', to: 'ready', along: 'any' }],
  },
  {
    id: 'workspace.readOnly',
    applicability: [{ scope: 'transition', from: '*', to: 'ready', along: 'any' }],
  },
  {
    id: 'impl.filesResolved',
    applicability: [{ scope: 'transition', from: 'implementing', to: '*', along: 'forward' }],
  },
  {
    id: 'impl.linksInScope',
    applicability: [{ scope: 'transition', from: 'implementing', to: '*', along: 'forward' }],
  },
  {
    id: 'approval.spec',
    applicability: [{ scope: 'transition', from: 'ready', to: '*', along: 'forward' }],
    reportSkipWhenUnmatched: true,
  },
  {
    id: 'approval.signoff',
    applicability: [{ scope: 'transition', from: 'done', to: 'archivable', along: 'forward' }],
    reportSkipWhenUnmatched: true,
  },
  {
    id: 'hook.post',
    applicability: [{ scope: 'transition', from: '*', to: '*', along: 'forward' }],
    phase: 'before-persist',
    onFailure: 'abort',
  },
  {
    id: 'hook.pre',
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
  { id: 'schema.nameMatch', applicability: [{ scope: 'archive' }] },
  { id: 'archive.archivable', applicability: [{ scope: 'archive' }] },
  { id: 'spec.overlap', applicability: [{ scope: 'archive' }] },
  { id: 'workspace.readOnly', applicability: [{ scope: 'archive' }] },
  { id: 'deps.consistent', applicability: [{ scope: 'archive' }] },
  { id: 'impl.filesResolved', applicability: [{ scope: 'archive' }] },
  { id: 'impl.linksInScope', applicability: [{ scope: 'archive' }] },
  {
    id: 'hook.pre',
    applicability: [{ scope: 'archive' }],
    phase: 'before-persist',
    onFailure: 'abort',
  },
  {
    id: 'hook.post',
    applicability: [{ scope: 'archive' }],
    phase: 'after-persist',
    onFailure: 'collect',
  },
]

/** Domain check instances for matcher tests (no application I/O). */
const DOMAIN_CHECKS: Readonly<Partial<Record<CheckId, Check>>> = {
  'protocol.edge': protocolEdge,
  'workflow.requires': workflowRequires,
  'workflow.taskCompletion': workflowTaskCompletion,
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
function boundStates(checkId: CheckId, field: 'from' | 'to'): readonly ChangeState[] {
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
export function boundFromStates(checkId: CheckId): readonly ChangeState[] {
  return boundStates(checkId, 'from')
}

/**
 * Unique concrete `to` states the binding table lists for a check.
 *
 * @param checkId - Check whose transition bindings to read
 * @returns Distinct `to` states (wildcards omitted)
 */
export function boundToStates(checkId: CheckId): readonly ChangeState[] {
  return boundStates(checkId, 'to')
}
