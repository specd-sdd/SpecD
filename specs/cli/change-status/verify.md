# Verification: Change Status

## Requirements

### Requirement: Command signature

#### Scenario: Missing name argument

- **WHEN** `specd change status` is run without a positional name
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Drafted change status is read-only

#### Scenario: Drafted change does not list transition commands in next action

- **GIVEN** `GetStatus` returns `draftView` for the requested name
- **WHEN** `specd change status <name>` runs in text mode
- **THEN** output indicates the change is drafted
- **AND** output does not suggest `specd change transition` as the next action

#### Scenario: JSON output includes isDrafted for drafted name

- **GIVEN** `GetStatus` returns `draftView` and no `change`
- **WHEN** `specd change status <name> --format json` runs
- **THEN** stdout includes `isDrafted: true` or equivalent drafted marker
- **AND** `availableTransitions` is empty or omitted

#### Scenario: Active change behaviour unchanged

- **GIVEN** `GetStatus` returns `change` and no `draftView`
- **WHEN** `specd change status <name>` runs
- **THEN** lifecycle transitions may still appear when the core use case provides them

#### Scenario: Discarded name is not found via change status

- **GIVEN** a change exists only under `discarded/`
- **WHEN** `specd change status <name>` runs
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

### Requirement: Output format

#### Scenario: Text output shows artifact and file state

- **GIVEN** a change with artifact `specs` in `pending-review`
- **AND** one file under `specs` is `drifted-pending-review`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout shows the artifact aggregate state
- **AND** it lists the individual file row with `drifted-pending-review`

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

### Requirement: Lifecycle projections come from GetStatus checks

#### Scenario: Incomplete tasks do not list verifying as available

- **GIVEN** `GetStatus` omits `verifying` from `availableTransitions`
- **WHEN** `specd changes status <name>` is rendered
- **THEN** the displayed available transitions omit `verifying`
- **AND** the CLI does not add it from `VALID_TRANSITIONS` alone

#### Scenario: nextAction implements vs verify follows GetStatus

- **GIVEN** `GetStatus.nextAction` recommends `/specd-verify`
- **WHEN** the status command is rendered
- **THEN** it does not recommend `/specd-implement` instead

#### Scenario: Drafted JSON empties hops even if Core leaks them

- **GIVEN** a drafted change
- **AND** `GetStatus.lifecycle.availableTransitions` includes `ready`
- **AND** `GetStatus.lifecycle.availableSteps` is non-empty
- **WHEN** `specd change status <name> --format json` is rendered
- **THEN** JSON `availableTransitions` is `[]`
- **AND** JSON `availableSteps` is `[]`
- **AND** JSON `nextAction.command` is `null`

### Requirement: Text status omits duplicated review file lists

#### Scenario: Artifact-review-required does not reprint files under review

- **GIVEN** `GetStatus.review.required` is true
- **AND** `reason` is `'artifact-review-required'`
- **AND** `affectedArtifacts` lists pending-review files
- **WHEN** `specd changes status <name>` is rendered as `format=text`
- **THEN** `artifacts (details):` still lists those files with `pending-review`
- **AND** stdout includes a `review:` header with `required` / `route` / `reason`
- **AND** when Core supplies `review.message`, that message is printed
- **AND** the output does not list those file paths under `review:`
- **AND** JSON output still includes `review.affectedArtifacts`

#### Scenario: Drift is shown only in artifacts details

- **GIVEN** `review.reason` is `'artifact-drift'`
- **WHEN** status is rendered as `format=text`
- **THEN** drifted files appear under `artifacts (details):` with `[drift]`
- **AND** the output does not reprint those paths under `review:`

#### Scenario: Overlap peers still print in text

- **GIVEN** `review.reason` is `'spec-overlap-conflict'`
- **AND** `overlapDetail` contains an archived change name and overlapping spec ids
- **WHEN** status is rendered as `format=text`
- **THEN** the output includes those overlap peers
- **AND** it does not list `affectedArtifacts` file paths under `review:`

### Requirement: Text blockers include check labels

#### Scenario: DEPS_INCONSISTENT blocker shows Checking spec dependencies

