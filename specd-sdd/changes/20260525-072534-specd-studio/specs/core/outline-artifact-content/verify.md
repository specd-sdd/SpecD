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
