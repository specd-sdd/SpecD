import type { ArtifactStatus } from './artifact-status.js'

/**
 * Human-facing display status that extends canonical {@link ArtifactStatus}
 * with the derived `complete-with-drift` state.
 *
 * Returned by `ArtifactFile.displayStatus()` when the file is canonically
 * `complete` but `hasDrift` is `true`.
 */
export type ArtifactDisplayStatus = ArtifactStatus | 'complete-with-drift'
