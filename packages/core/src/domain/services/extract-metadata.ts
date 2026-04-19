import {
  type MetadataExtraction,
  type MetadataExtractorEntry,
} from '../value-objects/metadata-extraction.js'
import { type SelectorNode } from './selector-matching.js'
import {
  extractContent,
  type ExtractorTransformContext,
  type ExtractorTransformRegistry,
  type SubtreeRenderer,
  type GroupedExtraction,
  type StructuredExtraction,
} from './content-extraction.js'

// Re-export generic types so existing consumers don't break
export {
  extractContent,
  type ExtractorTransformResult,
  type ExtractorTransform,
  type ExtractorTransformContext,
  type ExtractorTransformRegistry,
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
 * @param transformContextsOrTargetArtifactId - Opaque caller-owned transform contexts keyed by artifact id, or the legacy target artifact id shortcut
 * @param targetArtifactId - Optional filter: only extract fields where field.artifact === targetArtifactId
 * @returns The extracted metadata with all available fields populated
 */
export async function extractMetadata(
  extraction: MetadataExtraction,
  astsByArtifact: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContextsOrTargetArtifactId?: ReadonlyMap<string, ExtractorTransformContext> | string,
  targetArtifactId?: string,
): Promise<ExtractedMetadata> {
  const result: Record<string, unknown> = {}
  const transformContexts =
    typeof transformContextsOrTargetArtifactId === 'string'
      ? undefined
      : transformContextsOrTargetArtifactId
  const effectiveTargetArtifactId =
    typeof transformContextsOrTargetArtifactId === 'string'
      ? transformContextsOrTargetArtifactId
      : targetArtifactId

  // Helper to check if field should be extracted
  const shouldExtract = (artifact: string | undefined): boolean => {
    if (effectiveTargetArtifactId === undefined) return true
    return artifact === effectiveTargetArtifactId
  }

  // Single-value fields
  if (extraction.title !== undefined && shouldExtract(extraction.title.artifact)) {
    const val = await extractSingle(
      extraction.title,
      astsByArtifact,
      renderers,
      transforms,
      transformContexts,
    )
    if (val !== undefined) result['title'] = val
  }

  if (extraction.description !== undefined && shouldExtract(extraction.description.artifact)) {
    const val = await extractSingle(
      extraction.description,
      astsByArtifact,
      renderers,
      transforms,
      transformContexts,
    )
    if (val !== undefined) result['description'] = val
  }

  // Array-value fields
  if (extraction.dependsOn !== undefined && shouldExtract(extraction.dependsOn.artifact)) {
    const val = await extractArray(
      extraction.dependsOn,
      astsByArtifact,
      renderers,
      transforms,
      transformContexts,
    )
    if (val.length > 0) result['dependsOn'] = val
  }

  if (extraction.keywords !== undefined && shouldExtract(extraction.keywords.artifact)) {
    const val = await extractArray(
      extraction.keywords,
      astsByArtifact,
      renderers,
      transforms,
      transformContexts,
    )
    if (val.length > 0) result['keywords'] = val
  }

  // Multi-entry array fields
  if (extraction.context !== undefined) {
    const filtered = extraction.context.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const val = await extractMultiEntryArray(
        filtered,
        astsByArtifact,
        renderers,
        transforms,
        transformContexts,
      )
      if (val.length > 0) result['context'] = val
    }
  }

  if (extraction.rules !== undefined) {
    const filtered = extraction.rules.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const groups = await extractMultiEntryGrouped(
        filtered,
        astsByArtifact,
        renderers,
        transforms,
        transformContexts,
      )
      if (groups.length > 0) {
        result['rules'] = groups.map((g) => ({ requirement: g.label, rules: [...g.items] }))
      }
    }
  }

  if (extraction.constraints !== undefined) {
    const filtered = extraction.constraints.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const val = await extractMultiEntryArray(
        filtered,
        astsByArtifact,
        renderers,
        transforms,
        transformContexts,
      )
      if (val.length > 0) result['constraints'] = val
    }
  }

  if (extraction.scenarios !== undefined) {
    const filtered = extraction.scenarios.filter((e) => shouldExtract(e.artifact))
    if (filtered.length > 0) {
      const structured = await extractMultiEntryStructured(
        filtered,
        astsByArtifact,
        renderers,
        transforms,
        transformContexts,
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
 * @param transformContexts - Opaque caller-owned transform context bags keyed by artifact id
 * @returns First matched string or undefined
 */
async function extractSingle(
  entry: MetadataExtractorEntry,
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContexts?: ReadonlyMap<string, ExtractorTransformContext>,
): Promise<string | undefined> {
  const ast = asts.get(entry.artifact)
  const renderer = renderers.get(entry.artifact)
  if (ast === undefined || renderer === undefined) return undefined

  const values = await extractContent(
    ast.root,
    entry.extractor,
    renderer,
    transforms,
    transformContexts?.get(entry.artifact),
  )
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
 * @param transformContexts - Opaque caller-owned transform context bags keyed by artifact id
 * @returns All matched strings
 */
async function extractArray(
  entry: MetadataExtractorEntry,
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContexts?: ReadonlyMap<string, ExtractorTransformContext>,
): Promise<string[]> {
  const ast = asts.get(entry.artifact)
  const renderer = renderers.get(entry.artifact)
  if (ast === undefined || renderer === undefined) return []

  const values = await extractContent(
    ast.root,
    entry.extractor,
    renderer,
    transforms,
    transformContexts?.get(entry.artifact),
  )
  return values.filter((v): v is string => typeof v === 'string')
}

/**
 * Extracts concatenated string results from multiple extractor entries.
 *
 * @param entries - Array of extractor entries
 * @param asts - Parsed ASTs keyed by artifact type ID
 * @param renderers - Subtree renderers keyed by artifact type ID
 * @param transforms - Named transform callbacks
 * @param transformContexts - Opaque caller-owned transform context bags keyed by artifact id
 * @returns Concatenated string results from all entries
 */
async function extractMultiEntryArray(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContexts?: ReadonlyMap<string, ExtractorTransformContext>,
): Promise<string[]> {
  const results: string[] = []
  for (const entry of entries) {
    results.push(...(await extractArray(entry, asts, renderers, transforms, transformContexts)))
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
 * @param transformContexts - Opaque caller-owned transform context bags keyed by artifact id
 * @returns Grouped extraction results with label and items
 */
async function extractMultiEntryGrouped(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContexts?: ReadonlyMap<string, ExtractorTransformContext>,
): Promise<GroupedExtraction[]> {
  const results: GroupedExtraction[] = []
  for (const entry of entries) {
    const ast = asts.get(entry.artifact)
    const renderer = renderers.get(entry.artifact)
    if (ast === undefined || renderer === undefined) continue

    const values = await extractContent(
      ast.root,
      entry.extractor,
      renderer,
      transforms,
      transformContexts?.get(entry.artifact),
    )
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
 * @param transformContexts - Opaque caller-owned transform context bags keyed by artifact id
 * @returns Structured extraction results as record objects
 */
async function extractMultiEntryStructured(
  entries: readonly MetadataExtractorEntry[],
  asts: ReadonlyMap<string, { root: SelectorNode }>,
  renderers: ReadonlyMap<string, SubtreeRenderer>,
  transforms?: ExtractorTransformRegistry,
  transformContexts?: ReadonlyMap<string, ExtractorTransformContext>,
): Promise<StructuredExtraction[]> {
  const results: StructuredExtraction[] = []
  for (const entry of entries) {
    const ast = asts.get(entry.artifact)
    const renderer = renderers.get(entry.artifact)
    if (ast === undefined || renderer === undefined) continue

    const values = await extractContent(
      ast.root,
      entry.extractor,
      renderer,
      transforms,
      transformContexts?.get(entry.artifact),
    )
    for (const val of values) {
      if (typeof val === 'object' && !('label' in val)) {
        results.push(val)
      }
    }
  }
  return results
}
