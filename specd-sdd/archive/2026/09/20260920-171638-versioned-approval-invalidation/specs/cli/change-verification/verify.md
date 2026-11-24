# Verification: Change Verification

## Requirements

### Requirement: Command group and signature

#### Scenario: Commands work in any active lifecycle state

- **WHEN** start, complete, or invalidate is called for an active change outside `verifying`
- **THEN** lifecycle state alone does not reject the operation or cause a transition

### Requirement: Start and complete delegation

#### Scenario: Start captures only after input checks

- **GIVEN** unresolved implementation files or links
- **WHEN** start is invoked
- **THEN** the relevant registered check fails and no attempt is created

#### Scenario: Complete refuses a mismatched attempt

- **GIVEN** current inputs differ from the active attempt baseline
- **WHEN** complete is invoked
- **THEN** it exits with structured mismatch guidance and records no successful evidence

### Requirement: Delegation to InvalidateVerification

#### Scenario: Invalidate remains a thin adapter

- **WHEN** invalidate is invoked with a reason
- **THEN** it delegates the exact input and performs no fingerprint, manifest, test, or transition logic itself

### Requirement: Success and idempotent output

#### Scenario: Structured output distinguishes attempts and evidence

- **WHEN** start, completion, and repeated invalidation succeed
- **THEN** text, JSON, and TOON identify the relevant attempt or retained evidence
- **AND** invalidation renders the canonical next action supplied by Core while start and complete do not invent one
- **AND** no source content is exposed

#### Scenario: Repeated invalidation reports persisted reason

- **GIVEN** completed evidence was invalidated with reason A
- **WHEN** invalidate is repeated with reason B
- **THEN** text, JSON, and TOON report `invalidated: false` and persisted reason A
- **AND** reason B is not presented as stored audit evidence

### Requirement: Error handling

#### Scenario: Expected failures preserve stable diagnostics

- **WHEN** a required attempt, evidence, reason, or resolved input is absent
- **THEN** the command exits with code 1 and preserves the core error code and repair guidance

#### Scenario: Invalid format fails before mutation

- **GIVEN** `--format` is not `text`, `json`, or `toon`
- **WHEN** start, complete, or invalidate is invoked
- **THEN** the command exits with code 1 before resolving or calling the mutating use case
- **AND** no attempt, completed evidence, or invalidation event is persisted

### Requirement: Safe public output projection

#### Scenario: Structured output whitelists safe fields

- **GIVEN** a Core result contains full fingerprints and reconciliation details
- **WHEN** JSON or TOON output is rendered
- **THEN** it includes documented identifiers, status, safe counts/algorithms, and applicable reconciliation fields
- **AND** it excludes file hashes, source contents, and internal-only result fields

#### Scenario: Text and structured formats retain semantic parity

- **WHEN** the same successful operation is rendered in text, JSON, and TOON
- **THEN** shared attempt/evidence identity, status, persisted reason, and applicable recovery meaning agree across formats

### Requirement: Status and skill discoverability

#### Scenario: Delegated compliance does not own the outer attempt

- **GIVEN** verify explicitly supplies its active attempt to compliance
- **WHEN** compliance finishes its audit
- **THEN** compliance returns findings without start or complete
- **AND** verify completes only after all work succeeds
