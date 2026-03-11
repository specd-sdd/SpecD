import { type Selector } from './selector.js'

/**
 * Declares how to extract a single field from a nested structure within a
 * matched AST node. Used by structured extractors (e.g. scenarios) where each
 * matched node produces an object with multiple fields.
 */
export interface FieldMapping {
  /** Source of the field value relative to the matched node. */
  readonly from?: 'label' | 'parentLabel' | 'content'
  /** Selector applied within the matched node to find child values. */
  readonly childSelector?: Selector
  /** Regex with capture group(s) applied to the extracted text. */
  readonly capture?: string
  /** Regex removed from the extracted text. */
  readonly strip?: string
  /**
   * Regex matching sibling nodes that follow a `childSelector` match.
   * Matched siblings are appended to the preceding field's result array
   * until a non-matching sibling (or another field's `childSelector`) is hit.
   * If the pattern contains a capture group, the captured text is used;
   * otherwise the full node text is returned as-is.
   * Enables sequential grouping (e.g. AND/OR items after GIVEN/WHEN/THEN).
   */
  readonly followSiblings?: string
}

/**
 * Declares how to extract structured content from an AST.
 *
 * Generic, reusable value object — can be used by metadata extraction,
 * compliance gates, impact analysis, or any feature that needs to pull
 * structured data from artifact ASTs.
 *
 * `Selector` handles node selection. `Extractor` adds post-processing:
 * what to extract from matched nodes, how to clean up the result, and
 * optionally how to map matched nodes into structured objects.
 */
export interface Extractor {
  /** Selector identifying the AST node(s) to extract from. */
  readonly selector: Selector
  /** What to extract from each matched node. Defaults to `'content'`. */
  readonly extract?: 'content' | 'label' | 'both'
  /** Regex with capture group applied to the extracted text. */
  readonly capture?: string
  /** Regex removed from labels/values before output. */
  readonly strip?: string
  /** Group matched nodes by their label (after `strip`). */
  readonly groupBy?: 'label'
  /** Named post-processing callback (e.g. `'resolveSpecPath'`). */
  readonly transform?: string
  /**
   * Structured field mapping for complex objects. When present, each matched
   * node produces one object with the declared fields.
   */
  readonly fields?: Readonly<Record<string, FieldMapping>>
}
