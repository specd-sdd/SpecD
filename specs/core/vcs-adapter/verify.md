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
