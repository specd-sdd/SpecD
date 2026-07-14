import { UpdateSpecMetadata } from '../../application/use-cases/update-spec-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import {
  createGenerateSpecMetadata,
  type GenerateSpecMetadataDeps,
} from './generate-spec-metadata.js'
import { createSaveSpecMetadata, type SaveSpecMetadataDeps } from './save-spec-metadata.js'

/**
 * Explicit dependencies for {@link createUpdateSpecMetadata}.
 */
export interface UpdateSpecMetadataDeps {
  readonly generateMetadata: GenerateSpecMetadataDeps
  readonly saveMetadata: SaveSpecMetadataDeps
}

/**
 * Constructs `UpdateSpecMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecMetadata(deps: UpdateSpecMetadataDeps): UpdateSpecMetadata
/**
 * Constructs `UpdateSpecMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateSpecMetadata
/**
 * Constructs `UpdateSpecMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateSpecMetadata(
  depsOrConfig: UpdateSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdateSpecMetadata',
    depsOrConfig,
    options,
    isUpdateSpecMetadataDeps,
  )
  return createUpdateSpecMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `UpdateSpecMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdateSpecMetadataFromNormalized(
  input: FactoryInput<UpdateSpecMetadataDeps, CompositionResolutionOptions>,
): UpdateSpecMetadata {
  if (input.kind === 'deps') {
    return new UpdateSpecMetadata(
      createGenerateSpecMetadata(input.deps.generateMetadata),
      createSaveSpecMetadata(input.deps.saveMetadata),
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return new UpdateSpecMetadata(
    createGenerateSpecMetadata(resolveGenerateSpecMetadataDeps(resolver)),
    createSaveSpecMetadata(resolveSaveSpecMetadataDeps(resolver)),
  )
}

/**
 * Type guard for explicit `UpdateSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdateSpecMetadataDeps(
  value: UpdateSpecMetadataDeps | SpecdConfig,
): value is UpdateSpecMetadataDeps {
  return 'generateMetadata' in value && 'saveMetadata' in value
}

import { resolveGenerateSpecMetadataDeps } from './generate-spec-metadata.js'
import { resolveSaveSpecMetadataDeps } from './save-spec-metadata.js'
