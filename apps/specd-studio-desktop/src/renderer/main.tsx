import { OpenProjectDialog, SpecdApp } from '@specd/ui'
import '@specd/ui/styles.css'
import { StrictMode, useEffect, useMemo, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { FileUserStorage, LocalStorageUserStorage, testRemoteConnection } from '@specd/client'
import type { ProjectDto, RemoteConnectionProfile, SpecdDataPort } from '@specd/client'
import type { DesktopRecentConnection, DesktopSession } from '../preload/bridge.js'
import { createDesktopLocalDataAdapter } from './desktop-local-data-adapter.js'

type ActiveSession =
  | { kind: 'local'; port: SpecdDataPort; path: string }
  | { kind: 'remote'; apiBaseUrl: string; token?: string }
  | null

/**
 * Preserves the optional token field shape used by desktop session state.
 *
 * @param token - The optional token to include.
 * @returns An object that only includes `token` when present.
 */
function withOptionalToken(token: string | undefined): { token?: string } {
  return token === undefined ? {} : { token }
}

/**
 * Preserves the optional bearer token field shape used by the remote adapter.
 *
 * @param token - The optional bearer token to include.
 * @returns An object that only includes `bearerToken` when present.
 */
function withOptionalBearerToken(token: string | undefined): { bearerToken?: string } {
  return token === undefined ? {} : { bearerToken: token }
}

/**
 * Renders the static Studio backdrop shown before any project is selected.
 *
 * @returns A shell-like background that matches Studio chroming.
 */
function StudioBackdrop(): ReactElement {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-panel lg:flex lg:flex-col">
        <div className="border-b border-border bg-panel-header px-5 py-4">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
              SD
            </div>
            <div>
              <div className="font-semibold tracking-tight">SpecD Studio</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Desktop
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            Open a local workspace or connect to a remote API to start a session.
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {['Active Changes', 'Drafts', 'Archived'].map((label) => (
            <div key={label} className="studio-card px-3 py-3">
              <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded bg-border/70" />
                <div className="h-3 w-3/4 rounded bg-border/50" />
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex items-center justify-between border-b border-border bg-panel-header px-5 py-3">
          <div className="space-y-2">
            <div className="h-3 w-32 rounded bg-border/70" />
            <div className="h-2 w-48 rounded bg-border/50" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-md border border-border bg-panel" />
            <div className="h-8 w-28 rounded-md border border-border bg-panel" />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="studio-card min-h-[22rem] px-4 py-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-24 rounded bg-border/70" />
                <div className="h-2 w-40 rounded bg-border/50" />
              </div>
              <div className="h-8 w-28 rounded-md border border-border bg-background/60" />
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="rounded-lg border border-border bg-background/50 p-4">
                  <div className="mb-3 h-3 w-24 rounded bg-border/70" />
                  <div className="mb-2 h-2 w-full rounded bg-border/50" />
                  <div className="h-2 w-2/3 rounded bg-border/40" />
                </div>
              ))}
            </div>
          </section>
          <section className="hidden xl:block">
            <div className="studio-card h-full px-4 py-4">
              <div className="mb-4 h-3 w-28 rounded bg-border/70" />
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <div key={index} className="rounded-md border border-border bg-background/50 px-3 py-3">
                    <div className="mb-2 h-2 w-24 rounded bg-border/60" />
                    <div className="h-2 w-3/4 rounded bg-border/40" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

/**
 * Bootstraps the desktop renderer, restoring sessions and handling the shared open-project dialog.
 *
 * @returns The root renderer element for the desktop host.
 */
function DesktopBootstrap(): ReactElement {
  const [ipcReady, setIpcReady] = useState(false)
  const [ipcError, setIpcError] = useState<string | undefined>()
  const [activeSession, setActiveSession] = useState<ActiveSession>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [dialogError, setDialogError] = useState<string | undefined>()
  const [dialogRefreshKey, setDialogRefreshKey] = useState(0)

  const localPort = window.specd ? createDesktopLocalDataAdapter(window.specd) : undefined
  const storage = useMemo(() => {
    return window.specd ? new FileUserStorage() : new LocalStorageUserStorage()
  }, [])

  useEffect(() => {
    const theme = storage.get<'light' | 'dark'>('theme') || 'dark'
    if (theme === 'light') {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    }
  }, [storage])

  useEffect(() => {
    if (window.specd?.platform) {
      document.documentElement.dataset.platform = window.specd.platform
    }
  }, [])

  /**
   * Opens the shared project chooser dialog.
   *
   * @returns Nothing.
   */
  const openProjectDialog = (): void => {
    setDialogError(undefined)
    setSessionDialogOpen(true)
  }

  /**
   * Activates the chosen local session and hides the chooser.
   *
   * @param path - The opened workspace path.
   * @returns Nothing.
   */
  const activateLocalSession = (path: string): void => {
    if (!localPort) {
      return
    }
    setActiveSession({
      kind: 'local',
      port: localPort,
      path,
    })
    setSessionDialogOpen(false)
    setDialogError(undefined)
  }

  /**
   * Activates a remote session and hides the chooser.
   *
   * @param profile - The remote connection details.
   * @param project - The resolved project metadata from the API.
   * @returns A promise that resolves when the session has switched.
   */
  const handleConnectRemote = (
    profile: RemoteConnectionProfile,
    project: ProjectDto,
  ): Promise<void> => {
    void project
    setActiveSession({
      kind: 'remote',
      apiBaseUrl: profile.apiBaseUrl,
      ...withOptionalToken(profile.token),
    })
    setSessionDialogOpen(false)
    setDialogError(undefined)
    return Promise.resolve()
  }

  /**
   * Restores a recent entry and keeps the current session until the switch succeeds.
   *
   * @param recent - The recent connection selected by the user.
   * @returns A promise that resolves when the action finishes.
   */
  const handleSelectRecent = async (recent: DesktopRecentConnection): Promise<void> => {
    setDialogError(undefined)

    try {
      if (recent.kind === 'local' && recent.path) {
        if (!window.specd || !localPort) {
          return
        }
        const res = (await window.specd.invoke('openLocalProject', recent.path)) as {
          path: string
          project: ProjectDto
        }
        void res.project
        activateLocalSession(res.path)
        return
      }

      if (recent.kind === 'remote' && recent.apiBaseUrl) {
        await testRemoteConnection({
          apiBaseUrl: recent.apiBaseUrl,
          ...withOptionalBearerToken(recent.token),
        })
        setActiveSession({
          kind: 'remote',
          apiBaseUrl: recent.apiBaseUrl,
          ...withOptionalToken(recent.token),
        })
        setSessionDialogOpen(false)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDialogError(message)
      if (recent.kind === 'local' && window.specd) {
        try {
          await window.specd.invoke('removeRecent', recent)
        } catch {}
      }
    }
  }

  /**
   * Opens a local project selected through the shared dialog.
   *
   * @param path - The selected workspace path.
   * @returns A promise that resolves once the project is switched.
   */
  const handleOpenLocalProject = async (path: string): Promise<void> => {
    await handleSelectRecent({ kind: 'local', path })
  }

  /**
   * Closes the active project and reopens the chooser over the empty shell.
   *
   * @returns A promise that resolves when the close flow finishes.
   */
  const handleCloseProject = async (): Promise<void> => {
    if (!window.specd) {
      return
    }
    try {
      await window.specd.invoke('closeSession')
      setActiveSession(null)
      openProjectDialog()
    } catch (err) {
      console.error('Failed to close project:', err)
    }
  }

  /**
   * Clears persisted recents and refreshes the shared dialog state.
   *
   * @returns A promise that resolves once persistence has been updated.
   */
  const handleClearRecents = async (): Promise<void> => {
    if (!window.specd) {
      return
    }
    try {
      await window.specd.invoke('clearRecents')
      setDialogRefreshKey((current) => current + 1)
    } catch (err) {
      console.error('Failed to clear recents:', err)
    }
  }

  useEffect(() => {
    if (!window.specd) {
      setIpcError('Preload bridge unavailable')
      setIpcReady(true)
      setSessionDialogOpen(true)
      return
    }

    const specdBridge = window.specd

    void specdBridge
      .ping()
      .then(async () => {
        setIpcReady(true)

        try {
          const session = (await specdBridge.invoke('getCurrentSession')) as DesktopSession
          if (session?.path) {
            if (!localPort) {
              return
            }
            const res = (await specdBridge.invoke('openLocalProject', session.path)) as {
              path: string
              project: ProjectDto
            }
            void res.project
            activateLocalSession(res.path)
            return
          }
        } catch (err) {
          console.warn('No active local session loaded:', err)
        }

        openProjectDialog()
      })
      .catch((err: unknown) => {
        setIpcError(err instanceof Error ? err.message : String(err))
        setIpcReady(true)
        setSessionDialogOpen(true)
      })

    const unsubscribeMenuTriggerOpen = specdBridge.onSessionChange((session) => {
      if (session === null) {
        setActiveSession(null)
        openProjectDialog()
      }
    })
    const unsubscribeSelectRecent = specdBridge.onSelectRecent((recent) => {
      void handleSelectRecent(recent)
    })
    const unsubscribeOpenProject = specdBridge.onTriggerOpenProject(() => {
      openProjectDialog()
    })
    const unsubscribeClearRecents = specdBridge.onTriggerClearRecents(() => {
      void handleClearRecents()
    })
    const unsubscribeClose = specdBridge.onTriggerClose(() => {
      void handleCloseProject()
    })

    return () => {
      unsubscribeMenuTriggerOpen()
      unsubscribeSelectRecent()
      unsubscribeOpenProject()
      unsubscribeClearRecents()
      unsubscribeClose()
    }
  }, [])

  if (!ipcReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Starting SpecD Studio…
      </div>
    )
  }

  const background = activeSession ? (
    activeSession.kind === 'local' ? (
      <SpecdApp mode="embedded" port={activeSession.port} className="h-screen w-screen" />
    ) : (
      <SpecdApp
        mode="desktop"
        connectionProfile={{
          kind: 'remote',
          apiBaseUrl: activeSession.apiBaseUrl,
          ...withOptionalToken(activeSession.token),
        }}
        className="h-screen w-screen"
      />
    )
  ) : (
    <StudioBackdrop />
  )
  const resolvedDialogError = dialogError ?? ipcError
  const dialogErrorProps =
    resolvedDialogError !== undefined ? { errorMessage: resolvedDialogError } : {}

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {background}
      <OpenProjectDialog
        storage={storage}
        open={sessionDialogOpen}
        allowDismiss={activeSession !== null}
        onOpenChange={setSessionDialogOpen}
        refreshKey={dialogRefreshKey}
        {...dialogErrorProps}
        onConnected={(profile, project) => {
          void handleConnectRemote(profile, project)
        }}
        onOpenLocalProject={(path) => {
          void handleOpenLocalProject(path)
        }}
      />
    </div>
  )
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <DesktopBootstrap />
  </StrictMode>,
)
