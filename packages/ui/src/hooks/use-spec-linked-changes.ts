import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export type LinkedChangeRow = {
  readonly name: string
  readonly description?: string
  readonly state: string
}

export function useSpecLinkedChanges(
  specId: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<readonly LinkedChangeRow[]>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(async () => {
    if (!specId) {
      return []
    }
    const active = await port.listChanges()
    return active.filter((change) => change.specIds.includes(specId)).map((change) => ({
      name: change.name,
      description: change.description,
      state: change.state,
    }))
  }, [port, specId])

  return useAsyncResource(`spec-linked-changes:${specId ?? ''}`, load, {
    enabled: Boolean(specId),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
