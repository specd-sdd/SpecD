import {
  Change,
  type ActorIdentity,
  type ChangeEvent,
  type DiscardedEvent,
} from './entities/change.js'
import { type ChangeArtifact } from './entities/change-artifact.js'
import { type ChangeState } from './value-objects/change-state.js'
import { InvalidChangeError } from './errors/invalid-change-error.js'

/** Shared read-only fields for drafted and discarded display. */
export interface ReadOnlyChangeView {
  readonly name: string
  readonly createdAt: Date
  readonly description: string | undefined
  readonly state: ChangeState
  readonly specIds: readonly string[]
  readonly workspaces: readonly string[]
  readonly schemaName: string
  readonly schemaVersion: number
  readonly artifacts: ReadonlyMap<string, ChangeArtifact>
  readonly history: readonly ChangeEvent[]
}

/** Read model for a change stored under `drafts/`. */
export interface DraftedChangeView extends ReadOnlyChangeView {
  readonly isDrafted: true
}

/** Read model for a change stored under `discarded/`. */
export interface DiscardedChangeView extends ReadOnlyChangeView {
  readonly discardReason: string
  readonly discardedAt: Date
  readonly discardedBy: ActorIdentity
  readonly supersededBy?: readonly string[]
}

/** Read model for a change stored under the archive. */
export interface ArchivedChange extends ReadOnlyChangeView {
  readonly archivedName: string
  readonly archivedAt: Date
  readonly archivedBy?: ActorIdentity
}

/** Archive metadata attached to an archived read model. */
export interface ArchivedChangeMeta {
  readonly archivedName: string
  readonly archivedAt: Date
  readonly archivedBy?: ActorIdentity
}

/**
 * @internal Single facade backing drafted and discarded views; no public unwrap.
 */
/* eslint-disable jsdoc/require-jsdoc -- getters mirror {@link Change}; public contract is on view interfaces */
class ReadOnlyChangeFacade implements ReadOnlyChangeView {
  private readonly _change: Change
  private readonly _discardedEvent: DiscardedEvent | undefined
  private readonly _archiveMeta: ArchivedChangeMeta | undefined

  private constructor(
    change: Change,
    discardedEvent?: DiscardedEvent,
    archiveMeta?: ArchivedChangeMeta,
  ) {
    this._change = change
    this._discardedEvent = discardedEvent
    this._archiveMeta = archiveMeta
  }

  get name(): string {
    return this._change.name
  }

  get createdAt(): Date {
    return this._change.createdAt
  }

  get description(): string | undefined {
    return this._change.description
  }

  get state(): ChangeState {
    return this._change.state
  }

  get specIds(): readonly string[] {
    return this._change.specIds
  }

  get workspaces(): readonly string[] {
    return this._change.workspaces
  }

  get schemaName(): string {
    return this._change.schemaName
  }

  get schemaVersion(): number {
    return this._change.schemaVersion
  }

  get artifacts(): ReadonlyMap<string, ChangeArtifact> {
    return this._change.artifacts
  }

  get history(): readonly ChangeEvent[] {
    return this._change.history
  }

