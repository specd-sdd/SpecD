# Verification: project metadata command

## Requirements

### Requirement: Display full structure

#### Scenario: Shows internal state

- **WHEN** `specd project metadata` is run
- **THEN** it prints the full JSON including the `freshness` hashes and `generated` timestamp

### Requirement: Formatted output

#### Scenario: Supports structured formats

- **WHEN** `specd project metadata --format json` is run
- **THEN** it returns a valid JSON object
- **AND** the output contains the `version`, `optimized`, `freshness`, and `generated` keys
