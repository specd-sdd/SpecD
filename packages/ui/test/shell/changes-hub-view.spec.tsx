/**
 * @vitest-environment jsdom
 */
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChangesHubView } from '../../src/shell/hubs/ChangesHubView.js'

afterEach(() => {
  cleanup()
})

describe('ChangesHubView', () => {
  it('given active changes, when user clicks a row, then onSelect receives change name', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <ChangesHubView
        active={[{ name: 'my-feature-change', state: 'implementing', specIds: [] }]}
        drafts={[]}
        archived={[]}
        discarded={[]}
        onSelect={onSelect}
        onSelectArchived={vi.fn()}
      />,
    )

    expect(screen.getByTestId('studio-changes-hub')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /my-feature-change/i }))

    expect(onSelect).toHaveBeenCalledWith('my-feature-change')
  })
})
