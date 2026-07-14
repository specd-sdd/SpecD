import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type ActorIdentity } from '../domain/entities/change.js'
import { type ActorProvider, type AutoDetectActorProvider } from './actor-provider.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { NullActorResolver } from '../infrastructure/null/actor-resolver.js'
import { NullVcsAdapter } from '../infrastructure/null/vcs-adapter.js'
import { VcsActorResolver } from '../infrastructure/vcs-actor-resolver.js'
import { NullAutoDetectActorProvider } from './null-actor-provider.js'

/** Built-in actor providers in their default detection order. */
export const BUILTIN_ACTOR_PROVIDERS: readonly AutoDetectActorProvider[] = [
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
  private readonly _resolve: () => Promise<ActorResolver>
  private _resolverPromise?: Promise<ActorResolver>

  /**
   * Creates a lazily-resolving actor resolver.
   *
   * @param resolve - Resolver callback invoked on first identity lookup
   */
  constructor(resolve: () => Promise<ActorResolver>) {
    this._resolve = resolve
  }

  /**
   * Resolves and caches the concrete actor resolver.
   *
   * @returns The resolved concrete `ActorResolver`
   */
  private resolveResolver(): Promise<ActorResolver> {
    this._resolverPromise ??= this._resolve()
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
 * Creates an actor resolver backed by a resolved `VcsAdapter`.
 *
 * @param vcsAdapter - Resolved VCS adapter
 * @returns An actor resolver for the provided adapter
 */
export function createVcsActorResolver(vcsAdapter: VcsAdapter): ActorResolver {
  return vcsAdapter instanceof NullVcsAdapter
    ? new NullActorResolver()
    : new VcsActorResolver(vcsAdapter)
}

/**
 * Creates a lazily-resolving VCS-backed actor resolver.
 *
 * @param resolveVcsAdapter - Callback returning the VCS adapter to wrap
 * @returns A lazy actor resolver
 */
export function createLazyVcsActorResolver(
  resolveVcsAdapter: () => Promise<VcsAdapter>,
): ActorResolver {
  return new LazyActorResolver(async () => createVcsActorResolver(await resolveVcsAdapter()))
}

/**
 * Creates a lazily-resolving actor resolver from an arbitrary resolver callback.
 *
 * @param resolveActorResolver - Callback returning the concrete actor resolver
 * @returns A lazy actor resolver
 */
export function createLazyActorResolver(
  resolveActorResolver: () => Promise<ActorResolver>,
): ActorResolver {
  return new LazyActorResolver(resolveActorResolver)
}
