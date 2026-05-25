import { AuthAdapterRegistry } from '../application/auth/auth-adapter-registry.js'
import { DisabledAuthVerifier } from '../infrastructure/auth/disabled-verifier.js'

/** Default registry with only the `disabled` built-in (v1). */
export function defaultAuthAdapterRegistry(): AuthAdapterRegistry {
  const registry = new AuthAdapterRegistry()
  registry.register('disabled', () => new DisabledAuthVerifier())
  return registry
}
