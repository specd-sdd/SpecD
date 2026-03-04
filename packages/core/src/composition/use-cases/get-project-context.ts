import * as path from 'node:path'
import { GetProjectContext } from '../../application/use-cases/get-project-context.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createSpecRepository } from '../spec-repository.js'
import { createArtifactParserRegistry } from '../artifact-parser-registry.js'
import { createSchemaRegistry } from '../schema-registry.js'
import { FsFileReader } from '../../infrastructure/fs/file-reader.js'

/**
 * Constructs a `GetProjectContext` use case wired to all configured workspaces.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel options (e.g. extra node_modules paths)
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGetProjectContext(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GetProjectContext {
  const specRepos = new Map(
    config.workspaces.map((ws) => [
      ws.name,
      createSpecRepository(
        'fs',
        { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
        { specsPath: ws.specsPath, ...(ws.prefix !== undefined ? { prefix: ws.prefix } : {}) },
      ),
    ]),
  )
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: [
      path.join(config.projectRoot, 'node_modules'),
      ...(kernelOpts?.extraNodeModulesPaths ?? []),
    ],
  })
  const files = new FsFileReader()
  const parsers = createArtifactParserRegistry()
  return new GetProjectContext(specRepos, schemas, files, parsers)
}
