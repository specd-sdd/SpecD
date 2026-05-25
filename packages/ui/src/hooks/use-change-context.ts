import type { CompiledContextDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useChangeContext(
  changeName: string | undefined,
  options: {
    refreshKey?: number
    poll?: boolean
    /** Lifecycle step; defaults to API mapping from change `state`. */
    step?: string
  } = {},
): ReturnType<typeof useAsyncResource<CompiledContextDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true
  const step = options.step

  const load = React.useCallback(
    () =>
      port.getChangeContext(changeName!, {
        ...(step !== undefined ? { step } : {}),
        includeChangeSpecs: true,
      }),
    [port, changeName, step],
  )

  return useAsyncResource(`change-context:${changeName ?? ''}:${step ?? ''}`, load, {
    enabled: Boolean(changeName),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
