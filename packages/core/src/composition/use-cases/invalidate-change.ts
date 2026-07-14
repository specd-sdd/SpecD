import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { InvalidateChange } from '../../application/use-cases/invalidate-change.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createInvalidateChange}.
 */
export interface InvalidateChangeDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Actor resolver used by the use case. */
  readonly actor: ActorResolver
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
}

/**
 * Resolves `InvalidateChange` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `InvalidateChange`
 */
export function resolveInvalidateChangeDeps(resolver: CompositionResolver): InvalidateChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    actor: resolver.getActorResolver(),
    schemaProvider: resolver.getSchemaProvider(),
  }
}

/**
 * Constructs `InvalidateChange` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(deps: InvalidateChangeDeps): InvalidateChange
/**
 * Constructs `InvalidateChange` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateChange
/**
 * Constructs `InvalidateChange` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createInvalidateChange(
  depsOrConfig: InvalidateChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): InvalidateChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createInvalidateChange',
    depsOrConfig,
    options,
    isInvalidateChangeDeps,
  )
  return createInvalidateChangeFromNormalized(normalized)
}

/**
 * Applies normalized `InvalidateChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createInvalidateChangeFromNormalized(
  input: FactoryInput<InvalidateChangeDeps, CompositionResolutionOptions>,
): InvalidateChange {
  if (input.kind === 'deps') {
    const { changes, actor, schemaProvider } = input.deps
    return new InvalidateChange(changes, actor, schemaProvider)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createInvalidateChange(resolveInvalidateChangeDeps(resolver))
}

/**
 * Type guard for explicit `InvalidateChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isInvalidateChangeDeps(
  value: InvalidateChangeDeps | SpecdConfig,
): value is InvalidateChangeDeps {
  return 'changes' in value && 'actor' in value && 'schemaProvider' in value
}
