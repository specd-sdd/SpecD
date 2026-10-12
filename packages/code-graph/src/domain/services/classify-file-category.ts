import ignore from 'ignore'
import { FileCategory } from '../value-objects/file-node.js'

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
