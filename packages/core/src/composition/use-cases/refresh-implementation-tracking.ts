import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type FileReader } from '../../application/ports/file-reader.js'
import { type ImplementationDetector } from '../../application/ports/implementation-detector.js'
import { RefreshImplementationTracking } from '../../application/use-cases/refresh-implementation-tracking.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { VcsImplementationDetector } from '../../infrastructure/vcs/vcs-implementation-detector.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createRefreshImplementationTracking}.
 */
export interface RefreshImplementationTrackingDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Archive repository used by the use case. */
  readonly archive: ArchiveRepository
  /** Implementation detector used to discover candidate files. */
  readonly implementationDetector: ImplementationDetector
  /** File reader used for existence checks. */
  readonly files: FileReader
  /** Absolute project root path. */
  readonly projectRoot: string
}

/**
 * Resolves {@link RefreshImplementationTrackingDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `RefreshImplementationTracking`
 */
export function resolveRefreshImplementationTrackingDeps(
  resolver: CompositionResolver,
): RefreshImplementationTrackingDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
    implementationDetector: new VcsImplementationDetector(resolver.config.projectRoot, () =>
      resolver.getVcsAdapter(),
    ),
    files: resolver.getFileReader(),
    projectRoot: resolver.config.projectRoot,
  }
}

/**
 * Constructs a `RefreshImplementationTracking` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  deps: RefreshImplementationTrackingDeps,
): RefreshImplementationTracking
/**
 * Constructs a `RefreshImplementationTracking` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): RefreshImplementationTracking
/**
 * Constructs a `RefreshImplementationTracking` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createRefreshImplementationTracking(
  depsOrConfig: RefreshImplementationTrackingDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): RefreshImplementationTracking {
  const normalized = normalizeCompositionFactoryArgs(
    'createRefreshImplementationTracking',
    depsOrConfig,
    options,
    isRefreshImplementationTrackingDeps,
  )
  return createRefreshImplementationTrackingFromNormalized(normalized)
}

/**
 * Applies normalized `RefreshImplementationTracking` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createRefreshImplementationTrackingFromNormalized(
  input: FactoryInput<RefreshImplementationTrackingDeps, CompositionResolutionOptions>,
): RefreshImplementationTracking {
  if (input.kind === 'deps') {
    return new RefreshImplementationTracking(
      input.deps.changes,
      input.deps.archive,
      input.deps.implementationDetector,
      input.deps.files,
      input.deps.projectRoot,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createRefreshImplementationTracking(resolveRefreshImplementationTrackingDeps(resolver))
}

/**
 * Type guard for explicit `RefreshImplementationTrackingDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isRefreshImplementationTrackingDeps(
  value: RefreshImplementationTrackingDeps | SpecdConfig,
): value is RefreshImplementationTrackingDeps {
  return (
    'changes' in value &&
    'archive' in value &&
    'implementationDetector' in value &&
    'files' in value &&
    'projectRoot' in value
  )
}
