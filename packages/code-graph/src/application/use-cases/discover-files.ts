import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs'
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
  // Each entry scopes an ignore instance to the directory containing the .gitignore.
  // `base` is the root-relative path of that directory (empty string = root level).
  const scopedIgnores: Array<{ ig: ReturnType<typeof ignore>; base: string }> = []

  /**
   * Loads a `.gitignore` file from a directory and registers it scoped to that directory.
   * @param absoluteDir - Absolute path to the directory containing the `.gitignore`.
   */
  function loadIgnoreFile(absoluteDir: string): void {
    try {
      const content = readFileSync(join(absoluteDir, '.gitignore'), 'utf-8')
      const base = absoluteDir === root ? '' : relative(root, absoluteDir).replaceAll('\\', '/')
      const ig = ignore()
      ig.add(content)
      scopedIgnores.push({ ig, base })
    } catch {
      // no .gitignore in this directory
    }
  }

  // Load .gitignore from git root (patterns apply relative to root)
  const gitRoot = findGitRoot(root)
  if (gitRoot) {
    loadIgnoreFile(gitRoot)
  }

  // Load .gitignore at codeRoot itself (if different from git root)
  if (gitRoot !== root) {
    loadIgnoreFile(root)
  }

  /**
   * Checks whether a root-relative path is ignored by scoped `.gitignore` rules.
   * Evaluates from general to specific scope so child negations can override
   * parent ignores (e.g. root `*.gen.ts` overridden by `src/!keep.gen.ts`).
   * @param relPath - Root-relative path to check.
   * @param isDir - Whether the path is a directory.
   * @returns True if the path is ignored after all scoped rules are evaluated.
   */
  function isIgnored(relPath: string, isDir: boolean): boolean {
    let ignored = false
    for (const { ig, base } of scopedIgnores) {
      const target = isDir ? relPath + '/' : relPath
      if (base === '') {
        const result = ig.test(target)
        if (result.ignored) ignored = true
        if (result.unignored) ignored = false
      } else {
        const prefix = base + '/'
        if (relPath.startsWith(prefix)) {
          const sub = relPath.slice(prefix.length)
          if (sub) {
            const subTarget = isDir ? sub + '/' : sub
            const result = ig.test(subTarget)
            if (result.ignored) ignored = true
            if (result.unignored) ignored = false
          }
        }
      }
    }
    return ignored
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

    // Load scoped .gitignore for this subdirectory
    if (dir !== root && dir !== gitRoot) {
      loadIgnoreFile(dir)
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry)) continue

      const fullPath = join(dir, entry)
      const relPath = relative(root, fullPath).replaceAll('\\', '/')

      let stat
      try {
        stat = lstatSync(fullPath, { throwIfNoEntry: false })
      } catch {
        continue
      }

      if (!stat || stat.isSymbolicLink()) continue

      if (stat.isDirectory()) {
        if (!isIgnored(relPath, true)) {
          walk(fullPath)
        }
      } else if (stat.isFile()) {
        if (!isIgnored(relPath, false) && hasAdapter(relPath)) {
          results.push(relPath)
        }
      }
    }
  }

  walk(root)
  return results
}
