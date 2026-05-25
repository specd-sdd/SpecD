# Verification: Get Spec Outline Draft

## Requirements

### Requirement: content plus filename short-circuits repository

#### Scenario: Draft outline without workspace spec file

- **GIVEN** `content` is markdown and `filename` is `spec.md`
- **WHEN** `GetSpecOutline` executes
- **THEN** one outline result is returned
- **AND** spec repository `get` is not called

### Requirement: filename required with content

#### Scenario: Content without filename fails

- **WHEN** only `content` is provided
- **THEN** execute throws before outline
