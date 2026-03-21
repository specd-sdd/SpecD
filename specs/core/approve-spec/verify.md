# Verification: ApproveSpec

## Requirements

### Requirement: Gate guard

#### Scenario: Spec approval gate is disabled

- **WHEN** `execute()` is called with `approvalsSpec: false`
- **THEN** an `ApprovalGateDisabledError` is thrown with gate `'spec'`
- **AND** no repository access occurs

### Requirement: Change lookup

#### Scenario: Change does not exist

- **GIVEN** the spec approval gate is enabled
- **WHEN** `execute()` is called with a `name` that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Artifact hash computation

#### Scenario: Artifacts are hashed with schema cleanup rules

- **GIVEN** the change has two artifacts of type `spec` and `verify`
- **AND** the schema defines a pre-hash cleanup rule for `spec` but not `verify`
- **WHEN** the use case computes artifact hashes
- **THEN** the `spec` artifact content has the cleanup rule applied before hashing
- **AND** the `verify` artifact content is hashed without cleanup

#### Scenario: Artifact cannot be loaded

- **GIVEN** the change has an artifact entry but `ChangeRepository.artifact()` returns `null` for it
- **WHEN** the use case computes artifact hashes
- **THEN** that artifact is skipped and does not appear in the hash map

#### Scenario: Schema does not resolve

- **GIVEN** `SchemaProvider.get()` returns `null` for the configured schema
- **WHEN** the use case computes artifact hashes
- **THEN** all artifacts are hashed without any pre-hash cleanup rules applied

### Requirement: Approval recording and state transition

#### Scenario: Change is in pending-spec-approval state

- **GIVEN** the change is in `pending-spec-approval` state
- **WHEN** `execute()` completes successfully
- **THEN** the change history contains a `spec-approved` event with the provided reason, computed artifact hashes, and the resolved actor
- **AND** the change state is `spec-approved`

#### Scenario: Change is not in pending-spec-approval state

- **GIVEN** the change is in `drafting` state
- **WHEN** `execute()` is called
- **THEN** an `InvalidStateTransitionError` is thrown

### Requirement: Persistence and return value

#### Scenario: Change is saved and returned

- **GIVEN** a successful approval
- **WHEN** `execute()` returns
- **THEN** `ChangeRepository.save()` has been called with the updated change
- **AND** the returned `Change` has state `spec-approved`

### Requirement: Input contract

#### Scenario: All input fields are required

- **WHEN** `ApproveSpecInput` is constructed
- **THEN** `name`, `reason`, and `approvalsSpec` are all required
- **AND** all fields are readonly
