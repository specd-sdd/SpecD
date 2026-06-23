# Verification: ReadLog

## Requirements

### Requirement: ReadLog reads only the injected ring buffer

#### Scenario: Newest entries returned first

- **GIVEN** a ring with two pushed entries
- **WHEN** `ReadLog.execute({ limit: 2 })` runs
- **THEN** the first entry is the most recently pushed message

#### Scenario: Limit caps result size

- **GIVEN** a ring with more than `limit` entries
- **WHEN** `execute({ limit: 10 })` runs
- **THEN** at most 10 entries are returned

### Requirement: no filesystem log reads

#### Scenario: ReadLog has no file path parameter

- **WHEN** `ReadLogInput` is inspected
- **THEN** there is no `files` or `path` field
- **AND** implementation does not call `fs.readFile` for log readback

### Requirement: structured or pretty output

#### Scenario: Prettier mode returns lines only

- **WHEN** `execute({ prettier: true })` runs
- **THEN** `lines` is populated
- **AND** `entries` is omitted

#### Scenario: Prettier lines use LogFormatter

- **GIVEN** a formatter double that prefixes each line with `fmt:`
- **WHEN** `execute({ prettier: true })` runs on one entry with message `x`
- **THEN** `lines[0]` starts with `fmt:`

### Requirement: LogFormatter injection

#### Scenario: LogFormatter injection — primary path

- **WHEN** ReadLog MUST accept LogReadBuffer and LogFormatter at construction.
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: LogFormatter injection — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: kernel exposes logs.read when ring is wired

#### Scenario: API server kernel has logs.read

- **GIVEN** `createApiServer` bootstrap
- **WHEN** kernel is created with `logRing`
- **THEN** `kernel.logs.read` is defined
- **AND** POST log lines appear in subsequent `read` results
