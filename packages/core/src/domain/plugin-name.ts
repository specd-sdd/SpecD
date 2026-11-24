/** Scoped plugin name: `@scope/name`, lowercase, no `.`. */
export const PLUGIN_NAME_REGEX = /^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$/

/**
 * Returns whether `value` is a scoped plugin name (`@scope/name`).
 *
 * @param value - Candidate plugin name
 * @returns `true` when `value` matches {@link PLUGIN_NAME_REGEX}
 */
export function isPluginName(value: string): boolean {
  return PLUGIN_NAME_REGEX.test(value)
}
