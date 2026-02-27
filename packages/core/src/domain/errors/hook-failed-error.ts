import { SpecdError } from './specd-error.js'

/**
 * Thrown when a `run:` lifecycle hook exits with a non-zero exit code.
 *
 * Carries the command string, exit code, and captured stderr so the caller
 * can surface a human-readable error message.
 */
export class HookFailedError extends SpecdError {
  private readonly _command: string
  private readonly _exitCode: number
  private readonly _stderr: string

  /** Machine-readable error code identifying this error class. */
  override get code(): string {
    return 'HOOK_FAILED'
  }

  /**
   * Creates a new `HookFailedError` for a shell command that exited with a non-zero code.
   *
   * @param command - The shell command that failed
   * @param exitCode - The non-zero exit code returned by the command
   * @param stderr - Captured standard error output from the command
   */
  constructor(command: string, exitCode: number, stderr: string) {
    super(`Hook '${command}' failed with exit code ${exitCode}`)
    this._command = command
    this._exitCode = exitCode
    this._stderr = stderr
  }

  /**
   * The shell command that failed.
   *
   * @returns The command string as declared in the workflow hook entry
   */
  get command(): string {
    return this._command
  }

  /**
   * The non-zero exit code returned by the command.
   *
   * @returns The process exit code
   */
  get exitCode(): number {
    return this._exitCode
  }

  /**
   * Captured standard error from the failed command.
   *
   * @returns All stderr output as a single string
   */
  get stderr(): string {
    return this._stderr
  }
}
