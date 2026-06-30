import { createGetSpecCoverage } from './get-spec-coverage.js'
import { GetChangeSpecCoverage } from '../../application/use-cases/get-change-spec-coverage.js'
import { type GetSpecCoverage } from '../../application/use-cases/get-spec-coverage.js'

/**
 * Constructs a `GetChangeSpecCoverage` use case wired with spec coverage delegation.
 *
 * @param getSpecCoverage - Optional pre-built `GetSpecCoverage` instance
 * @returns A new `GetChangeSpecCoverage` instance
 */
export function createGetChangeSpecCoverage(
  getSpecCoverage: GetSpecCoverage = createGetSpecCoverage(),
): GetChangeSpecCoverage {
  return new GetChangeSpecCoverage(getSpecCoverage)
}
