import { isAbsolute, relative } from 'node:path'
import ignore from 'ignore'

/** One pattern that decided a test, as reported by the `ignore` library. */
export interface PathRuleMatch {
  /** Pattern text exactly as written (including a leading `!`). */
  readonly pattern: string
  /** Whether the pattern is a negation (`!`). */
  readonly negated: boolean
}

/** Outcome of testing one subject against one ordered pattern list. */
export interface PathRuleResult {
  /** True when the last matching pattern is not a negation. */
  readonly ignored: boolean
  /** True when the last matching pattern is a negation. */
  readonly unignored: boolean
  /** The last matching pattern, or null when none matched. */
  readonly rule: PathRuleMatch | null
}

/** Ordered pattern list that can be tested against subjects. */
export interface PathRuleSet {
  /**
   * Tests one subject against the ordered pattern list.
   * @param subject - Project-relative subject (never starting with `../` or absolute).
   * @param isDirectory - Whether the subject denotes a directory.
   * @returns The decision and the last matching pattern.
   */
  test(subject: string, isDirectory: boolean): PathRuleResult
}

const EMPTY_RESULT: PathRuleResult = { ignored: false, unignored: false, rule: null }

/**
 * Whether a project-relative path denotes a location outside the project root.
 * @param path - Portable path as produced by `relative(projectRoot, target)`.
 * @returns True when the path is `..`, starts with `../`, or is absolute (including a Windows drive path).
 */
export function isOutsideProject(path: string): boolean {
  return path === '..' || path.startsWith('../') || isAbsolute(path) || /^[A-Za-z]:[/\\]/.test(path)
}

/**
 * Computes the portable project-relative directory of a code root.
 * @param projectRoot - Absolute project root.
 * @param codeRoot - Absolute workspace code root.
 * @returns `''` when equal; otherwise the forward-slash relative path with no leading `./`, possibly starting with `../`.
 */
export function computePathBase(projectRoot: string, codeRoot: string): string {
  let base = relative(projectRoot, codeRoot).replaceAll('\\', '/')
  while (base.startsWith('./')) base = base.slice(2)
  return base === '.' ? '' : base
}

/**
 * Whether a gitignore-syntax pattern is anchored to the project root.
 *
 * A pattern is root-anchored when, after removing a leading `!` and a trailing `/`, it contains `/`
 * and does not start with a double-star followed by `/`.
 * Examples: `/app/vendors/*` yes, `app/tmp/` yes, `src/**` yes, `node_modules/` no, `*.spec.ts` no.
 *
 * @param pattern - Pattern text.
 * @returns True when root-anchored.
 */
export function isRootAnchoredPattern(pattern: string): boolean {
  let rest = pattern.startsWith('!') ? pattern.slice(1) : pattern
  if (rest.endsWith('/')) rest = rest.slice(0, -1)
  return rest.includes('/') && !rest.startsWith('**/')
}

/**
 * Builds the subject (the string patterns are tested against) for an entry.
 * @param pathBase - Project-relative directory of the discovery root (`computePathBase`).
 * @param relativePath - Path below the discovery root, forward slashes.
 * @returns `relativePath` when `pathBase` is `''` or outside the project; otherwise `pathBase + '/' + relativePath`.
 */
export function buildPathSubject(pathBase: string, relativePath: string): string {
  if (pathBase === '' || isOutsideProject(pathBase)) return relativePath
  return `${pathBase}/${relativePath}`
}

/**
 * Creates a testable pattern list.
 * @param patterns - Ordered gitignore-syntax patterns. Invalid patterns are dropped.
 * @param pathBase - Project-relative directory of the discovery root. When it is outside the project, root-anchored patterns are removed.
 * @returns A rule set whose `test` returns the last matching pattern.
 */
export function createPathRuleSet(patterns: readonly string[], pathBase: string): PathRuleSet {
  const outside = isOutsideProject(pathBase)
  const ig = ignore()
  const accepted: string[] = []
  for (const pattern of patterns) {
    if (outside && isRootAnchoredPattern(pattern)) continue
    try {
      ig.add(pattern)
      accepted.push(pattern)
    } catch {
      // Invalid pattern: dropped silently
    }
  }
  if (accepted.length === 0) return { test: () => EMPTY_RESULT }

  /**
   * Finds the last negation pattern that matches the target.
   * The `ignore` library does not report negation rules, so each negation is replayed alone.
   * @param target - Subject, with a trailing `/` for directories.
   * @returns The deciding negation, or null when none matches.
   */
  const findNegation = (target: string): PathRuleMatch | null => {
    for (let i = accepted.length - 1; i >= 0; i--) {
      const pattern = accepted[i]
      if (pattern === undefined || !pattern.startsWith('!')) continue
      const single = ignore().add(pattern.slice(1))
      if (single.test(target).ignored) return { pattern, negated: true }
    }
    return null
  }

  return {
    test(subject, isDirectory) {
      if (subject === '') return EMPTY_RESULT
      const target = isDirectory ? `${subject}/` : subject
      const result = ig.test(target)
      if (result.unignored) {
        // The deciding negation is only replayed when a caller reads `rule` (`graph why`).
        let cached: PathRuleMatch | null | undefined
        const lazy = { ignored: false, unignored: true } as { ignored: boolean; unignored: boolean }
        // Non-enumerable so that spreading or serializing the result never triggers the replay.
        Object.defineProperty(lazy, 'rule', {
          enumerable: false,
          get(): PathRuleMatch | null {
            if (cached === undefined) cached = findNegation(target)
            return cached
          },
        })
        return lazy as PathRuleResult
      }
      const rule = result.rule
      return {
        ignored: result.ignored,
        unignored: false,
        rule: rule === undefined ? null : { pattern: rule.pattern, negated: false },
      }
    },
  }
}
