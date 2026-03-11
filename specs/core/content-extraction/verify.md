# Verification: Content Extraction

## Requirements

### Requirement: Extractor value object

#### Scenario: Extractor with all fields

- **WHEN** an extractor declares `selector`, `extract`, `capture`, `strip`, `groupBy`, `transform`, and `fields`
- **THEN** the schema registry parses and validates all fields without error

### Requirement: FieldMapping value object

#### Scenario: FieldMapping with followSiblings

- **WHEN** a field mapping declares `childSelector`, `capture`, and `followSiblings`
- **THEN** the schema registry parses and validates all fields without error

### Requirement: Extract modes

#### Scenario: Content mode skips heading

- **GIVEN** a section node with heading "Overview" and a paragraph child "Some text"
- **WHEN** `extractContent` runs with `extract: 'content'`
- **THEN** the result is `["Some text"]` — the heading is not included

#### Scenario: Label mode returns heading only

- **GIVEN** a section node with heading "Overview" and a paragraph child "Some text"
- **WHEN** `extractContent` runs with `extract: 'label'`
- **THEN** the result is `["Overview"]`

#### Scenario: Content mode on leaf node

- **GIVEN** a paragraph node with value "Hello world" and no children
- **WHEN** `extractContent` runs with `extract: 'content'`
- **THEN** the result includes the rendered node text

### Requirement: Simple extraction

#### Scenario: Extract with capture group

- **GIVEN** a section containing `[dep1](../dep1/spec.md) and [dep2](../dep2/spec.md)`
- **WHEN** `extractContent` runs with `capture: '\[.*?\]\(([^)]+)\)'`
- **THEN** the result is `["../dep1/spec.md", "../dep2/spec.md"]`

#### Scenario: Extract with strip

- **GIVEN** a section with label "Requirement: User Login"
- **WHEN** `extractContent` runs with `extract: 'label'` and `strip: '^Requirement:\s*'`
- **THEN** the result is `["User Login"]`

#### Scenario: Extract with named transform

- **GIVEN** extracted values `["../a/spec.md"]` and a transform `resolveSpecPath` that strips the relative path
- **WHEN** `extractContent` runs with `transform: 'resolveSpecPath'`
- **THEN** the transform is applied to the result array

#### Scenario: No matches returns empty array

- **WHEN** the selector matches zero nodes
- **THEN** `extractContent` returns `[]`

### Requirement: Grouped extraction

#### Scenario: Nodes grouped by label

- **GIVEN** two section nodes: "Requirement: Auth" with two list-item children and "Requirement: Logging" with one
- **WHEN** `extractContent` runs with `groupBy: 'label'` and `strip: '^Requirement:\s*'`
- **THEN** the result has two groups: `{ label: "Auth", items: [...] }` and `{ label: "Logging", items: [...] }`

#### Scenario: Group content rendered as single block

- **GIVEN** a section "Requirement: Auth" with three list-item children
- **WHEN** `extractContent` runs with `groupBy: 'label'` and `extract: 'content'`
- **THEN** the group has one item containing all children rendered as a single text block

### Requirement: Structured extraction

#### Scenario: Fields produce structured objects

- **GIVEN** a "Scenario: Token Valid" section with list-item children for GIVEN, WHEN, THEN
- **WHEN** `extractContent` runs with `fields` mapping `name` from label and `given`/`when`/`then` via `childSelector`
- **THEN** the result is one object with `name: "Token Valid"`, `given: [...]`, `when: [...]`, `then: [...]`

#### Scenario: parentLabel walks ancestor chain

- **GIVEN** a "Scenario: X" section nested under "Requirement: Auth"
- **WHEN** a field declares `from: 'parentLabel'` with `strip: '^Requirement:\s*'`
- **THEN** the field value is `"Auth"`

### Requirement: Follow siblings

#### Scenario: AND items grouped with preceding keyword

- **GIVEN** list items in order: GIVEN a, AND b, WHEN c, THEN d, AND e
- **WHEN** `extractContent` runs with `followSiblings: '^(?:AND|OR)\b'` on each field
- **THEN** given is `["a", "AND b"]`, when is `["c"]`, then is `["d", "AND e"]`

#### Scenario: followSiblings with capture group strips prefix

- **GIVEN** list items in order: GIVEN a, AND b, THEN c
- **WHEN** `followSiblings` is `'^AND\s+(.+)'` (with capture group)
- **THEN** given is `["a", "b"]` — the AND prefix is captured away

#### Scenario: followSiblings without capture group preserves text

- **GIVEN** list items in order: GIVEN a, AND b, THEN c
- **WHEN** `followSiblings` is `'^(?:AND|OR)\b'` (no capture group)
- **THEN** given is `["a", "AND b"]` — the full text is preserved

#### Scenario: Scenario with no WHEN

- **GIVEN** list items in order: GIVEN a, AND b, THEN c
- **WHEN** `extractContent` runs with fields for given, when, and then
- **THEN** the result object has `given` and `then` but no `when` field

#### Scenario: Non-childSelector fields extracted normally

- **GIVEN** a structured extractor with `name: { from: 'label' }` and `given: { childSelector: ... , followSiblings: ... }`
- **WHEN** `extractContent` runs
- **THEN** `name` is extracted from the node's label independently of the sequential walk

### Requirement: SubtreeRenderer contract

#### Scenario: Renderer injected by caller

- **WHEN** `extractContent` is called
- **THEN** it uses the provided `SubtreeRenderer` to serialize nodes — it never imports or instantiates a parser

### Requirement: Transform callbacks

#### Scenario: Unknown transform silently ignored

- **GIVEN** an extractor with `transform: 'unknownTransform'`
- **AND** no transform by that name in the transforms map
- **WHEN** `extractContent` runs
- **THEN** the result is returned without transformation — no error is thrown
