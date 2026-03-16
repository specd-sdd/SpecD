/**
 * Converts a glob pattern (supporting * wildcards) into a case-insensitive RegExp.
 * @param pattern - A glob pattern (e.g. "test/*", "*.spec.ts").
 * @returns A case-insensitive RegExp matching the pattern.
 */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(escaped, 'i')
}

/**
 * Extracts the workspace prefix (first path segment) from a file path.
 * @param filePath - A forward-slash separated file path.
 * @returns The first path segment, or the entire path if no slash is present.
 */
function extractWorkspace(filePath: string): string {
  const idx = filePath.indexOf('/')
  return idx === -1 ? filePath : filePath.substring(0, idx)
}

/**
 * Checks whether a file path should be excluded based on exclude patterns and workspaces.
 * @param filePath - The file path to check.
 * @param excludePaths - Glob patterns to exclude (case-insensitive, supports * wildcards).
 * @param excludeWorkspaces - Workspace names to exclude.
 * @returns True if the file path matches any exclusion rule.
 */
export function matchesExclude(
  filePath: string,
  excludePaths?: readonly string[],
  excludeWorkspaces?: readonly string[],
): boolean {
  if (excludeWorkspaces && excludeWorkspaces.length > 0) {
    const ws = extractWorkspace(filePath)
    if (excludeWorkspaces.includes(ws)) return true
  }

  if (excludePaths && excludePaths.length > 0) {
    for (const pattern of excludePaths) {
      if (globToRegExp(pattern).test(filePath)) return true
    }
  }

  return false
}
