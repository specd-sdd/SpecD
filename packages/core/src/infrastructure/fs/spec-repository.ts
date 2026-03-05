import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Spec } from '../../domain/entities/spec.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import { SpecArtifact } from '../../domain/value-objects/spec-artifact.js'
import { ArtifactConflictError } from '../../domain/errors/artifact-conflict-error.js'
import {
  SpecRepository,
  type SpecRepositoryConfig,
} from '../../application/ports/spec-repository.js'
import { isEnoent } from './is-enoent.js'
import { sha256 } from './hash.js'

/**
 * Configuration for `FsSpecRepository`.
 *
 * Extends the base `SpecRepositoryConfig` with the root path under which
 * spec directories are stored.
 */
export interface FsSpecRepositoryConfig extends SpecRepositoryConfig {
  /**
   * Absolute path to the specs root directory for this workspace.
   *
   * Each spec lives at `<specsPath>/<specName>/` where `<specName>` is the
   * slash-separated spec path (e.g. `auth/oauth`).
   */
  readonly specsPath: string
  /**
   * Optional logical path prefix for all specs in this workspace.
   *
   * When set, `list()` prepends prefix segments to discovered `SpecPath`
   * values, and `get()` / `artifact()` strip prefix segments before
   * computing the filesystem path.
   */
  readonly prefix?: string
}

/**
 * Filesystem implementation of `SpecRepository`.
 *
 * Each spec is a directory under `<specsPath>/<specName>/` containing one or
 * more artifact files (e.g. `spec.md`, `proposal.md`). The `Spec` entity
 * returned by `get` and `list` contains only metadata — artifact content is
 * loaded on demand via `artifact()`.
 *
 * Multiple `specsPath` roots across workspaces are handled by instantiating
 * a separate `FsSpecRepository` per workspace at the call site; the port
 * itself is per-workspace.
 */
export class FsSpecRepository extends SpecRepository {
  private readonly _specsPath: string
  private readonly _prefixSegments: readonly string[]

  /**
   * Creates a new `FsSpecRepository` instance.
   *
   * @param config - Specs root path, workspace configuration, and locality settings
   */
  constructor(config: FsSpecRepositoryConfig) {
    super(config)
    this._specsPath = config.specsPath
    this._prefixSegments =
      config.prefix !== undefined ? config.prefix.split('/').filter((s) => s.length > 0) : []
  }

  /**
   * Returns the spec at the given path, or `null` if no such directory exists.
   *
   * @param name - The spec identity path (e.g. `SpecPath.parse("auth/oauth")`)
   * @returns Spec metadata with artifact filenames, or `null` if not found
   */
  override async get(name: SpecPath): Promise<Spec | null> {
    const dir = this._specDir(name)

    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    const filenames = await filterFiles(dir, entries)
    return new Spec(this.workspace(), name, filenames)
  }

  /**
   * Lists all specs under `specsPath`, optionally filtered by a path prefix.
   *
   * Specs are discovered by recursively walking the specs root directory and
   * identifying leaf directories (directories that contain at least one file).
   * The result order follows the filesystem traversal order.
   *
   * @param prefix - Optional path prefix to filter results
   * @returns All matching specs with their artifact filenames
   */
  override async list(prefix?: SpecPath): Promise<Spec[]> {
    let basePath: string
    if (prefix !== undefined) {
      // Strip the logical prefix segments from the filter before computing the fs path
      if (this._prefixSegments.length > 0) {
        const filterSegments = prefix.toString().split('/')
        const stripped = filterSegments.slice(this._prefixSegments.length)
        basePath = stripped.length > 0 ? path.join(this._specsPath, ...stripped) : this._specsPath
      } else {
        basePath = path.join(this._specsPath, prefix.toFsPath(path.sep))
      }
    } else {
      basePath = this._specsPath
    }

    const specs: Spec[] = []
    await this._walk(basePath, this._specsPath, specs)
    return specs
  }

  /**
   * Loads the content of a single artifact file within a spec directory.
   *
   * @param spec - The spec containing the artifact
   * @param filename - The artifact filename to load (e.g. `"spec.md"`)
   * @returns The artifact with its content and `originalHash`, or `null` if the file does not exist
   */
  override async artifact(spec: Spec, filename: string): Promise<SpecArtifact | null> {
    const filePath = path.join(this._specDir(spec.name), filename)

    let content: string
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if (isEnoent(err)) return null
      throw err
    }

