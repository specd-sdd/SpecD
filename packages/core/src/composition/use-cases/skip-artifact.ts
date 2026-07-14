import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { SkipArtifact } from '../../application/use-cases/skip-artifact.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createSkipArtifact}.
 */
export interface SkipArtifactDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
}

/**
 * Resolves {@link SkipArtifactDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `SkipArtifact`
 */
export function resolveSkipArtifactDeps(resolver: CompositionResolver): SkipArtifactDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
  }
}

/**
 * Constructs `SkipArtifact` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(deps: SkipArtifactDeps): SkipArtifact
/**
 * Constructs `SkipArtifact` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SkipArtifact
/**
 * Constructs `SkipArtifact` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createSkipArtifact(
  depsOrConfig: SkipArtifactDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SkipArtifact {
  const normalized = normalizeCompositionFactoryArgs(
    'createSkipArtifact',
    depsOrConfig,
    options,
    isSkipArtifactDeps,
  )
  return createSkipArtifactFromNormalized(normalized)
}

/**
 * Applies normalized `SkipArtifact` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createSkipArtifactFromNormalized(
  input: FactoryInput<SkipArtifactDeps, CompositionResolutionOptions>,
): SkipArtifact {
  if (input.kind === 'deps') {
    return new SkipArtifact(input.deps.changes, input.deps.actor)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createSkipArtifact(resolveSkipArtifactDeps(resolver))
}

/**
 * Type guard for explicit `SkipArtifactDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isSkipArtifactDeps(value: SkipArtifactDeps | SpecdConfig): value is SkipArtifactDeps {
  return 'changes' in value && 'actor' in value
}
