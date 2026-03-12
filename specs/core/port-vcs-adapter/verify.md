# Verification: VCS Adapter Port

## Requirements

### Requirement: rootDir returns the repository root

#### Scenario: rootDir outside a repository

- **GIVEN** the working directory is not inside any VCS repository
- **WHEN** `rootDir()` is called
- **THEN** the promise MUST reject with an `Error`

### Requirement: branch returns the current branch name

#### Scenario: Detached HEAD in git

- **GIVEN** a git repository in detached-HEAD state
- **WHEN** `branch()` is called
- **THEN** the promise MUST resolve to `"HEAD"`
- **AND** the method MUST NOT throw

### Requirement: ref returns the current short revision

#### Scenario: Repository with no commits

- **GIVEN** a freshly initialized repository with no commits
- **WHEN** `ref()` is called
- **THEN** the promise MUST resolve to `null`
- **AND** the method MUST NOT throw

### Requirement: show retrieves file content at a revision

#### Scenario: Non-existent revision

- **WHEN** `show()` is called with a revision that does not exist
- **THEN** the promise MUST resolve to `null`
- **AND** the method MUST NOT throw

#### Scenario: Non-existent file path

- **GIVEN** a valid revision identifier
- **WHEN** `show()` is called with a file path that does not exist at that revision
- **THEN** the promise MUST resolve to `null`

### Requirement: Null fallback implementation

#### Scenario: NullVcsAdapter rootDir rejects

- **WHEN** `rootDir()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST reject with an `Error` whose message indicates no VCS was detected

#### Scenario: NullVcsAdapter branch returns sentinel

- **WHEN** `branch()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `"none"`

#### Scenario: NullVcsAdapter isClean returns true

- **WHEN** `isClean()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `true`

#### Scenario: NullVcsAdapter ref returns null

- **WHEN** `ref()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `null`

#### Scenario: NullVcsAdapter show returns null

- **WHEN** `show()` is called on a `NullVcsAdapter` with any arguments
- **THEN** the promise MUST resolve to `null`
