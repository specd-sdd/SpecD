import { ParserNotRegisteredError } from '../errors/parser-not-registered-error.js'
import {
  type ArtifactParserRegistry,
  type OutlineEntry,
} from '../ports/artifact-parser.js'
import { inferFormat } from '../../domain/services/format-inference.js'

/** Result of outlining a single artifact file from raw content. */
export interface OutlineArtifactContentResult {
  readonly filename: string
  readonly outline: readonly OutlineEntry[]
  readonly selectorHints?: Readonly<
    Record<string, { matches: string; contains?: string; level?: string }>
  >
}

/**
 * Parses artifact content and returns a navigable outline (no workspace or change I/O).
 *
 * @param content - Raw file body.
 * @param filename - Change-relative or workspace filename (used for format inference).
 * @param parsers - Parser registry.
 * @param options - Outline options.
 */
export function outlineArtifactContent(
  content: string,
  filename: string,
  parsers: ArtifactParserRegistry,
  options: { readonly full?: boolean; readonly hints?: boolean } = {},
): OutlineArtifactContentResult {
  const format = inferFormat(filename)
  if (!format) {
    throw new ParserNotRegisteredError(
      'unknown',
      `unrecognised extension for file '${filename}'`,
    )
  }

  const parser = parsers.get(format)
  if (!parser) {
    throw new ParserNotRegisteredError(format, `file: ${filename}`)
  }

  const ast = parser.parse(content)
  const outline = parser.outline(ast, { full: options.full === true })
  const selectorHints =
    options.hints === true ? parser.selectorHints(outline) : undefined

  return {
    filename,
    outline,
    ...(selectorHints !== undefined ? { selectorHints } : {}),
  }
}
