import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ExternalHookRunner } from '../../application/ports/external-hook-runner.js'
import { type HookRunner } from '../../application/ports/hook-runner.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { RunStepHooks } from '../../application/use-cases/run-step-hooks.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createRunStepHooks}.
 */
export interface RunStepHooksDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Archive repository used by the use case. */
  readonly archive: ArchiveRepository
  /** Hook runner used by the use case. */
  readonly hooks: HookRunner
  /** Schema provider used by the use case. */
  readonly schemaProvider: SchemaProvider
  /** Registered external hook runners used by the use case. */
  readonly externalHookRunners: ReadonlyMap<string, ExternalHookRunner>
}

/**
 * Resolves `RunStepHooks` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `RunStepHooks`
 */
export function resolveRunStepHooksDeps(resolver: CompositionResolver): RunStepHooksDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
    hooks: resolver.getHookRunner(),
    schemaProvider: resolver.getSchemaProvider(),
    externalHookRunners: resolver.registry.externalHookRunners,
  }
}

/**
 * Constructs `RunStepHooks` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(deps: RunStepHooksDeps): RunStepHooks
/**
 * Constructs `RunStepHooks` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): RunStepHooks
/**
 * Constructs `RunStepHooks` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createRunStepHooks(
  depsOrConfig: RunStepHooksDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): RunStepHooks {
  const normalized = normalizeCompositionFactoryArgs(
    'createRunStepHooks',
    depsOrConfig,
    options,
    isRunStepHooksDeps,
  )
  return createRunStepHooksFromNormalized(normalized)
}

/**
 * Applies normalized `RunStepHooks` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createRunStepHooksFromNormalized(
  input: FactoryInput<RunStepHooksDeps, CompositionResolutionOptions>,
): RunStepHooks {
  if (input.kind === 'deps') {
    const { changes, archive, hooks, externalHookRunners, schemaProvider } = input.deps
    return new RunStepHooks(changes, archive, hooks, externalHookRunners, schemaProvider)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createRunStepHooks(resolveRunStepHooksDeps(resolver))
}

/**
 * Type guard for explicit `RunStepHooksDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isRunStepHooksDeps(value: RunStepHooksDeps | SpecdConfig): value is RunStepHooksDeps {
  return (
    'changes' in value &&
    'archive' in value &&
    'hooks' in value &&
    'schemaProvider' in value &&
    'externalHookRunners' in value
  )
}
