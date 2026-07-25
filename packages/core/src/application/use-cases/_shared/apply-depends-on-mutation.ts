import { InvalidInputError } from '../../../domain/errors/index.js'

/** Mutation input shared by draft and persisted dependency editors. */
export interface DependsOnMutationInput {
  readonly add?: readonly string[]
  readonly remove?: readonly string[]
  readonly set?: readonly string[]
  readonly clear?: boolean
}

/**
 * Applies add/remove/set/clear semantics to a dependency list.
 *
 * @param current - Current dependency list
 * @param input - Requested mutation
 * @returns Updated dependency list
 * @throws {InvalidInputError} When the mutation input is invalid or references unknown dependencies
 */
export function applyDependsOnMutation(
  current: readonly string[],
  input: DependsOnMutationInput,
): readonly string[] {
  if (
    input.clear === true &&
    (input.set !== undefined || input.add !== undefined || input.remove !== undefined)
  ) {
    throw new InvalidInputError('clear is mutually exclusive with set, add, and remove')
  }
  if (
    input.set !== undefined &&
    (input.add !== undefined || input.remove !== undefined || input.clear === true)
  ) {
    throw new InvalidInputError('set is mutually exclusive with add, remove, and clear')
  }
  if (
    input.set === undefined &&
    input.clear !== true &&
    input.add === undefined &&
    input.remove === undefined
  ) {
    throw new InvalidInputError('at least one of add, remove, set, or clear must be provided')
  }

  if (input.clear === true) {
    return []
  }

  if (input.set !== undefined) {
    return [...input.set]
  }

  const result = [...current]

  if (input.remove !== undefined) {
    for (const id of input.remove) {
      const idx = result.indexOf(id)
      if (idx === -1) {
        throw new InvalidInputError(`dependency '${id}' not found in current deps`)
      }
      result.splice(idx, 1)
    }
  }

  if (input.add !== undefined) {
    for (const id of input.add) {
      if (!result.includes(id)) {
        result.push(id)
      }
    }
  }

  return result
}
