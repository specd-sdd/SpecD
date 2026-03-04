# Verification: Skills Update

## Requirements

### Requirement: Reading the installation manifest from specd.yaml

#### Scenario: All recorded skills are reinstalled

- **GIVEN** `specd.yaml` records `skills.claude: [my-skill, my-other-skill]`
- **WHEN** `specd skills update` is run
- **THEN** both `.claude/commands/my-skill.md` and `.claude/commands/my-other-skill.md` are overwritten with the current bundle content
- **AND** the process exits with code 0

#### Scenario: --agent restricts update to one agent

- **GIVEN** `specd.yaml` records skills for `claude`
- **WHEN** `specd skills update --agent claude` is run
- **THEN** only Claude Code skills are updated

### Requirement: Skill no longer in bundle

#### Scenario: Removed skill generates warning and is skipped

- **GIVEN** `specd.yaml` lists `old-skill` under `skills.claude`
- **AND** `old-skill` is not present in the current `@specd/skills` bundle
- **WHEN** `specd skills update` is run
- **THEN** stderr contains `warning: skill old-skill is no longer available — skipped`
- **AND** other skills in the list are still updated
- **AND** the process exits with code 0

### Requirement: No skills recorded

#### Scenario: No skills section exits cleanly

- **GIVEN** `specd.yaml` has no `skills` key
- **WHEN** `specd skills update` is run
- **THEN** stdout contains `no skills to update`
- **AND** the process exits with code 0

### Requirement: Output on success

#### Scenario: Text output lists each updated skill

- **WHEN** `specd skills update` succeeds with two recorded skills
- **THEN** stdout contains two `updated <name> →` lines each with an absolute path

#### Scenario: JSON output is an array with status fields

- **WHEN** `specd skills update --format json` succeeds
- **THEN** stdout is a valid JSON array where each object has `name`, `path`, and `status` fields
