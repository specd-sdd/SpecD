import { type SchemaRegistry } from '../../application/ports/schema-registry.js'
import { type ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { ValidateSchema } from '../../application/use-cases/validate-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { buildSchema } from '../../domain/services/build-schema.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createValidateSchema}.
 */
export interface ValidateSchemaDeps {
  /** Shared schema registry. */
  readonly schemas: SchemaRegistry
  /** Active schema reference string. */
  readonly schemaRef: string
  /** Shared resolve-schema use case. */
  readonly resolveSchema: ResolveSchema
}

/**
 * Resolves {@link ValidateSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ValidateSchema`
 */
export function resolveValidateSchemaDeps(resolver: CompositionResolver): ValidateSchemaDeps {
  return {
    schemas: resolver.getSchemaRegistry(),
    schemaRef: resolver.config.schemaRef,
    resolveSchema: resolver.getResolveSchema(),
  }
}

/**
 * Constructs a `ValidateSchema` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(deps: ValidateSchemaDeps): ValidateSchema
/**
 * Constructs a `ValidateSchema` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateSchema
/**
 * Constructs a `ValidateSchema` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createValidateSchema(
  depsOrConfig: ValidateSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ValidateSchema {
  const normalized = normalizeCompositionFactoryArgs(
    'createValidateSchema',
    depsOrConfig,
    options,
    isValidateSchemaDeps,
  )
  return createValidateSchemaFromNormalized(normalized)
}

/**
 * Applies normalized `ValidateSchema` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createValidateSchemaFromNormalized(
  input: FactoryInput<ValidateSchemaDeps, CompositionResolutionOptions>,
): ValidateSchema {
  if (input.kind === 'deps') {
    return new ValidateSchema(
      input.deps.schemas,
      input.deps.schemaRef,
      buildSchema,
      input.deps.resolveSchema,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createValidateSchema(resolveValidateSchemaDeps(resolver))
}

/**
 * Type guard for explicit `ValidateSchemaDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isValidateSchemaDeps(
  value: ValidateSchemaDeps | SpecdConfig,
): value is ValidateSchemaDeps {
  return 'schemas' in value && 'schemaRef' in value && 'resolveSchema' in value
}
