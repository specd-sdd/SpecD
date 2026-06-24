import type { ChangeSummaryDto } from '@specd/client'
import type { WorkspaceSpecsEntry } from '../../hooks/use-workspace-specs-collection.js'

export type SidebarSection = 'changes' | 'workspaces' | 'graph'

export type StudioSidebarPanelsProps = {
  changes: {
    active: readonly ChangeSummaryDto[]
    drafts: readonly ChangeSummaryDto[]
    archived: readonly ChangeSummaryDto[]
    discarded: readonly ChangeSummaryDto[]
    error?: Error
    selected?: string
    onSelect: (name: string) => void
    onSelectArchived: (name: string) => void
  }
  workspaces: {
    entries: readonly WorkspaceSpecsEntry[]
    loading: boolean
    selectedWorkspace?: string
    selectedSpecPath?: string
    onSelectSpec: (workspace: string, path: string) => void
  }
}

export type StudioSidebarRailProps = {
  activeSection: SidebarSection
  activeChangeCount: number
  graphStale: boolean
  onSelectSection: (section: SidebarSection) => void
  embeddedSidebarToggle?: boolean
}

export type StudioShellSidebarProps = StudioSidebarRailProps & {
  projectLabel?: string
  panels: StudioSidebarPanelsProps
  embeddedSidebarToggle?: boolean
}
