import type { ChangeStatusDto } from '@specd/client'
import { AlertTriangle } from 'lucide-react'
import * as React from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../components/ui/alert.js'
import { Badge } from '../components/ui/badge.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'

export function ChangeStatusPanel({
  status,
  loading,
  error,
  embedded = false,
}: {
  status: ChangeStatusDto | undefined
  loading: boolean
  error?: Error
  /** When true, renders inline inside Overview (no full-tab chrome). */
  embedded?: boolean
}): React.ReactElement {
  if (error) {
    return (
      <div className={embedded ? 'text-destructive' : 'p-3 text-xs text-destructive'}>
        {error.message}
      </div>
    )
  }

  if (loading && !status) {
    return (
      <p className="text-muted-foreground">
        {embedded ? 'Loading workflow status…' : 'Loading status…'}
      </p>
    )
  }

  if (!status) {
    return (
      <p className="text-muted-foreground">
        {embedded ? 'Workflow status unavailable.' : 'No status available'}
      </p>
    )
  }

  if (status.unchanged) {
    return (
      <p className="text-muted-foreground">
        Status unchanged since {status.updatedAt}
      </p>
    )
  }

  return (
    <div className={embedded ? 'space-y-3' : 'min-h-0 flex-1 overflow-auto p-3 text-xs'}>
      <dl className="mb-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">State</dt>
          <dd>{status.state}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Updated</dt>
          <dd className="font-mono">{status.updatedAt}</dd>
        </div>
      </dl>

      {status.nextAction ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Next action</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{status.nextAction.reason}</p>
            <p className="mt-1 text-muted-foreground">
              {status.nextAction.actionType} → {status.nextAction.targetStep}
            </p>
            {status.nextAction.command ? (
              <pre className="mt-2 overflow-auto rounded bg-panel p-2 font-mono text-xs">
                {status.nextAction.command}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {status.blockers && status.blockers.length > 0 ? (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-[11px] font-bold uppercase tracking-wider">Blockers</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 space-y-1">
              {status.blockers.map((b) => (
                <li key={`${b.code}-${b.message}`} className="flex items-start gap-2">
                  <Badge variant="destructive" className="h-4 shrink-0 px-1 text-[9px] font-mono">
                    {b.code}
                  </Badge>
                  <span className="text-xs">{b.message}</span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {status.lifecycle ? (
        <Card className="mb-3">
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Available transitions</p>
            <p className="font-mono">{status.lifecycle.availableTransitions.join(', ') || '—'}</p>
          </CardContent>
        </Card>
      ) : null}

      {!embedded && status.artifacts && status.artifacts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Artifacts</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {status.artifacts.map((artifact) => (
                <li key={artifact.type}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{artifact.type}</span>
                    <Badge>{artifact.displayStatus}</Badge>
                  </div>
                  <ul className="mt-1 space-y-0.5 pl-2 text-muted-foreground">
                    {artifact.files.map((file) => (
                      <li key={file.key} className="font-mono">
                        {file.filename}
                        {' · '}
                        {file.displayStatus}
                        {file.hasDrift ? ' · drift' : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
