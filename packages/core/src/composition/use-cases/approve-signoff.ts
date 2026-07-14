import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type ApprovalGates } from '../../application/use-cases/transition-change.js'
import { ApproveSignoff } from '../../application/use-cases/approve-signoff.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createApproveSignoff}.
 */
export interface ApproveSignoffDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Content hasher used by the use case. */
  readonly contentHasher: ContentHasher
  /** Approval gate configuration used by the use case. */
  readonly approvals: ApprovalGates
}

/**
 * Resolves {@link ApproveSignoffDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ApproveSignoff`
 */
export function resolveApproveSignoffDeps(resolver: CompositionResolver): ApproveSignoffDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    schemaProvider: resolver.getSchemaProvider(),
    contentHasher: resolver.getContentHasher(),
    approvals: resolver.config.approvals,
  }
}

/**
 * Constructs `ApproveSignoff` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(deps: ApproveSignoffDeps): ApproveSignoff
/**
 * Constructs `ApproveSignoff` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ApproveSignoff
/**
 * Constructs `ApproveSignoff` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createApproveSignoff(
  depsOrConfig: ApproveSignoffDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ApproveSignoff {
  const normalized = normalizeCompositionFactoryArgs(
    'createApproveSignoff',
    depsOrConfig,
    options,
    isApproveSignoffDeps,
  )
  return createApproveSignoffFromNormalized(normalized)
}

/**
 * Applies normalized `ApproveSignoff` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createApproveSignoffFromNormalized(
  input: FactoryInput<ApproveSignoffDeps, CompositionResolutionOptions>,
): ApproveSignoff {
  if (input.kind === 'deps') {
    const { changes, actor, schemaProvider, contentHasher, approvals } = input.deps
    return new ApproveSignoff(changes, actor, schemaProvider, contentHasher, approvals)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createApproveSignoff(resolveApproveSignoffDeps(resolver))
}

/**
 * Type guard for explicit `ApproveSignoffDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isApproveSignoffDeps(
  value: ApproveSignoffDeps | SpecdConfig,
): value is ApproveSignoffDeps {
  return (
    'changes' in value &&
    'actor' in value &&
    'schemaProvider' in value &&
    'contentHasher' in value &&
    'approvals' in value
  )
}
