import * as React from 'react'
import type { LogReadDto } from '@specd/client'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export type StudioOutputLevel = 'debug' | 'info' | 'warn' | 'error'

export interface StudioOutputEntry {
  readonly id: string
  readonly timestamp: string
  readonly level: StudioOutputLevel
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

export interface AppendStudioOutputInput {
  readonly level?: StudioOutputLevel
  readonly message: string
  readonly action?: string
  readonly context?: Record<string, unknown>
}

const STUDIO_OUTPUT_LIMIT = 400
let nextOutputId = 0
let studioOutputEntries: readonly StudioOutputEntry[] = []
const studioOutputListeners = new Set<() => void>()

/**
 * Subscribes to local studio output changes.
 *
 * @param listener - Store listener invoked after each local append.
 * @returns Unsubscribe callback.
 */
function subscribeStudioOutput(listener: () => void): () => void {
  studioOutputListeners.add(listener)
  return () => {
    studioOutputListeners.delete(listener)
  }
}

/**
 * Reads the current local studio output snapshot.
 *
 * @returns Newest-first local output entries for this session.
 */
function getStudioOutputSnapshot(): readonly StudioOutputEntry[] {
  return studioOutputEntries
}

/**
 * Appends one local studio output entry and enforces the FIFO cap.
 *
 * @param input - Local output line to append.
 * @returns The appended entry.
 */
function appendStudioOutputEntry(input: AppendStudioOutputInput): StudioOutputEntry {
  nextOutputId += 1
  const entry: StudioOutputEntry = {
    id: `local-output-${nextOutputId}`,
    timestamp: new Date().toISOString(),
    level: input.level ?? 'info',
    message: input.message,
    ...(input.action !== undefined ? { action: input.action } : {}),
    ...(input.context !== undefined ? { context: input.context } : {}),
  }
  studioOutputEntries = [entry, ...studioOutputEntries].slice(0, STUDIO_OUTPUT_LIMIT)
  for (const listener of studioOutputListeners) {
    listener()
  }
  return entry
}

function logLines(dto: LogReadDto | undefined): readonly string[] {
  if (dto === undefined) {
    return []
  }
  if (dto.lines !== undefined && dto.lines.length > 0) {
    return dto.lines
  }
  return (dto.entries ?? []).map((e) => `${e.timestamp} ${e.level} ${e.message}`)
}

/** Reads local studio output entries for the Output / Problems tabs. */
export function useStudioOutput(): readonly StudioOutputEntry[] {
  return React.useSyncExternalStore(subscribeStudioOutput, getStudioOutputSnapshot)
}

/** Polls specd in-memory logs for the Logs tab. */
export function useProjectLogs(
  refreshKey = 0,
  enabled = true,
): {
  readonly lines: readonly string[]
  readonly isLoading: boolean
  readonly error: Error | undefined
  readonly refetch: () => void
} {
  const port = useSpecdDataPort()
  const load = React.useCallback(() => port.readProjectLogs({ limit: 500, prettier: true }), [port])
  const resource = useAsyncResource('project-logs', load, { refreshKey, enabled })
  return {
    lines: logLines(resource.data),
    isLoading: resource.isLoading,
    error: resource.error,
    refetch: resource.refetch,
  }
}

/** Appends a studio output line (Output stream only). */
export function useStudioPanelActions(): {
  readonly appendOutput: (input: AppendStudioOutputInput) => Promise<void>
  readonly traceAction: (action: string, context?: Record<string, unknown>) => Promise<void>
} {
  const port = useSpecdDataPort()
  const appendOutput = React.useCallback((input: AppendStudioOutputInput) => {
    appendStudioOutputEntry(input)
    return Promise.resolve()
  }, [])
  const traceAction = React.useCallback(
    async (action: string, context?: Record<string, unknown>) => {
      await port.appendProjectLog({
        level: 'debug',
        message: action,
        context: { source: 'studio', ...context },
      })
    },
    [port],
  )
  return { appendOutput, traceAction }
}

/** Derives Problems tab lines from studio output (warn/error only). */
export function studioOutputProblems(
  entries: readonly StudioOutputEntry[],
): readonly StudioOutputEntry[] {
  return entries.filter((e) => e.level === 'warn' || e.level === 'error')
}

function outputLevelFromLine(line: string): 'info' | 'warn' | 'error' {
  if (line.startsWith('✗')) {
    return 'error'
  }
  if (line.startsWith('⚠')) {
    return 'warn'
  }
  return 'info'
}

/** Maps a display line to studio output level. */
export function studioOutputLevelFromMessage(message: string): 'info' | 'warn' | 'error' {
  return outputLevelFromLine(message)
}
