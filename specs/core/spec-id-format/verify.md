# Verification: Spec ID Format

## Requirements

### Requirement: Canonical format

#### Scenario: Simple spec ID with default workspace

- **WHEN** parsing `default:auth/login`
- **THEN** workspace is `default` and capability path is `auth/login`

#### Scenario: Non-default workspace

- **WHEN** parsing `billing:invoices/create`
- **THEN** workspace is `billing` and capability path is `invoices/create`

#### Scenario: Multi-segment capability path

- **WHEN** parsing `default:common/conventions`
- **THEN** workspace is `default` and capability path is `common/conventions`

#### Scenario: Nested capability path is valid

- **WHEN** `parseSpecId('billing:section/other-section/id')` is called
- **THEN** it returns workspace `billing`, capability path `section/other-section/id`, and spec ID `billing:section/other-section/id`

### Requirement: Bare path shorthand

#### Scenario: Bare path defaults to default workspace

- **WHEN** parsing `auth/login` (no colon present)
- **THEN** workspace is `default` and capability path is `auth/login`

#### Scenario: Single-segment bare path

- **WHEN** parsing `architecture` (no colon, no slash)
- **THEN** workspace is `default` and capability path is `architecture`

#### Scenario: Bare path at an input boundary resolves to default

- **WHEN** a use case receives the spec ID `auth/login` from a user
- **THEN** the core normalizes it to `default:auth/login`
- **AND** the delivery adapter did not qualify it first

#### Scenario: Bare dependsOn entry resolves to the owning workspace

- **GIVEN** a spec in workspace `billing` declares `dependsOn: ['invoices/create']`
- **WHEN** dependency traversal parses the entry with `defaultWorkspace: 'billing'`
- **THEN** it resolves to `billing:invoices/create`, not `default:invoices/create`

### Requirement: Unknown workspace rejection

#### Scenario: Colon syntax with unknown workspace

- **GIVEN** `nonexistent` is not a configured workspace
- **WHEN** parsing `nonexistent:auth/login`
- **THEN** an error is raised indicating the workspace is unknown

#### Scenario: Unknown workspace with a workspace set raises the typed error

- **GIVEN** the configured workspaces are `default` and `core`
- **WHEN** `parseSpecId('nope:auth/login', { workspaces })` is called
- **THEN** it throws `WorkspaceNotFoundError` with code `WORKSPACE_NOT_FOUND`
- **AND** the message quotes `nope:auth/login` and lists `default` and `core`

#### Scenario: One error class from either import path

- **WHEN** `WorkspaceNotFoundError` is imported from the domain module and from the application module
- **THEN** both identifiers are the same class
- **AND** an error thrown by `parseSpecId` satisfies `instanceof` for both

#### Scenario: Syntax-only validation without a workspace set

- **WHEN** `parseSpecId('nope:auth/login')` is called without `workspaces`
- **THEN** it returns workspace `nope` without checking that it exists

#### Scenario: Workspace set accepts workspace objects

- **WHEN** `workspaces` is an array of objects each with a `name` property
- **THEN** the validator accepts it and checks the names

#### Scenario: Bare path with a project that lacks the default workspace

- **GIVEN** the workspace set does not contain `default`
- **WHEN** `parseSpecId('auth/login', { workspaces })` is called
- **THEN** it throws `WorkspaceNotFoundError` naming `default`

#### Scenario: Unknown workspace in a context pattern is a warning

- **WHEN** a context pattern `nope:*` is matched
- **THEN** an `unknown-workspace` warning is produced and no specs match
- **AND** no error is thrown

### Requirement: Parsing rules

#### Scenario: Colon takes precedence over slash

- **GIVEN** `billing` is a configured workspace
- **WHEN** parsing `billing:auth/login`
- **THEN** workspace is `billing` and capability path is `auth/login`
- **AND** the `/` in `auth/login` is never interpreted as a workspace separator

#### Scenario: Slash is never a workspace separator

- **GIVEN** `billing` is a configured workspace
- **WHEN** parsing `billing/auth/login` (no colon)
- **THEN** workspace is `default` and capability path is `billing/auth/login`

#### Scenario: Result is always fully qualified

- **WHEN** `parseSpecId('auth/login')` is called
- **THEN** the result contains `specId: 'default:auth/login'`

#### Scenario: Only the first colon separates the workspace

- **WHEN** `parseSpecId('core:a:b')` is called
- **THEN** it throws `InvalidSpecIdError` because the capability path contains `:`

### Requirement: Capability segments reject Windows device names

#### Scenario: A device-name segment is rejected

- **GIVEN** a spec ID whose capability path contains the segment `com1`
- **WHEN** the ID is validated
- **THEN** it is rejected

#### Scenario: con-foo remains a legal segment

- **GIVEN** a spec ID whose capability path contains the segment `con-foo`
- **WHEN** the ID is validated
- **THEN** that segment is accepted

### Requirement: specDependsOn format

#### Scenario: specDependsOn uses canonical format

