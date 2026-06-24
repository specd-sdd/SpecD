import type { SpecSummaryDto } from '@specd/client'
import * as React from 'react'
import { Badge } from '../../components/ui/badge.js'
import { Button } from '../../components/ui/button.js'
import type { FailedClosedSpec } from '../../hooks/use-closed-specs-validation.js'
import type { WorkspaceSpecsEntry } from '../../hooks/use-workspace-specs-collection.js'

export type WorkspacesHubViewProps = {
  entries: readonly WorkspaceSpecsEntry[]
  loading: boolean
  failedClosedSpecs: readonly FailedClosedSpec[]
  onSelectSpec: (workspace: string, path: string) => void
}

export function WorkspacesHubView({
  entries,
  loading,
  failedClosedSpecs,
  onSelectSpec,
}: WorkspacesHubViewProps): React.ReactElement {
  const failedSpecIds = React.useMemo(() => {
    return new Set(failedClosedSpecs.map((item) => item.specId))
  }, [failedClosedSpecs])

  const specCount = entries.reduce((total, entry) => total + entry.specs.length, 0)

  return (
    <div
      className="studio-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
      data-testid="studio-workspaces-hub"
    >
      <header className="mb-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Workspaces – Specs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length} workspaces · {specCount} specs
          {failedClosedSpecs.length > 0
            ? ` · ${failedClosedSpecs.length} validation issue(s)`
            : ''}
        </p>
      </header>

      {loading ? <p className="text-sm text-muted-foreground">Loading workspace specs…</p> : null}

      {entries.map((entry) => (
        <section key={entry.workspace.name} className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-mono text-sm font-medium text-foreground">{entry.workspace.name}</h2>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {entry.specs.length}
            </Badge>
          </div>
          {entry.error ? (
            <p className="text-sm text-destructive">{entry.error.message}</p>
          ) : (
            <SpecRows
              workspace={entry.workspace.name}
              specs={entry.specs}
              failedSpecIds={failedSpecIds}
              onSelectSpec={onSelectSpec}
            />
          )}
        </section>
      ))}
    </div>
  )
}

function SpecRows({
  workspace,
  specs,
  failedSpecIds,
  onSelectSpec,
}: {
  workspace: string
  specs: readonly SpecSummaryDto[]
  failedSpecIds: ReadonlySet<string>
  onSelectSpec: (workspace: string, path: string) => void
}): React.ReactElement {
  const flat = flattenSpecs(specs)

  if (flat.length === 0) {
    return <p className="text-sm text-muted-foreground">No specs in workspace</p>
  }

  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-background/30">
      {flat.map((spec) => {
        const failed = failedSpecIds.has(spec.specId)
        return (
          <li key={spec.specId}>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left hover:bg-accent/50"
              data-testid={`studio-workspaces-hub-row-${spec.specId.replace(/[:/]/g, '-')}`}
              onClick={() => onSelectSpec(workspace, spec.path)}
            >
              <div className="min-w-0 flex-1">
                <div className="break-all font-mono text-sm text-foreground">
                  {workspace}:{spec.path}
                </div>
                {spec.title ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{spec.title}</div>
                ) : null}
              </div>
              <Badge
                variant={failed ? 'destructive' : 'secondary'}
                className="shrink-0 text-[9px] uppercase"
              >
                {failed ? 'drift' : 'ok'}
              </Badge>
            </Button>
          </li>
        )
      })}
    </ul>
  )
}

function flattenSpecs(specs: readonly SpecSummaryDto[]): SpecSummaryDto[] {
  const rows: SpecSummaryDto[] = []
  const visit = (nodes: readonly SpecSummaryDto[]) => {
    for (const node of nodes) {
      rows.push(node)
      if (node.children?.length) {
        visit(node.children)
      }
    }
  }
  visit(specs)
  return rows
}
