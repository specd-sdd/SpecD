import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { detectSpecOverlap } from '../../domain/services/detect-spec-overlap.js'
import { OverlapReport } from '../../domain/value-objects/overlap-report.js'

/** Input for the {@link DetectOverlap} use case. */
export interface DetectOverlapInput {
  /** When provided, only return overlap entries involving this change. */
  readonly name?: string
}

/**
 * Detects spec overlap across active changes.
 *
 * Loads all active changes via the repository, delegates to the
 * `detectSpecOverlap` domain service, and optionally filters
 * results to a named change.
 */
export class DetectOverlap {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `DetectOverlap` use case instance.
   *
   * @param changes - Repository for listing active changes
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Optional filter by change name
   * @returns Overlap report, optionally filtered to the named change
   * @throws ChangeNotFoundError when `input.name` is provided but not found
   */
  async execute(input?: DetectOverlapInput): Promise<OverlapReport> {
    const changes = await this._changes.list()
    const report = detectSpecOverlap(changes)

    const name = input?.name
    if (name === undefined) {
      return report
    }

    const found = changes.some((c) => c.name === name)
    if (!found) {
      throw new ChangeNotFoundError(name)
    }

    const filtered = report.entries.filter((entry) => entry.changes.some((c) => c.name === name))

    return new OverlapReport(filtered)
  }
}