  get isDrafted(): true {
    if (this._discardedEvent !== undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not a drafted view`)
    }
    return true
  }

  get discardReason(): string {
    if (this._discardedEvent === undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not a discarded view`)
    }
    return this._discardedEvent.reason
  }

  get discardedAt(): Date {
    if (this._discardedEvent === undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not a discarded view`)
    }
    return this._discardedEvent.at
  }

  get discardedBy(): ActorIdentity {
    if (this._discardedEvent === undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not a discarded view`)
    }
    return this._discardedEvent.by
  }

  get supersededBy(): readonly string[] | undefined {
    if (this._discardedEvent === undefined) {
      return undefined
    }
    return this._discardedEvent.supersededBy !== undefined
      ? [...this._discardedEvent.supersededBy]
      : undefined
  }

  get archivedName(): string {
    if (this._archiveMeta === undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not an archived view`)
    }
    return this._archiveMeta.archivedName
  }

  get archivedAt(): Date {
    if (this._archiveMeta === undefined) {
      throw new InvalidChangeError(`change '${this._change.name}' is not an archived view`)
    }
    return new Date(this._archiveMeta.archivedAt.getTime())
  }

  get archivedBy(): ActorIdentity | undefined {
    return this._archiveMeta?.archivedBy
  }

  /**
   * Builds a facade for a drafted change.
   *
   * @param change - Persisted change loaded from `drafts/`
   * @returns Facade for drafted read paths
   */
  static forDrafted(change: Change): ReadOnlyChangeFacade {
    return new ReadOnlyChangeFacade(change)
  }

  /**
   * Builds a facade for a discarded change.
   *
   * @param change - Persisted change loaded from `discarded/`
   * @param discardedEvent - Terminal discarded history event
   * @returns Facade for discarded read paths
   */
  static forDiscarded(change: Change, discardedEvent: DiscardedEvent): ReadOnlyChangeFacade {
    return new ReadOnlyChangeFacade(change, discardedEvent)
  }

  /**
   * Builds a facade for an archived change.
   *
   * @param change - Persisted change loaded from the archive manifest
   * @param meta - Archive directory metadata
   * @returns Facade for archived read paths
   */
  static forArchived(change: Change, meta: ArchivedChangeMeta): ReadOnlyChangeFacade {
    return new ReadOnlyChangeFacade(change, undefined, meta)
  }
}
/* eslint-enable jsdoc/require-jsdoc */

/**
 * Maps a drafted `Change` to a {@link DraftedChangeView}.
 *
 * @param change - Domain change loaded from drafted storage
 * @returns Read-only drafted view
 * @throws {InvalidChangeError} When the change is not drafted
 */
export function toDraftedChangeView(change: Change): DraftedChangeView {
  if (!change.isDrafted) {
    throw new InvalidChangeError(`change '${change.name}' is not drafted`)
  }
  if (latestEventType(change) === 'discarded') {
    throw new InvalidChangeError(`change '${change.name}' is discarded, not drafted`)
  }
  return ReadOnlyChangeFacade.forDrafted(change) as DraftedChangeView
}

/**
 * Maps a discarded `Change` to a {@link DiscardedChangeView}.
 *
 * @param change - Domain change loaded from discarded storage
 * @returns Read-only discarded view
 * @throws {InvalidChangeError} When the change is not discarded
 */
export function toDiscardedChangeView(change: Change): DiscardedChangeView {
  const discardedEvent = findDiscardedEvent(change)
  if (discardedEvent === undefined) {
    throw new InvalidChangeError(`change '${change.name}' is not discarded`)
  }
  return ReadOnlyChangeFacade.forDiscarded(change, discardedEvent) as DiscardedChangeView
}

/**
 * Maps a manifest-loaded `Change` to an {@link ArchivedChange}.
 *
 * @param change - Domain change loaded from archived storage
 * @param meta - Archive directory metadata from the manifest
 * @returns Read-only archived view
 */
export function toArchivedChangeView(change: Change, meta: ArchivedChangeMeta): ArchivedChange {
  return ReadOnlyChangeFacade.forArchived(change, meta) as ArchivedChange
}

/**
 * Finds the latest discarded event in a change history.
 *
 * @param change - Change whose history is inspected
 * @returns The latest `discarded` event, if any
 */
function findDiscardedEvent(change: Change): DiscardedEvent | undefined {
  for (let i = change.history.length - 1; i >= 0; i--) {
    const evt = change.history[i]
    if (evt?.type === 'discarded') return evt
  }
  return undefined
}

/**
 * Returns the type of the latest history event.
 *
 * @param change - Change whose history is inspected
 * @returns The type of the latest history event, if any
 */
function latestEventType(change: Change): ChangeEvent['type'] | undefined {
  const last = change.history[change.history.length - 1]
  return last?.type
}
