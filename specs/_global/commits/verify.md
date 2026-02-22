# Verification: Commit Conventions

## Requirements

### Requirement: Conventional commit format

#### Scenario: Missing scope

- **WHEN** a commit message reads `fix: handle missing file`
- **THEN** it must be rejected — scope is required

#### Scenario: Valid commit

- **WHEN** a commit message reads `feat(core): add ChangeState value object`
- **THEN** it is accepted

### Requirement: Allowed types

#### Scenario: Unknown type

- **WHEN** a commit message reads `update(core): change delta merger`
- **THEN** it must be rejected — `update` is not a valid type

### Requirement: Scope is the package name

#### Scenario: Full package name used as scope

- **WHEN** a commit message reads `feat(@specd/core): add entity`
- **THEN** it must be rejected — scope must be the short name `core`, not `@specd/core`

### Requirement: Description in imperative mood

#### Scenario: Past tense description

- **WHEN** a commit message reads `feat(core): added delta merger`
- **THEN** it must be rejected — description must use imperative mood

#### Scenario: Trailing period

- **WHEN** a commit message reads `fix(cli): handle missing file.`
- **THEN** it must be rejected — description must not end with a period

### Requirement: Commit granularity

#### Scenario: Unrelated changes in one commit

- **WHEN** a commit touches a spec file for documentation reasons and a source file for a bug fix
- **THEN** they must be split into two separate commits — one `docs`, one `fix`

#### Scenario: Multiple files, single concern

- **WHEN** a refactor touches five files but all for the same reason
- **THEN** a single commit is correct — the grouping criterion is the reason, not the file count

### Requirement: Breaking changes

#### Scenario: Breaking change without marker

- **WHEN** a commit introduces an incompatible API change but has no `!` marker
- **THEN** it must be flagged as missing the breaking change marker

#### Scenario: Breaking change without footer

- **WHEN** a commit uses `!` but has no `BREAKING CHANGE:` footer
- **THEN** it must be rejected — the footer is required to explain the breaking change

### Requirement: Automated enforcement

#### Scenario: commitlint rejects unknown scope

- **WHEN** a commit message reads `feat(sdk): add client`
- **THEN** the `commit-msg` hook must reject it — `sdk` is not a known scope

#### Scenario: commitlint rejects AI co-author

- **WHEN** a commit body includes `Co-Authored-By: Claude <noreply@anthropic.com>`
- **THEN** the `commit-msg` hook must reject it

### Requirement: Commit body format

#### Scenario: Body not needed

- **WHEN** a commit reads `fix(cli): correct typo in error message`
- **THEN** no body is needed — the change is self-explanatory from the subject and diff

#### Scenario: ATX header in body

- **WHEN** a commit body uses `### Context` as a section header
- **THEN** it must be changed to setext style — ATX headers conflict with git comment markers
