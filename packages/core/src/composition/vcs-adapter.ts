import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { GitVcsAdapter } from '../infrastructure/git/vcs-adapter.js'
import { HgVcsAdapter } from '../infrastructure/hg/vcs-adapter.js'
import { SvnVcsAdapter } from '../infrastructure/svn/vcs-adapter.js'
import { NullVcsAdapter } from '../infrastructure/null/vcs-adapter.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/**
 * Auto-detects the active VCS in the given directory and returns the
 * corresponding {@link VcsAdapter} implementation.
 *
 * Probes in priority order: git > hg > svn. Falls back to
 * {@link NullVcsAdapter} when no VCS is detected.
 *
 * @param cwd - Directory to probe; defaults to `process.cwd()`
 * @returns A `VcsAdapter` for the detected VCS
 */
export async function createVcsAdapter(cwd?: string): Promise<VcsAdapter> {
  const dir = cwd ?? process.cwd()

  try {
    await git(dir, 'rev-parse', '--is-inside-work-tree')
    return new GitVcsAdapter(dir)
  } catch {
    /* not git */
  }

  try {
    await hg(dir, 'root')
    return new HgVcsAdapter(dir)
  } catch {
    /* not hg */
  }

  try {
    await svn(dir, 'info', '--show-item', 'wc-root')
    return new SvnVcsAdapter(dir)
  } catch {
    /* not svn */
  }

  return new NullVcsAdapter()
}
