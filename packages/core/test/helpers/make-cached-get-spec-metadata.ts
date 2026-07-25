import { type Spec } from '../../src/domain/entities/spec.js'
import { computeMetadataFingerprint } from '../../src/domain/services/metadata-projection.js'
import { type SpecMetadata } from '../../src/domain/services/parse-metadata.js'
import { parseSpecId } from '../../src/domain/services/parse-spec-id.js'
import { SpecPath } from '../../src/domain/value-objects/spec-path.js'
import { type ContentHasher } from '../../src/application/ports/content-hasher.js'
import { type SpecRepository } from '../../src/application/ports/spec-repository.js'
import { type GetSpecMetadata } from '../../src/application/use-cases/get-spec-metadata.js'

/**
 * Reads cached metadata for one spec without materialization orchestration.
 *
 * @param repo - Spec repository
 * @param spec - Spec entity
 * @param hasher - Content hasher for fingerprint computation
 * @returns Cached metadata or null
 */
export async function readCachedMetadataForTest(
  repo: SpecRepository,
  spec: Spec,
  hasher: ContentHasher,
): Promise<{ metadata: SpecMetadata; metadataFingerprint: string } | null> {
  const snapshot = await repo.readMetadataSnapshot(spec)
  if (snapshot.kind !== 'present') {
    return null
  }
  return {
    metadata: snapshot.metadata,
    metadataFingerprint: computeMetadataFingerprint(snapshot.metadata, hasher),
  }
}

/**
 * Minimal GetSpecMetadata test double backed by repository metadata snapshots.
 *
 * Missing/invalid cache is treated as a successful empty projection so callers that
 * expect self-healing materialization (e.g. ValidateSpecs) do not fail solely because
 * the fixture omitted a cache file. Inject a throwing double to test materialization
 * failure paths explicitly.
 *
 * @param specRepos - Spec repositories keyed by workspace name
 * @param hasher - Content hasher for fingerprint computation
 * @returns GetSpecMetadata test double
 */
export function makeSnapshotGetSpecMetadata(
  specRepos: ReadonlyMap<string, SpecRepository>,
  hasher: ContentHasher,
): GetSpecMetadata {
  return {
    execute: async ({ specId }: { specId: string }) => {
      const { workspace, capPath } = parseSpecId(specId)
      const repo = specRepos.get(workspace)
      if (repo === undefined) {
        throw new Error(`workspace not found: ${workspace}`)
      }
      const spec = await repo.get(SpecPath.parse(capPath))
      if (spec === null) {
        throw new Error(`spec not found: ${specId}`)
      }
      const cached = await readCachedMetadataForTest(repo, spec, hasher)
      if (cached === null) {
        const metadata: SpecMetadata = {}
        return {
          metadata,
          metadataFingerprint: computeMetadataFingerprint(metadata, hasher),
          source: 'generated' as const,
          regenerated: true,
          warnings: [],
        }
      }
      const regenerated = cached.metadata.provenance === undefined
      return {
        metadata: cached.metadata,
        metadataFingerprint: cached.metadataFingerprint,
        source: 'persisted' as const,
        regenerated,
        warnings: [],
      }
    },
  } as unknown as GetSpecMetadata
}
