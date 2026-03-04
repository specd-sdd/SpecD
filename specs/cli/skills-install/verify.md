# Verification: Skills Install

## Requirements

### Requirement: Command signature

#### Scenario: Missing positional argument exits with usage error

- **WHEN** `specd skills install` is run with no positional argument
- **THEN** the command exits with code 1
- **AND** stderr contains a usage error message

### Requirement: Installation target for Claude Code

#### Scenario: Project-level install writes to .claude/commands/

- **GIVEN** the CWD is inside a git repository with root at `/repo`
- **WHEN** `specd skills install my-skill` is run
- **THEN** `/repo/.claude/commands/my-skill.md` is created with the skill's content
- **AND** the process exits with code 0

#### Scenario: Global install writes to ~/.claude/commands/

- **WHEN** `specd skills install my-skill --global` is run
- **THEN** `~/.claude/commands/my-skill.md` is created with the skill's content
- **AND** the process exits with code 0

#### Scenario: Target directory is created if absent

- **GIVEN** `.claude/commands/` does not exist
- **WHEN** `specd skills install my-skill` is run
- **THEN** `.claude/commands/` is created
- **AND** `my-skill.md` is written inside it

### Requirement: Overwrite behaviour

#### Scenario: Existing skill file is overwritten

- **GIVEN** `.claude/commands/my-skill.md` exists with old content
- **WHEN** `specd skills install my-skill` is run
- **THEN** the file is overwritten with the current skill content
- **AND** the command exits with code 0

### Requirement: Recording installations in specd.yaml

#### Scenario: Project-level install adds skill to specd.yaml

- **GIVEN** a `specd.yaml` with no `skills` section
- **WHEN** `specd skills install my-skill` is run
- **THEN** `specd.yaml` now contains `skills.claude` with `my-skill` in the list

#### Scenario: Installing already-recorded skill does not duplicate it

- **GIVEN** `specd.yaml` already lists `my-skill` under `skills.claude`
- **WHEN** `specd skills install my-skill` is run again
- **THEN** `my-skill` appears exactly once in `skills.claude`

#### Scenario: Global install does not modify specd.yaml

- **GIVEN** a `specd.yaml` with no `skills` section
- **WHEN** `specd skills install my-skill --global` is run
- **THEN** `specd.yaml` is unchanged

#### Scenario: No specd.yaml exits with error before writing any files

- **GIVEN** there is no `specd.yaml` in the project
- **WHEN** `specd skills install my-skill` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
- **AND** no `.md` file is written

### Requirement: Output on success

#### Scenario: Text output shows installed path

- **WHEN** `specd skills install my-skill` succeeds
- **THEN** stdout contains `installed my-skill →` followed by the absolute file path
- **AND** the process exits with code 0

#### Scenario: JSON output is an array with name and path

- **WHEN** `specd skills install my-skill --format json` succeeds
- **THEN** stdout is a valid JSON array containing one object with `name` and `path` fields

#### Scenario: Install all prints one line per skill

- **WHEN** `specd skills install all` succeeds
- **THEN** stdout contains one `installed <name> →` line per skill in `@specd/skills`

### Requirement: Skill not found

#### Scenario: Unknown skill name exits with error

- **WHEN** `specd skills install nonexistent-skill` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
- **AND** no files are written

### Requirement: Not in a git repository (project-level install)

#### Scenario: Project-level install outside git repo exits with error

- **GIVEN** the CWD is not inside any git repository
- **WHEN** `specd skills install my-skill` is run without `--global`
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message mentioning `--global`

### Requirement: Unknown agent

#### Scenario: Unrecognised agent value exits with error

- **WHEN** `specd skills install my-skill --agent unknown-agent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
