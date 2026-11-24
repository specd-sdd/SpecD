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
- **THEN** a `specd.yaml` is created with `configVersion: 2`, the schema reference and default workspace config (omitting the `storage` block by default)
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
- **THEN** `<config directory>/tmp/.gitignore` (default `.specd/config/tmp/.gitignore`) exists with contents ignoring `*` and un-ignoring `!.gitignore`

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

#### Scenario: Adds plugin to the list

- **GIVEN** `specd.yaml` with `plugins: []`
- **WHEN** `addPlugin(configPath, '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is added to `plugins`

#### Scenario: Adds plugin with config and contributions

- **WHEN** `addPlugin(configPath, '@acme/x', { config: { a: 1 }, contributions: ['audit'] })` is called
- **THEN** the entry contains `name`, `config` and `contributions`

#### Scenario: Duplicate plugin updates existing

- **GIVEN** `specd.yaml` with `plugins: [{ name: '@specd/plugin-agent-claude' }]`
- **WHEN** `addPlugin(configPath, '@specd/plugin-agent-claude')` is called
- **THEN** the existing entry is updated and not duplicated

#### Scenario: Update preserves omitted fields

- **GIVEN** `plugins: [{ name: '@acme/x', config: { a: 1 }, contributions: ['audit'] }]`
- **WHEN** `addPlugin(configPath, '@acme/x', { config: { a: 2 } })` is called
- **THEN** the entry has `config: { a: 2 }` and still has `contributions: ['audit']`

#### Scenario: Invalid plugin name is rejected

- **WHEN** `addPlugin(configPath, 'not-scoped')` is called
- **THEN** `ConfigValidationError` is thrown
- **AND** `specd.yaml` is not modified

#### Scenario: Empty contributions list is rejected without writing

- **GIVEN** an existing valid `specd.yaml`
- **WHEN** `addPlugin(configPath, '@acme/x', { contributions: [] })` is called
- **THEN** it throws `ConfigValidationError` and the file is byte-identical

#### Scenario: Empty or comment-only config is rejected by addPlugin

- **GIVEN** a `specd.yaml` that is empty or contains only comments
- **WHEN** `addPlugin(configPath, '@acme/x')` is called
- **THEN** it throws `ConfigValidationError` and the file is unchanged
- **AND** `listPlugins` returns an empty list and `removePlugin` is a no-op for the same file

#### Scenario: Directory path is a validation error

- **GIVEN** a path that is a directory
- **WHEN** `listPlugins(path)` is called
- **THEN** it throws `ConfigValidationError`

#### Scenario: Legacy plugins format is not rewritten

- **GIVEN** `plugins: { agents: [...] }` in `specd.yaml`
- **WHEN** `addPlugin` or `removePlugin` is called
- **THEN** an error is thrown and the file is unchanged

#### Scenario: Config and contributions persisted and listed

- **WHEN** `addPlugin(configPath, '@acme/x', { config: { a: 1 }, contributions: ['audit'] })` is called in one call
- **THEN** the file on disk contains the entry with `name`, `config` and `contributions`
- **AND** `listPlugins(configPath)` returns that entry with the same `config` and `contributions`

### Requirement: RemovePlugin

#### Scenario: Malformed YAML is rejected without rewriting

- **GIVEN** a `specd.yaml` that is not valid YAML
- **WHEN** `addPlugin`, `removePlugin` or `listPlugins` is called
- **THEN** `ConfigValidationError` is thrown and the file is byte-identical to before

#### Scenario: Invalid plugin name leaves the file unmodified

- **GIVEN** a valid `specd.yaml`
- **WHEN** `addPlugin(configPath, 'not-scoped')` is called
- **THEN** `ConfigValidationError` is thrown and the file is byte-identical to before

#### Scenario: Plugin mutation on an absent config

- **GIVEN** no `specd.yaml` at `configPath`
- **WHEN** `addPlugin` or `removePlugin` is called
- **THEN** `ConfigValidationError` is thrown and no file is created

#### Scenario: Removes plugin from the list

- **GIVEN** `specd.yaml` with `plugins: [{ name: '@specd/plugin-agent-claude' }]`
- **WHEN** `removePlugin(configPath, '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is removed from `plugins`

#### Scenario: Removing an absent plugin is a no-op

- **GIVEN** `specd.yaml` without the named plugin
- **WHEN** `removePlugin(configPath, '@acme/absent')` is called
- **THEN** `plugins` is unchanged
- **AND** the file is not rewritten

#### Scenario: Removing from a file without a plugins key leaves it byte-identical

- **GIVEN** a `specd.yaml` with no `plugins` key
- **WHEN** `removePlugin(configPath, '@acme/absent')` is called
- **THEN** the file content is byte-identical to before and no `plugins` key is added

### Requirement: ListPlugins

#### Scenario: ListPlugins returns all declared plugins

- **GIVEN** a config with declared plugins, some with `config` and `contributions`
- **WHEN** `listPlugins(configPath)` is called
- **THEN** it returns every entry with its `name`, optional `config` and optional `contributions`

#### Scenario: ListPlugins on a file without a plugins key

- **GIVEN** a `specd.yaml` without a `plugins` key
- **WHEN** `listPlugins(configPath)` is called
- **THEN** it returns an empty array

#### Scenario: ListPlugins on legacy plugins format throws

- **GIVEN** `plugins: { agents: [...] }` in `specd.yaml`
- **WHEN** `listPlugins(configPath)` is called
- **THEN** it throws the same error as `addPlugin` and `removePlugin`

#### Scenario: ListPlugins on absent config

- **GIVEN** no `specd.yaml`
- **WHEN** `listPlugins(configPath)` is called
- **THEN** it returns an empty array

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

### Requirement: Optional initialization and plugin configuration

#### Scenario: Initialization leaves optional plugin configuration absent

- **WHEN** a project is initialized without a plugin requiring configuration
- **THEN** no unrelated plugin configuration is synthesized
