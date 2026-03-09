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

### Requirement: Workspace-qualified spec IDs

#### Scenario: Bare path resolves to default workspace

- **WHEN** a user specifies `auth/login` without a colon
- **THEN** it resolves to `default:auth/login`

#### Scenario: Unknown workspace rejected

- **WHEN** a spec ID `nonexistent:auth/login` is used
- **THEN** an error is thrown indicating the workspace is unknown

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
