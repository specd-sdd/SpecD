import { type ChangeRepository } from '../ports/change-repository.js'
import { type ArchiveRepository } from '../ports/archive-repository.js'
import { type ListWorkspaces } from './list-workspaces.js'

/** Count-only aggregate of project-level change and spec totals. */
export interface GetProjectSummaryResult {
  readonly activeCount: number
  readonly draftCount: number
  readonly discardedCount: number
  readonly archivedCount: number
  readonly specsByWorkspace: Readonly<Record<string, number>>
  readonly workspaceCount: number
}

/**
 * Returns consolidated project counts without loading change entities,
 * spec metadata, graph statistics, or compiled context.
 */
export class GetProjectSummary {
  private readonly _changes: ChangeRepository
  private readonly _archive: ArchiveRepository
  private readonly _listWorkspaces: ListWorkspaces

  /**
   * Creates a new `GetProjectSummary` use case instance.
   *
   * @param changes - Change repository for active/draft/discarded counts
   * @param archive - Archive repository for archived counts
   * @param listWorkspaces - Workspace orchestration use case
   */
  constructor(
    changes: ChangeRepository,
    archive: ArchiveRepository,
    listWorkspaces: ListWorkspaces,
  ) {
    this._changes = changes
    this._archive = archive
    this._listWorkspaces = listWorkspaces
  }

  /**
   * Executes the use case.
   *
   * @returns Count-only project summary aggregates
   */
  async execute(): Promise<GetProjectSummaryResult> {
    const [activeCount, draftCount, discardedCount, archivedCount, workspaces] = await Promise.all([
      this._changes.count(),
      this._changes.countDrafts(),
      this._changes.countDiscarded(),
      this._archive.count(),
      this._listWorkspaces.execute(),
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
    }
  }
}
