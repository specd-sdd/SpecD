import { type ExtractorTransformContext } from '../../../domain/services/content-extraction.js'
import { type SpecReferenceResolver } from './spec-reference-resolver.js'

/**
 * Optional extras attached to the extractor transform context bag.
 */
export interface ExtractorTransformContextOptions {
  /**
   * Resolver used by `resolveSpecPath` for repository-backed relative path normalization.
   */
  readonly resolveSpecReference?: SpecReferenceResolver
}

/**
 * Builds the standard origin context bag passed to extractor transforms.
 *
 * @param originWorkspace - Workspace that owns the artifact being extracted
 * @param originSpecPath - Logical spec path inside the workspace
 * @param artifactId - Artifact type id currently being extracted
 * @param artifactFilename - Concrete artifact filename being read
 * @param options - Optional context extras used by built-in transforms
 * @returns Opaque extractor transform context bag
 */
export function createExtractorTransformContext(
  originWorkspace: string,
  originSpecPath: string,
  artifactId: string,
  artifactFilename: string,
  options?: ExtractorTransformContextOptions,
): ExtractorTransformContext {
  const context = new Map<string, unknown>([
    ['originWorkspace', originWorkspace],
    ['originSpecPath', originSpecPath],
    ['artifactId', artifactId],
    ['artifactFilename', artifactFilename],
  ])

  if (options?.resolveSpecReference !== undefined) {
    context.set('resolveSpecReference', options.resolveSpecReference)
  }

  return context
}
