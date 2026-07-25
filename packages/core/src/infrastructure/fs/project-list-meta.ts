import {
  type GeneratedMetadataMeta,
  type PersistedStateMeta,
  type SpecListArtifactMeta,
  type SpecListEntry,
} from '../../application/ports/spec-repository.js'
import { type SourceFileStamp } from './fs-index-cache-base.js'

const SPEC_LOCK_FILENAME = 'spec-lock.json'
const GENERATED_METADATA_FILENAME = 'metadata.json'

/**
 * Projects list-entry Meta fields from indexed per-file mtimes.
 *
 * Never populates `hash` — list Meta is lastModified-only.
 *
 * @param sourceFiles - Per-file stamps from the fs-cache index wire line
 * @returns Meta fields for {@link SpecListEntry} when `includeMeta` is set
 */
export function projectListMetaFromSourceFiles(
  sourceFiles: readonly SourceFileStamp[],
): Pick<SpecListEntry, 'artifacts' | 'persistedStateMeta' | 'generatedMetadataMeta'> {
  const lockStamp = sourceFiles.find((file) => file.filename === SPEC_LOCK_FILENAME)
  const metadataStamp = sourceFiles.find((file) => file.filename === GENERATED_METADATA_FILENAME)

  const artifacts: SpecListArtifactMeta[] = sourceFiles
    .filter(
      (file) =>
        file.filename !== SPEC_LOCK_FILENAME && file.filename !== GENERATED_METADATA_FILENAME,
    )
    .map((file) => ({ filename: file.filename, lastModified: file.mtime }))
    .sort((a, b) => a.filename.localeCompare(b.filename))

  const persistedStateMeta: PersistedStateMeta | null =
    lockStamp !== undefined ? { lastModified: lockStamp.mtime } : null

  const generatedMetadataMeta: GeneratedMetadataMeta | null =
    metadataStamp !== undefined ? { lastModified: metadataStamp.mtime } : null

  return {
    artifacts,
    persistedStateMeta,
    generatedMetadataMeta,
  }
}
