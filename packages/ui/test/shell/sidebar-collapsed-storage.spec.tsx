/**
 * @vitest-environment jsdom
 */
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { IUserStorage } from '@specd/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

function createMemoryStorage(initial: Record<string, unknown> = {}): IUserStorage {
  const store = new Map<string, unknown>(Object.entries(initial))
  return {
    get: <T,>(key: string) => (store.has(key) ? (store.get(key) as T) : null),
    set: (key: string, value: unknown) => {
      store.set(key, value)
    },
    remove: (key: string) => {
      store.delete(key)
    },
  }
}

/** Mirrors ShellLayout sidebar collapse persistence. */
function SidebarCollapsePersistence({
  storage,
}: {
  storage: IUserStorage
}): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    return storage.get<boolean>('sidebarCollapsed') ?? false
  })

  React.useEffect(() => {
    storage.set('sidebarCollapsed', sidebarCollapsed)
  }, [sidebarCollapsed, storage])

  return (
    <div>
      <span data-testid="sidebar-collapsed">{sidebarCollapsed ? 'true' : 'false'}</span>
      <button type="button" onClick={() => setSidebarCollapsed((prev) => !prev)}>
        toggle
      </button>
    </div>
  )
}

describe('sidebar collapse persistence', () => {
  it('given prior session collapsed in storage, when component mounts, then collapsed state restores', () => {
    const storage = createMemoryStorage({ sidebarCollapsed: true })

    render(<SidebarCollapsePersistence storage={storage} />)

    expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('true')
  })

  it('given expanded sidebar, when user collapses, then storage receives collapsed flag', async () => {
    const storage = createMemoryStorage()
    const setSpy = vi.spyOn(storage, 'set')
    const user = userEvent.setup()

    render(<SidebarCollapsePersistence storage={storage} />)

    await user.click(screen.getByRole('button', { name: 'toggle' }))

    expect(screen.getByTestId('sidebar-collapsed')).toHaveTextContent('true')
    expect(setSpy).toHaveBeenCalledWith('sidebarCollapsed', true)
  })
})
