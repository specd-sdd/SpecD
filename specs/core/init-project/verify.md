# Verification: InitProject

## Requirements

### Requirement: InitProject use case removed

#### Scenario: InitProject class is not exported

- **WHEN** `@specd/core` public exports are inspected
- **THEN** `InitProject`, `AddPlugin`, `RemovePlugin`, `createInitProject`, `createAddPlugin`, and `createRemovePlugin` are not among them
- **AND** `createConfigWriter` is exported

#### Scenario: Project init uses createConfigWriter instead

- **WHEN** delivery code needs to initialise a project
- **THEN** it calls `createConfigWriter().initProject(options)`
- **AND** it does not construct `InitProject` directly
