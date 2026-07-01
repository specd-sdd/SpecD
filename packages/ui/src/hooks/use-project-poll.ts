import type { ProjectDto, ProjectStatusDto } from '@specd/client'
import * as React from 'react'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { publishProjectPollSession } from './project-poll-session.js'
import { useAsyncResource } from './use-async-resource.js'

const POLL_MS = 2500

/**
 *
 * @param options
 * @param options.poll
 */
export function useProjectPoll(options: { poll?: boolean } = {}): {
  project: ReturnType<typeof useAsyncResource<ProjectDto>>
  status: ReturnType<typeof useAsyncResource<ProjectStatusDto>>
  refreshKey: number
} {
  const port = useSpecdDataPort()
  const poll = options.poll ?? true
  const [focused, setFocused] = React.useState(
    typeof document !== 'undefined' ? document.hasFocus() : true,
  )
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    const onFocus = () => setFocused(true)
    const onBlur = () => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  React.useEffect(() => {
    if (!poll || !focused) {
      return
    }
    const id = window.setInterval(() => {
      setRefreshKey((n) => n + 1)
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [poll, focused])

  const loadProject = React.useCallback(() => port.getProject(), [port])
  const loadStatus = React.useCallback(() => port.getProjectStatus(), [port])

  const project = useAsyncResource('project', loadProject, { refreshKey })
  const status = useAsyncResource('project-status', loadStatus, { refreshKey })

  const refetch = React.useCallback(() => {
    project.refetch()
    status.refetch()
  }, [project, status])

  React.useEffect(() => {
    publishProjectPollSession({
      project: project.data,
      projectStatus: status.data,
      refreshKey,
      isLoading: project.isLoading || status.isLoading,
      error: project.error ?? status.error,
      refetch,
    })
  }, [
    project.data,
    project.error,
    project.isLoading,
    status.data,
    status.error,
    status.isLoading,
    refreshKey,
    refetch,
  ])

  return { project, status, refreshKey }
}

export { useProjectPollSession } from './project-poll-session.js'
