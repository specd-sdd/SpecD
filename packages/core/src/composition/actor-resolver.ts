import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ActorIdentity } from '../domain/entities/change.js'
import { type ActorProvider, type AutoDetectActorProvider } from './kernel-registries.js'
import { GitActorResolver } from '../infrastructure/git/actor-resolver.js'
import { HgActorResolver } from '../infrastructure/hg/actor-resolver.js'
import { SvnActorResolver } from '../infrastructure/svn/actor-resolver.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'
import { NullAutoDetectActorProvider } from './null-actor-provider.js'
import { git } from '../infrastructure/git/exec.js'
import { hg } from '../infrastructure/hg/exec.js'
import { svn } from '../infrastructure/svn/exec.js'

/** Built-in actor providers in their default detection order. */
export const BUILTIN_ACTOR_PROVIDERS: readonly AutoDetectActorProvider[] = [
  {
    name: 'git',
    async create(options: { cwd?: string }): Promise<ActorResolver> {
      return await Promise.resolve(new GitActorResolver(options.cwd))
    },
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
    async create(options: { cwd?: string }): Promise<ActorResolver> {
      return await Promise.resolve(new HgActorResolver(options.cwd))
    },
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
    async create(options: { cwd?: string }): Promise<ActorResolver> {
      return await Promise.resolve(new SvnActorResolver(options.cwd))
    },
    async detect(cwd: string): Promise<ActorResolver | null> {
      try {
        await svn(cwd, 'info', '--show-item', 'wc-root')
        return new SvnActorResolver(cwd)
      } catch {
        return null
      }
    },
  },
  NullAutoDetectActorProvider,
]

/**
 * Resolves the concrete actor resolver for the given directory.
 *
 * @param cwd - Directory to probe
 * @param providers - Registered providers
 * @param actorProvider - Optional forced provider name
 * @returns The detected or forced concrete `ActorResolver`
 * @throws {Error} When a forced provider is not found
 */
async function resolveBaseActorResolver(
  cwd: string,
  providers: readonly ActorProvider[],
  actorProvider?: string,
): Promise<ActorResolver> {
  if (actorProvider !== undefined) {
    const provider = providers.find((p) => p.name === actorProvider)
    if (provider === undefined) {
      throw new Error(`actor provider '${actorProvider}' is not registered`)
    }
    return provider.create({ cwd })
  }

  for (const provider of providers) {
    if ('detect' in provider && typeof provider.detect === 'function') {
      const resolver = await (provider as AutoDetectActorProvider).detect(cwd)
      if (resolver !== null) {
        return resolver
      }
    }
  }

  // All providers returned null — fall back to NullActorResolver directly
  return new NullActorResolver()
}

/**
 * Lazily auto-detects or resolves the active actor on first identity resolution.
 *
 * This keeps standalone use-case factories synchronous while still routing
 * through the composition-layer identity entry point.
 */
class LazyActorResolver implements ActorResolver {
  private readonly _cwd: string
  private readonly _providers: readonly ActorProvider[]
  private readonly _actorProvider: string | undefined
  private _resolverPromise?: Promise<ActorResolver>

  /**
   * Creates a lazily-resolving actor resolver.
   *
   * @param cwd - Directory to probe when identity is first requested
   * @param providers - Detection providers in priority order
   * @param actorProvider - Optional forced provider name
   */
  constructor(cwd: string, providers: readonly ActorProvider[], actorProvider?: string) {
    this._cwd = cwd
    this._providers = providers
    this._actorProvider = actorProvider
  }

  /**
   * Resolves and caches the concrete actor resolver.
   *
   * @returns The resolved concrete `ActorResolver`
   */
  private resolveResolver(): Promise<ActorResolver> {
    this._resolverPromise ??= resolveBaseActorResolver(
      this._cwd,
      this._providers,
      this._actorProvider,
    )
    return this._resolverPromise
  }

  /**
   * Resolves the current actor identity.
   *
   * @returns The actor identity
   */
  async identity(): Promise<ActorIdentity> {
    const resolver = await this.resolveResolver()
    return resolver.identity()
  }
}

/**
 * Creates an actor resolver for the given directory.
 *
 * Probes providers in the supplied order, or uses a forced provider if specified.
 * Falls back to {@link NullActorResolver} when no provider applies.
 *
 * @param cwd - Directory to probe
 * @param providers - Detection providers in priority order
 * @param actorProvider - Optional forced provider name
 * @returns A promise for the detected concrete `ActorResolver`
 */
export async function resolveActorResolver(
  cwd: string,
  providers: readonly ActorProvider[] = BUILTIN_ACTOR_PROVIDERS,
  actorProvider?: string,
): Promise<ActorResolver> {
  return resolveBaseActorResolver(cwd, providers, actorProvider)
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
    ? new LazyActorResolver(dir, providers)
    : resolveBaseActorResolver(dir, providers)
}
