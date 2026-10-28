import { readdirSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, relative, extname, isAbsolute, posix } from 'node:path'
import ignore from 'ignore'
import {
  buildPathSubject,
  createPathRuleSet,
  type PathRuleMatch,
} from '../../domain/services/project-path-rules.js'

/**
 * Built-in exclusion patterns applied when `DiscoverFilesOptions.excludePaths` is absent.
 * Follows gitignore syntax. When `excludePaths` is set, these defaults are replaced entirely.
 */
export const DEFAULT_EXCLUDE_PATHS: readonly string[] = [
  'node_modules/',
  '.git/',
  '.hg/',
  '.svn/',
  '.specd/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.nuxt/',
]

/**
 * Known binary and non-source file extensions that are skipped during discovery
 * before any text decoding heuristics are applied.
 */
export const DEFAULT_BINARY_EXTENSIONS = new Set([
  '.gif',
  '.png',
  '.jpg',
  '.jpeg',
  '.pdf',
  '.sql',
  '.zip',
  '.tiff',
  '.pack',
  '.ico',
  '.war',
  '.7z',
])

/**
 * Options controlling file discovery behaviour.
 */
export interface DiscoverFilesOptions {
  /**
   * Global exclusion layer: gitignore-syntax patterns matched against the project-relative
   * subject. When set, replaces built-in defaults entirely. Supports `!` negation. When
   * absent, `DEFAULT_EXCLUDE_PATHS` apply.
   */
  readonly excludePaths?: readonly string[]
  /**
   * Workspace exclusion layer. Evaluated after `excludePaths` (the global layer) and
   * unable to re-include anything the global layer excluded.
   */
  readonly workspaceExcludePaths?: readonly string[]
  /**
   * Project-relative directory of the discovery root, forward slashes, no leading `./`
   * or `/`. `''` (default) means the root is the project root. A value starting with
   * `../`, equal to `..`, or absolute means the root is outside the project.
   */
  readonly pathBase?: string
  /**
   * Whether `.gitignore` files are loaded and applied during file discovery.
   * Defaults to `true`. When `false`, only the exclusion layers govern exclusion.
   */
  readonly respectGitignore?: boolean
  /**
   * Optional inclusion patterns (glob-syntax) matched against the project-relative subject.
   * If provided, only files matching at least one pattern SHALL be returned.
   */
  readonly allowedPaths?: readonly string[]
  /**
   * Resolved VCS root used to bound repository-level `.gitignore` loading.
   * Must be passed explicitly as `null` outside VCS.
   */
  readonly vcsRoot: string | null
  /**
   * Absolute project root. When given, the `.gitignore` file reported for a gitignore decision
   * is expressed relative to it (the `../` form when the file lies outside the project),
   * whatever the spelling of the paths (symlinks included).
   */
  readonly projectRoot?: string
  /** Optional diagnostics hook used when callers must distinguish unknown inspection from absence. */
  readonly onInspectionError?: ((error: unknown, path: string) => void) | undefined
}

/** Outcome of evaluating one entry against the discovery filters. */
export type DiscoveryDecision =
  | { readonly kind: 'included' }
  | {
      readonly kind: 'excluded'
      /** Filter that excluded the entry. */
      readonly stage: 'gitignore' | 'global-exclude' | 'workspace-exclude' | 'allowed-paths'
      /** The deciding pattern, or null for `allowed-paths` when no pattern matched. */
      readonly rule: PathRuleMatch | null
      /** For `gitignore`: the project-relative `.gitignore` file and line (1-based) of the pattern. */
      readonly gitignoreSource?: { readonly file: string; readonly line: number | null }
      /** Set when an ancestor directory (not the entry itself) was excluded; project-relative path. */
      readonly viaDirectory?: string
    }

/** Evaluator bound to one discovery root and one set of options. */
export interface DiscoveryEvaluator {
  /**
   * Decides for a single entry using the `.gitignore` files loaded so far.
   * @param relativePath - Root-relative path of the entry.
   * @param isDirectory - Whether the entry is a directory.
   * @returns The discovery decision.
   */
  evaluateEntry(relativePath: string, isDirectory: boolean): DiscoveryDecision
  /**
   * Decides for a path as the walk would: ancestors from the top first, then the entry.
   * Loads the `.gitignore` files of the ancestor directories on demand.
   * @param relativePath - Root-relative path of a file.
   * @param isDirectory - Whether the path is a directory (default false).
   * @returns The discovery decision.
   */
  evaluatePath(relativePath: string, isDirectory?: boolean): DiscoveryDecision
  /**
   * Loads the `.gitignore` of a root-relative directory once (no-op when gitignore is disabled).
   * @param relativeDir - Root-relative directory (`''` for the root).
   */
  loadDirectory(relativeDir: string): void
}

