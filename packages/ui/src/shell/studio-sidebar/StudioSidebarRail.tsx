import { GitPullRequest, Layers, Network } from 'lucide-react'
import * as React from 'react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '../../components/ui/sidebar.js'
import type { SidebarSection, StudioSidebarRailProps } from './studio-sidebar-types.js'

const RAIL_ITEMS: readonly {
  id: SidebarSection
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'changes', label: 'Changes', icon: GitPullRequest },
  { id: 'workspaces', label: 'Workspaces', icon: Layers },
  { id: 'graph', label: 'Graph', icon: Network },
]

const RAIL_TOOLTIP_CLASS =
  'border border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground shadow-md'

export function StudioSidebarRail({
  activeSection,
  activeChangeCount,
  graphStale,
  onSelectSection,
  embeddedSidebarToggle = false,
}: StudioSidebarRailProps): React.ReactElement {
  const { open } = useSidebar()
  const collapsed = !open

  return (
    <SidebarGroup className="p-2 group-data-[collapsible=icon]:p-0">
      <SidebarGroupContent>
        <SidebarMenu data-testid="studio-activity-rail">
          {embeddedSidebarToggle && collapsed ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={{
                    children: 'Toggle sidebar',
                    className: RAIL_TOOLTIP_CLASS,
                  }}
                >
                  <SidebarTrigger
                    className="h-8 w-8"
                    data-testid="studio-toggle-sidebar"
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
              <li
                className="mx-2 my-1 list-none border-b border-border group-data-[collapsible=icon]:mx-1"
                aria-hidden
                data-testid="studio-sidebar-rail-divider"
              />
            </>
          ) : null}
          {RAIL_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activeSection === id
            const showChangeCount = id === 'changes' && activeChangeCount > 0
            const showGraphStale = id === 'graph' && graphStale

            return (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  type="button"
                  data-testid={`studio-activity-rail-${id}`}
                  tooltip={{
                    children: label,
                    className: RAIL_TOOLTIP_CLASS,
                  }}
                  isActive={isActive}
                  className="relative"
                  onClick={() => onSelectSection(id)}
                >
                  <Icon />
                  <span>{label}</span>
                  {showChangeCount ? (
                    collapsed ? (
                      <span
                        className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-studio-success/20 px-1 text-[9px] font-medium text-studio-success"
                        aria-hidden
                      >
                        {activeChangeCount > 9 ? '9+' : activeChangeCount}
                      </span>
                    ) : (
                      <SidebarMenuBadge className="bg-studio-success/20 text-studio-success">
                        {activeChangeCount > 9 ? '9+' : activeChangeCount}
                      </SidebarMenuBadge>
                    )
                  ) : null}
                  {showGraphStale ? (
                    collapsed ? (
                      <span
                        className="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-amber-500"
                        aria-label="Graph index stale"
                        data-testid="studio-graph-rail-stale-dot"
                      />
                    ) : (
                      <SidebarMenuBadge
                        className="bg-studio-warning/15 font-mono text-[9px] uppercase tracking-[0.12em] text-studio-warning"
                        data-testid="studio-graph-rail-stale-badge"
                      >
                        Stale
                      </SidebarMenuBadge>
                    )
                  ) : null}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
