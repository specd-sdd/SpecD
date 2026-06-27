import { ChangeNotFoundError, type ChangeRepository } from '@specd/core'
import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { GetSpecCoverage, type GetSpecCoverageResult } from './get-spec-coverage.js'

/** Input for change-scoped spec coverage. */
export interface GetChangeSpecCoverageInput {
  readonly provider: CodeGraphHostPort
  readonly changes: ChangeRepository
  readonly changeName: string
}

/** Per-spec coverage for all specs in a change. */
export interface GetChangeSpecCoverageResult {
  readonly changeName: string
  readonly specs: readonly GetSpecCoverageResult[]
}

/**
 * Returns implementation coverage for every spec in a named change.
 */
export class GetChangeSpecCoverage {
  private readonly _getSpecCoverage: GetSpecCoverage

  /**
   * Creates a new `GetChangeSpecCoverage` use case.
   *
   * @param getSpecCoverage - Per-spec coverage delegate
   */
  constructor(getSpecCoverage: GetSpecCoverage) {
    this._getSpecCoverage = getSpecCoverage
  }

  /**
   * Executes the use case.
   *
   * @param input - Open provider, change repository, and change name
   * @returns Coverage entries in manifest declaration order
   * @throws {ChangeNotFoundError} When the change does not exist
   */
  async execute(input: GetChangeSpecCoverageInput): Promise<GetChangeSpecCoverageResult> {
    const change = await input.changes.get(input.changeName)
    if (change === null) {
      throw new ChangeNotFoundError(input.changeName)
    }

    const specs = await Promise.all(
      change.specIds.map((specId) =>
        this._getSpecCoverage.execute({ provider: input.provider, specId }),
      ),
    )

    return {
      changeName: input.changeName,
      specs,
    }
  }
}
