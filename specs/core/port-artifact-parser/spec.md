# ArtifactParser Port

## Purpose

Artifacts come in multiple file formats (markdown, YAML, JSON, plaintext), each with its own parsing, delta, and serialization semantics, so domain services need a uniform interface to operate on any format without importing concrete parsing libraries. `ArtifactParser` and `ArtifactParserRegistry` define this application-layer port — each supported format has a corresponding infrastructure adapter, and the registry collects all adapters keyed by format name.

## Requirements

### Requirement: ArtifactParser interface shape

The port MUST be declared as a TypeScript `interface` named `ArtifactParser`. It SHALL define the following members:

- `fileExtensions: readonly string[]` — the file extensions this adapter handles
- `parse(content: string): ArtifactAST` — parse content into a normalised AST
- `apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST` — apply delta entries to an AST
- `serialize(ast: ArtifactAST): string` — serialise an AST back to native format
- `renderSubtree(node: ArtifactNode): string` — serialise a single node and its descendants
- `nodeTypes(): readonly NodeTypeDescriptor[]` — describe addressable node types for the format
- `outline(ast: ArtifactAST): readonly OutlineEntry[]` — produce a navigable summary of addressable nodes
- `deltaInstructions(): string` — return format-specific static text for delta generation context
- `parseDelta(content: string): readonly DeltaEntry[]` — parse a YAML delta file into typed entries

### Requirement: ArtifactParserRegistry type

The `ArtifactParserRegistry` type MUST be declared as `ReadonlyMap<string, ArtifactParser>`, keyed by format name. Standard format names are `'markdown'`, `'json'`, `'yaml'`, and `'plaintext'`.

### Requirement: Parse contract

The `parse` method MUST accept a `content: string` parameter and return an `ArtifactAST` containing a single `root` node. The AST MUST be a normalised, format-independent tree structure.

### Requirement: Apply contract — atomic selector resolution

The `apply` method MUST resolve all selectors before applying any operation. If any selector fails to resolve (no match or ambiguous match), the entire application MUST be rejected with a `DeltaApplicationError`. Partial application SHALL NOT occur.

### Requirement: Serialize round-trip

Calling `serialize(parse(content))` MUST produce output that, when parsed again, yields an equivalent AST. Implementations SHOULD preserve formatting where practical, but semantic equivalence is the binding constraint.

### Requirement: RenderSubtree contract

The `renderSubtree` method MUST accept a single `ArtifactNode` and return the native format string for that node and all its descendants. This is used by `ValidateArtifacts` for `contentMatches` evaluation and by the metadata extraction engine.

### Requirement: NodeTypes contract

The `nodeTypes` method MUST return a static array of `NodeTypeDescriptor` entries describing every addressable node type for the format. Each descriptor MUST include `type`, `identifiedBy`, and `description`.

### Requirement: Outline contract

The `outline` method MUST return a simplified navigable summary of the artifact's addressable nodes, suitable for injection into LLM context during delta generation.

### Requirement: DeltaInstructions contract

The `deltaInstructions` method MUST return a format-specific static text block that is injected verbatim when `delta: true` is active for an artifact.

### Requirement: ParseDelta contract

The `parseDelta` method MUST accept a YAML delta file's raw content and return a typed array of `DeltaEntry` objects. Only the YAML adapter is expected to return a non-empty result; other adapters MAY return an empty array.

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

- `op: 'added' | 'modified' | 'removed'` — the operation type
- `selector?: Selector` — optional node selector
- `position?: DeltaPosition` — optional positioning directive
- `rename?: string` — optional new name for rename operations
- `content?: string` — optional content payload
- `value?: unknown` — optional value payload
- `strategy?: 'replace' | 'append' | 'merge-by'` — optional merge strategy
- `mergeKey?: string` — optional key for `merge-by` strategy

### Requirement: Supporting type shapes

- `NodeTypeDescriptor` MUST contain `type: string`, `identifiedBy: readonly string[]`, and `description: string`.
- `OutlineEntry` MUST contain `type: string`, `label: string`, `depth: number`, and optional `children: readonly OutlineEntry[]`.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on any parsing library (remark, yaml, etc.) at the port level
- Domain services never reference concrete parsers — only this port interface
- `Selector` and `DeltaPosition` are domain value objects imported from `domain/value-objects/`

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`specs/core/artifact-ast/spec.md`](../artifact-ast/spec.md) — AST structure and node type definitions
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — delta entry format and application semantics
- [`specs/core/selector-model/spec.md`](../selector-model/spec.md) — selector resolution model
