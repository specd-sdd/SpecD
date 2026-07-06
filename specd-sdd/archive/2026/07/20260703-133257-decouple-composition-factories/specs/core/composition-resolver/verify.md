# Verification: CompositionResolver

## Requirements

### Requirement: Resolver is scoped to one composition session

#### Scenario: Resolver is not process-global

- **WHEN** two independent composition sessions are created from different config or options inputs
- **THEN** each receives its own resolver instance
- **AND** shared dependencies are not mixed across those sessions

### Requirement: Resolver exposes normalized shared dependencies

#### Scenario: Resolver exposes shared composition primitives

- **WHEN** a standalone public factory or kernel assembly requests dependencies from the resolver
- **THEN** it receives normalized shared composition primitives rather than fs-shaped public input fragments
- **AND** those shared primitives are defined as composition infrastructure rather than kernel-owned registry concepts

### Requirement: Resolver is lazy and cacheable

#### Scenario: Single standalone factory does not force full-kernel bootstrap

- **WHEN** one `createX(config, options?)` call is assembled through the resolver
- **THEN** only the dependencies needed for that factory are resolved
- **AND** unrelated kernel dependencies are not eagerly instantiated

#### Scenario: Shared dependency is reused within one resolver session

- **WHEN** two dependency-assembly helpers request the same shared repository or service from one resolver instance
- **THEN** they receive the same cached normalized instance for that composition session

### Requirement: Resolver does not own per-use-case dependency objects

#### Scenario: Per-use-case dependency assembly lives outside the resolver

- **WHEN** a factory needs `XDeps`
- **THEN** those deps are assembled by a per-use-case helper fed from the resolver
- **AND** the resolver itself does not declare one method per use case

### Requirement: Public config-based factories delegate through the resolver

#### Scenario: Config-based public factory delegates through resolver path

- **WHEN** `createX(config, options?)` is invoked
- **THEN** the factory creates a resolver, derives `XDeps`, and delegates to canonical `createX(deps)`

### Requirement: Canonical public factories remain dependency-based

#### Scenario: Canonical factory contract stays dependency-based

- **WHEN** a caller uses the canonical public factory form
- **THEN** the call shape is `createX(deps)`
- **AND** the resolver is not required as a public third signature

### Requirement: Invalid public argument combinations use one shared error

#### Scenario: Invalid deps-plus-options combination throws shared error

- **WHEN** a public factory receives deps together with composition options
- **THEN** it throws `InvalidCompositionFactoryArgumentsError`
- **AND** the error identifies the target factory or use-case name
