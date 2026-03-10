import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { GitActorResolver } from '../infrastructure/git/actor-resolver.js'
import { HgActorResolver } from '../infrastructure/hg/actor-resolver.js'
import { SvnActorResolver } from '../infrastructure/svn/actor-resolver.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/**
 * Auto-detects the active VCS in the given directory and returns the
 * corresponding {@link ActorResolver} implementation.
 *
 * Probes in priority order: git > hg > svn. Falls back to
 * {@link NullActorResolver} when no VCS is detected.
 *
 * @param cwd - Directory to probe; defaults to `process.cwd()`
 * @returns An `ActorResolver` for the detected VCS
 */
export async function createVcsActorResolver(cwd?: string): Promise<ActorResolver> {
  const dir = cwd ?? process.cwd()

  try {
    await git(dir, 'rev-parse', '--is-inside-work-tree')
    return new GitActorResolver(dir)
  } catch {
    /* not git */
  }

  try {
    await hg(dir, 'root')
    return new HgActorResolver(dir)
  } catch {
    /* not hg */
  }

  try {
    await svn(dir, 'info', '--show-item', 'wc-root')
    return new SvnActorResolver(dir)
  } catch {
    /* not svn */
  }

  return new NullActorResolver()
}
