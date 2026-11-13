import { InvalidSpecPatternError } from '../errors/invalid-spec-pattern-error.js'
import { isValidCapabilitySegment, isValidWorkspaceName } from './spec-id-rules.js'

/**
 * Kind of a parsed context include/exclude pattern.
 */
export type SpecPatternKind = 'all' | 'prefix' | 'exact'

/**
 * Fully-parsed context include/exclude pattern.
 */
export interface ParsedSpecPattern {
  /** Workspace named by the qualifier, or `null` when the pattern had none. */
  readonly workspace: string | null
  /** `'all'` for `*`; `'prefix'` for `<prefix>/*`; `'exact'` otherwise. */
  readonly kind: SpecPatternKind
  /** `'*'` for `all`; the prefix without `/*` for `prefix`; the capability path for `exact`. */
  readonly path: string
}

/**
 * Options controlling how a pattern without a workspace qualifier is resolved.
 */
export interface ParseSpecPatternOptions {
  /** Workspace used when the pattern has no `:` qualifier. */
  readonly defaultWorkspace?: string
}

/**
 * Validates every `/`-separated segment of a capability path or prefix.
 *
 * @param pattern - Original pattern (for error messages)
 * @param path - Path or prefix to validate
 * @throws {InvalidSpecPatternError} When any segment is empty or invalid
 */
function validateSegments(pattern: string, path: string): void {
  if (path === '') {
    throw new InvalidSpecPatternError(pattern, 'capability path must not be empty')
  }
  for (const segment of path.split('/')) {
    if (segment === '') {
      throw new InvalidSpecPatternError(pattern, 'capability path has an empty segment')
    }
    if (!isValidCapabilitySegment(segment)) {
      throw new InvalidSpecPatternError(
        pattern,
        `segment '${segment}' is invalid (use a-z, 0-9, '_' and '-', not starting with '-')`,
      )
    }
  }
}

/**
 * Parses and validates a context include/exclude pattern.
 *
 * Supported forms: `*`, `workspace:*`, `prefix/*`, `workspace:prefix/*`, and exact paths
 * (optionally qualified). A `*` anywhere else is rejected.
 *
 * @param pattern - Pattern string from configuration or matching
 * @param options - Optional default workspace for qualifier-less patterns
 * @returns The parsed workspace, kind, and path
 * @throws {InvalidSpecPatternError} When the pattern fails grammar validation
 */
export function parseSpecPattern(
  pattern: string,
  options: ParseSpecPatternOptions = {},
): ParsedSpecPattern {
  if (pattern === '*') {
    return { workspace: null, kind: 'all', path: '*' }
  }

  const colon = pattern.indexOf(':')
  const hasQualifier = colon >= 0
  const qualifier = hasQualifier ? pattern.slice(0, colon) : null
  const remainder = hasQualifier ? pattern.slice(colon + 1) : pattern

  if (hasQualifier) {
    if (!isValidWorkspaceName(qualifier!)) {
      throw new InvalidSpecPatternError(
        pattern,
        `workspace '${qualifier}' is invalid (use two or more of a-z, 0-9 and '-', starting with a letter, and not a Windows device name)`,
      )
    }
  }

  if (remainder === '') {
    throw new InvalidSpecPatternError(pattern, 'capability path must not be empty')
  }

  const workspace =
    qualifier ?? (options.defaultWorkspace !== undefined ? options.defaultWorkspace : null)

  if (remainder === '*') {
    return { workspace, kind: 'all', path: '*' }
  }

  if (remainder.includes('*')) {
    if (!remainder.endsWith('/*') || remainder.indexOf('*') !== remainder.length - 1) {
      throw new InvalidSpecPatternError(
        pattern,
        "'*' is only allowed alone, after 'workspace:', or at the end after '/'",
      )
    }
    const prefix = remainder.slice(0, -2)
    validateSegments(pattern, prefix)
    return { workspace, kind: 'prefix', path: prefix }
  }

  validateSegments(pattern, remainder)
  return { workspace, kind: 'exact', path: remainder }
}
