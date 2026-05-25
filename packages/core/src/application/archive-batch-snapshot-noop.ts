import {
  type ArchiveBatchManifest,
  type ArchiveBatchRestoreResult,
  type ArchiveBatchSnapshotPort,
} from './ports/archive-batch-snapshot.js'

/** No-op batch snapshot used when archive runs without filesystem canonical storage. */
export class NoopArchiveBatchSnapshot implements ArchiveBatchSnapshotPort {
  /** @inheritdoc */
  detectOrphans(): Promise<void> {
    return Promise.resolve()
  }

  /** @inheritdoc */
  snapshot(specId: string, changeName: string): Promise<ArchiveBatchManifest> {
    return Promise.resolve({
      changeName,
      specDirExisted: false,
      existingFiles: [],
      createdFiles: [],
    })
  }

  /** @inheritdoc */
  recordCreatedFile(): Promise<void> {
    return Promise.resolve()
  }

  /** @inheritdoc */
  restoreBatch(
    _specIds: readonly string[],
    publishOrder: readonly string[],
  ): Promise<ArchiveBatchRestoreResult> {
    return Promise.resolve({
      restoredSpecIds: [...publishOrder].reverse(),
      failedSpecIds: [],
    })
  }

  /** @inheritdoc */
  cleanup(): Promise<void> {
    return Promise.resolve()
  }
}

/**
 * Shared no-op adapter for tests and in-memory archive flows.
 *
 * @returns A batch snapshot port that performs no filesystem work
 */
export function createNoopArchiveBatchSnapshot(): ArchiveBatchSnapshotPort {
  return new NoopArchiveBatchSnapshot()
}
