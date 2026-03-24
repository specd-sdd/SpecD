import { type Extractor } from './extractor.js'

/**
 * Associates an {@link Extractor} with a specific artifact ID in the schema.
 * Used within {@link MetadataExtraction} to target extractors at specific
 * artifact types (e.g. `specs`, `verify`).
 */
export interface MetadataExtractorEntry {
  /** Unique identifier for this extractor entry within the metadataExtraction block. */
  readonly id?: string
  /** The artifact type ID this extractor targets (e.g. `'specs'`, `'verify'`). */
  readonly artifact: string
  /** The extraction configuration. */
  readonly extractor: Extractor
}

/**
 * Top-level schema declaration for deterministic metadata extraction.
 *
 * Each field maps a metadata key to one or more extractor entries that
 * declare how to pull that field's value from artifact ASTs. Single-value
 * fields (title, description) use a single entry; array-value fields
 * (rules, scenarios, context) use an array of entries.
 */
export interface MetadataExtraction {
  /** Extracts the spec title (first H1 heading). */
  readonly title?: MetadataExtractorEntry
  /** Extracts the spec description (Overview/Purpose section content). */
  readonly description?: MetadataExtractorEntry
  /** Extracts dependency spec paths from link references. */
  readonly dependsOn?: MetadataExtractorEntry
  /** Extracts keyword terms. */
  readonly keywords?: MetadataExtractorEntry
  /** Extracts always-included context content. */
  readonly context?: readonly MetadataExtractorEntry[]
  /** Extracts structured rule groups. */
  readonly rules?: readonly MetadataExtractorEntry[]
  /** Extracts constraint strings. */
  readonly constraints?: readonly MetadataExtractorEntry[]
  /** Extracts structured scenario objects. */
  readonly scenarios?: readonly MetadataExtractorEntry[]
}
