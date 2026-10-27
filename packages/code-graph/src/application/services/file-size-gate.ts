import { statSync } from 'node:fs'
import ignore, { type Ignore } from 'ignore'
import { type EffectiveGraphConfig } from '../use-cases/_shared/resolve-effective-graph-config.js'

/**
 * Outcome of evaluating a file against the effective size gate.
 */
export type FileSizeDecision =
  | { readonly kind: 'within-limit'; readonly sizeBytes: number | null }
  | { readonly kind: 'exempt'; readonly sizeBytes: number }
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
 * Creates an Ignore matcher for a list of patterns, ignoring invalid ones.
 *
 * @param patterns - Gitignore-syntax patterns.
 * @returns Configured Ignore instance.
 */
function createMatcher(patterns: readonly string[]): Ignore {
  const ig = ignore()
  for (const pattern of patterns) {
    try {
      ig.add(pattern)
    } catch {
      // invalid patterns are dropped silently consistent with excludePaths
    }
  }
  return ig
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
  let projectMatcher: Ignore | undefined
  const workspaceMatchers = new Map<string, Ignore>()

  const getProjectMatcher = (): Ignore => {
    if (projectMatcher === undefined) {
      projectMatcher = createMatcher(effective.rootLargeFilePaths)
    }
    return projectMatcher
  }

  const getWorkspaceMatcher = (workspaceName: string): Ignore => {
    let matcher = workspaceMatchers.get(workspaceName)
    if (matcher === undefined) {
      const wsConfig = effective.workspaces.get(workspaceName)
      matcher = createMatcher(wsConfig?.workspaceLargeFilePaths ?? [])
      workspaceMatchers.set(workspaceName, matcher)
    }
    return matcher
  }

  return {
    decide(input: FileSizeGateInput): FileSizeDecision {
      const isRoot = input.workspaceName === 'root'
      const limit = isRoot
        ? effective.rootMaxFileBytes
        : (effective.workspaces.get(input.workspaceName)?.maxFileBytes ??
          effective.rootMaxFileBytes)

      const size = readSize(input.absolutePath)
      if (size === null) {
        return { kind: 'within-limit', sizeBytes: null }
      }

      if (limit === 0 || size <= limit) {
        return { kind: 'within-limit', sizeBytes: size }
      }

      // Check project-level exemption
      const cleanProjectRel = cleanPathForIgnore(input.projectRelativePath)
      if (!cleanProjectRel.startsWith('../') && cleanProjectRel !== '..') {
        if (cleanProjectRel !== '' && getProjectMatcher().ignores(cleanProjectRel)) {
          return { kind: 'exempt', sizeBytes: size }
        }
      }

      // Check workspace-level exemption (if not root)
      if (!isRoot) {
        const cleanWorkspaceRel = cleanPathForIgnore(input.relativeToCodeRoot)
        if (
          !cleanWorkspaceRel.startsWith('../') &&
          cleanWorkspaceRel !== '..' &&
          cleanWorkspaceRel !== ''
        ) {
          if (getWorkspaceMatcher(input.workspaceName).ignores(cleanWorkspaceRel)) {
            return { kind: 'exempt', sizeBytes: size }
          }
        }
      }

      return { kind: 'skip', sizeBytes: size, limitBytes: limit }
    },
  }
}
