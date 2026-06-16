# Verification: skills:skill-repository-infra

## Requirements

### Requirement: File reading

#### Scenario: Reads template files from skills and agents subfolders

- **WHEN** `getBundle` is called for a skill or an agent
- **THEN** it reads from `packages/skills/templates/skills/` or `packages/skills/templates/agents/` respectively

### Requirement: createSkillRepository factory

#### Scenario: Factory exists

- **WHEN** `createSkillRepository()` is called
- **THEN** it returns a SkillRepositoryPort implementation

### Requirement: TemplateReader

#### Scenario: TemplateReader loads .md.tpl files from categorized subfolders

- **WHEN** templates are loaded
- **THEN** the `TemplateReader` correctly resolves paths under `skills/` or `agents/`
