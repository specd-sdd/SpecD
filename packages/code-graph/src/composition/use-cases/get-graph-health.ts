import { GetGraphHealth } from '../../application/use-cases/get-graph-health.js'

/**
 * Constructs a stateless `GetGraphHealth` use case.
 *
 * @returns A new `GetGraphHealth` instance
 */
export function createGetGraphHealth(): GetGraphHealth {
  return new GetGraphHealth()
}
