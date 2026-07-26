# Verification: Context Markdown Presentation

## Requirements

### Requirement: changeContextToMarkdown

#### Scenario: Unchanged status emits fingerprint and skip message

- **GIVEN** a `CompileContextResult` with `status: 'unchanged'` and a fingerprint
- **WHEN** `changeContextToMarkdown(context, { changeName: 'feat' })` is called
- **THEN** the string includes `Context Fingerprint:` and exactly `Context unchanged since last call.`
- **AND** it does not include `## Spec content` or `## Available context specs`

#### Scenario: Changed status renders fingerprint and full specs

- **GIVEN** a changed `CompileContextResult` with fingerprint, project context entries, and a full-mode spec
- **WHEN** `changeContextToMarkdown` is called with default options
- **THEN** the first line is the fingerprint
- **AND** full specs appear under `## Spec content` with `Mode: full`

### Requirement: Change catalogue grouping and load hints

#### Scenario: Change-scoped catalogue specs hint at spec-preview

- **GIVEN** a catalogue entry (`mode` is not `full`) with `source: 'specIds'`
- **WHEN** `changeContextToMarkdown(context, { changeName: 'feat' })` is called
- **THEN** the catalogue includes guidance to run `specd changes spec-preview feat <specId>`
- **AND** that entry appears in a table before any non-`specIds` catalogue tables

#### Scenario: Canonical catalogue specs hint at specs context

- **GIVEN** a catalogue entry with `source: 'specDependsOn'` or `includePattern`
- **WHEN** `changeContextToMarkdown` is called
- **THEN** the catalogue includes guidance to run `specd specs context <specId>`
- **AND** it does not mention `spec-preview` for that entry

#### Scenario: dependsOnTraversal specs are under Via dependencies

- **GIVEN** catalogue entries including `source: 'dependsOnTraversal'`
- **WHEN** `changeContextToMarkdown` is called
- **THEN** those entries appear under a `### Via dependencies` sub-heading
- **AND** they use the `specs context` hint shared with other non-`specIds` groups

#### Scenario: No preview hint when change-spec catalogue group is empty

- **GIVEN** catalogue entries only from `includePattern`, `specDependsOn`, and/or `dependsOnTraversal`
- **WHEN** `changeContextToMarkdown` is called
- **THEN** the output does not include a `spec-preview` guidance line

#### Scenario: Summary catalogue tables include Source column

- **GIVEN** summary-mode catalogue entries
- **WHEN** `changeContextToMarkdown` is called
- **THEN** each catalogue table includes columns Spec ID, Mode, Source, Title, and Description

### Requirement: projectContextToMarkdown

#### Scenario: Empty context returns configured message

- **GIVEN** empty `contextEntries` and empty `specs`
- **WHEN** `projectContextToMarkdown(context)` is called
- **THEN** it returns exactly `no project context configured`

#### Scenario: Catalogue hints only at specs context

- **GIVEN** catalogue entries (`mode` is not `full`)
- **WHEN** `projectContextToMarkdown` is called
- **THEN** the catalogue includes guidance to run `specd specs context <specId>`
- **AND** the output never contains `spec-preview`

### Requirement: Purity and host reuse

#### Scenario: Helpers are synchronous and side-effect free

- **WHEN** either helper is invoked with a valid context argument
- **THEN** it returns a string without performing I/O or accessing a kernel

### Requirement: Module location

#### Scenario: Helpers are exported from the SDK barrel

- **WHEN** importing from `@specd/sdk`
- **THEN** `changeContextToMarkdown` and `projectContextToMarkdown` are available
