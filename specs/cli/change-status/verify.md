# Verification: Change Status

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change status` is run without a positional name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Output format

#### Scenario: Text output shows artifact and file state

- **GIVEN** a change with artifact `specs` in `pending-review`
- **AND** one file under `specs` is `drifted-pending-review`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout shows the artifact aggregate state
- **AND** it lists the individual file row with `drifted-pending-review`

#### Scenario: Text output shows review section when review is required

- **GIVEN** `GetStatus` returns `review.required: true`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout includes a `review:` section
- **AND** it shows the route, reason, and affected absolute file paths

#### Scenario: JSON output includes review and file state

- **GIVEN** a change in `designing`
- **WHEN** `specd change status <name> --format json` is run
- **THEN** stdout includes `artifacts[].state`
- **AND** each artifact includes `files[].state`
- **AND** the top-level payload includes `review`
- **AND** `review.affectedArtifacts[].files[]` includes `filename` and `path`

#### Scenario: Review section omitted when not required

- **GIVEN** `GetStatus` returns `review.required: false`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout omits the `review:` section

#### Scenario: Text output renders Artifact DAG tree

- **GIVEN** a change with an artifact that has `hasTasks: true`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout includes an `artifacts (DAG):` section
- **AND** it renders the artifact dependency tree using ASCII characters
- **AND** each node includes a status symbol (e.g., `[✓]`, `[~]`), a scope label (e.g., `[scope: change]`), and the `[hasTasks]` tag if enabled

#### Scenario: Text output preserves core blocker messages

- **GIVEN** `GetStatus` returns lifecycle blockers
- **WHEN** `specd change status <name>` is run
- **THEN** the command prints those blocker codes and messages
- **AND** it does not substitute a locally recomputed explanation

#### Scenario: JSON output includes hasTasks in artifactDag

- **GIVEN** a change using a schema where one artifact has task capability
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the `artifactDag` array entries include `hasTasks: true` for that artifact

#### Scenario: JSON output state reflects drift-aware projection

- **GIVEN** an artifact in `complete` canonical state
- **AND** it has detected content drift (`hasDrift: true`)
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the `state` field in `artifactDag` is reported as `complete-with-drift`
- **AND** agents can detect drift without manually comparing hashes

### Requirement: Task completion display in DAG

#### Scenario: DAG shows task completion counts when data is available

- **GIVEN** a change with an artifact that has `hasTasks: true`
- **AND** `GetStatus` returns `taskCompletion: { complete: 3, incomplete: 7, total: 10 }` for that artifact
- **WHEN** `specd change status <name>` is run
- **THEN** the DAG render shows `[hasTasks - 3/10 done]` instead of `[hasTasks]`

#### Scenario: DAG shows fallback hasTasks tag when no task completion data

- **GIVEN** a change with an artifact that has `hasTasks: true`
- **AND** `GetStatus` returns no `taskCompletion` for that artifact
- **WHEN** `specd change status <name>` is run
- **THEN** the DAG render shows `[hasTasks]`

### Requirement: Display-state rendering

#### Scenario: Text output prefers complete-with-drift over raw complete

- **GIVEN** a file with canonical state `complete` and `hasDrift: true`
- **WHEN** `specd changes status <name>` is rendered in text mode
- **THEN** the user sees `complete-with-drift`

#### Scenario: JSON output includes canonical and display state

- **GIVEN** a drift-visible file in the status result
- **WHEN** `specd changes status <name> --format json` is run
- **THEN** the serialized row includes canonical state
- **AND** it includes the display-state projection

### Requirement: Schema version warning

#### Scenario: Schema mismatch

- **GIVEN** the change was created with schema version 1 and the active schema is version 2
- **WHEN** `specd change status <name>` is run
- **THEN** stderr contains a `warning:` line mentioning both schema versions
- **AND** the process exits with code 0

### Requirement: Change not found

#### Scenario: Unknown change name

- **WHEN** `specd change status nonexistent` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Schema-derived fields

#### Scenario: JSON output includes artifactDag

- **GIVEN** a change using a schema where one artifact has `hasTasks: true`
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the JSON output includes `schema.artifactDag` array
- **AND** each entry includes id, scope, optional, requires, hasTasks, output
- **AND** the `hasTasks` boolean reflects the schema definition

#### Scenario: JSON output for non-schema-std also includes artifactDag

- **GIVEN** a change using a custom schema
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the JSON output includes `schema.artifactDag` array

#### Scenario: Text output shows overlap entries when reason is spec-overlap-conflict

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'spec-overlap-conflict'`
- **AND** `review.overlapDetail` has two entries: `[{ archivedChangeName: 'beta', overlappingSpecIds: ['core:config'] }, { archivedChangeName: 'alpha', overlappingSpecIds: ['core:kernel'] }]`
- **WHEN** `specd change status <name>` is run
- **THEN** the review section shows `reason: spec-overlap-conflict`
- **AND** an `overlap:` subsection lists both entries as bullets

