# Verification: Remove Change Note

## Requirements

### Requirement: Input and selection

#### Scenario: Ambiguous prefix and blank reason cannot mutate

- **GIVEN** two notes share a prefix and an alternative request supplies an empty reason
- **WHEN** each removal is attempted
- **THEN** each fails with a typed error and both notes/audit remain unchanged
- **AND** an exact UUID selects only its own note

### Requirement: Removal independent of retention

#### Scenario: Manual deletion overrides automatic retention

- **GIVEN** a note is configured to survive until archive succeeds
- **WHEN** remove is called by a different actor with a multiline reason
- **THEN** the note is removed immediately and one manual note-removed records requesting actor and trimmed reason
- **AND** original note author is retained in historical note-added

### Requirement: Operational independence and API

#### Scenario: Deleting a drift explanation does not heal drift

- **GIVEN** artifacts and evidence are stale and a drift note exists
- **WHEN** remove succeeds through Kernel
- **THEN** the note disappears but blockers, artifact states and evidence remain stale
