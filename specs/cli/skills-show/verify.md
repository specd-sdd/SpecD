# Verification: Skills Show

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument exits with usage error

- **WHEN** `specd skills show` is run with no positional argument
- **THEN** the command exits with code 1
- **AND** stderr contains a usage error message

### Requirement: Output format

#### Scenario: Text output includes header and content

- **WHEN** `specd skills show my-skill` is run
- **THEN** stdout begins with `--- my-skill ---`
- **AND** the full markdown content of the skill follows

#### Scenario: JSON output contains name, description, and content

- **WHEN** `specd skills show my-skill --format json` is run
- **THEN** stdout is valid JSON with `name`, `description`, and `content` fields
- **AND** `content` is the verbatim markdown text

### Requirement: Skill not found

#### Scenario: Unknown skill name exits with error

- **WHEN** `specd skills show nonexistent-skill` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
