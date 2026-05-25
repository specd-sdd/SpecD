import {
  testRemoteConnection,
  type ProjectDto,
  type RemoteConnectionProfile,
} from '@specd/client'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { cn } from '../lib/cn.js'

export type ConnectPanelProps = {
  onConnected: (profile: RemoteConnectionProfile, project: ProjectDto) => void
  className?: string
}

export function ConnectPanel({ onConnected, className }: ConnectPanelProps): React.ReactElement {
  const [apiBaseUrl, setApiBaseUrl] = React.useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:4400',
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
        'mx-auto flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-panel p-6 shadow-lg',
        className,
      )}
    >
      <div>
        <h1 className="text-sm font-semibold tracking-tight">Connect to SpecD API</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the remote API base URL. Connection is verified with GET /v1/project.
        </p>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">API base URL</span>
        <Input
          value={apiBaseUrl}
          onChange={(e) => setApiBaseUrl(e.target.value)}
          placeholder="http://127.0.0.1:4400"
          autoComplete="url"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Bearer token (optional)</span>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Optional"
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {error}
        </p>
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
        <Button type="button" variant="secondary" onClick={() => void handleTest()} disabled={testing}>
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Test connection
        </Button>
        <Button type="button" onClick={handleConnect} disabled={!project}>
          Open Studio
        </Button>
      </div>
    </div>
  )
}
