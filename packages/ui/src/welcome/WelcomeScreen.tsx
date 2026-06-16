import {
  testRemoteConnection,
  type ProjectDto,
  type RemoteConnectionProfile,
  type IUserStorage,
} from '@specd/client'
import { FolderOpen, Server, Clock, ArrowRight, Trash2, ShieldAlert } from 'lucide-react'
import * as React from 'react'
import { ConnectPanel } from '../connect/ConnectPanel.js'
import { StudioDialog } from '../components/StudioDialog.js'
import { Alert, AlertDescription } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'

/**
 * Represents a recent local or remote connection shown in the project chooser.
 */
export interface RecentConnection {
  kind: 'local' | 'remote'
  path?: string
  apiBaseUrl?: string
  token?: string
}

type ElectronBridge = {
  invoke: (method: string, payload?: unknown) => Promise<unknown>
}

/**
 * Describes the shared open-project dialog behavior used by Studio hosts.
 */
export type OpenProjectDialogProps = {
  storage: IUserStorage
  onConnected: (profile: RemoteConnectionProfile, project: ProjectDto) => void
  defaultApiBaseUrl?: string
  autoFailed?: boolean
  onOpenLocalProject?: (path: string) => void
  open?: boolean
  allowDismiss?: boolean
  onOpenChange?: (open: boolean) => void
  errorMessage?: string
  title?: string
  refreshKey?: number
}

/**
 * Backward-compatible alias for the shared open-project dialog props.
 */
export type WelcomeScreenProps = OpenProjectDialogProps

/**
 * Returns the Electron preload bridge when available.
 *
 * @returns The typed preload bridge, or `undefined` outside Electron.
 */
function resolveElectronBridge(): ElectronBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as typeof window & { specd?: ElectronBridge }).specd
}

/**
 * Reusable Studio project chooser used both as the startup screen and as the desktop modal.
 *
 * @param props - Dialog inputs and callbacks.
 * @returns The chooser UI.
 */
