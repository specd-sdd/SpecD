import {
  type ExtractorTransform,
  type ExtractorTransformRegistry,
} from '../../domain/services/content-extraction.js'
import { resolveSpecPathTransform } from './resolve-spec-path.js'

/**
 * Returns the built-in extractor transform registry.
 *
 * @returns Immutable registry of built-in extractor transforms
 */
export function createBuiltinExtractorTransforms(): ExtractorTransformRegistry {
  return new Map<string, ExtractorTransform>([['resolveSpecPath', resolveSpecPathTransform]])
}

export { resolveSpecPathTransform }
