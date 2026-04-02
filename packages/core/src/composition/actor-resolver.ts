import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ActorIdentity } from '../domain/entities/change.js'
import { type ActorProvider } from './kernel-registries.js'
import { GitActorResolver } from '../infrastructure/git/actor-resolver.js'
import { HgActorResolver } from '../infrastructure/hg/actor-resolver.js'
import { SvnActorResolver } from '../infrastructure/svn/actor-resolver.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/** Built-in actor providers in their default detection order. */
export const BUILTIN_ACTOR_PROVIDERS: readonly ActorProvider[] = [
  {
    name: 'git',
    async detect(cwd: string): Promise<ActorResolver | null> {
      try {
        await git(cwd, 'rev-parse', '--is-inside-work-tree')
        return new GitActorResolver(cwd)
      } catch {
        return null
      }
    },
  },
  {
    name: 'hg',
    async detect(cwd: string): Promise<ActorResolver | null> {
      try {
        await hg(cwd, 'root')
        return new HgActorResolver(cwd)
      } catch {
        return null
      }
    },
  },
  {
    name: 'svn',
    async detect(cwd: string): Promise<ActorResolver | null> {
      try {
        await svn(cwd, 'info', '--show-item', 'wc-root')
        return new SvnActorResolver(cwd)
      } catch {
        return null
      }
    },
  },
]

/**
 * Lazily auto-detects the active VCS on first identity resolution.
 *
 * This keeps standalone use-case factories synchronous while still routing
 * through the composition-layer auto-detect entry point.
 */
class AutoDetectActorResolver implements ActorResolver {
  private readonly _cwd: string
  private readonly _providers: readonly ActorProvider[]
  private _resolverPromise?: Promise<ActorResolver>

  /**
   * Creates a lazily-detecting actor resolver.
   *
   * @param cwd - Directory to probe when identity is first requested
   * @param providers - Detection providers in priority order
   */
  constructor(cwd: string, providers: readonly ActorProvider[]) {
    this._cwd = cwd
    this._providers = providers
  }

  /**
   * Resolves and caches the concrete actor resolver for the current directory.
   *
   * @returns The detected concrete `ActorResolver`
   */
  private resolveResolver(): Promise<ActorResolver> {
    this._resolverPromise ??= detectActorResolver(this._cwd, this._providers)
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
 * @param providers - Detection providers in priority order
 * @returns The detected concrete `ActorResolver`
 */
async function detectActorResolver(
  cwd: string,
  providers: readonly ActorProvider[],
): Promise<ActorResolver> {
  for (const provider of providers) {
    const resolver = await provider.detect(cwd)
    if (resolver !== null) {
      return resolver
    }
  }

  return new NullActorResolver()
}

/**
 * Auto-detects the active VCS in the given directory and returns the
 * corresponding {@link ActorResolver} implementation.
 *
 * Probes providers in the supplied order. Falls back to
 * {@link NullActorResolver} when no provider detects a VCS.
 *
 * @param providers - Detection providers in priority order
 * @returns A lazily-detecting `ActorResolver` for the current working directory
 */
export function createVcsActorResolver(providers?: readonly ActorProvider[]): ActorResolver
/**
 * Auto-detects the active VCS in the given directory immediately and returns
 * the corresponding concrete {@link ActorResolver} implementation.
 *
 * @param cwd - Directory to probe
 * @param providers - Detection providers in priority order
 * @returns A promise for the detected concrete `ActorResolver`
 */
export function createVcsActorResolver(
  cwd: string,
  providers?: readonly ActorProvider[],
): Promise<ActorResolver>
/**
 * Creates an actor resolver backed by the composition-layer VCS auto-detect flow.
 *
 * Without an explicit `cwd`, the returned resolver defers detection until
 * `identity()` is called so synchronous use-case factories keep their current
 * contract. With an explicit `cwd`, detection happens immediately and returns
 * the concrete resolver for that repository.
 *
 * @param cwdOrProviders - Optional directory to probe immediately, or providers for lazy mode
 * @param maybeProviders - Optional providers when `cwd` is supplied
 * @returns A lazy resolver or a promise for the detected concrete resolver
 */
export function createVcsActorResolver(
  cwdOrProviders?: string | readonly ActorProvider[],
  maybeProviders?: readonly ActorProvider[],
): ActorResolver | Promise<ActorResolver> {
  const cwd = typeof cwdOrProviders === 'string' ? cwdOrProviders : undefined
  const providers =
    (typeof cwdOrProviders === 'string' ? maybeProviders : cwdOrProviders) ??
    BUILTIN_ACTOR_PROVIDERS
  const dir = cwd ?? process.cwd()
  return cwd === undefined
    ? new AutoDetectActorResolver(dir, providers)
    : detectActorResolver(dir, providers)
}
