import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { ResolveChangeSchema } from '../../application/services/resolve-change-schema.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/** Explicit dependencies for {@link createResolveChangeSchema}. */
export interface ResolveChangeSchemaDeps {
  /** Shared schema provider the resolver verifies identity against. */
  readonly schemaProvider: SchemaProvider
}

/**
 * Resolves {@link ResolveChangeSchemaDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `ResolveChangeSchema`
 */
export function resolveResolveChangeSchemaDeps(
  resolver: CompositionResolver,
): ResolveChangeSchemaDeps {
  return { schemaProvider: resolver.getSchemaProvider() }
}

/**
 * Constructs a `ResolveChangeSchema` service from explicit dependencies.
 *
 * @param deps - Explicit dependencies
 * @returns The pre-wired service
 */
export function createResolveChangeSchema(deps: ResolveChangeSchemaDeps): ResolveChangeSchema
/**
 * Constructs a `ResolveChangeSchema` service from project configuration.
 *
 * @param config - Project configuration
 * @param options - Composition options
 * @returns The pre-wired service sharing the composition's resolver instance
 */
export function createResolveChangeSchema(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveChangeSchema
/**
 * Constructs a `ResolveChangeSchema` service from explicit deps or project configuration.
 *
 * @param depsOrConfig - Explicit dependencies or project configuration
 * @param options - Composition options
 * @returns The pre-wired service
 */
export function createResolveChangeSchema(
  depsOrConfig: ResolveChangeSchemaDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): ResolveChangeSchema {
  return createResolveChangeSchemaFromNormalized(
    normalizeCompositionFactoryArgs(
      'createResolveChangeSchema',
      depsOrConfig,
      options,
      isResolveChangeSchemaDeps,
    ),
  )
}

/**
 * Applies normalized factory input.
 *
 * @param input - Normalized explicit dependencies or configuration
 * @returns The pre-wired service
 */
function createResolveChangeSchemaFromNormalized(
  input: FactoryInput<ResolveChangeSchemaDeps, CompositionResolutionOptions>,
): ResolveChangeSchema {
  if (input.kind === 'deps') {
    return new ResolveChangeSchema(input.deps.schemaProvider)
  }
  return createCompositionResolver(input.config, input.options).getResolveChangeSchema()
}

/**
 * Type guard for explicit {@link ResolveChangeSchemaDeps}.
 *
 * @param value - Candidate factory input
 * @returns `true` when the input is explicit deps
 */
function isResolveChangeSchemaDeps(
  value: ResolveChangeSchemaDeps | SpecdConfig,
): value is ResolveChangeSchemaDeps {
  return 'schemaProvider' in value
}
