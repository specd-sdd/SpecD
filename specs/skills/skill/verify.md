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

#### Scenario: Content is loaded lazily, not eagerly

- **GIVEN** a `Skill` object with templates
- **WHEN** the `Skill` object is created
- **THEN** template content is not loaded into memory
- **AND** content is only loaded when `getContent()` is called

### Requirement: Lazy content loading

#### Scenario: getContent returns content lazily

- **WHEN** `getContent()` is called on a SkillTemplate
- **THEN** it returns the template content as a Promise
- **AND** content is not loaded until the method is called

### Requirement: No I/O in domain

#### Scenario: Domain has no I/O imports

- **WHEN** the domain layer is inspected
- **THEN** no imports from `node:fs` or similar I/O modules exist
