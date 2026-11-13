# Verification: Note Auto-removal Policy

## Requirements

### Requirement: Policy variants and validation

#### Scenario: Invalid variants have zero downstream effects

- **GIVEN** a policy containing anyOf: [] or states: ['all', 'ready']
- **WHEN** Core validates the policy
- **THEN** a typed actionable error identifies the invalid rule
- **AND** no transition, hook or persistence is invoked

### Requirement: Closed Core parser

#### Scenario: Parser rejects extra archive segments

- **GIVEN** the strings leave-state::forward and operation-success:archive:forward
- **WHEN** each is parsed, then valid enter-state:verifying,done:forward is parsed
- **THEN** invalid inputs are rejected rather than partially accepted
- **AND** the valid input yields one typed alternative with two states and forward direction

### Requirement: Effective event evaluation

#### Scenario: Several matches remove once and keep new notes

- **GIVEN** an existing note matches both enter verifying and leave implementing, plus a new note with that policy is requested
- **WHEN** implementing-to-verifying succeeds, and the same operation is repeated as an invalid self-hop
- **THEN** the old note has one note-removed event, the new note survives its creation hop, and the failed self-hop changes neither notes nor audit

### Requirement: Policy equivalence

#### Scenario: Order and default direction do not distinguish notes

- **GIVEN** equivalent rules with reversed anyOf/state order and omitted versus explicit any direction
- **WHEN** policy comparison runs
- **THEN** the policies match while a changed direction, absent policy or different trigger remains distinct

### Requirement: Recovery and optional steps

#### Scenario: Disabled verification still reaches cleanup boundary

- **GIVEN** a note has forward leave implementing or forward enter verifying/done alternatives and verifying is disabled
- **WHEN** implementing advances directly to done, then a separate change recovers backwards to done
- **THEN** the forward bypass removes its matching note and backward recovery preserves its existing forward-only note
