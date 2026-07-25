import { ABSENT_SPEC_SIDECAR, Spec, type SpecSidecarStamp } from '../../../domain/entities/spec.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type SpecListEntry } from '../../ports/spec-repository.js'
import { type ValidationSourceStamps } from '../../ports/validation-result-cache.js'

/**
 * Returns whether a list entry includes projected Meta stamps.
 *
 * @param entry - Row from `list({ includeMeta: true })`
 * @returns `true` when Meta fields were requested and projected
 */
export function listEntryHasMeta(entry: SpecListEntry): boolean {
  return entry.artifacts !== undefined
}

/**
 * Converts projected list Meta into a validation cache stamp bundle.
 *
 * @param entry - Row from `list({ includeMeta: true })`
 * @returns Stamp bundle equivalent to `stampsFromSpec(get())`
 */
export function stampsFromListEntry(entry: SpecListEntry): ValidationSourceStamps {
  const artifacts = entry.artifacts ?? []

  const persistedStateStamp: SpecSidecarStamp =
    entry.persistedStateMeta === null || entry.persistedStateMeta === undefined
      ? ABSENT_SPEC_SIDECAR
      : { present: true, lastModified: entry.persistedStateMeta.lastModified }

  const generatedMetadataStamp: SpecSidecarStamp =
    entry.generatedMetadataMeta === null || entry.generatedMetadataMeta === undefined
      ? ABSENT_SPEC_SIDECAR
      : { present: true, lastModified: entry.generatedMetadataMeta.lastModified }

  return {
    artifacts: [...artifacts],
    persistedStateStamp,
    generatedMetadataStamp,
  }
}

/**
 * Builds a lightweight {@link Spec} from a list row with projected Meta.
 *
 * @param entry - Row from `list({ includeMeta: true })`
 * @returns Spec entity suitable for cache lookup without calling `get()`
 */
export function specFromListEntry(entry: SpecListEntry): Spec {
  const stamps = stampsFromListEntry(entry)
  return new Spec(
    entry.workspace,
    SpecPath.parse(entry.path),
    stamps.artifacts,
    stamps.persistedStateStamp,
    stamps.generatedMetadataStamp,
  )
}
