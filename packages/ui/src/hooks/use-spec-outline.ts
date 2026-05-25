import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

function normalizeOutlineRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value as readonly Record<string, unknown>[]
  }
  if (value !== null && typeof value === 'object') {
    return [value as Record<string, unknown>]
  }
  return []
}

export function useSpecOutline(
  workspace: string | undefined,
  specPath: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<readonly Record<string, unknown>[]>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(async () => {
    const rows = await port.getSpecOutline(workspace!, specPath!)
    return normalizeOutlineRows(rows)
  }, [port, workspace, specPath])

  return useAsyncResource(`spec-outline:${workspace}:${specPath}`, load, {
    enabled: Boolean(workspace && specPath),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
