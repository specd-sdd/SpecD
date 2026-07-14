import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type SpecRepository } from '../../application/ports/spec-repository.js'
import { type TemplateExpander } from '../../application/template-expander.js'
import { GetArtifactInstruction } from '../../application/use-cases/get-artifact-instruction.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import { type LifecycleEngine } from '../../domain/services/lifecycle-engine.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetArtifactInstruction}.
 */
export interface GetArtifactInstructionDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Spec repositories keyed by workspace. */
  readonly specs: ReadonlyMap<string, SpecRepository>
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Artifact parser registry used by the use case. */
  readonly parsers: ArtifactParserRegistry
  /** Template expander used by the use case. */
  readonly templateExpander: TemplateExpander
  /** Lifecycle engine used by the use case. */
  readonly lifecycle: LifecycleEngine
}

/**
 * Resolves `GetArtifactInstruction` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetArtifactInstruction`
 */
export function resolveGetArtifactInstructionDeps(
  resolver: CompositionResolver,
): GetArtifactInstructionDeps {
  return {
    changes: resolver.getChangeRepository(),
    specs: resolver.getSpecRepositories(),
    schemaProvider: resolver.getSchemaProvider(),
    parsers: resolver.getArtifactParserRegistry(),
    templateExpander: resolver.getTemplateExpander(),
    lifecycle: resolver.getLifecycleEngine(),
  }
}

/**
 * Constructs `GetArtifactInstruction` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  deps: GetArtifactInstructionDeps,
): GetArtifactInstruction
/**
 * Constructs `GetArtifactInstruction` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetArtifactInstruction
/**
 * Constructs `GetArtifactInstruction` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetArtifactInstruction(
  depsOrConfig: GetArtifactInstructionDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetArtifactInstruction {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetArtifactInstruction',
    depsOrConfig,
    options,
    isGetArtifactInstructionDeps,
  )
  return createGetArtifactInstructionFromNormalized(normalized)
}

/**
 * Applies normalized `GetArtifactInstruction` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetArtifactInstructionFromNormalized(
  input: FactoryInput<GetArtifactInstructionDeps, CompositionResolutionOptions>,
): GetArtifactInstruction {
  if (input.kind === 'deps') {
    const { changes, specs, schemaProvider, parsers, templateExpander, lifecycle } = input.deps
    return new GetArtifactInstruction(
      changes,
      specs,
      schemaProvider,
      parsers,
      templateExpander,
      lifecycle,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetArtifactInstruction(resolveGetArtifactInstructionDeps(resolver))
}

/**
 * Type guard for explicit `GetArtifactInstructionDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetArtifactInstructionDeps(
  value: GetArtifactInstructionDeps | SpecdConfig,
): value is GetArtifactInstructionDeps {
  return (
    'changes' in value &&
    'specs' in value &&
    'schemaProvider' in value &&
    'parsers' in value &&
    'templateExpander' in value &&
    'lifecycle' in value
  )
}
