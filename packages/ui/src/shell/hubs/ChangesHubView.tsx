import type { ChangeSummaryDto } from '@specd/client'
import { Circle } from 'lucide-react'
import * as React from 'react'
import { Badge } from '../../components/ui/badge.js'
import { Button } from '../../components/ui/button.js'
import { cn } from '../../lib/utils.js'

const STATE_BADGE: Record<string, string> = {
  exploring: 'text-sky-600 dark:text-sky-400',
  designing: 'text-violet-600 dark:text-violet-400',
  implementing: 'text-amber-600 dark:text-amber-400',
  verifying: 'text-orange-600 dark:text-orange-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  archivable: 'text-emerald-600 dark:text-emerald-500',
  archived: 'text-muted-foreground',
}

export type ChangesHubViewProps = {
  active: readonly ChangeSummaryDto[]
  drafts: readonly ChangeSummaryDto[]
  archived: readonly ChangeSummaryDto[]
  discarded: readonly ChangeSummaryDto[]
  error?: Error
  onSelect: (name: string) => void
  onSelectArchived: (name: string) => void
}

export function ChangesHubView({
  active,
  drafts,
  archived,
  discarded,
  error,
  onSelect,
  onSelectArchived,
}: ChangesHubViewProps): React.ReactElement {
  return (
    <div className="studio-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto p-4" data-testid="studio-changes-hub">
      <header className="mb-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Changes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {active.length} in progress · {drafts.length} drafts · {archived.length} archived ·{' '}
          {discarded.length} discarded
        </p>
      </header>

      {error ? <p className="mb-4 text-sm text-destructive">{error.message}</p> : null}

      <HubSection title="In Progress" items={active} onSelect={onSelect} showState />
      <HubSection title="Drafts" items={drafts} onSelect={onSelect} showState />
      <HubSection title="Archive" items={archived} onSelect={onSelectArchived} showState={false} />
      {discarded.length > 0 ? (
        <HubSection title="Discarded" items={discarded} onSelect={onSelect} showState={false} />
      ) : null}
    </div>
  )
}

function HubSection({
  title,
  items,
  onSelect,
  showState,
}: {
  title: string
  items: readonly ChangeSummaryDto[]
  onSelect: (name: string) => void
  showState: boolean
}): React.ReactElement | null {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
          {items.length}
        </Badge>
      </div>
      <ul className="divide-y divide-border rounded-md border border-border bg-background/30">
        {items.map((item) => {
          const stateColor = STATE_BADGE[item.state ?? ''] ?? 'text-muted-foreground'
          return (
            <li key={item.name}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left hover:bg-accent/50"
                data-testid={`studio-changes-hub-row-${item.name}`}
                onClick={() => onSelect(item.name)}
              >
                <Circle className={cn('size-2 shrink-0 fill-current stroke-none', stateColor)} />
                <div className="min-w-0 flex-1">
                  <div className="break-all font-medium text-foreground">{item.name}</div>
                  {item.description ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  ) : null}
                </div>
                {showState ? (
                  <span
                    className={cn(
                      'shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]',
                      stateColor,
                    )}
                  >
                    {item.state}
                  </span>
                ) : null}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
