# Verification: Workspace

## Requirements

### Requirement: Workspace identity

#### Scenario: Valid workspace names accepted

- **WHEN** a workspace is declared with name `billing`, `my-service`, or `default`
- **THEN** configuration loads successfully

#### Scenario: Invalid workspace name rejected

- **WHEN** a workspace is declared with name `Billing`, `my_service`, or `123abc`
- **THEN** a `ConfigValidationError` is thrown at startup

#### Scenario: Missing default workspace

- **WHEN** `specd.yaml` declares workspaces but none is named `default`
- **THEN** a `ConfigValidationError` is thrown at startup

#### Scenario: Duplicate workspace name

- **WHEN** `specd.yaml` declares two workspaces with the same name
- **THEN** a `ConfigValidationError` is thrown at startup

#### Scenario: A device-name workspace is rejected

- **GIVEN** the workspace name is `nul`
- **WHEN** the name is validated
- **THEN** it is rejected on every operating system

#### Scenario: con-foo remains a legal workspace name

- **GIVEN** the workspace name is `con-foo`
- **WHEN** the name is validated
- **THEN** it is accepted
- **AND** `default` and `root` stay reserved

#### Scenario: One-character workspace name rejected

- **GIVEN** `specd.yaml` declares a workspace named `a`
- **WHEN** the configuration is loaded
- **THEN** loading fails with `ConfigValidationError` because workspace names need two or more characters

#### Scenario: Two-character workspace name accepted

- **GIVEN** `specd.yaml` declares a workspace named `ab` with a valid `codeRoot`
- **WHEN** the configuration is loaded
- **THEN** the workspace is accepted

#### Scenario: Names produced by project init are loadable

- **WHEN** `specd project init --workspace <id>` accepts an id
- **THEN** `ConfigLoader` accepts the same id
- **AND** ids such as `a` and `nul` are rejected by init as well as by the loader

#### Scenario: Existing project workspaces remain valid

- **WHEN** the workspaces `core`, `cli`, `sdk`, and `plugin-agent-claude` are validated
- **THEN** each is accepted

### Requirement: Workspace properties

#### Scenario: Default workspace inherits defaults

- **GIVEN** a `default` workspace with only `specs` declared
- **WHEN** configuration is loaded
- **THEN** `codeRoot` resolves to the project root
- **AND** `ownership` is `owned`
- **AND** `schemas` resolves to `specd/schemas`

#### Scenario: Non-default workspace requires codeRoot

- **WHEN** a non-`default` workspace omits `codeRoot`
- **THEN** a `ConfigValidationError` is thrown at startup

#### Scenario: Non-default workspace defaults

- **GIVEN** a non-`default` workspace with `specs` and `codeRoot` declared
- **WHEN** configuration is loaded
- **THEN** `ownership` defaults to `readOnly`
- **AND** `schemas` is absent (no local schemas)

### Requirement: External workspace inference

#### Scenario: Workspace with path inside repo root

- **GIVEN** project root is `/project` and workspace specs path is `./specs`
- **WHEN** configuration is loaded
- **THEN** `isExternal` is `false`

#### Scenario: Workspace with path outside repo root

- **GIVEN** project root is `/project` and workspace specs path is `../external-repo/specs`
- **WHEN** configuration is loaded
- **THEN** `isExternal` is `true`

### Requirement: Ownership semantics

#### Scenario: Owned workspace allows all operations

- **GIVEN** a workspace with `ownership: owned`
- **WHEN** a change is created with a spec from that workspace
- **THEN** the change is created successfully

#### Scenario: Shared workspace allows all operations

- **GIVEN** a workspace with `ownership: shared`
- **WHEN** a change is created with a spec from that workspace
- **THEN** the change is created successfully

#### Scenario: ReadOnly workspace blocks change scope addition

- **GIVEN** a workspace with `ownership: readOnly`
- **WHEN** a spec from that workspace is added to a change via `change create --spec` or `change edit --add-spec`
- **THEN** `ReadOnlyWorkspaceError` is thrown
- **AND** the change is not created or modified

#### Scenario: ReadOnly workspace blocks archive

- **GIVEN** a change that contains specs from a `readOnly` workspace
- **WHEN** `ArchiveChange.execute` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown before any hooks or file modifications

#### Scenario: ReadOnly workspace blocks direct spec writes

- **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `save()` or `writePersistedState()` is called
- **THEN** `ReadOnlyWorkspaceError` is thrown before any filesystem operation

#### Scenario: ReadOnly workspace allows reads

- **GIVEN** a workspace with `ownership: readOnly`
- **WHEN** `SpecRepository.get()`, `list()`, `artifact()`, or `readMetadataSnapshot()` is called
- **THEN** the operation succeeds normally

#### Scenario: Error messages do not suggest remediation

- **WHEN** any `ReadOnlyWorkspaceError` is thrown
- **THEN** the error message states the blocked operation and the workspace name
- **AND** the message does not contain suggestions to change `specd.yaml` or modify ownership

#### Scenario: ReadOnly workspace permits metadata cache writes

