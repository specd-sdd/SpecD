import * as React from 'react'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js'

export const CHANGE_VIEWS = [
  'Overview',
  'Artifacts',
  'Tasks',
  'Events',
  'Context',
  'Coverage',
] as const
export type ChangeView = (typeof CHANGE_VIEWS)[number]

export function ChangeTabs({
  changeName,
  active,
  views = CHANGE_VIEWS,
  onActiveChange,
}: {
  changeName: string | undefined
  active: ChangeView
  views?: readonly ChangeView[]
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
    <div className="flex flex-col">
      <div className="flex items-center gap-1 bg-panel-header px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span>changes</span>
        <span className="opacity-40">/</span>
        <span className="font-mono text-muted-foreground/80">{changeName}</span>
      </div>
      <Tabs value={active} onValueChange={(v) => onActiveChange(v as ChangeView)}>
        <TabsList className="w-full justify-start border-t border-border/40">
          {views.map((view) => (
            <TabsTrigger
              key={view}
              value={view}
              className="studio-tab data-[state=active]:studio-tab-active h-auto bg-transparent shadow-none"
            >
              {view}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
