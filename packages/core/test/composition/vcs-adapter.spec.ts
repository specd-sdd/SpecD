import { describe, it, expect, vi } from 'vitest'
import { VcsAdapter } from '../../src/application/ports/vcs-adapter.js'
import { createVcsAdapter } from '../../src/composition/vcs-adapter.js'
import { type VcsProvider } from '../../src/composition/vcs-provider.js'
import { GitVcsAdapter } from '../../src/infrastructure/git/vcs-adapter.js'
import { HgVcsAdapter } from '../../src/infrastructure/hg/vcs-adapter.js'
import { SvnVcsAdapter } from '../../src/infrastructure/svn/vcs-adapter.js'
import { NullVcsAdapter } from '../../src/infrastructure/null/vcs-adapter.js'

describe('createVcsAdapter', () => {
  it('returns null from the base detection hook', async () => {
    await expect(VcsAdapter.detect(process.cwd())).resolves.toBeNull()
  })

  it('returns a GitVcsAdapter when run inside a git repository', async () => {
    const adapter = await createVcsAdapter(process.cwd())
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

  it('falls through unmatched external providers to built-in git', async () => {
    const probeOrder: string[] = []
    const unmatched: VcsProvider = {
      name: 'custom',
      async detect(): Promise<VcsAdapter | null> {
        probeOrder.push('custom')
        return null
      },
    }

    const adapter = await createVcsAdapter(process.cwd(), [unmatched])

    expect(probeOrder).toEqual(['custom'])
    expect(adapter).toBeInstanceOf(GitVcsAdapter)
  })

  it('returns NullVcsAdapter when external and built-in probes all miss', async () => {
    const miss: VcsProvider = {
      name: 'custom',
      async detect(): Promise<null> {
        return null
      },
    }
    const gitSpy = vi.spyOn(GitVcsAdapter, 'detect').mockResolvedValue(null)
    const hgSpy = vi.spyOn(HgVcsAdapter, 'detect').mockResolvedValue(null)
    const svnSpy = vi.spyOn(SvnVcsAdapter, 'detect').mockResolvedValue(null)

    try {
      const adapter = await createVcsAdapter('/tmp/no-vcs', [miss])
      expect(adapter).toBeInstanceOf(NullVcsAdapter)
    } finally {
      gitSpy.mockRestore()
      hgSpy.mockRestore()
      svnSpy.mockRestore()
    }
  })
})
