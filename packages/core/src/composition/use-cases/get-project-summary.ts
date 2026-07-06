import { GetProjectSummary } from '../../application/use-cases/get-project-summary.js'
import { type ListArchived } from '../../application/use-cases/list-archived.js'
import { type ListChanges } from '../../application/use-cases/list-changes.js'
import { type ListDiscarded } from '../../application/use-cases/list-discarded.js'
import { type ListDrafts } from '../../application/use-cases/list-drafts.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createListArchived } from './list-archived.js'
import { createListChanges } from './list-changes.js'
import { createListDiscarded } from './list-discarded.js'
import { createListDrafts } from './list-drafts.js'

/**
 * Explicit dependencies for {@link createGetProjectSummary}.
 */
export interface GetProjectSummaryDeps {
  readonly listChanges: ListChanges
  readonly listDrafts: ListDrafts
  readonly listDiscarded: ListDiscarded
  readonly listArchived: ListArchived
  readonly listWorkspaces: ListWorkspaces
}

/**
 * Resolves `GetProjectSummary` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetProjectSummary`
 */
export function resolveGetProjectSummaryDeps(resolver: CompositionResolver): GetProjectSummaryDeps {
  return {
    listChanges: createListChanges({ changes: resolver.getChangeRepository() }),
    listDrafts: createListDrafts({ changes: resolver.getChangeRepository() }),
    listDiscarded: createListDiscarded({ changes: resolver.getChangeRepository() }),
    listArchived: createListArchived({ archive: resolver.getArchiveRepository() }),
    listWorkspaces: resolver.getListWorkspaces(),
  }
}

/**
 * Constructs `GetProjectSummary` from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createGetProjectSummary(deps: GetProjectSummaryDeps): GetProjectSummary
/**
 * Constructs `GetProjectSummary` from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectSummary(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectSummary
/**
 * Constructs `GetProjectSummary` from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createGetProjectSummary(
  depsOrConfig: GetProjectSummaryDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): GetProjectSummary {
  const normalized = normalizeCompositionFactoryArgs(
    'createGetProjectSummary',
    depsOrConfig,
    options,
    isGetProjectSummaryDeps,
  )
  return createGetProjectSummaryFromNormalized(normalized)
}

/**
 * Applies normalized `GetProjectSummary` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createGetProjectSummaryFromNormalized(
  input: FactoryInput<GetProjectSummaryDeps, CompositionResolutionOptions>,
): GetProjectSummary {
  if (input.kind === 'deps') {
    const { listChanges, listDrafts, listDiscarded, listArchived, listWorkspaces } = input.deps
    return new GetProjectSummary(
      listChanges,
      listDrafts,
      listDiscarded,
      listArchived,
      listWorkspaces,
    )
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createGetProjectSummary(resolveGetProjectSummaryDeps(resolver))
}

/**
 * Type guard for explicit `GetProjectSummaryDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isGetProjectSummaryDeps(
  value: GetProjectSummaryDeps | SpecdConfig,
): value is GetProjectSummaryDeps {
  return (
    'listChanges' in value &&
    'listDrafts' in value &&
    'listDiscarded' in value &&
    'listArchived' in value &&
    'listWorkspaces' in value
  )
}
