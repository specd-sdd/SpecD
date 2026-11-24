import { runCliCleanup } from './cli-cleanup.js'

const SIGNAL_EXIT_CODES: ReadonlyArray<readonly [NodeJS.Signals, number]> = [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]

/**
 * Installs `SIGINT` / `SIGTERM` handlers for the executable entrypoint.
 *
 * The first signal runs CLI cleanup and then exits with 130 (`SIGINT`) or 143 (`SIGTERM`).
 * A second signal received while cleanup is running exits immediately with the code of the
 * first signal. The `SIGTERM` handler is installed on every platform; Windows never delivers
 * it, so only `SIGINT` is relied upon there. Nothing is installed at import time and `createProgram()` never calls this function.
 *
 * @returns A function that removes the installed handlers
 */
export function installCliSignalHandlers(): () => void {
  let firstCode: number | undefined
  const installed: Array<readonly [NodeJS.Signals, () => void]> = []

  for (const [signal, code] of SIGNAL_EXIT_CODES) {
    const handler = (): void => {
      if (firstCode !== undefined) {
        process.exit(firstCode)
        return
      }
      firstCode = code
      void runCliCleanup().finally(() => process.exit(code))
    }
    process.on(signal, handler)
    installed.push([signal, handler])
  }

  return () => {
    for (const [signal, handler] of installed) {
      process.off(signal, handler)
    }
  }
}
