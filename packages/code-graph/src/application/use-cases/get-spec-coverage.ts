import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { type Relation } from '../../domain/value-objects/relation.js'

/** Input for single-spec implementation coverage. */
export interface GetSpecCoverageInput {
  readonly provider: CodeGraphHostPort
  readonly specId: string
}

/** Implementation coverage snapshot for one spec. */
export interface GetSpecCoverageResult {
  readonly specId: string
  readonly found: boolean
  readonly coveredFiles: readonly Relation[]
  readonly coveredSymbols: readonly Relation[]
  readonly fileCount: number
  readonly symbolCount: number
}

/**
 * Returns implementation coverage for a single spec from the code graph.
 */
export class GetSpecCoverage {
  /**
   * Executes the use case.
   *
   * @param input - Open provider and target spec id
   * @returns Coverage snapshot; `found: false` when spec is not indexed
   */
  async execute(input: GetSpecCoverageInput): Promise<GetSpecCoverageResult> {
    const spec = await input.provider.getSpec(input.specId)
    if (spec === undefined) {
      return {
        specId: input.specId,
        found: false,
        coveredFiles: [],
        coveredSymbols: [],
        fileCount: 0,
        symbolCount: 0,
      }
    }

    const [coveredFiles, coveredSymbols] = await Promise.all([
      input.provider.getCoveredFiles(input.specId),
      input.provider.getCoveredSymbols(input.specId),
    ])

    const fileCount = new Set(coveredFiles.map((relation) => relation.target)).size
    const symbolCount = new Set(coveredSymbols.map((relation) => relation.target)).size

    return {
      specId: input.specId,
      found: true,
      coveredFiles,
      coveredSymbols,
      fileCount,
      symbolCount,
    }
  }
}
