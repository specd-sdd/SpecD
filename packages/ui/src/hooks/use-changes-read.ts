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

type StatusCacheEntry = {
  readonly lastModified: string | undefined
  readonly status: ChangeStatusDto | undefined
}

const EMPTY_STATUS_CACHE: StatusCacheEntry = {
  lastModified: undefined,
  status: undefined,
}

function applyStatusPollResult(entry: StatusCacheEntry, next: ChangeStatusDto): StatusCacheEntry {
  if (next.unchanged === true) {
    return entry
  }
  return { status: next, lastModified: next.updatedAt }
}

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
  const statusCacheKey = changeReadCacheKey(listSection, `change-status:${changeName ?? ''}`)
  const statusCacheRef = React.useRef(new Map<string, StatusCacheEntry>())

  const loadDetail = React.useCallback(
    () => loadChangeDetail(port, changeName!, listSection),
    [port, changeName, listSection],
  )
  const loadStatus = React.useCallback(() => {
    const key = changeReadCacheKey(listSection, `change-status:${changeName ?? ''}`)
    const cached = statusCacheRef.current.get(key)
    return loadChangeStatus(port, changeName!, listSection, {
      ifModifiedSince: cached?.lastModified ?? options.ifModifiedSince,
    })
  }, [port, changeName, listSection, options.ifModifiedSince])

  const detail = useAsyncResource(
    changeReadCacheKey(listSection, `change-detail:${changeName ?? ''}`),
    loadDetail,
    {
      enabled,
      refreshKey: options.detailRefreshKey,
    },
  )

  const statusResource = useAsyncResource(statusCacheKey, loadStatus, {
    enabled: enabled && pollStatus,
    refreshKey: options.refreshKey,
  })

  const [statusData, setStatusData] = React.useState<ChangeStatusDto | undefined>(
    () => statusCacheRef.current.get(statusCacheKey)?.status,
  )
  const [lastModified, setLastModified] = React.useState<string | undefined>(
    () => statusCacheRef.current.get(statusCacheKey)?.lastModified ?? options.ifModifiedSince,
  )

  React.useEffect(() => {
    const cached = statusCacheRef.current.get(statusCacheKey)
    setStatusData(cached?.status)
    setLastModified(cached?.lastModified ?? options.ifModifiedSince)
  }, [statusCacheKey, options.ifModifiedSince])

  React.useEffect(() => {
    const next = statusResource.data
    if (!next || next.name !== changeName) {
      return
    }
    const prev = statusCacheRef.current.get(statusCacheKey) ?? EMPTY_STATUS_CACHE
    const entry = applyStatusPollResult(prev, next)
    statusCacheRef.current.set(statusCacheKey, entry)
    if (entry.status !== undefined) {
      setStatusData(entry.status)
      setLastModified(entry.lastModified)
    }
  }, [statusResource.data, statusCacheKey, changeName])

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
