# Verification: skills:skill

## Requirements

### Requirement: Skill interface

#### Scenario: Skill creation

- **WHEN** a Skill object is created
- **THEN** it has `name`, `description`, and `templates` properties

### Requirement: SkillTemplate interface

#### Scenario: Lazy content loading

- **WHEN** `getContent()` is called on a SkillTemplate
- **THEN** it returns the template content as a Promise

### Requirement: No I/O in domain

#### Scenario: Domain has no I/O imports

- **WHEN** the domain layer is inspected
- **THEN** no imports from `node:fs` or similar I/O modules exist