#### Scenario: Text output with single overlap entry

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'spec-overlap-conflict'`
- **AND** `review.overlapDetail` has one entry
- **WHEN** `specd change status <name>` is run
- **THEN** the overlap subsection shows one bullet with the archived change name and specs

#### Scenario: JSON output includes overlapDetail array when reason is spec-overlap-conflict

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'spec-overlap-conflict'`
- **AND** `review.overlapDetail` has two entries
- **WHEN** `specd change status <name> --format json` is run
- **THEN** `review.overlapDetail` is an array with two entries ordered newest-first
- **AND** each entry has `archivedChangeName` and `overlappingSpecIds`

#### Scenario: JSON output has empty overlapDetail array for other reasons

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'artifact-drift'`
- **WHEN** `specd change status <name> --format json` is run
- **THEN** `review.overlapDetail` is `[]`

#### Scenario: Overlap subsection omitted in text when reason is not spec-overlap-conflict

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'artifact-review-required'`
- **WHEN** `specd change status <name>` is run
- **THEN** no `overlap:` subsection appears in the review section

### Requirement: Implementation section

#### Scenario: Status renders tracked implementation files by review state

- **GIVEN** `GetStatus` returns tracked implementation files in `open`, `resolved`, and `ignored` state
- **WHEN** `specd change status <name> --implementation` is rendered
- **THEN** the implementation section exposes those tracked-file review states

#### Scenario: Status renders file-level and symbol-level confirmed links

- **GIVEN** `GetStatus` returns confirmed implementation links
- **AND** one link has symbol refinements while another is file-level only
- **WHEN** `specd change status <name> --implementation` is rendered
- **THEN** the implementation section shows both links
- **AND** only the symbol-level link renders symbol refinements

#### Scenario: Status may enrich symbol links with stale diagnostics

- **GIVEN** `GetStatus` returns symbol-level implementation links
- **AND** the CLI can query an indexed code graph
- **WHEN** one target symbol is absent from the graph database
- **AND** `specd change status <name> --implementation` is run
- **THEN** the rendered implementation section marks that symbol-level link as stale
- **AND** file-level links are not marked stale

#### Scenario: Status retries composed member links against the same file

- **GIVEN** `GetStatus` returns a symbol-level link with stored symbol `ArchiveChange.execute`
- **AND** the code graph does not expose that exact stored string
- **AND** the same file contains one graph symbol named `execute` with the expected kind
- **WHEN** `specd change status <name> --implementation` is rendered
- **THEN** the CLI resolves staleness using the same-file fallback on the rightmost member segment
- **AND** the link is not reported as stale

#### Scenario: Status keeps composed member links stale when fallback is ambiguous

- **GIVEN** `GetStatus` returns a symbol-level link with stored symbol `X.Y`
- **AND** the code graph does not expose that exact stored string
- **AND** the same file contains multiple graph symbols named `Y`
- **WHEN** `specd change status <name> --implementation` is rendered
- **THEN** the CLI leaves the stored symbol marked stale
- **AND** it does not guess which same-file symbol should satisfy the link

#### Scenario: Status shows graph-state hint when stale diagnostics are unavailable

- **GIVEN** `GetStatus` returns symbol-level implementation links
- **AND** the code graph is not indexed or is known stale
- **WHEN** `specd change status <name> --implementation` is rendered
- **THEN** the implementation section still renders the raw links
- **AND** it adds a graph-state hint instead of failing

#### Scenario: Implementation section omitted by default

- **GIVEN** `GetStatus` returns implementation tracking data
- **WHEN** `specd change status <name>` is run without `--implementation`
- **THEN** stdout omits the implementation section

### Requirement: Task completion in details section

#### Scenario: Details show task counts for task-complete artifacts

- **GIVEN** a change with an artifact that has `taskCompletion: { complete: 5, incomplete: 5, total: 10 }`
- **WHEN** `specd change status <name>` is run
- **THEN** the details section shows `tasks: 5/10` appended to that artifact's status line
