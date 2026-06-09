import type { ArtifactContentDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import {
  changeReadCacheKey,
  loadChangeArtifactForSection,
  type ChangeReadSection,
} from '../lib/change-read-routes.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads a tracked change artifact for the editor / inspector.
 *
 * @param changeName - Change name.
 * @param filename - Artifact filename within the change directory.
 * @param refreshKey - Refetch when selection or poll tick changes.
 */
export function useChangeArtifact(
  changeName: string | undefined,
  filename: string | undefined,
  refreshKey = 0,
  options: {
    poll?: boolean
    listSection?: ChangeReadSection
    enabled?: boolean
  } = {},
): ReturnType<typeof useAsyncResource<ArtifactContentDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true
  const listSection: ChangeReadSection = options.listSection ?? null
  const enabled = (options.enabled ?? true) && Boolean(changeName && filename)
  const load = React.useCallback(
    () => loadChangeArtifactForSection(port, changeName!, filename!, listSection),
    [port, changeName, filename, listSection],
  )
  return useAsyncResource(
    changeReadCacheKey(listSection, `change-artifact:${changeName ?? ''}:${filename ?? ''}`),
    load,
    {
      enabled,
      refreshKey: poll ? refreshKey : undefined,
      pauseRefreshOnError: true,
    },
  )
}

/**
 * Loads multiple tracked change artifacts in one resource.
 *
 * @param changeName - Change name.
 * @param filenames - Artifact filenames within the change directory.
 * @param refreshKey - Refetch when selection or poll tick changes.
 */
export function useChangeArtifacts(
  changeName: string | undefined,
  filenames: readonly string[],
  refreshKey = 0,
  options: {
    poll?: boolean
    listSection?: ChangeReadSection
    enabled?: boolean
  } = {},
): ReturnType<typeof useAsyncResource<readonly ArtifactContentDto[]>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true
  const listSection: ChangeReadSection = options.listSection ?? null
  const normalizedFilenames = React.useMemo(
    () => [...new Set(filenames)].filter((filename) => filename.length > 0),
    [filenames],
  )
  const enabled =
    (options.enabled ?? true) && Boolean(changeName) && normalizedFilenames.length > 0
  const load = React.useCallback(
    () =>
      Promise.all(
        normalizedFilenames.map((filename) =>
          loadChangeArtifactForSection(port, changeName!, filename, listSection),
        ),
      ),
    [port, changeName, normalizedFilenames, listSection],
  )
  return useAsyncResource(
    changeReadCacheKey(
      listSection,
      `change-artifacts:${changeName ?? ''}:${normalizedFilenames.join('|')}`,
    ),
    load,
    {
      enabled,
      refreshKey: poll ? refreshKey : undefined,
      pauseRefreshOnError: true,
    },
  )
}
