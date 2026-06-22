import {
  createRemoteSpecdDataAdapter,
  testRemoteConnection,
  LocalStorageUserStorage,
  FileUserStorage,
  type ProjectDto,
  type RemoteConnectionProfile,
  type SpecdDataPort,
  type IUserStorage,
} from '@specd/client'
import * as React from 'react'
import { SpecdDataProvider } from './context/specd-data-context.js'
import { useChangesCollection } from './hooks/use-changes-collection.js'
import { useProjectPoll } from './hooks/use-project-poll.js'
import { StudioErrorBoundary } from './components/StudioErrorBoundary.js'
import { ShellLayout } from './shell/ShellLayout.js'
import { WelcomeScreen } from './welcome/WelcomeScreen.js'

export type SpecdAppMode = 'embedded' | 'standalone' | 'desktop'

export type SpecdAppProps = {
  mode: SpecdAppMode
  /** Pre-wired port (embedded / desktop local). */
  port?: SpecdDataPort
  /** Saved remote profile for standalone / desktop remote. */
  connectionProfile?: RemoteConnectionProfile
  className?: string
  storage?: IUserStorage
  onOpenLocalProject?: (path: string) => void
}

function StudioShell({
  mode,
  storage,
}: {
  mode: SpecdAppMode
  storage: IUserStorage
}): React.ReactElement {
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
      storage={storage}
      project={project.data}
      projectStatus={status.data}
      connectionLabel={
        mode === 'embedded'
          ? 'Local session'
          : mode === 'desktop'
            ? 'Desktop session'
            : 'Remote API'
      }
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
  storage,
  onOpenLocalProject,
  children,
}: {
  initialProfile?: RemoteConnectionProfile
  storage: IUserStorage
  onOpenLocalProject?: (path: string) => void
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
      <WelcomeScreen
        storage={storage}
        defaultApiBaseUrl={initialProfile?.apiBaseUrl}
        autoFailed={autoFailed}
        onConnected={(nextProfile, nextProject) => {
          setProfile(nextProfile)
          setProject(nextProject)
        }}
        onOpenLocalProject={onOpenLocalProject}
      />
    )
  }

  return <>{children(port, project)}</>
}

export function SpecdApp({
  mode,
  port: portProp,
  connectionProfile,
  className,
  storage: storageProp,
  onOpenLocalProject,
}: SpecdAppProps): React.ReactElement {
  const skipConnect = mode === 'embedded' && portProp !== undefined

  const storage = React.useMemo(() => {
    if (storageProp) return storageProp
    return typeof window !== 'undefined' && (window as any).specd
      ? new FileUserStorage()
      : new LocalStorageUserStorage()
  }, [storageProp])

  React.useEffect(() => {
    const theme = storage.get<'light' | 'dark'>('theme') || 'dark'
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }, [storage])

  if (skipConnect && portProp) {
    return (
      <div className={className ?? 'h-screen w-screen overflow-hidden'}>
        <SpecdDataProvider port={portProp}>
          <StudioErrorBoundary>
            <StudioShell mode={mode} storage={storage} />
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
      <RemoteStudioGate
        initialProfile={connectionProfile}
        storage={storage}
        onOpenLocalProject={onOpenLocalProject}
      >
        {(port) => (
          <SpecdDataProvider port={port}>
            <StudioErrorBoundary>
              <StudioShell mode={mode} storage={storage} />
            </StudioErrorBoundary>
          </SpecdDataProvider>
        )}
      </RemoteStudioGate>
    </div>
  )
}

