import type { SpecDetailDto } from '@specd/client'
import { ChevronRight, FileText } from 'lucide-react'
import * as React from 'react'
import { useSpecLinkedChanges } from '../hooks/use-spec-linked-changes.js'
import { useSpecRead } from '../hooks/use-spec-read.js'
import { useSpecOutline } from '../hooks/use-spec-outline.js'
import { useSpecGraphView } from '../hooks/use-spec-graph-view.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import { cn } from '../lib/cn.js'
import { SpecTabs, type SpecView } from '../tabs/SpecTabs.js'
import { SpecOverview } from './SpecOverview.js'

export type SpecMainViewProps = {
  workspace: string | undefined
  specPath: string | undefined
  refreshKey: number
  onSelectArtifact?: (filename: string) => void
  selectedArtifactFile?: string
}

export function SpecMainView({
  workspace,
  specPath,
  refreshKey,
  onSelectArtifact,
  selectedArtifactFile,
}: SpecMainViewProps): React.ReactElement {
  const [view, setView] = React.useState<SpecView>('Overview')

  const pollDetailTab = view === 'Overview' || view === 'Metadata' || view === 'Dependencies'
  const pollContextTab = view === 'Context'
  const detailPollKey = useTabScopedPollKey(pollDetailTab, refreshKey)
  const contextPollKey = useTabScopedPollKey(pollContextTab, refreshKey)
  const outlinePollKey = useTabScopedPollKey(view === 'Outline', refreshKey)
  const graphPollKey = useTabScopedPollKey(view === 'Graph', refreshKey)

  const specRead = useSpecRead(workspace, specPath, {
    detailRefreshKey: detailPollKey,
    contextRefreshKey: contextPollKey,
    pollDetail: pollDetailTab,
    pollArtifact: false,
    pollContext: pollContextTab,
  })

  const outline = useSpecOutline(workspace, specPath, {
    refreshKey: outlinePollKey,
    poll: view === 'Outline',
  })
  const specGraph = useSpecGraphView(workspace, specPath, {
    refreshKey: graphPollKey,
    poll: view === 'Graph',
  })

  const specId = specRead.detail.data?.specId
  const linkedPollKey = useTabScopedPollKey(view === 'Linked Changes', refreshKey)
  const linkedChanges = useSpecLinkedChanges(specId, {
    poll: view === 'Linked Changes',
    refreshKey: linkedPollKey,
  })

  React.useEffect(() => {
    setView('Overview')
  }, [workspace, specPath])

  if (!workspace || !specPath) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-muted-foreground">
        Select a spec from the workspace tree
      </div>
    )
  }

  const pathSegments = specPath.split('/')
  const spec = specRead.detail.data

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border bg-panel-header px-3 py-1.5">
        <div className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <span>Workspaces</span>
          <ChevronRight className="h-2.5 w-2.5" />
          <span>{workspace}</span>
          {pathSegments.slice(0, -1).map((segment) => (
            <React.Fragment key={segment}>
              <ChevronRight className="h-2.5 w-2.5" />
              <span>{segment}</span>
            </React.Fragment>
          ))}
          <ChevronRight className="h-2.5 w-2.5" />
          <span className="text-foreground/80">{pathSegments[pathSegments.length - 1]}</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xs font-semibold text-foreground">
            {spec?.title ?? specPath}
          </h1>
          <span className="inline-flex items-center rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            active
          </span>
          {spec?.specId ? (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
              {spec.specId}
            </span>
          ) : null}
        </div>
      </div>

      <SpecTabs workspace={workspace} specPath={specPath} active={view} onActiveChange={setView} />

      {specRead.detail.error ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {specRead.detail.error.message}
        </div>
      ) : null}

      {view === 'Overview' ? (
        specRead.detail.isLoading && !specRead.detail.data ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Loading spec…
          </div>
        ) : specRead.detail.data ? (
          <SpecOverview spec={specRead.detail.data} />
        ) : null
      ) : null}

      {view === 'Artifacts' ? (
        <SpecArtifactsList
          spec={spec}
          loading={specRead.detail.isLoading}
          selected={selectedArtifactFile}
          onSelect={onSelectArtifact}
        />
      ) : null}

      {view === 'Context' ? (
        specRead.context.isLoading && !specRead.context.data ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Loading context…
          </div>
        ) : specRead.context.error ? (
          <div className="p-3 text-xs text-destructive">{specRead.context.error.message}</div>
        ) : (
          <pre className="studio-scrollbar min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-foreground/90">
            {specRead.context.data?.content ??
              specRead.context.data?.entries
                ?.map((e) => e.content ?? '')
                .filter(Boolean)
                .join('\n\n') ??
              'No context entries'}
          </pre>
        )
      ) : null}

      {view === 'Linked Changes' ? (
        <LinkedChangesPanel
          linkedChanges={linkedChanges.data ?? []}
          loading={linkedChanges.isLoading}
          error={linkedChanges.error}
        />
      ) : null}

      {view === 'Metadata' ? (
        <SpecMetadataPanel spec={specRead.detail.data} loading={specRead.detail.isLoading} />
      ) : null}

      {view === 'Dependencies' ? (
        <SpecDependenciesPanel
          spec={specRead.detail.data}
          loading={specRead.detail.isLoading}
        />
      ) : null}

      {view === 'Outline' ? (
        <SpecOutlinePanel
          outline={outline.data}
          loading={outline.isLoading}
          error={outline.error}
        />
      ) : null}

      {view === 'Graph' ? (
        <SpecGraphPanel
          data={specGraph.data}
          loading={specGraph.isLoading}
          error={specGraph.error}
        />
      ) : null}
    </div>
  )
}

