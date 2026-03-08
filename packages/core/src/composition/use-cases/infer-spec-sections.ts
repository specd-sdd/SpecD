import * as path from 'node:path'
import { InferSpecSections } from '../../application/use-cases/infer-spec-sections.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createArtifactParserRegistry } from '../artifact-parser-registry.js'
import { createSchemaRegistry } from '../schema-registry.js'

/**
 * Constructs an `InferSpecSections` use case wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel options (e.g. extra node_modules paths)
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createInferSpecSections(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): InferSpecSections {
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: [
      path.join(config.projectRoot, 'node_modules'),
      ...(kernelOpts?.extraNodeModulesPaths ?? []),
    ],
  })
  const parsers = createArtifactParserRegistry()
  return new InferSpecSections(schemas, parsers)
}
