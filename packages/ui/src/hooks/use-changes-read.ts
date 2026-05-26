import type { ChangeDetailDto, ChangeStatusDto } from '@specd/client'
import * as React from 'react'
import type { ChangeListSection } from '../change/change-list-section.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import {
  changeReadCacheKey,
  loadChangeDetail,
  loadChangeStatus,
  type ChangeReadSection,
} from '../lib/change-read-routes.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 *
 * @param changeName
 * @param options
 * @param options.ifModifiedSince
 * @param options.refreshKey
 * @param options.listSection - Sidebar list (`draft` / `discarded` / `active`); defaults to active routes.
 * @param options.pollStatus - When false, skips `getChangeStatus` / draft / discarded status polling.
 */
export function useChangesRead(
  changeName: string | undefined,
  options: {
    ifModifiedSince?: string
    refreshKey?: number
    /** When set, detail refetches on this key; omit to load once per change. */
    detailRefreshKey?: number
    listSection?: ChangeListSection | null
    pollStatus?: boolean
  } = {},
): {
  detail: ReturnType<typeof useAsyncResource<ChangeDetailDto>>
  status: ReturnType<typeof useAsyncResource<ChangeStatusDto>>
  lastModified: string | undefined
} {
  const port = useSpecdDataPort()
  const listSection: ChangeReadSection = options.listSection ?? null
  const pollStatus = options.pollStatus ?? true
  const enabled = Boolean(changeName)
  const [lastModified, setLastModified] = React.useState<string | undefined>(
    options.ifModifiedSince,
  )

  const loadDetail = React.useCallback(
    () => loadChangeDetail(port, changeName!, listSection),
    [port, changeName, listSection],
  )
  const loadStatus = React.useCallback(
    () =>
      loadChangeStatus(port, changeName!, listSection, {
        ifModifiedSince: lastModified,
      }),
    [port, changeName, listSection, lastModified],
  )

  const detail = useAsyncResource(
    changeReadCacheKey(listSection, `change-detail:${changeName ?? ''}`),
    loadDetail,
    {
      enabled,
      refreshKey: options.detailRefreshKey,
    },
  )

  const statusResource = useAsyncResource(
    changeReadCacheKey(listSection, `change-status:${changeName ?? ''}`),
    loadStatus,
    {
      enabled: enabled && pollStatus,
      refreshKey: options.refreshKey,
    },
  )

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
