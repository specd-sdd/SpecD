# Verification: InvalidateVerification

## Requirements

### Requirement: Input and result contracts

#### Scenario: Result exposes canonical consequences

- **WHEN** valid completed verification is invalidated with a reason
- **THEN** the result includes stale projection, `invalidated: true`, persisted reason, signoff consequence, blockers, next action, committed recovery, and reconciled change

### Requirement: Existing verification required

#### Scenario: Unfinished attempt is not completed evidence

- **GIVEN** an active change has only an unfinished attempt
- **WHEN** invalidation is requested
- **THEN** `VerificationNotFoundError` is raised without mutation

### Requirement: Preserve evidence and mark stale

#### Scenario: Repeated invalidation is idempotent

- **GIVEN** completed evidence was already invalidated
- **WHEN** invalidation is requested again with a different reason
- **THEN** it observes canonical validity, returns `invalidated: false`, keeps and returns the original cause, and appends no duplicate event
- **AND** the new request reason is not persisted as authoritative evidence

### Requirement: Canonical reconciliation and recovery

#### Scenario: Invalidation blocks required boundary in place

- **GIVEN** completed verification is withdrawn at a boundary requiring it
- **WHEN** reconciliation finishes
- **THEN** progress is blocked with start/checks/complete guidance in the current state
- **AND** dependent signoff becomes stale while spec approval remains unaffected

#### Scenario: Ungated archivable invalidation retains the phase and recommends verification

- **GIVEN** an active change in `archivable` with completed valid verification and no sign-off gate
- **WHEN** `InvalidateVerification` withdraws that evidence
- **THEN** the change remains in `archivable` with stale completed evidence and a verification blocker
- **AND** `nextAction.command` is `/specd-verify`, not null or a forced lifecycle transition

#### Scenario: Ungated archiving invalidation remains phase-aware

- **GIVEN** an active change in `archiving` with completed valid verification and no higher-priority recovery
- **WHEN** verification is withdrawn
- **THEN** the state remains `archiving` and the result recommends `/specd-verify` in place

#### Scenario: Mandatory gate recovery outranks in-place guidance

- **GIVEN** invalidated verification makes required sign-off stale in `archivable`
- **WHEN** canonical reconciliation commits sign-off recovery
- **THEN** the change returns to `done` exactly once
- **AND** the result reports the committed state, blockers, and corresponding recovery/verification guidance rather than a stale `archivable` action

### Requirement: No lifecycle self-transition

#### Scenario: Invalidation changes evidence only

- **WHEN** verification is invalidated
- **THEN** no transition, test execution, validation, approval, or baseline capture occurs

### Requirement: Established use-case composition signatures

#### Scenario: Factory forms resolve equivalently

- **WHEN** constructed by deps and by config/options
- **THEN** both use the same repository, actor, and reconciler behavior
- **AND** options with deps produce the established invalid-arguments error
