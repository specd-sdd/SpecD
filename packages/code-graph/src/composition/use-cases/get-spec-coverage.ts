import { GetSpecCoverage } from '../../application/use-cases/get-spec-coverage.js'

/**
 * Constructs a stateless `GetSpecCoverage` use case.
 *
 * @returns A new `GetSpecCoverage` instance
 */
export function createGetSpecCoverage(): GetSpecCoverage {
  return new GetSpecCoverage()
}
