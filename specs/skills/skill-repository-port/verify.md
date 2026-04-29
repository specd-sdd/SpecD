# Verification: skills:skill-repository-port

## Requirements

### Requirement: Port interface

#### Scenario: Has required methods

- **WHEN** SkillRepositoryPort is inspected
- **THEN** it has `list()`, `get()`, `getBundle()`, and `listSharedFiles()` methods

#### Scenario: getBundle preserves shared origin markers

- **GIVEN** shared files are declared for a skill
- **WHEN** `getBundle` resolves files for that skill
- **THEN** resolved files that come from shared declarations are marked as shared
- **AND** files from skill-local templates are not marked as shared
