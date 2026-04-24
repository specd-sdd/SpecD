import { type DeltaPosition, type Selector } from '../../domain/value-objects/index.js'

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

/**
 * Result of applying a delta, containing the modified AST and any warnings
 * produced during semantic validation.
 *
 * Callers MUST check `warnings` for ambiguity warnings on hybrid node types
 * (e.g. a JSON `property` that accepts both `content` and `value`).
 */
export interface DeltaApplicationResult {
  /** The AST after all delta operations have been applied. */
  readonly ast: ArtifactAST
  /**
   * Semantic validation warnings. Non-fatal messages about ambiguous
   * operations on hybrid nodes (e.g. "this node accepts both content and
   * value — verify you chose the correct one"). Empty when no issues detected.
   */
  readonly warnings: readonly string[]
}

/**
 * Validates whether a delta entry's `content` field is semantically valid
 * for the given node type's nature flags.
 *
 * Returns an error message string if the operation is invalid, or `undefined`
 * if valid. Warning-level messages (for hybrid nodes) are appended to the
 * `warnings` array instead of being thrown.
 *
 * @param descriptors - Map of node type names to their descriptors
 * @param entry - The delta entry being validated
 * @param nodeType - The type name of the target node
 * @param warnings - Array to append warning messages to (for hybrid nodes)
 * @returns An error message if the operation is invalid, or `undefined` if valid
 */
export function validateContent(
  descriptors: ReadonlyMap<string, NodeTypeDescriptor>,
  entry: DeltaEntry,
  nodeType: string,
  warnings: string[] = [],
): string | undefined {
  if (entry.content === undefined) return undefined
  const descriptor = descriptors.get(nodeType)
  if (!descriptor) return undefined

  const hasLabel = descriptor.identifiedBy.length > 0

  if (descriptor.isContainer && descriptor.isLeaf) {
    warnings.push(
      `\`content\` on hybrid node type "${nodeType}" — this node accepts both \`content\` and \`value\`, verify you chose the correct one`,
    )
    return undefined
  }
  if (descriptor.isContainer) {
    if (hasLabel) {
      warnings.push(
        `\`content\` on container-with-label "${nodeType}" — consider using \`rename\` to update the identifier`,
      )
    }
    return undefined
  }
  if (descriptor.isLeaf) {
    if (hasLabel)
      return `\`content\` is not valid on leaf node type "${nodeType}" — use \`value\` or \`rename\``
    return `\`content\` is not valid on leaf node type "${nodeType}" — use \`value\``
  }

  if (hasLabel) return `\`content\` is not valid on node type "${nodeType}" — use \`rename\``
  return `\`content\` is not valid on node type "${nodeType}" — this node type cannot be modified`
}

/**
 * Validates whether a delta entry's `value` field is semantically valid
 * for the given node type's nature flags.
 *
 * @param descriptors - Map of node type names to their descriptors
 * @param entry - The delta entry being validated
 * @param nodeType - The type name of the target node
 * @param warnings - Array to append warning messages to (for hybrid nodes)
 * @returns An error message if the operation is invalid, or `undefined` if valid
 */
export function validateValue(
  descriptors: ReadonlyMap<string, NodeTypeDescriptor>,
  entry: DeltaEntry,
  nodeType: string,
  warnings: string[] = [],
): string | undefined {
  if (entry.value === undefined) return undefined
  const descriptor = descriptors.get(nodeType)
  if (!descriptor) return undefined

  const hasLabel = descriptor.identifiedBy.length > 0

  if (descriptor.isSequence) return undefined
  if (entry.strategy !== undefined) return undefined

  if (descriptor.isContainer && descriptor.isLeaf) {
    warnings.push(
      `\`value\` on hybrid node type "${nodeType}" — this node accepts both \`content\` and \`value\`, verify you chose the correct one`,
    )
    return undefined
  }
  if (descriptor.isLeaf) {
    if (hasLabel) {
      warnings.push(
        `\`value\` on leaf-with-label "${nodeType}" — consider using \`rename\` to update the identifier`,
      )
    }
    return undefined
  }
  if (descriptor.isContainer) {
    if (hasLabel)
      return `\`value\` is not valid on container "${nodeType}" — use \`content\` or \`rename\``
    return `\`value\` is not valid on container "${nodeType}" — use \`content\``
  }

  if (hasLabel) return `\`value\` is not valid on node type "${nodeType}" — use \`rename\``
  return `\`value\` is not valid on node type "${nodeType}" — this node type cannot be modified`
}

/**
 * Validates whether a delta entry's `rename` field is semantically valid
 * for the given node type's nature flags.
 *
 * Rename is only valid on nodes that have an identifier (`identifiedBy.length > 0`).
 *
 * @param descriptors - Map of node type names to their descriptors
 * @param entry - The delta entry being validated
 * @param nodeType - The type name of the target node
 * @param warnings - Array to append warning messages to (for hybrid nodes)
 * @returns An error message if the operation is invalid, or `undefined` if valid
 */
export function validateRename(
  descriptors: ReadonlyMap<string, NodeTypeDescriptor>,
  entry: DeltaEntry,
  nodeType: string,
  warnings: string[] = [],
): string | undefined {
  if (entry.rename === undefined) return undefined
  const descriptor = descriptors.get(nodeType)
  if (!descriptor) return undefined

  const hasLabel = descriptor.identifiedBy.length > 0

  if (!hasLabel) {
    return `\`rename\` is not valid on node type "${nodeType}" — this node has no identifying property to rename`
  }

  if (descriptor.isContainer && descriptor.isLeaf) {
    warnings.push(
      `\`rename\` on hybrid node type "${nodeType}" — this node accepts \`content\`, \`value\`, and \`rename\`, verify you chose the correct one`,
    )
  } else if (descriptor.isContainer) {
    warnings.push(
      `\`rename\` on container-with-label "${nodeType}" — consider using \`content\` to update children instead`,
    )
  } else if (descriptor.isLeaf) {
    warnings.push(
      `\`rename\` on leaf-with-label "${nodeType}" — consider using \`value\` to update the scalar value instead`,
    )
  }

  return undefined
}

