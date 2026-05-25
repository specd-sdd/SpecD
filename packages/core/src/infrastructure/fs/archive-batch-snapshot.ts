import fs from 'node:fs/promises'
import path from 'node:path'
import { Logger } from '../../application/logger.js'
import {
  type ArchiveBatchManifest,
  type ArchiveBatchRestoreResult,
  type ArchiveBatchSnapshotPort,
} from '../../application/ports/archive-batch-snapshot.js'
import { ArchiveOrphanBackupError } from '../../domain/errors/archive-orphan-backup-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'

/** Directory name for ephemeral canonical backups during archive commit. */
export const ARCHIVE_BACKUP_DIR = '.specd-archive-backup'

const MANIFEST_FILENAME = 'manifest.json'

/** Workspace filesystem layout used to resolve canonical spec directories. */
export interface ArchiveBatchSnapshotWorkspaceLayout {
  readonly specsPath: string
  readonly prefix?: string
}

/**
 * Filesystem implementation of {@link ArchiveBatchSnapshotPort}.
 *
 * Writes per-spec backups under `<specDir>/.specd-archive-backup/` before
 * canonical publication and restores them on commit failure.
 */
export class FsArchiveBatchSnapshot implements ArchiveBatchSnapshotPort {
  private readonly _layouts: ReadonlyMap<string, ArchiveBatchSnapshotWorkspaceLayout>
  private readonly _manifests = new Map<string, ArchiveBatchManifest>()

  /**
   * Creates a filesystem batch snapshot adapter.
   *
   * @param layouts - Spec root paths keyed by workspace name
   */
  constructor(layouts: ReadonlyMap<string, ArchiveBatchSnapshotWorkspaceLayout>) {
    this._layouts = layouts
  }

  /** @inheritdoc */
  async detectOrphans(specIds: readonly string[], changeName: string): Promise<void> {
    for (const specId of specIds) {
      const backupDir = this._backupDir(specId)
      if (backupDir === null) continue
      const manifestPath = path.join(backupDir, MANIFEST_FILENAME)
      let raw: string
      try {
        raw = await fs.readFile(manifestPath, 'utf8')
      } catch {
        continue
      }

      let manifest: ArchiveBatchManifest
      try {
        manifest = JSON.parse(raw) as ArchiveBatchManifest
      } catch {
        throw new ArchiveOrphanBackupError(
          specId,
          changeName,
          true,
          `Cannot archive — corrupt orphan backup at ${specId}. Remove ${ARCHIVE_BACKUP_DIR} manually and retry.`,
        )
      }

      Logger.debug('ArchiveBatchSnapshot orphan check', {
        change: changeName,
        specId,
        outcome: manifest.changeName === changeName ? 'matching-auto-restore' : 'foreign-abort',
        manifestChangeName: manifest.changeName,
      })

      if (manifest.changeName === changeName) {
        await this._restoreSpec(specId, manifest)
        await this._removeBackupDir(backupDir)
        throw new ArchiveOrphanBackupError(
          specId,
          manifest.changeName,
          false,
          `Recovered orphan backup for change "${changeName}" at ${specId}. Review canonical files and retry archive.`,
        )
      }

      throw new ArchiveOrphanBackupError(
        specId,
        manifest.changeName,
        true,
        `Cannot archive — foreign orphan backup for change "${manifest.changeName}" at ${specId}. Remove ${ARCHIVE_BACKUP_DIR} or restore manually before retrying.`,
      )
    }
  }

