import { ValidateChangeBatch } from '../../application/use-cases/validate-change-batch.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { getDefaultWorkspace } from '../get-default-workspace.js'
import { createChangeRepository } from '../change-repository.js'
import { createResolveSchemaForConfig } from '../schema-resolution.js'
import { LazySchemaProvider } from '../lazy-schema-provider.js'
import { createValidateArtifacts } from './validate-artifacts.js'

/**
 * Constructs a `ValidateChangeBatch` use case with full project config.
 *
 * @param config - The fully-resolved project configuration
 * @param kernelOpts - Optional kernel overrides for schema resolution
 * @param kernelOpts.extraNodeModulesPaths - Additional node_modules paths for schema resolution
 * @returns The pre-wired use case instance
 */
export function createValidateChangeBatch(
  config: SpecdConfig,
  kernelOpts?: { extraNodeModulesPaths?: readonly string[] },
): ValidateChangeBatch {
  const ws = getDefaultWorkspace(config)
  const changeRepo = createChangeRepository(
    'fs',
    {
      workspace: ws.name,
      ownership: ws.ownership,
      isExternal: ws.isExternal,
      configPath: config.configPath,
    },
    {
      changesPath: config.storage.changesPath,
      draftsPath: config.storage.draftsPath,
      discardedPath: config.storage.discardedPath,
    },
  )
  const schemaProvider = new LazySchemaProvider(createResolveSchemaForConfig(config, kernelOpts))
  const validateArtifacts = createValidateArtifacts(config, kernelOpts)
  return new ValidateChangeBatch(changeRepo, schemaProvider, validateArtifacts)
}
