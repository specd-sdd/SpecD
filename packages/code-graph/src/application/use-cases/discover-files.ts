import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
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
 * Finds the git root by walking up from the given directory looking for `.git/`.
 * @param startDir - Absolute path to start searching from.
 * @returns The git root path, or undefined if not found.
 */
function findGitRoot(startDir: string): string | undefined {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Discovers all indexable source files under a root directory, respecting .gitignore
 * and excluded directories. Returns paths relative to the root.
 *
 * Loads .gitignore files hierarchically: from the git root (if the root is within
 * a git repo) and from any subdirectories encountered during the walk.
 *
 * @param root - Absolute path to the root directory to walk (e.g. a workspace's codeRoot).
 * @param hasAdapter - Predicate that returns true if a file extension has a registered language adapter.
 * @returns An array of root-relative file paths.
 */
export function discoverFiles(root: string, hasAdapter: (filePath: string) => boolean): string[] {
  const ig = ignore()

  // Load .gitignore from git root if root is inside a git repo
  const gitRoot = findGitRoot(root)
  if (gitRoot) {
    const gitRootIgnore = join(gitRoot, '.gitignore')
    try {
      const content = readFileSync(gitRootIgnore, 'utf-8')
      ig.add(content)
    } catch {
      // no .gitignore at git root
    }
  }

  // Also load .gitignore at root itself (may be same as git root)
  if (gitRoot !== root) {
    const rootIgnore = join(root, '.gitignore')
    try {
      const content = readFileSync(rootIgnore, 'utf-8')
      ig.add(content)
    } catch {
      // no .gitignore at root
    }
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

    // Load .gitignore in this subdirectory if present
    if (dir !== root && dir !== gitRoot) {
      const subIgnore = join(dir, '.gitignore')
      try {
        const content = readFileSync(subIgnore, 'utf-8')
        ig.add(content)
      } catch {
        // no .gitignore in this subdir
      }
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue

      const fullPath = join(dir, entry)
      const relPath = relative(root, fullPath).replaceAll('\\', '/')

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

  walk(root)
  return results
}
