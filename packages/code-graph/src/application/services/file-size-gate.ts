import { statSync } from 'node:fs'
import {
  createPathRuleSet,
  isOutsideProject,
  type PathRuleMatch,
  type PathRuleSet,
} from '../../domain/services/project-path-rules.js'
import { type EffectiveGraphConfig } from '../use-cases/_shared/resolve-effective-graph-config.js'

/**
 * Outcome of evaluating a file against the effective size gate.
 */
export type FileSizeDecision =
  | { readonly kind: 'within-limit'; readonly sizeBytes: number | null }
  | {
      readonly kind: 'exempt'
      readonly sizeBytes: number
      /** Exemption pattern that matched. */
      readonly exemptionRule?: PathRuleMatch
    }
  | { readonly kind: 'skip'; readonly sizeBytes: number; readonly limitBytes: number }

/**
 * File metadata evaluated by the size gate.
 */
export interface FileSizeGateInput {
  /** `'root'` for project-global discovery, otherwise the workspace name. */
  readonly workspaceName: string
  /** Path relative to the workspace code root (or to the project root for `'root'`), forward slashes. */
  readonly relativeToCodeRoot: string
  /** Path relative to the project root, forward slashes, no leading `./`. */
  readonly projectRelativePath: string
  readonly absolutePath: string
}

/**
 * Evaluates discovered files once against size limits and exemption patterns.
 */
export interface FileSizeGate {
  /** Decides once per file; the caller keeps the size from the decision. */
  decide(input: FileSizeGateInput): FileSizeDecision
}

/**
 * Default filesystem size reader using statSync.
 *
 * @param path - Absolute filesystem path.
 * @returns Byte size, or null if statSync throws.
 */
function defaultReadSize(path: string): number | null {
  try {
    return statSync(path).size
  } catch {
    return null
  }
}

/**
 * Normalizes a relative path for ignore evaluation (removes leading `./` or `/`).
 *
 * @param rawPath - Relative path.
 * @returns Clean path for matcher.
 */
function cleanPathForIgnore(rawPath: string): string {
  let p = rawPath.replaceAll('\\', '/')
  if (p.startsWith('./')) {
    p = p.slice(2)
  }
  if (p.startsWith('/')) {
    p = p.slice(1)
  }
  return p
}

/**
 * Creates a file size gate that applies effective size limits and largeFilePaths exemptions.
 *
 * @param effective - Effective graph configuration.
 * @param readSize - Optional file size reader function (defaults to statSync).
 * @returns A FileSizeGate instance.
 */
export function createFileSizeGate(
  effective: EffectiveGraphConfig,
  readSize: (absolutePath: string) => number | null = defaultReadSize,
): FileSizeGate {
  const ruleSets = new Map<string, PathRuleSet>()

  /**
   * Returns the cached rule set for one list and subject kind.
   * @param key - Cache key.
   * @param patterns - Ordered patterns.
   * @param outside - Whether the subject is relative to a code root outside the project.
   * @returns The rule set.
   */
  const getRuleSet = (key: string, patterns: readonly string[], outside: boolean): PathRuleSet => {
    let set = ruleSets.get(key)
    if (set === undefined) {
      set = createPathRuleSet(patterns, outside ? '../' : '')
      ruleSets.set(key, set)
    }
    return set
  }

  return {
    decide(input: FileSizeGateInput): FileSizeDecision {
      const isRoot = input.workspaceName === 'root'
      const wsConfig = isRoot ? undefined : effective.workspaces.get(input.workspaceName)
      const limit = isRoot
        ? effective.rootMaxFileBytes
        : (wsConfig?.maxFileBytes ?? effective.rootMaxFileBytes)

      const size = readSize(input.absolutePath)
      if (size === null) {
        return { kind: 'within-limit', sizeBytes: null }
      }

      if (limit === 0 || size <= limit) {
        return { kind: 'within-limit', sizeBytes: size }
      }

      // Both exemption lists match the project-relative path; outside the project the
      // code-root-relative path is the subject and root-anchored patterns are dropped.
      const cleanProjectRel = cleanPathForIgnore(input.projectRelativePath)
      const outside = isOutsideProject(cleanProjectRel)
      const subject = outside ? cleanPathForIgnore(input.relativeToCodeRoot) : cleanProjectRel

      if (subject !== '' && !isOutsideProject(subject)) {
        const lists: Array<[string, readonly string[]]> = [
          [`project:${outside}`, effective.rootLargeFilePaths],
        ]
        if (!isRoot) {
          lists.push([
            `ws:${input.workspaceName}:${outside}`,
            wsConfig?.workspaceLargeFilePaths ?? [],
          ])
        }
        for (const [key, patterns] of lists) {
          const result = getRuleSet(key, patterns, outside).test(subject, false)
          if (result.ignored) {
            return {
              kind: 'exempt',
              sizeBytes: size,
              ...(result.rule !== null ? { exemptionRule: result.rule } : {}),
            }
          }
        }
      }

      return { kind: 'skip', sizeBytes: size, limitBytes: limit }
    },
  }
}
