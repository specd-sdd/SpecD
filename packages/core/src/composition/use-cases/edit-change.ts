import { type ActorResolver } from '../../application/ports/actor-resolver.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type SchemaProvider } from '../../application/ports/schema-provider.js'
import { EditChange } from '../../application/use-cases/edit-change.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createEditChange}.
 */
export interface EditChangeDeps {
  readonly changes: ChangeRepository
  readonly listWorkspaces: ListWorkspaces
  readonly actor: ActorResolver
  readonly schemaProvider: SchemaProvider
}

/**
 * Resolves `EditChange` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `EditChange`
 */
export function resolveEditChangeDeps(resolver: CompositionResolver): EditChangeDeps {
  return {
    changes: resolver.getChangeRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
    actor: resolver.getActorResolver(),
    schemaProvider: resolver.getSchemaProvider(),
  }
}

/**
 * Constructs `EditChange` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createEditChange(deps: EditChangeDeps): EditChange
/**
 * Constructs `EditChange` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): EditChange
/**
 * Constructs `EditChange` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createEditChange(
  depsOrConfig: EditChangeDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): EditChange {
  const normalized = normalizeCompositionFactoryArgs(
    'createEditChange',
    depsOrConfig,
    options,
    isEditChangeDeps,
  )
  return createEditChangeFromNormalized(normalized)
}

/**
 * Applies normalized `EditChange` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createEditChangeFromNormalized(
  input: FactoryInput<EditChangeDeps, CompositionResolutionOptions>,
): EditChange {
  if (input.kind === 'deps') {
    const { changes, listWorkspaces, actor, schemaProvider } = input.deps
    return new EditChange(changes, listWorkspaces, actor, schemaProvider)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createEditChange(resolveEditChangeDeps(resolver))
}

/**
 * Type guard for explicit `EditChangeDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isEditChangeDeps(value: EditChangeDeps | SpecdConfig): value is EditChangeDeps {
  return (
    'changes' in value && 'listWorkspaces' in value && 'actor' in value && 'schemaProvider' in value
  )
}
