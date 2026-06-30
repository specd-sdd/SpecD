import { type ActorIdentity, type ActorResolver } from '@specd/sdk'
import { type ApiActor } from '../../domain/auth/api-actor.js'

/**
 * Bridges HTTP {@link ApiActor} to kernel {@link ActorIdentity} for history events.
 * With `disabled` auth, delegates to the bootstrap {@link ActorResolver}.
 */
export class ApiActorResolver implements ActorResolver {
  private readonly _kernelActor: ActorResolver
  private readonly _apiActor: ApiActor | null
  private _cached?: ActorIdentity

  /**
   * @param kernelActor - Actor resolver from server bootstrap (git/VCS)
   * @param apiActor - Optional authenticated principal from token verification
   */
  constructor(kernelActor: ActorResolver, apiActor: ApiActor | null) {
    this._kernelActor = kernelActor
    this._apiActor = apiActor
  }

  /** @inheritdoc */
  async identity(): Promise<ActorIdentity> {
    if (this._cached !== undefined) {
      return this._cached
    }

    if (this._apiActor !== null) {
      this._cached = {
        name: this._apiActor.name,
        email: this._apiActor.email,
        provider: 'api',
        providerId: this._apiActor.id,
        ...(this._apiActor.roles !== undefined && this._apiActor.roles.length > 0
          ? { metadata: { roles: this._apiActor.roles.join(',') } }
          : {}),
      }
      return this._cached
    }

    this._cached = await this._kernelActor.identity()
    return this._cached
  }
}
