# Verification: skills:skill-repository

## Requirements

### Requirement: list() method

#### Scenario: List returns skills

- **WHEN** `repository.list()` is called
- **THEN** an array of Skill objects is returned

### Requirement: get() method

#### Scenario: Get existing skill

- **WHEN** `repository.get('skill-name')` is called for an existing skill
- **THEN** the Skill object is returned

#### Scenario: Get non-existing skill

- **WHEN** `repository.get('nonexistent')` is called
- **THEN** undefined is returned

### Requirement: getBundle() method

#### Scenario: Get bundle with variables

- **WHEN** `repository.getBundle('skill-name', { key: 'value' })` is called
- **THEN** placeholders `{{key}}` are replaced with 'value'

### Requirement: listSharedFiles() method

#### Scenario: Lists shared files from templates/shared/

- **WHEN** `repository.listSharedFiles()` is called
- **THEN** it scans `templates/shared/` for `.meta.json` files
- **AND** returns `SharedFile[]` with filename, content, and skills properties
