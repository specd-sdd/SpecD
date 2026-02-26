# Verification: Delta Format

## Requirements

### Requirement: ArtifactParser port

#### Scenario: nodeTypes returns format-specific vocabulary

- **WHEN** `nodeTypes()` is called on the markdown parser
- **THEN** it returns descriptors including `section` (identified by `heading`), `paragraph`, `list`, `list-item`, and `code-block`

#### Scenario: nodeTypes returns JSON vocabulary

- **WHEN** `nodeTypes()` is called on the JSON parser
- **THEN** it returns descriptors including `property` (identified by `key`), `object`, `array`, and `array-item`

#### Scenario: deltaInstructions returns format-specific selector guidance

- **WHEN** `deltaInstructions()` is called on the markdown adapter
- **THEN** it returns a string describing the selector fields (`type`, `heading`, `parent`), the semantics of `content` for `modified` and `added`, the delta file location pattern, and a concrete YAML example mapping an AST section node to a delta entry

#### Scenario: deltaInstructions returns format-specific value guidance for JSON

- **WHEN** `deltaInstructions()` is called on the JSON adapter
- **THEN** it returns a string describing `type: property`, `key`, `value`, `index`, `where`, and includes a concrete example using `op: modified` with a `value` field

#### Scenario: outline reflects current artifact nodes

- **WHEN** `outline(ast)` is called on a parsed markdown spec with three `### Requirement:` headings
- **THEN** it returns three `OutlineEntry` objects with `type: section` and their respective heading texts as `label`

#### Scenario: apply rejects on unresolved selector

- **WHEN** a delta entry has a selector that matches no node in the AST
- **THEN** `apply` must throw `DeltaApplicationError` without modifying the AST

#### Scenario: apply rejects on ambiguous selector

- **WHEN** a delta entry has a selector that matches more than one node and a single match is expected
- **THEN** `apply` must throw `DeltaApplicationError` without modifying the AST

#### Scenario: serialize round-trips YAML comments

- **WHEN** a YAML artifact containing inline comments is parsed and serialised without modification
- **THEN** the serialised output preserves all comments

### Requirement: Selector model

#### Scenario: matches — plain string acts as regex

- **WHEN** a selector has `type: section` and `matches: "Requirement: Load"`
- **THEN** it matches any section node whose identifier contains `"Requirement: Load"` (case-insensitive regex)

#### Scenario: matches — anchored regex

- **WHEN** a selector has `matches: "^Requirement:"`
- **THEN** it matches any section node whose identifier starts with `"Requirement:"`

#### Scenario: contains matches node value

- **WHEN** a selector has `type: paragraph` and `contains: "SHALL"`
- **THEN** it matches any paragraph node whose `value` contains `"SHALL"` (case-insensitive)

#### Scenario: contains and matches combined

- **WHEN** a selector has `type: pair`, `matches: "^op$"`, and `contains: "added|modified"`
- **THEN** it matches only `pair` nodes whose label is `"op"` AND whose value matches `"added|modified"`

#### Scenario: parent narrows search

- **WHEN** two `pair` nodes share `matches: model` at different nesting levels and a selector has `matches: model` with `parent: { type: pair, matches: llm }`
- **THEN** only the node nested under `llm` is matched

#### Scenario: index targets array item

- **WHEN** a selector has `type: array-item` and `index: 0`
- **THEN** it targets the first item of the nearest matching array

#### Scenario: where targets object array item

- **WHEN** a selector has `type: sequence-item`, `parent: { type: pair, matches: steps }`, and `where: { name: "Run tests" }`
- **THEN** it targets the sequence item under `steps` whose `name` field matches the regex `"Run tests"` (case-insensitive)

#### Scenario: index and where mutually exclusive

- **WHEN** a selector declares both `index` and `where`
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: strategy append adds items to end

- **WHEN** a delta entry targets a `property` node whose value is `["a", "b"]` with `strategy: append` and `value: ["c"]`
- **THEN** the resulting array is `["a", "b", "c"]`

#### Scenario: strategy merge-by replaces matched and preserves unmatched

- **WHEN** a delta targets a sequence with items `[{name: "a", run: "old"}, {name: "b", run: "old"}]` using `strategy: merge-by`, `mergeKey: name`, and `value: [{name: "a", run: "new"}]`
- **THEN** the result is `[{name: "a", run: "new"}, {name: "b", run: "old"}]`

#### Scenario: merge-by without mergeKey

