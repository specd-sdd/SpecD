# Verification: VCS Adapter Factory

## Requirements

### Requirement: Detection probes in priority order

#### Scenario: Git repository detected

- **GIVEN** the target directory is inside a git repository
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** it returns a `GitVcsAdapter`
- **AND** hg and svn probes are never executed

#### Scenario: Mercurial repository detected

- **GIVEN** the target directory is inside an hg repository but not a git repository
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** it returns an `HgVcsAdapter`
- **AND** the svn probe is never executed

#### Scenario: SVN working copy detected

- **GIVEN** the target directory is inside an svn working copy but not a git or hg repository
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** it returns an `SvnVcsAdapter`

#### Scenario: Git takes priority over hg

- **GIVEN** the target directory is inside both a git and hg repository
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** it returns a `GitVcsAdapter`

### Requirement: External providers run before built-in probes

#### Scenario: Matching external provider preempts built-in probes

- **GIVEN** an external VCS provider is registered ahead of the built-ins
- **AND** it recognizes the target directory
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** that external provider returns the adapter
- **AND** the built-in git, hg, and svn probes are not executed

#### Scenario: Unmatched external providers fall through to built-ins

- **GIVEN** one or more external VCS providers are registered
- **AND** none recognize the target directory
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** the built-in git, hg, and svn probes still run in their normal order
- **AND** `NullVcsAdapter` is still returned when no provider matches

### Requirement: Fallback to NullVcsAdapter

#### Scenario: No VCS detected

- **GIVEN** the target directory is not inside any VCS repository
- **WHEN** `createVcsAdapter(cwd)` is called
- **THEN** it returns a `NullVcsAdapter`
- **AND** the call does not throw

### Requirement: Optional cwd parameter

#### Scenario: Explicit cwd is used for probing

- **WHEN** `createVcsAdapter("/some/path")` is called
- **THEN** VCS probes run against `/some/path`, not `process.cwd()`

#### Scenario: Omitted cwd defaults to process.cwd()

- **WHEN** `createVcsAdapter()` is called without arguments
- **THEN** VCS probes run against `process.cwd()`

### Requirement: Returns the VcsAdapter port interface

#### Scenario: Return type satisfies VcsAdapter

- **WHEN** `createVcsAdapter(cwd)` resolves
- **THEN** the returned object satisfies the `VcsAdapter` interface
