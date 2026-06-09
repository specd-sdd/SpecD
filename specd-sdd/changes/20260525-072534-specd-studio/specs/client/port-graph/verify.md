# Verification: Port Graph

## Requirements

### Requirement: port exposes Graph operations

#### Scenario: Port methods mirror routes contract

- **WHEN** adapter implements this port group
- **THEN** each method maps to documented `/v1` route
- **AND** types match DTO specs

#### Scenario: indexGraph returns index summary

- **WHEN** `indexGraph({ force })` is called
- **THEN** remote adapter POSTs that `force` flag to `/v1/graph/index`
- **AND** the returned data shape is the graph-index result DTO

#### Scenario: searchGraph forwards rich graph filters

- **WHEN** `searchGraph(query)` includes `kinds`, `filePattern`, or exclusion filters
- **THEN** the adapter forwards those query fields to `/v1/graph/search`
- **AND** the returned data shape preserves snippets and line ranges

#### Scenario: getImpact forwards traversal depth

- **WHEN** `getImpact(query)` includes `depth`
- **THEN** the adapter forwards that value to `/v1/graph/impact`
- **AND** the returned DTO preserves aggregate impact metrics

#### Scenario: getImpact forwards spec selectors

- **WHEN** `getImpact(query)` includes `spec`
- **THEN** the adapter forwards that selector to `/v1/graph/impact`
- **AND** the returned DTO preserves affected spec ids

#### Scenario: List changes hits collection HTTP route

- **WHEN** `listChanges()` is called on remote adapter
- **THEN** `GET /v1/changes` is requested
- **AND** response parses to typed rows

#### Scenario: IPC adapter exposes same method names

- **WHEN** desktop IPC adapter handles port call
- **THEN** method name and arity match interface
- **AND** return shape matches HTTP path

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
