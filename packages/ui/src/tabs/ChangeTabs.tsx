import * as React from 'react'
import { cn } from '../lib/cn.js'

export const CHANGE_VIEWS = [
  'Overview',
  'Artifacts',
  'Tasks',
  'Events',
  'Context',
  'Impact',
] as const
export type ChangeView = (typeof CHANGE_VIEWS)[number]

export function ChangeTabs({
  changeName,
  active,
  onActiveChange,
}: {
  changeName: string | undefined
  active: ChangeView
  onActiveChange: (view: ChangeView) => void
}): React.ReactElement {
  if (!changeName) {
    return (
      <div className="border-b border-border px-2 py-1 text-xs text-muted-foreground">
        Select a change
      </div>
    )
  }

  return (
    <div className="flex items-center border-b border-border bg-panel-header">
      {CHANGE_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          className={cn('studio-tab', active === view && 'studio-tab-active')}
          onClick={() => onActiveChange(view)}
        >
          {view}
        </button>
      ))}
      <span className="ml-auto pr-2 font-mono text-xs text-muted-foreground">{changeName}</span>
    </div>
  )
}
