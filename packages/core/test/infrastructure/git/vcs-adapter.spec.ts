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

  it('returns a stable revision without consulting worktree status', async () => {
    gitMock.mockResolvedValue('abc1234')
    const adapter = new GitVcsAdapter('/repo/worktree', '/repo')

    await expect(adapter.ref()).resolves.toBe('abc1234')
    expect(gitMock).toHaveBeenCalledOnce()
    expect(gitMock).toHaveBeenCalledWith('/repo', 'rev-parse', '--short', 'HEAD')
  })

  it('enumerates every worktree state from the repository root', async () => {
    gitMock
      .mockResolvedValueOnce(
        [
          'M',
          'src/unstaged.ts',
          'A',
          'src/staged.ts',
          'D',
          'src/deleted.ts',
          'R100',
          'src/renamed-from.ts',
          'src/renamed-to.ts',
          'C100',
          'src/copied-from.ts',
          'src/copied-to.ts',
          '',
        ].join('\0'),
      )
      .mockResolvedValueOnce(['src/untracked.ts', 'nested\\portable.ts', ''].join('\0'))
    const adapter = new GitVcsAdapter('/repo/nested/project', '/repo')

    await expect(adapter.modifiedFiles('base123')).resolves.toEqual([
      'src/unstaged.ts',
      'src/staged.ts',
      'src/deleted.ts',
      'src/renamed-from.ts',
      'src/renamed-to.ts',
      'src/copied-to.ts',
      'src/untracked.ts',
      'nested/portable.ts',
    ])
    expect(gitMock).toHaveBeenNthCalledWith(
      1,
      '/repo',
      'diff',
      '--name-status',
      '-z',
      '--find-renames',
      'base123',
      '--',
    )
    expect(gitMock).toHaveBeenNthCalledWith(
      2,
      '/repo',
      'ls-files',
      '-z',
      '--others',
      '--exclude-standard',
    )
  })

  it('rejects modified-file enumeration failures', async () => {
    gitMock.mockRejectedValue(new Error('git failed'))
    const adapter = new GitVcsAdapter('/repo/nested', '/repo')

    await expect(adapter.modifiedFiles('base123')).rejects.toThrow('git failed')
  })
})
