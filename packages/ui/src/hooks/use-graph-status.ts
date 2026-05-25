import type { GraphStatusDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useGraphStatus(
  refreshKey = 0,
): ReturnType<typeof useAsyncResource<GraphStatusDto>> {
  const port = useSpecdDataPort()
  const load = React.useCallback(() => port.getGraphStatus(), [port])
  return useAsyncResource('graph-status', load, { refreshKey })
}
