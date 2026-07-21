import { type SpecdConfig, type VcsAdapter } from '@specd/core'
import { type CodeGraphHostPort } from '../ports/code-graph-host-port.js'
import { type GraphStatistics } from '../../domain/value-objects/graph-statistics.js'
import { type WorkspaceIndexTarget } from '../../domain/value-objects/index-options.js'
import { isGraphStale } from '../../domain/services/is-graph-stale.js'
import {
  parseFingerprintMap,
  detectFingerprintMismatch,
} from './_shared/compute-graph-fingerprint.js'
import { buildProjectGraphConfig } from '../services/build-project-graph-config.js'

/** Input for graph health diagnostics on an open provider. */
export interface GetGraphHealthInput {
  readonly config: SpecdConfig
  readonly provider: CodeGraphHostPort
  readonly codeGraphVersion: string
  readonly workspaces?: readonly WorkspaceIndexTarget[]
}

/** Graph statistics enriched with staleness and fingerprint diagnostics. */
export interface GetGraphHealthResult extends GraphStatistics {
  readonly stale: boolean | null
  readonly currentRef: string | null
  readonly fingerprintMismatch: boolean | null
}

/**
 * Returns graph statistics plus VCS staleness and derivation fingerprint diagnostics.
 */
export class GetGraphHealth {
  /** Creates graph health diagnostics with a composition-supplied VCS resolver.
   * @param createVcsAdapter - Resolver for the current VCS reference.
   */
  constructor(private readonly createVcsAdapter: (projectRoot: string) => Promise<VcsAdapter>) {}
  /**
   * Executes the use case.
   *
   * @param input - Open provider, project config, and optional workspace targets
   * @returns Enriched graph health snapshot
   */
  async execute(input: GetGraphHealthInput): Promise<GetGraphHealthResult> {
    const stats = await input.provider.getStatistics()

    let currentRef: string | null = null
    try {
      const vcs = await this.createVcsAdapter(input.config.projectRoot)
      currentRef = await vcs.ref()
    } catch {
      // No VCS or ref unavailable
    }

    const stale = isGraphStale(stats.lastIndexedRef, currentRef)

    let fingerprintMismatch: boolean | null = null
    if (input.workspaces !== undefined && stats.graphFingerprint !== null) {
      try {
        const storedMap = parseFingerprintMap(stats.graphFingerprint)
        const graphConfig = buildProjectGraphConfig(input.config)
        fingerprintMismatch = detectFingerprintMismatch(
          storedMap,
          input.codeGraphVersion,
          input.config.projectRoot,
          [...input.workspaces],
          graphConfig,
        )
      } catch {
        fingerprintMismatch = null
      }
    }

    return {
      ...stats,
      stale,
      currentRef,
      fingerprintMismatch,
    }
  }
}
