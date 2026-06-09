import * as React from 'react'
import type { GraphImpactDto } from '@specd/client'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 * Loads graph impact for the currently selected spec through `PortGraph`.
 *
 * @param workspace - Selected workspace name.
 * @param specPath - Selected spec path relative to the workspace.
 * @param options - Polling and traversal controls.
 * @returns Async resource state for the spec impact request.
 */
export function useSpecImpact(
  workspace: string | undefined,
  specPath: string | undefined,
  options: { refreshKey?: number; poll?: boolean; depth?: number } = {},
): ReturnType<typeof useAsyncResource<GraphImpactDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(
    () =>
      port.getImpact({
        spec: `${workspace}:${specPath}`,
        direction: 'dependents',
        depth: options.depth,
      }),
    [options.depth, port, specPath, workspace],
  )

  return useAsyncResource<GraphImpactDto>(`spec-impact:${workspace}:${specPath}`, load, {
    enabled: Boolean(workspace && specPath),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
