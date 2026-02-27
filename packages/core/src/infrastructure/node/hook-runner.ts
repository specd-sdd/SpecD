import { exec } from 'node:child_process'
import { type HookRunner } from '../../application/ports/hook-runner.js'
import { HookResult, type HookVariables } from '../../domain/value-objects/hook-result.js'

/**
 * Expands `{{key.path}}` template variables in a command string.
 *
 * Traverses `variables` using dot-separated key paths. Unknown paths are left
 * unexpanded (the original `{{key.path}}` token is preserved).
 *
 * @param command - The command string containing optional `{{key.path}}` tokens
 * @param variables - Values for template variable substitution
 * @returns The command string with all known template variables replaced
 */
function expandVariables(command: string, variables: HookVariables): string {
  return command.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const keys = path.split('.')
    let current: unknown = variables
    for (const key of keys) {
      if (current == null || typeof current !== 'object') return `{{${path}}}`
      current = (current as Record<string, unknown>)[key]
    }
    if (
      typeof current === 'string' ||
      typeof current === 'number' ||
      typeof current === 'boolean'
    ) {
      return String(current)
    }
    return `{{${path}}}`
  })
}

/**
 * Node.js `child_process` implementation of the {@link HookRunner} port.
 *
 * Expands template variables in the command string before spawning a shell
 * subprocess. Captures stdout and stderr, and returns them along with the
 * process exit code in a {@link HookResult}.
 */
export class NodeHookRunner implements HookRunner {
  /**
   * Executes `command` in a subprocess after substituting template variables.
   *
   * @param command - The shell command string, optionally containing `{{key.path}}` variables
   * @param variables - Values for template variable substitution
   * @returns The process exit code and all captured output
   */
  run(command: string, variables: HookVariables): Promise<HookResult> {
    const expanded = expandVariables(command, variables)
    return new Promise((resolve) => {
      exec(expanded, (error, stdout, stderr) => {
        const exitCode = error?.code != null ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve(new HookResult(exitCode, stdout, stderr))
      })
    })
  }
}
