import { type ArtifactParserRegistry } from '../application/ports/artifact-parser.js'
import { createArtifactParserRegistry as _createRegistry } from '../infrastructure/artifact-parser/registry.js'

/**
 * Creates and returns the default `ArtifactParserRegistry` with all built-in
 * format adapters registered: `'markdown'`, `'yaml'`, `'json'`, `'plaintext'`.
 *
 * Adapter packages import this function from `@specd/core` and pass the result
 * to use cases such as `ArchiveChange` that require format-specific parsing.
 *
 * @returns A map from format name to the corresponding `ArtifactParser` adapter
 */
export function createArtifactParserRegistry(): ArtifactParserRegistry {
  return _createRegistry()
}
