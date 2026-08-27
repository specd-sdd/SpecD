# Verification: ResolveContextSpecs

## Requirements

### Requirement: Accepts ResolveContextSpecsInput

#### Scenario: Omitted input resolves all configured workspaces

- **WHEN** `execute()` is called with no argument
- **THEN** workspace-level patterns run for every configured workspace
- **AND** every configured workspace name appears as a key under `workspaces`

#### Scenario: Empty workspaces array equals omitted

- **WHEN** `execute({ workspaces: [] })` is called
- **THEN** behaviour matches an omitted `workspaces` field

### Requirement: Returns ResolveContextSpecsResult

#### Scenario: Result has no content or warnings fields

- **WHEN** `execute` succeeds
- **THEN** the result object exposes only `project` and `workspaces`
- **AND** no rendered context entries or warning array are returned

### Requirement: Dual listing by include provenance

#### Scenario: Same ID from project and workspace patterns appears in both partitions

- **GIVEN** project-level include patterns match `core:workspace`
- **AND** the `core` workspace include patterns also match `core:workspace`
- **AND** no exclude removes it
- **WHEN** `execute` runs with `core` active
- **THEN** `project` contains `core:workspace`
- **AND** `workspaces.core` contains `core:workspace`

#### Scenario: Workspace exclude clears project-included ID from every partition

- **GIVEN** project-level patterns include `core:workspace`
- **AND** a `core` workspace exclude matches `core:workspace`
- **WHEN** `execute` runs with `core` active
- **THEN** `core:workspace` is absent from `project` and from `workspaces.core`

### Requirement: Shared configured-context helper

#### Scenario: Helper order matches project then workspace include/exclude

- **GIVEN** overlapping project and workspace include/exclude patterns
- **WHEN** `resolveConfiguredContextSpecs` runs
- **THEN** project includes run before project excludes
- **AND** workspace includes run before workspace excludes for each active workspace
- **AND** inactive workspaces contribute no workspace-level matches

#### Scenario: Empty activeWorkspaces runs project patterns only

- **WHEN** `resolveConfiguredContextSpecs` runs with an empty `activeWorkspaces` set
- **THEN** project-level include/exclude patterns still apply
- **AND** no workspace-level patterns run

### Requirement: Workspace filter and unknown names

#### Scenario: Unknown workspace fails as InvalidInputError

- **WHEN** `execute({ workspaces: ['no-such-ws'] })` is called
- **THEN** the call rejects with `InvalidInputError`
- **AND** `error.code` is `INVALID_INPUT`
- **AND** `error.message` is `Unknown workspace 'no-such-ws'`

#### Scenario: Multiple unknown workspaces listed in one InvalidInputError

- **WHEN** `execute({ workspaces: ['a', 'b'] })` is called and neither exists
- **THEN** the call rejects with `InvalidInputError`
- **AND** `error.code` is `INVALID_INPUT`
- **AND** `error.message` is `Unknown workspaces: 'a', 'b'`

#### Scenario: Filter limits workspace keys without suppressing project by default

- **GIVEN** project patterns include `default:_global/architecture`
- **AND** only workspace `cli` is requested
- **WHEN** `execute({ workspaces: ['cli'] })` runs
- **THEN** `project` still contains IDs from project-level patterns
- **AND** `workspaces` keys are only `cli`

### Requirement: workspacesOnly skips project patterns

#### Scenario: workspacesOnly empties project partition

- **GIVEN** project patterns would match at least one ID
- **WHEN** `execute({ workspacesOnly: true })` runs
- **THEN** `project` is `[]`
- **AND** only workspace-level patterns contribute IDs under `workspaces`

### Requirement: Construction and composition

#### Scenario: Kernel exposes resolveContextSpecs

- **WHEN** a kernel is created for a project
- **THEN** `kernel.project.resolveContextSpecs` is an executable `ResolveContextSpecs` instance

### Requirement: Public surface

#### Scenario: No dedicated SDK orchestration pass-through

- **WHEN** inspecting `@specd/sdk` public orchestration exports
- **THEN** there is no `resolveProjectContextSpecs` function whose sole behaviour is forwarding `kernel.project.resolveContextSpecs.execute`
- **AND** `ResolveContextSpecs` types remain available via SDK core re-exports
