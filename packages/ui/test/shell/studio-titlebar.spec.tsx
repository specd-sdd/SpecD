/**
 * @vitest-environment jsdom
 */
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '../../src/components/ui/sidebar.js'
import { StudioTitlebar } from '../../src/shell/StudioTitlebar.js'

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

vi.mock('../../src/hooks/use-changes-overlaps.js', () => ({
  useChangesOverlaps: () => ({ data: undefined, error: undefined, isLoading: false }),
}))

vi.mock('../../src/hooks/use-closed-specs-validation.js', () => ({
  useClosedSpecsValidation: () => ({ data: undefined, error: undefined, isLoading: false }),
}))

function renderTitlebar(props: Partial<React.ComponentProps<typeof StudioTitlebar>> = {}) {
  return render(
    <SidebarProvider defaultOpen>
      <StudioTitlebar
        hostMode="desktop"
        onOpenCommandPalette={vi.fn()}
        onNewChange={vi.fn()}
        {...props}
      />
    </SidebarProvider>,
  )
}

beforeEach(() => {
  document.documentElement.dataset.platform = 'web'
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platform
})

describe('StudioTitlebar', () => {
  it('given darwin desktop with showSidebarTrigger, when titlebar renders, then traffic slot and toggle appear', () => {
    document.documentElement.dataset.platform = 'darwin'

    renderTitlebar({ showSidebarTrigger: true })

    expect(screen.getByTestId('studio-titlebar-traffic-slot')).toBeInTheDocument()
    expect(screen.getByTestId('studio-toggle-sidebar')).toBeInTheDocument()
  })

  it('given non-darwin host with showSidebarTrigger false, when titlebar renders, then toggle is omitted', () => {
    document.documentElement.dataset.platform = 'web'

    renderTitlebar({ showSidebarTrigger: false })

    expect(screen.queryByTestId('studio-titlebar-traffic-slot')).not.toBeInTheDocument()
    expect(screen.queryByTestId('studio-toggle-sidebar')).not.toBeInTheDocument()
    expect(screen.getByTestId('studio-titlebar')).toBeInTheDocument()
  })
})
