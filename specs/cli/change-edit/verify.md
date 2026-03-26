# Verification: Change Edit

## Requirements

### Requirement: Command signature

#### Scenario: No edit flags provided

- **WHEN** `specd change edit my-change` is run with no edit flags
- **THEN** the command exits with code 1 and prints a usage error to stderr

### Requirement: Workspace derivation

#### Scenario: Workspace added when new spec requires it

- **GIVEN** a change with `specIds: ["default:auth/login"]` and `workspaces: ["default"]`
- **WHEN** `specd change edit my-change --add-spec billing-ws:billing/invoices` is run
- **THEN** the resulting `workspaces` includes both `default` and `billing-ws`

#### Scenario: Workspace removed when no specs reference it

- **GIVEN** a change with `specIds: ["default:auth/login", "billing-ws:billing/invoices"]` and `workspaces: ["default", "billing-ws"]`
- **WHEN** `specd change edit my-change --remove-spec billing-ws:billing/invoices` is run
- **THEN** the resulting `workspaces` contains only `default`
- **AND** `billing-ws` is removed automatically

#### Scenario: Workspace unchanged when other specs still reference it

- **GIVEN** a change with `specIds: ["billing-ws:billing/invoices", "billing-ws:billing/payments"]`
- **WHEN** `specd change edit my-change --remove-spec billing-ws:billing/invoices` is run
- **THEN** `billing-ws` remains in `workspaces` because `billing-ws:billing/payments` still references it

### Requirement: ReadOnly workspace rejection

#### Scenario: Adding spec from readOnly workspace rejected

- **GIVEN** workspace `platform` is declared with `ownership: readOnly` in `specd.yaml`
- **AND** a change `my-change` exists
- **WHEN** `specd change edit my-change --add-spec platform:auth/tokens` is run
- **THEN** the command exits with code 1
- **AND** stderr contains `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`
- **AND** the change is not modified

#### Scenario: Removing spec not subject to ownership check

- **GIVEN** a change `my-change` with `specIds` including `platform:auth/tokens`
- **AND** workspace `platform` is `readOnly`
- **WHEN** `specd change edit my-change --remove-spec platform:auth/tokens` is run
- **THEN** the spec is removed from the change
- **AND** no ownership error is raised

#### Scenario: No edits applied when readOnly check fails

- **GIVEN** a change `my-change` with `specIds: ["default:auth/login"]`
- **WHEN** `specd change edit my-change --add-spec default:auth/register --add-spec platform:auth/tokens` is run
- **AND** workspace `platform` is `readOnly`
- **THEN** the command exits with code 1
- **AND** neither spec is added (atomic rejection)

### Requirement: Invariant enforcement

#### Scenario: Removing last spec rejected

- **GIVEN** a change with a single specId `default:auth/login`
- **WHEN** `specd change edit my-change --remove-spec default:auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message
- **AND** no changes are made to the change

### Requirement: Approval invalidation

#### Scenario: Spec change triggers invalidation

- **GIVEN** a change with an active spec approval in `spec-approved` state
- **WHEN** `specd change edit my-change --add-spec auth/register` is run
- **THEN** an `invalidated` event is appended to history
- **AND** the change is rolled back to `designing`
- **AND** stderr contains a `warning:` about invalidation

#### Scenario: No active approval — no invalidation event

- **GIVEN** a change with no active approval in `designing` state
- **WHEN** `specd change edit my-change --add-spec auth/register` is run
- **THEN** no `invalidated` event is appended
- **AND** the state remains `designing`

### Requirement: Output on success

#### Scenario: Text output shows updated specs and workspaces

- **WHEN** `specd change edit my-change --add-spec auth/register` succeeds
- **THEN** stdout contains `updated change my-change` followed by the new `specs:` and `workspaces:` lines
- **AND** the process exits with code 0

#### Scenario: JSON output with invalidation

- **GIVEN** a change in `spec-approved` state
- **WHEN** `specd change edit my-change --add-spec auth/register --format json` is run
- **THEN** stdout is valid JSON with `result` equal to `"ok"`, `specIds`, `workspaces`, `invalidated` equal to `true`, and `state` equal to `"designing"`

### Requirement: Error cases

#### Scenario: Change not found

- **WHEN** `specd change edit nonexistent --add-spec auth/login` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Removing spec not in specIds

- **GIVEN** a change whose `specIds` does not include `default:auth/missing`
- **WHEN** `specd change edit my-change --remove-spec default:auth/missing` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: Unknown workspace prefix in --add-spec

- **WHEN** `specd change edit my-change --add-spec unknown-ws:some/path` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an `error:` message

#### Scenario: ReadOnly workspace in --add-spec

- **GIVEN** workspace `platform` is declared with `ownership: readOnly`
- **WHEN** `specd change edit my-change --add-spec platform:auth/tokens` is run
- **THEN** the command exits with code 1
- **AND** stderr contains an error about readOnly ownership
