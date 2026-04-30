# Verification: ArtifactParser Port

## Requirements

### Requirement: ArtifactParser interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `ArtifactParser`
- **WHEN** the class implements all required methods and the `fileExtensions` property
- **THEN** it compiles and can be instantiated

### Requirement: ArtifactParserRegistry type

#### Scenario: Registry keyed by format name

- **GIVEN** an `ArtifactParserRegistry` instance
- **WHEN** queried with `"markdown"`, `"json"`, `"yaml"`, or `"plaintext"`
- **THEN** each key returns the corresponding `ArtifactParser` adapter

### Requirement: ArtifactParserRegistry is additively extensible

#### Scenario: External parser registration preserves built-ins

- **GIVEN** built-in parsers for markdown, yaml, json, and plaintext
- **AND** an external parser is registered for `toml`
- **WHEN** the parser registry is exposed from the kernel
- **THEN** `toml` is available alongside the built-ins
- **AND** existing built-in format lookups continue to work unchanged

#### Scenario: Unknown parser format fails clearly

- **GIVEN** no built-in or external parser is registered for `graphql`
- **WHEN** a caller requests the parser for `graphql`
- **THEN** the operation fails with a clear unknown-format error

### Requirement: Parse contract

#### Scenario: Valid content produces an AST with a root node

- **WHEN** `parse` is called with valid content for the format
- **THEN** it returns an `ArtifactAST` whose `root` property is a non-null `ArtifactNode`

### Requirement: Apply contract — atomic selector resolution

#### Scenario: All selectors resolve successfully

- **GIVEN** a valid AST and delta entries whose selectors all match exactly one node
- **WHEN** `apply` is called
- **THEN** it returns a `DeltaApplicationResult` whose `ast` has all operations applied
- **AND** `warnings` is empty when no semantic issues are detected

#### Scenario: One selector fails to resolve

- **GIVEN** a valid AST and delta entries where one selector matches no node
- **WHEN** `apply` is called
- **THEN** it throws a `DeltaApplicationError` and no changes are applied

#### Scenario: Ambiguous selector match

- **GIVEN** a valid AST and a delta entry whose selector matches multiple nodes
- **WHEN** `apply` is called
- **THEN** it throws a `DeltaApplicationError`

### Requirement: Serialize round-trip

#### Scenario: Parse then serialize produces equivalent content

- **GIVEN** a valid content string
- **WHEN** `parse` is called followed by `serialize`
- **THEN** parsing the serialized output produces an AST equivalent to the original

#### Scenario: Markdown serialize preserves untouched inline formatting

- **GIVEN** a markdown AST containing inline code, emphasis, and strong in one paragraph
- **AND** delta application modifies a different node in the same document
- **WHEN** the markdown adapter serializes the resulting AST
- **THEN** the untouched paragraph preserves inline formatting intent (inline code/emphasis/strong)

#### Scenario: Markdown serializer uses source style when unambiguous

- **GIVEN** a markdown source that consistently uses `-` bullets and `_` emphasis
- **WHEN** the markdown adapter parses, applies delta, and serializes
- **THEN** output keeps `-` as bullet marker and `_` as emphasis marker where representable

#### Scenario: Markdown serializer resolves mixed style deterministically

- **GIVEN** a markdown source that mixes both supported markers for bullets or emphasis
- **WHEN** the markdown adapter serializes the AST
- **THEN** output uses deterministic project markdown conventions for the ambiguous construct

### Requirement: RenderSubtree contract

#### Scenario: Single node renders to native format

- **GIVEN** an `ArtifactNode` from a parsed AST
- **WHEN** `renderSubtree` is called with that node
- **THEN** it returns a string in the artifact's native format representing that node and all its descendants

### Requirement: ParseDelta contract

#### Scenario: YAML adapter parses delta content

- **GIVEN** the YAML adapter and valid delta YAML content
- **WHEN** `parseDelta` is called
- **THEN** it returns a non-empty array of `DeltaEntry` objects

#### Scenario: Non-YAML adapter returns empty array

- **GIVEN** a markdown or plaintext adapter
- **WHEN** `parseDelta` is called with any content
- **THEN** it MAY return an empty array

#### Scenario: no-op mixed with other entries — rejection

- **GIVEN** the YAML adapter and delta content containing `[{ op: "no-op" }, { op: "added", content: "..." }]`
- **WHEN** `parseDelta` is called
- **THEN** it throws `SchemaValidationError` explaining that `no-op` cannot be mixed with other operations

#### Scenario: no-op as sole entry — accepted

- **GIVEN** the YAML adapter and delta content containing `[{ op: "no-op", description: "No changes needed" }]`
- **WHEN** `parseDelta` is called
- **THEN** it returns an array with one `DeltaEntry` where `op` is `"no-op"` and `description` is `"No changes needed"`

### Requirement: DeltaEntry shape

#### Scenario: DeltaEntry with no-op op

