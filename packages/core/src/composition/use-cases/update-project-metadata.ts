import * as path from 'node:path'
import { UpdateProjectMetadata } from '../../application/use-cases/update-project-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createListWorkspaces } from './list-workspaces.js'
import { createSpecRepository } from '../spec-repository.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'
import { FsFileWriter } from '../../infrastructure/fs/file-writer.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'

/**
 * Constructs an `UpdateProjectMetadata` instance wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @returns The pre-wired use case instance
 */
export function createUpdateProjectMetadata(config: SpecdConfig): UpdateProjectMetadata {
  const specRepos = new Map(
    config.workspaces.map((ws) => [
      ws.name,
      createSpecRepository(
        'fs',
        {
          workspace: ws.name,
          ownership: ws.ownership,
          isExternal: ws.isExternal,
          configPath: config.configPath,
        },
        {
          specsPath: ws.specsPath,
          metadataPath: path.join(ws.specsPath, '..', '.specd', 'metadata'),
          ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}),
        },
      ),
    ]),
  )
  return new UpdateProjectMetadata(
    config,
    createListWorkspaces(config),
    specRepos,
    new FsFileReader(),
    new FsFileWriter(),
    new NodeContentHasher(),
  )
}
