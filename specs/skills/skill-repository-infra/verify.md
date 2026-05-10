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

### Requirement: TemplateReader

#### Scenario: TemplateReader loads .md files lazily

- **GIVEN** a skill with templates in `packages/skills/templates/<skill-name>/`
- **WHEN** `getBundle` is called
- **THEN** the TemplateReader loads `.md` files as `SkillTemplate` objects
- **AND** content is loaded lazily via `getContent()`

### Requirement: Shared file scanning

#### Scenario: Scans templates/shared/ for .meta.json files

- **WHEN** `getBundle` is called for a skill that uses shared files
- **THEN** the infrastructure scans `templates/shared/` for `.meta.json` files
- **AND** shared file content is loaded on demand
- **AND** ResolvedFile entries are marked as shared
