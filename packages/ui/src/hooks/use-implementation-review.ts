import type { ImplementationReviewDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

export function useImplementationReview(
  changeName: string | undefined,
  options: { refreshKey?: number; poll?: boolean } = {},
): ReturnType<typeof useAsyncResource<ImplementationReviewDto>> {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true

  const load = React.useCallback(
    () => port.getImplementationReview(changeName!),
    [port, changeName],
  )

  return useAsyncResource(`implementation-review:${changeName ?? ''}`, load, {
    enabled: Boolean(changeName),
    refreshKey: poll ? options.refreshKey : undefined,
  })
}
