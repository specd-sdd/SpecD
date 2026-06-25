import { createVcsAdapter, type Kernel, type SpecdConfig } from '@specd/core'
import {
  isGraphStale,
  detectFingerprintMismatch,
  parseFingerprintMap,
  buildProjectGraphConfig,
  type CodeGraphProvider,
} from '@specd/code-graph'
import { codeGraphVersion } from './code-graph-version.js'

/**
 * Checks if the graph is stale or has a derivation fingerprint mismatch,
 * and prints warning messages to stderr.
 *
 * @param provider - The code graph provider.
 * @param config - The specd configuration.
 * @param kernel - The specd kernel, or null if in bootstrap mode.
 */
export async function warnGraphStale(
  provider: CodeGraphProvider,
  config: SpecdConfig,
  kernel: Kernel | null,
): Promise<void> {
  try {
    const stats = await provider.getStatistics()

    let currentRef: string | null = null
    try {
      const vcs = await createVcsAdapter(config.projectRoot)
      currentRef = await vcs.ref()
    } catch {
      // Staleness detection unavailable
    }

    const stale = isGraphStale(stats.lastIndexedRef, currentRef)
    if (stale === true && stats.lastIndexedRef !== null && currentRef !== null) {
      process.stderr.write(
        `⚠ Graph is stale (indexed at ${stats.lastIndexedRef.slice(0, 7)}, current: ${currentRef.slice(0, 7)})\n`,
      )
    }

    if (kernel !== null && stats.graphFingerprint !== null) {
      try {
        const workspaces = await kernel.project.listWorkspaces.execute()
        const storedMap = parseFingerprintMap(stats.graphFingerprint)
        const graphConfig = buildProjectGraphConfig(config)

        const fingerprintMismatch = detectFingerprintMismatch(
          storedMap,
          codeGraphVersion,
          config.projectRoot,
          workspaces,
          graphConfig,
        )
        if (fingerprintMismatch === true) {
          process.stderr.write(
            '⚠ Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index\n',
          )
        }
      } catch {
        // Fingerprint check unavailable
      }
    }
  } catch {
    // Stats query failed or provider not open
  }
}
