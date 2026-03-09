import * as path from 'node:path'
import { InferSpecSections } from '../../application/use-cases/infer-spec-sections.js'
import { type SpecdConfig, isSpecdConfig } from '../../application/specd-config.js'
import { createArtifactParserRegistry } from '../../infrastructure/artifact-parser/registry.js'
import { createSchemaRegistry } from '../schema-registry.js'

/** Filesystem adapter options for `createInferSpecSections(options)`. */
export interface FsInferSpecSectionsOptions {
  /** Absolute path to the `node_modules` directory for schema resolution. */
  readonly nodeModulesPaths: readonly string[]
  /** Project root directory for resolving relative schema paths. */
  readonly configDir: string
}

/**
 * Constructs an `InferSpecSections` use case wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional kernel options (e.g. extra node_modules paths)
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createInferSpecSections(
  config: SpecdConfig,
  options?: { extraNodeModulesPaths?: readonly string[] },
): InferSpecSections
/**
 * Constructs an `InferSpecSections` use case with explicit adapter options.
 *
 * @param options - Schema resolution paths
 * @returns The pre-wired use case instance
 */
export function createInferSpecSections(options: FsInferSpecSectionsOptions): InferSpecSections
/**
 * Constructs an `InferSpecSections` instance wired with filesystem adapters.
 *
 * @param configOrOptions - A fully-resolved `SpecdConfig` or explicit adapter options
 * @param options - Optional kernel options; only used with the `SpecdConfig` form
 * @param options.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createInferSpecSections(
  configOrOptions: SpecdConfig | FsInferSpecSectionsOptions,
  options?: { extraNodeModulesPaths?: readonly string[] },
): InferSpecSections {
  if (isSpecdConfig(configOrOptions)) {
    const config = configOrOptions
    return createInferSpecSections({
      nodeModulesPaths: [
        path.join(config.projectRoot, 'node_modules'),
        ...(options?.extraNodeModulesPaths ?? []),
      ],
      configDir: config.projectRoot,
    })
  }
  const schemas = createSchemaRegistry('fs', {
    nodeModulesPaths: configOrOptions.nodeModulesPaths,
    configDir: configOrOptions.configDir,
  })
  const parsers = createArtifactParserRegistry()
  return new InferSpecSections(schemas, parsers)
}
