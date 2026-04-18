# Verification: skills:skill-bundle

## Requirements

### Requirement: ResolvedFile interface

#### Scenario: File has filename and content

- **WHEN** a ResolvedFile is created
- **THEN** it has `filename` and `content` properties

### Requirement: SkillBundle interface

#### Scenario: Bundle has install method

- **WHEN** `bundle.install(targetDir)` is called
- **THEN** files are written to the target directory

#### Scenario: Bundle has uninstall method

- **WHEN** `bundle.uninstall(targetDir)` is called
- **THEN** installed files are removed
