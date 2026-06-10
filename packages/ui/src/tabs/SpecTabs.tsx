import * as React from 'react'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js'

export const SPEC_VIEWS = [
  'Overview',
  'Artifacts',
  'Dependencies',
  'Linked Changes',
  'Outline',
  'Coverage',
  'Impact',
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
    <div className="flex flex-col">
      <div className="flex items-center gap-1 bg-panel-header px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span>specs</span>
        <span className="opacity-40">/</span>
        <span className="font-mono text-muted-foreground/80">
          {specPath ? `${workspace}:${specPath}` : (workspace ?? 'workspace')}
        </span>
      </div>
      <Tabs value={active} onValueChange={(v) => onActiveChange(v as SpecView)}>
        <TabsList className="w-full justify-start border-t border-border/40">
          {SPEC_VIEWS.map((view) => (
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