export function OpenProjectDialog({
  storage,
  onConnected,
  defaultApiBaseUrl,
  autoFailed,
  onOpenLocalProject,
  open,
  allowDismiss = false,
  onOpenChange,
  errorMessage,
  title = 'Open SpecD Project',
  refreshKey,
}: OpenProjectDialogProps): React.ReactElement {
  const [recents, setRecents] = React.useState<RecentConnection[]>([])
  const [isElectron, setIsElectron] = React.useState(false)
  const [connectingRecent, setConnectingRecent] = React.useState<number | null>(null)
  const [recentError, setRecentError] = React.useState<string | undefined>()
  const [remoteDialogOpen, setRemoteDialogOpen] = React.useState(false)

  React.useEffect(() => {
    setIsElectron(resolveElectronBridge() !== undefined)

    const storedRecents = storage.get<RecentConnection[]>('recentConnections')
    if (storedRecents && Array.isArray(storedRecents)) {
      setRecents(storedRecents)
    }
  }, [storage, open, refreshKey])

  const saveRecents = React.useCallback(
    (newRecents: RecentConnection[]): void => {
      storage.set('recentConnections', newRecents)
      setRecents(newRecents)
    },
    [storage],
  )

  const addRecent = React.useCallback(
    (item: RecentConnection): void => {
      const filtered = recents.filter((recent) => {
        if (item.kind === 'local' && recent.kind === 'local') {
          return recent.path !== item.path
        }
        if (item.kind === 'remote' && recent.kind === 'remote') {
          return recent.apiBaseUrl !== item.apiBaseUrl
        }
        return true
      })
      saveRecents([item, ...filtered].slice(0, 10))
    },
    [recents, saveRecents],
  )

  const removeRecent = React.useCallback(
    (index: number, event: React.MouseEvent): void => {
      event.stopPropagation()
      saveRecents(recents.filter((_, currentIndex) => currentIndex !== index))
    },
    [recents, saveRecents],
  )

  const clearRecents = React.useCallback((): void => {
    saveRecents([])
  }, [saveRecents])

  const handleOpenLocal = React.useCallback(async (): Promise<void> => {
    const bridge = resolveElectronBridge()
    if (!bridge) {
      return
    }

    try {
      const result = (await bridge.invoke('openDirectory')) as {
        canceled: boolean
        path?: string
        filePaths?: string[]
      }
      if (result.canceled) {
        return
      }

      const path = result.path ?? result.filePaths?.[0]
      if (!path) {
        return
      }

      addRecent({ kind: 'local', path })
      onOpenLocalProject?.(path)
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : String(err))
    }
  }, [addRecent, onOpenLocalProject])

  const handleRecentClick = React.useCallback(
    async (item: RecentConnection, index: number): Promise<void> => {
      setRecentError(undefined)

      if (item.kind === 'local') {
        if (item.path) {
          onOpenLocalProject?.(item.path)
        }
        return
      }

      if (item.kind === 'remote' && item.apiBaseUrl) {
        setConnectingRecent(index)
        try {
          const project = await testRemoteConnection({
            apiBaseUrl: item.apiBaseUrl,
            bearerToken: item.token,
          })
          onConnected(
            {
              kind: 'remote',
              apiBaseUrl: item.apiBaseUrl,
              token: item.token,
            },
            project,
          )
          addRecent(item)
        } catch (err) {
          setRecentError(err instanceof Error ? err.message : String(err))
        } finally {
          setConnectingRecent(null)
        }
      }
    },
    [addRecent, onConnected, onOpenLocalProject],
  )

  const handleConnectedAndAddRecent = React.useCallback(
    (profile: RemoteConnectionProfile, project: ProjectDto): void => {
      addRecent({
        kind: 'remote',
        apiBaseUrl: profile.apiBaseUrl,
        token: profile.token,
      })
      setRemoteDialogOpen(false)
      onConnected(profile, project)
    },
    [addRecent, onConnected],
  )

  const panel = (
    <div className="flex h-[28rem] w-[min(48rem,calc(100vw-2rem))] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-2xl">
      <div className="border-b border-border bg-panel-header px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-sm font-semibold text-primary">
            SD
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Open a local workspace or restore a remote session without leaving the
              Studio shell.
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-border bg-background/40 lg:border-b-0 lg:border-r">
          <div className="flex h-full min-h-0 flex-col p-5">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Recent Sessions</span>
                </div>
                {recents.length > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={clearRecents}
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                ) : null}
              </div>

              {recents.length === 0 ? (
                <div className="studio-card flex min-h-[12rem] items-center justify-center border-dashed px-5 text-center text-xs leading-relaxed text-muted-foreground">
                  No recent sessions yet.
                </div>
              ) : (
                <div className="studio-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {recents.map((item, idx) => (
                    <div
                      key={`${item.kind}-${item.path ?? item.apiBaseUrl ?? idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        void handleRecentClick(item, idx)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          void handleRecentClick(item, idx)
                        }
                      }}
                      className="studio-card group flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-accent/60"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-panel-header text-muted-foreground">
                          {item.kind === 'local' ? (
                            <FolderOpen className="h-4 w-4 text-[var(--studio-warning)]" />
                          ) : (
                            <Server className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {item.kind === 'local' ? item.path?.split('/').pop() : item.apiBaseUrl}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.kind === 'local' ? item.path : 'Remote API connection'}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {connectingRecent === idx ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        ) : (
                          <>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(event) => removeRecent(idx, event)}
                              className="h-7 w-7 text-muted-foreground hover:bg-background/80 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-border pt-4 text-[11px] text-muted-foreground">
              Version 1.0.0
            </div>
          </div>
        </aside>

        <main className="min-h-0 bg-panel">
          <div className="flex h-full min-h-0 flex-col justify-between gap-6 p-6 lg:p-7">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                Open a SpecD Project
              </h2>
            </div>

            {recentError ?? errorMessage ? (
              <Alert variant="destructive" className="max-w-2xl px-4 py-3 text-xs">
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>{recentError ?? errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            <div className={`grid gap-4 ${isElectron ? 'sm:grid-cols-2' : ''}`}>
              {isElectron ? (
                <section className="studio-card flex h-full flex-col gap-4 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <FolderOpen className="h-4 w-4 text-[var(--studio-warning)]" />
                    <span>Local Workspace</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Open specs and change artifacts directly from your machine.
                  </p>
                  <div className="mt-auto">
                    <Button onClick={() => void handleOpenLocal()} className="w-full justify-between">
                      <span>Select Folder</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </section>
              ) : null}

              <section className="studio-card flex h-full flex-col gap-4 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Server className="h-4 w-4 text-primary" />
                  <span>Remote SpecD API</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Connect to a running SpecD server.
                </p>
                {autoFailed ? (
                  <div className="studio-card border-[var(--studio-warning)]/30 bg-[var(--studio-warning)]/5 px-4 py-3 text-xs leading-relaxed text-[var(--studio-warning)]">
                    Automatic API connection failed. Open the remote dialog and review
                    the endpoint settings manually.
                  </div>
                ) : null}
                <div className="mt-auto">
                  <Button
                    variant={isElectron ? 'secondary' : 'default'}
                    onClick={() => setRemoteDialogOpen(true)}
                    className="w-full justify-between"
                  >
                    <span>Connect to Remote</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </div>
  )

  return (
    <>
      {open === undefined ? (
        <div className="flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-4 text-foreground">
          {panel}
        </div>
      ) : open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 py-4 backdrop-blur-[2px]">
          {allowDismiss ? (
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close open project dialog"
              onClick={() => onOpenChange?.(false)}
            />
          ) : null}
          <div
            className="relative"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            {panel}
          </div>
        </div>
      ) : null}

      <StudioDialog
        open={remoteDialogOpen}
        title="Connect to Remote SpecD API"
        titleId="welcome-remote-connect"
        actions={null}
        className="w-[min(92vw,36rem)]"
        onOpenChange={setRemoteDialogOpen}
      >
        <ConnectPanel
          className="mx-0 max-w-none border-0 bg-transparent p-0 shadow-none"
          defaultApiBaseUrl={defaultApiBaseUrl}
          onConnected={handleConnectedAndAddRecent}
        />
      </StudioDialog>
    </>
  )
}

/**
 * Backward-compatible startup screen wrapper around the shared project chooser.
 *
 * @param props - Screen inputs and callbacks.
 * @returns The fullscreen startup chooser.
 */
export function WelcomeScreen(props: WelcomeScreenProps): React.ReactElement {
  return <OpenProjectDialog {...props} />
}
