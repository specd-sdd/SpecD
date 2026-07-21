import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { type HookRunner, type OnHookRunnerProgress } from '../../application/ports/hook-runner.js'
import { HookResult } from '../../domain/value-objects/hook-result.js'
import {
  type TemplateExpander,
  type TemplateVariables,
} from '../../application/template-expander.js'

const HEARTBEAT_INTERVAL_MS = 5000

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
   * @param onProgress - Optional callback for in-flight output and heartbeat updates
   * @returns The process exit code and all captured output
   */
  run(
    command: string,
    variables: TemplateVariables,
    onProgress?: OnHookRunnerProgress,
  ): Promise<HookResult> {
    const expanded = this._expander.expandForShell(command, variables)
    return new Promise((resolve) => {
      const defaultShell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
      const envShell = process.platform === 'win32' ? process.env['COMSPEC'] : process.env['SHELL']
      const shell = envShell !== undefined && path.isAbsolute(envShell) ? envShell : defaultShell
      const shellFlag = process.platform === 'win32' ? '/c' : '-c'
      const child = spawn(shell, [shellFlag, expanded], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let stdoutBuffer = ''
      let stderrBuffer = ''
      let resolved = false
      let exitCode = 0
      const startedAt = Date.now()
      let lastVisibleActivityAt = startedAt

      const heartbeat = setInterval(() => {
        const now = Date.now()
        if (now - lastVisibleActivityAt < HEARTBEAT_INTERVAL_MS) return
        onProgress?.({
          type: 'heartbeat',
          elapsedMs: now - startedAt,
        })
        lastVisibleActivityAt = now
      }, HEARTBEAT_INTERVAL_MS)

      const emitLine = (stream: 'stdout' | 'stderr', line: string): void => {
        onProgress?.({ type: 'output', stream, line })
        lastVisibleActivityAt = Date.now()
      }

      const consumeChunk = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
        const text = chunk.toString('utf8')
        if (stream === 'stdout') {
          stdout += text
          stdoutBuffer += text
          stdoutBuffer = this._drainCompletedLines(stdoutBuffer, stream, emitLine)
          return
        }
        stderr += text
        stderrBuffer += text
        stderrBuffer = this._drainCompletedLines(stderrBuffer, stream, emitLine)
      }

      const finalize = (): void => {
        if (resolved) return
        resolved = true
        clearInterval(heartbeat)
        if (stdoutBuffer.length > 0) emitLine('stdout', stdoutBuffer)
        if (stderrBuffer.length > 0) emitLine('stderr', stderrBuffer)
        resolve(new HookResult(exitCode, stdout, stderr))
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        consumeChunk('stdout', chunk)
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        consumeChunk('stderr', chunk)
      })

      child.on('error', () => {
        exitCode = 1
      })

      child.on('close', (code) => {
        exitCode = typeof code === 'number' ? code : 1
        finalize()
      })
    })
  }

  /**
   * Emits every completed line in `buffer` and returns the remaining partial line.
   *
   * @param buffer - The current buffered text for one stream
   * @param stream - Which process stream produced the buffered text
   * @param emitLine - Callback invoked for each completed line
   * @returns The trailing partial line, if any
   */
  private _drainCompletedLines(
    buffer: string,
    stream: 'stdout' | 'stderr',
    emitLine: (stream: 'stdout' | 'stderr', line: string) => void,
  ): string {
    let start = 0
    for (let index = 0; index < buffer.length; index += 1) {
      if (buffer[index] !== '\n') continue
      const rawLine = buffer.slice(start, index)
      emitLine(stream, rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine)
      start = index + 1
    }
    return buffer.slice(start)
  }
}
