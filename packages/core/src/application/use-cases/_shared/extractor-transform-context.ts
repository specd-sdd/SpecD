import { type ExtractorTransformContext } from '../../../domain/services/content-extraction.js'

/**
 * Builds the standard origin context bag passed to extractor transforms.
 *
 * @param originWorkspace - Workspace that owns the artifact being extracted
 * @param originSpecPath - Logical spec path inside the workspace
 * @param artifactId - Artifact type id currently being extracted
 * @param artifactFilename - Concrete artifact filename being read
 * @returns Opaque extractor transform context bag
 */
export function createExtractorTransformContext(
  originWorkspace: string,
  originSpecPath: string,
  artifactId: string,
  artifactFilename: string,
): ExtractorTransformContext {
  return new Map<string, unknown>([
    ['originWorkspace', originWorkspace],
    ['originSpecPath', originSpecPath],
    ['artifactId', artifactId],
    ['artifactFilename', artifactFilename],
  ])
}
