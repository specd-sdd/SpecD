import { type Spec } from '../../../domain/entities/spec.js'
import { type SpecMetadata } from '../../../domain/services/parse-metadata.js'
import { type SpecRepository } from '../../ports/spec-repository.js'

/**
 * Reads the cached metadata snapshot when present and valid.
 *
 * @param repo - Spec repository for the target workspace
 * @param spec - Target spec entity
 * @returns Cached metadata, or `null` when no snapshot exists
 */
export async function readCachedSpecMetadata(
  repo: SpecRepository,
  spec: Spec,
): Promise<SpecMetadata | null> {
  const snapshot = await repo.readMetadataSnapshot(spec)
  if (snapshot.kind === 'present') {
    return snapshot.metadata
  }
  return null
}
