# Verification: Get Spec Outline

## Requirements

### Requirement: Input

#### Scenario: All optional inputs missing

- **WHEN** `execute()` is called with only `workspace` and `specPath`
- **THEN** it resolves ALL spec-scoped artifacts from the active schema
- **AND** returns an outline for each one that exists on disk

### Requirement: Artifact Resolution

#### Scenario: Resolve by artifactId

- **WHEN** `execute()` is called with `artifactId: 'verify'`
- **THEN** it resolves the filename to `verify.md` (via schema)
- **AND** returns its outline

#### Scenario: Error on non-spec artifact scope

- **GIVEN** artifactId `design` has `scope: 'change'`
- **WHEN** `execute()` is called with `artifactId: 'design'`
- **THEN** it throws an error indicating the artifact must have `scope: 'spec'`

#### Scenario: Resolve by filename

- **WHEN** `execute()` is called with `filename: 'custom.md'`
- **THEN** it uses `custom.md` directly
- **AND** returns its outline

#### Scenario: Deduplicate artifactId and filename

- **GIVEN** artifactId `specs` resolves to `spec.md`
- **WHEN** `execute()` is called with `artifactId: 'specs'` AND `filename: 'spec.md'`
- **THEN** it only processes `spec.md` once
- **AND** returns a single result entry for `spec.md`

#### Scenario: Multiple different targets

- **GIVEN** artifactId `verify` resolves to `verify.md`
- **WHEN** `execute()` is called with `artifactId: 'verify'` AND `filename: 'spec.md'`
- **THEN** it processes both `verify.md` and `spec.md`
- **AND** returns two result entries

### Requirement: Outline Generation

#### Scenario: Parser selection by extension

- **GIVEN** an artifact with `.json` extension
- **WHEN** generating the outline
- **THEN** it uses the `JsonParser`
- **AND** returns the JSON hierarchical outline

#### Scenario: Default mode returns compact subset

- **WHEN** `GetSpecOutline` runs in default mode
- **THEN** markdown output includes `section` entries
- **AND** json output includes `property` and `array-item` entries
- **AND** yaml output includes `pair` entries
- **AND** plaintext output includes `paragraph` entries

#### Scenario: Full mode returns full selector-addressable families

- **WHEN** `GetSpecOutline` runs in full mode
- **THEN** all selector-addressable node families for the parser are included

### Requirement: Result

#### Scenario: Structured result format

- **WHEN** the use case completes successfully
- **THEN** it returns an array of objects
- **AND** each object has `filename` (string) and `outline` (OutlineEntry tree)

#### Scenario: Optional root-level selector hint metadata

- **WHEN** hint mode is enabled
- **THEN** each result includes root-level `selectorHints` keyed by node type
- **AND** hint values use placeholders such as `"<value>"`, `"<contains>"`, `"<level>"`
- **AND** per-node outline entries do not duplicate hints
