import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'

/** Input for the {@link GetImplementationReview} use case. */
export interface GetImplementationReviewInput {
  /** The change name to inspect. */
  readonly name: string
}

/** Result returned by {@link GetImplementationReview}. */
export interface GetImplementationReviewResult {
  /** Raw implementation-tracking projection for the change. */
  readonly implementationTracking: ImplementationTrackingProjection
  /** Specs already in scope for the change. */
  readonly specIds: readonly string[]
}

/**
 * Returns the raw implementation-tracking state for one change.
 */
export class GetImplementationReview {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `GetImplementationReview` use case instance.
   *
   * @param changes - Repository for loading the change
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns Raw implementation-tracking projection
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: GetImplementationReviewInput): Promise<GetImplementationReviewResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return {
      implementationTracking: projectImplementationTracking(change),
      specIds: change.specIds,
    }
  }
}
