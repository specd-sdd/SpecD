import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type FileReader } from '../../application/ports/file-reader.js'
import { UpdateImplementationTracking } from '../../application/use-cases/update-implementation-tracking.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createUpdateImplementationTracking}.
 */
export interface UpdateImplementationTrackingDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** File reader used for file existence checks. */
  readonly files: FileReader
  /** Absolute project root path. */
  readonly projectRoot: string
}

/**
 * Resolves {@link UpdateImplementationTrackingDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `UpdateImplementationTracking`
 */
export function resolveUpdateImplementationTrackingDeps(
  resolver: CompositionResolver,
): UpdateImplementationTrackingDeps {
  return {
    changes: resolver.getChangeRepository(),
    files: resolver.getFileReader(),
    projectRoot: resolver.config.projectRoot,
  }
}

/**
 * Constructs an `UpdateImplementationTracking` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  deps: UpdateImplementationTrackingDeps,
): UpdateImplementationTracking
/**
 * Constructs an `UpdateImplementationTracking` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateImplementationTracking
/**
 * Constructs an `UpdateImplementationTracking` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createUpdateImplementationTracking(
  depsOrConfig: UpdateImplementationTrackingDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): UpdateImplementationTracking {
  const normalized = normalizeCompositionFactoryArgs(
    'createUpdateImplementationTracking',
    depsOrConfig,
    options,
    isUpdateImplementationTrackingDeps,
  )
  return createUpdateImplementationTrackingFromNormalized(normalized)
}

/**
 * Applies normalized `UpdateImplementationTracking` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createUpdateImplementationTrackingFromNormalized(
  input: FactoryInput<UpdateImplementationTrackingDeps, CompositionResolutionOptions>,
): UpdateImplementationTracking {
  if (input.kind === 'deps') {
    return new UpdateImplementationTracking(
      input.deps.changes,
      input.deps.files,
      input.deps.projectRoot,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createUpdateImplementationTracking(resolveUpdateImplementationTrackingDeps(resolver))
}

/**
 * Type guard for explicit `UpdateImplementationTrackingDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isUpdateImplementationTrackingDeps(
  value: UpdateImplementationTrackingDeps | SpecdConfig,
): value is UpdateImplementationTrackingDeps {
  return 'changes' in value && 'files' in value && 'projectRoot' in value
}
