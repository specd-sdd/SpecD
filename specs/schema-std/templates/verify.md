# Verification: Artifact Templates

## Requirements

### Requirement: Proposal Template Structure and Guidance

#### Scenario: Proposal template provides required sections and guidance

- **GIVEN** `templates/proposal.md`
- **WHEN** parsing section headers and comments
- **THEN** it contains `Motivation`, `Current behaviour`, `Proposed solution`, `Specs affected`, `Impact`, `Technical context`, and `Open questions`
- **AND** guidance comments instruct authors on section population

### Requirement: Specs Template Structure and Guidance

#### Scenario: Specs template defines normative requirements layout

- **GIVEN** `templates/spec.md`
- **WHEN** parsing template structure
- **THEN** it defines `Purpose`, `Requirements`, `Constraints`, and `Spec Dependencies`
- **AND** instructs use of `### Requirement:` and SHALL / MUST language

### Requirement: Verify Template Structure and Guidance

#### Scenario: Verify template provides Gherkin scenario scaffolding

- **GIVEN** `templates/verify.md`
- **WHEN** inspecting scenario scaffolding
- **THEN** it contains `### Requirement:` and `#### Scenario:` hierarchy
- **AND** provides GIVEN, WHEN, THEN, and AND/OR structured placeholders

### Requirement: Design Template Structure and Guidance

#### Scenario: Design template enforces self-contained implementation blueprint

- **GIVEN** `templates/design.md`
- **WHEN** inspecting template sections
- **THEN** it contains Affected areas, New constructs, Data models, Approach, Error handling, Key decisions, Trade-offs, Spec impact, Dependency map, Migration, Testing, and Open questions
- **AND** guidance comments emphasize self-contained contracts without indirect references

### Requirement: Tasks Template Structure and Guidance

#### Scenario: Tasks template defines task checklist format

- **GIVEN** `templates/tasks.md`
- **WHEN** inspecting task list structure
- **THEN** it demonstrates `- [ ] <n>.<m>` checklist format with indented target file, `Approach:`, and requirement references

### Requirement: Scaffolding Placeholders and Guidance Invariants

#### Scenario: Scaffolding placeholders and comments are valid

- **GIVEN** all templates in `templates/`
- **WHEN** validating placeholders and comments
- **THEN** variables follow `{{variable}}` syntax
- **AND** guidance comments are valid markdown comments (`<!-- ... -->`)
