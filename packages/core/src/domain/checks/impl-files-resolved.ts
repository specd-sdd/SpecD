import {
  CHECK_LABELS,
  fail,
  pass,
  type Check,
  type CheckExecutionContext,
  type CheckResult,
} from '../services/transition-checks.js'

/** Facts for `impl.filesResolved`. */
export interface ImplFilesResolvedFacts {
  readonly openTrackedImplementationFiles: readonly string[]
}

/**
 * Formats the human-readable open-files message for text status / repair / errors.
 *
 * @param files - Every open tracked path (also stored in `details.files`)
 * @returns Count plus at most three paths; labels `examples` when truncated
 */
function formatOpenTrackedFilesMessage(files: readonly string[]): string {
  const count = files.length
  const shown = files.slice(0, 3)
  const noun = count === 1 ? 'file' : 'files'
  if (count <= 3) {
    return `${String(count)} open tracked ${noun} remain open: ${shown.join(', ')}`
  }
  return `${String(count)} open tracked files remain open (examples: ${shown.join(', ')})`
}

/**
 * Shared `impl.filesResolved` runner (exit-implementing and archive via registry bindings).
 *
 * @param facts - Open tracked files
 * @returns Check result
 */
export function runImplFilesResolved(facts: ImplFilesResolvedFacts): CheckResult {
  if (facts.openTrackedImplementationFiles.length === 0) {
    return pass('impl.filesResolved')
  }
  return fail(
    'impl.filesResolved',
    'IMPLEMENTATION_STATE',
    formatOpenTrackedFilesMessage(facts.openTrackedImplementationFiles),
    { files: facts.openTrackedImplementationFiles },
  )
}

/**
 * Predicate body.
 *
 * @param facts - Open tracked files
 * @returns Check result
 */
export function run(facts: ImplFilesResolvedFacts): CheckResult {
  return runImplFilesResolved(facts)
}

/**
 * Domain stub execute. Application `create*` owns I/O.
 *
 * @param ctx - Host attempt context
 * @returns Check result
 */
function execute(ctx: CheckExecutionContext): Promise<CheckResult> {
  return Promise.resolve(
    run({
      openTrackedImplementationFiles: ctx.change.trackedImplementationFiles
        .filter((entry) => entry.state === 'open')
        .map((entry) => entry.file),
    }),
  )
}

/** Reusable `impl.filesResolved` check. */
export const implFilesResolved: Check = {
  id: 'impl.filesResolved',
  label: CHECK_LABELS['impl.filesResolved'],
  kind: 'predicate',
  execute,
}
