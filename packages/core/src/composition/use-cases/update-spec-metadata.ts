import { UpdateSpecMetadata } from '../../application/use-cases/update-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { createGenerateSpecMetadata } from './generate-spec-metadata.js'
import { createSaveSpecMetadata } from './save-spec-metadata.js'

/**
 * Constructs an `UpdateSpecMetadata` instance wired with filesystem adapters.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecMetadata(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): UpdateSpecMetadata {
  return new UpdateSpecMetadata(
    createGenerateSpecMetadata(config, kernelOpts),
    createSaveSpecMetadata(config),
  )
}
