import { type SpecListEntry, type SpecListOptions } from '../ports/spec-repository.js'
import { type ListMeta, type ListResult } from '../ports/repository.js'
import { type ListWorkspaces } from './list-workspaces.js'

export type { SpecListEntry }

/** Per-workspace slice of a multi-workspace spec list result. */
export interface ListSpecsWorkspaceSlice {
  readonly workspace: string
  readonly items: readonly SpecListEntry[]
  readonly meta: ListMeta
}

/** Merged list result across workspaces with per-workspace pagination metadata. */
export interface ListSpecsResult extends ListResult<SpecListEntry> {
  readonly byWorkspace: readonly ListSpecsWorkspaceSlice[]
}

/**
 * Use case that enumerates specs across configured workspaces by delegating
 * list pagination to each workspace {@link SpecRepository}.
 *
 * Workspace declaration order is preserved; items within each workspace remain
 * in the repository's canonical path order. Cross-workspace pagination is out
 * of scope — the same list options are forwarded to every workspace repository.
 */
export class ListSpecs {
  private readonly _listWorkspaces: ListWorkspaces

  /**
   * Creates a new `ListSpecs` use case instance.
   *
   * @param listWorkspaces - Workspace orchestration use case
   */
  constructor(listWorkspaces: ListWorkspaces) {
    this._listWorkspaces = listWorkspaces
  }

  /**
   * Executes the use case.
   *
   * @param options - Pagination, include projection, and workspace filter options
   * @returns Merged spec list entries with aggregate and per-workspace metadata
   */
  async execute(
    options?: SpecListOptions & { workspaces?: readonly string[] },
  ): Promise<ListSpecsResult> {
    const workspaces = await this._listWorkspaces.execute()
    const workspaceFilter =
      options?.workspaces !== undefined && options.workspaces.length > 0
        ? new Set(options.workspaces)
        : null

    const listOptions: SpecListOptions = {
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.page !== undefined ? { page: options.page } : {}),
      ...(options?.after !== undefined ? { after: options.after } : {}),
      ...(options?.includeSummary === true ? { includeSummary: true } : {}),
      ...(options?.includeMetadataStatus === true ? { includeMetadataStatus: true } : {}),
    }

    const byWorkspace: ListSpecsWorkspaceSlice[] = []
    const items: SpecListEntry[] = []
    let total = 0
    let count = 0
    let limit = 0

    for (const ws of workspaces) {
      if (workspaceFilter !== null && !workspaceFilter.has(ws.name)) continue

      const listed = await ws.specRepo.list(undefined, listOptions)
      byWorkspace.push({
        workspace: ws.name,
        items: listed.items,
        meta: listed.meta,
      })
      for (const entry of listed.items) {
        items.push(entry)
      }
      total += listed.meta.total
      count += listed.meta.count
      limit = listed.meta.limit
    }

    return {
      items,
      meta: {
        total,
        count,
        limit,
        ...(listOptions.page !== undefined ? { page: listOptions.page } : {}),
        ...(listOptions.after !== undefined ? { after: listOptions.after } : {}),
      },
      byWorkspace,
    }
  }
}
