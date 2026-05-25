import * as React from 'react'
import { cn } from '../lib/cn.js'

export const SPEC_VIEWS = [
  'Overview',
  'Artifacts',
  'Metadata',
  'Dependencies',
  'Linked Changes',
  'Outline',
  'Graph',
  'Context',
] as const

export type SpecView = (typeof SPEC_VIEWS)[number]

export function SpecTabs({
  workspace,
  specPath,
  active,
  onActiveChange,
}: {
  workspace: string | undefined
  specPath?: string
  active: SpecView
  onActiveChange: (view: SpecView) => void
}): React.ReactElement {
  return (
    <div className="flex items-center border-b border-border bg-panel-header">
      {SPEC_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          className={cn('studio-tab', active === view && 'studio-tab-active')}
          onClick={() => onActiveChange(view)}
        >
          {view}
        </button>
      ))}
      <span className="ml-auto truncate pr-2 font-mono text-xs text-muted-foreground">
        {specPath ? `${workspace}:${specPath}` : (workspace ?? 'workspace')}
      </span>
    </div>
  )
}
