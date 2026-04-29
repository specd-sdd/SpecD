# Verification: skills:skill-repository-infra

## Requirements

### Requirement: File reading

#### Scenario: Reads template files

- **WHEN** getBundle is called
- **THEN** template files are read from `packages/skills/templates/`

#### Scenario: Shared template entries are marked in resolved bundle files

- **GIVEN** `templates/shared/*.meta.json` associates `shared.md` to a skill
- **WHEN** `getBundle` resolves that skill
- **THEN** the resulting `ResolvedFile` for `shared.md` is marked as shared
- **AND** files loaded from `templates/<skill-name>/` are not marked as shared

### Requirement: createSkillRepository factory

#### Scenario: Factory exists

- **WHEN** `createSkillRepository()` is called
- **THEN** it returns a SkillRepositoryPort implementation
