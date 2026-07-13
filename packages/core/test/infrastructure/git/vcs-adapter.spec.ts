import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gitMock, gitSyncMock } = vi.hoisted(() => ({
  gitMock: vi.fn<(cwd: string, ...args: string[]) => Promise<string>>(),
  gitSyncMock: vi.fn<(cwd: string, ...args: string[]) => string>(),
}))

vi.mock('../../../src/infrastructure/git/exec.js', () => ({
  git: gitMock,
  gitSync: gitSyncMock,
}))

import { GitVcsAdapter } from '../../../src/infrastructure/git/vcs-adapter.js'

describe('GitVcsAdapter', () => {
  beforeEach(() => {
    gitMock.mockReset()
    gitSyncMock.mockReset()
  })

  it('returns the cached repository root synchronously when provided', () => {
    const adapter = new GitVcsAdapter('/repo/worktree', '/repo')

    expect(adapter.rootDir()).toBe('/repo')
    expect(gitSyncMock).not.toHaveBeenCalled()
  })

  it('queries git synchronously for the repository root when uncached', () => {
    gitSyncMock.mockReturnValue('/repo')
    const adapter = new GitVcsAdapter('/repo/worktree')

    expect(adapter.rootDir()).toBe('/repo')
    expect(gitSyncMock).toHaveBeenCalledWith('/repo/worktree', 'rev-parse', '--show-toplevel')
  })

  it('resolves actor identity from git config', async () => {
    gitMock.mockResolvedValueOnce('Developer').mockResolvedValueOnce('dev@example.com')

    const adapter = new GitVcsAdapter('/repo/worktree')

    await expect(adapter.identity()).resolves.toEqual({
      name: 'Developer',
      email: 'dev@example.com',
      provider: 'git',
    })
    expect(gitMock).toHaveBeenNthCalledWith(1, '/repo/worktree', 'config', 'user.name')
    expect(gitMock).toHaveBeenNthCalledWith(2, '/repo/worktree', 'config', 'user.email')
  })
})
