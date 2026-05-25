import type { ArtifactContentDto, CompiledContextDto, SpecDetailDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads spec detail, optional artifact body, and compiled context for a workspace path.
 */
export function useSpecRead(
  workspace: string | undefined,
  specPath: string | undefined,
  options: {
    artifactFilename?: string
    refreshKey?: number
    detailRefreshKey?: number
    contextRefreshKey?: number
    pollDetail?: boolean
    pollArtifact?: boolean
    pollContext?: boolean
  } = {},
): {
  detail: ReturnType<typeof useAsyncResource<SpecDetailDto>>
  artifact: ReturnType<typeof useAsyncResource<ArtifactContentDto>>
  context: ReturnType<typeof useAsyncResource<CompiledContextDto>>
} {
  const port = useSpecdDataPort()
  const enabled = Boolean(workspace && specPath)
  const artifactFilename = options.artifactFilename ?? 'spec.md'

  const loadDetail = React.useCallback(
    () => port.getSpec(workspace!, specPath!),
    [port, workspace, specPath],
  )
  const loadArtifact = React.useCallback(
    () => port.getSpecArtifact(workspace!, specPath!, artifactFilename),
    [port, workspace, specPath, artifactFilename],
  )
  const loadContext = React.useCallback(
    () => port.getSpecContext(workspace!, specPath!),
    [port, workspace, specPath],
  )

  const pollDetail = options.pollDetail ?? true
  const pollArtifact = options.pollArtifact ?? true
  const pollContext = options.pollContext ?? true
  const detailKey = options.detailRefreshKey ?? options.refreshKey
  const contextKey = options.contextRefreshKey ?? options.refreshKey
  const artifactKey = options.refreshKey

  const detail = useAsyncResource(`spec-detail:${workspace}:${specPath}`, loadDetail, {
    enabled,
    refreshKey: pollDetail ? detailKey : undefined,
  })
  const artifact = useAsyncResource(
    `spec-artifact:${workspace}:${specPath}:${artifactFilename}`,
    loadArtifact,
    { enabled, refreshKey: pollArtifact ? artifactKey : undefined },
  )
  const context = useAsyncResource(`spec-context:${workspace}:${specPath}`, loadContext, {
    enabled,
    refreshKey: pollContext ? contextKey : undefined,
  })

  return { detail, artifact, context }
}
