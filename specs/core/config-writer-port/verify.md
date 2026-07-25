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
- **THEN** a `specd.yaml` is created with the schema reference and default workspace config (omitting the `storage` block by default)
- **AND** the workspace specs directory and standard storage directories under `.specd/` are created
- **AND** both `specd.local.yaml` and `specd.local.*.yaml` are appended to `.gitignore`

#### Scenario: Metadata cache directory created idempotently

- **GIVEN** a directory with no existing `specd.yaml` or metadata cache directory
- **WHEN** `initProject` completes successfully
- **THEN** the resolved metadata cache directory (default `.specd/metadata/`) exists

#### Scenario: Metadata cache directory creation is idempotent on re-init

- **GIVEN** the resolved metadata cache directory already exists
- **WHEN** `initProject` is called again with `force: true`
- **THEN** the metadata cache directory still exists and no error is thrown

#### Scenario: Metadata cache entry appended to root .gitignore

- **GIVEN** a root `.gitignore` without a `/.specd/metadata/` entry
- **WHEN** `initProject` completes successfully
- **THEN** the root `.gitignore` contains a rooted `/.specd/metadata/` entry
- **AND** other existing ignore content is undisturbed

#### Scenario: Metadata cache entry is not duplicated on re-init

- **GIVEN** a root `.gitignore` already containing the rooted `/.specd/metadata/` entry
- **WHEN** `initProject` is called again with `force: true`
- **THEN** the `/.specd/metadata/` entry appears only once in `.gitignore`

#### Scenario: Non-default filesystem metadataPath is not rewritten automatically

- **GIVEN** the resolved workspace storage config specifies a custom filesystem `metadataPath`
- **WHEN** `initProject` completes successfully
- **THEN** the custom `metadataPath` directory is not silently relocated or renamed by `initProject`

#### Scenario: Non-filesystem repository is not subject to the metadata gitignore step

- **GIVEN** the resolved configuration declares a non-filesystem spec repository adapter
- **WHEN** `initProject` completes successfully
- **THEN** the root `.gitignore` metadata-cache step does not apply for that workspace

#### Scenario: initProject creates tmp gitignore for fs-cache and locks

- **GIVEN** a directory with no existing `specd.yaml`
- **WHEN** `initProject` completes successfully
- **THEN** `{configPath}/tmp/.gitignore` exists with contents ignoring `*` and un-ignoring `!.gitignore`

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

### Requirement: RemovePlugin

#### Scenario: Removes plugin from agents array

- **GIVEN** `specd.yaml` with `plugins: { agents: [{ name: '@specd/plugin-agent-claude' }] }`
- **WHEN** `removePlugin(configPath, 'agents', '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is removed from `plugins.agents`

### Requirement: Delivery access via createConfigWriter

#### Scenario: Delivery obtains writer via composition factory

- **WHEN** a CLI command needs to mutate `specd.yaml`
- **THEN** it calls `createConfigWriter()` from `@specd/core`
- **AND** it invokes `initProject`, `addPlugin`, or `removePlugin` on the returned instance

#### Scenario: Delivery does not construct FsConfigWriter directly

- **WHEN** `@specd/cli` imports from `@specd/core` for config mutation
- **THEN** it imports `createConfigWriter` — not `FsConfigWriter`

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
- **THEN** it contains `configPath: string`, `schemaRef: string`, `workspaces: readonly string[]`, and `metadataCachePath: string`
