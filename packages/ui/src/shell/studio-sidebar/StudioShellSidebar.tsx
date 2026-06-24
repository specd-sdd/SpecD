import * as React from 'react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from '../../components/ui/sidebar.js'
import { useDocumentPlatform } from '../../hooks/use-document-platform.js'
import { cn } from '../../lib/utils.js'
import { StudioBrandMark } from '../StudioBrandMark.js'
import { StudioSidebarPanels } from './StudioSidebarPanels.js'
import { StudioSidebarRail } from './StudioSidebarRail.js'
import type { StudioShellSidebarProps } from './studio-sidebar-types.js'

export type { SidebarSection, StudioShellSidebarProps } from './studio-sidebar-types.js'

export function StudioShellSidebar({
  activeSection,
  projectLabel,
  activeChangeCount,
  graphStale,
  onSelectSection,
  panels,
  embeddedSidebarToggle = false,
}: StudioShellSidebarProps): React.ReactElement {
  const platform = useDocumentPlatform()
  const isDarwinChrome = platform === 'darwin'
  const { open } = useSidebar()

  const handleSelectSection = React.useCallback(
    (section: Parameters<typeof onSelectSection>[0]) => {
      onSelectSection(section)
    },
    [onSelectSection],
  )

  return (
    <Sidebar
      collapsible="icon"
      className={cn(
        'border-r border-border bg-panel text-foreground !bottom-0',
        isDarwinChrome
          ? '!top-[var(--studio-titlebar-height)] !h-[calc(100svh-var(--studio-titlebar-height))]'
          : '!top-0 !h-svh',
      )}
      data-testid="studio-primary-sidebar"
    >
      <SidebarHeader className="group-data-[collapsible=icon]:hidden">
        <div className="flex items-start justify-between gap-2">
          <StudioBrandMark projectLabel={projectLabel} className="min-w-0 flex-1" />
          {embeddedSidebarToggle && open ? (
            <SidebarTrigger
              className="h-8 w-8 shrink-0"
              data-testid="studio-toggle-sidebar"
            />
          ) : null}
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0 group-data-[collapsible=icon]:p-2">
        <StudioSidebarRail
          activeSection={activeSection}
          activeChangeCount={activeChangeCount}
          graphStale={graphStale}
          onSelectSection={handleSelectSection}
          embeddedSidebarToggle={embeddedSidebarToggle}
        />
        <StudioSidebarPanels {...panels} />
      </SidebarContent>
    </Sidebar>
  )
}
