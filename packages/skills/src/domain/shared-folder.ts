import path from 'node:path'
import { InvalidSharedFolderError } from './errors/invalid-shared-folder-error.js'

/**
 * Resolved shared-folder paths for rendering and filesystem writes.
 */
export interface ResolvedSharedFolder {
  /**
   * Project-relative POSIX path exposed to templates.
   */
  readonly relativePath: string

  /**
   * Absolute filesystem path used internally by installers.
   */
  readonly absolutePath: string
}

/**
 * Resolves the effective shared-folder path for templates and installers.
 *
 * @param projectRoot - Absolute project root.
 * @param configPath - Runtime config path.
 * @param sharedFolder - Optional plugin-provided override.
 * @returns Project-relative and absolute shared-folder paths.
 * @throws {InvalidSharedFolderError} When the path escapes the project root.
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
  const resolvedRoot = path.resolve(projectRoot)
  const containment = path.relative(resolvedRoot, absolutePath)
  if (containment.startsWith('..') || path.isAbsolute(containment)) {
    throw new InvalidSharedFolderError(relativePath)
  }

  return { relativePath, absolutePath }
}

/**
 * Builds the default shared-folder path from the runtime config directory.
 *
 * @param projectRoot - Absolute project root.
 * @param configPath - Runtime config path.
 * @returns Privacy-safe project-relative shared-folder path.
 */
export function defaultSharedFolder(projectRoot: string, configPath: string): string {
  const relativeConfigPath = toRelativeProjectPath(projectRoot, configPath)
  return path.posix.join(relativeConfigPath, 'skills', 'shared')
}

/**
 * Normalizes a public shared-folder string to POSIX format without a trailing slash.
 *
 * @param sharedFolder - Shared-folder string to normalize.
 * @returns Normalized relative shared-folder string.
 */
export function normalizeSharedFolder(sharedFolder: string): string {
  return sharedFolder.replaceAll('\\', '/').replace(/\/+$/, '')
}

/**
 * Converts an absolute project path into a privacy-safe project-relative path.
 *
 * @param projectRoot - Absolute project root.
 * @param absolutePath - Candidate absolute path.
 * @returns POSIX relative path suitable for template rendering.
 */
export function toRelativeProjectPath(projectRoot: string, absolutePath: string): string {
  const relativePath = path.isAbsolute(absolutePath)
    ? path.relative(projectRoot, absolutePath)
    : absolutePath
  return relativePath.length > 0 ? relativePath.replaceAll(path.sep, '/') : '.'
}
