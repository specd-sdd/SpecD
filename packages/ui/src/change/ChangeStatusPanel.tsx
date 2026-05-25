import type { ChangeStatusDto } from '@specd/client'
import * as React from 'react'

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
        <section className="mb-3 rounded border border-border bg-background/40 p-2">
          <h2 className="mb-1 font-medium text-muted-foreground">Next action</h2>
          <p>{status.nextAction.reason}</p>
          <p className="mt-1 text-muted-foreground">
            {status.nextAction.actionType} → {status.nextAction.targetStep}
          </p>
          {status.nextAction.command ? (
            <pre className="mt-2 overflow-auto rounded bg-panel p-2 font-mono text-xs">
              {status.nextAction.command}
            </pre>
          ) : null}
        </section>
      ) : null}

      {status.blockers && status.blockers.length > 0 ? (
        <section className="mb-3 rounded border border-destructive/30 bg-destructive/5 p-2">
          <h2 className="mb-1 font-medium text-destructive">Blockers</h2>
          <ul className="space-y-1">
            {status.blockers.map((b) => (
              <li key={`${b.code}-${b.message}`}>
                <span className="font-mono">{b.code}</span>: {b.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status.lifecycle ? (
        <section className="mb-3 rounded border border-border bg-background/40 p-2">
          <h2 className="mb-1 font-medium text-muted-foreground">Lifecycle</h2>
          <p className="text-muted-foreground">Available transitions</p>
          <p className="font-mono">{status.lifecycle.availableTransitions.join(', ') || '—'}</p>
        </section>
      ) : null}

      {!embedded && status.artifacts && status.artifacts.length > 0 ? (
        <section className="rounded border border-border bg-background/40 p-2">
          <h2 className="mb-2 font-medium text-muted-foreground">Artifacts</h2>
          <ul className="space-y-2">
            {status.artifacts.map((artifact) => (
              <li key={artifact.type}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{artifact.type}</span>
                  <span className="text-muted-foreground">{artifact.displayStatus}</span>
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
        </section>
      ) : null}
    </div>
  )
}