- **WHEN** a delta entry has `strategy: merge-by` but no `mergeKey`
- **THEN** `apply` must throw `DeltaApplicationError`

### Requirement: Delta file format

#### Scenario: modified replaces node body only

- **WHEN** a delta entry has `op: modified`, a selector matching a `section` node, and `content` with new markdown
- **THEN** `apply` replaces that section's body with the supplied content; the heading line is unchanged

#### Scenario: modified with rename updates identifying property

- **WHEN** a delta entry has `op: modified`, a selector matching `matches: "Requirement: Login"`, and `rename: "Requirement: Authentication"`
- **THEN** the section heading becomes `"Requirement: Authentication"` in the serialised output

#### Scenario: rename with body update in one operation

- **WHEN** a delta entry has both `rename` and `content` on a `modified` entry
- **THEN** both are applied — the heading is renamed and the body is replaced

#### Scenario: rename collides with existing sibling

- **WHEN** a delta entry renames a section to a heading that already exists as a sibling
- **THEN** `apply` must throw `DeltaApplicationError` before applying any changes

#### Scenario: rename on added entry is invalid

- **WHEN** a delta entry has `op: added` and includes `rename`
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: added appends when no position

- **WHEN** a delta entry has `op: added` and omits `position`
- **THEN** the new node is appended at the end of the document

#### Scenario: added with position.parent appends as last child

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Requirements" } }` with no placement hint
- **THEN** the new node is appended as the last child of the matched `Requirements` section

#### Scenario: added positions after matched sibling

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Requirements" }, after: { type: section, matches: "Requirement: A" } }`
- **THEN** the new node is inserted immediately after the `Requirement: A` section within `Requirements`

#### Scenario: position.after resolves to no node — fallback to end of parent

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Requirements" }, after: { type: section, matches: "Requirement: Deleted" } }` but the `after` node does not exist
- **THEN** the new node is appended at the end of the parent scope and a warning is emitted; no error is thrown

#### Scenario: position.first inserts as first child

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Requirements" }, first: true }`
- **THEN** the new node is inserted before all existing children of the matched `Requirements` section

#### Scenario: position.last inserts as last child

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Requirements" }, last: true }`
- **THEN** the new node is appended after all existing children of the matched `Requirements` section

#### Scenario: position.parent resolves to no node — error

- **WHEN** a delta entry has `op: added` and `position: { parent: { type: section, matches: "Nonexistent" } }` but no such node exists
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: removed detaches node

- **WHEN** a delta entry has `op: removed` and a selector matching a `section` node
- **THEN** that section is absent from the serialised output

#### Scenario: content and value mutually exclusive

- **WHEN** a delta entry declares both `content` and `value`
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: position placement hints mutually exclusive

- **WHEN** an `added` entry declares more than one of `position.after`, `position.before`, `position.first`, `position.last`
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: delta file inferred from filename prefix

- **WHEN** a file named `spec.md.delta.yaml` is present in the change directory
- **THEN** the system associates it with the artifact whose output filename is `spec.md`

### Requirement: Delta application

#### Scenario: entries applied in declaration order

- **WHEN** a delta has two `modified` entries targeting different nodes
- **THEN** the first entry is applied before the second, and both changes appear in the result

#### Scenario: removed followed by added at same position

- **WHEN** a delta removes a node and then adds a new node `after` the preceding sibling
- **THEN** the old node is absent and the new node appears at the correct position

#### Scenario: entire delta rejected on single selector failure

- **WHEN** a delta has three entries and the second selector resolves to no node
- **THEN** `apply` throws `DeltaApplicationError` and none of the three operations are applied

### Requirement: Delta conflict detection

#### Scenario: Two entries targeting the same node

- **WHEN** a delta has two `modified` entries whose selectors both resolve to the same node
- **THEN** `apply` must throw `DeltaApplicationError` before applying any changes

#### Scenario: strategy on non-array target

- **WHEN** a delta entry specifies `strategy: append` but the selector targets a `section` node
- **THEN** `apply` must throw `DeltaApplicationError`

#### Scenario: multiple position placement hints — error

- **WHEN** an `added` entry declares both `position.first: true` and `position.last: true` (or any two of `first`, `last`, `after`, `before`)
- **THEN** `apply` must throw `DeltaApplicationError`

### Requirement: Delta structural validation

Scenarios for `deltaValidations` rules are in [`specs/core/schema-format/verify.md` — Requirement: Delta validation rules](../schema-format/verify.md).
