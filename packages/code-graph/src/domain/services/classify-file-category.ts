import ignore from 'ignore'
import { FileCategory } from '../value-objects/file-node.js'
import { createPathRuleSet, type PathRuleMatch } from './project-path-rules.js'

/**
 * Normalizes a file path for glob matching by stripping workspace prefixes and leading slashes.
 * @param filePath - Raw file path or workspace-prefixed path.
 * @returns Normalized path suitable for gitignore-style matching.
 */
function normalizePathForMatching(filePath: string): string {
  let normalized = filePath.replaceAll('\\', '/')
  if (normalized.includes(':') && !/^[A-Za-z]:[/\\]/.test(normalized)) {
    normalized = normalized.slice(normalized.indexOf(':') + 1)
  }
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }
  return normalized
}

/**
 * Classifies an indexed file path into 'source', 'test', or 'ignored'.
 *
 * Precedence rules:
 * 1. Matches ignorePatterns -> 'ignored'
 * 2. Matches testPatterns -> 'test'
 * 3. Default -> 'source'
 *
 * @remarks The indexer uses {@link explainFileCategory} with project-relative subjects;
 * this function remains as a compatibility wrapper with unchanged behaviour.
 *
 * @param relativePath - Path of the file (optionally workspace-prefixed or relative to codeRoot).
 * @param testPatterns - Gitignore-syntax test file patterns.
 * @param ignorePatterns - Gitignore-syntax ignored file patterns.
 * @returns 'source' | 'test' | 'ignored'
 */
export function classifyFileCategory(
  relativePath: string,
  testPatterns: readonly string[] = [],
  ignorePatterns: readonly string[] = [],
): FileCategory {
  const normalized = normalizePathForMatching(relativePath)
  if (ignorePatterns.length > 0) {
    try {
      const ig = ignore().add([...ignorePatterns])
      if (ig.ignores(normalized)) {
        return 'ignored'
      }
    } catch {
      // Fallback if pattern has unsupported syntax
    }
  }
  if (testPatterns.length > 0) {
    try {
      const ig = ignore().add([...testPatterns])
      if (ig.ignores(normalized)) {
        return 'test'
      }
    } catch {
      // Fallback if pattern has unsupported syntax
    }
  }
  return 'source'
}

/** Pattern list with the level it comes from. */
export interface CategoryPatternSource {
  /** Configuration level that owns the list. */
  readonly level: 'project' | 'workspace'
  /** Configuration key the list is read from. */
  readonly key: 'graph.ignorePaths' | 'graph.testPaths'
  /** Ordered gitignore-syntax patterns. */
  readonly patterns: readonly string[]
}

/** Category decision plus the rule that decided it. */
export interface FileCategoryExplanation {
  /** Resulting category. */
  readonly category: FileCategory
  /** Deciding rule; null when the category is `source` because nothing matched. */
  readonly rule:
    | (PathRuleMatch & {
        readonly level: 'project' | 'workspace'
        readonly key: CategoryPatternSource['key']
      })
    | null
}

/**
 * Evaluates the concatenation of the given sources and attributes the deciding pattern.
 * @param subject - Project-relative subject.
 * @param pathBase - Project-relative directory of the discovery root.
 * @param sources - Pattern sources in order.
 * @returns The deciding rule with its source, or null when the subject is not ignored.
 */
function decide(
  subject: string,
  pathBase: string,
  sources: readonly CategoryPatternSource[],
): FileCategoryExplanation['rule'] {
  const all = sources.flatMap((s) => s.patterns)
  const result = createPathRuleSet(all, pathBase).test(subject, false)
  if (!result.ignored || result.rule === null) return null
  // Last-match-wins: attribute to the latest source containing the winning pattern.
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i]
    if (source !== undefined && source.patterns.includes(result.rule.pattern)) {
      return { ...result.rule, level: source.level, key: source.key }
    }
  }
  return null
}

/**
 * Classifies a file using project-relative matching and reports the deciding rule.
 *
 * Precedence: ignore patterns (project list then workspace list), then test patterns, else source.
 * The lists of each kind are concatenated so a workspace `!` can cancel a project-level pattern.
 *
 * @param subject - Subject from `buildPathSubject` (never workspace-prefixed).
 * @param pathBase - Project-relative directory of the discovery root.
 * @param ignoreSources - Ignore lists in order [project, workspace].
 * @param testSources - Test lists in order [project, workspace].
 * @returns Category and deciding rule.
 */
export function explainFileCategory(
  subject: string,
  pathBase: string,
  ignoreSources: readonly CategoryPatternSource[],
  testSources: readonly CategoryPatternSource[],
): FileCategoryExplanation {
  const ignored = decide(subject, pathBase, ignoreSources)
  if (ignored !== null) return { category: 'ignored', rule: ignored }
  const test = decide(subject, pathBase, testSources)
  if (test !== null) return { category: 'test', rule: test }
  return { category: 'source', rule: null }
}
