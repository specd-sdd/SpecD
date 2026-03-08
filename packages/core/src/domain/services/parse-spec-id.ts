/**
 * Splits a spec identifier of the form `workspace:capabilityPath` into its
 * two components. When the identifier contains no colon, `defaultWorkspace`
 * is used as the workspace and the entire string is treated as the
 * capability path.
 *
 * @param specId - A spec identifier, e.g. `"billing:payments/checkout"`
 * @param defaultWorkspace - Workspace name to use when `specId` has no colon (default: `'default'`)
 * @returns The parsed workspace name and capability path
 */
export function parseSpecId(
  specId: string,
  defaultWorkspace = 'default',
): { workspace: string; capPath: string } {
  const colonIdx = specId.indexOf(':')
  return colonIdx >= 0
    ? { workspace: specId.slice(0, colonIdx), capPath: specId.slice(colonIdx + 1) }
    : { workspace: defaultWorkspace, capPath: specId }
}
