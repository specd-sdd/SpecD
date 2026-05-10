# Verification: skills:skill-repository-port

## Requirements

### Requirement: SkillRepositoryPort interface

#### Scenario: Has required methods

- **WHEN** SkillRepositoryPort is inspected
- **THEN** it has `list()`, `get()`, `getBundle()`, and `listSharedFiles()` methods

#### Scenario: Interface matches SkillRepository

- **WHEN** SkillRepositoryPort is inspected
- **THEN** it defines `list()`, `get()`, `getBundle()`, and `listSharedFiles()` methods
- **AND** getBundle accepts name, variables, and optional SpecdConfig

#### Scenario: getBundle preserves shared origin markers

- **GIVEN** shared files are declared for a skill
- **WHEN** `getBundle` resolves files for that skill
- **THEN** resolved files that come from shared declarations are marked as shared
- **AND** files from skill-local templates are not marked as shared

### Requirement: Port abstraction

#### Scenario: Implementation lives in infrastructure layer

- **WHEN** a concrete implementation of SkillRepositoryPort is created
- **THEN** it is defined in the infrastructure layer
- **AND** no I/O code exists in the port interface
