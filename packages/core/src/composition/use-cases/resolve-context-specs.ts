import { type CompileContextConfig } from '../../application/use-cases/compile-context.js'
import { ResolveContextSpecs } from '../../application/use-cases/resolve-context-specs.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/** Dependencies for {@link createResolveContextSpecs}. */
export interface ResolveContextSpecsDeps {
  readonly listWorkspaces: ListWorkspaces
  readonly defaultConfig: CompileContextConfig
}

/**
 * Resolves dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver.
 * @returns Resolved dependencies.
 */
export function resolveResolveContextSpecsDeps(
  resolver: CompositionResolver,
): ResolveContextSpecsDeps {
  return {
    listWorkspaces: resolver.getListWorkspaces(),
    defaultConfig: resolver.getCompileContextConfig(),
  }
}

/**
 * Creates the configured context spec resolver.
 *
 * @param deps - Explicit dependencies.
 * @returns The configured resolver.
 */
export function createResolveContextSpecs(deps: ResolveContextSpecsDeps): ResolveContextSpecs
/**
 * Creates the resolver from a complete project configuration.
 *
 * @param config - Resolved project configuration.
 * @param options - Optional composition registrations.
 * @returns The configured resolver.
 */
export function createResolveContextSpecs(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveContextSpecs
/**
 * Creates the resolver from explicit dependencies or project configuration.
 *
 * @param depsOrConfig - Explicit dependencies or configuration.
 * @param options - Optional composition registrations.
 * @returns The configured resolver.
 */
export function createResolveContextSpecs(
  depsOrConfig: ResolveContextSpecsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveContextSpecs {
  const normalized = normalizeCompositionFactoryArgs(
    'createResolveContextSpecs',
    depsOrConfig,
    options,
    isResolveContextSpecsDeps,
  )
  return createResolveContextSpecsFromNormalized(normalized)
}

/**
 * Instantiates the resolver from normalized factory input.
 *
 * @param input - Normalized factory input.
 * @returns The configured resolver.
 */
function createResolveContextSpecsFromNormalized(
  input: FactoryInput<ResolveContextSpecsDeps, CompositionResolutionOptions>,
): ResolveContextSpecs {
  if (input.kind === 'deps') {
    return new ResolveContextSpecs(input.deps.listWorkspaces, input.deps.defaultConfig)
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createResolveContextSpecs(resolveResolveContextSpecsDeps(resolver))
}

/**
 * Detects explicit dependency input for the public factory.
 *
 * @param value - Candidate factory input.
 * @returns Whether the value is explicit dependencies.
 */
function isResolveContextSpecsDeps(
  value: ResolveContextSpecsDeps | SpecdConfig,
): value is ResolveContextSpecsDeps {
  return 'listWorkspaces' in value && 'defaultConfig' in value
}
