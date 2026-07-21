# Verification: VCS Adapter Port

## Requirements

### Requirement: Abstract class base

#### Scenario: VcsAdapter is an abstract class

- **WHEN** the `VcsAdapter` class is examined
- **THEN** it is declared as an abstract class
- **AND** it has a protected constructor that receives `cwd`

### Requirement: Public port export

#### Scenario: VcsAdapter is available from the Core public API

- **WHEN** a consumer imports `VcsAdapter` from `@specd/core`
- **THEN** the import SHALL resolve to the abstract VCS adapter class as a runtime value

### Requirement: rootDir returns the repository root

#### Scenario: rootDir outside a repository

- **GIVEN** the working directory is not inside any VCS repository
- **WHEN** `rootDir()` is called
- **THEN** the promise MUST reject with an `Error`

### Requirement: isClean reports working-tree cleanliness

#### Scenario: Clean working tree

- **GIVEN** a VCS repository with no uncommitted changes
- **WHEN** `isClean()` is called
- **THEN** the promise MUST resolve to `true`

#### Scenario: Dirty working tree

- **GIVEN** a VCS repository with uncommitted changes
- **WHEN** `isClean()` is called
- **THEN** the promise MUST resolve to `false`

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

### Requirement: refAt resolves the revision active at a timestamp

#### Scenario: refAt returns a historical revision when one exists

- **GIVEN** a VCS repository with commits before and after an ISO timestamp
- **WHEN** `refAt(at)` is called with that timestamp
- **THEN** it resolves to the most recent revision at or before that time

#### Scenario: refAt returns null when no historical revision exists

- **GIVEN** a repository with no commit at or before the supplied timestamp
- **WHEN** `refAt(at)` is called
- **THEN** the promise MUST resolve to `null`

### Requirement: show retrieves file content at a revision

#### Scenario: Non-existent revision

- **WHEN** `show()` is called with a revision that does not exist
- **THEN** the promise MUST resolve to `null`
- **AND** the method MUST NOT throw

#### Scenario: Non-existent file path

- **GIVEN** a valid revision identifier
- **WHEN** `show()` is called with a file path that does not exist at that revision
- **THEN** the promise MUST resolve to `null`

### Requirement: modifiedFiles lists changed repository files

#### Scenario: modifiedFiles returns repository-relative paths

- **GIVEN** a VCS repository with changes relative to a baseline reference
- **WHEN** `modifiedFiles(baseRef)` is called
- **THEN** it returns repository-relative changed file paths
- **AND** missing matches are represented as an empty array

### Requirement: Null fallback implementation

#### Scenario: NullVcsAdapter rootDir throws

- **WHEN** `rootDir()` is called on a `NullVcsAdapter`
- **THEN** it MUST throw an `Error` whose message indicates no VCS was detected

#### Scenario: NullVcsAdapter branch returns sentinel

- **WHEN** `branch()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `"none"`

#### Scenario: NullVcsAdapter isClean returns true

- **WHEN** `isClean()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `true`

#### Scenario: NullVcsAdapter ref returns null

- **WHEN** `ref()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `null`

#### Scenario: NullVcsAdapter refAt returns null

- **WHEN** `refAt(at)` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `null`

#### Scenario: NullVcsAdapter show returns null

- **WHEN** `show()` is called on a `NullVcsAdapter` with any arguments
- **THEN** the promise MUST resolve to `null`

#### Scenario: NullVcsAdapter modifiedFiles returns empty array

- **WHEN** `modifiedFiles(baseRef)` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to an empty array

#### Scenario: NullVcsAdapter identity returns null identity

- **WHEN** `identity()` is called on a `NullVcsAdapter`
- **THEN** the promise MUST resolve to `{ name: "unknown", email: "", provider: "null" }`

### Requirement: identity resolves version control identity

#### Scenario: Git user identity resolved

- **GIVEN** git configured with name "John Doe" and email "john@example.com"
- **WHEN** `identity()` is called on a `GitVcsAdapter`
- **THEN** the promise MUST resolve to `{ name: "John Doe", email: "john@example.com", provider: "git" }`

### Requirement: static detect detects active VCS

#### Scenario: Git detection inside git repo

- **WHEN** `VcsAdapter.detect(cwd)` is called on the abstract base class
- **THEN** it resolves to `null`
