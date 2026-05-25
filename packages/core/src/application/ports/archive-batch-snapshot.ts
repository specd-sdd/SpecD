/** Manifest stored at `<specDir>/.specd-archive-backup/manifest.json`. */
export interface ArchiveBatchManifest {
  readonly changeName: string
  readonly specDirExisted: boolean
  readonly existingFiles: readonly string[]
  readonly createdFiles: readonly string[]
}

/** Result of restoring canonical files after a failed archive commit. */
export interface ArchiveBatchRestoreResult {
  readonly restoredSpecIds: readonly string[]
  readonly failedSpecIds: readonly string[]
}

/** Port for batch canonical snapshot and restore during archive commit. */
export interface ArchiveBatchSnapshotPort {
  detectOrphans(specIds: readonly string[], changeName: string): Promise<void>
  snapshot(specId: string, changeName: string): Promise<ArchiveBatchManifest>
  recordCreatedFile(specId: string, relativePath: string): Promise<void>
  restoreBatch(
    specIds: readonly string[],
    publishOrder: readonly string[],
  ): Promise<ArchiveBatchRestoreResult>
  cleanup(specIds: readonly string[]): Promise<void>
}
