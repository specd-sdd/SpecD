# Verification: GetConfig

## Requirements

### Requirement: Constructor captures construction-time config

#### Scenario: Internal snapshot is a clone

- **GIVEN** a `SpecdConfig` object passed to the `GetConfig` constructor
- **WHEN** `GetConfig` is constructed
- **THEN** the internal snapshot is not referentially equal to the constructor argument
- **AND** the internal snapshot is deep-equal to the constructor argument

### Requirement: execute returns a parameterless host snapshot

#### Scenario: Returns cloned snapshot without input

- **WHEN** `getConfig.execute()` is called on a wired `GetConfig` instance
- **THEN** it returns a `Readonly<SpecdConfig>`
- **AND** no parameters are required

#### Scenario: Stable reference across calls

- **WHEN** `execute()` is called twice on the same `GetConfig` instance
- **THEN** both return values are referentially identical

### Requirement: No disk I/O

#### Scenario: execute does not touch filesystem

- **GIVEN** a `GetConfig` instance constructed from a valid config snapshot
- **WHEN** `execute()` is called
- **THEN** no filesystem reads or writes occur

### Requirement: Host read path only

#### Scenario: Host mutation does not affect kernel wiring

- **GIVEN** a kernel constructed with `createKernel(config)`
- **AND** `const hostView = kernel.project.getConfig.execute()`
- **WHEN** a nested field on `hostView` is mutated (for example pushing into a `workspaces` array copy path)
- **THEN** a subsequent `kernel.project.listWorkspaces.execute()` result is unchanged
- **AND** a second `kernel.project.getConfig.execute()` returns a value deep-equal to the pre-mutation snapshot

#### Scenario: Returned snapshot is not the live wiring reference

- **GIVEN** a kernel constructed with `createKernel(config)`
- **WHEN** `kernel.project.getConfig.execute()` is compared to the original `config` object passed to `createKernel`
- **THEN** they are deep-equal
- **AND** they are not referentially identical

### Requirement: Standalone factory

#### Scenario: Factory works without kernel

- **WHEN** `createGetConfig(config)` is called with a valid `SpecdConfig`
- **THEN** it returns a `GetConfig` instance
- **AND** `execute()` returns a readonly snapshot deep-equal to `config`
