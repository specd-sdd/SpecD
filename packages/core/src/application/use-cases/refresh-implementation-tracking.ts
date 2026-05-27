import { type ChangeRepository } from '../ports/change-repository.js'
import { type ImplementationDetector } from '../ports/implementation-detector.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'

/** Input for the {@link RefreshImplementationTracking} use case. */
export interface RefreshImplementationTrackingInput {
  /** The change name to refresh. */
  readonly name: string
}

/** Result returned by {@link RefreshImplementationTracking}. */
export interface RefreshImplementationTrackingResult {
  /** Raw implementation-tracking projection after refresh. */
  readonly implementationTracking: ImplementationTrackingProjection
}

/**
 * Runs targeted VCS-backed implementation autodetection and merges new paths into
 * tracked implementation files for a change.
 */
export class RefreshImplementationTracking {
  private readonly _changes: ChangeRepository
  private readonly _implementationDetector: ImplementationDetector

  /**
   * Creates a new `RefreshImplementationTracking` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param implementationDetector - Detector for targeted candidate discovery
   */
  constructor(changes: ChangeRepository, implementationDetector: ImplementationDetector) {
    this._changes = changes
    this._implementationDetector = implementationDetector
  }

  /**
   * Executes the use case.
   *
   * @param input - Refresh parameters
   * @returns Raw implementation-tracking projection after refresh
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(
    input: RefreshImplementationTrackingInput,
  ): Promise<RefreshImplementationTrackingResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    if (change.getHistoricalImplementationAt() === null) {
      return { implementationTracking: projectImplementationTracking(change) }
    }

    const files = await this._implementationDetector.detectModifiedFiles(change)
    const newFiles = files.filter(
      (file) => !change.trackedImplementationFiles.some((entry) => entry.file === file),
    )

    if (newFiles.length === 0) {
      return { implementationTracking: projectImplementationTracking(change) }
    }

    const implementationTracking = await this._changes.mutate(input.name, (freshChange) => {
      for (const file of newFiles) {
        if (freshChange.trackedImplementationFiles.some((entry) => entry.file === file)) continue
        freshChange.trackImplementationFile(file, 'open')
      }
      return projectImplementationTracking(freshChange)
    })

    if (implementationTracking === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return { implementationTracking }
  }
}
