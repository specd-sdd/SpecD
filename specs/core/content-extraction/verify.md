# Verification: Content Extraction

## Requirements

### Requirement: Extractor value object

#### Scenario: Extractor with shorthand and object transform declarations

- **WHEN** an extractor declares `transform: resolveSpecPath`
- **AND** another extractor declares `transform: { name: "join", args: ["$2", "/", "$1"] }`
- **THEN** the schema registry parses and validates both declarations without error

### Requirement: FieldMapping value object

#### Scenario: FieldMapping with followSiblings and transform

- **WHEN** a field mapping declares `childSelector`, `capture`, `followSiblings`, and `transform`
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
- **AND** each emitted value corresponds to the first capture group for its regex match

#### Scenario: Extract with strip

- **GIVEN** a section with label `Requirement: User Login`
- **WHEN** `extractContent` runs with `extract: 'label'` and `strip: '^Requirement:\s*'`
- **THEN** the result is `["User Login"]`

#### Scenario: Extract with named transform and interpolated args

- **GIVEN** extracted text `v2026-04-09`
- **AND** `capture` groups expose `$0 = v2026-04-09`, `$1 = 2026`, `$2 = 04`, `$3 = 09`
- **AND** a transform `joinDate` is registered with args `["$3", "/", "$2", "/", "$1"]`
- **WHEN** `extractContent` runs with that transform declaration
- **THEN** the transform is called with `value = "2026"` when the first capture group is the semantic value for that match
- **AND** the interpolated args are `["09", "/", "04", "/", "2026"]`

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

- **GIVEN** a `Scenario: Token Valid` section with list-item children for GIVEN, WHEN, THEN
- **WHEN** `extractContent` runs with `fields` mapping `name` from label and `given`/`when`/`then` via `childSelector`
- **THEN** the result is one object with `name: "Token Valid"`, `given: [...]`, `when: [...]`, `then: [...]`

#### Scenario: parentLabel walks ancestor chain

- **GIVEN** a `Scenario: X` section nested under `Requirement: Auth`
- **WHEN** a field declares `from: 'parentLabel'` with `strip: '^Requirement:\s*'`
- **THEN** the field value is `Auth`

#### Scenario: Field transform runs per extracted field value

- **GIVEN** a field mapping extracts `../shared/spec.md`
- **AND** that field declares `transform: resolveSpecPath`
- **WHEN** structured extraction runs with a registry containing `resolveSpecPath`
- **THEN** the transform is applied to that field value before the structured result is returned

### Requirement: Follow siblings

#### Scenario: AND items grouped with preceding keyword

- **GIVEN** list items in order: GIVEN a, AND b, WHEN c, THEN d, AND e
- **WHEN** `extractContent` runs with `followSiblings: '^(?:AND|OR)\b'` on each field
- **THEN** given is `["a", "AND b"]`, when is `["c"]`, then is `["d", "AND e"]`

#### Scenario: followSiblings with capture group strips prefix

- **GIVEN** list items in order: GIVEN a, AND b, THEN c
- **WHEN** `followSiblings` is `'^AND\s+(.+)'` (with capture group)
- **THEN** the appended sibling value is `"b"` because `$1` is used as the semantic value for that follow-sibling match

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

#### Scenario: Unknown transform fails with ExtractorTransformError

- **GIVEN** an extractor with `transform: 'unknownTransform'`
- **AND** no transform by that name exists in the registry
- **WHEN** `extractContent` runs
- **THEN** extraction fails with `ExtractorTransformError`
- **AND** the error identifies `unknownTransform` as the missing transform name

#### Scenario: Field transform failure identifies the field

- **GIVEN** a structured extractor with a field `dependsOn` that declares `transform: resolveSpecPath`
- **AND** the registered transform throws while processing that field
- **WHEN** `extractContent` runs
- **THEN** extraction fails with `ExtractorTransformError`
- **AND** the error identifies `resolveSpecPath` as the transform name
- **AND** the error identifies `dependsOn` as the failing field

#### Scenario: Transform may fail when required context is absent

- **GIVEN** a registered transform requires `originSpecPath` in the context bag
- **AND** the caller omits that key
- **WHEN** `extractContent` runs and invokes the transform
- **THEN** extraction fails with `ExtractorTransformError`
- **AND** that failure propagates to the caller without being ignored

#### Scenario: Transform may not silently drop an extracted value

- **GIVEN** an extractor emits a value and a registered transform receives it
- **WHEN** that transform attempts to return a null value instead of a normalized string
- **THEN** extraction fails with `ExtractorTransformError`
- **AND** the value is not silently omitted from the final result

#### Scenario: resolveSpecPath accepts a canonical spec ID directly

- **GIVEN** an extractor captures the dependency label as `value`
- **AND** the extracted value is already the canonical spec ID `core:core/storage`
- **WHEN** `extractContent` runs with a registry containing `resolveSpecPath`
- **THEN** the transform returns `core:core/storage` as-is instead of failing or discarding the value

#### Scenario: resolveSpecPath falls back from value to captured href args

- **GIVEN** an extractor captures the dependency label as `value`
- **AND** the extracted value is the legacy label `specs/core/storage/spec.md`
- **AND** the transform args resolve to `["../storage/spec.md"]`
- **WHEN** `extractContent` runs with a registry containing `resolveSpecPath`
- **THEN** the transform first attempts to resolve `value`
- **AND** when `value` is not resolvable as a canonical spec ID it attempts the href args in order
- **AND** the transform returns `core:core/storage` from the first resolvable fallback candidate
