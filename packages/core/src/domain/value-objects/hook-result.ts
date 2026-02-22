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

/**
 * Template variables available for substitution in `run:` hook command strings.
 *
 * Variables use the `{{key.path}}` syntax (e.g. `{{change.name}}`).
 * `change` is absent for lifecycle points that have no active change
 * (e.g. `pre-explore`).
 */
export interface HookVariables {
  /** Active change context, present when a change is active. */
  readonly change?: {
    /** The change's kebab-case name (e.g. `"add-oauth-login"`). */
    readonly name: string
    /** The workspace the change belongs to (e.g. `"auth"`). */
    readonly workspace: string
    /** Absolute filesystem path to the change directory. */
    readonly path: string
  }
  /** Project-level context, always present. */
  readonly project: {
    /** Absolute filesystem path to the git repository root. */
    readonly root: string
  }
}
