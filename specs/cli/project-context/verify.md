# Verification: Project Context

## Requirements

### Requirement: Command signature

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

#### Scenario: Text output — all specs rendered with full content

- **GIVEN** `GetProjectContext` returns specs (always `mode: 'full'`)
- **WHEN** `specd project context` is called with `--format text`
- **THEN** output is unchanged from previous behaviour — all specs under `## Spec content` with full content

#### Scenario: JSON output — structured spec entries

- **GIVEN** `GetProjectContext` returns structured `ContextSpecEntry` objects
- **WHEN** `specd project context` is called with `--format json`
- **THEN** the JSON output includes `contextEntries`, `specs` (with `specId`, `title`, `description`, `source`, `mode`, `content`), and `warnings`

#### Scenario: JSON output — all specs have mode full and source includePattern

- **GIVEN** `GetProjectContext` operates without a change
- **WHEN** `specd project context` is called with `--format json`
- **THEN** all spec entries have `mode: 'full'` and `source: 'includePattern'`

#### Scenario: No project context configured

- **GIVEN** no `context:` entries and no specs match include patterns
- **WHEN** `specd project context` is called
- **THEN** the command prints `no project context configured` and exits with code 0

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