/**
 * Computes the path of `root` below an ancestor directory, resolving symlinks so that a VCS root
 * reported by its real path still matches a `root` given through a symlinked path.
 * @param directory - Absolute candidate ancestor directory.
 * @param root - Absolute discovery root.
 * @returns Forward-slash path of `root` below `directory`, or null when `root` is not below it.
 */
function pathBelowDirectory(directory: string, root: string): string | null {
  const resolveReal = (value: string): string => {
    try {
      return realpathSync(value)
    } catch {
      return value
    }
  }
  const below = relative(resolveReal(directory), resolveReal(root)).replaceAll('\\', '/')
  if (below === '' || below === '..' || below.startsWith('../') || isAbsolute(below)) return null
  return below
}

/**
 * Lists the directories strictly between an ancestor and a descendant, top-down.
 * @param ancestor - Absolute ancestor directory (for example the VCS root).
 * @param descendant - Absolute descendant directory (the discovery root).
 * @returns Absolute intermediate directories, or an empty list when `descendant` is not below `ancestor`.
 */
function directoriesBetween(ancestor: string, descendant: string): string[] {
  const below = pathBelowDirectory(ancestor, descendant)
  if (below === null) return []
  let realAncestor = ancestor
  try {
    realAncestor = realpathSync(ancestor)
  } catch {
    // keep the given spelling
  }
  const segments = below.split('/')
  const directories: string[] = []
  for (let i = 1; i < segments.length; i++) {
    directories.push(join(realAncestor, ...segments.slice(0, i)))
  }
  return directories
}

/**
 * Resolves symlinks of a path, falling back to the given spelling.
 * @param value - Absolute path.
 * @returns The real path, or `value` when it cannot be resolved.
 */
function realPathOf(value: string): string {
  try {
    return realpathSync(value)
  } catch {
    return value
  }
}

/** A loaded `.gitignore` scoped to the directory that holds it. */
interface ScopedIgnore {
  /** Compiled rules of the file. */
  readonly ig: ReturnType<typeof ignore>
  /** Root-relative path of the directory holding the `.gitignore` (empty string = root level). */
  readonly base: string
  /** Absolute directory holding the `.gitignore`. */
  readonly dir: string
  /** Raw lines of the file, used to locate the deciding line. */
  readonly lines: readonly string[]
  /** For a `.gitignore` above the discovery root: root path relative to that directory, forward slashes. */
  readonly rootBelow?: string
}

/**
 * Creates the evaluator shared by file discovery and path explanation.
 *
 * Order per entry: gitignore layer (absolute priority), global exclusion layer, workspace
 * exclusion layer, then (files only) `allowedPaths`. Global and workspace layers are
 * separate rule sets so a workspace negation can never re-include a globally excluded entry.
 *
 * @param root - Absolute path to the discovery root.
 * @param options - Discovery options.
 * @returns An evaluator bound to the root and options.
 */
