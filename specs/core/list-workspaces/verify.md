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
