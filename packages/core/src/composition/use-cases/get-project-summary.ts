import { GetProjectSummary } from '../../application/use-cases/get-project-summary.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { type ArchiveRepository } from '../../application/ports/archive-repository.js'
import { type CountTasks } from '../../application/use-cases/count-tasks.js'
import { type GetSpecsHealth } from '../../application/use-cases/get-specs-health.js'
import { type ListChanges } from '../../application/use-cases/list-changes.js'
import { type ListDrafts } from '../../application/use-cases/list-drafts.js'
import { type ListWorkspaces } from '../../application/use-cases/list-workspaces.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'
import { createCountTasks, resolveCountTasksDeps } from './count-tasks.js'
import { createGetSpecsHealth, resolveGetSpecsHealthDeps } from './get-specs-health.js'
import { createListChanges, resolveListChangesDeps } from './list-changes.js'
import { createListDrafts, resolveListDraftsDeps } from './list-drafts.js'

/**
 * Explicit dependencies for {@link createGetProjectSummary}.
 */
export interface GetProjectSummaryDeps {
  readonly changes: ChangeRepository
  readonly archive: ArchiveRepository
  readonly listWorkspaces: ListWorkspaces
  readonly listChanges: ListChanges
  readonly listDrafts: ListDrafts
  readonly countTasks: CountTasks
  readonly getSpecsHealth: GetSpecsHealth
}

/**
 * Resolves `GetProjectSummary` dependencies from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `GetProjectSummary`
 */
export function resolveGetProjectSummaryDeps(resolver: CompositionResolver): GetProjectSummaryDeps {
  return {
    changes: resolver.getChangeRepository(),
    archive: resolver.getArchiveRepository(),
    listWorkspaces: resolver.getListWorkspaces(),
    listChanges: createListChanges(resolveListChangesDeps(resolver)),
    listDrafts: createListDrafts(resolveListDraftsDeps(resolver)),
    countTasks: createCountTasks(resolveCountTasksDeps(resolver)),
    getSpecsHealth: createGetSpecsHealth(resolveGetSpecsHealthDeps(resolver)),
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
    const {
      changes,
      archive,
      listWorkspaces,
      listChanges,
      listDrafts,
      countTasks,
      getSpecsHealth,
    } = input.deps
    return new GetProjectSummary(
      changes,
      archive,
      listWorkspaces,
      listChanges,
      listDrafts,
      countTasks,
      getSpecsHealth,
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
    'changes' in value &&
    'archive' in value &&
    'listWorkspaces' in value &&
    'listChanges' in value &&
    'listDrafts' in value &&
    'countTasks' in value &&
    'getSpecsHealth' in value
  )
}
