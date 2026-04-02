import {
  type ArtifactParser,
  type ArtifactParserRegistry,
} from '../../application/ports/artifact-parser.js'
import { JsonParser } from './json-parser.js'
import { MarkdownParser } from './markdown-parser.js'
import { PlaintextParser } from './plaintext-parser.js'
import { YamlParser } from './yaml-parser.js'

/**
 * Creates and returns the built-in {@link ArtifactParserRegistry} base map.
 *
 * The returned registry is intended to be treated as the immutable built-in
 * layer and merged additively with external parser registrations at kernel
 * construction time.
 *
 * @returns A map of format name to parser: `'markdown'`, `'yaml'`, `'json'`, and `'plaintext'`
 */
export function createArtifactParserRegistry(): ArtifactParserRegistry {
  const md = new MarkdownParser()
  const yaml = new YamlParser()
  const json = new JsonParser()
  const txt = new PlaintextParser()

  return new Map<string, ArtifactParser>([
    ['markdown', md],
    ['yaml', yaml],
    ['json', json],
    ['plaintext', txt],
  ])
}
