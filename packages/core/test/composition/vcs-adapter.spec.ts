import { describe, it, expect } from 'vitest'
import { createVcsAdapter } from '../../src/composition/vcs-adapter.js'
import { GitVcsAdapter } from '../../src/infrastructure/git/vcs-adapter.js'

describe('createVcsAdapter', () => {
  it('returns a GitVcsAdapter when run inside a git repository', async () => {
    const adapter = await createVcsAdapter()
    expect(adapter).toBeInstanceOf(GitVcsAdapter)
  })
})
