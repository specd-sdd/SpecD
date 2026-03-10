import { describe, it, expect } from 'vitest'
import { NullVcsAdapter } from '../../../src/infrastructure/null/vcs-adapter.js'

describe('NullVcsAdapter', () => {
  it('rootDir throws "no VCS detected"', async () => {
    const adapter = new NullVcsAdapter()
    await expect(adapter.rootDir()).rejects.toThrow('no VCS detected')
  })

  it('branch returns "none"', async () => {
    const adapter = new NullVcsAdapter()
    expect(await adapter.branch()).toBe('none')
  })

  it('isClean returns true', async () => {
    const adapter = new NullVcsAdapter()
    expect(await adapter.isClean()).toBe(true)
  })

  it('ref returns null', async () => {
    const adapter = new NullVcsAdapter()
    expect(await adapter.ref()).toBeNull()
  })

  it('show returns null', async () => {
    const adapter = new NullVcsAdapter()
    expect(await adapter.show('abc123', 'some/file.ts')).toBeNull()
  })
})
