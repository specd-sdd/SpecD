import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { PreviewSpec } from '../../application/use-cases/preview-spec.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createPreviewSpec}.
 */
export interface PreviewSpecDeps {
  readonly changes: ChangeRepository
  readonly specs: ReadonlyMap<string, SpecRepository>
  readonly schemaProvider: SchemaProvider
  readonly parsers: ArtifactParserRegistry
}

/**
 * Resolves `PreviewSpec` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `PreviewSpec`
 */
export function resolvePreviewSpecDeps(resolver: CompositionResolver): PreviewSpecDeps {
  return {
    changes: resolver.getChangeRepository(),
    specs: resolver.getSpecRepositories(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
  }
}

/**
 * Constructs `PreviewSpec` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(deps: PreviewSpecDeps): PreviewSpec
/**
 * Constructs `PreviewSpec` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): PreviewSpec
/**
 * Constructs `PreviewSpec` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createPreviewSpec(
  depsOrConfig: PreviewSpecDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): PreviewSpec {
  const normalized = normalizeCompositionFactoryArgs(
    'createPreviewSpec',
    depsOrConfig,
    options,
    isPreviewSpecDeps,
  )
  return createPreviewSpecFromNormalized(normalized)
}

/**
 * Applies normalized `PreviewSpec` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createPreviewSpecFromNormalized(
  input: FactoryInput<PreviewSpecDeps, CompositionResolutionOptions>,
): PreviewSpec {
  if (input.kind === 'deps') {
    const { changes, specs, schemaProvider, parsers } = input.deps
    return new PreviewSpec(changes, specs, schemaProvider, parsers)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createPreviewSpec(resolvePreviewSpecDeps(resolver))
}

/**
 * Type guard for explicit `PreviewSpecDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isPreviewSpecDeps(value: PreviewSpecDeps | SpecdConfig): value is PreviewSpecDeps {
  return 'changes' in value && 'specs' in value && 'schemaProvider' in value && 'parsers' in value
}