  /** @inheritdoc */
  async snapshot(specId: string, changeName: string): Promise<ArchiveBatchManifest> {
    const specDir = this._specDir(specId)
    if (specDir === null) {
      throw new Error(`Cannot snapshot unknown spec workspace for ${specId}`)
    }

    Logger.debug('ArchiveBatchSnapshot snapshot started', {
      change: changeName,
      specId,
    })

    const specDirExisted = await this._pathExists(specDir)
    const backupDir = path.join(specDir, ARCHIVE_BACKUP_DIR)
    await fs.mkdir(backupDir, { recursive: true })

    const existingFiles: string[] = []
    if (specDirExisted) {
      const entries = await fs.readdir(specDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (entry.name === MANIFEST_FILENAME) continue
        existingFiles.push(entry.name)
        await fs.copyFile(path.join(specDir, entry.name), path.join(backupDir, entry.name))
      }
    }

    const manifest: ArchiveBatchManifest = {
      changeName,
      specDirExisted,
      existingFiles,
      createdFiles: [],
    }
    await fs.writeFile(
      path.join(backupDir, MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )
    this._manifests.set(specId, manifest)

    Logger.debug('ArchiveBatchSnapshot snapshot completed', {
      change: changeName,
      specId,
      specDirExisted,
      existingFileCount: existingFiles.length,
    })

    return manifest
  }

  /** @inheritdoc */
  async recordCreatedFile(specId: string, relativePath: string): Promise<void> {
    const manifest = this._manifests.get(specId)
    if (manifest === undefined) return
    if (manifest.existingFiles.includes(relativePath)) return
    if (manifest.createdFiles.includes(relativePath)) return

    const updated: ArchiveBatchManifest = {
      ...manifest,
      createdFiles: [...manifest.createdFiles, relativePath],
    }
    this._manifests.set(specId, updated)

    const backupDir = this._backupDir(specId)
    if (backupDir !== null) {
      await fs.writeFile(
        path.join(backupDir, MANIFEST_FILENAME),
        `${JSON.stringify(updated, null, 2)}\n`,
        'utf8',
      )
    }

    Logger.debug('ArchiveBatchSnapshot recorded created file', {
      specId,
      relativePath,
    })
  }

  /** @inheritdoc */
  async restoreBatch(
    specIds: readonly string[],
    publishOrder: readonly string[],
  ): Promise<ArchiveBatchRestoreResult> {
    const order = [...publishOrder].reverse()
    Logger.debug('ArchiveBatchSnapshot restore started', {
      specIds: order,
      publishOrder,
    })

    const restoredSpecIds: string[] = []
    const failedSpecIds: string[] = []

    for (const specId of order) {
      try {
        const manifest = await this._loadManifest(specId)
        if (manifest !== null) {
          await this._restoreSpec(specId, manifest)
          const backupDir = this._backupDir(specId)
          if (backupDir !== null) {
            await this._removeBackupDir(backupDir)
          }
        }
        restoredSpecIds.push(specId)
      } catch (error) {
        failedSpecIds.push(specId)
        Logger.debug('ArchiveBatchSnapshot restore failed for spec', {
          specId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    Logger.debug('ArchiveBatchSnapshot restore completed', {
      restoredSpecIds,
      failedSpecIds,
    })

    return { restoredSpecIds, failedSpecIds }
  }

  /** @inheritdoc */
  async cleanup(specIds: readonly string[]): Promise<void> {
    for (const specId of specIds) {
      const backupDir = this._backupDir(specId)
      if (backupDir === null) continue
      try {
        await this._removeBackupDir(backupDir)
      } catch {
        // Best-effort cleanup after successful archive move.
      }
    }
    for (const specId of specIds) {
      this._manifests.delete(specId)
    }
    Logger.debug('ArchiveBatchSnapshot cleanup completed', { specIds })
  }

  /**
   * Restores one spec directory from its batch backup manifest.
   *
   * @param specId - Spec being restored
   * @param manifest - Snapshot manifest for the spec
   */
  private async _restoreSpec(specId: string, manifest: ArchiveBatchManifest): Promise<void> {
    const specDir = this._specDir(specId)
    if (specDir === null) return
    const backupDir = path.join(specDir, ARCHIVE_BACKUP_DIR)

    if (!manifest.specDirExisted) {
      await fs.rm(specDir, { recursive: true, force: true })
      return
    }

    for (const relativePath of manifest.existingFiles) {
      const source = path.join(backupDir, relativePath)
      const target = path.join(specDir, relativePath)
      await fs.copyFile(source, target)
    }

    for (const relativePath of manifest.createdFiles) {
      if (manifest.existingFiles.includes(relativePath)) continue
      const target = path.join(specDir, relativePath)
      await fs.rm(target, { force: true })
    }
  }

  /**
   * Loads the in-memory or on-disk manifest for one spec.
   *
   * @param specId - Spec whose manifest should be loaded
   * @returns Parsed manifest, or `null` when no backup exists
   */
  private async _loadManifest(specId: string): Promise<ArchiveBatchManifest | null> {
    const inMemory = this._manifests.get(specId)
    if (inMemory !== undefined) return inMemory

    const backupDir = this._backupDir(specId)
    if (backupDir === null) return null
    try {
      const raw = await fs.readFile(path.join(backupDir, MANIFEST_FILENAME), 'utf8')
      return JSON.parse(raw) as ArchiveBatchManifest
    } catch {
      return null
    }
  }

  /**
   * Returns the backup directory path for one spec, if resolvable.
   *
   * @param specId - Spec whose backup directory is requested
   * @returns Absolute backup path, or `null` when the workspace is unknown
   */
  private _backupDir(specId: string): string | null {
    const specDir = this._specDir(specId)
    if (specDir === null) return null
    return path.join(specDir, ARCHIVE_BACKUP_DIR)
  }

  /**
   * Resolves the canonical spec directory for one spec ID.
   *
   * @param specId - Fully qualified spec ID
   * @returns Absolute spec directory path, or `null` when the workspace is unknown
   */
  private _specDir(specId: string): string | null {
    const { workspace, capPath } = parseSpecId(specId)
    const layout = this._layouts.get(workspace)
    if (layout === undefined) return null

    const name = SpecPath.parse(capPath)
    const prefixSegments =
      layout.prefix !== undefined
        ? layout.prefix.split('/').filter((segment) => segment.length > 0)
        : []

    if (prefixSegments.length > 0) {
      const nameSegments = name.toString().split('/')
      const namePrefix = nameSegments.slice(0, prefixSegments.length)
      if (namePrefix.join('/') !== prefixSegments.join('/')) {
        return path.join(layout.specsPath, name.toFsPath(path.sep))
      }
      const stripped = nameSegments.slice(prefixSegments.length)
      return path.join(layout.specsPath, ...stripped)
    }

    return path.join(layout.specsPath, name.toFsPath(path.sep))
  }

  /**
   * Returns whether a filesystem path currently exists.
   *
   * @param targetPath - Absolute path to probe
   * @returns `true` when the path exists
   */
  private async _pathExists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Deletes one backup directory tree.
   *
   * @param backupDir - Absolute backup directory path
   */
  private async _removeBackupDir(backupDir: string): Promise<void> {
    await fs.rm(backupDir, { recursive: true, force: true })
  }
}
