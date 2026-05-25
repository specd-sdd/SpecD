import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'
import {
  groupChangeArtifactEntries,
  type ArtifactFileItem,
  type ArtifactScopeGroup,
  type ArtifactSpecGroup,
  type ArtifactTypeGroup,
} from '../lib/group-change-artifacts.js'

export type { ArtifactFileItem, ArtifactScopeGroup, ArtifactSpecGroup, ArtifactTypeGroup }

/**
 * Fetches the flat artifact list for a change and groups by scope (change, spec).
 * Uses the dedicated `/artifacts` endpoint — not the status short-circuit.
 */
export function useChangeArtifactList(
  changeName: string | undefined,
  refreshKey = 0,
  options: { poll?: boolean } = {},
): {
  scopeGroups: readonly ArtifactScopeGroup[]
  isLoading: boolean
  error: Error | undefined
} {
  const poll = options.poll ?? true
  const port = useSpecdDataPort()

  const load = React.useCallback(async () => {
    const raw = await port.listChangeArtifacts(changeName!)
    const items: Array<{
      filename: string
      type?: string
      artifactType?: string
      state?: string
      displayStatus?: string
    }> = Array.isArray(raw)
      ? (raw as unknown[] as typeof items)
      : (((raw as unknown as { artifacts?: unknown[] }).artifacts ?? []) as typeof items)

    return groupChangeArtifactEntries(items)
  }, [port, changeName])

  const resource = useAsyncResource<readonly ArtifactScopeGroup[]>(
    `change-artifact-list:${changeName ?? ''}`,
    load,
    { enabled: Boolean(changeName), refreshKey: poll ? refreshKey : undefined },
  )

  return {
    scopeGroups: resource.data ?? [],
    isLoading: resource.isLoading,
    error: resource.error,
  }
}
