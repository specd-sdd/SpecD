# Verification: SDK With Open Graph Provider

## Requirements

### Requirement: withOpenGraphProvider signature

#### Scenario: Provider opened and closed around callback

- **WHEN** `withOpenGraphProvider(ctx, fn)` runs successfully
- **THEN** `provider.open()` is called before `fn`
- **AND** `provider.close()` is called after `fn` completes

### Requirement: Error propagation

#### Scenario: Original error preserved when close fails during cleanup

- **GIVEN** fn throws error E
- **AND** provider.close() also throws during cleanup
- **WHEN** withOpenGraphProvider completes
- **THEN** error E propagates to the caller

#### Scenario: Close attempted after fn throws

- **GIVEN** fn throws
- **WHEN** withOpenGraphProvider runs
- **THEN** provider.close() is still invoked

#### Scenario: Open failure cleans up without beforeOpen

- **GIVEN** ctx.createGraphProvider() returns a provider
- **AND** no beforeOpen hook is supplied
- **AND** provider.open() rejects with error E
- **WHEN** withOpenGraphProvider completes
- **THEN** provider.close() is attempted
- **AND** error E propagates to the caller

#### Scenario: afterClose runs after open failure cleanup

- **GIVEN** provider.open() rejects after provider creation
- **AND** afterClose is supplied
- **WHEN** withOpenGraphProvider completes
- **THEN** afterClose(provider) runs after the close attempt

### Requirement: No process exit side effects

#### Scenario: SDK helper does not exit process

- **WHEN** `withOpenGraphProvider` completes normally
- **THEN** `process.exit` is not called by the SDK implementation

### Requirement: Optional beforeOpen hook

#### Scenario: beforeOpen runs before open

- **WHEN** `withOpenGraphProvider` is called with `beforeOpen`
- **THEN** `beforeOpen(provider)` runs after provider creation and before `open()`
