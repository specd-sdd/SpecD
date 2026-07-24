/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioMarkdownPreview } from '../src/editor/StudioMarkdownPreview.js'

const mermaidRender = vi.fn()
const mermaidInitialize = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender,
  },
}))

afterEach(() => {
  cleanup()
  document.documentElement.className = ''
  mermaidRender.mockReset()
  mermaidInitialize.mockReset()
})

describe('StudioMarkdownPreview', () => {
  beforeEach(() => {
    document.documentElement.classList.add('dark')
  })

  it('shows an empty-state indicator for whitespace-only content', () => {
    render(<StudioMarkdownPreview content="   " />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('renders highlighted fenced code with hljs classes', () => {
    const { container } = render(
      <StudioMarkdownPreview content={'```typescript\nconst value = 1\n```'} />,
    )
    expect(container.querySelector('code.hljs')).toBeTruthy()
    expect(container.querySelector('.hljs-keyword')).toBeTruthy()
  })

  it('renders checked tasks with success styling and no disabled native checkbox', () => {
    const { container } = render(
      <StudioMarkdownPreview content={'- [x] Done item\n- [ ] Todo item'} />,
    )

    const checked = container.querySelector('[role="checkbox"][aria-checked="true"]')
    expect(checked).toBeTruthy()
    expect(checked).toHaveClass('text-studio-success')
    expect(container.querySelector('input[type="checkbox"][disabled]')).toBeNull()
  })

  it('renders a mermaid diagram after lazy import succeeds', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"></svg>',
    })

    render(
      <StudioMarkdownPreview
        content={'Intro\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nOutro'}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument()
    })
    expect(mermaidInitialize).toHaveBeenCalled()
    expect(mermaidRender).toHaveBeenCalled()
    expect(screen.getByText('Intro')).toBeInTheDocument()
    expect(screen.getByText('Outro')).toBeInTheDocument()
  })

  it('exposes zoom controls and scales the zoom layer (SVG fills the layer)', async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg" width="200" height="100" viewBox="0 0 200 100" style="max-width: 200px; height: 100px; background-color: rgb(1, 2, 3);"></svg>',
    })

    render(
      <StudioMarkdownPreview content={'```mermaid\nflowchart LR\n  A --> B\n```'} />,
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Zoom out')).toBeInTheDocument()
    expect(screen.getByLabelText('Reset view')).toBeInTheDocument()

    const layer = screen.getByTestId('mermaid-zoom-layer')
    const canvas = screen.getByTestId('mermaid-canvas')
    await waitFor(() => {
      const svgEl = canvas.querySelector('svg')
      expect(svgEl?.getAttribute('width')).toBe('100%')
      expect(svgEl?.style.maxWidth).toBe('none')
      expect(layer.style.width).toBe('100%')
      expect(layer.getAttribute('data-scale')).toBe('1')
    })

    fireEvent.click(screen.getByLabelText('Zoom in'))
    await waitFor(() => {
      expect(layer.style.width).toBe('125%')
      expect(layer.getAttribute('data-scale')).toBe('1.25')
      // Diagram still fills the larger layer via viewBox — not a fixed pixel cap.
      expect(canvas.querySelector('svg')?.getAttribute('width')).toBe('100%')
    })

    fireEvent.click(screen.getByLabelText('Reset view'))
    await waitFor(() => {
      expect(layer.style.width).toBe('100%')
      expect(layer.getAttribute('data-scale')).toBe('1')
    })
  })

  it('omits zoom chrome while mermaid is loading', () => {
    mermaidRender.mockImplementation(() => new Promise(() => undefined))

    render(
      <StudioMarkdownPreview content={'```mermaid\nflowchart LR\n  A --> B\n```'} />,
    )

    expect(screen.getByText('Loading diagram…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Zoom in')).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Diagram zoom controls' })).toBeNull()
  })

  it('shows mermaid source and error while keeping sibling prose on failure', async () => {
    mermaidRender.mockRejectedValue(new Error('Invalid diagram'))

    render(
      <StudioMarkdownPreview
        content={'Before\n\n```mermaid\nnot valid\n```\n\nAfter'}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Invalid diagram')).toBeInTheDocument()
    })
    expect(screen.getByText(/not valid/)).toBeInTheDocument()
    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    expect(screen.queryByLabelText('Zoom in')).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Diagram zoom controls' })).toBeNull()
  })
})
