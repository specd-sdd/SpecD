import { ExtractorTransformError } from '../../domain/errors/extractor-transform-error.js'
import { parseSpecId } from '../../domain/services/parse-spec-id.js'
import { SpecPath } from '../../domain/value-objects/spec-path.js'
import {
  type ExtractorTransform,
  type ExtractorTransformContext,
} from '../../domain/services/content-extraction.js'
import { type SpecReferenceResolver } from '../../application/use-cases/_shared/spec-reference-resolver.js'

/**
 * Reads the async spec-reference resolver from the opaque transform context bag.
 *
 * @param context - Caller-owned transform context bag
 * @returns Async resolver for relative spec references
 * @throws {ExtractorTransformError} When the resolver is missing or invalid
 */
function readContextResolver(context: ExtractorTransformContext): SpecReferenceResolver {
  const value = context.get('resolveSpecReference')
  if (typeof value !== 'function') {
    throw new ExtractorTransformError(
      'resolveSpecPath',
      'extractor',
      "extractor transform 'resolveSpecPath' requires function context key 'resolveSpecReference'",
    )
  }

  return value as SpecReferenceResolver
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
 * Resolves a relative candidate via the caller-provided repository-backed resolver.
 *
 * @param candidate - Relative spec reference candidate
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec ID
 * @throws {Error} When the candidate cannot be normalized
 */
async function resolveRelativeSpecPath(
  candidate: string,
  context: ExtractorTransformContext,
): Promise<string> {
  const resolver = readContextResolver(context)
  const resolved = await resolver(candidate)
  if (resolved === null) {
    throw new Error(`'${candidate}' could not be resolved to a canonical spec ID`)
  }

  return normalizeCanonicalSpecId(resolved)
}

/**
 * Resolves one candidate as either a canonical spec ID or a relative spec path.
 *
 * @param candidate - Candidate extracted string to normalize
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec ID
 * @throws {Error} When the candidate is empty, not canonical, or unresolved
 */
async function resolveCandidate(
  candidate: string,
  context: ExtractorTransformContext,
): Promise<string> {
  const normalized = candidate.trim()
  if (normalized.length === 0) {
    throw new Error('empty spec reference candidate')
  }

  if (normalized.includes(':')) {
    return normalizeCanonicalSpecId(normalized)
  }

  return await resolveRelativeSpecPath(normalized, context)
}

/**
 * Resolves dependency candidates to canonical spec IDs.
 *
 * Candidate order is preserved: primary `value` first, then interpolated args.
 * Canonical IDs are normalized locally; relative candidates are delegated to
 * the repository-backed resolver in transform context.
 *
 * @param value - Primary extracted candidate
 * @param args - Declarative fallback candidates, tried in order after `value`
 * @param context - Caller-owned transform context bag
 * @returns Canonical spec ID
 * @throws {Error} When no candidate can be normalized
 */
export const resolveSpecPathTransform: ExtractorTransform = async (
  value: string,
  args: readonly (string | undefined)[],
  context: ExtractorTransformContext,
): Promise<string> => {
  const candidates = [value, ...args].filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
  )
  const failures: string[] = []

  for (const candidate of candidates) {
    try {
      return await resolveCandidate(candidate, context)
    } catch (error) {
      failures.push((error as Error).message)
    }
  }

  throw new Error(
    `could not resolve a canonical spec id from candidates ${JSON.stringify(candidates)} (${failures.join('; ')})`,
  )
}
