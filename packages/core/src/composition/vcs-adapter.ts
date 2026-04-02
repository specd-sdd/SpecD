import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type VcsProvider } from './kernel-registries.js'
import { GitVcsAdapter } from '../infrastructure/git/vcs-adapter.js'
import { HgVcsAdapter } from '../infrastructure/hg/vcs-adapter.js'
import { SvnVcsAdapter } from '../infrastructure/svn/vcs-adapter.js'
import { NullVcsAdapter } from '../infrastructure/null/vcs-adapter.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/** Built-in VCS providers in their default detection order. */
export const BUILTIN_VCS_PROVIDERS: readonly VcsProvider[] = [
  {
    name: 'git',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      try {
        await git(cwd, 'rev-parse', '--is-inside-work-tree')
        return new GitVcsAdapter(cwd)
      } catch {
        return null
      }
    },
  },
  {
    name: 'hg',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      try {
        await hg(cwd, 'root')
        return new HgVcsAdapter(cwd)
      } catch {
        return null
      }
    },
  },
  {
    name: 'svn',
    async detect(cwd: string): Promise<VcsAdapter | null> {
      try {
        await svn(cwd, 'info', '--show-item', 'wc-root')
        return new SvnVcsAdapter(cwd)
      } catch {
        return null
      }
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
