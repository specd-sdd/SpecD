/**
 * Determines whether a value is a non-null, non-array object record.
 *
 * @param value - Value to test
 * @returns True if value is a Record<string, unknown>
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Options for deep merge config operations. */
export interface DeepMergeConfigOptions {
  /** Optional keys to ignore during merge (e.g. 'extends', 'remove' in cascade) */
  readonly ignoredKeys?: readonly string[]
}

/**
 * Pure domain service helper that recursively merges two configuration objects.
 * - Objects: Recursively merged by key.
 * - Arrays: Concatenated ([...base, ...overlay]).
 * - Scalars / Primtives: Overlay value overwrites base value.
 *
 * @param base - Base config record
 * @param overlay - Overlay config record
 * @param options - Optional merge configuration (such as ignoredKeys)
 * @returns Deep merged config record
 */
export function deepMergeConfig(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined,
  options?: DeepMergeConfigOptions,
): Record<string, unknown> {
  const result: Record<string, unknown> = base !== undefined ? { ...base } : {}
  if (overlay === undefined) {
    return result
  }
  const ignored = new Set(options?.ignoredKeys ?? [])

  for (const [key, value] of Object.entries(overlay)) {
    if (ignored.has(key)) continue
    const existing = result[key]
    if (existing !== undefined && isRecord(existing) && isRecord(value)) {
      result[key] = deepMergeConfig(existing, value, options)
    } else if (Array.isArray(existing) && Array.isArray(value)) {
      result[key] = [...(existing as readonly unknown[]), ...(value as readonly unknown[])]
    } else {
      result[key] = value
    }
  }
  return result
}
