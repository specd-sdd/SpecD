/**
 * @vitest-environment jsdom
 */
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GraphMainView } from '../../src/shell/GraphMainView.js'
import { SpecdDataProvider } from '../../src/context/specd-data-context.js'
import { createMemorySpecdDataAdapter } from '@specd/client'
import {
  publishProjectPollSession,
  resetProjectPollSessionForTests,
} from '../../src/hooks/project-poll-session.js'

afterEach(() => {
  cleanup()
  resetProjectPollSessionForTests()
})

describe('GraphMainView health diagnostics', () => {
  it('renders warning messages from project poll session', () => {
    resetProjectPollSessionForTests()
    publishProjectPollSession({
      project: undefined,
      projectStatus: {
        activeChanges: 0,
        drafts: 0,
        discarded: 0,
        archived: 0,
        graph: {
          stale: true,
          lastIndexedAt: '2026-01-01T00:00:00.000Z',
          warnings: [
            {
              type: 'graph-stale',
              message: 'Graph is stale (indexed at 9bbfb3e, current: 63bf904)',
            },
          ],
        },
        auth: { type: 'disabled' },
      },
      refreshKey: 0,
      isLoading: false,
      error: undefined,
    })

    render(
      <SpecdDataProvider port={createMemorySpecdDataAdapter()}>
        <GraphMainView refreshKey={0} />
      </SpecdDataProvider>,
    )

    expect(screen.getByText('Stale')).toBeTruthy()
    expect(
      screen.getByText('Graph is stale (indexed at 9bbfb3e, current: 63bf904)'),
    ).toBeTruthy()
  })
})
