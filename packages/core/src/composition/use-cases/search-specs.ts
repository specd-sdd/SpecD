import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type YamlSerializer } from '../../application/ports/yaml-serializer.js'
import { SearchSpecs } from '../../application/use-cases/search-specs.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createSearchSpecs}.
 */
export interface SearchSpecsDeps {
  /** Workspace enumeration use case. */
  readonly listWorkspaces: ListWorkspaces
  /** Content hasher used for metadata freshness checks. */
  readonly hasher: ContentHasher
  /** YAML serializer used for metadata parsing. */
  readonly yaml: YamlSerializer
}

/**
 * Resolves {@link SearchSpecsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `SearchSpecs`
 */
export function resolveSearchSpecsDeps(resolver: CompositionResolver): SearchSpecsDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
    hasher: resolver.getContentHasher(),
    yaml: resolver.getYamlSerializer(),
  }
}

/**
 * Constructs a `SearchSpecs` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createSearchSpecs(deps: SearchSpecsDeps): SearchSpecs
/**
 * Constructs a `SearchSpecs` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createSearchSpecs(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SearchSpecs
/**
 * Constructs a `SearchSpecs` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createSearchSpecs(
  depsOrConfig: SearchSpecsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SearchSpecs {
  const normalized = normalizeCompositionFactoryArgs(
    'createSearchSpecs',
    depsOrConfig,
    options,
    isSearchSpecsDeps,
  )
  return createSearchSpecsFromNormalized(normalized)
}

/**
 * Applies normalized `SearchSpecs` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createSearchSpecsFromNormalized(
  input: FactoryInput<SearchSpecsDeps, CompositionResolutionOptions>,
): SearchSpecs {
  if (input.kind === 'deps') {
    return new SearchSpecs(input.deps.listWorkspaces, input.deps.hasher, input.deps.yaml)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createSearchSpecs(resolveSearchSpecsDeps(resolver))
}

/**
 * Type guard for explicit `SearchSpecsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isSearchSpecsDeps(value: SearchSpecsDeps | SpecdConfig): value is SearchSpecsDeps {
  return 'listWorkspaces' in value && 'hasher' in value && 'yaml' in value
}
