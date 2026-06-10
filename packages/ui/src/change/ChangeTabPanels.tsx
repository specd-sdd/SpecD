import type {
  ChangeDetailDto,
  ChangeHistoryEventDto,
  ChangeStatusDto,
  GraphFileRefDto,
  GraphSymbolRefDto,
} from '@specd/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import * as React from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import { Separator } from '../components/ui/separator.js'
import { cn } from '../lib/utils.js'
import type { ChangeReadSection } from '../lib/change-read-routes.js'
import { useChangeArtifacts } from '../hooks/use-change-artifact.js'
import { formatChangeArtifactError } from '../lib/change-read-routes.js'
import { useChangeContext } from '../hooks/use-change-context.js'
import { useChangeGraphView } from '../hooks/use-change-graph-view.js'
import { useImplementationReview } from '../hooks/use-implementation-review.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import { useChangeArtifactList } from '../hooks/use-change-artifact-list.js'
import { buildImpactViewModel, type ImpactSpecTracked } from './merge-impact-view.js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function formatHistoryActor(by: ChangeHistoryEventDto['by']): string {
  if (by === undefined) return ''
  if (typeof by === 'string') return by
  if (typeof by === 'object' && 'name' in by) {
    return by.email ? `${by.name} <${by.email}>` : by.name
  }
  return ''
}

const HISTORY_HEADER_KEYS = new Set(['type', 'at', 'by'])

function historyEventDetailEntries(
  event: ChangeHistoryEventDto,
): ReadonlyArray<readonly [string, unknown]> {
  return Object.entries(event).filter(([key]) => !HISTORY_HEADER_KEYS.has(key))
}

function formatHistoryDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value, null, 2)
}

