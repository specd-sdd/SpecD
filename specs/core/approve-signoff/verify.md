# Verification: ApproveSignoff

## Requirements

### Requirement: Gate guard

#### Scenario: Signoff gate is disabled

- **GIVEN** `ApproveSignoff` is constructed with `approvals.signoff: false`
- **WHEN** `execute()` is called with `{ name, reason }`
- **THEN** an `ApprovalGateDisabledError` is thrown with gate `'signoff'`
- **AND** no repository access occurs

### Requirement: Change lookup

#### Scenario: Change does not exist

- **GIVEN** the signoff gate is enabled
- **WHEN** `execute()` is called with a `name` that does not exist in the repository
- **THEN** a `ChangeNotFoundError` is thrown

### Requirement: Artifact hash computation

Scenarios:

#### Scenario: Whole linked files define implementation evidence

- **GIVEN** confirmed links include repeated paths and symbol ranges
- **WHEN** signoff fingerprints implementation
- **THEN** each project-relative path appears once in lexical order and its whole file is hashed
- **AND** unresolved or unreadable files fail signoff

#### Scenario: Empty observed implementation map is valid

- **WHEN** refreshed confirmed links contain no files
- **THEN** signoff records an empty implementation map distinct from legacy unknown evidence

### Requirement: Signoff recording and state transition

Scenarios:

#### Scenario: Signoff requires current completed verification

- **GIVEN** the change is `done` but completed verification is stale
- **WHEN** signoff is requested
- **THEN** no signoff is recorded and `VerificationStaleError` is thrown
- **AND** the error carries only structured data (`changeName`), not a recommended action or command
- **AND** the delivery layer renders the in-place verification renewal recommendation from that data in its own syntax

#### Scenario: Valid signoff stays in done

- **WHEN** eligible signoff succeeds
- **THEN** valid evidence is recorded while lifecycle state remains `done`

#### Scenario: Verification evidence errors remain distinct

- **WHEN** signoff sees respectively no completion, active-only work, stale or legacy-unknown evidence, or a valid record with a mismatched expected fingerprint
- **THEN** it returns respectively not-found, in-progress, stale/not-current, or fingerprint-mismatch errors
- **AND** stale evidence is never reported as not found

#### Scenario: Stale verification error carries no command and exposes changeName

- **GIVEN** a change in `done` whose completed verification is stale
- **WHEN** `execute({ name: 'checkout-retry', reason })` is called
- **THEN** it throws `VerificationStaleError` with code `VERIFICATION_STALE` and `changeName` equal to `checkout-retry`
- **AND** its `message` contains no CLI command, flag, or slash command (no `specd`, `--`, or `/specd-`)

#### Scenario: Signoff actor decorator remains authoritative

- **WHEN** signoff resolves actor name and email
- **THEN** it uses the existing decorated actor resolver with unchanged privacy and fallback behavior
- **AND** it resolves exactly one decorated identity for the logical operation
- **AND** reconciliation, the projection, and all appended events receive that same value

#### Scenario: Signoff without verification when verifying is disabled

- **GIVEN** a change in `done` whose schema disables `verifying`
- **AND** no verification evidence exists
- **WHEN** `ApproveSignoff.execute` runs with a valid reason
- **THEN** sign-off is recorded
- **AND** no `VerificationNotFoundError` or other verification eligibility error is thrown

#### Scenario: Eligible states come from the check bindings

- **GIVEN** `approval.signoff` is bound as a transition source from `done`, `pending-signoff`, and `signed-off`
- **WHEN** `ApproveSignoff` decides whether the current state accepts consent
- **THEN** the decision uses the binding `from` states of `approval.signoff`
- **AND** a change in any other state fails with `InvalidStateTransitionError`

#### Scenario: Consent in a parking state never transitions

- **GIVEN** a historic change in `signed-off` with no recorded sign-off and valid verification
- **WHEN** sign-off is recorded
- **THEN** the sign-off is recorded
- **AND** no `transitioned` event is appended and the state is still `signed-off`

#### Scenario: Stale consent in a parking state is recovered before it is renewed

- **GIVEN** a historic change in `signed-off` with a stale sign-off
- **WHEN** `ApproveSignoff` runs
- **THEN** the reconciler first commits the return to `done`
- **AND** the renewed sign-off is recorded in `done`

### Requirement: Canonical pre-signoff reconciliation

#### Scenario: Reconciliation blocks signing a changed snapshot

- **WHEN** fresh facts invalidate verification or artifact review before signoff
- **THEN** canonical changes persist and the use case does not approve a later snapshot

### Requirement: Persistence and return value

Scenarios:

#### Scenario: Signoff fingerprint is atomically current

- **WHEN** eligible signoff succeeds
- **THEN** its artifact and implementation fingerprints are those evaluated in the same serialized mutation

#### Scenario: Failed eligibility never signs current bytes

- **WHEN** reconciliation makes signoff inapplicable
- **THEN** canonical effects persist and no signoff event is added

### Requirement: Input contract

#### Scenario: Input fields are name and reason only

- **WHEN** `ApproveSignoffInput` is constructed
- **THEN** `name` and `reason` are required
- **AND** approval gate state is not part of the input

### Requirement: Approval gate baked at construction

#### Scenario: Factory passes config.approvals

- **WHEN** `createApproveSignoff(config)` constructs the use case
- **THEN** the instance receives `config.approvals` as its baked gate configuration

#### Scenario: Enabled gate allows execute with name and reason

- **GIVEN** `ApproveSignoff` is constructed with `approvals.signoff: true`
- **GIVEN** the change is in `pending-signoff` state
- **WHEN** `execute({ name, reason })` is called
- **THEN** a valid signoff is recorded
- **AND** the change remains in `pending-signoff`

#### Scenario: Sovereign schema resolution in gate guard

- **GIVEN** `ApproveSignoff` is constructed with `approvals.signoff: true`
- **GIVEN** the active schema name differs from the change `schemaName`
- **WHEN** `execute({ name, reason })` is called
- **THEN** it resolves the schema via `SchemaProvider.get(change.schemaName)` without throwing `SchemaMismatchError`

### Requirement: Config-based factory delegates through resolveApproveSignoffDeps

Scenarios:

#### Scenario: Composition reuses shared tracking and reconciliation

- **WHEN** either supported factory form constructs signoff
- **THEN** both resolve the same tracking, fingerprint, gate, and reconciler dependencies
- **AND** no kernel or filesystem graph is rebuilt locally

#### Scenario: Invalid mixed factory arguments fail consistently

- **WHEN** composition options accompany the deps overload
- **THEN** the established invalid-factory-arguments error is returned
