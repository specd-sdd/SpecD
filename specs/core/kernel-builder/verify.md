# Verification: Kernel Builder

## Requirements

### Requirement: Builder accumulates additive kernel registrations

#### Scenario: Registrations accumulate before build

- **GIVEN** a builder created for a resolved `SpecdConfig`
- **WHEN** storage, parser, VCS, actor, and external hook runner registrations are added before `build()`
- **THEN** the builder retains all of them as pending additive registrations
- **AND** no built kernel is mutated before `build()` is called

#### Scenario: Repository overrides in builder

- **GIVEN** a mock `ChangeRepository` set on the builder
- **WHEN** `build()` is called
- **THEN** the returned kernel reuses that mock instance

### Requirement: Builder supports fluent registration methods

#### Scenario: Registration methods are chainable

- **WHEN** a caller invokes the builder's registration methods in sequence
- **THEN** each registration method returns the builder itself
- **AND** the caller can continue chaining additional registrations

#### Scenario: registerDisposer is chainable

- **WHEN** a caller invokes `registerDisposer(name, dispose)`
- **THEN** it returns the builder itself

### Requirement: Builder registers named disposers

#### Scenario: Disposers reach the kernel options in call order

- **GIVEN** a builder with `registerDisposer('a', fa)` then `registerDisposer('b', fb)`
- **WHEN** `build()` is called
- **THEN** the kernel options carry the disposers in the order `a`, `b`

#### Scenario: Empty name is rejected

- **WHEN** a caller invokes `registerDisposer('', dispose)`
- **THEN** the call fails with an `InvalidDisposerError`

#### Scenario: Non-callable dispose is rejected

- **WHEN** a caller invokes `registerDisposer('plugins', undefined)`
- **THEN** the call fails with an `InvalidDisposerError`

#### Scenario: Duplicate name is rejected

- **GIVEN** a builder where `registerDisposer('plugins', fa)` was already called
- **WHEN** a caller invokes `registerDisposer('plugins', fb)`
- **THEN** the call fails with a `RegistryConflictError` for the category `disposers`
- **AND** the first registration is not overwritten

### Requirement: Builder hands disposers to the kernel

#### Scenario: The kernel runs the disposers after a successful build

- **GIVEN** a builder with a registered disposer
- **WHEN** `build()` succeeds and `kernel.dispose()` is awaited
- **THEN** the disposer ran exactly once
- **AND** the builder did not run it itself

#### Scenario: A failed build releases the disposers

- **GIVEN** a builder with registered disposers and a construction that fails
- **WHEN** `build()` rejects
- **THEN** the disposers have run in reverse order before the rejection propagates

#### Scenario: Builder and options produce the same disposal

- **GIVEN** a kernel built through the builder and a kernel built through `createKernel` with equivalent options
- **WHEN** both are disposed
- **THEN** their disposers run in the same order

### Requirement: Builder builds kernels with createKernel-equivalent semantics

#### Scenario: Equivalent registrations produce equivalent kernels

- **GIVEN** the same resolved config and the same additive registrations
- **WHEN** one kernel is produced through the builder and another through `createKernel(config, options)`
- **THEN** both kernels preserve the built-in capabilities
- **AND** both expose the same merged registry contents
- **AND** both construct shared adapters once before returning an immutable kernel

#### Scenario: Built kernel exposes the complete kernel.specs materialization and persisted-state surface

- **GIVEN** a kernel built through the builder with any combination of registry and repository overrides
- **WHEN** `kernel.specs` is inspected
- **THEN** it includes `generateMetadata`, `materializeMetadata`, `getMetadata`, `regenerateMetadata`, `initializePersistedState`, persisted schema inspection/reassignment, and persisted dependency/implementation/optimization queries and mutations
- **AND** the builder does not maintain a second, independently-updated use-case list that could drift from `createKernel()`

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
