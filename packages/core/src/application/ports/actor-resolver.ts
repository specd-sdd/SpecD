import { type ActorIdentity } from '../../domain/entities/change.js'

/**
 * Port for resolving the identity of the current actor.
 *
 * Decoupled from any specific identity provider (git, SSO, environment
 * variables, etc.). Use cases that record change history events depend
 * on this port instead of {@link GitAdapter}.
 */
export interface ActorResolver {
  /**
   * Returns the identity of the current actor.
   *
   * @returns The actor's name and email
   * @throws When the identity cannot be determined
   */
  identity(): Promise<ActorIdentity>
}
