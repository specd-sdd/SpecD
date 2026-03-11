# Verification: Project Context

## Requirements

### Requirement: Command signature

#### Scenario: Extra arguments rejected

- **WHEN** `specd project context some-arg` is run with an unexpected argument
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --depth without --follow-deps

- **WHEN** `specd project context --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Behaviour

#### Scenario: Context entries rendered first

- **GIVEN** `specd.yaml` has `context:` with `instruction: "Follow conventions."` and `contextIncludeSpecs: ["*"]`
- **WHEN** `specd project context` is run
- **THEN** stdout begins with `Follow conventions.` before any spec content

#### Scenario: Include patterns applied across all workspaces

- **GIVEN** `specd.yaml` has `contextIncludeSpecs: ["*"]` and two workspaces each containing specs
- **WHEN** `specd project context` is run
- **THEN** stdout includes spec content from both workspaces

#### Scenario: Exclude patterns remove specs from the set

- **GIVEN** `specd.yaml` has `contextIncludeSpecs: ["*"]` and `contextExcludeSpecs: ["auth/*"]`
- **WHEN** `specd project context` is run
- **THEN** specs under `auth/` are not included in the output

#### Scenario: Workspace-level patterns not applied

- **GIVEN** workspace `billing` has `contextIncludeSpecs: ["billing/*"]` but no project-level `contextIncludeSpecs` includes billing specs
- **WHEN** `specd project context` is run
- **THEN** billing specs are not included in the output (workspace-level patterns are change-specific, not applied by this command)

#### Scenario: dependsOn traversal not performed by default

- **GIVEN** a spec included via patterns has `.specd-metadata.yaml` with `dependsOn` entries pointing to other specs
- **WHEN** `specd project context` is run without `--follow-deps`
- **THEN** the dependent specs are not included in the output

#### Scenario: --follow-deps includes transitive dependencies

- **GIVEN** a spec included via patterns has `dependsOn` entries pointing to other specs
- **WHEN** `specd project context --follow-deps` is run
- **THEN** the output includes content from the dependent specs as well

#### Scenario: --depth limits traversal

- **GIVEN** spec A (matched by include patterns) depends on spec B which depends on spec C
- **WHEN** `specd project context --follow-deps --depth 1` is run
- **THEN** the output includes spec A and spec B but not spec C

#### Scenario: Section flags filter spec content

- **GIVEN** specs matched by include patterns have description, rules, constraints, and scenarios in their metadata
- **WHEN** `specd project context --rules` is run
- **THEN** only rules sections appear in the spec content output
- **AND** description, constraints, and scenarios are not present

#### Scenario: Section flags do not affect context entries

- **GIVEN** `specd.yaml` has `context:` with an `instruction: "Follow conventions."`
- **WHEN** `specd project context --rules` is run
- **THEN** stdout still contains `Follow conventions.` (context entries are unaffected by section filters)

#### Scenario: File context entry resolved

- **GIVEN** `specd.yaml` has `context:` with `file: docs/context.md` containing `Hello world`
- **WHEN** `specd project context` is run
- **THEN** stdout contains `Hello world`

### Requirement: Output

#### Scenario: Nothing configured

- **GIVEN** `specd.yaml` has no `context:` entries and no `contextIncludeSpecs`
- **WHEN** `specd project context` is run
- **THEN** stdout contains `no project context configured`
- **AND** the process exits with code 0

#### Scenario: JSON output structure

- **GIVEN** `specd.yaml` has `context:` with `instruction: "Follow conventions."` and one spec `default:auth/login` matched by include patterns
- **WHEN** `specd project context --format json` is run
- **THEN** stdout is valid JSON with `contextEntries`, `specs`, and `warnings`
- **AND** `contextEntries` contains `"Follow conventions."`
- **AND** `specs` contains one entry with `workspace`, `path`, and `content`
- **AND** the process exits with code 0

### Requirement: Warnings

#### Scenario: Missing file entry emits warning

- **GIVEN** `specd.yaml` has `context:` with `file: missing.md` and the file does not exist
- **WHEN** `specd project context` is run
- **THEN** stderr contains a `warning:` line mentioning `missing.md`
- **AND** the process exits with code 0

#### Scenario: Stale metadata emits warning

- **GIVEN** a spec included via patterns has stale `.specd-metadata.yaml`
- **WHEN** `specd project context` is run
- **THEN** stderr contains a `warning:` line for the stale spec
- **AND** the spec content is still included using the metadataExtraction fallback
