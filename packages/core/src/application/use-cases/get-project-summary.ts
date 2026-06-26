import { type ListArchived } from './list-archived.js'
import { type ListChanges } from './list-changes.js'
import { type ListDiscarded } from './list-discarded.js'
import { type ListDrafts } from './list-drafts.js'
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
  private readonly _listChanges: ListChanges
  private readonly _listDrafts: ListDrafts
  private readonly _listDiscarded: ListDiscarded
  private readonly _listArchived: ListArchived
  private readonly _listWorkspaces: ListWorkspaces

  /**
   * Creates a new `GetProjectSummary` use case instance.
   *
   * @param listChanges - Active change listing use case
   * @param listDrafts - Draft listing use case
   * @param listDiscarded - Discarded change listing use case
   * @param listArchived - Archived change listing use case
   * @param listWorkspaces - Workspace orchestration use case
   */
  constructor(
    listChanges: ListChanges,
    listDrafts: ListDrafts,
    listDiscarded: ListDiscarded,
    listArchived: ListArchived,
    listWorkspaces: ListWorkspaces,
  ) {
    this._listChanges = listChanges
    this._listDrafts = listDrafts
    this._listDiscarded = listDiscarded
    this._listArchived = listArchived
    this._listWorkspaces = listWorkspaces
  }

  /**
   * Executes the use case.
   *
   * @returns Count-only project summary aggregates
   */
  async execute(): Promise<GetProjectSummaryResult> {
    const [active, drafts, discarded, archived, workspaces] = await Promise.all([
      this._listChanges.execute(),
      this._listDrafts.execute(),
      this._listDiscarded.execute(),
      this._listArchived.execute(),
      this._listWorkspaces.execute(),
    ])

    const specCountEntries = await Promise.all(
      workspaces.map(async (ws) => [ws.name, await ws.specRepo.count()] as const),
    )

    const specsByWorkspace: Record<string, number> = {}
    for (const [name, count] of specCountEntries) {
      specsByWorkspace[name] = count
    }

    return {
      activeCount: active.length,
      draftCount: drafts.length,
      discardedCount: discarded.length,
      archivedCount: archived.meta.total,
      specsByWorkspace,
      workspaceCount: workspaces.length,
    }
  }
}
