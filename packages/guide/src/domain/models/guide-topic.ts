import type { GuideSection } from './guide-section.js'

/**
 * Identifier of a documentation collection.
 *
 * A collection groups related documents under a canonical name so that topic
 * identifiers, which are only unique within a collection, can be addressed
 * unambiguously as `collection:topic`.
 */
export type GuideCollection = string

/**
 * Document topic entity representing a complete guide document.
 *
 * The canonical addressable identity of a guide is the composite
 * `collection:topic` form. The `:` character is reserved as the collection
 * delimiter and never appears inside a `collection` or `topic` value, while a
 * `/` MAY appear inside `topic` to represent a nested source document.
 */
export interface GuideTopic {
  /**
   * Canonical collection identifier grouping the document (e.g. 'sdk', 'core', 'code-graph').
   */
  readonly collection: GuideCollection

  /**
   * Canonical string identifier of the document within its collection.
   *
   * For hand-written documents this is the source path relative to the
   * collection root, without extension, lowercased, retaining subdirectory
   * separators (e.g. 'index', 'ports', 'examples/implementing-a-port').
   * For generated documents this is the collection-relative document path
   * assigned by the bundler.
   */
  readonly topic: string

  /**
   * Human-readable title extracted from YAML frontmatter.
   */
  readonly title: string

  /**
   * Concise description extracted from YAML frontmatter.
   */
  readonly description: string

  /**
   * Presentation and navigation order extracted from YAML frontmatter sidebar_position.
   */
  readonly order: number

  /**
   * Complete raw Markdown text of the guide document.
   */
  readonly content: string

  /**
   * Total number of lines in the document.
   */
  readonly lineCount: number

  /**
   * Total UTF-8 byte length of the content.
   */
  readonly byteLength: number

  /**
   * Real source path of the document, relative to its collection root.
   *
   * For a hand-written document this is the relative path of the `.md` file
   * (e.g. 'ports.md'). For a generated API topic this is the relative path of the
   * TypeScript declaration the symbol was extracted from. This is never synthesized
   * from the topic identifier.
   */
  readonly sourcePath: GuideSourcePath

  /**
   * Published package a generated API symbol is imported from (e.g. '@specd/code-graph').
   *
   * Present only on generated API topics. This is the value an integrator needs, because
   * the repository-relative `sourcePath` does not name the package they install and does
   * not exist in their own repository.
   */
  readonly packageName?: string

  /**
   * Copy-pasteable import statement for a generated API symbol.
   *
   * Present only on generated API topics. Rendered as a type-only import for declarations
   * that have no value form (interfaces and type aliases) and as a value import for the
   * rest, so the statement compiles wherever the caller pastes it.
   */
  readonly importStatement?: string

  /**
   * Pre-calculated outline of all sections within the guide.
   */
  readonly outline: readonly GuideSection[]
}

/**
 * Real source path of a guide document, relative to its collection root.
 *
 * For a hand-written document this is the relative path of the `.md` file
 * (e.g. 'ports.md', 'examples/implementing-a-port.md'). For a generated API
 * topic this is the relative path of the declaration the symbol was extracted
 * from, which is a TypeScript source file rather than a Markdown file. The
 * value is always a real source path and never synthesized from the topic.
 */
export type GuideSourcePath = string
