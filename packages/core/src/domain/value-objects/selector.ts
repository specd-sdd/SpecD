/**
 * Identifies one or more nodes in an artifact's AST.
 *
 * Used in delta entries (to target nodes for modification or removal), in
 * `contextSections` (to extract spec content), and in validation rules (to
 * assert structural constraints).
 *
 * All string fields (`matches`, `contains`, `where` values) are matched
 * case-insensitively as regular expressions.
 */
export interface Selector {
  /** Node type; must be one of the values returned by `ArtifactParser.nodeTypes()`. */
  readonly type: string
  /** Regex matched case-insensitively against the node's `label`. */
  readonly matches?: string
  /** Regex matched case-insensitively against the node's `value`. */
  readonly contains?: string
  /** Constrains the search to nodes whose nearest ancestor matches this selector. */
  readonly parent?: Selector
  /**
   * Targets the item at this zero-based index within an `array-item` or
   * `sequence-item` list. Mutually exclusive with `where`.
   */
  readonly index?: number
  /**
   * For `array-item` / `sequence-item` nodes that are objects, targets the
   * item whose fields match all key–value pairs (values are case-insensitive
   * regex). Mutually exclusive with `index`.
   */
  readonly where?: Readonly<Record<string, string>>
}

/**
 * Declares where a new node is inserted in an `added` delta entry.
 *
 * At most one of `after`, `before`, `first`, `last` may be set. If only
 * `parent` is specified, the new node is appended as the last child of the
 * matched parent. If `position` is omitted entirely, the node is appended at
 * document root level.
 */
export interface DeltaPosition {
  /** Scopes the insertion to the children of the matched node. */
  readonly parent?: Selector
  /** Inserts immediately after this sibling; falls back to append on no match. */
  readonly after?: Selector
  /** Inserts immediately before this sibling; falls back to append on no match. */
  readonly before?: Selector
  /** Inserts as the first child of the parent scope. */
  readonly first?: boolean
  /** Inserts as the last child of the parent scope (default when no hint given). */
  readonly last?: boolean
}
