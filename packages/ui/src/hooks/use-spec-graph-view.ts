import * as React from 'react'
import type { GraphSpecCoverageDto } from '@specd/client'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useSpecGraphView(
  workspace: string | undefined,
  specPath: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<GraphSpecCoverageDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(
    () => port.getSpecGraphView(workspace!, specPath!),
    [port, workspace, specPath],
  )

  return useAsyncResource<GraphSpecCoverageDto>(`spec-graph-view:${workspace}:${specPath}`, load, {
    enabled: Boolean(workspace && specPath),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
