import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ImplementationDetector } from '../ports/implementation-detector.js'
import { type FileReader } from '../ports/file-reader.js'
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
 * Runs targeted VCS-backed implementation autodetection, merges new paths,
 * sweeps for deleted files, and performs automatic link cleanup for a change.
 *
 * The refresh algorithm has four phases executed inside one serialized
 * mutation:
 *
 * **Phase A — collect exclusions**: internal specd storage roots are converted
 * into portable project-relative prefixes so the detector can filter them.
 *
 * **Phase B — detect candidates**: VCS-backed detection runs with exclusion
 * prefixes and new/revived files are merged as `open`.
 *
 * **Phase C — existence sweep**: every non-ignored tracked file is probed
 * for on-disk existence via {@link FileReader}.
 *
 * **Phase D — transition and cleanup**: missing files become `removed` with
 * their links cleared; re-appeared `removed` files are resurrected to `open`.
 */
export class RefreshImplementationTracking {
  private readonly _changes: ChangeRepository
  private readonly _archives: ArchiveRepository
  private readonly _implementationDetector: ImplementationDetector
  private readonly _files: FileReader
  private readonly _projectRoot: string

  /**
   * Creates a new `RefreshImplementationTracking` use case instance.
   *
   * @param changes - Repository for loading and persisting the change
   * @param archives - Repository exposing archive internal paths for exclusion
   * @param implementationDetector - Detector for targeted candidate discovery
   * @param files - File reader for existence checks during the sweep phase
   * @param projectRoot - Absolute path to the project root directory
   */
  constructor(
    changes: ChangeRepository,
    archives: ArchiveRepository,
    implementationDetector: ImplementationDetector,
    files: FileReader,
    projectRoot: string,
  ) {
    this._changes = changes
    this._archives = archives
    this._implementationDetector = implementationDetector
    this._files = files
    this._projectRoot = projectRoot
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
    const implementationTracking = await this._changes.mutate(input.name, async (freshChange) => {
      if (freshChange.getHistoricalImplementationAt() !== null) {
        const excludePaths = this._collectExclusions()
        const detected = await this._implementationDetector.detectModifiedFiles(freshChange, {
          excludePaths,
        })
        this._mergeCandidates(freshChange, detected)
        await this._existenceSweep(freshChange)
      }
      return projectImplementationTracking(freshChange)
    })

    if (implementationTracking === null) {
      throw new ChangeNotFoundError(input.name)
    }

    return { implementationTracking }
  }

  /**
   * Collects and normalizes exclusion prefixes from internal repository paths.
   *
   * @returns De-duplicated, sorted portable project-relative exclusion prefixes
   */
  private _collectExclusions(): readonly string[] {
    const allAbsolute = [
      ...(this._changes.internalPaths() ?? []),
      ...(this._archives.internalPaths() ?? []),
    ]
    const portable = new Set<string>()
    for (const abs of allAbsolute) {
      const rel = this._toPortableProjectRelativePath(abs)
      if (rel !== null) portable.add(rel)
    }
    return [...portable].sort()
  }

  /**
   * Merges detected candidates into the change's tracked files.
   *
   * @param change - The change under mutation
   * @param detected - Project-relative file paths from the detector
   */
  private _mergeCandidates(change: Change, detected: readonly string[]): void {
    const tracked = new Map<string, string>()
    for (const entry of change.trackedImplementationFiles) {
      tracked.set(entry.file, entry.state)
    }
    for (const file of detected) {
      const currentState = tracked.get(file)
      if (currentState === undefined) {
        change.trackImplementationFile(file, 'open')
      } else if (currentState === 'removed') {
        change.trackImplementationFile(file, 'open')
      }
    }
  }

  /**
   * Probes every non-ignored tracked file for on-disk existence.
   *
   * @param change - The change under mutation
   */
  private async _existenceSweep(change: Change): Promise<void> {
    const tracked = change.trackedImplementationFiles
    for (const entry of tracked) {
      if (entry.state === 'ignored') continue
      const absolutePath = this._absoluteImplementationPath(entry.file)
      const exists = (await this._files.read(absolutePath)) !== null
      if (!exists && entry.state !== 'removed') {
        change.trackImplementationFile(entry.file, 'removed')
        this._removeImplementationLinksForFile(change, entry.file)
      } else if (exists && entry.state === 'removed') {
        change.trackImplementationFile(entry.file, 'open')
      }
    }
  }

  /**
   * Removes all implementation links referencing the given file.
   *
   * @param change - The change under mutation
   * @param file - Raw project-relative file path whose links should be cleared
   */
  private _removeImplementationLinksForFile(change: Change, file: string): void {
    const links = change.implementationLinks.filter((link) => link.file === file)
    for (const link of links) {
      change.removeImplementationLink(link.specId, file)
    }
  }

  /**
   * Converts an absolute filesystem path into a portable project-relative path.
   *
   * @param absolutePath - Absolute filesystem path to convert
   * @returns Portable project-relative path, or `null` when outside `projectRoot`
   */
  private _toPortableProjectRelativePath(absolutePath: string): string | null {
    const normalizedProject = this._projectRoot.replace(/\\/g, '/')
    const normalizedAbs = absolutePath.replace(/\\/g, '/')
    if (!normalizedAbs.startsWith(normalizedProject)) return null
    let rel = normalizedAbs.slice(normalizedProject.length)
    if (rel.startsWith('/')) rel = rel.slice(1)
    return rel.length > 0 ? rel : null
  }

  /**
   * Resolves a project-relative tracked file path to an absolute filesystem path.
   *
   * @param file - Raw project-relative file path
   * @returns Absolute filesystem path under the project root
   */
  private _absoluteImplementationPath(file: string): string {
    return path.resolve(this._projectRoot, file)
  }
}
