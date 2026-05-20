# Verification: ConfigWriter Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `ConfigWriter`
- **WHEN** the class implements `initProject`, `addPlugin`, `removePlugin`, and `listPlugins`
- **THEN** it compiles and can be instantiated

### Requirement: InitProject behaviour

#### Scenario: Fresh project is initialised

- **GIVEN** a directory with no existing `specd.yaml`
- **WHEN** `initProject` is called with valid options
- **THEN** a `specd.yaml` is created, storage directories are created, and both `specd.local.yaml` and `specd.local.*.yaml` are appended to `.gitignore`

#### Scenario: Result contains expected metadata

- **WHEN** `initProject` completes successfully
- **THEN** the returned `InitProjectResult` contains the absolute `configPath`, the `schemaRef` as written, and the created `workspaces` list

### Requirement: InitProject already-initialised guard

#### Scenario: Existing config without force throws

- **GIVEN** `specd.yaml` already exists in the project root
- **WHEN** `initProject` is called with `force` not set or `false`
- **THEN** it throws an `AlreadyInitialisedError`

#### Scenario: Existing config with force overwrites

- **GIVEN** `specd.yaml` already exists in the project root
- **WHEN** `initProject` is called with `force: true`
- **THEN** the existing file is overwritten and no error is thrown

### Requirement: AddPlugin

#### Scenario: Adds plugin to agents array

- **GIVEN** `specd.yaml` with `plugins: { agents: [] }`
- **WHEN** `addPlugin(configPath, 'agents', '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is added to `plugins.agents`

#### Scenario: Duplicate plugin updates existing

- **GIVEN** `specd.yaml` with `plugins: { agents: [{ name: '@specd/plugin-agent-claude' }] }`
- **WHEN** `addPlugin(configPath, 'agents', '@specd/plugin-agent-claude')` is called
- **THEN** the existing entry is updated

### Requirement: InitProject method signature

#### Scenario: initProject accepts InitProjectOptions

- **WHEN** `initProject` is called
- **THEN** it accepts a single argument of type `InitProjectOptions`
- **AND** returns `Promise<InitProjectResult>`

### Requirement: InitProjectOptions shape

#### Scenario: InitProjectOptions contains required fields

- **WHEN** `InitProjectOptions` interface is inspected
- **THEN** it contains `projectRoot: string`, `schemaRef: string`, `workspaceId: string`, `specsPath: string`
- **AND** optional `force?: boolean`

### Requirement: InitProjectResult shape

#### Scenario: InitProjectResult contains required fields

- **WHEN** `InitProjectResult` interface is inspected
- **THEN** it contains `configPath: string`, `schemaRef: string`, `workspaces: readonly string[]`
