import {
  createRemoteSpecdDataAdapter,
  testRemoteConnection,
  type ProjectDto,
  type RemoteConnectionProfile,
  type SpecdDataPort,
} from '@specd/client'
import * as React from 'react'
import { ConnectPanel } from './connect/ConnectPanel.js'
import { SpecdDataProvider } from './context/specd-data-context.js'
import { useChangesCollection } from './hooks/use-changes-collection.js'
import { useProjectPoll } from './hooks/use-project-poll.js'
import { StudioErrorBoundary } from './components/StudioErrorBoundary.js'
import { ShellLayout } from './shell/ShellLayout.js'

export type SpecdAppMode = 'embedded' | 'standalone' | 'desktop'

export type SpecdAppProps = {
  mode: SpecdAppMode
  /** Pre-wired port (embedded / desktop local). */
  port?: SpecdDataPort
  /** Saved remote profile for standalone / desktop remote. */
  connectionProfile?: RemoteConnectionProfile
  className?: string
}

function StudioShell({ mode }: { mode: SpecdAppMode }): React.ReactElement {
  const { project, status, refreshKey } = useProjectPoll({ poll: true })
  const collections = useChangesCollection(refreshKey)

  const loadingActive =
    project.isLoading ||
    collections.active.isLoading ||
    collections.drafts.isLoading

  const loadingLabel = project.isLoading
    ? 'Loading project…'
    : collections.active.isLoading
      ? 'Refreshing changes…'
      : undefined

  return (
    <ShellLayout
      project={project.data}
      projectStatus={status.data}
      connectionLabel={mode === 'desktop' ? 'Desktop session' : 'Remote API'}
      runtimeLabel={mode}
      refreshKey={refreshKey}
      changes={{
        active: collections.active.data ?? [],
        drafts: collections.drafts.data ?? [],
        archived: collections.archived.data ?? [],
        discarded: collections.discarded.data ?? [],
        error: collections.active.error ?? collections.drafts.error,
      }}
      loading={{ active: loadingActive, label: loadingLabel }}
    />
  )
}

function RemoteStudioGate({
  initialProfile,
  children,
}: {
  initialProfile?: RemoteConnectionProfile
  children: (port: SpecdDataPort, project: ProjectDto) => React.ReactNode
}): React.ReactElement {
  const [profile, setProfile] = React.useState<RemoteConnectionProfile | undefined>(
    initialProfile,
  )
  const [project, setProject] = React.useState<ProjectDto | undefined>()
  const [autoFailed, setAutoFailed] = React.useState(false)
  const [autoTrying, setAutoTrying] = React.useState(
    () => typeof window !== 'undefined' && !initialProfile,
  )

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    if (profile && project) {
      setAutoTrying(false)
      return
    }

    const apiBaseUrl = profile?.apiBaseUrl ?? initialProfile?.apiBaseUrl ?? window.location.origin
    let cancelled = false
    void testRemoteConnection({ apiBaseUrl })
      .then((nextProject) => {
        if (cancelled) return
        setProfile({ kind: 'remote', apiBaseUrl })
        setProject(nextProject)
      })
      .catch(() => {
        if (!cancelled) setAutoFailed(true)
      })
      .finally(() => {
        if (!cancelled) setAutoTrying(false)
      })
    return () => {
      cancelled = true
    }
  }, [initialProfile, profile, project])

  const port = React.useMemo(
    () =>
      profile
        ? createRemoteSpecdDataAdapter({
            apiBaseUrl: profile.apiBaseUrl,
            bearerToken: profile.token,
          })
        : undefined,
    [profile?.apiBaseUrl, profile?.token],
  )

  if (autoTrying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-xs text-muted-foreground">
        Connecting to {typeof window !== 'undefined' ? window.location.origin : 'API'}…
      </div>
    )
  }

  if (!profile || !project || !port) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <ConnectPanel
          defaultApiBaseUrl={initialProfile?.apiBaseUrl}
          onConnected={(nextProfile, nextProject) => {
            setProfile(nextProfile)
            setProject(nextProject)
          }}
        />
        {autoFailed ? (
          <p className="sr-only">Auto-connect to same-origin API failed; use the form above.</p>
        ) : null}
      </div>
    )
  }

  return <>{children(port, project)}</>
}

export function SpecdApp({
  mode,
  port: portProp,
  connectionProfile,
  className,
}: SpecdAppProps): React.ReactElement {
  const skipConnect = mode === 'embedded' && portProp !== undefined

  if (skipConnect && portProp) {
    return (
      <div className={className ?? 'h-screen w-screen overflow-hidden'}>
          <SpecdDataProvider port={portProp}>
            <StudioErrorBoundary>
              <StudioShell mode={mode} />
            </StudioErrorBoundary>
          </SpecdDataProvider>
        </div>
    )
  }

  if (mode === 'embedded') {
    return (
      <div className={className ?? 'flex h-full items-center justify-center p-6 text-xs text-muted-foreground'}>
        Embedded mode requires a SpecdDataPort instance.
      </div>
    )
  }

  return (
    <div className={className ?? 'h-screen w-screen overflow-hidden'}>
      <RemoteStudioGate initialProfile={connectionProfile}>
        {(port) => (
          <SpecdDataProvider port={port}>
            <StudioErrorBoundary>
              <StudioShell mode={mode} />
            </StudioErrorBoundary>
          </SpecdDataProvider>
        )}
      </RemoteStudioGate>
    </div>
  )
}
