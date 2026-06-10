import {
  testRemoteConnection,
  type ProjectDto,
  type RemoteConnectionProfile,
} from '@specd/client'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertDescription } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { cn } from '../lib/utils.js'

export type ConnectPanelProps = {
  onConnected: (profile: RemoteConnectionProfile, project: ProjectDto) => void
  /** Pre-filled API base when auto-connect failed (e.g. from `specd ui serve`). */
  defaultApiBaseUrl?: string
  className?: string
}

export function ConnectPanel({
  onConnected,
  defaultApiBaseUrl,
  className,
}: ConnectPanelProps): React.ReactElement {
  const [apiBaseUrl, setApiBaseUrl] = React.useState(
    () =>
      defaultApiBaseUrl ??
      (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4450'),
  )
  const [token, setToken] = React.useState('')
  const [error, setError] = React.useState<string | undefined>()
  const [project, setProject] = React.useState<ProjectDto | undefined>()
  const [testing, setTesting] = React.useState(false)

  const handleTest = async () => {
    setTesting(true)
    setError(undefined)
    setProject(undefined)
    try {
      const result = await testRemoteConnection({
        apiBaseUrl,
        bearerToken: token || undefined,
      })
      setProject(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  const handleConnect = () => {
    if (!project) return
    onConnected({
      kind: 'remote',
      apiBaseUrl,
      token: token || undefined,
    }, project)
  }

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-panel p-6 shadow-2xl',
        className,
      )}
    >
      <div>
        <div className="mb-3 inline-flex rounded-md border border-border bg-panel-header px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Remote Session
        </div>
        <h1 className="text-sm font-semibold uppercase tracking-[0.14em] text-foreground">
          Connect to SpecD API
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the API base URL (host, or full URL including /v1). Verified with GET /v1/project.
          For `specd ui serve` with Vite, use the API URL printed in the terminal (e.g.
          http://127.0.0.1:4450) — the CLI adds the UI origin to CORS automatically.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (project) {
            handleConnect()
            return
          }
          void handleTest()
        }}
      >
        <label className="flex flex-col gap-1 text-xs" htmlFor="connect-api-base-url">
          <span className="text-muted-foreground">API base URL</span>
          <Input
            id="connect-api-base-url"
            name="apiBaseUrl"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:4450"
            autoComplete="url"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs" htmlFor="connect-bearer-token">
          <span className="text-muted-foreground">Bearer token (optional)</span>
          <Input
            id="connect-bearer-token"
            name="bearerToken"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </label>

        {error ? (
          <Alert variant="destructive" className="px-3 py-2 text-xs">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {project ? (
          <div className="rounded border border-border bg-background/50 px-3 py-2 text-xs">
            <p>
              <span className="text-muted-foreground">Project:</span> {project.name}
            </p>
            <p>
              <span className="text-muted-foreground">Auth:</span> {project.auth.type}
            </p>
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleTest()}
            disabled={testing}
          >
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Test connection
          </Button>
          <Button type="submit" disabled={testing && !project}>
            Open Studio
          </Button>
        </div>
      </form>
    </div>
  )
}
