import type { WorkspaceSpecTreeDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads the spec tree for a workspace.
 *
 * @param workspace - Workspace name, or undefined to skip fetch.
 * @param refreshKey - Bumps when project poll refreshes sidebar data.
 */
export function useWorkspaceSpecs(
  workspace: string | undefined,
  refreshKey = 0,
): ReturnType<typeof useAsyncResource<WorkspaceSpecTreeDto>> {
  const port = useSpecdDataPort()
  const load = React.useCallback(() => port.listSpecs(workspace!), [port, workspace])
  return useAsyncResource(`workspace-specs:${workspace ?? ''}`, load, {
    enabled: Boolean(workspace),
    refreshKey,
  })
}
