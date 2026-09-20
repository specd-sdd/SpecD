import { type Change } from '../entities/change.js'
import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/**
 * `archive.archivable` via `change.assertArchivable()`. Operation `archive` is
 * a registry binding so the same runner can be reused later.
 *
 * @param change - Change being evaluated
 * @returns Check result
 */
export function runArchiveArchivable(change: Change): CheckResult {
  try {
    change.assertArchivable()
    return pass('archive.archivable')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Change is not archivable'
    return fail('archive.archivable', 'INVALID_TRANSITION', message)
  }
}

/**
 * Predicate body.
 *
 * @param change - Change being evaluated
 * @returns Check result
 */
export function run(change: Change): CheckResult {
  return runArchiveArchivable(change)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(run(ctx.change))
}

/** Reusable `archive.archivable` check. */
export const archiveArchivable: Check = {
  id: 'archive.archivable',
  label: CHECK_LABELS['archive.archivable'],
  kind: 'predicate',
  execute,
}