- **GIVEN** a spec at `default:auth/login` with `dependsOn: ['auth/session']`
- **WHEN** dependency spec IDs are resolved
- **THEN** `specDependsOn` values contain `default:auth/session` in fully-qualified format

#### Scenario: Cross-workspace specDependsOn

- **GIVEN** a spec at `billing:invoices/create` with `dependsOn: ['billing:invoices/shared']`
- **WHEN** dependency spec IDs are resolved
- **THEN** `specDependsOn` contains `billing:invoices/shared` and traversal uses workspace `billing`

### Requirement: Normalization

#### Scenario: Bare path normalized to fully-qualified

- **WHEN** `auth/login` enters the system boundary
- **THEN** it is normalized to `default:auth/login` before reaching the domain layer

#### Scenario: Adapters do not normalize

- **WHEN** the CLI, MCP, or SDK forwards a spec ID to a use case
- **THEN** it passes the raw string unchanged
- **AND** the use case validates and normalizes it

#### Scenario: Display paths do not qualify IDs

- **GIVEN** an adapter command that only prints a spec ID (for example the listing branch of `specd changes deps`)
- **WHEN** the command source is inspected
- **THEN** it prints the ID returned by a use case or the raw argument
- **AND** it does not call `parseSpecId` or any qualifying helper

### Requirement: Workspace name rule

#### Scenario: Two-character workspace is accepted

- **WHEN** `isValidWorkspaceName('ab')` is called
- **THEN** it returns `true`

#### Scenario: One-character workspace is rejected

- **WHEN** `parseSpecId('a:foo/bar')` is called
- **THEN** it throws `InvalidSpecIdError` naming the workspace rule

#### Scenario: Uppercase, leading digit, and underscore are rejected

- **WHEN** `isValidWorkspaceName` is called with `Core`, `1core`, and `my_ws`
- **THEN** it returns `false` for each

#### Scenario: Hyphen inside is accepted

- **WHEN** `isValidWorkspaceName('plugin-agent-claude')` is called
- **THEN** it returns `true`

#### Scenario: Windows device name as workspace is rejected

- **WHEN** `isValidWorkspaceName('nul')` is called
- **THEN** it returns `false`
- **AND** `isValidWorkspaceName('con-foo')` returns `true`

#### Scenario: One shared implementation

- **WHEN** the workspace rule is needed by `parseSpecId`, `parseSpecPattern`, the schema reference parser, configuration pattern validation, `ConfigLoader`, or `specd project init`
- **THEN** each calls `isValidWorkspaceName` and none keeps its own expression

#### Scenario: Project init rejects what the loader rejects

- **WHEN** `specd project init --workspace nul` or `--workspace a` is run
- **THEN** init fails with a validation error before writing `specd.yaml`
- **AND** every workspace id init accepts is also accepted by `ConfigLoader`

### Requirement: Capability path segment rule

#### Scenario: Valid segments

- **WHEN** `parseSpecId('team/shared_core/api-v2')` is called
- **THEN** it succeeds

#### Scenario: Uppercase segment rejected

- **WHEN** `parseSpecId('auth/Login')` is called
- **THEN** it throws `InvalidSpecIdError` naming the segment `Login`

#### Scenario: Space, comma, dot, quote, and backslash rejected

- **WHEN** `parseSpecId` is called with `auth/log in`, `auth/a,b`, `auth/v1.2`, `auth/"x"`, and `auth\x`
- **THEN** each throws `InvalidSpecIdError`

#### Scenario: Segment may start with a digit or underscore but not a hyphen

- **WHEN** `parseSpecId` is called with `2fa/setup`, `_global/x`, and `-bad/x`
- **THEN** the first two succeed and the third throws `InvalidSpecIdError`

#### Scenario: Device name segment rejected at any depth

- **WHEN** `parseSpecId('ws:section/nul/id')` is called
- **THEN** it throws `InvalidSpecIdError`

#### Scenario: Prefix segments use the same rule

- **WHEN** a workspace declares `prefix: Team/Shared`
- **THEN** configuration loading fails because `Team` violates the segment rule

#### Scenario: SpecPath applies the same rule

- **WHEN** `SpecPath.parse('auth/Login')` is called
- **THEN** it throws `InvalidSpecPathError`

### Requirement: Syntax validation

#### Scenario: Empty and blank IDs are rejected

- **WHEN** `parseSpecId` is called with `''` and `'   '`
- **THEN** each throws `InvalidSpecIdError` with code `INVALID_SPEC_ID`

#### Scenario: Missing workspace or path around the colon

- **WHEN** `parseSpecId` is called with `':'`, `'ws:'`, and `':path'`
- **THEN** each throws `InvalidSpecIdError`

#### Scenario: Empty and dot segments rejected

- **WHEN** `parseSpecId` is called with `a//b`, `/a`, `a/`, `a/./b`, and `a/../b`
- **THEN** each throws `InvalidSpecIdError`

#### Scenario: Backslash is not a separator

