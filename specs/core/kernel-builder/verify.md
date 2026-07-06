# Verification: Kernel Builder

## Requirements

### Requirement: Builder accumulates additive kernel registrations

#### Scenario: Registrations accumulate before build

- **GIVEN** a builder created for a resolved `SpecdConfig`
- **WHEN** storage, parser, VCS, actor, and external hook runner registrations are added before `build()`
- **THEN** the builder retains all of them as pending additive registrations
- **AND** no built kernel is mutated before `build()` is called

### Requirement: Builder supports fluent registration methods

#### Scenario: Registration methods are chainable

- **WHEN** a caller invokes the builder's registration methods in sequence
- **THEN** each registration method returns the builder itself
- **AND** the caller can continue chaining additional registrations

### Requirement: Builder builds kernels with createKernel-equivalent semantics

#### Scenario: Equivalent registrations produce equivalent kernels

- **GIVEN** the same resolved config and the same additive registrations
- **WHEN** one kernel is produced through the builder and another through `createKernel(config, options)`
- **THEN** both kernels preserve the built-in capabilities
- **AND** both expose the same merged registry contents
- **AND** both construct shared adapters once before returning an immutable kernel

### Requirement: Builder rejects conflicting registrations

#### Scenario: Duplicate registration name is rejected

- **GIVEN** a builder with a registration for a parser format named `toml`
- **WHEN** another registration is added for the same category and name
- **THEN** the builder fails with a clear conflict error
- **AND** the later registration does not overwrite the earlier one

### Requirement: Builder accepts base registration state

#### Scenario: Builder starts from base registrations and extends them

- **GIVEN** base registration state containing an external VCS provider
- **WHEN** the builder is initialised from that base state and another provider is added fluently
- **THEN** both external providers are present when `build()` is called
- **AND** built-in providers remain available

### Requirement: Builder reuses the shared composition-resolver path

#### Scenario: Builder does not define separate per-use-case composition semantics

- **WHEN** a kernel is built through `createKernelBuilder()`
- **THEN** its use-case assembly flows through the same shared composition-resolver path as `createKernel(...)`
- **AND** the builder does not introduce an alternate standalone-factory model

### Requirement: Builder shares composition-owned registry primitives

#### Scenario: Builder does not introduce a second registry source of truth

- **WHEN** additive registrations are accumulated through the builder
- **THEN** they are merged through the same composition-owned registry primitives reused by resolver and kernel assembly
- **AND** the builder does not define a builder-specific registry ownership model
