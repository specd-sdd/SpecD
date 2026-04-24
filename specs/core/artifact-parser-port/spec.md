# ArtifactParser Port

## Purpose

Artifacts come in multiple file formats (markdown, YAML, JSON, plaintext), each with its own parsing, delta, and serialization semantics, so domain services need a uniform interface to operate on any format without importing concrete parsing libraries. `ArtifactParser` and `ArtifactParserRegistry` define this application-layer port — each supported format has a corresponding infrastructure adapter, and the registry collects all adapters keyed by format name.

## Requirements

### Requirement: ArtifactParser interface shape

The port MUST be declared as a TypeScript `interface` named `ArtifactParser`. It SHALL define the following members:

- `fileExtensions: readonly string[]` — the file extensions this adapter handles
- `parse(content: string): ArtifactAST` — parse content into a normalised AST
- `apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): DeltaApplicationResult` — apply delta entries to an AST, returning the modified AST plus any semantic validation warnings
- `serialize(ast: ArtifactAST): string` — serialise an AST back to native format
- `renderSubtree(node: ArtifactNode): string` — serialise a single node and its descendants
- `nodeTypes(): readonly NodeTypeDescriptor[]` — describe addressable node types for the format
- `outline(ast: ArtifactAST): readonly OutlineEntry[]` — produce a navigable summary of addressable nodes
- `deltaInstructions(): string` — return format-specific static text for delta generation context
- `parseDelta(content: string): readonly DeltaEntry[]` — parse a YAML delta file into typed entries

### Requirement: ArtifactParserRegistry type

The `ArtifactParserRegistry` type MUST be declared as `ReadonlyMap<string, ArtifactParser>`, keyed by format name. Standard format names are `'markdown'`, `'json'`, `'yaml'`, and `'plaintext'`.

### Requirement: ArtifactParserRegistry is additively extensible

`ArtifactParserRegistry` SHALL support additive extension through kernel composition. Built-in parsers remain available, and external parser registrations extend the registry by format name.

Referencing a parser format that is not present in the merged registry MUST fail with a clear error.

### Requirement: Parse contract

The `parse` method MUST accept a `content: string` parameter and return an `ArtifactAST` containing a single `root` node. The AST MUST be a normalised, format-independent tree structure.

### Requirement: Apply contract — atomic selector resolution

The `apply` method MUST resolve all selectors before applying any operation. If any selector fails to resolve (no match or ambiguous match), the entire application MUST be rejected with a `DeltaApplicationError`. Partial application SHALL NOT occur.

The method returns a `DeltaApplicationResult` containing the modified AST and any semantic validation warnings. Callers MUST check `result.warnings` for ambiguity warnings on hybrid node types.

### Requirement: Serialize round-trip

Calling `serialize(parse(content))` MUST produce output that, when parsed again, yields an equivalent AST. Implementations SHOULD preserve formatting where practical, but semantic equivalence is the binding constraint.

For the markdown adapter, serialize/apply behavior MUST preserve inline formatting intent represented in the AST (for example inline code, emphasis, and strong markers) for nodes not targeted by delta operations.

The markdown adapter MUST support serializer style options derived from source content (at minimum unordered list marker, emphasis marker, and strong marker) so merged output can preserve original style where unambiguous.

If source style is ambiguous (mixed markers for the same construct), the markdown adapter MUST serialize deterministically using project markdown conventions so output is stable across runs.

### Requirement: RenderSubtree contract

The `renderSubtree` method MUST accept a single `ArtifactNode` and return the native format string for that node and all its descendants. This is used by `ValidateArtifacts` for `contentMatches` evaluation and by the metadata extraction engine.

### Requirement: NodeTypes contract

The `nodeTypes` method MUST return a static array of `NodeTypeDescriptor` entries describing every addressable node type for the format. Each descriptor MUST include `type`, `identifiedBy`, and `description`.

### Requirement: Node nature descriptors

Each `NodeTypeDescriptor` returned by `nodeTypes()` MUST include boolean flags that declaratively describe the nature of the node type. These flags drive the `applyDelta` engine's collection-aware logic and semantic validation — they MUST accurately reflect the AST structure that the parser produces.

#### Structural flags

- `isContainer: boolean` — the node has or can have a `children` array. True for any node that can hold child nodes, regardless of whether those children are homogeneous or heterogeneous. Examples: `document` (holds sections, paragraphs, lists...), `section` (holds paragraphs, lists, nested sections...), `list` (holds `list-item` nodes), `object` (holds `property` nodes).
- `isLeaf: boolean` — the node has or can have a scalar `value` field (`string | number | boolean | null`). True for nodes that represent atomic data, not structural containers. Examples: `paragraph` (text content), `code-block` (source code), `line` (single line of text). A node that wraps a complex value (e.g. JSON `property` wrapping an object) can be BOTH `isContainer: true` AND `isLeaf: true` — these are hybrid types.
- A node that is neither container nor leaf (e.g. markdown `thematic-break`) is a void node — it has neither `children` nor `value`. All three flags being `false` is valid but means the node cannot be meaningfully modified by delta operations.

#### Collection flags

