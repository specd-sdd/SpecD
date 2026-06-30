import { GetProjectMetadata } from '../../application/use-cases/get-project-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'

/**
 * Constructs a `GetProjectMetadata` instance wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createGetProjectMetadata(config: SpecdConfig): GetProjectMetadata {
  return new GetProjectMetadata(config, new FsFileReader())
}