- **GIVEN** a `SpecRepository` bound to a workspace with `readOnly` ownership
- **WHEN** `writeMetadataSnapshot()` persists generated metadata
- **THEN** the disposable cache write is permitted
- **AND** the canonical spec artifacts and persisted lock remain unchanged

### Requirement: Prefix semantics

#### Scenario: Prefix prepended to capability path

- **GIVEN** workspace `shared` declares `prefix: team/core`
- **AND** a spec stored at `architecture/` on disk
- **WHEN** the spec ID is resolved
- **THEN** it becomes `shared:team/core/architecture`

#### Scenario: No prefix uses bare path

- **GIVEN** workspace `default` declares no prefix
- **AND** a spec stored at `architecture/` on disk
- **WHEN** the spec ID is resolved
- **THEN** it becomes `default:architecture`

#### Scenario: Invalid prefix rejected

- **WHEN** a workspace declares a prefix with invalid syntax
- **THEN** a `ConfigValidationError` is thrown at startup

#### Scenario: Prefix segment violating the segment rule

- **GIVEN** a workspace declares `prefix: team/Shared`
- **WHEN** the configuration is loaded
- **THEN** loading fails with `ConfigValidationError`

### Requirement: Workspace-qualified spec IDs

#### Scenario: Bare path resolves to default workspace

- **WHEN** a user specifies `auth/login` without a colon
- **THEN** it resolves to `default:auth/login`

#### Scenario: Unknown workspace rejected

- **WHEN** a spec ID `nonexistent:auth/login` is used
- **THEN** an error is thrown indicating the workspace is unknown

#### Scenario: Unknown workspace in a spec ID raises the typed error

- **WHEN** a use case receives `nope:auth/login`
- **THEN** it throws `WorkspaceNotFoundError`

#### Scenario: Malformed spec ID raises the typed error

- **WHEN** a use case receives `ws:` as a spec ID
- **THEN** it throws `InvalidSpecIdError`

#### Scenario: Adapters do not qualify IDs even for display

- **WHEN** a delivery adapter prints a spec ID
- **THEN** it prints the raw argument or the use case result
- **AND** it does not call `parseSpecId`

### Requirement: Active workspace determination

#### Scenario: Workspace active when change has spec in it

- **GIVEN** a change with `specIds: ['billing:invoices']`
- **WHEN** context compilation determines active workspaces
- **THEN** workspace `billing` is active

#### Scenario: Workspace inactive when no specs target it

- **GIVEN** a change with `specIds: ['default:auth/login']`
- **WHEN** context compilation determines active workspaces
- **THEN** workspace `billing` is not active
- **AND** its workspace-level patterns are not applied

### Requirement: Port-per-workspace pattern

#### Scenario: Repository map passed to cross-workspace use cases

- **GIVEN** multiple workspaces `default` and `billing` are declared
- **WHEN** a use case that operates across workspaces is invoked
- **THEN** it receives a `ReadonlyMap<string, RepositoryInstance>` keyed by workspace name
- **AND** it looks up the repository for a spec's workspace to resolve paths

### Requirement: Cross-workspace references

#### Scenario: Spec references another workspace's spec

- **GIVEN** workspace `billing` and `default` are declared
- **WHEN** a spec declares `dependsOn: ['billing:payments/invoices']`
- **THEN** the reference is accepted

#### Scenario: Unknown workspace reference at config validation time

- **GIVEN** a workspace with `prefix: team` declares a schema reference `#unknown:name`
- **WHEN** configuration is validated
- **THEN** an error is thrown

### Requirement: Workspace-level context patterns

#### Scenario: Unqualified pattern resolves to own workspace

- **GIVEN** workspace `billing` declares `contextIncludeSpecs: ['payments/*']`
- **WHEN** context patterns are resolved
- **THEN** the pattern matches `billing:payments/*`, not `default:payments/*`

#### Scenario: DependsOn specs exempt from excludes

- **GIVEN** workspace `billing` declares `contextExcludeSpecs: ['internal/*']`
- **AND** a spec reached via `dependsOn` traversal matches `billing:internal/utils`
- **WHEN** context is compiled
- **THEN** `billing:internal/utils` is included (not excluded)

### Requirement: Workspace directory structure in changes

#### Scenario: Single-workspace change includes workspace segment

- **GIVEN** a change targeting only `default` workspace
- **WHEN** a new spec artifact is stored
- **THEN** the path includes the workspace segment: `specs/default/<capability-path>/<filename>`

### Requirement: Sole source of truth

#### Scenario: External workspace config is never read

- **GIVEN** workspace `billing` points to `../billing-repo/specs`
- **AND** `../billing-repo/specd.yaml` exists with its own workspace configuration
- **WHEN** specd loads configuration
- **THEN** `../billing-repo/specd.yaml` is never read
- **AND** all workspace properties come from the local `specd.yaml`

#### Scenario: root workspace name is rejected

- **GIVEN** `specd.yaml` declares a workspace named `root`
- **WHEN** the config is loaded
- **THEN** a `ConfigValidationError` is thrown on startup
