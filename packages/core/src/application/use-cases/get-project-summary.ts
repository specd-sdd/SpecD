import { type DraftedChangeView } from '../../domain/read-only-change-view.js'
import { type Change } from '../../domain/entities/change.js'
import {
  type ActiveChangeListEntry,
  type DraftedChangeListEntry,
} from '../../domain/change-list-entry.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type CountTasks } from './count-tasks.js'
import { type GetSpecsHealth, type GetSpecsHealthResult } from './get-specs-health.js'
import { type ListChanges } from './list-changes.js'
import { type ListDrafts } from './list-drafts.js'
import { type ListWorkspaces } from './list-workspaces.js'

/** Opt-in enrichment switches for {@link GetProjectSummary.execute}. */
export interface GetProjectSummaryInput {
  readonly includeChanges?: boolean
  readonly includeSpecsHealth?: boolean
}

/** Lightweight listing row for active or drafted changes. */
export interface ProjectChangeSummaryEntry {
  readonly name: string
  readonly state: string
  readonly tasks: {
    readonly incomplete: number
    readonly total: number
  }
}

/** Count-only aggregate of project-level change and spec totals with optional enrichment. */
export interface GetProjectSummaryResult {
  readonly activeCount: number
  readonly draftCount: number
  readonly discardedCount: number
  readonly archivedCount: number
  readonly specsByWorkspace: Readonly<Record<string, number>>
  readonly workspaceCount: number
  readonly active?: readonly ProjectChangeSummaryEntry[]
  readonly drafts?: readonly ProjectChangeSummaryEntry[]
  readonly specsHealth?: GetSpecsHealthResult
}

/**
 * Returns consolidated project counts without loading change entities,
 * spec metadata, graph statistics, or compiled context unless enrichment
 * flags request optional listings or specs health.
 */
export class GetProjectSummary {
  private readonly _changes: ChangeRepository
  private readonly _archive: ArchiveRepository
  private readonly _listWorkspaces: ListWorkspaces
  private readonly _listChanges: ListChanges
  private readonly _listDrafts: ListDrafts
  private readonly _countTasks: CountTasks
  private readonly _getSpecsHealth: GetSpecsHealth

  /**
   * Creates a new `GetProjectSummary` use case instance.
   *
   * @param changes - Change repository for active/draft/discarded counts
   * @param archive - Archive repository for archived counts
   * @param listWorkspaces - Workspace orchestration use case
   * @param listChanges - Active change listing use case
   * @param listDrafts - Draft change listing use case
   * @param countTasks - Task completion counting use case
   * @param getSpecsHealth - Specs health aggregation use case
   */
  constructor(
    changes: ChangeRepository,
    archive: ArchiveRepository,
    listWorkspaces: ListWorkspaces,
    listChanges: ListChanges,
    listDrafts: ListDrafts,
    countTasks: CountTasks,
    getSpecsHealth: GetSpecsHealth,
  ) {
    this._changes = changes
    this._archive = archive
    this._listWorkspaces = listWorkspaces
    this._listChanges = listChanges
    this._listDrafts = listDrafts
    this._countTasks = countTasks
    this._getSpecsHealth = getSpecsHealth
  }

  /**
   * Executes the use case.
   *
   * @param input - Optional enrichment flags
   * @returns Count-only project summary aggregates, with optional enrichments
   */
  async execute(input?: GetProjectSummaryInput): Promise<GetProjectSummaryResult> {
    const includeChanges = input?.includeChanges === true
    const includeSpecsHealth = input?.includeSpecsHealth === true

    const [
      activeCount,
      draftCount,
      discardedCount,
      archivedCount,
      workspaces,
      changeListings,
      specsHealth,
    ] = await Promise.all([
      this._changes.count(),
      this._changes.countDrafts(),
      this._changes.countDiscarded(),
      this._archive.count(),
      this._listWorkspaces.execute(),
      includeChanges ? this._buildChangeListings() : Promise.resolve(undefined),
      includeSpecsHealth ? this._getSpecsHealth.execute({}) : Promise.resolve(undefined),
    ])

    const specCountEntries = await Promise.all(
      workspaces.map(async (ws) => [ws.name, await ws.specRepo.count()] as const),
    )

    const specsByWorkspace: Record<string, number> = {}
    for (const [name, specCount] of specCountEntries) {
      specsByWorkspace[name] = specCount
    }

    return {
      activeCount,
      draftCount,
      discardedCount,
      archivedCount,
      specsByWorkspace,
      workspaceCount: workspaces.length,
      ...(includeChanges && changeListings !== undefined
        ? { active: changeListings.active, drafts: changeListings.drafts }
        : {}),
      ...(includeSpecsHealth && specsHealth !== undefined ? { specsHealth } : {}),
    }
  }

  /**
   * Builds active and draft listing rows with per-change task totals.
   *
   * @returns Listing arrays in repository list order
   */
  private async _buildChangeListings(): Promise<{
    readonly active: readonly ProjectChangeSummaryEntry[]
    readonly drafts: readonly ProjectChangeSummaryEntry[]
  }> {
    const [activeList, draftList] = await Promise.all([
      this._listChanges.execute(),
      this._listDrafts.execute(),
    ])

    const [active, drafts] = await Promise.all([
      Promise.all(activeList.items.map((entry) => this._buildActiveEntry(entry))),
      Promise.all(draftList.items.map((entry) => this._buildDraftEntry(entry))),
    ])

    return { active, drafts }
  }

  /**
   * Projects one active change list row with task counts.
   *
   * @param entry - Active list row
   * @returns Summary listing entry
   */
  private async _buildActiveEntry(
    entry: ActiveChangeListEntry,
  ): Promise<ProjectChangeSummaryEntry> {
    const change = await this._changes.get(entry.name)
    const tasks =
      change !== null
        ? await this._countTasks.execute({ change })
        : { total: { incomplete: 0, total: 0 } }

    return {
      name: entry.name,
      state: entry.state,
      tasks: { incomplete: tasks.total.incomplete, total: tasks.total.total },
    }
  }

  /**
   * Projects one drafted change list row with task counts.
   *
   * @param entry - Draft list row
   * @returns Summary listing entry
   */
  private async _buildDraftEntry(
    entry: DraftedChangeListEntry,
  ): Promise<ProjectChangeSummaryEntry> {
    const draftView = await this._changes.getDraft(entry.name)
    const tasks =
      draftView !== null
        ? await this._countTasks.execute({
            change: asChangeForTaskCounting(draftView),
          })
        : { total: { incomplete: 0, total: 0 } }

    return {
      name: entry.name,
      state: entry.state,
      tasks: { incomplete: tasks.total.incomplete, total: tasks.total.total },
    }
  }
}

/**
 * Adapts a drafted read model for {@link CountTasks}, which needs `name`,
 * `artifacts`, and `getArtifact` for repository artifact resolution.
 *
 * @param view - Drafted change read model
 * @returns Minimal change surface for task counting
 */
function asChangeForTaskCounting(view: DraftedChangeView): Change {
  return {
    name: view.name,
    artifacts: view.artifacts,
    getArtifact: (type: string) => view.artifacts.get(type) ?? null,
  } as Change
}