function ChangeHistoryEventRow({
  event,
  index,
}: {
  event: ChangeHistoryEventDto
  index: number
}): React.ReactElement {
  const details = historyEventDetailEntries(event)
  const actor = formatHistoryActor(event.by)
  const rowKey = `${event.type}-${event.at}-${index}`

  return (
    <AccordionItem
      value={rowKey}
      data-testid={`studio-event-row-${index}`}
      className="overflow-hidden rounded-md border border-border bg-background/25"
    >
      <AccordionTrigger className="px-3 py-2 hover:bg-muted/30 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground">
        <div className="flex flex-1 flex-col items-start gap-0.5 text-left">
          <div className="flex items-center gap-2">
            <span className="font-mono text-foreground">{event.type}</span>
            <span className="text-muted-foreground"> · {event.at}</span>
          </div>
          {actor ? (
            <span className="truncate text-[10px] text-muted-foreground">{actor}</span>
          ) : null}
        </div>
      </AccordionTrigger>

      <AccordionContent className="bg-muted/15 p-0">
        <div className="border-t border-border/60 px-3 py-2">
          {event.by !== undefined ? (
            <dl className="mb-2 grid gap-1 sm:grid-cols-[7rem_1fr]">
              <dt className="text-muted-foreground">by</dt>
              <dd className="font-mono text-foreground">{actor || '—'}</dd>
            </dl>
          ) : null}
          {details.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">No additional fields on this event.</p>
          ) : (
            <dl className="space-y-2">
              {details.map(([key, value]) => {
                const formatted = formatHistoryDetailValue(value)
                const multiline = formatted.includes('\n')
                return (
                  <div key={key}>
                    <dt className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {key}
                    </dt>
                    <dd
                      className={cn(
                        'font-mono text-foreground/90',
                        multiline &&
                          'studio-scrollbar max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/50 bg-background px-2 py-1 text-[10px]',
                      )}
                    >
                      {formatted}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

export function ChangeTasksTab({
  changeName,
  listSection = null,
  status,
  artifactItems,
  refreshKey,
  tabActive,
}: {
  changeName: string
  listSection?: ChangeReadSection
  status?: ChangeStatusDto | undefined
  artifactItems?: readonly {
    readonly filename: string
    readonly type: string
    readonly hasTasks?: boolean
    readonly totalTasks?: number
    readonly completedTasks?: number
    readonly state: string
    readonly displayStatus: string
  }[]
  refreshKey: number
  tabActive: boolean
}): React.ReactElement {
  const pollKey = useTabScopedPollKey(tabActive, refreshKey)
  const readOnlyTaskArtifacts = useChangeArtifactList(
    artifactItems === undefined && listSection !== null ? changeName : undefined,
    pollKey,
    {
      poll: tabActive,
      listSection,
    },
  )
  const readOnlyTaskItems = artifactItems ?? readOnlyTaskArtifacts.items
  const taskSummary = React.useMemo(() => {
    if (typeof status?.totalTasks === 'number') {
      return {
        totalTasks: status.totalTasks,
        completedTasks: status.completedTasks ?? 0,
      }
    }
    const byType = new Map<string, { totalTasks: number; completedTasks: number }>()
    for (const item of readOnlyTaskItems) {
      if (!item.hasTasks || typeof item.totalTasks !== 'number') continue
      const type = item.type ?? 'tasks'
      if (byType.has(type)) continue
      byType.set(type, {
        totalTasks: item.totalTasks,
        completedTasks: item.completedTasks ?? 0,
      })
    }
    if (byType.size === 0) return undefined
    return [...byType.values()].reduce(
      (acc, entry) => ({
        totalTasks: acc.totalTasks + entry.totalTasks,
        completedTasks: acc.completedTasks + entry.completedTasks,
      }),
      { totalTasks: 0, completedTasks: 0 },
    )
  }, [readOnlyTaskItems, status?.completedTasks, status?.totalTasks])
  const statusTaskArtifacts = status?.artifacts?.filter((a) => a.hasTasks) ?? []
  const tasksEntry =
    statusTaskArtifacts.length > 0
      ? {
          type: statusTaskArtifacts[0]?.type ?? 'tasks',
          hasTasks: true,
          state: statusTaskArtifacts.some((a) => a.state !== 'missing') ? 'complete' : 'missing',
          displayStatus: statusTaskArtifacts.some((a) => a.displayStatus !== 'missing')
            ? 'complete'
            : 'missing',
          files: statusTaskArtifacts.flatMap((artifact) => artifact.files),
        }
      :
    (readOnlyTaskItems.length > 0
      ? {
          type: readOnlyTaskItems.find((a) => a.hasTasks)?.type ?? 'tasks',
          hasTasks: readOnlyTaskItems.some((a) => a.hasTasks),
          state: readOnlyTaskItems.some((a) => a.hasTasks) ? 'complete' : 'missing',
          displayStatus: readOnlyTaskItems.some((a) => a.hasTasks) ? 'complete' : 'missing',
          files: readOnlyTaskItems
            .filter((a) => a.hasTasks)
            .map((a) => ({
              key: a.filename,
              filename: a.filename,
              state: a.state ?? 'missing',
              hasDrift: false,
              displayStatus: a.displayStatus ?? (a.state ?? 'missing'),
            })),
        }
      : undefined)
  const selectedTaskFiles = tasksEntry?.files
    .filter((f) => f.state !== 'missing')
    .map((f) => f.filename) ?? []
  const tasksFileReady =
    tasksEntry !== undefined &&
    tasksEntry.state !== 'missing' &&
    tasksEntry.displayStatus !== 'missing' &&
    tasksEntry.files.some((f) => f.state !== 'missing')

  const tasksArtifacts = useChangeArtifacts(changeName, selectedTaskFiles, pollKey, {
    poll: tabActive,
    listSection,
    enabled: tasksFileReady,
  })

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      {tasksEntry ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Tasks artifact</CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Status: <span className="text-foreground">{tasksEntry.displayStatus}</span>
              {' · '}
              {tasksEntry.files.length} file(s)
              {taskSummary !== undefined ? (
                <>
                  {' · '}
                  <span className="text-foreground">
                    {taskSummary.completedTasks}/{taskSummary.totalTasks} tasks complete
                  </span>
                </>
              ) : null}
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-muted-foreground">
              {tasksEntry.files.map((f) => (
                <li key={f.key}>
                  {f.filename}
                  {f.hasDrift ? ' · drift' : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {tasksArtifacts.isLoading && !tasksArtifacts.data ? (
        <div className="text-muted-foreground">Loading tasks artifact…</div>
      ) : !tasksFileReady ? (
        <p className="text-muted-foreground">No task-capable artifact for this change yet.</p>
      ) : tasksArtifacts.error ? (
        <div className="text-destructive">
          {formatChangeArtifactError(tasksArtifacts.error, {
            changeName,
            filename: selectedTaskFiles[0] ?? 'tasks',
          })}
        </div>
      ) : tasksArtifacts.data && tasksArtifacts.data.length > 0 ? (
        <div className="space-y-3">
          {tasksArtifacts.data.map((artifact) => (
            <Card key={artifact.filename}>
              <CardHeader>
                <CardTitle className="font-mono normal-case tracking-normal">
                  {artifact.filename}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {artifact.filename.endsWith('.md') ? (
                  <div className="studio-markdown-preview max-w-none text-sm text-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground/90">
                    {artifact.content}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">No task-capable artifact for this change yet.</p>
      )}
    </div>
  )
}

export function ChangeEventsTab({
  detail,
  loading,
  error,
}: {
  detail: ChangeDetailDto | undefined
  loading: boolean
  error?: Error
}): React.ReactElement {
  const events = detail !== undefined ? [...detail.history].reverse() : []
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([])

  if (error) {
    return <div className="p-3 text-xs text-destructive">{error.message}</div>
  }
  if (loading && !detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading history…
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No change detail
      </div>
    )
  }

  return (
    <div
      className="studio-scrollbar min-h-0 flex-1 overflow-auto p-4 text-xs"
      data-testid="studio-events-tab"
    >
      <div className="mb-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Lifecycle events ({events.length})
      </div>
      <Accordion
        type="multiple"
        value={expandedKeys}
        onValueChange={setExpandedKeys}
        className="space-y-1.5"
      >
        {events.map((event, i) => (
          <ChangeHistoryEventRow
            key={`${event.type}-${event.at}-${i}`}
            event={event}
            index={i}
          />
        ))}
      </Accordion>
    </div>
  )
}

function TrackedFileList({
  files,
}: {
  files: readonly { readonly file: string }[]
}): React.ReactElement {
  return (
    <ul className="space-y-1 font-mono text-[10px] text-foreground/90">
      {files.map((entry) => (
        <li key={entry.file}>
          <Badge className="truncate normal-case tracking-normal">{entry.file}</Badge>
        </li>
      ))}
    </ul>
  )
}

function formatGraphFileRef(file: GraphFileRefDto): string {
  return `${file.workspace}:${file.workspaceRelativePath}`
}

function formatGraphSymbolRef(symbol: GraphSymbolRefDto): string {
  return `${symbol.name} (${symbol.kind})`
}

export function ChangeImpactTab({
  changeName,
  refreshKey,
  tabActive,
}: {
  changeName: string
  refreshKey: number
  tabActive: boolean
}): React.ReactElement {
  const pollKey = useTabScopedPollKey(tabActive, refreshKey)
  const graph = useChangeGraphView(changeName, { poll: tabActive, refreshKey: pollKey })
  const review = useImplementationReview(changeName, { poll: tabActive, refreshKey: pollKey })

  const loading =
    (graph.isLoading && !graph.data) || (review.isLoading && !review.data)
  const error = graph.error ?? review.error

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading implementation impact…
      </div>
    )
  }
  if (error) {
    return <div className="p-3 text-xs text-destructive">{error.message}</div>
  }

  const tracking = review.data?.implementationTracking ?? {
    trackedFiles: [],
    links: [],
  }
  const model = buildImpactViewModel(
    tracking,
    graph.data,
    review.data?.specIds ?? graph.data?.specIds,
  )

  const unassignedCount =
    model.trackedUnassigned.resolved.length +
    model.trackedUnassigned.open.length +
    model.trackedUnassigned.ignored.length

  if (model.bySpec.length === 0 && unassignedCount === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
        No implementation links, graph coverage, or tracked files for this change.
      </div>
    )
  }

  return (
    <div
      className="studio-scrollbar min-h-0 flex-1 overflow-auto p-4 text-xs"
      data-testid="studio-impact-tab"
    >
      <ul className="space-y-3">
        {model.bySpec.map((group) => (
          <li key={group.specId} data-testid={`studio-impact-spec-${group.specId.replace(/:/g, '-')}`}>
            <Card>
              <CardHeader>
                <CardTitle className="font-mono normal-case tracking-normal">{group.specId}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
              <ImpactSubsection
                title="Accepted links"
                count={group.accepted.length}
                empty="No accepted links for this spec."
              >
                <ul className="space-y-2">
                  {group.accepted.map((row) => (
                    <li
                      key={`${row.link.file}`}
                      className="rounded border border-border/60 bg-background px-2 py-1.5"
                    >
                      <div className="font-mono text-foreground">{row.link.file}</div>
                      {row.link.symbols && row.link.symbols.length > 0 ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Symbols: {row.link.symbols.join(', ')}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">File-level link</p>
                      )}
                      {row.graphFiles.length > 0 || row.graphSymbols.length > 0 ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          <span className="text-foreground/80">Graph: </span>
                          {row.graphFiles.length > 0
                            ? row.graphFiles.map(formatGraphFileRef).join(', ')
                            : null}
                          {row.graphSymbols.length > 0
                            ? `${row.graphFiles.length > 0 ? ' · ' : ''}${row.graphSymbols
                                .slice(0, 12)
                                .map(formatGraphSymbolRef)
                                .join(', ')}${row.graphSymbols.length > 12 ? ` (+${row.graphSymbols.length - 12})` : ''}`
                            : null}
                        </p>
                      ) : (
                        <p className="mt-1 text-[10px] text-amber-600/90">No graph match</p>
                      )}
                    </li>
                  ))}
                </ul>
              </ImpactSubsection>

              {(group.graphOnlyFiles.length > 0 || group.graphOnlySymbols.length > 0) ? (
                <ImpactSubsection
                  title="Graph (not linked)"
                  count={group.graphOnlySymbols.length + group.graphOnlyFiles.length}
                  empty=""
                >
                  {group.graphOnlySymbols.length > 0 ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Symbols: {group.graphOnlySymbols
                        .slice(0, 16)
                        .map(formatGraphSymbolRef)
                        .join(', ')}
                      {group.graphOnlySymbols.length > 16
                        ? ` (+${group.graphOnlySymbols.length - 16})`
                        : ''}
                    </p>
                  ) : null}
                  {group.graphOnlyFiles.length > 0 ? (
                    <ul className="mt-1 max-h-24 space-y-0.5 overflow-auto font-mono text-[10px] text-muted-foreground">
                      {group.graphOnlyFiles.map((f) => (
                        <li key={f.id} className="truncate">
                          {formatGraphFileRef(f)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </ImpactSubsection>
              ) : null}

              <ImpactTrackedSubsections tracked={group.tracked} />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {unassignedCount > 0 ? (
        <section className="mt-4" data-testid="studio-impact-tracked-unassigned">
          <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Tracked files (unassigned)
            <span className="ml-2 inline-flex align-middle"><Badge>{unassignedCount}</Badge></span>
          </h2>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Files not uniquely tied to one spec via links or graph paths.
          </p>
          <ImpactTrackedSubsections tracked={model.trackedUnassigned} />
        </section>
      ) : null}
    </div>
  )
}

function ImpactSubsection({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <h3 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        {count > 0 ? <span className="ml-1 inline-flex align-middle"><Badge>{count}</Badge></span> : null}
      </h3>
      {count === 0 && empty ? (
        <p className="text-[10px] text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
    </div>
  )
}

function ImpactTrackedSubsections({
  tracked,
}: {
  tracked: ImpactSpecTracked
}): React.ReactElement {
  const total = tracked.resolved.length + tracked.open.length + tracked.ignored.length
  if (total === 0) return <></>

  return (
    <div className="space-y-2">
      {tracked.resolved.length > 0 ? (
        <ImpactSubsection title="Tracked · resolved" count={tracked.resolved.length} empty="">
          <TrackedFileList files={tracked.resolved} />
        </ImpactSubsection>
      ) : null}
      {tracked.open.length > 0 ? (
        <ImpactSubsection title="Tracked · open" count={tracked.open.length} empty="">
          <TrackedFileList files={tracked.open} />
        </ImpactSubsection>
      ) : null}
      {tracked.ignored.length > 0 ? (
        <ImpactSubsection title="Tracked · ignored" count={tracked.ignored.length} empty="">
          <TrackedFileList files={tracked.ignored} />
        </ImpactSubsection>
      ) : null}
    </div>
  )
}

export function ChangeContextTab({
  changeName,
  changeStep,
  refreshKey,
  tabActive,
}: {
  changeName: string
  /** Change lifecycle state for compile step (e.g. `designing`). */
  changeStep?: string
  refreshKey: number
  tabActive: boolean
}): React.ReactElement {
  const pollKey = useTabScopedPollKey(tabActive, refreshKey)
  const ctx = useChangeContext(changeName, {
    poll: tabActive,
    refreshKey: pollKey,
    step: changeStep,
  })

  if (ctx.isLoading && !ctx.data) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading compiled context…
      </div>
    )
  }
  if (ctx.error) {
    return <div className="p-3 text-xs text-destructive">{ctx.error.message}</div>
  }

  const body =
    ctx.data?.content ??
    ctx.data?.entries
      ?.map((e) => e.content ?? '')
      .filter(Boolean)
      .join('\n\n') ??
    ''

  return (
    <pre className="studio-scrollbar min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-foreground/90">
      {body || 'No compiled context for this change.'}
    </pre>
  )
}
