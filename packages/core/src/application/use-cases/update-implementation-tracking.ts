import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { toLogicalFilePath } from '../../domain/services/to-logical-file-path.js'
import { sameTrackedFile } from '../../domain/services/same-tracked-file.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type FileReader } from '../ports/file-reader.js'
import { type SpecRepository } from '../ports/spec-repository.js'
import { InvalidInputError } from '../../domain/errors/invalid-input-error.js'
import { ImplementationFileNotFoundError } from '../errors/implementation-file-not-found-error.js'
import { SpecNotFoundError } from '../errors/spec-not-found-error.js'
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
  | 'start'

/** Input for the {@link UpdateImplementationTracking} use case. */
export interface UpdateImplementationTrackingInput {
  /** The change to mutate. */
  readonly name: string
  /** Requested mutation kind. */
  readonly action: UpdateImplementationTrackingAction
  /**
   * Raw project-relative file path. Required for file-based actions; optional for 'start'.
   * When combined with `files`, `file` is applied first followed by every `files` entry.
   */
  readonly file?: string
  /** Optional file batch applied atomically together with `file` (if both are given). */
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
  /** When tracking started for the change; `null` when it has not been started. */
  readonly trackingStartedAt: Date | null
}

/**
 * Applies one implementation-tracking mutation to a change.
 *
 * File-existence validation is enforced here in the core use case rather than
 * in the CLI delivery layer. The rules are:
 *
 * - `start` activates implementation tracking without requiring a file path.
 * - `add` requires the target file to exist on disk and validates that `specId`
 *   is declared on the change or exists in the canonical spec repository.
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
  private readonly _specRepositories: ReadonlyMap<string, SpecRepository>
  private readonly _platform: NodeJS.Platform

  /**
   * Creates a new `UpdateImplementationTracking` use case instance.
   *
   * @param changes - Repository for persisted change mutations
   * @param files - File reader for existence validation
   * @param projectRoot - Absolute path to the project root directory
   * @param specRepositories - Spec repositories keyed by workspace name
   * @param platform - Host platform used to normalize logical file paths
   */
  constructor(
    changes: ChangeRepository,
    files: FileReader,
    projectRoot: string,
    specRepositories: ReadonlyMap<string, SpecRepository>,
    platform: NodeJS.Platform = process.platform,
  ) {
    this._changes = changes
    this._files = files
    this._projectRoot = projectRoot
    this._specRepositories = specRepositories
    this._platform = platform
  }

  /**
   * Executes the use case.
   *
   * @param input - Mutation parameters
   * @returns Raw implementation-tracking projection after mutation
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidInputError} If `add` or `remove` is requested without `specId`
   * @throws {InvalidSpecIdError} If `specId` is empty, blank, or malformed
   * @throws {WorkspaceNotFoundError} If the `specId` workspace is not configured
   * @throws {SpecNotFoundError} If an `add` target spec does not exist
   * @throws {ImplementationFileNotFoundError} If a file-required action targets a missing file
   */
  async execute(
    input: UpdateImplementationTrackingInput,
  ): Promise<UpdateImplementationTrackingResult> {
    if ((input.action === 'add' || input.action === 'remove') && input.specId === undefined) {
      throw new InvalidInputError(`specId is required for action "${input.action}"`)
    }

    const { result } = await this._changes.mutate(input.name, async (change) => {
      // Validated for every action (including `start`) before any entity mutation, but after the
      // change lookup so a missing change still reports ChangeNotFoundError first.
      const normalizedSpecId =
        input.specId !== undefined
          ? parseSpecId(input.specId, { workspaces: this._specRepositories.keys() }).specId
          : undefined

      if (input.action === 'start') {
        change.startImplementationTracking()
        return {
          implementationTracking: projectImplementationTracking(change),
          trackingStartedAt: change.implementationTrackingStartedAt,
        }
      }

      const entries: { readonly original: string; readonly logical: string }[] = []
      for (const original of [
        ...(input.file !== undefined ? [input.file] : []),
        ...(input.files ?? []),
      ]) {
        const logical = this._recordedSpelling(change, toLogicalFilePath(original, this._platform))
        if (entries.some((entry) => sameTrackedFile(entry.logical, logical, this._platform)))
          continue
        entries.push({ original, logical })
      }

      const normalizedInput: UpdateImplementationTrackingInput = {
        ...input,
        ...(normalizedSpecId !== undefined ? { specId: normalizedSpecId } : {}),
      }

      if (entries.length === 0) {
        throw new ImplementationFileNotFoundError('')
      }

      for (const entry of entries) {
        await this._validateMutation(change, normalizedInput, entry)
      }
      const files = entries.map((entry) => entry.logical)

      switch (normalizedInput.action) {
        case 'add':
          for (const file of files) this._applyAdd(change, normalizedInput, file)
          break
        case 'remove':
          for (const file of files) this._applyRemove(change, normalizedInput, file)
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

      return {
        implementationTracking: projectImplementationTracking(change),
        trackingStartedAt: change.implementationTrackingStartedAt,
      }
    })

    return {
      implementationTracking: result.implementationTracking,
      trackingStartedAt: result.trackingStartedAt,
    }
  }

  /**
   * Validates one member of a mutation batch before any entity mutation occurs.
   *
   * @param change - Persisted change being mutated
   * @param input - Complete mutation input
   * @param target - Batch member to validate (`original` is quoted in errors, `logical` is used for lookups)
   * @param target.original - File value exactly as supplied by the caller
   * @param target.logical - File value normalized for the host platform
   */
  private async _validateMutation(
    change: Change,
    input: UpdateImplementationTrackingInput,
    target: { readonly original: string; readonly logical: string },
  ): Promise<void> {
    if (input.action === 'remove') return
    if (input.action === 'add' && input.specId !== undefined) {
      if (!change.specIds.includes(input.specId)) {
        const { workspace, capPath } = parseSpecId(input.specId, {
          workspaces: this._specRepositories.keys(),
        })
        const repo = this._specRepositories.get(workspace)!
        const spec = await repo.get(SpecPath.parse(capPath))
        if (spec === null) {
          throw new SpecNotFoundError(input.specId)
        }
      }
    }

    const entry = this._trackedEntry(change, target.logical)
    if (input.action === 'resolve' || input.action === 'unresolve') {
      if (entry === undefined || entry.state === 'removed') {
        throw new ImplementationFileNotFoundError(target.original)
      }
    }

    if (input.action === 'ignore' && entry !== undefined) return
    this._requireExists(target.original, await this._fileExists(target.logical))
  }

  /**
   * Asserts on-disk existence for a target file.
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
   * Checks on-disk existence for one raw project-relative file path.
   *
   * @param file - Raw project-relative file path
   * @returns Whether the file exists on disk
   */
  private async _fileExists(file: string): Promise<boolean> {
    const absolutePath = path.resolve(this._projectRoot, file)
    return (await this._files.read(absolutePath)) !== null
  }

  /**
   * Returns the spelling already recorded on the change for a file, or the given name.
   *
   * Case-only differences denote the same file on Windows and macOS (see
   * `_global/cross-platform`), so a name is mapped to the tracked or linked spelling that matches
   * it under the host platform's rules. The recorded spelling is never changed.
   *
   * @param change - The persisted change
   * @param logical - Logical (forward-slash) file name as supplied
   * @returns The already-recorded spelling when one matches, otherwise `logical`
   */
  private _recordedSpelling(change: Change, logical: string): string {
    const recorded = [
      ...change.trackedImplementationFiles.map((entry) => entry.file),
      ...change.implementationLinks.map((link) => link.file),
    ]
    return recorded.find((file) => sameTrackedFile(file, logical, this._platform)) ?? logical
  }

  /**
   * Finds the existing tracked entry for a file on a change.
   *
   * @param change - The persisted change
   * @param file - Raw project-relative file path
   * @returns The tracked entry, or `undefined` if untracked
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
   * @param file - Raw project-relative file path to link
   */
  private _applyAdd(change: Change, input: UpdateImplementationTrackingInput, file: string): void {
    const specId = input.specId!

    const hasSymbols = input.symbols !== undefined && input.symbols.length > 0
    change.addImplementationLink({
      specId,
      file,
      fileLinkExplicit: !hasSymbols,
      ...(hasSymbols ? { symbols: input.symbols } : {}),
    })

    if (!change.trackedImplementationFiles.some((entry) => entry.file === file)) {
      change.trackImplementationFile(file, 'open')
    }
  }

  /**
   * Applies a `remove` mutation.
   *
   * @param change - The persisted change under mutation
   * @param input - Mutation parameters
   * @param file - Raw project-relative file path to unlink
   */
  private _applyRemove(
    change: Change,
    input: UpdateImplementationTrackingInput,
    file: string,
  ): void {
    const specId = input.specId!
    if (input.symbols !== undefined && input.symbols.length > 0) {
      for (const symbol of input.symbols) {
        change.removeImplementationSymbol(specId, file, symbol)
      }
      return
    }

    change.removeImplementationLink(specId, file)
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
