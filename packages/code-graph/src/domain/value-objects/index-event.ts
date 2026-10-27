/**
 * The file the indexer is about to process, emitted for every file that enters per-file
 * processing, including files that the analysis then skips (no language adapter, undecodable
 * content). Files skipped for size or excluded by discovery never enter processing and are not
 * announced by this event.
 */
export interface FileActivityEvent {
  /** Stable discriminator of the event. */
  readonly kind: 'file-activity'
  /**
   * Workspace-prefixed path of the file being processed.
   */
  readonly filePath: string
  /**
   * File size in bytes, or null when the size could not be read.
   */
  readonly sizeBytes: number | null
  /**
   * 1-based position among the files to process in this run.
   */
  readonly index: number
  /**
   * Total number of files to process in this run.
   */
  readonly total: number
}

/**
 * A file that was not indexed because it exceeds the effective size limit.
 */
export interface FileSkippedEvent {
  /** Stable discriminator of the event. */
  readonly kind: 'file-skipped'
  /** Workspace-prefixed path of the skipped file. */
  readonly filePath: string
  /** Path of the skipped file relative to the project root, with forward slashes. */
  readonly projectRelativePath: string
  /** Size of the file in bytes on disk. */
  readonly sizeBytes: number
  /** Effective limit in bytes that the file exceeds. */
  readonly limitBytes: number
  /** Stable reason code; also the coverage reason recorded for the file. */
  readonly reason: 'file-too-large'
}

/**
 * A parser-resource disposal function threw while an epoch was closed.
 */
export interface ResourceDisposalFailedEvent {
  /** Stable discriminator of the event. */
  readonly kind: 'resource-disposal-failed'
  /** Workspace-prefixed path of the file whose parser resource failed to dispose. */
  readonly filePath: string
  /** Message of the error thrown by the disposal function. */
  readonly message: string
}

/**
 * Presentation-neutral, JSON-serializable indexing event.
 */
export type IndexEvent = FileActivityEvent | FileSkippedEvent | ResourceDisposalFailedEvent

/**
 * Receives indexing events synchronously, in emission order.
 */
export type IndexEventReceiver = (event: IndexEvent) => void

/**
 * A file skipped for size, as listed in the index result.
 */
export interface SizeSkippedFile {
  /** Workspace-prefixed path of the skipped file. */
  readonly filePath: string
  /** Path of the skipped file relative to the project root, with forward slashes. */
  readonly projectRelativePath: string
  /** Size of the file in bytes on disk. */
  readonly sizeBytes: number
  /** Effective limit in bytes that the file exceeds. */
  readonly limitBytes: number
}

/**
 * A file that exceeds the effective limit but was analysed because it is exempt.
 */
export interface SizeExemptFile {
  /** Workspace-prefixed path of the exempt file. */
  readonly filePath: string
  /** Path of the exempt file relative to the project root, with forward slashes. */
  readonly projectRelativePath: string
  /** Size of the file in bytes on disk. */
  readonly sizeBytes: number
}
