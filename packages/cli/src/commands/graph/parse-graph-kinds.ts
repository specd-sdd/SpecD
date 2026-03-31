import { SymbolKind, type SymbolKind as SymbolKindValue } from '@specd/code-graph'
import { parseCommaSeparatedValues } from '../../helpers/parse-comma-values.js'

const VALID_SYMBOL_KINDS = new Set<SymbolKindValue>(Object.values(SymbolKind))

/**
 * Parses the `--kind` graph option into a validated ordered list of kinds.
 *
 * @param value - Raw CLI value for `--kind`.
 * @param optionName - Option name used in validation messages.
 * @returns The validated list of kinds, or `undefined` when no value was provided.
 */
export function parseGraphKinds(
  value: string | undefined,
  optionName = '--kind',
): readonly SymbolKindValue[] | undefined {
  if (value === undefined) return undefined
  return [...parseCommaSeparatedValues(value, VALID_SYMBOL_KINDS, optionName)]
}
