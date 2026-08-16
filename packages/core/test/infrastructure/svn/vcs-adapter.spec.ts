import { beforeEach, describe, expect, it, vi } from 'vitest'

const { svnMock, svnSyncMock } = vi.hoisted(() => ({
  svnMock: vi.fn<(cwd: string, ...args: string[]) => Promise<string>>(),
  svnSyncMock: vi.fn<(cwd: string, ...args: string[]) => string>(),
}))

vi.mock('../../../src/infrastructure/svn/exec.js', () => ({
  svn: svnMock,
  svnSync: svnSyncMock,
}))

import { SvnVcsAdapter } from '../../../src/infrastructure/svn/vcs-adapter.js'

describe('SvnVcsAdapter', () => {
  beforeEach(() => {
    svnMock.mockReset()
    svnSyncMock.mockReset()
  })

  it('returns the cached working-copy root synchronously when provided', () => {
    const adapter = new SvnVcsAdapter('/repo/worktree', '/repo')

    expect(adapter.rootDir()).toBe('/repo')
    expect(svnSyncMock).not.toHaveBeenCalled()
  })

  it('queries svn synchronously for the working-copy root when uncached', () => {
    svnSyncMock.mockReturnValue('/repo')
    const adapter = new SvnVcsAdapter('/repo/worktree')

    expect(adapter.rootDir()).toBe('/repo')
    expect(svnSyncMock).toHaveBeenCalledWith('/repo/worktree', 'info', '--show-item', 'wc-root')
  })

  it('maps the last changed author to an svn identity', async () => {
    svnMock.mockResolvedValue('developer')
    const adapter = new SvnVcsAdapter('/repo/worktree')

    await expect(adapter.identity()).resolves.toEqual({
      name: 'developer',
      email: '',
      provider: 'svn',
    })
    expect(svnMock).toHaveBeenCalledWith(
      '/repo/worktree',
      'info',
      '--show-item',
      'last-changed-author',
    )
  })

  it('resolves the working-copy revision from the repository root', async () => {
    svnMock.mockResolvedValue('42')
    const adapter = new SvnVcsAdapter('/repo/nested/project', '/repo')

    await expect(adapter.ref()).resolves.toBe('42')
    expect(svnMock).toHaveBeenCalledWith('/repo', 'info', '--show-item', 'revision')
  })

  it('enumerates versioned, missing, untracked, and rename-side paths at the root', async () => {
    svnMock
      .mockResolvedValueOnce(
        [
          'M       src/modified.ts',
          'D       src/renamed-from.ts',
          'A       src/renamed-to.ts',
        ].join('\n'),
      )
      .mockResolvedValueOnce(
        ['!       src/missing.ts', '?       src/untracked.ts', 'M       nested\\portable.ts'].join(
          '\n',
        ),
      )
    const adapter = new SvnVcsAdapter('/repo/nested/project', '/repo')

    await expect(adapter.modifiedFiles('42')).resolves.toEqual([
      'src/modified.ts',
      'src/renamed-from.ts',
      'src/renamed-to.ts',
      'src/missing.ts',
      'src/untracked.ts',
      'nested/portable.ts',
    ])
    expect(svnMock).toHaveBeenNthCalledWith(1, '/repo', 'diff', '--summarize', '-r', '42:WORKING')
    expect(svnMock).toHaveBeenNthCalledWith(2, '/repo', 'status')
  })

  it('rejects modified-file enumeration failures', async () => {
    svnMock.mockRejectedValue(new Error('svn failed'))
    const adapter = new SvnVcsAdapter('/repo/nested', '/repo')

    await expect(adapter.modifiedFiles('42')).rejects.toThrow('svn failed')
  })
})
