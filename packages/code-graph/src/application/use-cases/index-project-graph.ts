import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { type GetSpecMetadata } from '@specd/core'
import {
  type IndexProgressCallback,
  type ProjectGraphConfig,
  type WorkspaceIndexTarget,
} from '../../domain/value-objects/index-options.js'
import { type IndexResult } from '../../domain/value-objects/index-result.js'

/** Input for project graph indexing on an open provider. */
export interface IndexProjectGraphInput {
  readonly provider: CodeGraphHostPort
  readonly projectRoot: string
  readonly workspaces: readonly WorkspaceIndexTarget[]
  readonly graphConfig: ProjectGraphConfig
  readonly codeGraphVersion: string
  readonly vcsRoot: string | null
  readonly vcsRef?: string
  readonly force?: boolean
  readonly onProgress?: IndexProgressCallback
  /** Materialized spec metadata source used for spec-content fingerprinting. */
  readonly getSpecMetadata?: GetSpecMetadata
}

/**
 * Executes project graph indexing with optional forced logical reindex.
 */
export class IndexProjectGraph {
  /**
   * Executes the use case.
   *
   * @param input - Open provider and prepared index options
   * @returns Index result from the provider
   */
  async execute(input: IndexProjectGraphInput): Promise<IndexResult> {
    return input.provider.index({
      projectRoot: input.projectRoot,
      workspaces: [...input.workspaces],
      graphConfig: input.graphConfig,
      codeGraphVersion: input.codeGraphVersion,
      vcsRoot: input.vcsRoot,
      ...(input.force === true ? { force: true } : {}),
      ...(input.vcsRef !== undefined ? { vcsRef: input.vcsRef } : {}),
      ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
      ...(input.getSpecMetadata !== undefined ? { getSpecMetadata: input.getSpecMetadata } : {}),
    })
  }
}
