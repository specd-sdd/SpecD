import type { ChangeDetailDto, ChangeStatusDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 *
 * @param changeName
 * @param options
 * @param options.ifModifiedSince
 * @param options.refreshKey
 */
export function useChangesRead(
  changeName: string | undefined,
  options: {
    ifModifiedSince?: string
    refreshKey?: number
    /** When set, detail refetches on this key; omit to load once per change. */
    detailRefreshKey?: number
  } = {},
): {
  detail: ReturnType<typeof useAsyncResource<ChangeDetailDto>>
  status: ReturnType<typeof useAsyncResource<ChangeStatusDto>>
  lastModified: string | undefined
} {
  const port = useSpecdDataPort()
  const enabled = Boolean(changeName)
  const [lastModified, setLastModified] = React.useState<string | undefined>(
    options.ifModifiedSince,
  )

  const loadDetail = React.useCallback(() => port.getChange(changeName!), [port, changeName])
  const loadStatus = React.useCallback(
    () =>
      port.getChangeStatus(changeName!, {
        ifModifiedSince: lastModified,
      }),
    [port, changeName, lastModified],
  )

  const detail = useAsyncResource(`change-detail:${changeName ?? ''}`, loadDetail, {
    enabled,
    refreshKey: options.detailRefreshKey,
  })

  const statusResource = useAsyncResource(`change-status:${changeName ?? ''}`, loadStatus, {
    enabled,
    refreshKey: options.refreshKey,
  })

  const [statusData, setStatusData] = React.useState<ChangeStatusDto | undefined>()

  React.useEffect(() => {
    setStatusData(undefined)
  }, [changeName])

  React.useEffect(() => {
    const next = statusResource.data
    if (!next) {
      return
    }
    if (next.unchanged === true) {
      return
    }
    setStatusData(next)
    setLastModified(next.updatedAt)
  }, [statusResource.data])

  const status = React.useMemo(
    () => ({
      ...statusResource,
      data: statusData,
      isLoading: statusResource.isLoading && statusData === undefined,
    }),
    [statusResource, statusData],
  )

  return { detail, status, lastModified }
}
