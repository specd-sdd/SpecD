import type { ChangeSummaryDto } from '@specd/client'
import { AlertCircle, Circle, RotateCcw, Trash2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn.js'

const STATE_BADGE: Record<string, string> = {
  exploring: 'text-sky-400',
  designing: 'text-violet-400',
  implementing: 'text-amber-400',
  verifying: 'text-orange-400',
  done: 'text-emerald-400',
  archivable: 'text-emerald-500',
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
  onRestore,
  onDiscard,
}: {
  active: readonly ChangeSummaryDto[]
  drafts: readonly ChangeSummaryDto[]
  archived?: readonly ChangeSummaryDto[]
  discarded?: readonly ChangeSummaryDto[]
  error?: Error
  selected: string | undefined
  onSelect: (name: string) => void
  onSelectArchived?: (name: string) => void
  onRestore?: (name: string) => void
  onDiscard?: (name: string) => void
}): React.ReactElement {
  return (
    <div className="flex flex-col text-xs">
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
        actionLabel="Discard"
        actionIcon={<Trash2 className="h-3 w-3" />}
        onAction={onDiscard}
      />
      {archived !== undefined ? (
        <Section
          title="Archive"
          items={archived}
          selected={selected}
          onSelect={onSelectArchived ?? onSelect}
          showState={false}
        />
      ) : null}
      {discarded !== undefined && discarded.length > 0 ? (
        <Section
          title="Discarded"
          items={discarded}
          selected={selected}
          onSelect={onSelect}
          actionLabel="Restore"
          actionIcon={<RotateCcw className="h-3 w-3" />}
          onAction={onRestore}
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
  onAction,
  actionLabel,
  actionIcon,
  showState = true,
  rowTestIdPrefix,
}: {
  title: string
  items: readonly ChangeSummaryDto[]
  selected: string | undefined
  onSelect: (name: string) => void
  onAction?: (name: string) => void
  actionLabel?: string
  actionIcon?: React.ReactNode
  /** When false, omit per-row state (e.g. Archive section — section title is enough). */
  showState?: boolean
  /** Prefix for Playwright rows, e.g. `studio-active-change` → `studio-active-change-specd-studio`. */
  rowTestIdPrefix?: string
}): React.ReactElement {
  if (items.length === 0) {
    return (
      <div className="px-2 py-1">
        <div className="px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        <p className="py-1 text-muted-foreground">None</p>
      </div>
    )
  }

  return (
    <div className="px-2 py-2">
      <div className="mb-1 flex items-center justify-between px-1 py-0.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span>{title}</span>
        <span className="studio-badge">{items.length}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.name}>
            <div className="group flex items-center gap-2">
              <button
                type="button"
                data-testid={
                  rowTestIdPrefix !== undefined
                    ? `${rowTestIdPrefix}-${item.name}`
                    : undefined
                }
                className={cn(
                  'studio-sidebar-row flex-1 border-l-2',
                  selected === item.name && 'studio-sidebar-row-active',
                )}
                onClick={() => onSelect(item.name)}
              >
                <Circle className="h-2 w-2 shrink-0 fill-current stroke-none" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {item.name}
                </span>
                {showState ? (
                  <span
                    className={cn(
                      'capitalize',
                      STATE_BADGE[item.state ?? ''] ?? 'text-muted-foreground',
                    )}
                  >
                    {item.state ?? '—'}
                  </span>
                ) : null}
              </button>
              {onAction ? (
                <button
                  type="button"
                  className="hidden rounded-md border border-border bg-background/60 p-1 text-muted-foreground transition-colors hover:text-foreground group-hover:inline-flex"
                  aria-label={`${actionLabel} ${item.name}`}
                  title={actionLabel}
                  onClick={() => onAction(item.name)}
                >
                  {actionIcon}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
