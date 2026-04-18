# Verification: skills:resolve-bundle

## Requirements

### Requirement: Input

#### Scenario: With variables

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill', variables: { key: 'value' } }`
- **THEN** it replaces `{{key}}` with 'value'

#### Scenario: Without variables

- **WHEN** `ResolveBundle` use case is executed with `{ name: 'skill' }`
- **THEN** placeholders remain as-is
