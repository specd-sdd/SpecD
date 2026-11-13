# Verification: Change Notes Commands

## Requirements

### Requirement: Command surface and delegation

#### Scenario: Four commands delegate without direct storage

- **GIVEN** Kernel spies supply valid add/remove/list/get results
- **WHEN** each changes notes subcommand is executed
- **THEN** the matching use case is called exactly once with validated command inputs and CLI performs no manifest I/O

### Requirement: Text input sources

#### Scenario: File and pipe input match inline text

- **GIVEN** a UTF-8 multiline note and removal reason are available in files and piped stdin
- **WHEN** add --input - and remove --reason-input path are run, then conflicting sources/read failure are attempted
- **THEN** successful calls receive the same preserved text as inline values
- **AND** invalid source combinations and read errors never call mutating use cases

### Requirement: Core-owned removal syntax

#### Scenario: Combined shortcuts and repeated rules share Core parser

- **GIVEN** two --note-remove rules plus a simple enter-state shortcut
- **WHEN** CLI parses them, then tries an unknown direction
- **THEN** Core produces the combined anyOf object and rejects the invalid token without mutation

### Requirement: Inspection and mutation output

#### Scenario: Status stays small while management displays author

- **GIVEN** stored note by has masked name/email and versioned ID
- **WHEN** list, show, add duplicate and remove ambiguous prefix run in text/json/toon fixtures
- **THEN** list displays ID/text/by name-email, show includes full stored detail, duplicate add reports reuse and ambiguous removal fails
- **AND** no hidden raw identity is displayed

### Requirement: Documentation and tests

#### Scenario: Examples agree with the live command contract

- **GIVEN** help and relevant CLI/guide/API pages are updated
- **WHEN** their note examples and generated guide content are checked
- **THEN** all explain explicit '-' stdin, Core-owned grammar, prefix errors, multiline content and text-only status consistently
