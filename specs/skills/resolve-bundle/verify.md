# Verification: skills:resolve-bundle

## Requirements

### Requirement: Input

#### Scenario: With variables

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill', variables: { key: 'value' } }`
- **THEN** it replaces `{{key}}` with 'value'

#### Scenario: Without variables

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill' }`
- **THEN** placeholders remain as-is

#### Scenario: With SpecdConfig for built-in variables

- **GIVEN** a `SpecdConfig` with `projectRoot: '/path/to/project'`
- **WHEN** `ResolveBundle` is executed with that config
- **THEN** it automatically replaces `{{projectRoot}}` with '/path/to/project'

#### Scenario: Shared marker is preserved in resolved output

- **GIVEN** `SkillRepository.getBundle` returns files including a shared-marked file
- **WHEN** `ResolveBundle` applies variable substitution
- **THEN** the shared marker remains unchanged on that file in the output bundle
