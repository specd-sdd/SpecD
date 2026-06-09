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

#### Scenario: Get bundle with structured render context

- **WHEN** `repository.getBundle('skill-name', context)` is called with recursive variables and capability identifiers
- **THEN** the returned bundle resolves template content using that structured context

#### Scenario: getBundle loads skill metadata

- **WHEN** `repository.getBundle('skill-name', context)` resolves a skill
- **THEN** it loads that skill's `skill.meta.json`

#### Scenario: Required capabilities gate skill installability

- **GIVEN** a skill declares `requiredCapabilities`
- **WHEN** one of those identifiers is absent from the provided capability list
- **THEN** bundle resolution fails instead of rendering an installable bundle

#### Scenario: Shared templates come from requiredSharedTemplates

- **GIVEN** a skill declares `requiredSharedTemplates`
- **WHEN** the bundle is resolved
- **THEN** only those declared shared templates are included from `templates/shared/`

#### Scenario: Get bundle strips template suffix from output filenames

- **GIVEN** a template source file named `SKILL.md.tpl`
- **WHEN** `repository.getBundle('skill-name', context)` resolves the bundle
- **THEN** the resulting resolved file is named `SKILL.md`

#### Scenario: Frontmatter data is gated by frontmatter capability

- **GIVEN** `context.variables.frontmatter` is present
- **AND** the `frontmatter` capability is absent
- **WHEN** the bundle is resolved
- **THEN** the final frontmatter block is not emitted

### Requirement: listSharedFiles() method

#### Scenario: listSharedFiles reads shared template source files

- **WHEN** `listSharedFiles()` scans `templates/shared/`
- **THEN** it returns shared template filenames and content

#### Scenario: listSharedFiles does not infer skill consumers from shared metadata

- **WHEN** shared template discovery is reviewed
- **THEN** it does not depend on a shared-side inverse consumer index to determine which skills consume a shared template