export function createDiscoveryEvaluator(
  root: string,
  options?: DiscoverFilesOptions,
): DiscoveryEvaluator {
  const pathBase = options?.pathBase ?? ''
  const respectGitignore = options?.respectGitignore !== false
  const scopedIgnores: ScopedIgnore[] = []
  const loadedDirs = new Set<string>()

  const globalLayer = createPathRuleSet(options?.excludePaths ?? DEFAULT_EXCLUDE_PATHS, pathBase)
  const workspaceLayer = createPathRuleSet(options?.workspaceExcludePaths ?? [], pathBase)
  const allowedLayer =
    options?.allowedPaths && options.allowedPaths.length > 0
      ? createPathRuleSet(options.allowedPaths, pathBase)
      : null

  /**
   * Loads a `.gitignore` file from a directory and registers it scoped to that directory.
   * @param absoluteDir - Absolute path to the directory containing the `.gitignore`.
   */
  function loadIgnoreFile(absoluteDir: string): void {
    const key = realPathOf(absoluteDir)
    if (loadedDirs.has(key)) return
    loadedDirs.add(key)
    try {
      const content = readFileSync(join(absoluteDir, '.gitignore'), 'utf-8')
      const base = absoluteDir === root ? '' : relative(root, absoluteDir).replaceAll('\\', '/')
      const ig = ignore()
      ig.add(content)
      const rootBelow =
        base === '..' || base.startsWith('../') ? pathBelowDirectory(absoluteDir, root) : null
      scopedIgnores.push({
        ig,
        base,
        dir: absoluteDir,
        lines: content.split(/\r?\n/),
        ...(rootBelow !== null ? { rootBelow } : {}),
      })
    } catch {
      // no .gitignore in this directory
    }
  }

  let gitRoot: string | null = null
  if (respectGitignore) {
    gitRoot = options?.vcsRoot ?? null
    if (gitRoot !== null) {
      loadIgnoreFile(gitRoot)
      // Directories between the VCS root and the root, top-down, as git applies them
      for (const directory of directoriesBetween(gitRoot, root)) {
        loadIgnoreFile(directory)
      }
    }

    // Load .gitignore at the root itself (if different from git root)
    if (gitRoot !== root) {
      loadIgnoreFile(root)
    }
  }

  /**
   * Loads the `.gitignore` of a root-relative directory once.
   * @param relativeDir - Root-relative directory (`''` for the root).
   */
  function loadDirectory(relativeDir: string): void {
    if (!respectGitignore) return
    const absoluteDir = relativeDir === '' ? root : join(root, relativeDir)
    if (absoluteDir === root || absoluteDir === gitRoot) return
    loadIgnoreFile(absoluteDir)
  }

  /**
   * Evaluates the gitignore layer: absolute priority, negations only within the gitignore layer.
   * @param relPath - Root-relative path.
   * @param isDir - Whether the path is a directory.
   * @returns The deciding source and rule when ignored, otherwise null.
   */
  function evaluateGitignore(
    relPath: string,
    isDir: boolean,
  ): { scoped: ScopedIgnore; rule: PathRuleMatch } | null {
    let decided: { scoped: ScopedIgnore; rule: PathRuleMatch } | null = null
    for (const scoped of scopedIgnores) {
      let target: string
      if (scoped.base === '') {
        target = isDir ? relPath + '/' : relPath
      } else if (scoped.rootBelow !== undefined) {
        // A .gitignore above the root (for example at the VCS root) applies to the path below its directory.
        target = `${scoped.rootBelow}/${relPath}${isDir ? '/' : ''}`
      } else {
        const prefix = scoped.base + '/'
        if (!relPath.startsWith(prefix)) continue
        const sub = relPath.slice(prefix.length)
        if (!sub) continue
        target = isDir ? sub + '/' : sub
      }
      const result = scoped.ig.test(target)
      if (result.ignored) {
        decided = {
          scoped,
          rule: {
            pattern: result.rule?.pattern ?? '',
            negated: false,
          },
        }
      }
      if (result.unignored) decided = null
    }
    return decided
  }

  /**
   * Decides for one entry: gitignore, global layer, workspace layer, then `allowedPaths` for files.
   * @param relPath - Root-relative path of the entry.
   * @param isDir - Whether the entry is a directory.
   * @returns The discovery decision.
   */
  function evaluateEntry(relPath: string, isDir: boolean): DiscoveryDecision {
    if (respectGitignore) {
      const git = evaluateGitignore(relPath, isDir)
      if (git !== null) {
        let line: number | null = null
        for (let i = 0; i < git.scoped.lines.length; i++) {
          if (git.scoped.lines[i]?.trim() === git.rule.pattern) {
            line = i + 1
            break
          }
        }
        const dir = git.scoped.base
        const file =
          options?.projectRoot !== undefined
            ? relative(
                realPathOf(options.projectRoot),
                join(realPathOf(git.scoped.dir), '.gitignore'),
              ).replaceAll('\\', '/')
            : git.scoped.rootBelow !== undefined
              ? posix.normalize(
                  [pathBase, dir, '.gitignore'].filter((part) => part !== '').join('/'),
                )
              : buildPathSubject(pathBase, dir === '' ? '.gitignore' : `${dir}/.gitignore`)
        return {
          kind: 'excluded',
          stage: 'gitignore',
          rule: git.rule,
          gitignoreSource: { file, line },
        }
      }
    }

    const subject = buildPathSubject(pathBase, relPath)

    const globalResult = globalLayer.test(subject, isDir)
    if (globalResult.ignored) {
      return { kind: 'excluded', stage: 'global-exclude', rule: globalResult.rule }
    }

    const workspaceResult = workspaceLayer.test(subject, isDir)
    if (workspaceResult.ignored) {
      return { kind: 'excluded', stage: 'workspace-exclude', rule: workspaceResult.rule }
    }

    if (!isDir && allowedLayer !== null && !allowedLayer.test(subject, false).ignored) {
      return { kind: 'excluded', stage: 'allowed-paths', rule: null }
    }

    return { kind: 'included' }
  }

  /**
   * Decides for a path as the walk would: ancestors from the top first, then the entry.
   * @param relativePath - Root-relative path.
   * @param isDirectory - Whether the path is a directory.
   * @returns The discovery decision.
   */
  function evaluatePath(relativePath: string, isDirectory = false): DiscoveryDecision {
    const segments = relativePath.split('/').filter((segment) => segment !== '')
    if (segments.length === 0) return { kind: 'included' }
    let current = ''
    for (let i = 0; i < segments.length - 1; i++) {
      loadDirectory(current)
      current = current === '' ? (segments[i] ?? '') : `${current}/${segments[i] ?? ''}`
      const decision = evaluateEntry(current, true)
      if (decision.kind === 'excluded') {
        return { ...decision, viaDirectory: buildPathSubject(pathBase, current) }
      }
    }
    loadDirectory(current)
    return evaluateEntry(segments.join('/'), isDirectory)
  }

  return { evaluateEntry, evaluatePath, loadDirectory }
}

