import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import ignore from 'ignore'

/**
 * Built-in exclusion patterns applied when `DiscoverFilesOptions.excludePaths` is absent.
 * Follows gitignore syntax. When `excludePaths` is set, these defaults are replaced entirely.
 */
export const DEFAULT_EXCLUDE_PATHS: readonly string[] = [
  'node_modules/',
  '.git/',
  '.specd/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.nuxt/',
]

/**
 * Options controlling file discovery behaviour.
 */
export interface DiscoverFilesOptions {
  /**
   * Gitignore-syntax exclusion patterns. When set, replaces built-in defaults entirely.
   * Supports `!` negation. When absent, `DEFAULT_EXCLUDE_PATHS` apply.
   */
  readonly excludePaths?: readonly string[]
  /**
   * Whether `.gitignore` files are loaded and applied during file discovery.
   * Defaults to `true`. When `false`, only `excludePaths` governs exclusion.
   */
  readonly respectGitignore?: boolean
}

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
 * and excluded paths. Returns paths relative to the root.
 *
 * Loads .gitignore files hierarchically: from the git root (if the root is within
 * a git repo) and from any subdirectories encountered during the walk.
 *
 * Two-layer evaluation: gitignore has absolute priority. A path ignored by gitignore
 * cannot be re-included by `excludePaths` negation patterns.
 *
 * @param root - Absolute path to the root directory to walk (e.g. a workspace's codeRoot).
 * @param hasAdapter - Predicate that returns true if a file extension has a registered language adapter.
 * @param options - Optional exclusion options.
 * @returns An array of root-relative file paths.
 */
export function discoverFiles(
  root: string,
  hasAdapter: (filePath: string) => boolean,
  options?: DiscoverFilesOptions,
): string[] {
  // Each entry scopes an ignore instance to the directory containing the .gitignore.
  // `base` is the root-relative path of that directory (empty string = root level).
  const scopedIgnores: Array<{ ig: ReturnType<typeof ignore>; base: string }> = []

  // Config-layer ignore instance: built from excludePaths ?? DEFAULT_EXCLUDE_PATHS
  const configIg = ignore()
  configIg.add([...(options?.excludePaths ?? DEFAULT_EXCLUDE_PATHS)])

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

  let gitRoot: string | undefined
  if (options?.respectGitignore !== false) {
    // Load .gitignore from git root (patterns apply relative to root)
    gitRoot = findGitRoot(root)
    if (gitRoot) {
      loadIgnoreFile(gitRoot)
    }

    // Load .gitignore at codeRoot itself (if different from git root)
    if (gitRoot !== root) {
      loadIgnoreFile(root)
    }
  }

  /**
   * Checks whether a root-relative path is ignored.
   *
   * Layer 1 (gitignore) has absolute priority: if any scoped gitignore rule ignores the
   * path, it returns true immediately — `excludePaths` cannot re-include it.
   * Layer 2 (config) evaluates `excludePaths ?? DEFAULT_EXCLUDE_PATHS` via the `ignore` library.
   *
   * @param relPath - Root-relative path to check.
   * @param isDir - Whether the path is a directory.
   * @returns True if the path should be excluded.
   */
  function isIgnored(relPath: string, isDir: boolean): boolean {
    const target = isDir ? relPath + '/' : relPath

    // Layer 1: gitignore (absolute priority)
    if (options?.respectGitignore !== false) {
      let gitIgnored = false
      for (const { ig, base } of scopedIgnores) {
        if (base === '') {
          const result = ig.test(target)
          if (result.ignored) gitIgnored = true
          if (result.unignored) gitIgnored = false
        } else {
          const prefix = base + '/'
          if (relPath.startsWith(prefix)) {
            const sub = relPath.slice(prefix.length)
            if (sub) {
              const subTarget = isDir ? sub + '/' : sub
              const result = ig.test(subTarget)
              if (result.ignored) gitIgnored = true
              if (result.unignored) gitIgnored = false
            }
          }
        }
      }
      if (gitIgnored) return true
    }

    // Layer 2: config excludePaths
    const result = configIg.test(target)
    if (result.ignored) return true
    if (result.unignored) return false

    return false
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

    // Load scoped .gitignore for this subdirectory (only when respecting gitignore)
    if (options?.respectGitignore !== false && dir !== root && dir !== gitRoot) {
      loadIgnoreFile(dir)
    }

    for (const entry of entries) {
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
