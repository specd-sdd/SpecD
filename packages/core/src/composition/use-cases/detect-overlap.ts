import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { DetectOverlap } from '../../application/use-cases/detect-overlap.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createDetectOverlap}.
 */
export interface DetectOverlapDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
}

/**
 * Resolves {@link DetectOverlapDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `DetectOverlap`
 */
export function resolveDetectOverlapDeps(resolver: CompositionResolver): DetectOverlapDeps {
  return {
    changes: resolver.getChangeRepository(),
  }
}

/**
 * Constructs `DetectOverlap` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(deps: DetectOverlapDeps): DetectOverlap
/**
 * Constructs `DetectOverlap` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): DetectOverlap
/**
 * Constructs `DetectOverlap` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createDetectOverlap(
  depsOrConfig: DetectOverlapDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): DetectOverlap {
  const normalized = normalizeCompositionFactoryArgs(
    'createDetectOverlap',
    depsOrConfig,
    options,
    isDetectOverlapDeps,
  )
  return createDetectOverlapFromNormalized(normalized)
}

/**
 * Applies normalized `DetectOverlap` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createDetectOverlapFromNormalized(
  input: FactoryInput<DetectOverlapDeps, CompositionResolutionOptions>,
): DetectOverlap {
  if (input.kind === 'deps') {
    return new DetectOverlap(input.deps.changes)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createDetectOverlap(resolveDetectOverlapDeps(resolver))
}

/**
 * Type guard for explicit `DetectOverlapDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isDetectOverlapDeps(value: DetectOverlapDeps | SpecdConfig): value is DetectOverlapDeps {
  return 'changes' in value
}
