import { type FileReader } from '../application/ports/file-reader.js'
import { FsFileReader } from '../infrastructure/fs/file-reader.js'

/**
 * Discriminated union of all supported `FileReader` adapter configurations.
 */
export type CreateFileReaderConfig = {
  /** Adapter type discriminant. */
  readonly type: 'fs'
}

/**
 * Constructs a `FileReader` implementation for the given adapter type.
 *
 * Returns the abstract `FileReader` port type — callers never see the
 * concrete class.
 *
 * @param config - Discriminated union config identifying the adapter type
 * @returns A fully constructed `FileReader`
 */
export function createFileReader(config: CreateFileReaderConfig): FileReader {
  switch (config.type) {
    case 'fs':
      return new FsFileReader()
  }
}
