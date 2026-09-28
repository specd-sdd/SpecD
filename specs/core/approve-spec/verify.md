# Verification: ApproveSpec

## Requirements

### Requirement: Gate guard

#### Scenario: Spec approval gate is disabled

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: false`
- **WHEN** `execute()` is called with `{ name, reason }`
- **THEN** an `ApprovalGateDisabledError` is thrown with gate `'spec'`
- **AND** no repository access occurs

### Requirement: Change lookup

#### Scenario: Change does not exist

- **GIVEN** the spec approval gate is enabled
- **WHEN** `execute()` is called with a `name` that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Artifact hash computation

Scenarios:

#### Scenario: Task artifacts are excluded from consent fingerprint

- **GIVEN** all required artifacts are valid and one declares `hasTasks: true`
- **WHEN** spec approval computes its fingerprint
- **THEN** non-task artifacts use configured cleanup and the task artifact is excluded

#### Scenario: Missing required artifact blocks approval

- **WHEN** a required non-task artifact is missing or pending review
- **THEN** fingerprint approval fails without recording consent

#### Scenario: Approval snapshots canonical scope

- **GIVEN** repeated and differently ordered spec IDs resolve to one canonical set
- **WHEN** spec approval computes its fingerprint
- **THEN** the sorted deduplicated spec IDs and artifact fingerprint are captured together

### Requirement: Approval recording and state transition

Scenarios:

#### Scenario: Approval is renewed only in ready

- **GIVEN** stale required consent while the change is implementing
- **WHEN** approval is requested
- **THEN** reconciliation routes through designing and ready before approval can succeed
- **AND** no pending state or deleted history is produced

#### Scenario: Successful renewal retains prior audit history

- **WHEN** consent is renewed in reconciled `ready`
- **THEN** the current projection and new event contain the same complete scope-aware fingerprint
- **AND** prior approval events retain their earlier scopes unchanged

#### Scenario: Approval actor decorator remains authoritative

- **WHEN** approval resolves actor name and email
- **THEN** it uses the existing decorated actor resolver with the same privacy and fallback behavior
- **AND** it resolves exactly one decorated identity for the logical operation
- **AND** reconciliation, the projection, and all appended events receive that same value

### Requirement: Canonical pre-approval reconciliation

#### Scenario: Newly detected drift prevents approval

- **WHEN** reconciliation detects non-task drift before approval
- **THEN** it persists canonical review and recovery and approval is not recorded

### Requirement: Persistence and return value

Scenarios:

#### Scenario: Approval and reconciliation share one snapshot

- **WHEN** eligible approval succeeds
- **THEN** the valid projection and event refer to the same fresh fingerprint committed in one mutation

#### Scenario: Ineligible approval commits only reconciliation

- **WHEN** canonical reconciliation makes approval inapplicable
- **THEN** its recovery persists without adding an approval event

### Requirement: Input contract

#### Scenario: Input fields are name and reason only

- **WHEN** `ApproveSpecInput` is constructed
- **THEN** `name` and `reason` are required
- **AND** approval gate state is not part of the input

### Requirement: Approval gate baked at construction

#### Scenario: Factory passes config.approvals

- **WHEN** `createApproveSpec(config)` constructs the use case
- **THEN** the instance receives `config.approvals` as its baked gate configuration

#### Scenario: Enabled gate allows execute with name and reason

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: true`
- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `execute({ name, reason })` is called
- **THEN** the change transitions to `spec-approved`

#### Scenario: Schema mismatch fails in gate guard

- **GIVEN** `ApproveSpec` is constructed with `approvals.spec: true`
- **GIVEN** the active schema name differs from the change `schemaName`
- **WHEN** `execute({ name, reason })` is called
- **THEN** a `SchemaMismatchError` is thrown before `mutate` is invoked

### Requirement: Config-based factory delegates through resolveApproveSpecDeps

Scenarios:

#### Scenario: Both factories are behaviorally equivalent

- **WHEN** approval is constructed through deps and through config/options
- **THEN** both delegate to the same canonical dependencies and result
- **AND** options with deps raise the established invalid-arguments error

#### Scenario: Factory does not bootstrap a kernel

- **WHEN** dependencies are resolved
- **THEN** only approval-specific ports are constructed and shared composition is reused
