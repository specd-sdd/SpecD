import { type ApiActor } from '../../domain/auth/api-actor.js'

/** Result of token verification. `null` actor means delegate to kernel {@link ActorResolver}. */
export interface ApiTokenVerifyResult {
  readonly actor: ApiActor | null
}

/**
 * Verifies HTTP credentials before handlers run.
 * Implementations are selected through {@link AuthAdapterRegistry}.
 */
export interface ApiTokenVerifier {
  /**
   * @param token - Bearer token without the `Bearer ` prefix, or undefined
   */
  verify(token: string | undefined): Promise<ApiTokenVerifyResult>
}
