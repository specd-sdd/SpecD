# Verification: Add Change Note

## Requirements

### Requirement: Validated input before effects

#### Scenario: Blank multiline input and unknown fields fail early

- **GIVEN** text is whitespace-only or an input includes an invented property
- **WHEN** execute is called directly, bypassing CLI
- **THEN** validation fails before actor resolution or repository calls

### Requirement: Atomic add and deduplication

#### Scenario: Concurrent identical requests reuse one snapshot note

- **GIVEN** two callers add the same text/actor/equivalent policy concurrently
- **WHEN** serialized repository mutations complete
- **THEN** one UUID and one note-added exist and both receive the same note
- **AND** reversed rule order does not refresh its timestamp
- **AND** another policy or actor creates a distinct note

### Requirement: Active-only autonomous state

#### Scenario: Removal permits recreation without source linkage

- **GIVEN** a note was removed while its originating issue remains pending
- **WHEN** a later genuine add request repeats its text and policy
- **THEN** a new UUID is created without reading events or source references
- **AND** approval/verification evidence is unchanged

### Requirement: Composition and result

#### Scenario: Factories expose the same Kernel use case

- **GIVEN** configured shared actor/repository dependencies and injected deterministic UUID/time helpers
- **WHEN** add is called through public factory and Kernel fixtures
- **THEN** created/reused results are consistent and persistence failure does not append a detached note