    return new SpecArtifact(filename, content, sha256(content))
  }

  /**
   * Writes a single artifact file into a spec directory.
   *
   * Creates the spec directory if it does not already exist. If
   * `artifact.originalHash` is set, the current file on disk is hashed and
   * compared before writing — a mismatch causes `ArtifactConflictError`
   * unless `options.force` is `true`.
   *
   * @param spec - The spec to write the artifact into
   * @param artifact - The artifact to save (filename + content)
   * @param options - Save options
   * @param options.force - When `true`, skip conflict detection and overwrite unconditionally
   * @throws {ArtifactConflictError} When a concurrent modification is detected and `force` is not set
   */
  override async save(
    spec: Spec,
    artifact: SpecArtifact,
    options?: { force?: boolean },
  ): Promise<void> {
    const dir = this._specDir(spec.name)
    await fs.mkdir(dir, { recursive: true })

    const filePath = path.join(dir, artifact.filename)

    if (artifact.originalHash !== undefined && options?.force !== true) {
      let currentContent: string
      try {
        currentContent = await fs.readFile(filePath, 'utf8')
      } catch (err) {
        if (isEnoent(err)) {
          currentContent = ''
        } else {
          throw err
        }
      }

      const currentHash = sha256(currentContent)
      if (currentHash !== artifact.originalHash) {
        throw new ArtifactConflictError(artifact.filename, artifact.content, currentContent)
      }
    }

    await fs.writeFile(filePath, artifact.content, 'utf8')
  }

  /**
   * Deletes the entire spec directory and all its artifact files.
   *
   * No-ops silently if the directory does not exist.
   *
   * @param spec - The spec to delete
   */
  override async delete(spec: Spec): Promise<void> {
    const dir = this._specDir(spec.name)
    try {
      await fs.rm(dir, { recursive: true })
    } catch (err) {
      if (isEnoent(err)) return
      throw err
    }
  }

  // ---- Private helpers ----

  /**
   * Returns the absolute path to the spec directory for the given spec name.
   *
   * When a prefix is configured, strips the prefix segments from the front
   * of the spec name before computing the filesystem path. For example,
   * with prefix `_global`, name `_global/architecture` → fs path `architecture/`.
   *
   * @param name - The spec identity path (possibly prefixed)
   * @returns Absolute path to the spec directory
   */
  private _specDir(name: SpecPath): string {
    if (this._prefixSegments.length > 0) {
      const nameSegments = name.toString().split('/')
      const stripped = nameSegments.slice(this._prefixSegments.length)
      return path.join(this._specsPath, ...stripped)
    }
    return path.join(this._specsPath, name.toFsPath(path.sep))
  }

  /**
   * Recursively walks a directory tree, collecting `Spec` entries for every
   * leaf directory that contains at least one file.
   *
   * A "leaf" directory is one whose direct children include at least one
   * regular file. Directories that contain only subdirectories are
   * intermediate path segments and are not returned as specs.
   *
   * @param dir - Absolute path to the current directory being walked
   * @param root - Absolute path to the specs root (used to derive the `SpecPath`)
   * @param results - Accumulator array to push discovered specs into
   */
  private async _walk(dir: string, root: string, results: Spec[]): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (err) {
      if (isEnoent(err)) return
      throw err
    }

    const files: string[] = []
    const subdirs: string[] = []

    const stats = await Promise.all(
      entries.map(async (entry) => {
        try {
          const stat = await fs.stat(path.join(dir, entry))
          return { entry, isDir: stat.isDirectory(), isFile: stat.isFile() }
        } catch {
          return { entry, isDir: false, isFile: false }
        }
      }),
    )
    for (const { entry, isDir, isFile } of stats) {
      if (isDir) subdirs.push(entry)
      else if (isFile) files.push(entry)
    }

    if (files.length > 0) {
      // This is a leaf spec directory — compute the SpecPath relative to root
      const rel = path.relative(root, dir)
      const segments = rel.split(path.sep).filter((s) => s.length > 0)
      if (segments.length > 0) {
        const prefixed = [...this._prefixSegments, ...segments]
        const specPath = SpecPath.fromSegments(prefixed)
        results.push(new Spec(this.workspace(), specPath, files))
      }
    }

    for (const subdir of subdirs) {
      await this._walk(path.join(dir, subdir), root, results)
    }
  }
}

/**
 * Filters a list of directory entry names to include only regular files.
 *
 * @param dir - Absolute path to the parent directory
 * @param entries - Entry names to filter
 * @returns Names of entries that are regular files
 */
async function filterFiles(dir: string, entries: string[]): Promise<string[]> {
  const checks = await Promise.all(
    entries.map(async (entry) => {
      try {
        const stat = await fs.stat(path.join(dir, entry))
        return { entry, isFile: stat.isFile() }
      } catch {
        return { entry, isFile: false }
      }
    }),
  )
  return checks.filter((c) => c.isFile).map((c) => c.entry)
}
