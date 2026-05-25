# Verification: Ipc Preload Bridge

## Requirements

### Requirement: preload exposes only whitelisted IPC methods

#### Scenario: contextBridge exposes port surface

- **WHEN** preload script runs
- **THEN** whitelisted methods are on `window`
- **AND** nodeIntegration is off

#### Scenario: Unknown channel is rejected

- **WHEN** renderer calls undeclared IPC channel
- **THEN** call fails safely
- **AND** no arbitrary main access

#### Scenario: Types align with registry

- **WHEN** TypeScript builds renderer
- **THEN** bridged API matches handler registry
- **AND** adapters stay type-safe

### Requirement: bridge API is typed for TypeScript consumers

#### Scenario: Renderer imports typed window.specd API

- **WHEN** UI package compiles against preload types
- **THEN** invoke methods are typed
- **AND** unknown channel is compile error

#### Scenario: Typed methods mirror SpecdDataPort names

- **WHEN** preload exposes port operations
- **THEN** method names match port interface
- **AND** arity matches IPC contract

#### Scenario: Runtime channel mismatch fails fast

- **WHEN** preload calls unregistered channel
- **THEN** promise rejects
- **AND** error names missing handler
