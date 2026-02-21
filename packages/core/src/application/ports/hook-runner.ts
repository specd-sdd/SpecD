import { type HookResult, type HookVariables } from '../../domain/value-objects/hook-result.js'

export type { HookResult, HookVariables }

/**
 * Port for executing `run:` hook commands.
 *
 * `run:` hooks are deterministic shell commands declared in `workflow[]`
 * entries. They are executed by this port — not by the AI agent — and have
 * strong execution guarantees at `pre-*` lifecycle points.
 *
 * **Execution guarantees by lifecycle point:**
 *
 * - `pre-*` hooks (all operations): guaranteed. A non-zero exit code aborts
 *   the operation; `specd ctx` returns an error and no instruction block is
 *   issued to the agent.
 * - `post-*` CLI-owned operations (`archive`, `validate`): guaranteed. The
 *   CLI command runs the post hooks before returning to the caller.
 * - `post-*` agent-driven operations (`apply`, `plan`, etc.): not supported.
 *   Use `instruction:` hooks instead.
 *
 * Template variables in command strings are expanded before execution.
 * See {@link HookVariables} for available substitutions.
 *
 * Unlike the repository ports, `HookRunner` has no invariant constructor
 * arguments shared across all implementations, so it is declared as an
 * interface rather than an abstract class.
 */
export interface HookRunner {
  /**
   * Executes `command` in a subprocess, substituting template variables from
   * `variables` before invoking the shell.
   *
   * Template variable syntax: `{{key.path}}`, e.g. `{{change.name}}`,
   * `{{project.root}}`. Unknown variables are left unexpanded.
   *
   * @param command - The shell command string, optionally containing template variables
   * @param variables - Values for template variable substitution
   * @returns The process exit code and all captured output
   */
  run(command: string, variables: HookVariables): Promise<HookResult>
}
