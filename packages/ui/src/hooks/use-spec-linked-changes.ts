import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export type LinkedChangeRow = {
  readonly name: string
  readonly state: string
}

export function useSpecLinkedChanges(
  specId: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<readonly LinkedChangeRow[]>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(async () => {
    const overlaps = await port.detectOverlaps()
    if (!specId) {
      return []
    }
    const entry = overlaps.entries.find((e) => e.specId === specId)
    return entry?.changes ?? []
  }, [port, specId])

  return useAsyncResource(`spec-linked-changes:${specId ?? ''}`, load, {
    enabled: Boolean(specId),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
