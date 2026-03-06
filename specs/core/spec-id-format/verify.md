# Verification: Spec ID Format

## Requirements

### Requirement: Canonical format

#### Scenario: Simple spec ID with default workspace

- **WHEN** parsing `default:auth/login`
- **THEN** workspace is `default` and capability path is `auth/login`

#### Scenario: Non-default workspace

- **WHEN** parsing `billing:invoices/create`
- **THEN** workspace is `billing` and capability path is `invoices/create`

#### Scenario: Multi-segment capability path

- **WHEN** parsing `default:common/conventions`
- **THEN** workspace is `default` and capability path is `common/conventions`

### Requirement: Bare path shorthand

#### Scenario: Bare path defaults to default workspace

- **WHEN** parsing `auth/login` (no colon present)
- **THEN** workspace is `default` and capability path is `auth/login`

#### Scenario: Single-segment bare path

- **WHEN** parsing `architecture` (no colon, no slash)
- **THEN** workspace is `default` and capability path is `architecture`

### Requirement: Unknown workspace rejection

#### Scenario: Colon syntax with unknown workspace

- **GIVEN** `nonexistent` is not a configured workspace
- **WHEN** parsing `nonexistent:auth/login`
- **THEN** an error is raised indicating the workspace is unknown

### Requirement: Parsing rules

#### Scenario: Colon takes precedence over slash

- **GIVEN** `billing` is a configured workspace
- **WHEN** parsing `billing:auth/login`
- **THEN** workspace is `billing` and capability path is `auth/login`
- **AND** the `/` in `auth/login` is never interpreted as a workspace separator

#### Scenario: Slash is never a workspace separator

- **GIVEN** `billing` is a configured workspace
- **WHEN** parsing `billing/auth/login` (no colon)
- **THEN** workspace is `default` and capability path is `billing/auth/login`

### Requirement: contextSpecIds format

#### Scenario: contextSpecIds use canonical format

- **GIVEN** a spec at `default:auth/login` with `dependsOn: ['auth/session']`
- **WHEN** context spec IDs are resolved
- **THEN** `contextSpecIds` contains `default:auth/session` in fully-qualified format

#### Scenario: Cross-workspace contextSpecIds

- **GIVEN** a spec at `billing:invoices/create` with `dependsOn: ['billing:invoices/shared']`
- **WHEN** context spec IDs are resolved
- **THEN** `contextSpecIds` contains `billing:invoices/shared` and traversal uses workspace `billing`

### Requirement: Normalization

#### Scenario: Bare path normalized to fully-qualified

- **WHEN** `auth/login` enters the system boundary
- **THEN** it is normalized to `default:auth/login` before reaching the domain layer