/**
 * Discovers all indexable source files under a root directory, respecting .gitignore
 * and excluded paths. Returns paths relative to the root.
 *
 * Loads .gitignore files hierarchically: from the git root (if the root is within
 * a git repo) and from any subdirectories encountered during the walk.
 *
 * Layered evaluation (see {@link createDiscoveryEvaluator}):
 * 1. Gitignore has absolute priority. A path ignored by .gitignore cannot be
 *    re-included by exclusion negation patterns.
 * 2. `excludePaths` (global layer, or built-in defaults), then `workspaceExcludePaths`;
 *    both are matched against the project-relative subject (`pathBase` + path).
 * 3. `allowedPaths` (if set) acts as a final include filter.
 *
 * @param root - Absolute path to the root directory to walk (e.g. a workspace's codeRoot).
 * @param hasAdapter - Optional predicate that returns true if a file extension has a registered language adapter.
 * @param options - Optional exclusion and inclusion options.
 * @returns An array of root-relative file paths.
 */
export function discoverFiles(
  root: string,
  hasAdapter?: (filePath: string) => boolean,
  options?: DiscoverFilesOptions,
): string[] {
  const evaluator = createDiscoveryEvaluator(root, options)
  const results: string[] = []

  /**
   * Recursively walks a directory, collecting files that pass ignore and adapter checks.
   * @param dir - Absolute path to the directory to walk.
   */
  function walk(dir: string): void {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch (error) {
      options?.onInspectionError?.(error, dir)
      return
    }

    // Load scoped .gitignore for this subdirectory (only when respecting gitignore)
    evaluator.loadDirectory(dir === root ? '' : relative(root, dir).replaceAll('\\', '/'))

    for (const entry of entries) {
      const fullPath = join(dir, entry)
      const relPath = relative(root, fullPath).replaceAll('\\', '/')

      let stat
      try {
        stat = lstatSync(fullPath, { throwIfNoEntry: false })
      } catch (error) {
        options?.onInspectionError?.(error, fullPath)
        continue
      }

      if (!stat) {
        options?.onInspectionError?.(new Error('Path disappeared during discovery'), fullPath)
        continue
      }
      if (stat.isSymbolicLink()) continue

      if (stat.isDirectory()) {
        if (evaluator.evaluateEntry(relPath, true).kind !== 'excluded') {
          walk(fullPath)
        }
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (DEFAULT_BINARY_EXTENSIONS.has(ext)) {
          continue
        }

        const passAdapter = !hasAdapter || hasAdapter(relPath)
        if (passAdapter && evaluator.evaluateEntry(relPath, false).kind === 'included') {
          results.push(relPath)
        }
      }
    }
  }

  walk(root)
  return results
}
