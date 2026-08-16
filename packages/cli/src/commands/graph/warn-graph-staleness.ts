import { type CodeGraphProvider, type Kernel, type SpecdConfig } from '@specd/sdk'

/**
 * Prints every structured graph-health reason without collapsing independent
 * freshness, coverage, derivation, schema, and generation dimensions.
 *
 * @param provider - Open code graph provider
 * @param config - Resolved project configuration retained for call-site compatibility
 * @param kernel - Kernel retained for call-site compatibility
 * @returns When the health probe completes
 */
export async function warnGraphStale(
  provider: CodeGraphProvider,
  config: SpecdConfig,
  kernel: Kernel | null,
): Promise<void> {
  void config
  void kernel
  try {
    const health = await provider.getGraphHealth()
    for (const reason of health.reasonCodes) {
      process.stderr.write(`⚠ Graph health: ${reason}\n`)
    }
  } catch {
    // Health diagnostics are advisory; the command operation remains authoritative.
  }
}
