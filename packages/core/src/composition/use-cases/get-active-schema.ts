import { type SchemaRegistry } from '../../application/ports/schema-registry.js'
import { GetActiveSchema } from '../../application/use-cases/get-active-schema.js'
import { type ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { buildSchema } from '../../domain/services/build-schema.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetActiveSchema}.
 */
export interface GetActiveSchemaDeps {
  /** Shared resolve-schema use case. */
  readonly resolveSchema: ResolveSchema
  /** Shared schema registry. */
  readonly schemas: SchemaRegistry
  /** Active schema reference string. */
  readonly schemaRef: string
}

/**
 * Resolves {@link GetActiveSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetActiveSchema`
 */
export function resolveGetActiveSchemaDeps(resolver: CompositionResolver): GetActiveSchemaDeps {
  return {
    resolveSchema: resolver.getResolveSchema(),
    schemas: resolver.getSchemaRegistry(),
    schemaRef: resolver.config.schemaRef,
  }
}

/**
 * Constructs a `GetActiveSchema` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(deps: GetActiveSchemaDeps): GetActiveSchema
/**
 * Constructs a `GetActiveSchema` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetActiveSchema
/**
 * Constructs a `GetActiveSchema` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createGetActiveSchema(
  depsOrConfig: GetActiveSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetActiveSchema {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetActiveSchema',
    depsOrConfig,
    options,
    isGetActiveSchemaDeps,
  )
  return createGetActiveSchemaFromNormalized(normalized)
}

/**
 * Applies normalized `GetActiveSchema` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetActiveSchemaFromNormalized(
  input: FactoryInput<GetActiveSchemaDeps, CompositionResolutionOptions>,
): GetActiveSchema {
  if (input.kind === 'deps') {
    return new GetActiveSchema(
      input.deps.resolveSchema,
      input.deps.schemas,
      buildSchema,
      input.deps.schemaRef,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createGetActiveSchema(resolveGetActiveSchemaDeps(resolver))
}

/**
 * Type guard for explicit `GetActiveSchemaDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetActiveSchemaDeps(
  value: GetActiveSchemaDeps | SpecdConfig,
): value is GetActiveSchemaDeps {
  return 'resolveSchema' in value && 'schemas' in value && 'schemaRef' in value
}