- **WHEN** `parseSpecId` is called with `auth\login`, `ws:auth\login`, and `ws:section\other\id`
- **THEN** each throws `InvalidSpecIdError`
- **AND** the message states that `/` is the only separator
- **AND** the input is not converted to a forward-slash form

#### Scenario: Windows-style path given as a spec ID

- **GIVEN** a Windows host
- **WHEN** a user passes `core:specs\auth\login` to any command that takes a spec ID
- **THEN** the use case throws `InvalidSpecIdError` with the same hint, identically on every operating system

#### Scenario: Error quotes the full value

- **WHEN** `parseSpecId('auth/a,b')` fails
- **THEN** the message contains `auth/a,b` and states the violated rule

#### Scenario: Remove operations do not validate syntax

- **GIVEN** an invalid ID is already stored in a dependency list
- **WHEN** the remove operation names that ID
- **THEN** the ID is removed without a syntax error

### Requirement: Single validator

#### Scenario: Domain service has no application dependency

- **WHEN** the module of `parseSpecId` is inspected
- **THEN** it imports no application type and performs no I/O

#### Scenario: Name iterables are accepted

- **WHEN** `workspaces` is a string array, a `Set`, and `Map.keys()`
- **THEN** the validator accepts each form

#### Scenario: Default workspace override

- **WHEN** `parseSpecId('auth/login', { defaultWorkspace: 'billing' })` is called
- **THEN** the result spec ID is `billing:auth/login`

#### Scenario: Invalid default workspace override is rejected without membership data

- **WHEN** `parseSpecId('auth/login', { defaultWorkspace: 'nul' })` or `parseSpecId('auth/login', { defaultWorkspace: 'a' })` is called without `workspaces`
- **THEN** each throws `InvalidSpecIdError` for the resolved workspace name

#### Scenario: Invalid default workspace override is rejected before membership lookup

- **GIVEN** configured workspaces include `default` and `billing`
- **WHEN** a bare ID is parsed with `defaultWorkspace: 'Bad Id'` or an empty override and that workspace set
- **THEN** `InvalidSpecIdError` is thrown rather than `WorkspaceNotFoundError`

### Requirement: Use cases validate and normalize

#### Scenario: Use case rejects an invalid ID raised through MCP or SDK

- **WHEN** an SDK caller invokes a use case with `specId: ''`
- **THEN** the use case throws `InvalidSpecIdError` without a CLI in the path

#### Scenario: Use case stores the qualified form

- **WHEN** a use case receives the bare ID `auth/login` and stores it
- **THEN** the stored value is `default:auth/login`

#### Scenario: CLI holds no spec ID helper

- **WHEN** the CLI source is inspected
- **THEN** no CLI helper validates, qualifies, or normalizes spec IDs

### Requirement: Patterns and schema references

#### Scenario: Wildcard patterns parse

- **WHEN** `parseSpecPattern` is called with `*`, `core:*`, `_global/*`, `core:team/*`, and `core:auth/login`
- **THEN** each parses with the expected workspace and kind

#### Scenario: Misplaced wildcard rejected

- **WHEN** `parseSpecPattern` is called with `a*b`, `a/*/b`, and `*/x`
- **THEN** each is rejected

#### Scenario: Patterns validated at load are interpreted identically

- **GIVEN** a pattern accepted when configuration loads
- **WHEN** specs are matched with that pattern
- **THEN** the same parser interprets it

#### Scenario: Schema references split into workspace and name

- **WHEN** the schema registry resolves `#billing:my-schema` and `#my-schema`
- **THEN** the workspaces are `billing` and `default`, the names are validated by the schema repository, and no spec ID rule applies to the name

#### Scenario: No lenient generic splitter

- **WHEN** the core is inspected
- **THEN** there is no exported function that splits a spec ID without validating it

#### Scenario: Per-spec workspaces are derived through the validator

- **GIVEN** the qualified IDs `core:auth/login` and `default:_global/x`
- **WHEN** their workspaces are derived for an archive index entry
- **THEN** the result is the plural set `core` and `default`, obtained through `parseSpecId`
- **AND** no singular workspace is assigned to the change
- **AND** an invalid ID in the input raises `InvalidSpecIdError` instead of yielding a partial workspace

### Requirement: Persisted IDs are fully qualified

#### Scenario: Bare dependency in a lock is rejected on read

- **GIVEN** `spec-lock.json` contains `"dependsOn": ["auth/login"]`
- **WHEN** the lock is read
- **THEN** it fails with `InvalidSpecLockError` naming the field path `dependsOn.0`

#### Scenario: Manifest rejects an invalid ID

- **GIVEN** a change manifest whose `specIds` contains `""`
- **WHEN** the manifest is loaded
- **THEN** loading fails with a typed error quoting the value

#### Scenario: Metadata is written strictly but read leniently

- **WHEN** metadata with a bare `dependsOn` entry is persisted
- **THEN** persistence is rejected
- **AND** reading an existing metadata file with such an entry does not fail
