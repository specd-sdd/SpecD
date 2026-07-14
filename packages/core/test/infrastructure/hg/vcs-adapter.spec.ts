import { beforeEach, describe, expect, it, vi } from 'vitest'

const { hgMock, hgSyncMock } = vi.hoisted(() => ({
  hgMock: vi.fn<(cwd: string, ...args: string[]) => Promise<string>>(),
  hgSyncMock: vi.fn<(cwd: string, ...args: string[]) => string>(),
}))

vi.mock('../../../src/infrastructure/hg/exec.js', () => ({
  hg: hgMock,
  hgSync: hgSyncMock,
}))

import { HgVcsAdapter } from '../../../src/infrastructure/hg/vcs-adapter.js'

describe('HgVcsAdapter', () => {
  beforeEach(() => {
    hgMock.mockReset()
    hgSyncMock.mockReset()
  })

  it('returns the cached repository root synchronously when provided', () => {
    const adapter = new HgVcsAdapter('/repo/worktree', '/repo')

    expect(adapter.rootDir()).toBe('/repo')
    expect(hgSyncMock).not.toHaveBeenCalled()
  })

  it('queries hg synchronously for the repository root when uncached', () => {
    hgSyncMock.mockReturnValue('/repo')
    const adapter = new HgVcsAdapter('/repo/worktree')

    expect(adapter.rootDir()).toBe('/repo')
    expect(hgSyncMock).toHaveBeenCalledWith('/repo/worktree', 'root')
  })

  it('parses ui.username identities with name and email', async () => {
    hgMock.mockResolvedValue('Developer <dev@example.com>')
    const adapter = new HgVcsAdapter('/repo/worktree')

    await expect(adapter.identity()).resolves.toEqual({
      name: 'Developer',
      email: 'dev@example.com',
      provider: 'hg',
    })
    expect(hgMock).toHaveBeenCalledWith('/repo/worktree', 'config', 'ui.username')
  })

  it('falls back to a name-only identity when ui.username has no email', async () => {
    hgMock.mockResolvedValue('Developer')
    const adapter = new HgVcsAdapter('/repo/worktree')

    await expect(adapter.identity()).resolves.toEqual({
      name: 'Developer',
      email: '',
      provider: 'hg',
    })
  })
})
