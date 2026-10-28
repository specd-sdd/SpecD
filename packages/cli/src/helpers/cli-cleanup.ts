/** A cleanup action registered for the end of the CLI run. */
export type CliCleanup = () => void | Promise<void>

const registered: CliCleanup[] = []
let running: Promise<void> | undefined

/**
 * Describes a cleanup failure as one or more stderr-friendly messages.
 *
 * @param error - Failure thrown or rejected by a cleanup
 * @returns One message per underlying failure
 */
function describeFailure(error: unknown): string[] {
  if (error instanceof AggregateError) {
    return error.errors.map((inner: unknown) =>
      inner instanceof Error ? inner.message : String(inner),
    )
  }
  return [error instanceof Error ? error.message : String(error)]
}

/**
 * Reports a cleanup failure as `warning:` lines on stderr. Never changes the exit code.
 *
 * @param error - Failure thrown or rejected by a cleanup
 */
function reportFailure(error: unknown): void {
  for (const message of describeFailure(error)) {
    process.stderr.write(`warning: cleanup failed: ${message}\n`)
  }
}

/**
 * Runs one cleanup, reporting but never propagating its failure.
 *
 * @param cleanup - Cleanup to run
 */
async function runOne(cleanup: CliCleanup): Promise<void> {
  try {
    await cleanup()
  } catch (error) {
    reportFailure(error)
  }
}

/**
 * Registers a cleanup to run before the process exits.
 *
 * When cleanup already started, the cleanup is invoked immediately (fire and forget) and
 * its failure is reported like any other.
 *
 * @param cleanup - Cleanup to run, in reverse registration order, at exit
 */
export function registerCliCleanup(cleanup: CliCleanup): void {
  if (running !== undefined) {
    void runOne(cleanup)
    return
  }
  registered.push(cleanup)
}

/**
 * Runs the registered cleanups in reverse registration order, awaiting each one.
 *
 * Idempotent: a second or concurrent call returns the same promise and each cleanup runs
 * at most once. A failing cleanup never stops the others and is reported as a `warning:`
 * line on stderr; it never changes the process exit code and this function never rejects.
 *
 * @returns A promise that resolves once every cleanup has finished
 */
export function runCliCleanup(): Promise<void> {
  running ??= (async () => {
    for (const cleanup of [...registered].reverse()) {
      await runOne(cleanup)
    }
  })()
  return running
}

/** Test-only: clears registrations and the memoized run. */
export function resetCliCleanupForTests(): void {
  registered.length = 0
  running = undefined
}
