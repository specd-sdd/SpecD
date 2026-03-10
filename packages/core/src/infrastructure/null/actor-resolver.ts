import { type ActorIdentity } from '../../domain/entities/change.js'
import { type ActorResolver } from '../../application/ports/actor-resolver.js'

/**
 * Null implementation of {@link ActorResolver}.
 *
 * Used when no VCS is detected. Always throws because there is no
 * identity source available.
 */
export class NullActorResolver implements ActorResolver {
  /** @inheritdoc */
  identity(): Promise<ActorIdentity> {
    return Promise.reject(new Error('no VCS detected — cannot resolve actor identity'))
  }
}
