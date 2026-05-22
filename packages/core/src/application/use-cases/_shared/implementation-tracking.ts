import {
  type Change,
  type ImplementationLink,
  type TrackedImplementationFile,
} from '../../../domain/entities/change.js'

/** Raw implementation-tracking projection returned by core use cases. */
export interface ImplementationTrackingProjection {
  /** Tracked implementation files with explicit review state. */
  readonly trackedFiles: readonly TrackedImplementationFile[]
  /** Confirmed file-level and symbol-level implementation links. */
  readonly links: readonly ImplementationLink[]
}

/**
 * Projects the implementation-tracking state from a change.
 *
 * @param change - The change whose implementation state should be exposed
 * @returns Raw implementation-tracking projection
 */
export function projectImplementationTracking(change: Change): ImplementationTrackingProjection {
  return {
    trackedFiles: change.trackedImplementationFiles,
    links: change.implementationLinks,
  }
}
