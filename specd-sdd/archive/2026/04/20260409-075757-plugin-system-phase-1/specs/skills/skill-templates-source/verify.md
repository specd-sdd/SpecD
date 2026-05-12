# Verification: skills:skill-templates-source

## Requirements

### Requirement: Templates without frontmatter

#### Scenario: Template files are clean

- **WHEN** files in `packages/skills/templates/` are inspected
- **THEN** no YAML frontmatter blocks exist in the files

### Requirement: Agent plugin injects frontmatter

#### Scenario: Install prepends frontmatter

- **WHEN** an agent plugin calls install
- **THEN** YAML frontmatter is prepended to each skill file
