# Verification: Get Spec Outline Draft

## Requirements

### Requirement: content plus filename short-circuits repository

#### Scenario: Draft outline without workspace spec file

- **GIVEN** `content` is markdown and `filename` is `spec.md`
- **WHEN** `GetSpecOutline` executes
- **THEN** one outline result is returned
- **AND** spec repository `get` is not called

### Requirement: repository path unchanged without content

#### Scenario: repository path unchanged without content — primary path

- **WHEN** When content is omitted, behavior MUST match workspace
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: repository path unchanged without content — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: filename required with content

#### Scenario: Content without filename fails

- **WHEN** only `content` is provided
- **THEN** execute throws before outline
