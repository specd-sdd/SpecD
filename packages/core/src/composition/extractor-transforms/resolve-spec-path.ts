import { ExtractorTransformError } from '../../domain/errors/extractor-transform-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import {
  type ExtractorTransform,
  type ExtractorTransformContext,
} from '../../domain/services/content-extraction.js'

/**
 * Reads a required string entry from the opaque transform context bag.
 *
 * @param context - Caller-owned transform context bag
 * @param key - Required context key
 * @returns The string value for the key
 * @throws {ExtractorTransformError} When the key is missing or not a string
 */
function readContextString(context: ExtractorTransformContext, key: string): string {
  const value = context.get(key)
  if (typeof value !== 'string' || value.length === 0) {
    throw new ExtractorTransformError(
      'resolveSpecPath',
      'extractor',
      `extractor transform 'resolveSpecPath' requires string context key '${key}'`,
    )
  }
  return value
}

/**
 * Attempts to normalize an already-canonical spec ID.
 *
 * @param value - Candidate canonical spec ID
 * @returns Normalized canonical spec ID
 * @throws {Error} When the value is not a valid canonical spec ID
 */
function normalizeCanonicalSpecId(value: string): string {
  if (!value.includes(':')) {
    throw new Error(`'${value}' is not a canonical spec ID`)
  }

  const { workspace, capPath } = parseSpecId(value)
  if (workspace.trim() === '' || capPath.trim() === '') {
    throw new Error(`'${value}' is not a canonical spec ID`)
  }

  return `${workspace}:${SpecPath.parse(capPath).toString()}`
}

/**
 * Resolves a relative spec path candidate against the origin context.
 *
 * Supports three cases:
 * - within the same workspace (`../shared/spec.md`)
 * - escaping to the default `_global` workspace (`../../_global/architecture/spec.md`)
 * - escaping to another named workspace (`../../core/config/spec.md`)
 *
 * @param candidate - Relative candidate path
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec id
 * @throws {Error} When the candidate is not a valid or resolvable relative spec path
 */
function resolveRelativeSpecPath(candidate: string, context: ExtractorTransformContext): string {
  const cleanPath = candidate.replace(/#.*$/, '')
  if (!cleanPath.startsWith('../') || !cleanPath.endsWith('/spec.md')) {
    throw new Error(`'${cleanPath}' is not a valid relative spec path`)
  }

  const originWorkspace = readContextString(context, 'originWorkspace')
  const originSpecPath = readContextString(context, 'originSpecPath')
  const rawParts = cleanPath.slice(0, -'/spec.md'.length).split('/')
  const baseParts = originSpecPath.split('/').filter((part) => part.length > 0)
  const forwardParts: string[] = []
  let escapedWorkspace = false

  for (const part of rawParts) {
    if (part === '..') {
      if (baseParts.length === 0) {
        escapedWorkspace = true
      } else {
        baseParts.pop()
      }
      continue
    }

    if (part !== '.' && part.length > 0) {
      forwardParts.push(part)
    }
  }

  if (escapedWorkspace) {
    if (forwardParts.length === 0) {
      throw new Error(`'${cleanPath}' escapes the origin workspace`)
    }

    if (forwardParts[0] === '_global') {
      return `default:${SpecPath.parse(forwardParts.join('/')).toString()}`
    }

    if (forwardParts.length < 2) {
      throw new Error(`'${cleanPath}' does not identify a cross-workspace spec path`)
    }

    const workspace = forwardParts[0]!
    const specPath = SpecPath.parse(forwardParts.slice(1).join('/')).toString()
    return `${workspace}:${specPath}`
  }

  const specPath = SpecPath.parse([...baseParts, ...forwardParts].join('/')).toString()
  return `${originWorkspace}:${specPath}`
}

/**
 * Resolves one candidate as either a canonical spec ID or a relative spec path.
 *
 * @param candidate - Candidate extracted string to normalize
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec id
 * @throws {Error} When the candidate is empty, not canonical, or not a valid relative spec path
 */
function resolveCandidate(candidate: string, context: ExtractorTransformContext): string {
  const normalized = candidate.trim()
  if (normalized.length === 0) {
    throw new Error('empty spec reference candidate')
  }

  if (normalized.includes(':')) {
    return normalizeCanonicalSpecId(normalized)
  }

  return resolveRelativeSpecPath(normalized, context)
}

/**
 * Resolves a filesystem-style relative spec link to a canonical spec id.
 *
 * The transform is intentionally pure and context-driven. It resolves links
 * relative to the origin spec path inside the origin workspace.
 *
 * @param value - Primary extracted candidate (for example `core:entrypoint` or `../entrypoint/spec.md`)
 * @param args - Declarative fallback candidates, tried in order after `value`
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec id
 * @throws {ExtractorTransformError} When required origin context is absent
 */
export const resolveSpecPathTransform: ExtractorTransform = (
  value: string,
  args: readonly (string | undefined)[],
  context: ExtractorTransformContext,
): string => {
  const candidates = [value, ...args].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  )
  const failures: string[] = []

  for (const candidate of candidates) {
    try {
      return resolveCandidate(candidate, context)
    } catch (error) {
      failures.push((error as Error).message)
    }
  }

  throw new Error(
    `could not resolve a canonical spec id from candidates ${JSON.stringify(candidates)} (${failures.join('; ')})`,
  )
}
