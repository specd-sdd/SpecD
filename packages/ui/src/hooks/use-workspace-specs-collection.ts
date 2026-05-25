import type { SpecSummaryDto, WorkspaceSummaryDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export type WorkspaceSpecsEntry = {
  readonly workspace: WorkspaceSummaryDto
  readonly specs: readonly SpecSummaryDto[]
  readonly error?: Error
}

/**
 * Loads spec trees for every visible workspace so the sidebar can render the
 * full project instead of only the first workspace.
 */
export function useWorkspaceSpecsCollection(
  workspaces: readonly WorkspaceSummaryDto[],
  refreshKey = 0,
): ReturnType<typeof useAsyncResource<readonly WorkspaceSpecsEntry[]>> {
  const port = useSpecdDataPort()
  const namesKey = React.useMemo(
    () => workspaces.map((workspace) => workspace.name).join(','),
    [workspaces],
  )

  const load = React.useCallback(async (): Promise<readonly WorkspaceSpecsEntry[]> => {
    const settled = await Promise.all(
      workspaces.map(async (workspace): Promise<WorkspaceSpecsEntry> => {
        try {
          const result = await port.listSpecs(workspace.name)
          return { workspace, specs: result.specs }
        } catch (error) {
          return {
            workspace,
            specs: [],
            error: error instanceof Error ? error : new Error(String(error)),
          }
        }
      }),
    )

    return settled
  }, [port, workspaces])

  return useAsyncResource(`workspace-specs-collection:${namesKey}`, load, {
    enabled: workspaces.length > 0,
    refreshKey,
  })
}
