import { type ChangeRepository } from '../ports/change-repository.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { InvalidInputError } from '../../domain/errors/index.js'
import { applyDependsOnMutation } from './_shared/apply-depends-on-mutation.js'

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
  /** Remove all dependencies for this spec. Mutually exclusive with `add`/`remove`/`set`. */
  readonly clear?: boolean
}

/** Result returned by a successful {@link UpdateSpecDeps} execution. */
export interface UpdateSpecDepsResult {
  /** The fully-qualified spec ID whose dependencies were updated. */
  readonly specId: string
  /** The resulting dependency list after the update. */
  readonly dependsOn: readonly string[]
}

/**
 * Normalizes a remove entry: valid IDs become fully qualified; invalid IDs are kept as given.
 *
 * @param id - Dependency ID to normalize for removal
 * @param workspaces - Configured workspaces for validation
 * @returns Qualified ID when valid, otherwise the original string
 */
function tryNormalizeDepId(
  id: string,
  workspaces: Iterable<string | { readonly name: string }>,
): string {
  try {
    return parseSpecId(id, { workspaces }).specId
  } catch {
    return id
  }
}

/**
 * Updates the declared `dependsOn` dependencies for a single spec within a change.
 *
 * Dependencies are stored in `change.specDependsOn` and used by `CompileContext`
 * as the highest-priority source for `dependsOn` resolution.
 */
export class UpdateSpecDeps {
  private readonly _changes: ChangeRepository
  private readonly _workspaces: readonly (string | { readonly name: string })[]

  /**
   * Creates a new `UpdateSpecDeps` use case instance.
   *
   * @param changes - Repository for loading and saving changes
   * @param workspaces - Configured workspaces used to validate and normalize IDs
   */
  constructor(changes: ChangeRepository, workspaces: Iterable<string | { readonly name: string }>) {
    this._changes = changes
    this._workspaces = [...workspaces]
  }

  /**
   * Executes the dependency update.
   *
   * @param input - Update parameters
   * @returns The resulting dependency list for the spec
   * @throws {ChangeNotFoundError} If no change with the given name exists
   * @throws {InvalidInputError} If operations conflict, `specId` is not in the change,
   *   a `remove` value is absent, or no operation is specified
   * @throws {InvalidSpecIdError} If `specId`, `add`, or `set` entries fail validation
   * @throws {WorkspaceNotFoundError} If a validated ID names an unknown workspace
   */
  async execute(input: UpdateSpecDepsInput): Promise<UpdateSpecDepsResult> {
    if (
      input.set !== undefined &&
      (input.add !== undefined || input.remove !== undefined || input.clear === true)
    ) {
      throw new InvalidInputError('--set is mutually exclusive with --add, --remove, and --clear')
    }
    if (input.clear === true && (input.add !== undefined || input.remove !== undefined)) {
      throw new InvalidInputError('--clear is mutually exclusive with --add and --remove')
    }
    if (
      input.set === undefined &&
      input.add === undefined &&
      input.remove === undefined &&
      input.clear !== true
    ) {
      throw new InvalidInputError(
        'at least one of --add, --remove, --set, or --clear must be provided',
      )
    }

    const workspaces = this._workspaces
    const specId = parseSpecId(input.specId, { workspaces }).specId
    const add =
      input.add !== undefined
        ? input.add.map((id) => parseSpecId(id, { workspaces }).specId)
        : undefined
    const set =
      input.set !== undefined
        ? input.set.map((id) => parseSpecId(id, { workspaces }).specId)
        : undefined
    const remove =
      input.remove !== undefined
        ? input.remove.map((id) => tryNormalizeDepId(id, workspaces))
        : undefined

    const { result } = await this._changes.mutate(input.name, (change) => {
      if (!change.specIds.includes(specId)) {
        throw new InvalidInputError(
          `spec '${specId}' is not in change '${input.name}' — specIds: [${change.specIds.join(', ')}]`,
        )
      }

      const current = [...(change.specDependsOn.get(specId) ?? [])]
      const result = [
        ...applyDependsOnMutation(current, {
          ...(add !== undefined ? { add } : {}),
          ...(remove !== undefined ? { remove } : {}),
          ...(set !== undefined ? { set } : {}),
          ...(input.clear === true ? { clear: true } : {}),
        }),
      ]

      change.setSpecDependsOn(specId, result)
      return { specId, dependsOn: result }
    })
    return result
  }
}
