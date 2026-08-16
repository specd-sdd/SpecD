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
  /** Optional complete file batch applied atomically; `file` remains the compatibility primary. */
  readonly files?: readonly string[]
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
    const { result } = await this._changes.mutate(input.name, async (change) => {
      const files = input.files === undefined ? [input.file] : [...new Set(input.files)]
      await Promise.all(files.map(async (file) => this._validateMutation(change, input, file)))

      switch (input.action) {
        case 'add':
          this._applyAdd(change, input)
          break
        case 'remove':
          this._applyRemove(change, input)
          break
        case 'ignore':
          for (const file of files) this._applyIgnore(change, file)
          break
        case 'resolve':
          for (const file of files) this._applyResolve(change, file)
          break
        case 'unresolve':
          for (const file of files) this._applyUnresolve(change, file)
          break
      }

      return { implementationTracking: projectImplementationTracking(change) }
    })

    return { implementationTracking: result.implementationTracking }
  }

  /**
   * Validates one member of a mutation batch before any entity mutation occurs.
   *
   * @param change - Persisted change being mutated
   * @param input - Complete mutation input
   * @param file - Batch member to validate
   */
  private async _validateMutation(
    change: Change,
    input: UpdateImplementationTrackingInput,
    file: string,
  ): Promise<void> {
    if (input.action === 'remove') return
    if (input.action === 'add' && input.specId === undefined) {
      throw new ChangeNotFoundError(change.name)
    }

    const entry = this._trackedEntry(change, file)
    if (input.action === 'resolve' || input.action === 'unresolve') {
      if (entry === undefined || entry.state === 'removed') {
        throw new ImplementationFileNotFoundError(file)
      }
    }

    if (input.action === 'ignore' && entry !== undefined) return
    this._requireExists(file, await this._fileExists(file))
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
   * Applies an `add` mutation, validating file existence first.
   *
   * @param change - The persisted change under mutation
   * @param input - Mutation parameters
   * @throws {ChangeNotFoundError} When `specId` is absent from the mutation input
   * @throws {ImplementationFileNotFoundError} When the file does not exist on disk
   */
  private _applyAdd(change: Change, input: UpdateImplementationTrackingInput): void {
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
  private _applyIgnore(change: Change, file: string): void {
    change.trackImplementationFile(file, 'ignored')
  }

  /**
   * Applies a `resolve` mutation, requiring on-disk existence.
   *
   * @param change - The persisted change under mutation
   * @param file - Raw project-relative file path to resolve
   * @throws {ImplementationFileNotFoundError} If the file does not exist on disk
   */
  private _applyResolve(change: Change, file: string): void {
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
  private _applyUnresolve(change: Change, file: string): void {
    change.trackImplementationFile(file, 'open')
  }
}
