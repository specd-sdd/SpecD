import { serializeOutput, type OutputFormat } from '../../formatter.js'

/** Output formats supported by the shared hook-progress presenter. */
export type HookPresenterFormat = OutputFormat

/** Hook progress event rendered by the shared CLI presenter. */
export type HookPresenterEvent =
  | {
      type: 'hook-start'
      phase?: 'pre' | 'post'
      hookId: string
      command: string
    }
  | {
      type: 'hook-output'
      phase?: 'pre' | 'post'
      hookId: string
      stream: 'stdout' | 'stderr'
      line: string
    }
  | {
      type: 'hook-heartbeat'
      phase?: 'pre' | 'post'
      hookId: string
      elapsedMs: number
    }
  | {
      type: 'hook-done'
      phase?: 'pre' | 'post'
      hookId: string
      success: boolean
      exitCode: number
    }

/** Shared presenter contract used by hook-aware CLI commands. */
export interface HookProgressPresenter {
  onEvent(event: HookPresenterEvent): void
  finalizeHook(result: {
    phase?: 'pre' | 'post'
    id: string
    command: string
    success: boolean
    exitCode: number
    stdout: string
    stderr: string
  }): void
  flush(): void
}

/** One output line captured from an in-flight hook stream. */
type OutputLine = {
  readonly stream: 'stdout' | 'stderr'
  readonly line: string
}

/** Mutable rendering state for one hook while it remains active or finalizes. */
type HookState = {
  readonly key: string
  readonly hookId: string
  readonly phase: 'pre' | 'post' | undefined
  command: string
  success: boolean | null
  exitCode: number | null
  elapsedMs: number
  tail: OutputLine[]
  allOutput: OutputLine[]
  lastHeartbeatLabel: string | null
  renderedFinal: boolean
}

const DEFAULT_TAIL_LINES = 10

/**
 * Strips ANSI escape sequences and control characters from subprocess output
 * before it is re-rendered inside the presenter-owned terminal block.
 *
 * @param text - Raw subprocess output line.
 * @returns Output text with terminal control content removed.
 */
function stripTerminalControlSequences(text: string): string {
  return text
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
}

/**
 * Creates the shared hook-progress presenter used by `change run-hooks` and `change transition`.
 *
 * @param options - Rendering options for text or structured hook progress
 * @param options.format - Output format that determines text vs structured rendering
 * @param options.stream - Destination stream for progress output
 * @param options.tailLines - Maximum number of recent lines to keep for successful hooks
 * @param options.autoFinalizeOnDone - Whether `hook-done` should immediately emit a final block
 * @returns A presenter that accepts in-flight hook events and final hook results
 */
