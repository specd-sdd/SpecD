# Verification: Get Change Note

## Requirements

### Requirement: Validated exact or unique-prefix lookup

#### Scenario: Missing and ambiguous selection are explicit

- **GIVEN** two current UUIDs share a prefix
- **WHEN** GetChangeNote receives the prefix, an absent UUID and then an exact UUID
- **THEN** the first two fail without writes and the exact selection returns only its own note

### Requirement: Complete immutable result

#### Scenario: Anonymous detail retains pre-privacy ID

- **GIVEN** a persisted note author has anonymous visible fields and a versioned ID
- **WHEN** show queries its note
- **THEN** the complete stored note is returned without recovering hidden originals, modifying timestamps or replaying history
