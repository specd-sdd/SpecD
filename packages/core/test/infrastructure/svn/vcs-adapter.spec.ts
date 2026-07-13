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
})
