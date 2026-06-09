import path from 'node:path'

/**
 * Shared-folder paths resolved for install/uninstall operations.
 */
export interface ResolvedSharedFolder {
  /**
   * Project-relative path exposed to templates.
   */
  readonly relativePath: string

  /**
   * Absolute filesystem path used for writes and removals.
   */
  readonly absolutePath: string
}

/**
 * Resolves the shared-folder paths used by Open Code skill install and uninstall flows.
 *
 * @param projectRoot - Absolute project root.
 * @param configPath - Runtime config directory path.
 * @param sharedFolder - Optional shared-folder override relative to the project root.
 * @returns Relative and absolute shared-folder paths.
 * @throws {Error} When the shared-folder path escapes the project root.
 */
export function resolveSharedFolder(
  projectRoot: string,
  configPath: string,
  sharedFolder?: string,
): ResolvedSharedFolder {
  const relativePath = normalizeSharedFolder(
    sharedFolder ?? defaultSharedFolder(projectRoot, configPath),
  )
  const absolutePath = path.resolve(projectRoot, relativePath)
  const containment = path.relative(path.resolve(projectRoot), absolutePath)
  if (containment.startsWith('..') || path.isAbsolute(containment)) {
    throw new Error(`Shared folder must stay inside the project root: ${relativePath}`)
  }

  return { relativePath, absolutePath }
}

/**
 * Builds the default relative shared-folder path from the config directory.
 *
 * @param projectRoot - Absolute project root.
 * @param configPath - Runtime config directory path.
 * @returns Project-relative default shared-folder path.
 */
function defaultSharedFolder(projectRoot: string, configPath: string): string {
  return path.posix.join(toRelativeProjectPath(projectRoot, configPath), 'skills', 'shared')
}

/**
 * Normalizes a shared-folder string to POSIX format without a trailing slash.
 *
 * @param sharedFolder - Candidate shared-folder string.
 * @returns Normalized relative shared-folder string.
 */
function normalizeSharedFolder(sharedFolder: string): string {
  return sharedFolder.replaceAll('\\', '/').replace(/\/+$/, '')
}

/**
 * Converts a path into a project-relative POSIX string.
 *
 * @param projectRoot - Absolute project root.
 * @param inputPath - Absolute or relative input path.
 * @returns Project-relative POSIX path.
 */
function toRelativeProjectPath(projectRoot: string, inputPath: string): string {
  const relativePath = path.isAbsolute(inputPath)
    ? path.relative(projectRoot, inputPath)
    : inputPath
  return relativePath.length > 0 ? relativePath.replaceAll(path.sep, '/') : '.'
}
