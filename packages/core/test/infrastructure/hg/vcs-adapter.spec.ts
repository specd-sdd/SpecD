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

  it('returns a stable revision without Mercurial dirty-state suffixes', async () => {
    hgMock.mockResolvedValue('abc123def456')
    const adapter = new HgVcsAdapter('/repo/worktree', '/repo')

    await expect(adapter.ref()).resolves.toBe('abc123def456')
    expect(hgMock).toHaveBeenCalledWith('/repo', 'log', '-r', '.', '--template', '{node|short}')
  })

  it('enumerates modified, added, missing, untracked, and rename-side paths at the root', async () => {
    hgMock.mockResolvedValue(
      [
        'M src/modified.ts',
        'A src/renamed-to.ts',
        'R src/renamed-from.ts',
        '! src/missing.ts',
        '? src/untracked.ts',
        'I src/ignored.ts',
        'M nested\\portable.ts',
        '',
      ].join('\0'),
    )
    const adapter = new HgVcsAdapter('/repo/nested/project', '/repo')

    await expect(adapter.modifiedFiles('base123')).resolves.toEqual([
      'src/modified.ts',
      'src/renamed-to.ts',
      'src/renamed-from.ts',
      'src/missing.ts',
      'src/untracked.ts',
      'nested/portable.ts',
    ])
    expect(hgMock).toHaveBeenCalledWith('/repo', 'status', '--rev', 'base123', '--print0')
  })

  it('rejects modified-file enumeration failures', async () => {
    hgMock.mockRejectedValue(new Error('hg failed'))
    const adapter = new HgVcsAdapter('/repo/nested', '/repo')

    await expect(adapter.modifiedFiles('base123')).rejects.toThrow('hg failed')
  })
})
