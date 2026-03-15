/**
 * The result of executing a `run:` hook command via {@link HookRunner}.
 *
 * Captures the process exit code and all captured output. Use `isSuccess()`
 * for the canonical success check — a non-zero exit code aborts the
 * `pre-*` lifecycle gate.
 */
export class HookResult {
  private readonly _exitCode: number
  private readonly _stdout: string
  private readonly _stderr: string

  /**
   * Creates a new `HookResult` from a completed hook process.
   *
   * @param exitCode - The process exit code (0 = success, non-zero = failure)
   * @param stdout - Captured standard output
   * @param stderr - Captured standard error
   */
  constructor(exitCode: number, stdout: string, stderr: string) {
    this._exitCode = exitCode
    this._stdout = stdout
    this._stderr = stderr
  }

  /**
   * The process exit code.
   *
   * @returns 0 for success, non-zero for failure
   */
  exitCode(): number {
    return this._exitCode
  }

  /**
   * Captured standard output from the command.
   *
   * @returns All stdout output as a single string
   */
  stdout(): string {
    return this._stdout
  }

  /**
   * Captured standard error from the command.
   *
   * @returns All stderr output as a single string
   */
  stderr(): string {
    return this._stderr
  }

  /**
   * Returns `true` when the command exited with code `0`.
   *
   * A `pre-*` lifecycle gate fails and aborts the operation when this
   * returns `false`.
   *
   * @returns `true` if exit code is 0
   */
  isSuccess(): boolean {
    return this._exitCode === 0
  }
}
