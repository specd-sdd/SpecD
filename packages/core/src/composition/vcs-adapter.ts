import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type VcsProvider } from './vcs-provider.js'
import { GitVcsAdapter } from '../infrastructure/git/vcs-adapter.js'
import { HgVcsAdapter } from '../infrastructure/hg/vcs-adapter.js'
import { SvnVcsAdapter } from '../infrastructure/svn/vcs-adapter.js'
import { NullVcsAdapter } from '../infrastructure/null/vcs-adapter.js'

/** Built-in VCS providers in their default detection order. */
export const BUILTIN_VCS_PROVIDERS: readonly VcsProvider[] = [
  {
    name: 'git',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      return GitVcsAdapter.detect(cwd)
    },
  },
  {
    name: 'hg',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      return HgVcsAdapter.detect(cwd)
    },
  },
  {
    name: 'svn',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      return SvnVcsAdapter.detect(cwd)
    },
  },
]

/**
 * Auto-detects the active VCS in the given directory and returns the
 * corresponding {@link VcsAdapter} implementation.
 *
 * Probes providers in the supplied order. Falls back to
 * {@link NullVcsAdapter} when no provider detects a VCS.
 *
 * @param cwd - Directory to probe; defaults to `process.cwd()`
 * @param providers - Detection providers in priority order
 * @returns A `VcsAdapter` for the detected VCS
 */
export async function createVcsAdapter(
  cwd?: string,
  providers: readonly VcsProvider[] = BUILTIN_VCS_PROVIDERS,
): Promise<VcsAdapter> {
  const dir = cwd ?? process.cwd()

  for (const provider of providers) {
    const adapter = await provider.detect(dir)
    if (adapter !== null) {
      return adapter
    }
  }

  return new NullVcsAdapter()
}
