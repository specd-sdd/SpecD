import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type FileReader } from '../ports/file-reader.js'
import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { ImplementationFileNotFoundError } from '../errors/implementation-file-not-found-error.js'
import {
  type ImplementationTrackingProjection,
  projectImplementationTracking,
} from './_shared/implementation-tracking.js'

/** Supported implementation-tracking mutations. */
export type UpdateImplementationTrackingAction =
  | 'add'
  | 'remove'
  | 'ignore'
  | 'resolve'
  | 'unresolve'

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
 *
 * File-existence validation is enforced here in the core use case rather than
 * in the CLI delivery layer. The rules are:
 *
 * - `add` requires the target file to exist on disk.
 * - `resolve` requires the target file to exist on disk and already be tracked.
 * - `unresolve` requires the target file to exist on disk, already be tracked,
 *   and refuses to reopen files in the `removed` state (only refresh-driven
 *   resurrection can do that).
 * - `ignore` allows missing files only when they are already tracked;
 *   untracked missing files are rejected, and tracked files keep their
 *   confirmed implementation links.
 */
export class UpdateImplementationTracking {
  private readonly _changes: ChangeRepository
  private readonly _files: FileReader
  private readonly _projectRoot: string

  /**
   * Creates a new `UpdateImplementationTracking` use case instance.
   *
   * @param changes - Repository for persisted change mutations
   * @param files - File reader for existence validation
   * @param projectRoot - Absolute path to the project root directory
   */
  constructor(changes: ChangeRepository, files: FileReader, projectRoot: string) {
    this._changes = changes
    this._files = files
    this._projectRoot = projectRoot
  }

  /**
   * Executes the use case.
   *
   * @param input - Mutation parameters
   * @returns Raw implementation-tracking projection after mutation
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {ImplementationFileNotFoundError} If a file-required action targets a missing file
   */
  async execute(
    input: UpdateImplementationTrackingInput,
  ): Promise<UpdateImplementationTrackingResult> {
    const implementationTracking = await this._changes.mutate(input.name, async (change) => {
      switch (input.action) {
        case 'add':
          await this._applyAdd(change, input)
          break
        case 'remove':
          this._applyRemove(change, input)
          break
        case 'ignore':
          await this._applyIgnore(change, input.file)
          break
        case 'resolve':
          await this._applyResolve(change, input.file)
          break
        case 'unresolve':
          await this._applyUnresolve(change, input.file)
          break
      }

      return projectImplementationTracking(change)
    })

    return { implementationTracking }
  }

  /**
   * Checks whether a project-relative file exists on disk.
   *
   * @param file - Raw project-relative file path
   * @returns `true` when the file exists, `false` otherwise
   */
  private async _fileExists(file: string): Promise<boolean> {
    const absolutePath = path.resolve(this._projectRoot, file)
    return (await this._files.read(absolutePath)) !== null
  }

  /**
   * Throws {@link ImplementationFileNotFoundError} when the file does not exist.
   *
   * @param file - Raw project-relative file path
   * @param exists - Whether the file exists on disk
   * @throws {ImplementationFileNotFoundError} When `exists` is `false`
   */
  private _requireExists(file: string, exists: boolean): void {
    if (!exists) {
      throw new ImplementationFileNotFoundError(file)
    }
  }

  /**
   * Returns the tracked entry for the given file, if any.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path
   * @returns The tracked entry, or `undefined` when the file is untracked
   */
  private _trackedEntry(
    change: Change,
    file: string,
  ): Change['trackedImplementationFiles'][number] | undefined {
    return change.trackedImplementationFiles.find((entry) => entry.file === file)
  }

  /**
   * Requires a file to already be tracked by the change.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path
   * @returns The tracked entry
   * @throws {ImplementationFileNotFoundError} When the file is not tracked
   */
  private _requireTracked(
    change: Change,
    file: string,
  ): Change['trackedImplementationFiles'][number] {
    const entry = this._trackedEntry(change, file)
    if (entry === undefined) {
      throw new ImplementationFileNotFoundError(file)
    }
    return entry
  }

  /**
   * Applies an `add` mutation, validating file existence first.
   *
   * @param change - The persisted change under mutation
   * @param input - Mutation parameters
   * @throws {ChangeNotFoundError} When `specId` is absent from the mutation input
   * @throws {ImplementationFileNotFoundError} When the file does not exist on disk
   */
  private async _applyAdd(change: Change, input: UpdateImplementationTrackingInput): Promise<void> {
    if (input.specId === undefined) {
      throw new ChangeNotFoundError(change.name)
    }

    const exists = await this._fileExists(input.file)
    this._requireExists(input.file, exists)

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
  private _applyRemove(change: Change, input: UpdateImplementationTrackingInput): void {
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
   * Applies an `ignore` mutation, allowing tracked missing files.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path to ignore
   * @throws {ImplementationFileNotFoundError} If the file is untracked and missing on disk
   */
  private async _applyIgnore(change: Change, file: string): Promise<void> {
    const entry = this._trackedEntry(change, file)

    if (entry === undefined) {
      const exists = await this._fileExists(file)
      this._requireExists(file, exists)
    }

    change.trackImplementationFile(file, 'ignored')
  }

  /**
   * Applies a `resolve` mutation, requiring on-disk existence.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path to resolve
   * @throws {ImplementationFileNotFoundError} If the file does not exist on disk
   */
  private async _applyResolve(change: Change, file: string): Promise<void> {
    const entry = this._requireTracked(change, file)
    const exists = await this._fileExists(file)
    this._requireExists(file, exists)

    if (entry.state === 'removed') {
      throw new ImplementationFileNotFoundError(file)
    }

    change.trackImplementationFile(file, 'resolved')
  }

  /**
   * Applies an `unresolve` mutation, reopening to `open`.
   *
   * Refuses to reopen files in the `removed` state; only refresh-driven
   * resurrection can restore removed files.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path to reopen
   * @throws {ImplementationFileNotFoundError} If the file does not exist or is `removed`
   */
  private async _applyUnresolve(change: Change, file: string): Promise<void> {
    const entry = this._requireTracked(change, file)
    const exists = await this._fileExists(file)
    this._requireExists(file, exists)

    if (entry.state === 'removed') {
      throw new ImplementationFileNotFoundError(file)
    }

    change.trackImplementationFile(file, 'open')
  }
}
