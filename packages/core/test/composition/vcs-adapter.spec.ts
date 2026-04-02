import { describe, it, expect } from 'vitest'
import { createVcsAdapter } from '../../src/composition/vcs-adapter.js'
import { GitVcsAdapter } from '../../src/infrastructure/git/vcs-adapter.js'
import { NullVcsAdapter } from '../../src/infrastructure/null/vcs-adapter.js'

describe('createVcsAdapter', () => {
  it('returns a GitVcsAdapter when run inside a git repository', async () => {
    const adapter = await createVcsAdapter()
    expect(adapter).toBeInstanceOf(GitVcsAdapter)
  })

  it('tries external providers before built-ins', async () => {
    const customAdapter = new NullVcsAdapter()
    const adapter = await createVcsAdapter(process.cwd(), [
      {
        name: 'custom',
        async detect(): Promise<NullVcsAdapter> {
          return customAdapter
        },
      },
    ])

    expect(adapter).toBe(customAdapter)
  })
})
