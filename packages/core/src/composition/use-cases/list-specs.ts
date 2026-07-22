import { ListSpecs } from '../../application/use-cases/list-specs.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListSpecs}.
 */
export interface ListSpecsDeps {
  /** Workspace enumeration use case. */
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Resolves {@link ListSpecsDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListSpecs`
 */
export function resolveListSpecsDeps(resolver: CompositionResolver): ListSpecsDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
  }
}

/**
 * Constructs a `ListSpecs` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListSpecs(deps: ListSpecsDeps): ListSpecs
/**
 * Constructs a `ListSpecs` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListSpecs(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListSpecs
/**
 * Constructs a `ListSpecs` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListSpecs(
  depsOrConfig: ListSpecsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListSpecs {
  const normalized = normalizeCompositionFactoryArgs(
    'createListSpecs',
    depsOrConfig,
    options,
    isListSpecsDeps,
  )
  return createListSpecsFromNormalized(normalized)
}

/**
 * Applies normalized `ListSpecs` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListSpecsFromNormalized(
  input: FactoryInput<ListSpecsDeps, CompositionResolutionOptions>,
): ListSpecs {
  if (input.kind === 'deps') {
    return new ListSpecs(input.deps.listWorkspaces)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListSpecs(resolveListSpecsDeps(resolver))
}

/**
 * Type guard for explicit `ListSpecsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListSpecsDeps(value: ListSpecsDeps | SpecdConfig): value is ListSpecsDeps {
  return 'listWorkspaces' in value
}
