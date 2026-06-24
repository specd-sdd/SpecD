import { GitPullRequest, Layers } from 'lucide-react'
import * as React from 'react'
import { SidebarGroup } from '../../components/ui/sidebar.js'
import { ChangesSidebar } from '../../sidebar/ChangesSidebar.js'
import { WorkspacesSidebar } from '../../sidebar/WorkspacesSidebar.js'
import type { StudioSidebarPanelsProps } from './studio-sidebar-types.js'

export function StudioSidebarPanels({
  changes,
  workspaces,
}: StudioSidebarPanelsProps): React.ReactElement {
  return (
    <SidebarGroup className="flex min-h-0 flex-1 flex-col gap-0 p-0 group-data-[collapsible=icon]:hidden">
      <div className="studio-panel-header flex shrink-0 items-center gap-2">
        <GitPullRequest className="h-3 w-3 text-studio-success" />
        <span>Changes</span>
      </div>
      <div className="studio-scrollbar max-h-[45%] min-h-0 shrink-0 overflow-y-auto border-b border-border">
        <ChangesSidebar
          active={changes.active}
          drafts={changes.drafts}
          archived={changes.archived}
          discarded={changes.discarded}
          error={changes.error}
          selected={changes.selected}
          onSelect={changes.onSelect}
          onSelectArchived={changes.onSelectArchived}
        />
      </div>

      <div className="studio-panel-header flex shrink-0 items-center gap-2">
        <Layers className="h-3 w-3 text-studio-info" />
        <span>Workspaces – Specs</span>
      </div>
      <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto">
        <WorkspacesSidebar
          entries={workspaces.entries}
          loading={workspaces.loading}
          selectedWorkspace={workspaces.selectedWorkspace}
          selectedSpecPath={workspaces.selectedSpecPath}
          onSelectSpec={workspaces.onSelectSpec}
        />
      </div>
    </SidebarGroup>
  )
}
