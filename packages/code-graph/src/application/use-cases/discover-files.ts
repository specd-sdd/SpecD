import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ignore from 'ignore'

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.specd',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
])

/**
 * Discovers all indexable source files in a workspace, respecting .gitignore and excluded directories.
 * @param workspacePath - Absolute path to the workspace root.
 * @param hasAdapter - Predicate that returns true if a file extension has a registered language adapter.
 * @returns An array of workspace-relative file paths.
 */
export function discoverFiles(
  workspacePath: string,
  hasAdapter: (filePath: string) => boolean,
): string[] {
  const ig = ignore()

  const gitignorePath = join(workspacePath, '.gitignore')
  try {
    const content = readFileSync(gitignorePath, 'utf-8')
    ig.add(content)
  } catch {
    // no .gitignore
  }

  const results: string[] = []

  /**
   * Recursively walks a directory, collecting files that pass ignore and adapter checks.
   * @param dir - Absolute path to the directory to walk.
   */
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue

      const fullPath = join(dir, entry)
      const relPath = relative(workspacePath, fullPath).replaceAll('\\', '/')

      let stat
      try {
        stat = statSync(fullPath, { throwIfNoEntry: false })
      } catch {
        continue
      }

      if (!stat || stat.isSymbolicLink()) continue

      if (stat.isDirectory()) {
        if (!ig.ignores(relPath + '/')) {
          walk(fullPath)
        }
      } else if (stat.isFile()) {
        if (!ig.ignores(relPath) && hasAdapter(relPath)) {
          results.push(relPath)
        }
      }
    }
  }

  walk(workspacePath)
  return results
}
