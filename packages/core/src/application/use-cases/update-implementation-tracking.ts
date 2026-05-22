import { type ChangeRepository } from '../ports/change-repository.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ImplementationLinksExistError } from '../errors/implementation-links-exist-error.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'

/** Supported implementation-tracking mutations. */
export type UpdateImplementationTrackingAction = 'add' | 'remove' | 'ignore' | 'resolve'

/** Input for the {@link UpdateImplementationTracking} use case. */
export interface UpdateImplementationTrackingInput {
  /** The change to mutate. */
  readonly name: string
  /** Requested mutation kind. */
  readonly action: UpdateImplementationTrackingAction
  /** Raw project-relative file path. */
  readonly file: string
  /** Canonical spec ID for link mutations. */
  readonly specId?: string
  /** Optional symbol refinements. */
  readonly symbols?: readonly string[]
}

/** Result returned by {@link UpdateImplementationTracking}. */
export interface UpdateImplementationTrackingResult {
  /** Raw implementation-tracking projection after mutation. */
  readonly implementationTracking: ImplementationTrackingProjection
}

/**
 * Applies one implementation-tracking mutation to a change.
 */
export class UpdateImplementationTracking {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `UpdateImplementationTracking` use case instance.
   *
   * @param changes - Repository for persisted change mutations
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the use case.
   *
   * @param input - Mutation parameters
   * @returns Raw implementation-tracking projection after mutation
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {ImplementationLinksExistError} If `ignore` targets a file with live links
   */
  async execute(
    input: UpdateImplementationTrackingInput,
  ): Promise<UpdateImplementationTrackingResult> {
    const implementationTracking = await this._changes.mutate(input.name, (change) => {
      switch (input.action) {
        case 'add':
          this._applyAdd(change, input)
          break
        case 'remove':
          this._applyRemove(change, input)
          break
        case 'ignore':
          this._applyIgnore(change, input.file)
          break
        case 'resolve':
          change.trackImplementationFile(input.file, 'resolved')
          break
      }

      return projectImplementationTracking(change)
    })

    return { implementationTracking }
  }

  /**
   * Applies an `add` mutation.
   *
   * @param change - The persisted change under mutation
   * @param input - Mutation parameters
   * @throws {ChangeNotFoundError} When `specId` is absent from the mutation input
   */
  private _applyAdd(
    change: import('../../domain/entities/change.js').Change,
    input: UpdateImplementationTrackingInput,
  ): void {
    if (input.specId === undefined) {
      throw new ChangeNotFoundError(change.name)
    }

    const hasSymbols = input.symbols !== undefined && input.symbols.length > 0
    change.addImplementationLink({
      specId: input.specId,
      file: input.file,
      fileLinkExplicit: !hasSymbols,
      ...(hasSymbols ? { symbols: input.symbols } : {}),
    })

    if (!change.trackedImplementationFiles.some((entry) => entry.file === input.file)) {
      change.trackImplementationFile(input.file, 'open')
    }
  }

  /**
   * Applies a `remove` mutation.
   *
   * @param change - The persisted change under mutation
   * @param input - Mutation parameters
   * @throws {ChangeNotFoundError} When `specId` is absent from the mutation input
   */
  private _applyRemove(
    change: import('../../domain/entities/change.js').Change,
    input: UpdateImplementationTrackingInput,
  ): void {
    if (input.specId === undefined) {
      throw new ChangeNotFoundError(change.name)
    }

    if (input.symbols !== undefined && input.symbols.length > 0) {
      for (const symbol of input.symbols) {
        change.removeImplementationSymbol(input.specId, input.file, symbol)
      }
      return
    }

    change.removeImplementationLink(input.specId, input.file)
  }

  /**
   * Applies an `ignore` mutation.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path to ignore
   * @throws {ImplementationLinksExistError} If confirmed links still reference the file
   */
  private _applyIgnore(
    change: import('../../domain/entities/change.js').Change,
    file: string,
  ): void {
    const linkedSpecIds = change.implementationLinks
      .filter((link) => link.file === file)
      .map((link) => link.specId)

    if (linkedSpecIds.length > 0) {
      throw new ImplementationLinksExistError(file, [...new Set(linkedSpecIds)])
    }

    change.trackImplementationFile(file, 'ignored')
  }
}
