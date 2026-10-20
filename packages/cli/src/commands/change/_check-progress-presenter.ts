import { type CheckProgressEvent } from '@specd/sdk'
import { serializeOutput, type OutputFormat } from '../../formatter.js'

/** Stream name for structured check-progress records. */
export type CheckProgressStreamName = 'change-transition' | 'change-archive'

/** Presenter for the generic check progress bus. */
export interface CheckProgressPresenter {
  onEvent(event: CheckProgressEvent): void
}

/**
 * Strips ANSI escape sequences and control characters from subprocess output.
 *
 * @param text - Raw subprocess output line
 * @returns Sanitized text
 */
function stripTerminalControlSequences(text: string): string {
  return text
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
}

/**
 * Whether a check id is a hook effect (`hook.pre` / `hook.post`).
 *
 * @param id - Check id
 * @returns True for hook effects
 */
function isHookCheck(id: string): boolean {
  return id === 'hook.pre' || id === 'hook.post'
}

/**
 * Creates a presenter that renders `check-start` / `check-progress` / `check-done`
 * for transition and archive CLI commands.
 *
 * Text:
 * ```text
 * <label> (<id>)
 *   …optional check-progress lines…
 * ✓ <label>
 * # or ✗ <label>: <reason>
 * ```
 *
 * Structured formats emit the same event types on the given stream name.
 *
 * @param options - Rendering options
 * @param options.format - Output format
 * @param options.streamName - Structured stream discriminator
 * @param options.stream - Destination write stream
 * @param options.skipChecks - Check ids bypassed with `--skip-checks` (text skip reasons)
 * @param options.skipHooks - Whether any hook phase is skipped with `--skip-hooks`
 * @returns Presenter that accepts check progress events
 */
export function createCheckProgressPresenter(options: {
  format: OutputFormat
  streamName: CheckProgressStreamName
  stream: NodeJS.WriteStream
  skipChecks?: ReadonlySet<string>
  skipHooks?: boolean
}): CheckProgressPresenter {
  const completed = new Set<string>()
  const suppressed = new Set<string>()
  const pending = new Set<string>()
  let hookRan = false
  let recheckLabelled = false

  const skipReason = (event: Extract<CheckProgressEvent, { type: 'check-done' }>): string => {
    if (isHookCheck(event.id) && options.skipHooks === true) return '--skip-hooks'
    if (options.skipChecks?.has(event.id) === true) return '--skip-checks'
    return event.reason ?? 'not applicable'
  }

  const writeStructured = (event: CheckProgressEvent): void => {
    options.stream.write(
      `${serializeOutput({ stream: options.streamName, event }, options.format)}\n`,
    )
  }

  const writeProgressLine = (
    event: Extract<CheckProgressEvent, { type: 'check-progress' }>,
  ): void => {
    if (event.detail === 'hook-start' && event.command !== undefined) {
      options.stream.write(`  command: ${event.command}\n`)
      return
    }
    if (event.detail === 'hook-output' && event.line !== undefined) {
      const sanitized = stripTerminalControlSequences(event.line)
      if (sanitized.length === 0) return
      const prefix = event.stream === 'stderr' ? '  ! ' : '  | '
      options.stream.write(`${prefix}${sanitized}\n`)
      return
    }
    if (event.detail === 'hook-heartbeat' && event.elapsedMs !== undefined) {
      const seconds = Math.floor(event.elapsedMs / 1000)
      options.stream.write(`  still running (${seconds}s)\n`)
      return
    }
    if (event.detail === 'hook-done') {
      return
    }
    if (event.message !== undefined && event.message.length > 0) {
      options.stream.write(`  ${event.message}\n`)
      return
    }
    if (event.line !== undefined && event.line.length > 0) {
      const sanitized = stripTerminalControlSequences(event.line)
      if (sanitized.length === 0) return
      const prefix = event.stream === 'stderr' ? '  ! ' : '  | '
      options.stream.write(`${prefix}${sanitized}\n`)
    }
  }

  return {
    onEvent(event): void {
      if (options.format !== 'text') {
        writeStructured(event)
        return
      }

      switch (event.type) {
        case 'check-start':
          if (completed.has(event.id)) {
            // A repeated check id is the post-hook re-check: hide it unless a hook ran.
            if (!hookRan) {
              suppressed.add(event.id)
              return
            }
            if (!recheckLabelled) {
              recheckLabelled = true
              options.stream.write('Re-checking after hooks\n')
            }
          }
          pending.add(event.id)
          options.stream.write(`${event.label} (${event.id})\n`)
          return
        case 'check-progress':
          if (suppressed.has(event.id)) return
          writeProgressLine(event)
          return
        case 'check-done': {
          const wasStarted = pending.delete(event.id)
          if (suppressed.delete(event.id)) return
          // A repeated skip row without a start is still the hidden re-check.
          if (!wasStarted && completed.has(event.id) && !hookRan) return
          completed.add(event.id)
          if (isHookCheck(event.id) && event.outcome !== 'skip') {
            hookRan = true
          }
          if (event.outcome === 'fail') {
            const reason = event.reason !== undefined ? `: ${event.reason}` : ''
            options.stream.write(`✗ ${event.label}${reason}\n`)
            return
          }
          if (event.outcome === 'skip') {
            options.stream.write(`⊘ ${event.label} (skipped: ${skipReason(event)})\n`)
            return
          }
          options.stream.write(`✓ ${event.label}\n`)
          return
        }
      }
    },
  }
}
