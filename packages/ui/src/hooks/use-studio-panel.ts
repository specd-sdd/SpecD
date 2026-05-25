import * as React from 'react'
import type { LogReadDto, StudioOutputEntryDto } from '@specd/client'
import type { AppendStudioOutputInput } from '@specd/client'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

function logLines(dto: LogReadDto | undefined): readonly string[] {
  if (dto === undefined) {
    return []
  }
  if (dto.lines !== undefined && dto.lines.length > 0) {
    return dto.lines
  }
  return (dto.entries ?? []).map((e) => `${e.timestamp} ${e.level} ${e.message}`)
}

/** Polls studio output entries for the Output / Problems tabs. */
export function useStudioOutput(
  refreshKey = 0,
  enabled = true,
): ReturnType<typeof useAsyncResource<readonly StudioOutputEntryDto[]>> {
  const port = useSpecdDataPort()
  const load = React.useCallback(() => port.listStudioOutput(200), [port])
  return useAsyncResource('studio-output', load, { refreshKey, enabled })
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
  const appendOutput = React.useCallback(
    async (input: AppendStudioOutputInput) => {
      await port.appendStudioOutput(input)
    },
    [port],
  )
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
  entries: readonly StudioOutputEntryDto[],
): readonly StudioOutputEntryDto[] {
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
