import { type SchemaRegistry } from '../../application/ports/schema-registry.js'
import { ResolveSchema } from '../../application/use-cases/resolve-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type SchemaOperations } from '../../domain/services/merge-schema-layers.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createResolveSchema}.
 */
export interface ResolveSchemaDeps {
  /** Shared schema registry. */
  readonly schemas: SchemaRegistry
  /** Active schema reference string. */
  readonly schemaRef: string
  /** Optional schema plugin references in declaration order. */
  readonly schemaPlugins?: readonly string[]
  /** Optional inline schema override operations. */
  readonly schemaOverrides?: SchemaOperations
}

/**
 * Resolves {@link ResolveSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ResolveSchema`
 */
export function resolveResolveSchemaDeps(resolver: CompositionResolver): ResolveSchemaDeps {
  return {
    schemas: resolver.getSchemaRegistry(),
    schemaRef: resolver.config.schemaRef,
    ...(resolver.config.schemaPlugins !== undefined
      ? { schemaPlugins: resolver.config.schemaPlugins }
      : {}),
    ...(resolver.config.schemaOverrides !== undefined
      ? { schemaOverrides: resolver.config.schemaOverrides }
      : {}),
  }
}

/**
 * Constructs a `ResolveSchema` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(deps: ResolveSchemaDeps): ResolveSchema
/**
 * Constructs a `ResolveSchema` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveSchema
/**
 * Constructs a `ResolveSchema` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createResolveSchema(
  depsOrConfig: ResolveSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveSchema {
  const normalized = normalizeCompositionFactoryArgs(
    'createResolveSchema',
    depsOrConfig,
    options,
    isResolveSchemaDeps,
  )
  return createResolveSchemaFromNormalized(normalized)
}

/**
 * Applies normalized `ResolveSchema` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createResolveSchemaFromNormalized(
  input: FactoryInput<ResolveSchemaDeps, CompositionResolutionOptions>,
): ResolveSchema {
  if (input.kind === 'deps') {
    return new ResolveSchema(
      input.deps.schemas,
      input.deps.schemaRef,
      input.deps.schemaPlugins ?? [],
      input.deps.schemaOverrides,
    )
  }
  const resolver = createCompositionResolver(input.config, input.options)
  return createResolveSchema(resolveResolveSchemaDeps(resolver))
}

/**
 * Type guard for explicit `ResolveSchemaDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isResolveSchemaDeps(value: ResolveSchemaDeps | SpecdConfig): value is ResolveSchemaDeps {
  return 'schemas' in value && 'schemaRef' in value
}
