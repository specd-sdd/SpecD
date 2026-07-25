import { RegenerateSpecMetadata } from '../../application/use-cases/regenerate-spec-metadata.js'
import { type MaterializeSpecMetadata } from '../../application/use-cases/materialize-spec-metadata.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs } from '../normalize-factory-args.js'
import {
  createMaterializeSpecMetadata,
  resolveMaterializeSpecMetadataDeps,
} from './materialize-spec-metadata.js'
import { createListWorkspaces, resolveListWorkspacesDeps } from './list-workspaces.js'

/**
 * Explicit dependencies for {@link createRegenerateSpecMetadata}.
 */
export interface RegenerateSpecMetadataDeps {
  /** Use case that materializes spec metadata. */
  readonly materializeSpecMetadata: MaterializeSpecMetadata
  /** Use case listing configured workspaces. */
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Resolves {@link RegenerateSpecMetadataDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `RegenerateSpecMetadata`
 */
export function resolveRegenerateSpecMetadataDeps(
  resolver: CompositionResolver,
): RegenerateSpecMetadataDeps {
  return {
    materializeSpecMetadata: createMaterializeSpecMetadata(
      resolveMaterializeSpecMetadataDeps(resolver),
    ),
    listWorkspaces: createListWorkspaces(resolveListWorkspacesDeps(resolver)),
  }
}

/**
 * Constructs `RegenerateSpecMetadata` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createRegenerateSpecMetadata(
  deps: RegenerateSpecMetadataDeps,
): RegenerateSpecMetadata
/**
 * Constructs `RegenerateSpecMetadata` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRegenerateSpecMetadata(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): RegenerateSpecMetadata
/**
 * Constructs `RegenerateSpecMetadata` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRegenerateSpecMetadata(
  depsOrConfig: RegenerateSpecMetadataDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): RegenerateSpecMetadata {
  const normalized = normalizeCompositionFactoryArgs(
    'createRegenerateSpecMetadata',
    depsOrConfig,
    options,
    isRegenerateSpecMetadataDeps,
  )
  if (normalized.kind === 'deps') {
    return new RegenerateSpecMetadata(
      normalized.deps.materializeSpecMetadata,
      normalized.deps.listWorkspaces,
    )
  }
  const resolver = createCompositionResolver(normalized.config, normalized.options)
  return createRegenerateSpecMetadata(resolveRegenerateSpecMetadataDeps(resolver))
}

/**
 * Type guard for explicit `RegenerateSpecMetadataDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isRegenerateSpecMetadataDeps(
  value: RegenerateSpecMetadataDeps | SpecdConfig,
): value is RegenerateSpecMetadataDeps {
  return 'materializeSpecMetadata' in value && 'listWorkspaces' in value
}
