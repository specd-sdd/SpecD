import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads a single archived change snapshot (read-only).
 */
export function useArchivedChange(
  name: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<ChangeDetailDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? false

  const load = React.useCallback(() => port.getArchivedChange(name!), [port, name])

  return useAsyncResource(`archived-change:${name ?? ''}`, load, {
    enabled: Boolean(name),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
