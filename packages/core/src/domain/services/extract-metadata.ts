import {
  type MetadataExtraction,
  type MetadataExtractorEntry,
} from '../value-objects/metadata-extraction.js'
import { type SelectorNode } from './selector-matching.js'
import {
  extractContent,
  type SubtreeRenderer,
  type GroupedExtraction,
  type StructuredExtraction,
} from './content-extraction.js'

// Re-export generic types so existing consumers don't break
export {
  extractContent,
  type SubtreeRenderer,
  type GroupedExtraction,
  type StructuredExtraction,
} from './content-extraction.js'

/** Result of extracting all metadata fields from artifact ASTs. */
export interface ExtractedMetadata {
  readonly title?: string
  readonly description?: string
  readonly dependsOn?: string[]
  readonly keywords?: string[]
  readonly context?: string[]
  readonly rules?: ReadonlyArray<{ readonly requirement: string; readonly rules: string[] }>
  readonly constraints?: string[]
  readonly scenarios?: ReadonlyArray<{
    readonly requirement: string
    readonly name: string
    readonly given?: string[]
    readonly when?: string[]
    readonly then?: string[]
  }>
}

/**
 * Orchestrates metadata extraction across multiple artifacts.
 *
 * For each declared metadata field, looks up the corresponding artifact AST,
 * runs the extractor, and assembles the result into an {@link ExtractedMetadata}.
 *
 * @param extraction - The schema's metadata extraction declarations
 * @param astsByArtifact - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @param targetArtifactId - Optional filter: only extract fields where field.artifact === targetArtifactId
 * @returns The extracted metadata with all available fields populated
 */
export function extractMetadata(
  extraction: MetadataExtraction,
  astsByArtifact: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
  targetArtifactId?: string,
): ExtractedMetadata {
  const result: Record<string, unknown> = {}

  // Helper to check if field should be extracted
  const shouldExtract = (artifact: string | undefined): boolean => {
    if (targetArtifactId === undefined) return true
    return artifact === targetArtifactId
  }

  // Single-value fields
  if (extraction.title !== undefined && shouldExtract(extraction.title.artifact)) {
    const val = extractSingle(extraction.title, astsByArtifact, renderers, transforms)
    if (val !== undefined) result['title'] = val
  }

  if (extraction.description !== undefined && shouldExtract(extraction.description.artifact)) {
    const val = extractSingle(extraction.description, astsByArtifact, renderers, transforms)
    if (val !== undefined) result['description'] = val
  }

  // Array-value fields
  if (extraction.dependsOn !== undefined && shouldExtract(extraction.dependsOn.artifact)) {
    const val = extractArray(extraction.dependsOn, astsByArtifact, renderers, transforms)
    if (val.length > 0) result['dependsOn'] = val
  }

  if (extraction.keywords !== undefined && shouldExtract(extraction.keywords.artifact)) {
    const val = extractArray(extraction.keywords, astsByArtifact, renderers, transforms)
    if (val.length > 0) result['keywords'] = val
  }

  // Multi-entry array fields
  if (extraction.context !== undefined) {
    const filtered = extraction.context.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const val = extractMultiEntryArray(filtered, astsByArtifact, renderers, transforms)
      if (val.length > 0) result['context'] = val
    }
  }

  if (extraction.rules !== undefined) {
    const filtered = extraction.rules.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const groups = extractMultiEntryGrouped(filtered, astsByArtifact, renderers, transforms)
      if (groups.length > 0) {
        result['rules'] = groups.map((g) => ({ requirement: g.label, rules: [...g.items] }))
      }
    }
  }

  if (extraction.constraints !== undefined) {
    const filtered = extraction.constraints.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const val = extractMultiEntryArray(filtered, astsByArtifact, renderers, transforms)
      if (val.length > 0) result['constraints'] = val
    }
  }

  if (extraction.scenarios !== undefined) {
    const filtered = extraction.scenarios.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const structured = extractMultiEntryStructured(
        filtered,
        astsByArtifact,
        renderers,
        transforms,
      )
      if (structured.length > 0) {
        result['scenarios'] = structured.map((s) => ({
          requirement: (s['requirement'] as string) ?? '',
          name: (s['name'] as string) ?? '',
          ...(s['given'] !== undefined ? { given: s['given'] } : {}),
          ...(s['when'] !== undefined ? { when: s['when'] } : {}),
          ...(s['then'] !== undefined ? { then: s['then'] } : {}),
        }))
      }
    }
  }

  return result as ExtractedMetadata
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the first matched string from a single extractor entry.
 *
 * @param entry - Extractor entry with artifact reference
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @returns First matched string or undefined
 */
function extractSingle(
  entry: MetadataExtractorEntry,
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): string | undefined {
  const ast = asts.get(entry.artifact)
  const renderer = renderers.get(entry.artifact)
  if (ast === undefined || renderer === undefined) return undefined

  const values = extractContent(ast.root, entry.extractor, renderer, transforms)
  if (values.length === 0) return undefined

  const first = values[0]
  if (typeof first === 'string') return first
  return undefined
}

/**
 * Extracts all matched strings from a single extractor entry.
 *
 * @param entry - Extractor entry with artifact reference
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @returns All matched strings
 */
function extractArray(
  entry: MetadataExtractorEntry,
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): string[] {
  const ast = asts.get(entry.artifact)
  const renderer = renderers.get(entry.artifact)
  if (ast === undefined || renderer === undefined) return []

  const values = extractContent(ast.root, entry.extractor, renderer, transforms)
  return values.filter((v): v is string => typeof v === 'string')
}

/**
 * Extracts concatenated string results from multiple extractor entries.
 *
 * @param entries - Array of extractor entries
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @returns Concatenated string results from all entries
 */
function extractMultiEntryArray(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): string[] {
  const results: string[] = []
  for (const entry of entries) {
    results.push(...extractArray(entry, asts, renderers, transforms))
  }
  return results
}

/**
 * Extracts grouped results from multiple extractor entries.
 *
 * @param entries - Array of extractor entries
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @returns Grouped extraction results with label and items
 */
function extractMultiEntryGrouped(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): GroupedExtraction[] {
  const results: GroupedExtraction[] = []
  for (const entry of entries) {
    const ast = asts.get(entry.artifact)
    const renderer = renderers.get(entry.artifact)
    if (ast === undefined || renderer === undefined) continue

    const values = extractContent(ast.root, entry.extractor, renderer, transforms)
    for (const val of values) {
      if (typeof val === 'object' && 'label' in val) {
        results.push(val as GroupedExtraction)
      }
    }
  }
  return results
}

/**
 * Extracts structured objects from multiple extractor entries.
 *
 * @param entries - Array of extractor entries
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @returns Structured extraction results as record objects
 */
function extractMultiEntryStructured(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): StructuredExtraction[] {
  const results: StructuredExtraction[] = []
  for (const entry of entries) {
    const ast = asts.get(entry.artifact)
    const renderer = renderers.get(entry.artifact)
    if (ast === undefined || renderer === undefined) continue

    const values = extractContent(ast.root, entry.extractor, renderer, transforms)
    for (const val of values) {
      if (typeof val === 'object' && !('label' in val)) {
        results.push(val)
      }
    }
  }
  return results
}
