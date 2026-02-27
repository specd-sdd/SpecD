import { type DeltaPosition, type Selector } from '../../domain/value-objects/index.js'
import { SpecdError } from '../../domain/errors/specd-error.js'

/** A single node in a normalized artifact AST. */
export interface ArtifactNode {
  readonly type: string
  readonly label?: string
  readonly value?: string | number | boolean | null
  readonly children?: readonly ArtifactNode[]
  /** Present on markdown `section` nodes. */
  readonly level?: number
  /** Present on markdown `list` nodes. */
  readonly ordered?: boolean
  /** Arbitrary extra fields produced by adapters. */
  readonly [key: string]: unknown
}

/** The normalized AST produced and consumed by {@link ArtifactParser}. */
export interface ArtifactAST {
  readonly root: ArtifactNode
}

/** A single operation entry in a delta file. */
export interface DeltaEntry {
  readonly op: 'added' | 'modified' | 'removed'
  readonly selector?: Selector
  readonly position?: DeltaPosition
  readonly rename?: string
  readonly content?: string
  readonly value?: unknown
  readonly strategy?: 'replace' | 'append' | 'merge-by'
  readonly mergeKey?: string
}

/** Describes one addressable node type for a file format. */
export interface NodeTypeDescriptor {
  /** Node type name, e.g. `"section"`, `"property"`, `"pair"`. */
  readonly type: string
  /** Selector properties that identify a node, e.g. `["matches"]`. */
  readonly identifiedBy: readonly string[]
  /** Human-readable description for LLM context generation. */
  readonly description: string
}

/** A simplified navigable summary entry of an artifact's addressable nodes. */
export interface OutlineEntry {
  readonly type: string
  /** Identifying value, e.g. heading text or key name. */
  readonly label: string
  /** Nesting depth (0 = root children). */
  readonly depth: number
  readonly children?: readonly OutlineEntry[]
}

/**
 * Thrown by {@link ArtifactParser.apply} when a selector fails to resolve
 * (no match, ambiguous match, or structural conflict during application).
 */
export class DeltaApplicationError extends SpecdError {
  /** Machine-readable error code for programmatic handling. */
  override get code(): string {
    return 'DELTA_APPLICATION'
  }

  /**
   * Creates a new `DeltaApplicationError` instance.
   *
   * @param message - Human-readable description of the application failure
   */
  constructor(message: string) {
    super(message)
  }
}

/**
 * Domain port that abstracts all file-type-specific parsing, delta application,
 * and serialization. Each supported file format has a corresponding infrastructure
 * adapter implementing this port.
 *
 * Injected at the application layer — domain services never reference concrete
 * parsers directly.
 */
export interface ArtifactParser {
  /** File extensions this adapter handles, e.g. `['.md']` or `['.json']`. */
  readonly fileExtensions: readonly string[]

  /** Parses artifact content into a normalized AST. */
  parse(content: string): ArtifactAST

  /**
   * Applies a sequence of delta entries to an AST. All selectors are resolved
   * before any operation is applied — if any selector fails to resolve (no match
   * or ambiguous match), the entire application is rejected with
   * {@link DeltaApplicationError}.
   */
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST

  /** Serializes an AST back to the artifact's native format string. */
  serialize(ast: ArtifactAST): string

  /**
   * Serializes a single AST node and all its descendants back to the artifact's
   * native format string. Used by `ValidateArtifacts` to evaluate `contentMatches`
   * and by `CompileContext` to extract spec content via `contextSections`.
   */
  renderSubtree(node: ArtifactNode): string

  /** Returns a static description of all addressable node types for this format. */
  nodeTypes(): readonly NodeTypeDescriptor[]

  /**
   * Returns a simplified navigable summary of the artifact's addressable nodes.
   * `CompileContext` injects this outline when asking the LLM to generate a delta.
   */
  outline(ast: ArtifactAST): readonly OutlineEntry[]

  /**
   * Returns a format-specific static text block that `CompileContext` injects
   * verbatim when `delta: true` is active for the artifact.
   */
  deltaInstructions(): string

  /**
   * Parses a YAML delta file's raw content into a typed array of delta entries.
   *
   * Called by `ValidateArtifacts` on the YAML adapter to convert the raw delta
   * file into `DeltaEntry[]` before passing them to `apply()`. Only the YAML
   * adapter is expected to return a non-empty result — other adapters may return
   * an empty array.
   */
  parseDelta(content: string): readonly DeltaEntry[]
}

/**
 * Registry of {@link ArtifactParser} adapters keyed by format name.
 * (`'markdown'`, `'json'`, `'yaml'`, `'plaintext'`)
 */
export type ArtifactParserRegistry = ReadonlyMap<string, ArtifactParser>
