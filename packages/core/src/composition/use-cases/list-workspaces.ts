import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createListWorkspaces}.
 */
export interface ListWorkspacesDeps {
  /** Fully-resolved project configuration. */
  readonly config: SpecdConfig
  /** Pre-built spec repositories keyed by workspace name. */
  readonly specRepositories: ReadonlyMap<string, SpecRepository>
}

/**
 * Resolves {@link ListWorkspacesDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ListWorkspaces`
 */
export function resolveListWorkspacesDeps(resolver: CompositionResolver): ListWorkspacesDeps {
  return {
    config: resolver.config,
    specRepositories: resolver.getSpecRepositories(),
  }
}

/**
 * Constructs a `ListWorkspaces` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(deps: ListWorkspacesDeps): ListWorkspaces
/**
 * Constructs a `ListWorkspaces` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ListWorkspaces
/**
 * Constructs a `ListWorkspaces` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createListWorkspaces(
  depsOrConfig: ListWorkspacesDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ListWorkspaces {
  const normalized = normalizeCompositionFactoryArgs(
    'createListWorkspaces',
    depsOrConfig,
    options,
    isListWorkspacesDeps,
  )
  return createListWorkspacesFromNormalized(normalized)
}

/**
 * Applies normalized `ListWorkspaces` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createListWorkspacesFromNormalized(
  input: FactoryInput<ListWorkspacesDeps, CompositionResolutionOptions>,
): ListWorkspaces {
  if (input.kind === 'deps') {
    return new ListWorkspaces(input.deps.config, input.deps.specRepositories)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createListWorkspaces(resolveListWorkspacesDeps(resolver))
}

/**
 * Type guard for explicit `ListWorkspacesDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isListWorkspacesDeps(
  value: ListWorkspacesDeps | SpecdConfig,
): value is ListWorkspacesDeps {
  return 'config' in value && 'specRepositories' in value
}
