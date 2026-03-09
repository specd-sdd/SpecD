import { execFile } from 'node:child_process'
import * as path from 'node:path'
import { type HookRunner } from '../../application/ports/hook-runner.js'
import { HookResult, type HookVariables } from '../../domain/value-objects/hook-result.js'

/**
 * Escapes a value for safe interpolation into a shell command.
 *
 * Wraps the value in single quotes and escapes any embedded single quotes
 * using the `'\''` idiom (end quote, escaped quote, start quote).
 *
 * @param value - The raw value to escape
 * @returns A shell-safe single-quoted string
 */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

/**
 * Expands `{{key.path}}` template variables in a command string.
 *
 * Traverses `variables` using dot-separated key paths. Unknown paths are left
 * unexpanded (the original `{{key.path}}` token is preserved). All substituted
 * values are shell-escaped to prevent injection attacks.
 *
 * @param command - The command string containing optional `{{key.path}}` tokens
 * @param variables - Values for template variable substitution
 * @returns The command string with all known template variables replaced and shell-escaped
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
      return shellEscape(String(current))
    }
    return `{{${path}}}`
  })
}

/**
 * Node.js `child_process` implementation of the {@link HookRunner} port.
 *
 * Expands template variables in the command string before spawning a shell
 * subprocess. Uses `$SHELL` (Unix) or `%COMSPEC%` (Windows) with sensible
 * fallbacks. Captures stdout and stderr, and returns them along with the
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
      const defaultShell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
      const envShell = process.platform === 'win32' ? process.env['COMSPEC'] : process.env['SHELL']
      const shell = envShell !== undefined && path.isAbsolute(envShell) ? envShell : defaultShell
      const shellFlag = process.platform === 'win32' ? '/c' : '-c'
      execFile(shell, [shellFlag, expanded], (error, stdout, stderr) => {
        const exitCode = error?.code != null ? (typeof error.code === 'number' ? error.code : 1) : 0
        resolve(new HookResult(exitCode, stdout, stderr))
      })
    })
  }
}
