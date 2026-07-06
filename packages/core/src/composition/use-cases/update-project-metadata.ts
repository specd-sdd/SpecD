import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type FileReader } from '../../application/ports/file-reader.js'
import { type FileWriter } from '../../application/ports/file-writer.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { UpdateProjectMetadata } from '../../application/use-cases/update-project-metadata.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createUpdateProjectMetadata}.
 */
export interface UpdateProjectMetadataDeps {
  readonly config: SpecdConfig
  readonly listWorkspaces: ListWorkspaces
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
  readonly fileReader: FileReader
  readonly fileWriter: FileWriter
  readonly contentHasher: ContentHasher
}

/**
 * Constructs `UpdateProjectMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdateProjectMetadata(deps: UpdateProjectMetadataDeps): UpdateProjectMetadata
/**
 * Constructs `UpdateProjectMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateProjectMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateProjectMetadata
/**
 * Constructs `UpdateProjectMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateProjectMetadata(
  depsOrConfig: UpdateProjectMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateProjectMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdateProjectMetadata',
    depsOrConfig,
    options,
    isUpdateProjectMetadataDeps,
  )
  return createUpdateProjectMetadataFromNormalized(normalized)
}

/**
 * Applies normalized `UpdateProjectMetadata` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdateProjectMetadataFromNormalized(
  input: FactoryInput<UpdateProjectMetadataDeps, CompositionResolutionOptions>,
): UpdateProjectMetadata {
  if (input.kind === 'deps') {
    const { config, listWorkspaces, specRepositories, fileReader, fileWriter, contentHasher } =
      input.deps
    return new UpdateProjectMetadata(
      config,
      listWorkspaces,
      specRepositories,
      fileReader,
      fileWriter,
      contentHasher,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return new UpdateProjectMetadata(
    resolver.config,
    resolver.getListWorkspaces(),
    resolver.getSpecRepositories(),
    resolver.getFileReader(),
    resolver.getFileWriter(),
    resolver.getContentHasher(),
  )
}

/**
 * Type guard for explicit `UpdateProjectMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdateProjectMetadataDeps(
  value: UpdateProjectMetadataDeps | SpecdConfig,
): value is UpdateProjectMetadataDeps {
  return (
    'config' in value &&
    'listWorkspaces' in value &&
    'specRepositories' in value &&
    'fileReader' in value &&
    'fileWriter' in value &&
    'contentHasher' in value
  )
}
