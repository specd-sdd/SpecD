import { describe, it, expect } from 'vitest'
import { GitVcsAdapter } from '../../../src/infrastructure/git/vcs-adapter.js'

describe('GitVcsAdapter', () => {
  it('returns the repository root directory', async () => {
    const adapter = new GitVcsAdapter()
    const root = await adapter.rootDir()
    expect(root).toBeDefined()
    expect(typeof root).toBe('string')
  })

  it('returns the current branch name', async () => {
    const adapter = new GitVcsAdapter()
    const branch = await adapter.branch()
    expect(typeof branch).toBe('string')
    expect(branch.length).toBeGreaterThan(0)
  })

  it('returns a boolean for isClean', async () => {
    const adapter = new GitVcsAdapter()
    const clean = await adapter.isClean()
    expect(typeof clean).toBe('boolean')
  })

  it('returns a short ref or null', async () => {
    const adapter = new GitVcsAdapter()
    const ref = await adapter.ref()
    // In a git repo with commits, ref should be a string
    expect(ref === null || typeof ref === 'string').toBe(true)
  })

  it('returns null for show with a non-existent path', async () => {
    const adapter = new GitVcsAdapter()
    const ref = await adapter.ref()
    if (ref === null) return
    const content = await adapter.show(ref, 'non-existent-file-xyz.txt')
    expect(content).toBeNull()
  })
})
