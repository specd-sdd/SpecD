import type { WorkspaceSummaryDto, ChangeSummaryDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export interface FailedClosedSpec {
  readonly specId: string
  readonly failures: readonly {
    readonly description: string
    readonly artifactId: string
    readonly filename?: string
  }[]
}

export function useClosedSpecsValidation(
  workspaces: readonly WorkspaceSummaryDto[],
  activeChanges: readonly ChangeSummaryDto[],
  refreshKey = 0,
  options: { enabled?: boolean } = {},
): ReturnType<typeof useAsyncResource<readonly FailedClosedSpec[]>> {
  const port = useSpecdDataPort()

  const activeSpecIds = React.useMemo(() => {
    return new Set(activeChanges.flatMap((c) => c.specIds))
  }, [activeChanges])

  const workspacesKey = React.useMemo(() => {
    return workspaces.map((w) => w.name).join(',')
  }, [workspaces])

  const load = React.useCallback(async (): Promise<readonly FailedClosedSpec[]> => {
    const results = await Promise.all(
      workspaces.map(async (ws) => {
        try {
          const res = await port.validateSpecs(ws.name)
          return res.entries
        } catch (error) {
          console.error(`Failed to validate specs for workspace ${ws.name}:`, error)
          return []
        }
      }),
    )

    const allEntries = results.flat()
    const failedClosed: FailedClosedSpec[] = []

    for (const entry of allEntries) {
      if (!entry.passed && !activeSpecIds.has(entry.spec)) {
        failedClosed.push({
          specId: entry.spec,
          failures: entry.failures,
        })
      }
    }

    return failedClosed
  }, [port, workspaces, activeSpecIds])

  return useAsyncResource(`closed-specs-validation:${workspacesKey}`, load, {
    enabled: (options.enabled ?? true) && workspaces.length > 0,
    refreshKey,
  })
}
