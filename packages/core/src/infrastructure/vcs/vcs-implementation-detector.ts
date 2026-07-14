import * as path from 'node:path'
import { type Change } from '../../domain/entities/change.js'
import {
  type ImplementationDetector,
  type ImplementationDetectorOptions,
} from '../../application/ports/implementation-detector.js'
import { type VcsAdapter } from '../../application/ports/vcs-adapter.js'
import { Logger } from '../../application/logger.js'

/**
 * VCS-backed implementation of {@link ImplementationDetector}.
 *
 * Resolves the detection baseline from the change's first historical entry
 * into `implementing`, translates that timestamp into a VCS revision, and
 * returns raw project-relative file paths for modified files.
 */
export class VcsImplementationDetector implements ImplementationDetector {
  private readonly _projectRoot: string
  private readonly _resolveVcs: () => Promise<VcsAdapter>

  /**
   * Creates a new `VcsImplementationDetector`.
   *
   * @param projectRoot - Absolute project root used for raw-path normalization
   * @param vcs - Backend-agnostic VCS adapter or async provider
   */
  constructor(projectRoot: string, vcs: VcsAdapter | (() => Promise<VcsAdapter>)) {
    this._projectRoot = projectRoot
    this._resolveVcs = typeof vcs === 'function' ? vcs : async () => Promise.resolve(vcs)
  }

  /**
   * Detects modified implementation files for one change.
   *
   * @param change - The change whose historical implementing timestamp defines the baseline
   * @param options - Optional detection parameters
   * @param options.excludePaths - Project-relative portable path prefixes to exclude
   * @returns Raw project-relative modified file paths
   */
  async detectModifiedFiles(
    change: Change,
    options?: ImplementationDetectorOptions,
  ): Promise<readonly string[]> {
    const historicalAt = change.getHistoricalImplementationAt()
    if (historicalAt === null) {
      Logger.debug('Skipping implementation detection without historical implementing state', {
        change: change.name,
      })
      return []
    }

    Logger.debug('Starting VCS-backed implementation detection', {
      change: change.name,
      historicalAt: historicalAt.toISOString(),
    })

    const vcs = await this._resolveVcs()
    const baseRef = await this._resolveBaseRef(vcs, historicalAt)
    if (baseRef === null) {
      Logger.debug('Skipping implementation detection because no baseline ref could be resolved', {
        change: change.name,
        historicalAt: historicalAt.toISOString(),
      })
      return []
    }

    const repoFiles = await vcs.modifiedFiles(baseRef)
    const projectFiles = this._normalizeToProjectRelativePaths(vcs, repoFiles)

    const excludePaths = options?.excludePaths
    const filtered =
      excludePaths !== undefined && excludePaths.length > 0
        ? projectFiles.filter((file) => !isExcludedByPrefix(file, excludePaths))
        : projectFiles

    Logger.debug('Completed VCS-backed implementation detection', {
      change: change.name,
      baseRef,
      detectedFiles: repoFiles.length,
      normalizedFiles: projectFiles.length,
      excludedFiles: projectFiles.length - filtered.length,
    })

    return filtered
  }

  /**
   * Resolves the baseline revision from a historical implementing timestamp.
   *
   * Falls back to the current revision when historical lookup is unavailable.
   *
   * @param vcs - Backend-agnostic VCS adapter
   * @param at - First time the change entered `implementing`
   * @returns Baseline revision identifier, or `null`
   */
  private async _resolveBaseRef(vcs: VcsAdapter, at: Date): Promise<string | null> {
    const historicalRef = await vcs.refAt(at.toISOString())
    if (historicalRef !== null) {
      return historicalRef
    }
    return vcs.ref()
  }

  /**
   * Converts repository-relative VCS paths into raw project-relative paths.
   *
   * Files outside the configured project root are ignored.
   *
   * @param vcs - Backend-agnostic VCS adapter
   * @param repoFiles - Repository-relative file paths from the VCS adapter
   * @returns Raw project-relative file paths
   */
  private _normalizeToProjectRelativePaths(
    vcs: VcsAdapter,
    repoFiles: readonly string[],
  ): readonly string[] {
    let repoRoot: string
    try {
      repoRoot = vcs.rootDir()
    } catch {
      return []
    }

    const normalized = new Set<string>()
    for (const repoFile of repoFiles) {
      const absoluteFile = path.resolve(repoRoot, repoFile)
      const relativeToProject = path.relative(this._projectRoot, absoluteFile)
      if (
        relativeToProject.length === 0 ||
        relativeToProject.startsWith(`..${path.sep}`) ||
        relativeToProject === '..'
      ) {
        continue
      }
      normalized.add(toPortablePath(relativeToProject))
    }
    return [...normalized]
  }
}

/**
 * Converts a filesystem-relative path into specd's portable slash form.
 *
 * @param filePath - Filesystem-relative path
 * @returns Slash-normalized path string
 */
function toPortablePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

/**
 * Tests whether a project-relative candidate path is excluded by any prefix.
 *
 * A candidate is excluded when it exactly matches a prefix or when it falls
 * under a prefix directory (`candidate.startsWith(prefix + '/')`).
 *
 * @param candidate - Portable project-relative candidate path
 * @param excludePaths - Portable project-relative exclusion prefixes
 * @returns `true` when the candidate should be filtered out
 */
function isExcludedByPrefix(candidate: string, excludePaths: readonly string[]): boolean {
  for (const prefix of excludePaths) {
    if (candidate === prefix || candidate.startsWith(`${prefix}/`)) return true
  }
  return false
}
