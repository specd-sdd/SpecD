/**
 * Renders any thrown value as a short, human-readable phrase.
 *
 * Never throws: hostile values (throwing getters, exotic prototypes) fall back to
 * a generic phrase.
 *
 * @param value - Thrown value
 * @returns The error message, the string itself, an object's string `message`, or a fallback
 */
export function describeThrown(value: unknown): string {
  try {
    if (value instanceof Error && value.message.length > 0) return value.message
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'object' && value !== null) {
      const message = (value as { message?: unknown }).message
      if (typeof message === 'string' && message.length > 0) return message
    }
  } catch {
    // Fall through to the generic phrase.
  }
  return 'unknown error'
}