- `isCollection: boolean` — the node's children are homogeneous: ALL children are of the same type (or the same small set of closely related types). For example: `list` always has `list-item` children, `object` always has `property` children, `array` always has `array-item` children. Contrast with `section` which has heterogeneous children (paragraphs, lists, code blocks, nested sections) — `section` is `isContainer: true` but `isCollection: false`. Controls same-type unwrapping in `added` entries: when the parent scope is a collection and parsed content starts with the same type, the engine unwraps to the inner children instead of nesting.
- `isSequence: boolean` — the node is an ordered sequential collection where position matters and items can be appended, reordered, or merged by key. This is a subset of `isCollection`: `list`, `array`, and `sequence` are sequences, but `object` and `mapping` are NOT (their children are key-value pairs identified by name, not by position). Controls whether `strategy` (append/merge-by) is valid and whether the node is treated as "array-like" by the delta engine.
- `isSequenceItem: boolean` — the node is a positional item within a sequential collection. True for `list-item`, `array-item`, and `sequence-item`. These nodes may themselves be hybrids (e.g. an `array-item` can wrap a scalar value or an entire object). Used for "all children are sequence items" detection and for finding inner array nodes wrapped inside property/pair containers.

#### Example flag assignments

| Node                  | isCollection | isSequence | isSequenceItem | isContainer | isLeaf | Why                                                           |
| --------------------- | :----------: | :--------: | :------------: | :---------: | :----: | ------------------------------------------------------------- |
| `document` (md)       |      F       |     F      |       F        |      T      |   F    | Has heterogeneous children (sections, paragraphs...)          |
| `section` (md)        |      F       |     F      |       F        |      T      |   F    | Has heterogeneous children (paragraphs, lists...)             |
| `list` (md)           |      T       |     T      |       F        |      T      |   F    | Homogeneous ordered children (list-items), supports strategy  |
| `list-item` (md)      |      F       |     F      |       T        |      T      |   F    | Item within a list, may have nested lists as children         |
| `paragraph` (md)      |      F       |     F      |       F        |      F      |   T    | Scalar text value, no children                                |
| `object` (json)       |      T       |     F      |       F        |      T      |   F    | Homogeneous children (properties), but keyed not ordered      |
| `property` (json)     |      F       |     F      |       F        |      T      |   T    | Hybrid: wraps scalar value OR object/array as child           |
| `array` (json)        |      T       |     T      |       F        |      T      |   F    | Homogeneous ordered children (array-items), supports strategy |
| `array-item` (json)   |      F       |     F      |       T        |      T      |   T    | Hybrid item: scalar value OR object/array as child            |
| `thematic-break` (md) |      F       |     F      |       F        |      F      |   F    | Void: no children, no value                                   |

The shared `applyDelta` engine MUST use these flags instead of hardcoded type vectors for all collection-aware logic.

### Requirement: Outline contract

The `outline` method MUST return a simplified navigable summary of the artifact's addressable nodes, suitable for injection into LLM context during delta generation.

### Requirement: DeltaInstructions contract

The `deltaInstructions` method MUST return a format-specific static text block that is injected verbatim when `delta: true` is active for an artifact.

### Requirement: ParseDelta contract

The `parseDelta` method MUST accept a YAML delta file's raw content and return a typed array of `DeltaEntry` objects. Only the YAML adapter is expected to return a non-empty result; other adapters MAY return an empty array.

If the parsed array contains a `no-op` entry alongside any other entry, `parseDelta` MUST throw a `SchemaValidationError` explaining that `no-op` cannot be mixed with other operations.

### Requirement: ArtifactAST shape

The `ArtifactAST` interface MUST contain a single `root: ArtifactNode` property.

### Requirement: ArtifactNode shape

The `ArtifactNode` interface MUST contain:

- `type: string` — the node type identifier
- `label?: string` — optional label
- `value?: string | number | boolean | null` — optional scalar value
- `children?: readonly ArtifactNode[]` — optional child nodes
- `level?: number` — present on markdown section nodes
- `ordered?: boolean` — present on markdown list nodes
- Arbitrary extra fields via an index signature for adapter-specific metadata

### Requirement: DeltaEntry shape

Each `DeltaEntry` MUST contain:

- `op: 'added' | 'modified' | 'removed' | 'no-op'` — the operation type
- `selector?: Selector` — optional node selector; not valid for `no-op`
- `position?: DeltaPosition` — optional positioning directive; not valid for `no-op`
- `rename?: string` — optional new name for rename operations; not valid for `no-op`
- `content?: string` — optional content payload; not valid for `no-op`
- `value?: unknown` — optional value payload; not valid for `no-op`
- `strategy?: 'replace' | 'append' | 'merge-by'` — optional merge strategy; not valid for `no-op`
- `mergeKey?: string` — optional key for `merge-by` strategy; not valid for `no-op`
- `description?: string` — optional free-text description of what this entry does or why; valid on all operation types; ignored during application

### Requirement: Supporting type shapes

- `NodeTypeDescriptor` MUST contain `type: string`, `identifiedBy: readonly string[]`, `description: string`, `isCollection: boolean`, `isSequence: boolean`, `isSequenceItem: boolean`, `isContainer: boolean`, and `isLeaf: boolean`.
- `OutlineEntry` MUST contain `type: string`, `label: string`, `depth: number`, and optional `children: readonly OutlineEntry[]`.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on any parsing library (remark, yaml, etc.) at the port level
- Domain services never reference concrete parsers — only this port interface
- `Selector` and `DeltaPosition` are domain value objects imported from `domain/value-objects/`

## Spec Dependencies

- [`default:_global/architecture`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`core:core/artifact-ast`](../artifact-ast/spec.md) — AST structure and node type definitions
- [`core:core/delta-format`](../delta-format/spec.md) — delta entry format and application semantics
- [`core:core/selector-model`](../selector-model/spec.md) — selector resolution model
