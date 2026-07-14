# Verification: List Workspaces

## Requirements

### Requirement: Orchestrate workspaces with repositories

#### Scenario: Workspaces returned in configuration order

- **GIVEN** a project with workspaces `core`, `cli`, and `default` configured in that order
- **WHEN** `ListWorkspaces.execute()` is called
- **THEN** the returned array contains three `ProjectWorkspace` entities
- **AND** the order is `core`, then `cli`, then `default`

#### Scenario: Each workspace has its assigned repository

- **GIVEN** workspace `core` is configured with its own spec storage
- **WHEN** `ListWorkspaces.execute()` is called
- **THEN** the `ProjectWorkspace` for `core` includes a `SpecRepository` instance
- **AND** that repository is bound to the `core` workspace

### Requirement: ProjectWorkspace entity properties

#### Scenario: Entity contains all mandatory fields

- **WHEN** a `ProjectWorkspace` is returned by the orchestrator
- **THEN** it includes `name`, `codeRoot`, `isExternal`, `ownership`, and `specRepo`
- **AND** `codeRoot` is an absolute path

### Requirement: Handle all configured workspaces

#### Scenario: All workspaces from specd.yaml are present

- **GIVEN** `specd.yaml` declares five workspaces
- **WHEN** `ListWorkspaces.execute()` is called
- **THEN** exactly five `ProjectWorkspace` entities are returned

### Requirement: Config-based factory preserves canonical spec repository bootstrap

#### Scenario: Config-wired workspace repositories use canonical metadata-path semantics

- **GIVEN** `createListWorkspaces(config)` initializes workspace spec repositories from `SpecdConfig`
- **WHEN** `ListWorkspaces.execute()` returns `ProjectWorkspace.specRepo`
- **THEN** each returned repository uses canonical metadata-path semantics for that workspace
- **AND** the config-based factory does not expose a weaker spec repository view than the canonical composition bootstrap

### Requirement: Config-based factory delegates through resolveListWorkspacesDeps

#### Scenario: createListWorkspaces config form derives ListWorkspacesDeps through resolveListWorkspacesDeps

- **WHEN** `createListWorkspaces(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `ListWorkspacesDeps` through `resolveListWorkspacesDeps(resolver)`
- **AND** `resolveListWorkspacesDeps(resolver)` resolves:
- `config: SpecdConfig`
- `specRepos: ReadonlyMap<string, SpecRepository>`
- **AND** the factory delegates to canonical `createListWorkspaces(deps)`
