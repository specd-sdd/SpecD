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

### Requirement: Output

#### Scenario: Returns resolved bundle with SkillBundle structure

- **WHEN** `ResolveBundle` completes successfully
- **THEN** the output contains a `bundle` field with the resolved `SkillBundle`

### Requirement: Behavior

#### Scenario: Built-in variables merged with user variables

- **GIVEN** a `SpecdConfig` with `projectRoot: '/path/to/project'`
- **AND** user-provided variables `{ customKey: 'customValue' }`
- **WHEN** `ResolveBundle` is executed
- **THEN** built-in variables (`{{projectRoot}}`, `{{configPath}}`, `{{schemaRef}}`) are available
- **AND** user-provided variables override built-ins

#### Scenario: Variable substitution replaces placeholders

- **GIVEN** a resolved file with content containing `{{outputPath}}`
- **WHEN** `ResolveBundle` is called with `variables: { outputPath: '/tmp/output' }`
- **THEN** all instances of `{{outputPath}}` are replaced with `/tmp/output`

#### Scenario: Resolved file metadata preserved

- **GIVEN** a resolved file with `shared: true` metadata
- **WHEN** `ResolveBundle` applies variable substitution
- **THEN** the `shared` metadata is preserved in the output
