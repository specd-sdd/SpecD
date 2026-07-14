import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { type TemplateExpander } from '../../application/template-expander.js'
import { GetHookInstructions } from '../../application/use-cases/get-hook-instructions.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createGetHookInstructions}.
 */
export interface GetHookInstructionsDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Archive repository used by the use case. */
  readonly archive: ArchiveRepository
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Template expander used by the use case. */
  readonly templateExpander: TemplateExpander
}

/**
 * Resolves `GetHookInstructions` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetHookInstructions`
 */
export function resolveGetHookInstructionsDeps(
  resolver: CompositionResolver,
): GetHookInstructionsDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
    schemaProvider: resolver.getSchemaProvider(),
    templateExpander: resolver.getTemplateExpander(),
  }
}

/**
 * Constructs `GetHookInstructions` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetHookInstructions(deps: GetHookInstructionsDeps): GetHookInstructions
/**
 * Constructs `GetHookInstructions` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetHookInstructions(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetHookInstructions
/**
 * Constructs `GetHookInstructions` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetHookInstructions(
  depsOrConfig: GetHookInstructionsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetHookInstructions {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetHookInstructions',
    depsOrConfig,
    options,
    isGetHookInstructionsDeps,
  )
  return createGetHookInstructionsFromNormalized(normalized)
}

/**
 * Applies normalized `GetHookInstructions` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetHookInstructionsFromNormalized(
  input: FactoryInput<GetHookInstructionsDeps, CompositionResolutionOptions>,
): GetHookInstructions {
  if (input.kind === 'deps') {
    const { changes, archive, schemaProvider, templateExpander } = input.deps
    return new GetHookInstructions(changes, archive, schemaProvider, templateExpander)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetHookInstructions(resolveGetHookInstructionsDeps(resolver))
}

/**
 * Type guard for explicit `GetHookInstructionsDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetHookInstructionsDeps(
  value: GetHookInstructionsDeps | SpecdConfig,
): value is GetHookInstructionsDeps {
  return (
    'changes' in value &&
    'archive' in value &&
    'schemaProvider' in value &&
    'templateExpander' in value
  )
}
