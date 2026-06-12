import * as React from 'react'
import type { ChangeListSection } from '../change/change-list-section.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import {
  changeReadCacheKey,
  listChangeArtifactsForSection,
  type ChangeReadSection,
} from '../lib/change-read-routes.js'
import { useAsyncResource } from './use-async-resource.js'
import {
  groupChangeArtifactEntries,
  type ArtifactFileItem,
  type ArtifactScopeGroup,
  type ArtifactSpecGroup,
  type ArtifactTypeGroup,
} from '../lib/group-change-artifacts.js'

export type { ArtifactFileItem, ArtifactScopeGroup, ArtifactSpecGroup, ArtifactTypeGroup }

const EMPTY_ARRAY = [] as const

/**
 * Fetches the flat artifact list for a change and groups by scope (change, spec).
 * Uses the dedicated `/artifacts` endpoint — not the status short-circuit.
 */
export function useChangeArtifactList(
  changeName: string | undefined,
  refreshKey = 0,
  options: { poll?: boolean; listSection?: ChangeListSection | null } = {},
): {
  items: ReadonlyArray<{
    filename: string
    type?: string
    artifactType?: string
    hasTasks?: boolean
    totalTasks?: number
    completedTasks?: number
    state?: string
    displayStatus?: string
  }>
  scopeGroups: readonly ArtifactScopeGroup[]
  isLoading: boolean
  error: Error | undefined
} {
  const poll = options.poll ?? true
  const port = useSpecdDataPort()
  const listSection: ChangeReadSection = options.listSection ?? null

  const load = React.useCallback(async () => {
    const raw = await listChangeArtifactsForSection(port, changeName!, listSection)
    const items: Array<{
      filename: string
      type?: string
      artifactType?: string
      hasTasks?: boolean
      totalTasks?: number
      completedTasks?: number
      state?: string
      displayStatus?: string
    }> = Array.isArray(raw)
      ? (raw as unknown[] as typeof items)
      : (((raw as unknown as { artifacts?: unknown[] }).artifacts ?? []) as typeof items)

    return {
      items,
      grouped: groupChangeArtifactEntries(items),
    }
  }, [port, changeName, listSection])

  const resource = useAsyncResource<{
    readonly items: ReadonlyArray<{
      filename: string
      type?: string
      artifactType?: string
      hasTasks?: boolean
      totalTasks?: number
      completedTasks?: number
      state?: string
      displayStatus?: string
    }>
    readonly grouped: readonly ArtifactScopeGroup[]
  }>(changeReadCacheKey(listSection, `change-artifact-list:${changeName ?? ''}`), load, {
    enabled: Boolean(changeName),
    refreshKey: poll ? refreshKey : undefined,
  })

  return {
    items: resource.data?.items ?? EMPTY_ARRAY,
    scopeGroups: resource.data?.grouped ?? EMPTY_ARRAY,
    isLoading: resource.isLoading,
    error: resource.error,
  }
}
