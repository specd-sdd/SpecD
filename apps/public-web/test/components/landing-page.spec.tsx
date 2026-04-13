import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LandingPage } from '../../src/components/landing-page'

describe('LandingPage', () => {
  it('renders presentation copy instead of a stock docs index', () => {
    render(<LandingPage />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Build against intent before code starts drifting.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/spec-first workflow/i)).toBeInTheDocument()
    expect(screen.getByText('SpecD')).toBeInTheDocument()
    expect(screen.getByText('Spec-Driven Development')).toBeInTheDocument()
    expect(
      screen.getByText(/give agents the right context, not a repo to guess from/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/impact analysis, search, and hotspot discovery/i)).toBeInTheDocument()
    expect(screen.getByText(/across coding agents/i)).toBeInTheDocument()
    expect(screen.getByText(/one workflow above the agent layer/i)).toBeInTheDocument()
    expect(screen.getByText(/plugins for other coding agents/i)).toBeInTheDocument()
    expect(screen.getByText(/hooks at the right gates/i)).toBeInTheDocument()
    expect(
      screen.getByText(/from problem to implementation, one change at a time/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/resolve relevant specs/i)).toBeInTheDocument()
    expect(screen.getByText(/analyze their impact/i)).toBeInTheDocument()
    expect(screen.getByText(/verify the change/i)).toBeInTheDocument()
    expect(screen.getByText(/for teams/i)).toBeInTheDocument()
    expect(screen.getByText(/approval and signoff gates/i)).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: 'Spec workflow visual connecting documents, tasks, and validation.',
      }),
    ).toBeInTheDocument()
  })

  it('exposes the primary navigation routes for docs, api, and github', () => {
    render(<LandingPage />)

    const links = screen.getAllByRole('link')

    expect(
      links.some(
        (link) =>
          link.textContent === 'Get Started' &&
          link.getAttribute('href') === '/docs/guide/getting-started',
      ),
    ).toBe(true)
    expect(
      links.some(
        (link) => link.textContent === 'Browse API' && link.getAttribute('href') === '/api',
      ),
    ).toBe(true)
    expect(
      links.some(
        (link) =>
          link.textContent?.includes('GitHub') &&
          link.getAttribute('href') === 'https://github.com/specd-sdd/SpecD',
      ),
    ).toBe(true)
  })

  it('hides API entrypoints when the generated API section is disabled', () => {
    const { container } = render(<LandingPage apiReferenceEnabled={false} />)

    expect(container.querySelector('a[href="/api"]')).toBeNull()
  })
})
