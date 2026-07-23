import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { CountTasks } from '../../application/use-cases/count-tasks.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
/** Explicit dependencies for CountTasks. */
export interface CountTasksDeps {
  readonly changes: ChangeRepository
  readonly schemaProvider: SchemaProvider
}
/**
 * Resolves CountTasks dependencies.
 * @param resolver - Composition resolver.
 * @returns Resolved dependencies.
 */
export function resolveCountTasksDeps(resolver: CompositionResolver): CountTasksDeps {
  return { changes: resolver.getChangeRepository(), schemaProvider: resolver.getSchemaProvider() }
}
/**
 * Creates CountTasks from explicit dependencies.
 * @param deps - Explicit dependencies.
 * @returns Query.
 */
export function createCountTasks(deps: CountTasksDeps): CountTasks
/**
 * Creates CountTasks from project configuration.
 * @param config - Project configuration.
 * @param options - Composition options.
 * @returns Query.
 */
export function createCountTasks(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): CountTasks
/**
 * Creates CountTasks from explicit dependencies or project configuration.
 * @param depsOrConfig - Explicit dependencies or project configuration.
 * @param options - Composition options.
 * @returns Query.
 */
export function createCountTasks(
  depsOrConfig: CountTasksDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): CountTasks {
  return createCountTasksFromNormalized(
    normalizeCompositionFactoryArgs('createCountTasks', depsOrConfig, options, isCountTasksDeps),
  )
}

/**
 * Creates the query from normalized factory input.
 *
 * @param input - Normalized explicit dependencies or configuration.
 * @returns Query.
 */
function createCountTasksFromNormalized(
  input: FactoryInput<CountTasksDeps, CompositionResolutionOptions>,
): CountTasks {
  if (input.kind === 'deps') return new CountTasks(input.deps.changes, input.deps.schemaProvider)
  return createCountTasks(
    resolveCountTasksDeps(createCompositionResolver(input.config, input.options)),
  )
}

/**
 * Determines whether a factory input is an explicit dependency object.
 *
 * @param value - Candidate factory input.
 * @returns Whether the candidate contains CountTasks dependencies.
 */
function isCountTasksDeps(value: CountTasksDeps | SpecdConfig): value is CountTasksDeps {
  return 'changes' in value && 'schemaProvider' in value
}
