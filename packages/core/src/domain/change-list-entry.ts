import { type ActorIdentity } from './entities/change.js'

/**
 * Shared required fields for change list rows returned by `ChangeRepository.list*`.
 *
 * Detail fields (history, artifacts, hashes, approvals) belong on get/status APIs.
 */
export interface ChangeListEntryBase {
  readonly name: string
  readonly createdAt: Date
  readonly state: string
  readonly specIds: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
  /** Present only when `includeDescription` was set on the list options. */
  readonly description?: string
}

/** Lightweight active-change list row. */
export type ActiveChangeListEntry = ChangeListEntryBase

/**
 * Lightweight drafted-change list row.
 */
export interface DraftedChangeListEntry extends ChangeListEntryBase {
  readonly draftedAt: Date
  readonly draftedBy: ActorIdentity
  /** Present only when `includeReason` was set on the list options. */
  readonly reason?: string
}

/**
 * Lightweight discarded-change list row.
 */
export interface DiscardedChangeListEntry extends ChangeListEntryBase {
  readonly discardedAt: Date
  readonly discardedBy: ActorIdentity
  /** Present only when `includeReason` was set on the list options. */
  readonly reason?: string
  /** Present only when `includeSupersededBy` was set on the list options. */
  readonly supersededBy?: string
}
