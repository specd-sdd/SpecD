import type { ChangeSummaryDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from './use-async-resource.js'

/**
 *
 * @param refreshKey
 */
export function useChangesCollection(refreshKey = 0): {
  active: ReturnType<typeof useAsyncResource<readonly ChangeSummaryDto[]>>
  drafts: ReturnType<typeof useAsyncResource<readonly ChangeSummaryDto[]>>
  discarded: ReturnType<typeof useAsyncResource<readonly ChangeSummaryDto[]>>
  archived: ReturnType<typeof useAsyncResource<readonly ChangeSummaryDto[]>>
} {
  const port = useSpecdDataPort()

  const loadActive = React.useCallback(() => port.listChanges(), [port])
  const loadDrafts = React.useCallback(() => port.listDrafts(), [port])
  const loadDiscarded = React.useCallback(() => port.listDiscarded(), [port])
  const loadArchived = React.useCallback(() => port.listArchived(), [port])

  const active = useAsyncResource('changes-active', loadActive, { refreshKey })
  const drafts = useAsyncResource('changes-drafts', loadDrafts, { refreshKey })
  const discarded = useAsyncResource('changes-discarded', loadDiscarded, { refreshKey })
  const archived = useAsyncResource('changes-archived', loadArchived, { refreshKey })

  return { active, drafts, discarded, archived }
}
