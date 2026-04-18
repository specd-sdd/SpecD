# Verification: plugin-manager:update-plugin-use-case

## Requirements

### Requirement: Idempotency

#### Scenario: Multiple updates produce same result

- **WHEN** UpdatePlugin is executed twice
- **THEN** both return the same result
