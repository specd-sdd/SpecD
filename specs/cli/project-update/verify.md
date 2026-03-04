# Verification: Project Update

## Requirements

### Requirement: Skills update step

#### Scenario: Recorded skills are reinstalled

- **GIVEN** `specd.yaml` records `skills.claude: [my-skill]`
- **WHEN** `specd project update` is run
- **THEN** `.claude/commands/my-skill.md` is overwritten with the current bundle content
- **AND** the process exits with code 0

#### Scenario: Skill no longer in bundle generates warning but does not fail

- **GIVEN** `specd.yaml` lists `old-skill` under `skills.claude`
- **AND** `old-skill` is not present in the current `@specd/skills` bundle
- **WHEN** `specd project update` is run
- **THEN** stderr contains a warning about `old-skill`
- **AND** the process exits with code 0

### Requirement: Output on success

#### Scenario: Text output is prefixed with step name

- **WHEN** `specd project update` succeeds with one skill recorded
- **THEN** stdout contains a line starting with `skills:` followed by the updated skill info

#### Scenario: Nothing to update prints up-to-date message

- **GIVEN** `specd.yaml` has no `skills` section
- **WHEN** `specd project update` is run
- **THEN** stdout contains `project is up to date`
- **AND** the process exits with code 0

#### Scenario: JSON output groups results by step

- **WHEN** `specd project update --format json` succeeds
- **THEN** stdout is valid JSON with a `skills` array containing result objects

### Requirement: Partial failure

#### Scenario: Warnings from skills update do not change exit code

- **GIVEN** one skill is current and one is missing from the bundle
- **WHEN** `specd project update` is run
- **THEN** the current skill is updated
- **AND** the missing skill warning is printed to stderr
- **AND** the process exits with code 0

#### Scenario: Missing specd.yaml exits with error

- **GIVEN** there is no `specd.yaml` discoverable from the CWD
- **WHEN** `specd project update` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
