import type { ArtifactContentDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads a tracked change artifact for the editor / inspector.
 *
 * @param changeName - Active change name.
 * @param filename - Artifact filename within the change directory.
 * @param refreshKey - Refetch when selection or poll tick changes.
 */
export function useChangeArtifact(
  changeName: string | undefined,
  filename: string | undefined,
  refreshKey = 0,
  options: { poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<ArtifactContentDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true
  const load = React.useCallback(
    () => port.getChangeArtifact(changeName!, filename!),
    [port, changeName, filename],
  )
  return useAsyncResource(`change-artifact:${changeName ?? ''}:${filename ?? ''}`, load, {
    enabled: Boolean(changeName && filename),
    refreshKey: poll ? refreshKey : undefined,
    pauseRefreshOnError: true,
  })
}
