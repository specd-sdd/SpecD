import { parseSpecId } from '../services/parse-spec-id.js'
import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** One read-only spec blocked by workspace ownership. */
export interface ReadOnlySpecDetail {
  /** Spec id from the change. */
  readonly specId: string
  /** Workspace name when parseable from the spec id. */
  readonly workspace: string
}

/** Facts for `workspace.readOnly`. */
export interface WorkspaceReadOnlyFacts {
  readonly ownershipBySpecId: ReadonlyMap<string, 'owned' | 'shared' | 'readOnly'>
}

/**
 * Shared `workspace.readOnly` runner (enter-ready and archive via registry bindings).
 *
 * @param facts - Ownership by spec id
 * @returns Check result
 */
export function runWorkspaceReadOnly(facts: WorkspaceReadOnlyFacts): CheckResult {
  const specs: ReadOnlySpecDetail[] = []
  for (const [specId, ownership] of facts.ownershipBySpecId) {
    if (ownership === 'readOnly') {
      let workspace: string
      try {
        workspace = parseSpecId(specId).workspace
      } catch {
        workspace = '(unknown)'
      }
      specs.push({ specId, workspace })
    }
  }
  if (specs.length === 0) {
    return pass('workspace.readOnly')
  }
  const summary = specs
    .map((s) =>
      s.workspace === '(unknown)' ? s.specId : `${s.specId} (workspace '${s.workspace}')`,
    )
    .join(', ')
  return fail(
    'workspace.readOnly',
    'READ_ONLY_WORKSPACE',
    `Change contains specs from readOnly workspaces: ${summary}`,
    { specs, specIds: specs.map((s) => s.specId) },
  )
}

/**
 * Predicate body.
 *
 * @param facts - Ownership by spec id
 * @returns Check result
 */
export function run(facts: WorkspaceReadOnlyFacts): CheckResult {
  return runWorkspaceReadOnly(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  void ctx
  return Promise.resolve(pass('workspace.readOnly'))
}

/** Reusable `workspace.readOnly` check. */
export const workspaceReadOnly: Check = {
  id: 'workspace.readOnly',
  label: CHECK_LABELS['workspace.readOnly'],
  kind: 'predicate',
  execute,
}
