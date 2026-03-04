# Verification: Skills List

## Requirements

### Requirement: Command signature

#### Scenario: Unknown agent exits with error

- **WHEN** `specd skills list --agent unknown` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output format

#### Scenario: Text output without --agent shows no installed column

- **WHEN** `specd skills list` is run
- **THEN** stdout lists one row per skill with name and description
- **AND** no `installed`/`not installed` column is shown

#### Scenario: Text output with --agent shows installation status

- **WHEN** `specd skills list --agent claude` is run
- **THEN** each row includes either `installed` or `not installed`

#### Scenario: JSON output omits installed when --agent is absent

- **WHEN** `specd skills list --format json` is run without `--agent`
- **THEN** stdout is a valid JSON array where no object contains an `installed` key

### Requirement: Empty skill set

#### Scenario: No skills available prints placeholder

- **GIVEN** `@specd/skills` exports no skills
- **WHEN** `specd skills list` is run
- **THEN** stdout contains `no skills available`
- **AND** the process exits with code 0

### Requirement: Installation check for Claude Code

#### Scenario: Skill found at project level is reported as installed

- **GIVEN** a file `<git-root>/.claude/commands/my-skill.md` exists
- **WHEN** `specd skills list --agent claude` is run
- **THEN** `my-skill` is reported as `installed`

#### Scenario: Skill found only at user level is reported as installed

- **GIVEN** `my-skill.md` exists in `~/.claude/commands/` but not in `.claude/commands/`
- **WHEN** `specd skills list --agent claude` is run
- **THEN** `my-skill` is reported as `installed`

#### Scenario: Skill missing from both locations is reported as not installed

- **GIVEN** `my-skill.md` does not exist in either `.claude/commands/` or `~/.claude/commands/`
- **WHEN** `specd skills list --agent claude` is run
- **THEN** `my-skill` is reported as `not installed`
