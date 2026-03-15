import { type HookResult } from '../../domain/value-objects/hook-result.js'
import { type TemplateVariables } from '../template-expander.js'

export type { HookResult, TemplateVariables }

/**
 * Port for executing `run:` hook commands.
 *
 * `run:` hooks are deterministic shell commands declared in `workflow[]`
 * entries. They are executed by this port — not by the AI agent — and have
 * strong execution guarantees at `pre-*` lifecycle points.
 *
 * Template variables in command strings are expanded before execution
 * via `TemplateExpander.expandForShell()`.
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
  run(command: string, variables: TemplateVariables): Promise<HookResult>
}
