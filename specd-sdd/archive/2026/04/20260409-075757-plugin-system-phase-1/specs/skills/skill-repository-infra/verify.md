# Verification: skills:skill-repository-infra

## Requirements

### Requirement: File reading

#### Scenario: Reads template files

- **WHEN** getBundle is called
- **THEN** template files are read from `packages/skills/templates/`

### Requirement: createSkillRepository factory

#### Scenario: Factory exists

- **WHEN** `createSkillRepository()` is called
- **THEN** it returns a SkillRepositoryPort implementation
