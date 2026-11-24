# Verification: List Change Notes

## Requirements

### Requirement: Validated snapshot query

#### Scenario: Inspection never recreates a deleted note

- **GIVEN** a peer has pending drift but its note was manually removed
- **WHEN** ListChangeNotes executes repeatedly
- **THEN** the current collection stays empty without reconciliation, actor resolution, history scan or writes

### Requirement: Read contract and composition

#### Scenario: Caller mutation cannot alter stored data

- **GIVEN** list returns notes containing nested metadata/policies
- **WHEN** a caller modifies returned structures
- **THEN** subsequent persisted inspection is unchanged and the complete stored privacy identity is preserved
