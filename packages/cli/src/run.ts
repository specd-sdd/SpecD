import { createProgram } from './program.js'
import { handleError } from './handle-error.js'
import { runCliCleanup } from './helpers/cli-cleanup.js'
import { CliExitError } from './helpers/cli-exit-error.js'
import { installCliSignalHandlers } from './helpers/cli-signals.js'

/**
 * Resolves the exit code for a failed run.
 *
 * @param error - Failure thrown by the program
 * @returns The code carried by a `CliExitError`, or the code `handleError` chooses (3 when the
 *   handler itself fails)
 */
function toExitCode(error: unknown): number {
  if (error instanceof CliExitError) return error.exitCode
  try {
    handleError(error)
  } catch (inner) {
    if (inner instanceof CliExitError) return inner.exitCode
    // The error handler itself failed: still clean up and end with the system-error code.
    return 3
  }
  return 3
}

/** Delay after cleanup before warning that open handles keep the process alive. */
export const CLI_EXIT_HINT_MS = 1000
/** Delay after cleanup before the exit is forced because open handles keep the process alive. */
export const CLI_EXIT_FORCE_MS = 5000

/**
 * Arms the exit grace period for a run that completed naturally.
 *
 * Both timers are `unref`'d, so they only fire when something else keeps the process alive.
 * At {@link CLI_EXIT_HINT_MS} a `warning:` line names the open resource types; at
 * {@link CLI_EXIT_FORCE_MS} another says the exit is forced and `process.exit` is called with
 * the exit code the run would have had. The exit code is never altered.
 */
function armExitGracePeriod(): void {
  setTimeout(() => {
    const open = process.getActiveResourcesInfo?.()
    const types = open !== undefined && open.length > 0 ? ` (${[...new Set(open)].join(', ')})` : ''
    const remaining = (CLI_EXIT_FORCE_MS - CLI_EXIT_HINT_MS) / 1000
    process.stderr.write(
      `warning: waiting for open handles to close${types}; forcing exit in ${remaining} s\n`,
    )
  }, CLI_EXIT_HINT_MS).unref()
  setTimeout(() => {
    process.stderr.write('warning: process did not exit after cleanup; forcing exit\n')
    process.exit(process.exitCode ?? 0)
  }, CLI_EXIT_FORCE_MS).unref()
}

/**
 * Runs the CLI against an argv. Together with `helpers/cli-signals.ts` this is the only
 * place that ends the process.
 *
 * Cleanup (hosts opened through the CLI helper) is always awaited before the process ends.
 * Natural completion does not call `process.exit`, so piped output can finish flushing and a
 * `process.exitCode` set by a command is respected; explicit exits (`CliExitError`, unhandled
 * errors) end the process with their code.
 *
 * @param argv - Full argv, including the node and script entries
 */
export async function run(argv: readonly string[]): Promise<void> {
  const removeSignalHandlers = installCliSignalHandlers()
  let exitCode: number | undefined
  try {
    await createProgram().parseAsync([...argv])
  } catch (error) {
    exitCode = toExitCode(error)
  }
  await runCliCleanup()
  removeSignalHandlers()
  if (exitCode !== undefined) {
    process.exit(exitCode)
    return
  }
  armExitGracePeriod()
}
