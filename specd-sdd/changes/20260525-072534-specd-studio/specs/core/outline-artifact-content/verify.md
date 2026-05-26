# Verification: Outline Artifact Content

## Requirements

### Requirement: input is content and filename only

#### Scenario: Markdown content yields section outline

- **GIVEN** markdown with `## Requirements` heading
- **WHEN** `outlineArtifactContent` runs with `spec.md`
- **THEN** outline entries include a section for Requirements
- **AND** no filesystem read occurs

#### Scenario: Unknown extension throws

- **GIVEN** filename `artifact.bin`
- **WHEN** outline is requested
- **THEN** `ParserNotRegisteredError` is thrown

### Requirement: output matches spec outline entry shape

#### Scenario: Hints optional

- **GIVEN** `hints: true`
- **WHEN** outline succeeds
- **THEN** `selectorHints` is present when parser provides hints
- **AND** `hints: false` omits selectorHints

### Requirement: unknown format throws ParserNotRegisteredError

#### Scenario: unknown format throws ParserNotRegisteredError — primary path

- **WHEN** When inferFormat(filename) fails or no parser is registered,
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: unknown format throws ParserNotRegisteredError — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: parse errors propagate

#### Scenario: parse errors propagate — primary path

- **WHEN** Parser parse failures MUST propagate to callers (HTTP
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: parse errors propagate — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented
