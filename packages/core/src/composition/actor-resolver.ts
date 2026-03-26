import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ActorIdentity } from '../domain/entities/change.js'
import { GitActorResolver } from '../infrastructure/git/actor-resolver.js'
import { HgActorResolver } from '../infrastructure/hg/actor-resolver.js'
import { SvnActorResolver } from '../infrastructure/svn/actor-resolver.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/**
 * Lazily auto-detects the active VCS on first identity resolution.
 *
 * This keeps standalone use-case factories synchronous while still routing
 * through the composition-layer auto-detect entry point.
 */
class AutoDetectActorResolver implements ActorResolver {
  private readonly _cwd: string
  private _resolverPromise?: Promise<ActorResolver>

  /**
   * Creates a lazily-detecting actor resolver.
   *
   * @param cwd - Directory to probe when identity is first requested
   */
  constructor(cwd: string) {
    this._cwd = cwd
  }

  /**
   * Resolves and caches the concrete actor resolver for the current directory.
   *
   * @returns The detected concrete `ActorResolver`
   */
  private resolveResolver(): Promise<ActorResolver> {
    this._resolverPromise ??= detectActorResolver(this._cwd)
    return this._resolverPromise
  }

  /**
   * Resolves the current actor identity using the detected VCS implementation.
   *
   * @returns The actor's name and email
   */
  async identity(): Promise<ActorIdentity> {
    const resolver = await this.resolveResolver()
    return resolver.identity()
  }
}

/**
 * Detects the concrete actor resolver for the given directory.
 *
 * @param cwd - Directory to probe
 * @returns The detected concrete `ActorResolver`
 */
async function detectActorResolver(cwd: string): Promise<ActorResolver> {
  try {
    await git(cwd, 'rev-parse', '--is-inside-work-tree')
    return new GitActorResolver(cwd)
  } catch {
    /* not git */
  }

  try {
    await hg(cwd, 'root')
    return new HgActorResolver(cwd)
  } catch {
    /* not hg */
  }

  try {
    await svn(cwd, 'info', '--show-item', 'wc-root')
    return new SvnActorResolver(cwd)
  } catch {
    /* not svn */
  }

  return new NullActorResolver()
}

/**
 * Auto-detects the active VCS in the given directory and returns the
 * corresponding {@link ActorResolver} implementation.
 *
 * Probes in priority order: git > hg > svn. Falls back to
 * {@link NullActorResolver} when no VCS is detected.
 *
 * @returns A lazily-detecting `ActorResolver` for the current working directory
 */
export function createVcsActorResolver(): ActorResolver
/**
 * Auto-detects the active VCS in the given directory immediately and returns
 * the corresponding concrete {@link ActorResolver} implementation.
 *
 * @param cwd - Directory to probe
 * @returns A promise for the detected concrete `ActorResolver`
 */
export function createVcsActorResolver(cwd: string): Promise<ActorResolver>
/**
 * Creates an actor resolver backed by the composition-layer VCS auto-detect flow.
 *
 * Without an explicit `cwd`, the returned resolver defers detection until
 * `identity()` is called so synchronous use-case factories keep their current
 * contract. With an explicit `cwd`, detection happens immediately and returns
 * the concrete resolver for that repository.
 *
 * @param cwd - Optional directory to probe immediately
 * @returns A lazy resolver or a promise for the detected concrete resolver
 */
export function createVcsActorResolver(cwd?: string): ActorResolver | Promise<ActorResolver> {
  const dir = cwd ?? process.cwd()
  return cwd === undefined ? new AutoDetectActorResolver(dir) : detectActorResolver(dir)
}
