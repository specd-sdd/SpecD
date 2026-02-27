import {
  type ArtifactParser,
  type ArtifactParserRegistry,
} from '../../application/ports/artifact-parser.js'
import { JsonParser } from './json-parser.js'
import { MarkdownParser } from './markdown-parser.js'
import { PlaintextParser } from './plaintext-parser.js'
import { YamlParser } from './yaml-parser.js'

/**
 * Creates and returns the default {@link ArtifactParserRegistry} with all built-in parsers registered.
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
