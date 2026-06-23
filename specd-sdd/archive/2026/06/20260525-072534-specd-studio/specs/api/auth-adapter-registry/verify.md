# Verification: Auth Adapter Registry

## Requirements

### Requirement: registry supports register and resolve by auth type

#### Scenario: Register then resolve returns verifier

- **WHEN** `register("disabled", factory)` then `resolve("disabled")`
- **THEN** factory receives bootstrap context
- **AND** returned object implements `ApiTokenVerifier`

#### Scenario: Unknown type throws at resolve

- **WHEN** `resolve("jwt")` runs against v1 default registry
- **THEN** error is thrown before listen
- **AND** message identifies unknown auth type

#### Scenario: Injected registry is used in tests

- **GIVEN** test passes custom registry with stub verifier
- **WHEN** `createApiServer` starts
- **THEN** stub verifier is wired to middleware
- **AND** default registry is not used

### Requirement: default registry registers only disabled in v1

#### Scenario: Default registry lists only disabled

- **WHEN** `defaultAuthAdapterRegistry()` is inspected
- **THEN** exactly one built-in type is registered
- **AND** type key is `disabled`

#### Scenario: Resolve disabled returns disabled adapter

- **WHEN** `resolve("disabled")` is called at startup
- **THEN** verifier is `adapter-auth-disabled` implementation
- **AND** server can start

#### Scenario: Resolving bearer fails in v1

- **WHEN** `resolve("bearer")` is called on default registry
- **THEN** throws before HTTP listens
- **AND** CLI `--auth bearer` is already rejected

### Requirement: createApiServer resolves verifier once at startup

#### Scenario: Verifier is fixed for process lifetime

- **GIVEN** server started with `api.auth.type: disabled`
- **WHEN** two requests hit middleware
- **THEN** same verifier instance is used
- **AND** middleware does not re-resolve per request

#### Scenario: Effective auth comes from specd.yaml merge

- **GIVEN** `specd.yaml` sets `api.auth.type`
- **AND** CLI passes `--auth disabled`
- **WHEN** `createApiServer` boots
- **THEN** merged effective type is `disabled`
- **AND** resolve uses that type once

#### Scenario: Verifier passed to middleware-auth

- **WHEN** HTTP server finishes composition
- **THEN** middleware constructor receives startup verifier
- **AND** handlers do not construct verifiers