function SpecArtifactsList({
  spec,
  loading,
  selected,
  onSelect,
}: {
  spec: SpecDetailDto | undefined
  loading: boolean
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  if (loading && !spec) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading artifacts…
      </div>
    )
  }

  const artifacts = spec?.artifacts ?? []

  if (artifacts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No artifacts
      </div>
    )
  }

  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      <div className="studio-card overflow-hidden">
        <div className="border-b border-border px-3 py-2 text-xs font-medium capitalize text-foreground">
          Canonical artifacts
        </div>
        <ul className="py-1">
          {artifacts.map((a) => (
            <li key={a.filename}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-background/60',
                  selected === a.filename && 'bg-background/80 text-foreground',
                )}
                onClick={() => onSelect?.(a.filename)}
              >
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {a.filename}
                </span>
                {a.hash ? (
                  <span className="font-mono text-[10px] text-muted-foreground/50">
                    {a.hash.slice(0, 8)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const STATE_COLOR: Record<string, string> = {
  exploring: 'text-sky-400',
  designing: 'text-violet-400',
  implementing: 'text-amber-400',
  verifying: 'text-orange-400',
  done: 'text-emerald-400',
  archivable: 'text-emerald-500',
}

function LinkedChangesPanel({
  linkedChanges,
  loading,
  error,
}: {
  linkedChanges: readonly { name: string; state: string }[]
  loading: boolean
  error?: Error
}): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Linked Changes
      </div>
      {error ? (
        <p className="text-destructive">{error.message}</p>
      ) : loading && linkedChanges.length === 0 ? (
        <p className="text-muted-foreground">Loading overlaps…</p>
      ) : linkedChanges.length === 0 ? (
        <p className="text-muted-foreground">No changes overlap this spec.</p>
      ) : (
        <ul className="space-y-1">
          {linkedChanges.map((c) => (
            <li
              key={c.name}
              className="studio-card flex items-center gap-3 p-2"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {c.name}
              </span>
              <span
                className={cn(
                  'capitalize',
                  STATE_COLOR[c.state] ?? 'text-muted-foreground',
                )}
              >
                {c.state}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SpecMetadataPanel({
  spec,
  loading,
}: {
  spec: SpecDetailDto | undefined
  loading: boolean
}): React.ReactElement {
  if (loading && !spec) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading metadata…
      </div>
    )
  }
  if (!spec) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No spec metadata
      </div>
    )
  }
  const rows: { label: string; value: string }[] = [
    { label: 'Spec ID', value: spec.specId },
    { label: 'Workspace', value: spec.workspace },
    { label: 'Path', value: spec.path },
    { label: 'Title', value: spec.title ?? '—' },
    { label: 'Description', value: spec.description ?? '—' },
  ]
  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-auto p-4 text-xs">
      <dl className="studio-card space-y-3 p-4">
        {rows.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 break-all text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SpecDependenciesPanel({
  spec,
  loading,
}: {
  spec: SpecDetailDto | undefined
  loading: boolean
}): React.ReactElement {
  if (loading && !spec) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading dependencies…
      </div>
    )
  }
  const deps = spec?.dependsOn ?? []
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      {deps.length === 0 ? (
        <p className="text-muted-foreground">No declared dependencies.</p>
      ) : (
        <ul className="space-y-1 font-mono">
          {deps.map((id) => (
            <li key={id} className="studio-card px-3 py-2 text-foreground">
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SpecOutlinePanel({
  outline,
  loading,
  error,
}: {
  outline: readonly Record<string, unknown>[] | undefined
  loading: boolean
  error?: Error
}): React.ReactElement {
  if (loading && !outline?.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading outline…
      </div>
    )
  }
  if (error) {
    return <div className="p-3 text-xs text-destructive">{error.message}</div>
  }
  return (
    <pre className="studio-scrollbar min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-foreground/90">
      {outline?.length ? JSON.stringify(outline, null, 2) : 'No outline for this spec.'}
    </pre>
  )
}

function SpecGraphPanel({
  data,
  loading,
  error,
}: {
  data: Record<string, unknown> | undefined
  loading: boolean
  error?: Error
}): React.ReactElement {
  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading graph view…
      </div>
    )
  }
  if (error) {
    return <div className="p-3 text-xs text-destructive">{error.message}</div>
  }
  return (
    <pre className="studio-scrollbar min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-foreground/90">
      {data ? JSON.stringify(data, null, 2) : 'No graph view for this spec.'}
    </pre>
  )
}