export function createHookProgressPresenter(options: {
  format: HookPresenterFormat
  stream: NodeJS.WriteStream
  tailLines?: number
  autoFinalizeOnDone?: boolean
}): HookProgressPresenter {
  const tailLines = options.tailLines ?? DEFAULT_TAIL_LINES
  const states = new Map<string, HookState>()

  const keyFor = (phase: 'pre' | 'post' | undefined, hookId: string): string =>
    `${phase ?? 'none'}:${hookId}`

  const labelFor = (state: HookState): string =>
    state.phase === undefined ? state.hookId : `${state.phase} › ${state.hookId}`

  const recordOutput = (state: HookState, line: OutputLine): void => {
    const sanitizedLine = stripTerminalControlSequences(line.line)
    if (sanitizedLine.length === 0) return
    const nextLine = { ...line, line: sanitizedLine }
    state.allOutput.push(nextLine)
    state.tail.push(nextLine)
    if (state.tail.length > tailLines) state.tail.shift()
  }

  const elapsedLabel = (elapsedMs: number): string => {
    const seconds = Math.floor(elapsedMs / 1000)
    return `${seconds}s`
  }

  const appendTextStart = (state: HookState): void => {
    options.stream.write(`[running] ${labelFor(state)}\n`)
    options.stream.write(`  command: ${state.command}\n`)
  }

  const appendTextOutput = (state: HookState, line: OutputLine): void => {
    if (line.line.length === 0) return
    const prefix = line.stream === 'stderr' ? '  ! ' : '  | '
    options.stream.write(`${prefix}${line.line}\n`)
  }

  const appendTextHeartbeat = (state: HookState): void => {
    const label = elapsedLabel(state.elapsedMs)
    if (state.lastHeartbeatLabel === label) return
    state.lastHeartbeatLabel = label
    options.stream.write(`[still running] ${labelFor(state)} (${label})\n`)
  }

  const renderFinal = (
    state: HookState,
    success: boolean,
    exitCode: number,
    outputLines: readonly OutputLine[],
  ): void => {
    state.success = success
    state.exitCode = exitCode
    if (options.format !== 'text') {
      void outputLines
      return
    }
    if (success) {
      options.stream.write(`[done] ${labelFor(state)}\n`)
      options.stream.write(`  exit: ${state.exitCode}\n`)
      return
    }
    void outputLines
    options.stream.write(`[failed] ${labelFor(state)}\n`)
    options.stream.write(`  exit: ${state.exitCode}\n`)
  }

  const writeStructuredEvent = (event: HookPresenterEvent): void => {
    options.stream.write(`${serializeOutput({ stream: 'hook-progress', event }, options.format)}\n`)
  }

  return {
    onEvent(event): void {
      if (options.format !== 'text') {
        writeStructuredEvent(event)
      }

      const key = keyFor(event.phase, event.hookId)

      switch (event.type) {
        case 'hook-start': {
          const state: HookState = {
            key,
            hookId: event.hookId,
            phase: event.phase,
            command: event.command,
            success: null,
            exitCode: null,
            elapsedMs: 0,
            tail: [],
            allOutput: [],
            lastHeartbeatLabel: null,
            renderedFinal: false,
          }
          states.set(key, state)
          if (options.format !== 'text') return
          appendTextStart(state)
          return
        }
        case 'hook-output': {
          const state = states.get(key)
          if (state === undefined) return
          const sanitizedLine = stripTerminalControlSequences(event.line)
          recordOutput(state, { stream: event.stream, line: sanitizedLine })
          if (options.format !== 'text') return
          appendTextOutput(state, { stream: event.stream, line: sanitizedLine })
          return
        }
        case 'hook-heartbeat': {
          const state = states.get(key)
          if (state === undefined) return
          state.elapsedMs = event.elapsedMs
          if (options.format !== 'text') return
          appendTextHeartbeat(state)
          return
        }
        case 'hook-done': {
          const state = states.get(key)
          if (state === undefined) return
          state.success = event.success
          state.exitCode = event.exitCode
          if (options.autoFinalizeOnDone === true) {
            renderFinal(
              state,
              event.success,
              event.exitCode,
              event.success ? state.tail : state.allOutput,
            )
            state.renderedFinal = true
          }
          return
        }
      }
    },

    finalizeHook(result): void {
      const key = keyFor(result.phase, result.id)
      const state = states.get(key)
      if (state === undefined) return
      if (state.renderedFinal) return
      const combinedOutput: OutputLine[] = []
      for (const line of result.stdout.split(/\r?\n/)) {
        if (line.length > 0) {
          combinedOutput.push({
            stream: 'stdout',
            line: stripTerminalControlSequences(line),
          })
        }
      }
      for (const line of result.stderr.split(/\r?\n/)) {
        if (line.length > 0) {
          combinedOutput.push({
            stream: 'stderr',
            line: stripTerminalControlSequences(line),
          })
        }
      }
      renderFinal(
        state,
        result.success,
        result.exitCode,
        result.success ? combinedOutput.slice(-tailLines) : combinedOutput,
      )
      state.renderedFinal = true
    },

    flush(): void {
      return
    },
  }
}
