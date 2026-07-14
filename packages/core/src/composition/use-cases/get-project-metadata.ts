import { type FileReader } from '../../application/ports/file-reader.js'
import { GetProjectMetadata } from '../../application/use-cases/get-project-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetProjectMetadata}.
 */
export interface GetProjectMetadataDeps {
  readonly config: SpecdConfig
  readonly fileReader: FileReader
}

/**
 * Constructs `GetProjectMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetProjectMetadata(deps: GetProjectMetadataDeps): GetProjectMetadata
/**
 * Constructs `GetProjectMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectMetadata
/**
 * Constructs `GetProjectMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectMetadata(
  depsOrConfig: GetProjectMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetProjectMetadata',
    depsOrConfig,
    options,
    isGetProjectMetadataDeps,
  )
  return createGetProjectMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `GetProjectMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetProjectMetadataFromNormalized(
  input: FactoryInput<GetProjectMetadataDeps, CompositionResolutionOptions>,
): GetProjectMetadata {
  if (input.kind === 'deps') {
    return new GetProjectMetadata(input.deps.config, input.deps.fileReader)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return new GetProjectMetadata(resolver.config, resolver.getFileReader())
}

/**
 * Type guard for explicit `GetProjectMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetProjectMetadataDeps(
  value: GetProjectMetadataDeps | SpecdConfig,
): value is GetProjectMetadataDeps {
  return 'config' in value && 'fileReader' in value
}
