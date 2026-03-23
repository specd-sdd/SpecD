# Verification: Change Context

## Requirements

### Requirement: Command signature

#### Scenario: Missing step argument

- **WHEN** `specd change context my-change` is run without the step
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --depth without --follow-deps

- **WHEN** `specd change context my-change designing --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output

#### Scenario: Text output — full specs rendered with content

- **GIVEN** `CompileContext` returns specs with `mode: 'full'`
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** full-mode specs are rendered under `### Spec: <specId>` headings with their content

#### Scenario: Text output — summary specs rendered as catalogue

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** `CompileContext` returns specs with `mode: 'summary'` from `includePattern` source
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** summary-mode specs appear under `## Available context specs` with spec ID, title, and description
- **AND** the section includes the instruction `Use \`specd spec show <spec-id>\` to load the full content of any spec you need.\`

#### Scenario: Text output — dependsOn traversal specs distinguished

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** some summary specs have `source: 'dependsOnTraversal'`
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** `dependsOnTraversal` specs appear under a `### Via dependencies` sub-heading within `## Available context specs`

#### Scenario: JSON output — structured result with mode and source

- **GIVEN** `CompileContext` returns structured result
- **WHEN** `specd change context <name> <step>` is called with `--format json`
- **THEN** the JSON output includes `projectContext`, `specs` (with `specId`, `mode`, `source` fields), `availableSteps`, and `warnings`

#### Scenario: JSON output — summary specs have no content field

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec has `mode: 'summary'`
- **WHEN** `specd change context <name> <step>` is called with `--format json`
- **THEN** the spec entry in JSON has `specId`, `title`, `description`, `source`, `mode` but no `content` field

#### Scenario: Full mode — text output unchanged from previous behaviour

- **GIVEN** `config.contextMode: 'full'` (or not set)
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** all specs are rendered with full content — no `## Available context specs` section appears

#### Scenario: dependsOn not followed by default

- **GIVEN** a spec in the change's context has `.specd-metadata.yaml` with `dependsOn` entries pointing to other specs
- **WHEN** `specd change context my-change implementing` is run without `--follow-deps`
- **THEN** the dependent specs are not included in the output

#### Scenario: --follow-deps includes transitive dependencies

- **GIVEN** a spec in context has `dependsOn` entries pointing to other specs
- **WHEN** `specd change context my-change implementing --follow-deps` is run
- **THEN** the output includes content from the dependent specs as well

#### Scenario: --depth limits traversal

- **GIVEN** spec A depends on spec B which depends on spec C
- **WHEN** `specd change context my-change implementing --follow-deps --depth 1` is run
- **THEN** the output includes content from spec B but not spec C

#### Scenario: Section flags filter full-mode spec content only

- **GIVEN** specs in context have description, rules, constraints, and scenarios in their metadata
- **WHEN** `specd change context my-change implementing --rules --constraints` is run
- **THEN** only rules and constraints sections appear in full-mode spec content
- **AND** summary-mode specs are unaffected by section flags

#### Scenario: No section flags includes all sections

- **GIVEN** specs in context have all metadata sections populated
- **WHEN** `specd change context my-change implementing` is run without section flags
- **THEN** full-mode specs contain description, rules, constraints, and scenarios

### Requirement: Step availability warning

#### Scenario: Step not yet available

- **GIVEN** the step `implementing` has blocking artifacts
- **WHEN** `specd change context my-change implementing` is run
- **THEN** stderr contains a `warning:` line listing the blocking artifacts
- **AND** stdout still contains the context output
- **AND** the process exits with code 0

### Requirement: Context warnings

#### Scenario: Stale metadata warning

- **GIVEN** a spec included in context has stale metadata
- **WHEN** `specd change context my-change designing` is run
- **THEN** stderr contains a `warning:` line for the stale spec
- **AND** the context output is still printed to stdout
- **AND** the process exits with code 0

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change context nonexistent designing` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
