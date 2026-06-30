import { type ActorResolver } from '@specd/sdk'
import { type ApiTokenVerifier } from '../ports/api-token-verifier.js'

/** Bootstrap context passed to auth adapter factories. */
export interface AuthAdapterBootstrapContext {
  readonly actorResolver: ActorResolver
}

/**
 *
 */
export type AuthAdapterFactory = (
  config: Record<string, unknown> | undefined,
  ctx: AuthAdapterBootstrapContext,
) => ApiTokenVerifier

/** Registry mapping `api.auth.type` to verifier factories. */
export class AuthAdapterRegistry {
  private readonly _factories = new Map<string, AuthAdapterFactory>()

  /**
   * @param type - Auth type from `specd.yaml`
   * @param factory - Factory for the verifier implementation
   */
  register(type: string, factory: AuthAdapterFactory): void {
    this._factories.set(type, factory)
  }

  /**
   * @param type - Effective auth type
   * @param config - Optional opaque config from `specd.yaml`
   * @param ctx - Server bootstrap context
   */
  resolve(
    type: string,
    config: Record<string, unknown> | undefined,
    ctx: AuthAdapterBootstrapContext,
  ): ApiTokenVerifier {
    const factory = this._factories.get(type)
    if (factory === undefined) {
      throw new Error(`Unknown api.auth.type '${type}' — v1 supports only 'disabled'`)
    }
    return factory(config, ctx)
  }
}
