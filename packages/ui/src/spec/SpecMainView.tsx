import type {
  GraphFileRefDto,
  GraphImpactDto,
  GraphSpecCoverageDto,
  GraphSymbolRefDto,
  SpecContextDto,
  SpecContextEntryDto,
  SpecDetailDto,
} from '@specd/client'
import { FileText } from 'lucide-react'
import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '../components/ui/alert.js'
import { useSpecRead } from '../hooks/use-spec-read.js'
import { useSpecOutline } from '../hooks/use-spec-outline.js'
import { useSpecImpact } from '../hooks/use-spec-impact.js'
import { useSpecGraphView } from '../hooks/use-spec-graph-view.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import { cn } from '../lib/utils.js'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion.js'
import { Badge } from '../components/ui/badge.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
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

  const pollDetailTab = view === 'Overview' || view === 'Dependencies'
  const pollContextTab = view === 'Context'
  const detailPollKey = useTabScopedPollKey(pollDetailTab, refreshKey)
  const contextPollKey = useTabScopedPollKey(pollContextTab, refreshKey)
  const outlinePollKey = useTabScopedPollKey(view === 'Outline', refreshKey)
  const coveragePollKey = useTabScopedPollKey(view === 'Coverage', refreshKey)
  const impactPollKey = useTabScopedPollKey(view === 'Impact', refreshKey)

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
    refreshKey: coveragePollKey,
    poll: view === 'Coverage',
  })
  const specImpact = useSpecImpact(workspace, specPath, {
    refreshKey: impactPollKey,
    poll: view === 'Impact',
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

  const spec = specRead.detail.data

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SpecTabs workspace={workspace} specPath={specPath} active={view} onActiveChange={setView} />

      {specRead.detail.error ? (
        <div className="border-b border-border px-2 py-2">
          <Alert variant="destructive" className="px-3 py-2 text-xs">
            <AlertDescription>{specRead.detail.error.message}</AlertDescription>
          </Alert>
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
          <SpecContextPanel context={specRead.context.data} />
        )
      ) : null}

      {view === 'Linked Changes' ? (
        <LinkedChangesPanel
          linkedChanges={specRead.detail.data?.linkedChanges ?? []}
          loading={specRead.detail.isLoading}
          error={specRead.detail.error}
        />
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

      {view === 'Coverage' ? (
        <SpecGraphPanel
          data={specGraph.data}
          loading={specGraph.isLoading}
          error={specGraph.error}
        />
      ) : null}

      {view === 'Impact' ? (
        <SpecImpactPanel
          data={specImpact.data}
          loading={specImpact.isLoading}
          error={specImpact.error}
        />
      ) : null}
    </div>
  )
}

/**
 * Renders structured spec context entries and warnings.
 *
 * @param context - Structured spec context payload
 * @returns Context panel content
 */
function SpecContextPanel({
  context,
}: {
  context: SpecContextDto | undefined
}): React.ReactElement {
  const entries = context?.entries ?? []
  const warnings = context?.warnings ?? []

  if (entries.length === 0 && warnings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No context entries
      </div>
    )
  }

  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-auto p-3 text-xs">
      {warnings.length > 0 ? (
        <Alert className="mb-3 border-amber-500/30 bg-amber-500/10 text-amber-100 [&>svg]:hidden">
          <AlertTitle className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
            Warnings
          </AlertTitle>
          <AlertDescription>
          <ul className="space-y-2">
            {warnings.map((warning) => (
              <li key={`${warning.type}:${warning.path ?? warning.message}`}>
                <div className="font-mono text-[11px] text-amber-100">{warning.message}</div>
                {warning.path ? (
                  <div className="text-[10px] text-amber-200/70">{warning.path}</div>
                ) : null}
              </li>
            ))}
          </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3">
        {entries.map((entry) => (
          <SpecContextEntryCard key={`${entry.source}:${entry.spec}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}

/**
 * Renders one structured spec context entry.
 *
 * @param entry - Spec context entry
 * @returns One rendered context card
 */
function SpecContextEntryCard({
  entry,
}: {
  entry: SpecContextEntryDto
}): React.ReactElement {
  const headerTone = entry.source === 'root' ? 'text-sky-300' : 'text-muted-foreground'

  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className={`font-mono text-[11px] ${headerTone}`}>{entry.spec}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>{entry.source}</Badge>
              <Badge>{entry.mode}</Badge>
              {entry.stale ? <Badge variant="destructive">stale metadata</Badge> : null}
            </div>
          </div>
        </div>

        {entry.title ? <h2 className="text-sm font-semibold text-foreground">{entry.title}</h2> : null}

        <div className="mt-3 space-y-2">
          <ContextAccordion title="Optimized Content" defaultOpen>
            {entry.optimizedContent ? (
              <MarkdownSection content={entry.optimizedContent} compact />
            ) : (
              <EmptyContextField label="Optimized content" />
            )}
          </ContextAccordion>

          <ContextAccordion title="Description" defaultOpen>
            {entry.description ? (
              <MarkdownSection content={entry.description} />
            ) : (
              <EmptyContextField label="Description" />
            )}
          </ContextAccordion>

          <ContextAccordion title={`Rules${entry.rules ? ` (${entry.rules.length})` : ''}`} defaultOpen>
            {entry.rules && entry.rules.length > 0 ? (
              <div className="space-y-2">
                {entry.rules.map((group) => (
                  <div key={group.requirement}>
                    <div className="mb-1 text-base font-bold text-foreground">
                      <MarkdownSection content={group.requirement} />
                    </div>
                    <div className="space-y-2">
                      {group.rules.map((rule) => (
                        <div key={rule}>
                          <MarkdownSection content={rule} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyContextField label="Rules" />
            )}
          </ContextAccordion>

          <ContextAccordion
            title={`Constraints${entry.constraints ? ` (${entry.constraints.length})` : ''}`}
            defaultOpen
          >
            {entry.constraints && entry.constraints.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {entry.constraints.map((constraint) => (
                  <li key={constraint}>
                    <MarkdownSection content={constraint} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyContextField label="Constraints" />
            )}
          </ContextAccordion>

          <ContextAccordion
            title={`Scenarios${entry.scenarios ? ` (${entry.scenarios.length})` : ''}`}
            defaultOpen
          >
            {entry.scenarios && entry.scenarios.length > 0 ? (
              <div className="space-y-4">
                {entry.scenarios.map((scenario) => (
                  <div key={`${scenario.requirement}:${scenario.name}`}>
                    <div className="text-base font-bold text-foreground">
                      <MarkdownSection content={scenario.name} />
                    </div>
                    <div className="mb-2 text-muted-foreground">
                      <MarkdownSection content={scenario.requirement} compact />
                    </div>
                    {scenario.given && scenario.given.length > 0 ? (
                      <ScenarioList label="Given" items={scenario.given} />
                    ) : null}
                    {scenario.when && scenario.when.length > 0 ? (
                      <ScenarioList label="When" items={scenario.when} />
                    ) : null}
                    {scenario.then && scenario.then.length > 0 ? (
                      <ScenarioList label="Then" items={scenario.then} />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyContextField label="Scenarios" />
            )}
          </ContextAccordion>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Studio accordion wrapper used by the spec context panel.
 *
 * @param title - Section heading
 * @param children - Section body
 * @param defaultOpen - Whether the section starts open
 * @returns Collapsible section
 */
function ContextAccordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}): React.ReactElement {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? 'section' : undefined}>
      <AccordionItem value="section">
        <AccordionTrigger className="bg-background/20 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

/**
 * Renders a markdown field inside the spec context panel.
 *
 * @param content - Markdown content
 * @param compact - Whether to use compact body styling
 * @returns Markdown-rendered section body
 */
function MarkdownSection({
  content,
  compact = false,
}: {
  content: string
  compact?: boolean
}): React.ReactElement {
  return (
    <article
      className={cn(
        'studio-markdown-preview max-w-none text-foreground',
        compact ? 'text-[11px]' : 'text-xs',
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  )
}

/**
 * Renders a placeholder when a structured context field is absent.
 *
 * @param label - Missing field label
 * @returns Empty field marker
 */
function EmptyContextField({ label }: { label: string }): React.ReactElement {
  return <p className="text-xs italic text-muted-foreground">{label} not available.</p>
}

/**
 * Renders one clause group inside a scenario card.
 *
 * @param label - Clause heading
 * @param items - Clause lines
 * @returns Scenario clause list
 */
function ScenarioList({
  label,
  items,
}: {
  label: string
  items: readonly string[]
}): React.ReactElement {
  return (
    <div className="mt-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 space-y-2">
        {items.map((item) => (
          <div key={item}>
            <MarkdownSection content={item} />
          </div>
        ))}
      </div>
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
      <Card>
        <CardHeader>
          <CardTitle>Canonical artifacts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1">
          {artifacts.map((a) => (
            <li key={a.filename}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-auto w-full justify-start gap-2 px-4 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-background/60',
                  selected === a.filename && 'bg-background/80 text-foreground',
                )}
                onClick={() => onSelect?.(a.filename)}
              >
                <FileText className="h-3 w-3 shrink-0 text-studio-success" />
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {a.filename}
                </span>
                {a.hash ? (
                  <span className="font-mono text-[10px] text-muted-foreground/50">
                    {a.hash.slice(0, 8)}
                  </span>
                ) : null}
              </Button>
            </li>
          ))}
          </ul>
        </CardContent>
      </Card>
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
  linkedChanges: readonly { name: string; description?: string; state: string }[]
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
        <p className="text-muted-foreground">Loading linked changes…</p>
      ) : linkedChanges.length === 0 ? (
        <p className="text-muted-foreground">No active changes reference this spec.</p>
      ) : (
        <ul className="space-y-2">
          {linkedChanges.map((c) => (
            <li key={c.name}>
              <Card>
                <CardContent className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{c.name}</div>
                <div className="mt-1 text-muted-foreground">
                  {c.description && c.description.trim().length > 0
                    ? c.description
                    : 'No description.'}
                </div>
              </div>
              <span className={cn('shrink-0 capitalize', STATE_COLOR[c.state] ?? 'text-muted-foreground')}>
                {c.state}
              </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
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
            <li key={id}>
              <Card>
                <CardContent className="text-foreground">{id}</CardContent>
              </Card>
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
  data: GraphSpecCoverageDto | undefined
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
  if (!data || (data.files.length === 0 && data.symbols.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No graph coverage for this spec.
      </div>
    )
  }
  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-auto p-4 text-xs">
      <Card>
        <CardHeader>
          <CardTitle className="font-mono normal-case tracking-normal">{data.specId}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImpactSection
            title="Symbols"
            count={data.symbols.length}
            empty="No covered symbols for this spec."
          >
            <ul className="space-y-1 text-[10px] text-muted-foreground">
              {data.symbols.map((symbol) => (
                <li
                  key={symbol.id}
                  className="rounded border border-border/60 bg-background px-2 py-1.5"
                >
                  <div className="font-mono text-foreground">{formatGraphSymbolRef(symbol)}</div>
                  <div className="mt-0.5 font-mono text-muted-foreground">
                    {formatGraphFileRef(symbol)}:{symbol.line}:{symbol.column}
                  </div>
                </li>
              ))}
            </ul>
          </ImpactSection>

          <ImpactSection
            title="Files"
            count={data.files.length}
            empty="No covered files for this spec."
          >
            <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
              {data.files.map((file) => (
                <li key={file.id} className="truncate">
                  {formatGraphFileRef(file)}
                </li>
              ))}
            </ul>
          </ImpactSection>
        </CardContent>
      </Card>
    </div>
  )
}

function SpecImpactPanel({
  data,
  loading,
  error,
}: {
  data: GraphImpactDto | undefined
  loading: boolean
  error?: Error
}): React.ReactElement {
  if (loading && !data) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading graph impact…
      </div>
    )
  }
  if (error) {
    return <div className="p-3 text-xs text-destructive">{error.message}</div>
  }
  if (
    !data ||
    (data.specs.length === 0 &&
      data.symbols.length === 0 &&
      data.files.length === 0 &&
      data.affectedProcesses.length === 0)
  ) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No graph impact for this spec.
      </div>
    )
  }

  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-auto p-4 text-xs">
      <Card>
        <CardHeader>
          <CardTitle className="font-mono normal-case tracking-normal">{data.target}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
        <div className="grid gap-2 border-b border-border/60 pb-2 text-[10px] text-muted-foreground md:grid-cols-3 xl:grid-cols-6">
          <div>
            <span className="text-foreground/80">Risk: </span>
            {data.riskLevel}
          </div>
          <div>
            <span className="text-foreground/80">Direct: </span>
            {data.directDepsCount}
          </div>
          <div>
            <span className="text-foreground/80">Indirect: </span>
            {data.indirectDepsCount}
          </div>
          <div>
            <span className="text-foreground/80">Transitive: </span>
            {data.transitiveDepsCount}
          </div>
          <div>
            <span className="text-foreground/80">Affected files: </span>
            {data.affectedFilesCount}
          </div>
          <div>
            <span className="text-foreground/80">Affected specs: </span>
            {data.specs.length}
          </div>
        </div>
        <div className="space-y-3">
          <ImpactSection
            title="Specs"
            count={data.specs.length}
            empty="No affected specs for this spec."
          >
            <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
              {data.specs.map((specId) => (
                <li key={specId} className="truncate">
                  {specId}
                </li>
              ))}
            </ul>
          </ImpactSection>

          <ImpactSection
            title="Symbols"
            count={data.symbols.length}
            empty="No affected symbols for this spec."
          >
            <ul className="space-y-1 text-[10px] text-muted-foreground">
              {data.symbols.map((symbol) => (
                <li
                  key={symbol.id}
                  className="rounded border border-border/60 bg-background px-2 py-1.5"
                >
                  <div className="font-mono text-foreground">{formatGraphSymbolRef(symbol)}</div>
                  <div className="mt-0.5 font-mono text-muted-foreground">
                    {formatGraphFileRef(symbol)}:{symbol.line}:{symbol.column}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Depth {symbol.depth}
                    {symbol.risk ? ` · ${symbol.risk}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </ImpactSection>

          <ImpactSection
            title="Files"
            count={data.files.length}
            empty="No affected files for this spec."
          >
            <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
              {data.files.map((file) => (
                <li key={file.id} className="truncate">
                  {formatGraphFileRef(file)}
                </li>
              ))}
            </ul>
          </ImpactSection>

          {data.affectedProcesses.length > 0 ? (
            <ImpactSection
              title="Processes"
              count={data.affectedProcesses.length}
              empty=""
            >
              <ul className="space-y-1 font-mono text-[10px] text-muted-foreground">
                {data.affectedProcesses.map((processName) => (
                  <li key={processName} className="truncate">
                    {processName}
                  </li>
                ))}
              </ul>
            </ImpactSection>
          ) : null}
        </div>
        </CardContent>
      </Card>
    </div>
  )
}

function formatGraphFileRef(file: GraphFileRefDto): string {
  return `${file.workspace}:${file.workspaceRelativePath}`
}

function formatGraphSymbolRef(symbol: GraphSymbolRefDto): string {
  return `${symbol.name} (${symbol.kind})`
}

function ImpactSection({
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
    <section>
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="ml-2 inline-flex align-middle"><Badge>{count}</Badge></span>
      </h2>
      {count > 0 ? children : <p className="text-[10px] text-muted-foreground">{empty}</p>}
    </section>
  )
}
