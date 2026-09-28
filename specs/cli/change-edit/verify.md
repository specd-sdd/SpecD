# Verification: Change Edit

## Requirements

### Requirement: Command signature

Scenarios:

#### Scenario: Partial policy edit preserves unspecified dimension

- **WHEN** only one policy flag is supplied
- **THEN** only that dimension is sent to `EditChange`

#### Scenario: At least one edit remains required

- **WHEN** no scope, description, or policy edit flag is supplied
- **THEN** the command fails before calling core

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

Scenarios:

#### Scenario: Output reflects canonical gate recovery

- **GIVEN** a scope edit makes required spec consent stale under preserve
- **WHEN** the command succeeds
- **THEN** it reports the committed `designing` state, affected evidence, and artifact review
- **AND** policy-only edits do not claim invalidation without a reported drift

#### Scenario: Ungated preserve reports blocker without invented return

- **GIVEN** scope editing creates review without required spec consent
- **WHEN** workflow policy is preserve
- **THEN** output shows the retained state and forward-progress blocker

#### Scenario: Scope change does not imply validity warning

- **GIVEN** an edit normalizes to the approved canonical scope and causes no projection change
- **WHEN** output is rendered
- **THEN** `scopeChanged` and actual validity change remain distinct
- **AND** no approval-invalidated warning is printed

#### Scenario: Structured output includes recovery guidance

- **WHEN** reconciliation returns blockers and next action
- **THEN** text, JSON, and TOON render that Core-owned guidance

#### Scenario: Text output renders blocker codes and next command

- **GIVEN** an ungated preserve scope edit returns a nonempty blocker list and `/specd-design` or in-place review next action from Core
- **WHEN** the default text presenter renders the successful result
- **THEN** stdout names every returned blocker code and the exact Core-owned next-action command
- **AND** it does not infer a different recovery from lifecycle state

### Requirement: Output on success

#### Scenario: Text output shows updated specs and workspaces

- **WHEN** `specd change edit my-change --add-spec auth/register` succeeds
- **THEN** stdout contains `updated change my-change` followed by the new `specs:` and `workspaces:` lines
- **AND** the process exits with code 0

#### Scenario: JSON output reflects required-gate scope recovery

- **GIVEN** a change with valid required spec consent and workflow `preserve`
- **WHEN** `changes edit` adds a canonical spec with `--format json`
- **THEN** output has `result: "ok"`, updated `specIds` and `workspaces`, `scopeChanged: true`, and `validityChanged: true`
- **AND** the compatibility `invalidated` field is true and committed state is `designing`
- **AND** blockers, next action, projection changes, and automatic return match the Core result

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