- **GIVEN** `GetStatus.blockers` includes `{ code: 'DEPS_INCONSISTENT', label: 'Checking spec dependencies', checkId: 'deps.consistent', message: '…' }`
- **WHEN** `specd changes status <name>` is rendered as `format=text`
- **THEN** the blockers section includes `DEPS_INCONSISTENT` and `Checking spec dependencies`
- **AND** JSON output includes `blockers[].label`

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
- **AND** each entry includes id, scope, optional, requires, children, hasTasks, output
- **AND** `children` equals `schema.artifactDag().childrenOf(id)` for that entry
- **AND** the `hasTasks` boolean reflects the schema definition

#### Scenario: JSON output for non-schema-std also includes artifactDag

- **GIVEN** a change using a custom schema
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the JSON output includes `schema.artifactDag` array
- **AND** `children` on each entry matches `childrenOf` from that schema's `artifactDag()`

#### Scenario: Text DAG tree uses schema artifactDag roots and children

- **GIVEN** a change using schema-std
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout includes an `artifacts (DAG):` section
- **AND** the tree's root and child ordering matches `artifactDag().roots()` and `childrenOf()` (not declaration order alone)

#### Scenario: Text DAG uses display status for drift

- **GIVEN** an artifact file with canonical status `complete` and `hasDrift: true`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** the DAG line for that artifact shows display status `complete-with-drift` (or equivalent display projection), not only raw `complete`

#### Scenario: Text DAG does not repeat convergent nodes

- **GIVEN** schema-std where `design` is a direct child of both `proposal` and `specs`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** the `design` subtree appears once in the DAG section (not duplicated under every parent path)

#### Scenario: Text output shows overlap peers without review file lists

- **GIVEN** `GetStatus` returns `review.required: true` with `reason: 'spec-overlap-conflict'`
- **AND** `review.overlapDetail` has two entries: `[{ archivedChangeName: 'beta', overlappingSpecIds: ['core:config'] }, { archivedChangeName: 'alpha', overlappingSpecIds: ['core:kernel'] }]`
- **WHEN** `specd change status <name>` is run in text mode
- **THEN** stdout includes an `overlap:` section listing both entries as bullets
- **AND** stdout includes a `review:` header with `required` / `route` / `reason` / human `message`
- **AND** stdout does not list `affectedArtifacts` file paths under `review:`
- **AND** blockers do not include `OVERLAP_CONFLICT` for that invalidation

### Requirement: Delegates refresh policy to GetStatus

#### Scenario: Status command does not call refresh directly

- **GIVEN** `specd change status <name>` is executed for an active change
- **WHEN** the command handler runs
- **THEN** it calls `GetStatus` without invoking `RefreshImplementationTracking` directly
- **AND** it does not invoke `ImplementationDetector` directly

### Requirement: Task completion in details section

#### Scenario: Details show task counts for task-complete artifacts

- **GIVEN** a change with an artifact that has `taskCompletion: { complete: 5, incomplete: 5, total: 10 }`
- **WHEN** `specd change status <name>` is run
- **THEN** the details section shows `tasks: 5/10` appended to that artifact's status line

### Requirement: Basic info section

#### Scenario: Text output omits standalone specs list

- **WHEN** `specd change status <name>` is run in text mode
- **THEN** basic info includes name and state
- **AND** it does NOT include a `specs:` line

### Requirement: Specs and dependencies section

#### Scenario: Text output shows specs and dependencies section

- **GIVEN** a change with `specIds: ['core:a', 'core:b']`
- **AND** `specDependsOn` has `{'core:a': ['core:c']}`
- **WHEN** `specd change status <name>` is run
- **THEN** stdout includes a `specs and dependencies:` section
- **AND** it lists `core:a: core:c`
- **AND** it lists `core:b: (none)`

#### Scenario: JSON output includes specDependsOn

- **GIVEN** a change with declared spec dependencies
- **WHEN** `specd change status <name> --format json` is run
- **THEN** the JSON output includes a `specDependsOn` field matching the change manifest

### Requirement: Implementation section

#### Scenario: Status uses the shared SDK projection

- **GIVEN** implementation links include reexport, hierarchy, ambiguity, and incomplete coverage cases
- **WHEN** `change status --implementation` runs
- **THEN** it renders the same outcomes and stored values as implementation review
- **AND** performs no independent graph matching or mutation
