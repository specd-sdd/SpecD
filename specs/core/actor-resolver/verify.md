# Verification: Actor Resolver Factory

## Requirements

### Requirement: Detection probes in priority order

#### Scenario: Git repository detected

- **GIVEN** the target directory is inside a git repository
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** it returns a `GitActorResolver`
- **AND** hg and svn probes are never executed

#### Scenario: Mercurial repository detected

- **GIVEN** the target directory is inside an hg repository but not a git repository
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** it returns an `HgActorResolver`
- **AND** the svn probe is never executed

#### Scenario: SVN working copy detected

- **GIVEN** the target directory is inside an svn working copy but not a git or hg repository
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** it returns an `SvnActorResolver`

#### Scenario: Git takes priority over hg

- **GIVEN** the target directory is inside both a git and hg repository
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** it returns a `GitActorResolver`

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

#### Scenario: No VCS detected

- **GIVEN** the target directory is not inside any VCS repository
- **WHEN** `createVcsActorResolver(cwd)` is called
- **THEN** it returns a `NullActorResolver`
- **AND** the call does not throw

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
