import type { ChangeGraphViewDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useChangeGraphView(
  changeName: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<ChangeGraphViewDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(() => port.getChangeGraphView(changeName!), [port, changeName])

  return useAsyncResource(`change-graph-view:${changeName ?? ''}`, load, {
    enabled: Boolean(changeName),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
