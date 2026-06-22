import type { ChangeOverlapsDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useChangesOverlaps(
  refreshKey = 0,
  options: { enabled?: boolean } = {},
): ReturnType<typeof useAsyncResource<ChangeOverlapsDto>> {
  const port = useSpecdDataPort()
  const load = React.useCallback(() => port.detectOverlaps(), [port])
  return useAsyncResource('changes-overlaps', load, {
    enabled: options.enabled,
    refreshKey,
  })
}
