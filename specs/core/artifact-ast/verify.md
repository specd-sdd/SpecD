# Verification: Artifact AST

## Requirements

### Requirement: Common node schema

#### Scenario: value and children mutually exclusive

- **WHEN** a node has both `value` and `children`
- **THEN** the adapter must not produce such a node — it is an invalid AST

#### Scenario: label absent on non-identifying nodes

- **WHEN** a `paragraph`, `list`, `sequence`, `object`, or `document` node is produced
- **THEN** the node has no `label` field

### Requirement: Markdown AST

#### Scenario: Heading becomes section with label and level

- **GIVEN** a markdown file containing `### Requirement: Login`
- **WHEN** the markdown adapter parses it
- **THEN** the resulting AST contains a node `{ type: "section", label: "Requirement: Login", level: 3, children: [...] }`

#### Scenario: Section nests by heading level

- **GIVEN** a markdown file with a `## Requirements` heading followed by `### Requirement: Login`
- **WHEN** the markdown adapter parses it
- **THEN** the `Requirement: Login` section node is a child of the `Requirements` section node

#### Scenario: Non-contiguous heading levels nest correctly

- **GIVEN** a markdown file with a `# Overview` heading followed by `#### Detail` (no intermediate levels)
- **WHEN** the markdown adapter parses it
- **THEN** the `Detail` section node (`level: 4`) is a child of the `Overview` section node (`level: 1`)

#### Scenario: Paragraph becomes leaf node with value

- **GIVEN** a markdown file containing a prose paragraph
- **WHEN** the markdown adapter parses it
- **THEN** the resulting node is `{ type: "paragraph", value: "<text>" }` with no `children`

#### Scenario: Fenced code block preserves lang and content

- **GIVEN** a markdown file with ` ```typescript\nconst x = 1\n``` `
- **WHEN** the markdown adapter parses it
- **THEN** the resulting node is `{ type: "code-block", label: "typescript", value: "const x = 1" }`

#### Scenario: Unordered list

- **GIVEN** a markdown file with a bullet list
- **WHEN** the markdown adapter parses it
- **THEN** the resulting node is `{ type: "list", ordered: false, children: [{ type: "list-item", label: "..." }, ...] }`

#### Scenario: Round-trip preserves structure

- **GIVEN** a markdown AST produced by parsing a spec file
- **WHEN** the adapter serializes it back to markdown
- **THEN** re-parsing the output produces an identical AST

#### Scenario: Delta apply preserves inline metadata of untouched markdown nodes

- **GIVEN** a markdown AST where paragraph nodes keep adapter inline metadata for serialization
- **AND** a delta modifies a sibling section only
- **WHEN** the delta is applied and the AST is serialized
- **THEN** untouched paragraph nodes still preserve equivalent inline formatting intent after re-parse

#### Scenario: Mixed markdown style normalizes deterministically

- **GIVEN** markdown content with mixed markers for unordered lists or emphasis
- **WHEN** the markdown adapter serializes a parsed AST
- **THEN** output uses deterministic project markdown style for ambiguous constructs

### Requirement: YAML AST

#### Scenario: Scalar pair

- **GIVEN** a YAML file containing `schema: spec-driven`
- **WHEN** the YAML adapter parses it
- **THEN** the resulting AST contains `{ type: "pair", label: "schema", value: "spec-driven" }`

#### Scenario: Nested mapping under pair

- **GIVEN** a YAML file with `llm:\n  model: claude-opus-4-6`
- **WHEN** the YAML adapter parses it
- **THEN** the `llm` pair has `children` containing a `mapping` node, which has a `pair` child with `label: "model"`

#### Scenario: Sequence of scalars

- **GIVEN** a YAML file with a sequence of strings under a key
- **WHEN** the YAML adapter parses it
- **THEN** the pair has `children` containing a `sequence` node with `sequence-item` children each having `value`

#### Scenario: Sequence of objects

- **GIVEN** a YAML file with a sequence of mappings (e.g. workflow steps)
- **WHEN** the YAML adapter parses it
- **THEN** each `sequence-item` has `children` containing a `mapping` node with `pair` children

#### Scenario: Round-trip preserves comments

- **GIVEN** a YAML file with inline comments
- **WHEN** the YAML adapter parses and re-serializes it without modification
- **THEN** the output preserves all comments

### Requirement: JSON AST

#### Scenario: Object property

- **GIVEN** a JSON file containing `{ "version": "1.0.0" }`
- **WHEN** the JSON adapter parses it
- **THEN** the AST contains a `property` node with `label: "version"` and `value: "1.0.0"`

#### Scenario: Nested object

- **GIVEN** a JSON file with a nested object value
- **WHEN** the JSON adapter parses it
- **THEN** the property has `children` containing an `object` node with `property` children

#### Scenario: Array of scalars

- **GIVEN** a JSON file with `"keywords": ["specd", "spec-driven"]`
- **WHEN** the JSON adapter parses it
- **THEN** the `keywords` property has `children` containing an `array` node with `array-item` children each having `value`
