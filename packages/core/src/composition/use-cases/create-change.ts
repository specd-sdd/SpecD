import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { CreateChange } from '../../application/use-cases/create-change.js'
import { DetectOverlap } from '../../application/use-cases/detect-overlap.js'
import { type GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createCreateChange}.
 */
export interface CreateChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Workspace orchestrator used by the use case. */
  readonly listWorkspaces: ListWorkspaces
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
  /** Active schema lookup used by the use case. */
  readonly getActiveSchema: GetActiveSchema
  /** Overlap detection used by the use case. */
  readonly detectOverlap: DetectOverlap
}

/**
 * Resolves {@link CreateChangeDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `CreateChange`
 */
export function resolveCreateChangeDeps(resolver: CompositionResolver): CreateChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
    actor: resolver.getActorResolver(),
    getActiveSchema: resolver.getGetActiveSchema(),
    detectOverlap: createDetectOverlapFromResolver(resolver),
  }
}

/**
 * Constructs a `CreateChange` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createCreateChange(deps: CreateChangeDeps): CreateChange
/**
 * Constructs a `CreateChange` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createCreateChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CreateChange
/**
 * Constructs a `CreateChange` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createCreateChange(
  depsOrConfig: CreateChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): CreateChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createCreateChange',
    depsOrConfig,
    options,
    isCreateChangeDeps,
  )
  return createCreateChangeFromNormalized(normalized)
}

/**
 * Applies normalized `CreateChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createCreateChangeFromNormalized(
  input: FactoryInput<CreateChangeDeps, CompositionResolutionOptions>,
): CreateChange {
  if (input.kind === 'deps') {
    const { changes, listWorkspaces, actor, getActiveSchema, detectOverlap } = input.deps
    return new CreateChange(changes, listWorkspaces, actor, getActiveSchema, detectOverlap)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createCreateChange(resolveCreateChangeDeps(resolver))
}

/**
 * Creates the overlap detector dependency from resolver-backed collaborators.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The overlap detector used by `CreateChange`
 */
function createDetectOverlapFromResolver(resolver: CompositionResolver): DetectOverlap {
  return new DetectOverlap(resolver.getChangeRepository())
}

/**
 * Type guard for explicit `CreateChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isCreateChangeDeps(value: CreateChangeDeps | SpecdConfig): value is CreateChangeDeps {
  return (
    'changes' in value &&
    'listWorkspaces' in value &&
    'actor' in value &&
    'getActiveSchema' in value &&
    'detectOverlap' in value
  )
}
