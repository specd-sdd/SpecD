# Verification: Change Context

## Requirements

### Requirement: Command signature

#### Scenario: Missing step argument

- **WHEN** `specd change context my-change` is run without the step
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --depth without --follow-deps

- **WHEN** `specd change context my-change designing --depth 2` is run without `--follow-deps`
- **THEN** the command exits with code 1 and prints a usage error to stderr

#### Scenario: --fingerprint flag accepted

- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123...` is run
- **THEN** the command proceeds normally

### Requirement: Output

#### Scenario: JSON output includes fingerprint and status on first call

- **GIVEN** no `--fingerprint` flag is provided
- **WHEN** `specd change context my-change designing --format json` is called
- **THEN** the JSON output includes `contextFingerprint` with a SHA-256 hash
- **AND** `status` is `"changed"`
- **AND** the full context is returned

#### Scenario: JSON output returns unchanged when fingerprint matches

- **GIVEN** the current context fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123... --format json` is called
- **THEN** the JSON output contains `contextFingerprint`, `status: "unchanged"`, `stepAvailable`, `blockingArtifacts`, `availableSteps`, and `warnings`
- **AND** `projectContext` and `specs` are absent because the agent uses its cached values

#### Scenario: JSON output returns full context when fingerprint does not match

- **GIVEN** the current context fingerprint is `sha256:xyz789...`
- **AND** the provided fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123... --format json` is called
- **THEN** the full context is returned
- **AND** `contextFingerprint` is `sha256:xyz789...`
- **AND** `status` is `"changed"`

#### Scenario: Text output begins with fingerprint before context sections

- **GIVEN** the current context fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --format text` is called
- **THEN** the first rendered line is `Context Fingerprint: sha256:abc123...`
- **AND** any project context, spec content, or available steps appear after that line

#### Scenario: Text output shows fingerprint and unchanged message when fingerprint matches

- **GIVEN** the current context fingerprint is `sha256:abc123...`
- **WHEN** `specd change context my-change designing --fingerprint sha256:abc123... --format text` is called
- **THEN** the output begins with `Context Fingerprint: sha256:abc123...`
- **AND** it then prints `Context unchanged since last call.`
- **AND** no spec content is printed

#### Scenario: Text output labels full-mode specs explicitly

- **GIVEN** `CompileContext` returns a full-mode spec entry for `core:core/compile-context`
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** the rendered block for `core:core/compile-context` includes an explicit full-mode label
- **AND** the reader can identify that the rendered content is complete without inferring it from the title alone

#### Scenario: Text output labels summary-mode specs explicitly

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec has `mode: 'summary'`
- **WHEN** `specd change context <name> <step>` is called with `--format text`
- **THEN** the rendered summary entry includes an explicit summary-mode label
- **AND** the section still instructs the reader to use `specd spec show <spec-id>` for full content

#### Scenario: JSON output — structured result with mode and source

- **GIVEN** `CompileContext` returns specs with `mode: 'full'`
- **WHEN** `specd change context <name> <step>` is called with `--format json`
- **THEN** the JSON output includes `projectContext`, `specs` (with `specId`, `mode`, `source` fields), `availableSteps`, and `warnings`

#### Scenario: JSON output — summary specs have no content field

- **GIVEN** `config.contextMode: 'lazy'`
- **AND** a spec has `mode: 'summary'`
- **WHEN** `specd change context <name> <step>` is called with `--format json`
- **THEN** the spec entry in JSON has `specId`, `title`, `description`, `source`, `mode` but no `content` field

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

#### Scenario: dependsOn cycles do not produce warning lines

- **GIVEN** dependency traversal encounters a `dependsOn` cycle while compiling context
- **WHEN** `specd change context my-change designing --follow-deps` is run
- **THEN** stderr does not include a warning line solely for the cycle
- **AND** the command still returns the compiled context

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change context nonexistent designing` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
