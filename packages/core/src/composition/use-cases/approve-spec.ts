import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ContentHasher } from '../../application/ports/content-hasher.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type ApprovalGates } from '../../application/use-cases/transition-change.js'
import { ApproveSpec } from '../../application/use-cases/approve-spec.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createApproveSpec}.
 */
export interface ApproveSpecDeps {
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
 * Resolves {@link ApproveSpecDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ApproveSpec`
 */
export function resolveApproveSpecDeps(resolver: CompositionResolver): ApproveSpecDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    schemaProvider: resolver.getSchemaProvider(),
    contentHasher: resolver.getContentHasher(),
    approvals: resolver.config.approvals,
  }
}

/**
 * Constructs `ApproveSpec` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createApproveSpec(deps: ApproveSpecDeps): ApproveSpec
/**
 * Constructs `ApproveSpec` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createApproveSpec(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ApproveSpec
/**
 * Constructs `ApproveSpec` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createApproveSpec(
  depsOrConfig: ApproveSpecDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ApproveSpec {
  const normalized = normalizeCompositionFactoryArgs(
    'createApproveSpec',
    depsOrConfig,
    options,
    isApproveSpecDeps,
  )
  return createApproveSpecFromNormalized(normalized)
}

/**
 * Applies normalized `ApproveSpec` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createApproveSpecFromNormalized(
  input: FactoryInput<ApproveSpecDeps, CompositionResolutionOptions>,
): ApproveSpec {
  if (input.kind === 'deps') {
    const { changes, actor, schemaProvider, contentHasher, approvals } = input.deps
    return new ApproveSpec(changes, actor, schemaProvider, contentHasher, approvals)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createApproveSpec(resolveApproveSpecDeps(resolver))
}

/**
 * Type guard for explicit `ApproveSpecDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isApproveSpecDeps(value: ApproveSpecDeps | SpecdConfig): value is ApproveSpecDeps {
  return (
    'changes' in value &&
    'actor' in value &&
    'schemaProvider' in value &&
    'contentHasher' in value &&
    'approvals' in value
  )
}