/** A single operation entry in a delta file. */
export interface DeltaEntry {
  readonly op: 'added' | 'modified' | 'removed' | 'no-op'
  readonly selector?: Selector
  readonly position?: DeltaPosition
  readonly rename?: string
  readonly content?: string
  readonly value?: unknown
  readonly strategy?: 'replace' | 'append' | 'merge-by'
  readonly mergeKey?: string
  /** Free-text description of what this entry does or why. Ignored during application. */
  readonly description?: string
}

/**
 * Describes one addressable node type for a file format.
 *
 * Each parser adapter returns an array of these from `nodeTypes()`. The
 * `applyDelta` engine uses these descriptors for collection-aware logic,
 * unwrapping, and semantic validation of delta operations.
 *
 * ## Flag combinations reference
 *
 * Flags are NOT mutually exclusive — a node can be a container AND a leaf
 * (e.g. a JSON `property` wrapping an object, which has both `children` and
 * a scalar `value`). The only invalid combination is all `false` (a void node
 * like markdown's `thematic-break`).
 *
 * | isCollection | isSequence | isSequenceItem | isContainer | isLeaf | Example                         |
 * |:---:|:---:|:---:|:---:|:---:|:--------------------------------|
 * |  T  |  T  |  F  |  T  |  F  | `list`, `array`, `sequence`     |
 * |  T  |  F  |  F  |  T  |  F  | `object`, `mapping`             |
 * |  T  |  F  |  F  |  F  |  F  | `paragraph` (plaintext, wraps `line` children) |
 * |  F  |  F  |  T  |  T  |  F  | `list-item` (may wrap nested lists) |
 * |  F  |  F  |  T  |  T  |  T  | `array-item`, `sequence-item` (scalar or complex) |
 * |  F  |  F  |  F  |  T  |  F  | `section`, `document`           |
 * |  F  |  F  |  F  |  T  |  T  | `property`, `pair` (key wrapping scalar or complex) |
 * |  F  |  F  |  F  |  F  |  T  | `paragraph` (md), `code-block`, `line` |
 * |  F  |  F  |  F  |  F  |  F  | `thematic-break` (void)         |
 *
 * ## How flags drive `applyDelta`
 *
 * - **`isCollection`**: controls same-type unwrapping in `added` entries.
 *   When the parent scope is a collection and the parsed content's first
 *   child has the same type, the engine unwraps to the inner children
 *   (e.g. adding `"a\nb"` to a list unwraps the inner list-items).
 *
 * - **`isSequence`**: identifies ordered sequential collections (list,
 *   array, sequence) as opposed to keyed collections (object, mapping).
 *   Controls whether `strategy` (append/merge-by) is valid on the node
 *   and whether the node is treated as "array-like" for delta operations.
 *
 * - **`isSequenceItem`**: identifies items within a sequential collection.
 *   Used to detect "all children are sequence items" heuristics and to
 *   find inner array nodes wrapped inside property/pair containers.
 *
 * - **`isContainer`**: the node can have `children`. Hybrid nodes that are
 *   both container and leaf (e.g. `property` wrapping an object) set both
 *   `isContainer: true` AND `isLeaf: true`.
 *
 * - **`isLeaf`**: the node can have a scalar `value`. Hybrid nodes set both
 *   `isContainer: true` AND `isLeaf: true`.
 *
 * - **`identifiedBy`** (not a flag but related): if non-empty, the node has
 *   a label/identifier. Derived `hasLabel = identifiedBy.length > 0` is used
 *   for rename validation (rename is only valid on identified nodes).
 */
export interface NodeTypeDescriptor {
  /** Node type name, e.g. `"section"`, `"property"`, `"pair"`. */
  readonly type: string
  /** Selector properties that identify a node, e.g. `["matches"]`. Empty if the node has no label. */
  readonly identifiedBy: readonly string[]
  /** Human-readable description for LLM context generation. */
  readonly description: string
  /**
   * True if this node's children are uniform items of a single type
   * (e.g. `list` → `list-item`, `object` → `property`).
   * Controls same-type unwrapping in `added` entries.
   */
  readonly isCollection: boolean
  /**
   * True if this node is an ordered sequential collection (`list`, `array`, `sequence`).
   * `object` and `mapping` are collections but NOT sequences — their children
   * are key-value pairs, not ordered items.
   * Controls whether `strategy` (append/merge-by) is valid and whether the
   * node is treated as "array-like".
   */
  readonly isSequence: boolean
  /**
   * True if this node is an item within a sequential collection
   * (`list-item`, `array-item`, `sequence-item`).
   * Used for "all children are items" detection and inner-array lookup.
   */
  readonly isSequenceItem: boolean
  /**
   * True if this node can have `children`.
   * Hybrid types (e.g. `property` wrapping an object) set both `isContainer`
   * and `isLeaf` to `true`.
   */
  readonly isContainer: boolean
  /**
   * True if this node can have a scalar `value`.
   * Hybrid types set both `isContainer` and `isLeaf` to `true`.
   */
  readonly isLeaf: boolean
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
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): DeltaApplicationResult

  /** Serializes an AST back to the artifact's native format string. */
  serialize(ast: ArtifactAST): string

  /**
   * Serializes a single AST node and all its descendants back to the artifact's
   * native format string. Used by `ValidateArtifacts` to evaluate `contentMatches`
   * and by the metadata extraction engine to extract spec content.
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
