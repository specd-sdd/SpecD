# Verification: Port Archived Changes

## Requirements

### Requirement: port exposes Archived Changes operations

#### Scenario: Port methods mirror routes contract

- **WHEN** adapter implements this port group
- **THEN** each method maps to documented `/v1` route
- **AND** types match DTO specs

#### Scenario: List changes hits collection HTTP route

- **WHEN** `listChanges()` is called on remote adapter
- **THEN** `GET /v1/changes` is requested
- **AND** response parses to typed rows

#### Scenario: IPC adapter exposes same method names

- **WHEN** desktop IPC adapter handles port call
- **THEN** method name and arity match interface
- **AND** return shape matches HTTP path

### Requirement: listArchived maps archive list rows for Studio sidebar

#### Scenario: listArchived maps archive list rows for Studi… — primary path

- **WHEN** listArchived() on port-changes-collection MUST call GET /v1/archived-changes and
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: listArchived maps archive list rows for Studi… — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: port signatures are identical for HTTP and IPC adapters

#### Scenario: Remote and IPC adapters share types

- **WHEN** TypeScript compiles both adapters against port interface
- **THEN** parameters match
- **AND** return types match

#### Scenario: UI hooks do not branch on transport

- **WHEN** hook calls `getChangeStatus`
- **THEN** same method signature for HTTP and IPC
- **AND** only adapter selection differs

#### Scenario: Signature drift fails build

- **WHEN** port interface adds required field
- **THEN** adapters fail compile until updated

### Requirement: port failures surface as typed client errors

#### Scenario: HTTP 404 becomes typed client error

- **WHEN** remote call returns 404 problem+json
- **THEN** adapter throws parseable error
- **AND** hook shows message

#### Scenario: Network failure is not swallowed

- **WHEN** fetch throws network error
- **THEN** hook receives error
- **AND** loading state clears

#### Scenario: Success bypasses error mapper

- **WHEN** HTTP 200 returns DTO
- **THEN** no error thrown
- **AND** data returned to hook
