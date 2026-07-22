import {
  type Change,
  type ChangeEvent,
  type DiscardedEvent,
  type DraftedEvent,
} from '../../domain/entities/change.js'
import {
  type ActiveChangeListEntry,
  type DiscardedChangeListEntry,
  type DraftedChangeListEntry,
} from '../../domain/change-list-entry.js'
import {
  type ActiveChangeListOptions,
  type DiscardedChangeListOptions,
  type DraftedChangeListOptions,
} from '../../application/ports/change-repository.js'
import { type ListResult } from '../../application/ports/repository.js'
import { paginateList } from './list-pagination.js'

/**
 * Finds the most recent `drafted` event in a change history.
 *
 * @param history - Append-only change history
 * @returns The last drafted event, or `undefined` if none
 */
function findDraftedEvent(history: readonly ChangeEvent[]): DraftedEvent | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i]
    if (event?.type === 'drafted') return event
  }
  return undefined
}

/**
 * Finds the terminal `discarded` event when the change is discarded.
 *
 * @param history - Append-only change history
 * @returns The last discarded event, or `undefined` if the change is not discarded
 */
function findDiscardedEvent(history: readonly ChangeEvent[]): DiscardedEvent | undefined {
  const last = history[history.length - 1]
  return last?.type === 'discarded' ? last : undefined
}

/**
 * Projects an active change to a list entry.
 *
 * @param change - Active persisted change
 * @param options - Include projection options
 * @returns Lightweight active list row
 */
export function toActiveChangeListEntry(
  change: Change,
  options?: ActiveChangeListOptions,
): ActiveChangeListEntry {
  return {
    name: change.name,
    createdAt: change.createdAt,
    state: change.state,
    specIds: [...change.specIds],
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    ...(options?.includeDescription && change.description !== undefined
      ? { description: change.description }
      : {}),
  }
}

/**
 * Projects a drafted change to a list entry.
 *
 * @param change - Drafted persisted change
 * @param options - Include projection options
 * @returns Lightweight drafted list row
 */
export function toDraftedChangeListEntry(
  change: Change,
  options?: DraftedChangeListOptions,
): DraftedChangeListEntry | null {
  const drafted = findDraftedEvent(change.history)
  if (drafted === undefined) return null
  return {
    name: change.name,
    createdAt: change.createdAt,
    state: change.state,
    specIds: [...change.specIds],
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    draftedAt: drafted.at,
    draftedBy: drafted.by,
    ...(options?.includeDescription && change.description !== undefined
      ? { description: change.description }
      : {}),
    ...(options?.includeReason && drafted.reason !== undefined ? { reason: drafted.reason } : {}),
  }
}

/**
 * Projects a discarded change to a list entry.
 *
 * @param change - Discarded persisted change
 * @param options - Include projection options
 * @returns Lightweight discarded list row
 */
export function toDiscardedChangeListEntry(
  change: Change,
  options?: DiscardedChangeListOptions,
): DiscardedChangeListEntry | null {
  const discarded = findDiscardedEvent(change.history)
  if (discarded === undefined) return null
  return {
    name: change.name,
    createdAt: change.createdAt,
    state: change.state,
    specIds: [...change.specIds],
    schemaName: change.schemaName,
    schemaVersion: change.schemaVersion,
    discardedAt: discarded.at,
    discardedBy: discarded.by,
    ...(options?.includeDescription && change.description !== undefined
      ? { description: change.description }
      : {}),
    ...(options?.includeReason ? { reason: discarded.reason } : {}),
    ...(options?.includeSupersededBy && discarded.supersededBy !== undefined
      ? { supersededBy: discarded.supersededBy[0] }
      : {}),
  }
}

/**
 * Projects a fully-populated active entry down to the fields requested by
 * `options`.
 *
 * The fs-cache index stores the full payload (all optional fields present
 * when available); this strips fields the caller did not opt into so no
 * extra I/O is ever needed to honor include flags.
 *
 * @param entry - Full stored active entry
 * @param options - Include projection options
 * @returns The projected entry
 */
export function projectActiveInclude(
  entry: ActiveChangeListEntry,
  options?: ActiveChangeListOptions,
): ActiveChangeListEntry {
  const { description, ...rest } = entry
  return {
    ...rest,
    ...(options?.includeDescription && description !== undefined ? { description } : {}),
  }
}

/**
 * Projects a fully-populated drafted entry down to the fields requested by
 * `options`.
 *
 * @param entry - Full stored drafted entry
 * @param options - Include projection options
 * @returns The projected entry
 */
export function projectDraftedInclude(
  entry: DraftedChangeListEntry,
  options?: DraftedChangeListOptions,
): DraftedChangeListEntry {
  const { description, reason, ...rest } = entry
  return {
    ...rest,
    ...(options?.includeDescription && description !== undefined ? { description } : {}),
    ...(options?.includeReason && reason !== undefined ? { reason } : {}),
  }
}

/**
 * Projects a fully-populated discarded entry down to the fields requested by
 * `options`.
 *
 * @param entry - Full stored discarded entry
 * @param options - Include projection options
 * @returns The projected entry
 */
export function projectDiscardedInclude(
  entry: DiscardedChangeListEntry,
  options?: DiscardedChangeListOptions,
): DiscardedChangeListEntry {
  const { description, reason, supersededBy, ...rest } = entry
  return {
    ...rest,
    ...(options?.includeDescription && description !== undefined ? { description } : {}),
    ...(options?.includeReason && reason !== undefined ? { reason } : {}),
    ...(options?.includeSupersededBy && supersededBy !== undefined ? { supersededBy } : {}),
  }
}

/**
 * Paginates active change list entries sorted by `createdAt` ascending.
 *
 * @param entries - All active entries
 * @param options - Pagination options
 * @returns Paginated result
 */
export function paginateActiveChanges(
  entries: readonly ActiveChangeListEntry[],
  options?: ActiveChangeListOptions,
): ListResult<ActiveChangeListEntry> {
  const sorted = [...entries].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name),
  )
  return paginateList(sorted, options, (item) => ({
    key: item.createdAt.toISOString(),
    id: item.name,
  }))
}

/**
 * Paginates drafted change list entries sorted by `draftedAt` descending.
 *
 * @param entries - All drafted entries
 * @param options - Pagination options
 * @returns Paginated result
 */
export function paginateDraftedChanges(
  entries: readonly DraftedChangeListEntry[],
  options?: DraftedChangeListOptions,
): ListResult<DraftedChangeListEntry> {
  const sorted = [...entries].sort(
    (a, b) => b.draftedAt.getTime() - a.draftedAt.getTime() || a.name.localeCompare(b.name),
  )
  return paginateList(sorted, options, (item) => ({
    key: item.draftedAt.toISOString(),
    id: item.name,
  }))
}

/**
 * Paginates discarded change list entries sorted by `discardedAt` descending.
 *
 * @param entries - All discarded entries
 * @param options - Pagination options
 * @returns Paginated result
 */
export function paginateDiscardedChanges(
  entries: readonly DiscardedChangeListEntry[],
  options?: DiscardedChangeListOptions,
): ListResult<DiscardedChangeListEntry> {
  const sorted = [...entries].sort(
    (a, b) => b.discardedAt.getTime() - a.discardedAt.getTime() || a.name.localeCompare(b.name),
  )
  return paginateList(sorted, options, (item) => ({
    key: item.discardedAt.toISOString(),
    id: item.name,
  }))
}
