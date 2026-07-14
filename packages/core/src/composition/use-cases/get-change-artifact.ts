import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { GetChangeArtifact } from '../../application/use-cases/get-change-artifact.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetChangeArtifact}.
 */
export interface GetChangeArtifactDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link GetChangeArtifactDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetChangeArtifact`
 */
export function resolveGetChangeArtifactDeps(resolver: CompositionResolver): GetChangeArtifactDeps {
  return { changes: resolver.getChangeRepository() }
}

/**
 * Constructs a `GetChangeArtifact` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(deps: GetChangeArtifactDeps): GetChangeArtifact
/**
 * Constructs a `GetChangeArtifact` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetChangeArtifact
/**
 * Constructs a `GetChangeArtifact` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetChangeArtifact(
  depsOrConfig: GetChangeArtifactDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetChangeArtifact {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetChangeArtifact',
    depsOrConfig,
    options,
    isGetChangeArtifactDeps,
  )
  return createGetChangeArtifactFromNormalized(normalized)
}

/**
 * Applies normalized `GetChangeArtifact` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetChangeArtifactFromNormalized(
  input: FactoryInput<GetChangeArtifactDeps, CompositionResolutionOptions>,
): GetChangeArtifact {
  if (input.kind === 'deps') {
    return new GetChangeArtifact(input.deps.changes)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetChangeArtifact(resolveGetChangeArtifactDeps(resolver))
}

/**
 * Type guard for explicit `GetChangeArtifactDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetChangeArtifactDeps(
  value: GetChangeArtifactDeps | SpecdConfig,
): value is GetChangeArtifactDeps {
  return 'changes' in value
}
