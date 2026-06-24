/**
 * @vitest-environment jsdom
 */
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SidebarProvider, useSidebar } from '../../src/components/ui/sidebar.js'
import {
  StudioShellSidebar,
  type StudioShellSidebarProps,
} from '../../src/shell/studio-sidebar/StudioShellSidebar.js'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })

  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: 1280,
  })
})

afterEach(() => {
  cleanup()
})

vi.mock('../../src/sidebar/ChangesSidebar.js', () => ({
  ChangesSidebar: () => <div data-testid="changes-sidebar-body">changes</div>,
}))

vi.mock('../../src/sidebar/WorkspacesSidebar.js', () => ({
  WorkspacesSidebar: () => <div data-testid="workspaces-sidebar-body">workspaces</div>,
}))

function SidebarOpenProbe(): React.ReactElement {
  const { open } = useSidebar()
  return <div data-testid="sidebar-open-state">{open ? 'open' : 'closed'}</div>
}

function createProps(
  overrides: Partial<StudioShellSidebarProps> = {},
): StudioShellSidebarProps {
  return {
    activeSection: 'changes',
    activeChangeCount: 2,
    graphStale: false,
    onSelectSection: vi.fn(),
    panels: {
      changes: {
        active: [],
        drafts: [],
        archived: [],
        discarded: [],
        onSelect: vi.fn(),
        onSelectArchived: vi.fn(),
      },
      workspaces: {
        entries: [],
        loading: false,
        onSelectSpec: vi.fn(),
      },
    },
    ...overrides,
  }
}

describe('StudioShellSidebar', () => {
  it('given collapsed sidebar, when workspaces icon is clicked, then section switches without expanding', async () => {
    const onSelectSection = vi.fn()
    const user = userEvent.setup()

    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarOpenProbe />
        <StudioShellSidebar {...createProps({ onSelectSection })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('sidebar-open-state')).toHaveTextContent('closed')

    await user.click(screen.getByTestId('studio-activity-rail-workspaces'))

    expect(onSelectSection).toHaveBeenCalledWith('workspaces')
    expect(screen.getByTestId('sidebar-open-state')).toHaveTextContent('closed')
  })

  it('given expanded sidebar and stale graph, when rail renders, then text badge shows and dot is hidden', () => {
    render(
      <SidebarProvider defaultOpen>
        <StudioShellSidebar {...createProps({ activeSection: 'graph', graphStale: true })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('studio-graph-rail-stale-badge')).toHaveTextContent('Stale')
    expect(screen.queryByTestId('studio-graph-rail-stale-dot')).not.toBeInTheDocument()
  })

  it('given collapsed sidebar and stale graph, when rail renders, then stale dot is visible', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <StudioShellSidebar {...createProps({ activeSection: 'graph', graphStale: true })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('studio-graph-rail-stale-dot')).toBeVisible()
    expect(screen.queryByTestId('studio-graph-rail-stale-badge')).not.toBeInTheDocument()
  })

  it('given non-darwin platform with embedded toggle, when sidebar is expanded, then brand and header toggle render', () => {
    document.documentElement.dataset.platform = 'web'

    render(
      <SidebarProvider defaultOpen>
        <StudioShellSidebar {...createProps({ embeddedSidebarToggle: true })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('studio-brand-mark')).toBeInTheDocument()
    expect(screen.getByTestId('studio-toggle-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-sidebar-rail-divider')).not.toBeInTheDocument()
  })

  it('given non-darwin platform with embedded toggle, when sidebar is collapsed, then toggle is first rail item with divider', () => {
    document.documentElement.dataset.platform = 'web'

    render(
      <SidebarProvider defaultOpen={false}>
        <StudioShellSidebar {...createProps({ embeddedSidebarToggle: true })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('studio-toggle-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-sidebar-rail-divider')).toBeInTheDocument()
  })

  it('given darwin platform, when sidebar renders expanded, then brand shows in sidebar without embedded toggle', () => {
    document.documentElement.dataset.platform = 'darwin'

    render(
      <SidebarProvider defaultOpen>
        <StudioShellSidebar {...createProps({ projectLabel: 'my-project' })} />
      </SidebarProvider>,
    )

    const brand = screen.getByTestId('studio-brand-mark')
    expect(brand).toHaveTextContent('my-project')
    expect(screen.queryByTestId('studio-toggle-sidebar')).not.toBeInTheDocument()
  })

  it('given expanded sidebar, when changes section is active, then both stacked panels are mounted', () => {
    document.documentElement.dataset.platform = 'web'

    render(
      <SidebarProvider defaultOpen>
        <StudioShellSidebar {...createProps({ activeSection: 'changes' })} />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('changes-sidebar-body')).toBeInTheDocument()
    expect(screen.getByTestId('workspaces-sidebar-body')).toBeInTheDocument()
  })
})

describe('SidebarProvider keyboard shortcut', () => {
  it('given expanded sidebar, when user presses Ctrl+B, then sidebar collapses', async () => {
    render(
      <SidebarProvider defaultOpen>
        <SidebarOpenProbe />
      </SidebarProvider>,
    )

    expect(screen.getByTestId('sidebar-open-state')).toHaveTextContent('open')

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByTestId('sidebar-open-state')).toHaveTextContent('closed')
    })
  })
})
