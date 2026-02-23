import { type Change } from '../../domain/entities/change.js'
import { type ArtifactStatus } from '../../domain/value-objects/artifact-status.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'

/** Input for the {@link GetStatus} use case. */
export interface GetStatusInput {
  /** The change name to look up. */
  name: string
}

/** Effective status of a single artifact, after dependency cascade. */
export interface ArtifactStatusEntry {
  /** Artifact type identifier (e.g. `'proposal'`, `'spec'`). */
  type: string
  /** Effective status after cascading through required dependencies. */
  effectiveStatus: ArtifactStatus
}

/** Result returned by the {@link GetStatus} use case. */
export interface GetStatusResult {
  /** The loaded change with its current artifact state. */
  change: Change
  /** Effective status for each artifact attached to the change. */
  artifactStatuses: ArtifactStatusEntry[]
}

/**
 * Loads a change and reports its current lifecycle state and artifact statuses.
 *
 * Artifact statuses are computed via {@link Change.effectiveStatus}, which
 * cascades through artifact dependency chains — an artifact with all hashes
 * matching is still `in-progress` if any of its dependencies are not `complete`.
 */
export class GetStatus {
  private readonly _changes: ChangeRepository

  /**
   * @param changes - Repository for loading the change
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns The change and its artifact statuses
   * @throws {ChangeNotFoundError} If no change with the given name exists
   */
  async execute(input: GetStatusInput): Promise<GetStatusResult> {
    const change = await this._changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    const artifactStatuses: ArtifactStatusEntry[] = []
    for (const [type] of change.artifacts) {
      artifactStatuses.push({ type, effectiveStatus: change.effectiveStatus(type) })
    }

    return { change, artifactStatuses }
  }
}
