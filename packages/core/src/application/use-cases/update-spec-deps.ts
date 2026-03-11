import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'

/** Input for the {@link UpdateSpecDeps} use case. */
export interface UpdateSpecDepsInput {
  /** The change name. */
  readonly name: string
  /** The spec whose dependencies are being updated (must be in `change.specIds`). */
  readonly specId: string
  /** Dependency spec IDs to add (merged with existing). Mutually exclusive with `set`. */
  readonly add?: readonly string[]
  /** Dependency spec IDs to remove. Mutually exclusive with `set`. */
  readonly remove?: readonly string[]
  /** Replace all dependencies for this spec. Mutually exclusive with `add`/`remove`. */
  readonly set?: readonly string[]
}

/** Result returned by a successful {@link UpdateSpecDeps} execution. */
export interface UpdateSpecDepsResult {
  /** The spec ID whose dependencies were updated. */
  readonly specId: string
  /** The resulting dependency list after the update. */
  readonly dependsOn: readonly string[]
}

/**
 * Updates the declared `dependsOn` dependencies for a single spec within a change.
 *
 * Dependencies are stored in `change.specDependsOn` and used by `CompileContext`
 * as the highest-priority source for `dependsOn` resolution.
 */
export class UpdateSpecDeps {
  private readonly _changes: ChangeRepository

  /**
   * Creates a new `UpdateSpecDeps` use case instance.
   *
   * @param changes - Repository for loading and saving changes
   */
  constructor(changes: ChangeRepository) {
    this._changes = changes
  }

  /**
   * Executes the dependency update.
   *
   * @param input - Update parameters
   * @returns The resulting dependency list for the spec
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {Error} If `specId` is not in `change.specIds`, or if `set` is used with `add`/`remove`,
   *   or if a `remove` value is not in current deps, or if no operation is specified
   */
  async execute(input: UpdateSpecDepsInput): Promise<UpdateSpecDepsResult> {
    const change = await this._changes.get(input.name)
    if (change === null) throw new ChangeNotFoundError(input.name)

    // Validate specId is in the change
    if (!change.specIds.includes(input.specId)) {
      throw new Error(
        `spec '${input.specId}' is not in change '${input.name}' — specIds: [${change.specIds.join(', ')}]`,
      )
    }

    // Validate mutual exclusivity
    if (input.set !== undefined && (input.add !== undefined || input.remove !== undefined)) {
      throw new Error('--set is mutually exclusive with --add and --remove')
    }

    if (input.set === undefined && input.add === undefined && input.remove === undefined) {
      throw new Error('at least one of --add, --remove, or --set must be provided')
    }

    // Validate dep spec ID formats
    const validateDepIds = (ids: readonly string[]): void => {
      for (const id of ids) {
        parseSpecId(id) // Throws on invalid format — actually parseSpecId doesn't throw, it's lenient
      }
    }

    let result: string[]

    if (input.set !== undefined) {
      validateDepIds(input.set)
      result = [...input.set]
    } else {
      const current = [...(change.specDependsOn.get(input.specId) ?? [])]

      if (input.remove !== undefined) {
        for (const id of input.remove) {
          const idx = current.indexOf(id)
          if (idx === -1) {
            throw new Error(`dependency '${id}' not found in current deps for '${input.specId}'`)
          }
          current.splice(idx, 1)
        }
      }

      if (input.add !== undefined) {
        validateDepIds(input.add)
        for (const id of input.add) {
          if (!current.includes(id)) {
            current.push(id)
          }
        }
      }

      result = current
    }

    change.setSpecDependsOn(input.specId, result)
    await this._changes.save(change)

    return { specId: input.specId, dependsOn: result }
  }
}
