import { execFile } from 'node:child_process'
import * as path from 'node:path'
import { type HookRunner } from '../../application/ports/hook-runner.js'
import { HookResult } from '../../domain/value-objects/hook-result.js'
import {
  type TemplateExpander,
  type TemplateVariables,
} from '../../application/template-expander.js'

/**
 * Node.js `child_process` implementation of the {@link HookRunner} port.
 *
 * Delegates template variable expansion to the injected {@link TemplateExpander},
 * then spawns a shell subprocess. Uses `$SHELL` (Unix) or `%COMSPEC%` (Windows)
 * with sensible fallbacks. Captures stdout and stderr, and returns them along
 * with the process exit code in a {@link HookResult}.
 */
export class NodeHookRunner implements HookRunner {
  private readonly _expander: TemplateExpander

  /**
   * Creates a new `NodeHookRunner` with the given template expander.
   *
   * @param expander - The template expander for shell-safe variable substitution
   */
  constructor(expander: TemplateExpander) {
    this._expander = expander
  }

  /**
   * Executes `command` in a subprocess after substituting template variables.
   *
   * @param command - The shell command string, optionally containing `{{key.path}}` variables
   * @param variables - Values for template variable substitution
   * @returns The process exit code and all captured output
   */
  run(command: string, variables: TemplateVariables): Promise<HookResult> {
    const expanded = this._expander.expandForShell(command, variables)
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
