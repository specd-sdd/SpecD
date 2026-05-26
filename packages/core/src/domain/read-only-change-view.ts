import {
  Change,
  type ActorIdentity,
  type ChangeEvent,
  type DiscardedEvent,
} from './entities/change.js'
import { type ChangeArtifact } from './entities/change-artifact.js'
import { type ChangeState } from './value-objects/change-state.js'
import { InvalidChangeError } from './errors/invalid-change-error.js'

/**
 * Non-active change storage backing a {@link ReadOnlyChangeView}.
 * `archived` is reserved for when archived changes use the same read model.
 */
export type ReadOnlyChangeOrigin = 'draft' | 'discarded' | 'archived'

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

/**
 * @internal Single facade backing drafted and discarded views; no public unwrap.
 */
/* eslint-disable jsdoc/require-jsdoc -- getters mirror {@link Change}; public contract is on view interfaces */
class ReadOnlyChangeFacade implements ReadOnlyChangeView {
  private readonly _change: Change
  private readonly _discardedEvent: DiscardedEvent | undefined

  private constructor(change: Change, discardedEvent?: DiscardedEvent) {
    this._change = change
    this._discardedEvent = discardedEvent
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
