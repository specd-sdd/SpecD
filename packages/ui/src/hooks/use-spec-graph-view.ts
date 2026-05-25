import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useSpecGraphView(
  workspace: string | undefined,
  specPath: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<Record<string, unknown>>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(
    () => port.getSpecGraphView(workspace!, specPath!),
    [port, workspace, specPath],
  )

  return useAsyncResource(`spec-graph-view:${workspace}:${specPath}`, load, {
    enabled: Boolean(workspace && specPath),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
