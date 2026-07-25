import { type PersistedImplementationLink } from '../../../domain/services/apply-persisted-spec-state-patch.js'

/** Mutation input for persisted implementation links. */
export interface PersistedImplementationMutationInput {
  readonly action: 'add' | 'remove'
  readonly file: string
  readonly symbols?: readonly string[]
}

/**
 * Applies add/remove semantics to persisted implementation links.
 *
 * @param current - Current implementation links
 * @param input - Requested mutation
 * @returns Updated implementation links
 */
export function applyPersistedImplementationMutation(
  current: readonly PersistedImplementationLink[],
  input: PersistedImplementationMutationInput,
): readonly PersistedImplementationLink[] {
  if (input.action === 'add') {
    const existing = current.find((entry) => entry.file === input.file)
    if (existing === undefined) {
      return [
        ...current,
        {
          file: input.file,
          ...(input.symbols !== undefined && input.symbols.length > 0
            ? { symbols: [...input.symbols] }
            : {}),
        },
      ]
    }

    if (input.symbols === undefined || input.symbols.length === 0) {
      return current.map((entry) =>
        entry.file === input.file
          ? {
              file: entry.file,
              ...(entry.symbols !== undefined ? { symbols: [...entry.symbols] } : {}),
            }
          : entry,
      )
    }

    const mergedSymbols = new Set(existing.symbols ?? [])
    for (const symbol of input.symbols) {
      mergedSymbols.add(symbol)
    }
    return current.map((entry) =>
      entry.file === input.file ? { file: entry.file, symbols: [...mergedSymbols] } : entry,
    )
  }

  const existing = current.find((entry) => entry.file === input.file)
  if (existing === undefined) {
    return current
  }

  if (input.symbols !== undefined && input.symbols.length > 0) {
    const remaining = (existing.symbols ?? []).filter((symbol) => !input.symbols!.includes(symbol))
    if (remaining.length === 0) {
      return current.filter((entry) => entry.file !== input.file)
    }
    return current.map((entry) =>
      entry.file === input.file ? { file: entry.file, symbols: remaining } : entry,
    )
  }

  return current.filter((entry) => entry.file !== input.file)
}
