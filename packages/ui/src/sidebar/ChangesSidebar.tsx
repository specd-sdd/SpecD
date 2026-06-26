import type { ChangeSummaryDto } from '@specd/client'
import { AlertCircle, Circle } from 'lucide-react'
import * as React from 'react'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import { cn } from '../lib/utils.js'

const STATE_BADGE: Record<string, string> = {
  exploring: 'text-sky-600 dark:text-sky-400',
  designing: 'text-violet-600 dark:text-violet-400',
  implementing: 'text-amber-600 dark:text-amber-400',
  verifying: 'text-orange-600 dark:text-orange-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  archivable: 'text-emerald-600 dark:text-emerald-500',
  archived: 'text-muted-foreground',
}

export function ChangesSidebar({
  active,
  drafts,
  archived,
  discarded,
  error,
  selected,
  onSelect,
  onSelectArchived,
}: {
  active: readonly ChangeSummaryDto[]
  drafts: readonly ChangeSummaryDto[]
  archived?: readonly ChangeSummaryDto[]
  discarded?: readonly ChangeSummaryDto[]
  error?: Error
  selected: string | undefined
  onSelect: (name: string) => void
  onSelectArchived?: (name: string) => void
}): React.ReactElement {
  return (
    <div className="flex w-full min-w-0 flex-col text-xs">
      {error ? (
        <div className="flex items-center gap-1 px-2 py-2 text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error.message}
        </div>
      ) : null}

      <Section
        title="In Progress"
        items={active}
        selected={selected}
        onSelect={onSelect}
        rowTestIdPrefix="studio-active-change"
      />
      <Section
        title="Drafts"
        items={drafts}
        selected={selected}
        onSelect={onSelect}
        fixedCircleColor="text-muted-foreground/50"
        rowTestIdPrefix="studio-draft-change"
      />
      {archived !== undefined ? (
        <Section
          title="Archive"
          items={archived}
          selected={selected}
          onSelect={onSelectArchived ?? onSelect}
          showState={false}
          fixedCircleColor="text-muted-foreground/30"
        />
      ) : null}
      {discarded !== undefined && discarded.length > 0 ? (
        <Section
          title="Discarded"
          items={discarded}
          selected={selected}
          onSelect={onSelect}
          showState={false}
          fixedCircleColor="text-destructive/40"
        />
      ) : null}
    </div>
  )
}

function Section({
  title,
  items,
  selected,
  onSelect,
  showState = true,
  rowTestIdPrefix,
  fixedCircleColor,
}: {
  title: string
  items: readonly ChangeSummaryDto[]
  selected: string | undefined
  onSelect: (name: string) => void
  showState?: boolean
  rowTestIdPrefix?: string
  fixedCircleColor?: string
}): React.ReactElement {
  if (items.length === 0) {
    return (
      <div className="px-2 py-2">
        <Card className="overflow-hidden bg-background/35 shadow-none">
          <div className="studio-panel-header flex items-center justify-between">
            <span className="truncate whitespace-nowrap text-[10px] tracking-[0.14em]">{title}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">0</Badge>
          </div>
          <p className="px-3 py-3 text-xs text-muted-foreground">None</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex w-full min-w-0 flex-col px-2 py-2">
      <Card className="flex w-full min-w-0 flex-col overflow-hidden bg-background/35 shadow-none">
        <div className="studio-panel-header flex w-full shrink-0 items-center justify-between gap-2">
          <span className="truncate whitespace-nowrap text-[10px] tracking-[0.14em]">{title}</span>
          <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">{items.length}</Badge>
        </div>
        <ul className="flex w-full min-w-0 flex-col gap-0.5 p-1.5">
          {items.map((item) => {
            const stateColor = STATE_BADGE[item.state ?? ''] ?? 'text-muted-foreground'
            const circleColor = fixedCircleColor ?? stateColor

            return (
              <li key={item.name} className="flex w-full min-w-0">
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={
                    rowTestIdPrefix !== undefined ? `${rowTestIdPrefix}-${item.name}` : undefined
                  }
                  className={cn(
                    'studio-sidebar-row flex h-auto w-0 flex-1 min-w-0 max-w-full justify-start overflow-hidden px-2 py-1.5',
                    selected === item.name && 'studio-sidebar-row-active',
                  )}
                  onClick={() => onSelect(item.name)}
                >
                  <Circle className={cn('!size-2 shrink-0 fill-current stroke-none', circleColor)} />
                  <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground">
                    {item.name}
                  </span>
                  {showState ? (
                    <span className={cn('shrink-0 font-mono text-[10px] uppercase tracking-[0.12em]', stateColor)}>
                      {item.state ?? '—'}
                    </span>
                  ) : null}
                </Button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