- **GIVEN** a delta entry with `op: "no-op"`
- **WHEN** `parseDelta` is called
- **THEN** the returned `DeltaEntry` has `op` equal to `"no-op"`

#### Scenario: DeltaEntry with description field

- **GIVEN** a delta entry with `op: "modified"` and `description: "Update constructor"`
- **WHEN** `parseDelta` is called
- **THEN** the returned `DeltaEntry` has `description` equal to `"Update constructor"`

### Requirement: ArtifactNode shape

#### Scenario: Markdown section node has level

- **GIVEN** a markdown AST containing a heading
- **WHEN** the corresponding `ArtifactNode` is inspected
- **THEN** it has a `level` property indicating the heading depth

#### Scenario: Markdown list node has ordered flag

- **GIVEN** a markdown AST containing an ordered list
- **WHEN** the corresponding `ArtifactNode` is inspected
- **THEN** it has `ordered` set to `true`

### Requirement: Node nature descriptors

#### Scenario: Markdown nodeTypes include nature flags

- **WHEN** `nodeTypes()` is called on the markdown adapter
- **THEN** each `NodeTypeDescriptor` includes `isCollection`, `isSequence`, `isSequenceItem`, `isContainer`, and `isLeaf` flags
- **AND** `document` has `isCollection: false, isSequence: false, isSequenceItem: false, isContainer: true, isLeaf: false`
- **AND** `section` has `isCollection: false, isSequence: false, isSequenceItem: false, isContainer: true, isLeaf: false`
- **AND** `paragraph` has `isCollection: false, isSequence: false, isSequenceItem: false, isContainer: false, isLeaf: true`
- **AND** `list` has `isCollection: true, isSequence: true, isSequenceItem: false, isContainer: true, isLeaf: false`
- **AND** `list-item` has `isCollection: false, isSequence: false, isSequenceItem: true, isContainer: true, isLeaf: false`
- **AND** `code-block` has `isCollection: false, isSequence: false, isSequenceItem: false, isContainer: false, isLeaf: true`
- **AND** `thematic-break` has `isCollection: false, isSequence: false, isSequenceItem: false, isContainer: false, isLeaf: false`

#### Scenario: JSON nodeTypes include nature flags

- **WHEN** `nodeTypes()` is called on the JSON adapter
- **THEN** `document` has `isCollection: false, isSequence: false, isContainer: true, isLeaf: false`
- **AND** `object` has `isCollection: true, isSequence: false, isContainer: true, isLeaf: false`
- **AND** `property` has `isCollection: false, isSequence: false, isContainer: true, isLeaf: true` (identifiedBy includes "matches", so has label)
- **AND** `array` has `isCollection: true, isSequence: true, isContainer: true, isLeaf: false`
- **AND** `array-item` has `isCollection: false, isSequence: false, isSequenceItem: true, isContainer: true, isLeaf: true`

#### Scenario: YAML nodeTypes include nature flags

- **WHEN** `nodeTypes()` is called on the YAML adapter
- **THEN** `document` has `isCollection: false, isSequence: false, isContainer: true, isLeaf: false`
- **AND** `mapping` has `isCollection: true, isSequence: false, isContainer: true, isLeaf: false`
- **AND** `pair` has `isCollection: false, isSequence: false, isContainer: true, isLeaf: true` (identifiedBy includes "matches", so has label)
- **AND** `sequence` has `isCollection: true, isSequence: true, isContainer: true, isLeaf: false`
- **AND** `sequence-item` has `isCollection: false, isSequence: false, isSequenceItem: true, isContainer: true, isLeaf: true`

#### Scenario: Plaintext nodeTypes include nature flags

- **WHEN** `nodeTypes()` is called on the plaintext adapter
- **THEN** `document` has `isCollection: false, isSequence: false, isContainer: true, isLeaf: false`
- **AND** `paragraph` has `isCollection: true, isSequence: false, isContainer: false, isLeaf: false`
- **AND** `line` has `isCollection: false, isSequence: false, isContainer: false, isLeaf: true`

#### Scenario: No hardcoded type vectors in applyDelta

- **WHEN** the source of `applyDelta` is inspected
- **THEN** there are no hardcoded arrays of type names like `['array', 'sequence', 'list']` or `['array-item', 'sequence-item', 'list-item']`
- **AND** all collection-aware logic uses descriptor flag lookups (`isSequence`, `isSequenceItem`, `isCollection`)

### Requirement: Outline contract

#### Scenario: Default outline remains compact

- **WHEN** `outline(ast)` is called on each built-in adapter in default mode
- **THEN** markdown returns `section` entries
- **AND** json returns `property` and `array-item` entries
- **AND** yaml returns `pair` entries
- **AND** plaintext returns `paragraph` entries

#### Scenario: Existing outline fields remain required

- **GIVEN** an `OutlineEntry` object
- **WHEN** it is validated against the interface
- **THEN** `type`, `label`, and `depth` remain required
- **AND** `children` remains optional
