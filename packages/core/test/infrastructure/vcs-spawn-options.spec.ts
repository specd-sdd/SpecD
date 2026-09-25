import { describe, expect, it } from 'vitest'
import { spawnOptions as gitSpawnOptions } from '../../src/infrastructure/git/exec.js'
import { spawnOptions as hgSpawnOptions } from '../../src/infrastructure/hg/exec.js'
import { spawnOptions as svnSpawnOptions } from '../../src/infrastructure/svn/exec.js'

describe('VCS spawn options', () => {
  it('hides the console window for git, hg, and svn on Windows', () => {
    expect(gitSpawnOptions('C:/repo', 'win32')).toEqual({ cwd: 'C:/repo', windowsHide: true })
    expect(hgSpawnOptions('C:/repo', 'win32')).toEqual({ cwd: 'C:/repo', windowsHide: true })
    expect(svnSpawnOptions('C:/repo', 'win32')).toEqual({ cwd: 'C:/repo', windowsHide: true })
  })

  it('omits windowsHide off Windows', () => {
    expect(gitSpawnOptions('/repo', 'linux')).toEqual({ cwd: '/repo' })
    expect(hgSpawnOptions('/repo', 'linux')).toEqual({ cwd: '/repo' })
    expect(svnSpawnOptions('/repo', 'linux')).toEqual({ cwd: '/repo' })
  })
})
