import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type ValidateArtifacts } from '../../application/use-cases/validate-artifacts.js'
import { ValidateChangeBatch } from '../../application/use-cases/validate-change-batch.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createValidateArtifacts, resolveValidateArtifactsDeps } from './validate-artifacts.js'

/**
 * Explicit dependencies for {@link createValidateChangeBatch}.
 */
export interface ValidateChangeBatchDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
  readonly validateArtifacts: ValidateArtifacts
}

/**
 * Resolves `ValidateChangeBatch` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @param options - Optional pre-constructed use cases to reuse
 * @param options.validateArtifacts - Pre-constructed ValidateArtifacts instance
 * @returns The resolved dependencies for `ValidateChangeBatch`
 */
export function resolveValidateChangeBatchDeps(
  resolver: CompositionResolver,
  options?: { readonly validateArtifacts?: ValidateArtifacts },
): ValidateChangeBatchDeps {
  return {
    changes: resolver.getChangeRepository(),
    schemaProvider: resolver.getSchemaProvider(),
    validateArtifacts:
      options?.validateArtifacts ?? createValidateArtifacts(resolveValidateArtifactsDeps(resolver)),
  }
}

/**
 * Constructs `ValidateChangeBatch` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createValidateChangeBatch(deps: ValidateChangeBatchDeps): ValidateChangeBatch
/**
 * Constructs `ValidateChangeBatch` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateChangeBatch(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateChangeBatch
/**
 * Constructs `ValidateChangeBatch` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateChangeBatch(
  depsOrConfig: ValidateChangeBatchDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateChangeBatch {
  const normalized = normalizeCompositionFactoryArgs(
    'createValidateChangeBatch',
    depsOrConfig,
    options,
    isValidateChangeBatchDeps,
  )
  return createValidateChangeBatchFromNormalized(normalized)
}

/**
 * Applies normalized `ValidateChangeBatch` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createValidateChangeBatchFromNormalized(
  input: FactoryInput<ValidateChangeBatchDeps, CompositionResolutionOptions>,
): ValidateChangeBatch {
  if (input.kind === 'deps') {
    const { changes, schemaProvider, validateArtifacts } = input.deps
    return new ValidateChangeBatch(changes, schemaProvider, validateArtifacts)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createValidateChangeBatch(resolveValidateChangeBatchDeps(resolver))
}

/**
 * Type guard for explicit `ValidateChangeBatchDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isValidateChangeBatchDeps(
  value: ValidateChangeBatchDeps | SpecdConfig,
): value is ValidateChangeBatchDeps {
  return 'changes' in value && 'schemaProvider' in value && 'validateArtifacts' in value
}
