import { GenerateSpecMetadata } from '../../application/use-cases/generate-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createListWorkspaces } from './list-workspaces.js'
import { createSchemaProviderForConfig } from '../schema-resolution.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { NodeContentHasher } from '../../infrastructure/node/content-hasher.js'
import { createBuiltinExtractorTransforms } from '../extractor-transforms/index.js'
import { createSpecWorkspaceRoutes } from '../spec-workspace-routes.js'

/**
 * Constructs a `GenerateSpecMetadata` instance wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createGenerateSpecMetadata(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): GenerateSpecMetadata {
  const listWorkspaces = createListWorkspaces(config)
  const schemaProvider = createSchemaProviderForConfig(config, kernelOpts)
  const parsers = createArtifactParserRegistry()
  const hasher = new NodeContentHasher()
  const workspaceRoutes = createSpecWorkspaceRoutes(config.workspaces)
  return new GenerateSpecMetadata(
    listWorkspaces,
    schemaProvider,
    parsers,
    hasher,
    createBuiltinExtractorTransforms(),
    workspaceRoutes,
  )
}
