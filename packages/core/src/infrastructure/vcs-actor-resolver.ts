import { type ActorResolver } from '../application/ports/actor-resolver.js'
import { type VcsAdapter } from '../application/ports/vcs-adapter.js'
import { type ActorIdentity } from '../domain/entities/change.js'

/**
 * Actor resolver that delegates identity lookup to a `VcsAdapter`.
 */
export class VcsActorResolver implements ActorResolver {
  private readonly _vcsAdapter: VcsAdapter

  /**
   * Creates a new `VcsActorResolver`.
   *
   * @param vcsAdapter - VCS adapter providing the active identity
   */
  constructor(vcsAdapter: VcsAdapter) {
    this._vcsAdapter = vcsAdapter
  }

  /**
   * Resolves the current actor identity from the wrapped VCS adapter.
   *
   * @returns The normalized actor identity
   */
  async identity(): Promise<ActorIdentity> {
    const identity = await this._vcsAdapter.identity()
    return {
      name: identity.name,
      email: identity.email,
      provider: identity.provider,
    }
  }
}
