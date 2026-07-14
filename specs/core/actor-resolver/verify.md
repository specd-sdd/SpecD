# Verification: Actor Resolver Factory

## Requirements

### Requirement: VCS adapter composition

#### Scenario: Resolver constructed with VCS adapter

- **GIVEN** a valid `VcsAdapter` instance
- **WHEN** `createVcsActorResolver(vcsAdapter)` is called
- **THEN** it returns an `ActorResolver` wired to that adapter

### Requirement: External providers run before built-in probes

#### Scenario: Matching external provider preempts built-in probes

- **GIVEN** an external actor provider is registered ahead of the built-ins
- **AND** it recognizes the target directory
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** that external provider returns the resolver
- **AND** the built-in git, hg, and svn-backed probes are not executed

#### Scenario: Unmatched external providers fall through to built-ins

- **GIVEN** one or more external actor providers are registered
- **AND** none recognize the target directory
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** the built-in git, hg, and svn-backed probes still run in their normal order
- **AND** `NullActorResolver` is still returned when no provider matches

### Requirement: Fallback to NullActorResolver

#### Scenario: NullVcsAdapter fallback

- **GIVEN** a `NullVcsAdapter` instance
- **WHEN** `createVcsActorResolver(nullAdapter)` is called
- **THEN** it returns a `NullActorResolver`

### Requirement: Optional cwd parameter

#### Scenario: Explicit cwd is used for probing

- **WHEN** `createVcsActorResolver("/some/path")` is called
- **THEN** VCS probes run against `/some/path`, not `process.cwd()`

#### Scenario: Omitted cwd defaults to process.cwd()

- **WHEN** `createVcsActorResolver()` is called without arguments
- **THEN** VCS probes run against `process.cwd()`

### Requirement: Returns the ActorResolver port interface

#### Scenario: Return type satisfies ActorResolver

- **WHEN** `createVcsActorResolver(cwd)` resolves
- **THEN** the returned object satisfies the `ActorResolver` interface

### Requirement: Privacy wrapping

#### Scenario: Privacy wrapping applied at kernel level

- **GIVEN** `privacy.mode` is `mask`
- **WHEN** the kernel is constructed with a privacy config
- **THEN** the actor resolver exposed by `kernel-internals` is a `PrivacyActorResolver` wrapping the detected base resolver
