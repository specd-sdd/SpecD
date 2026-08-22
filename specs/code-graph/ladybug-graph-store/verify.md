# Verification: Ladybug Graph Store

## Requirements

### Requirement: Ladybug ownership transferred

#### Scenario: Core package contains no Ladybug backend

- **GIVEN** the Ladybug requirements and verification suite have been recreated as `ladybug:graph-store` in `specd-plugin-graphstore-ladybug`
- **AND** its dependencies on `default`, `code-graph`, and `core` resolve through external `readOnly` workspaces
- **WHEN** the `@specd/code-graph` source, exports, dependencies, tests, and built-in registry are inspected
- **THEN** no Ladybug implementation, native dependency, schema, fixture, or built-in registration remains
- **AND** this repository retains only the retirement record
