import { SpecdCliError } from '../errors/index.js'

/**
 * Control-flow signal carrying a process exit code.
 *
 * Thrown instead of calling `process.exit` so that the entrypoint can await CLI cleanup
 * before the process ends. It is not a user-facing failure: `handleError` rethrows it
 * before any classification, so its `SpecdError`-like shape is never reformatted or printed.
 */
export class CliExitError extends SpecdCliError {
  /** Machine-readable error code. */
  get code(): string {
    return 'CLI_EXIT'
  }

  private readonly _exitCode: number

  /**
   * Creates a new `CliExitError`.
   *
   * @param exitCode - Exit code to end the process with (0 is valid for early successful exits)
   */
  constructor(exitCode: number) {
    super(`CLI exit ${exitCode}`)
    this._exitCode = exitCode
  }

  /**
   * Exit code the entrypoint ends the process with.
   *
   * @returns The exit code carried by this signal
   */
  get exitCode(): number {
    return this._exitCode
  }
}
