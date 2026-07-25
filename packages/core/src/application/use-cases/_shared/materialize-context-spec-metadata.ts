import { type SpecMetadata } from '../../../domain/services/parse-metadata.js'
import { type GetSpecMetadata, type GetSpecMetadataResult } from '../get-spec-metadata.js'
import { type ContextWarning } from './context-warning.js'

/**
 * Materializes spec metadata for context consumers and appends diagnostics.
 *
 * @param getMetadata - Metadata materialization use case
 * @param specId - Canonical spec identifier
 * @param warnings - Mutable warning sink for materialization diagnostics
 * @returns Materialized metadata projection
 */
export async function materializeContextSpecMetadata(
  getMetadata: GetSpecMetadata,
  specId: string,
  warnings: ContextWarning[],
): Promise<SpecMetadata> {
  const result = await getMetadata.execute({ specId })
  appendMaterializationDiagnostics(specId, result, warnings)
  return result.metadata
}

/**
 * Appends user-facing diagnostics from a metadata materialization result.
 *
 * @param specId - Canonical spec identifier
 * @param result - Materialization result
 * @param warnings - Mutable warning sink
 */
export function appendMaterializationDiagnostics(
  specId: string,
  result: GetSpecMetadataResult,
  warnings: ContextWarning[],
): void {
  if (result.regenerated) {
    warnings.push({
      type: 'stale-metadata',
      path: specId,
      message: `Metadata for '${specId}' was regenerated (${result.source}).`,
    })
  }

  for (const warning of result.warnings) {
    if (warning.kind === 'metadata-cache-write-failed') {
      warnings.push({
        type: 'stale-metadata',
        path: specId,
        message: `Metadata cache write failed for '${specId}': ${warning.error}`,
      })
    }
  }
}
