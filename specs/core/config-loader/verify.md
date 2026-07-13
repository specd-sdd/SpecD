# Verification: Config Loader

## Requirements

### Requirement: Factory signature and return type

#### Scenario: Factory returns a ConfigLoader

- **WHEN** `createDefaultConfigLoader({ startDir: '/some/dir' })` is called
- **THEN** the returned object satisfies the `ConfigLoader` interface (abstract class)
- **AND** it is bounded by a resolved `rootPath` value rather than retaining a `VcsAdapter`
- **AND** it exposes a `load()` method returning `Promise<SpecdConfig>`
- **AND** it exposes a `resolvePath()` method returning `Promise<string | null>`

### Requirement: Path probe

#### Scenario: Discovery mode returns resolved chain root path

- **GIVEN** discoverable config candidates exist in the active directory
- **WHEN** `resolvePath()` is called in discovery mode
- **THEN** it returns the absolute path of the active root config file for that resolved chain

#### Scenario: Discovery mode returns null when no config found

- **GIVEN** no discoverable config candidates exist between `startDir` and the VCS root
- **WHEN** `resolvePath()` is called
- **THEN** it returns `null`

#### Scenario: Discovery mode can return a shared root even when later local layers will attach

- **GIVEN** `specd.yaml` is the active root and later local layers also attach
- **WHEN** `resolvePath()` is called
- **THEN** it still returns the root config path rather than one of the later layers

#### Scenario: Forced mode returns resolved absolute path without existence check

- **WHEN** `resolvePath()` is called in forced mode with a relative `configPath`
- **THEN** it returns the resolved absolute path
- **AND** it does not check whether the file exists

#### Scenario: resolvePath never throws

- **WHEN** `resolvePath()` is called in either mode
- **THEN** it never throws

### Requirement: Discovery mode

#### Scenario: Config found in startDir

- **GIVEN** the start directory contains discoverable config candidates
- **WHEN** `load()` is called
- **THEN** the loader resolves that directory's active chain

#### Scenario: Config found in ancestor directory

- **GIVEN** the start directory has no discoverable candidates
- **AND** the nearest ancestor directory before the VCS root does
- **WHEN** `load()` is called
- **THEN** the loader resolves the ancestor directory's active chain

#### Scenario: Explicit-base variant is skipped when base is inactive

- **GIVEN** `specd.local.experimental.yaml` declares `extends: ./specd.experimental.yaml`
- **AND** `specd.experimental.yaml` is not active in the current discovery chain
- **WHEN** `load()` runs in discovery mode
- **THEN** `specd.local.experimental.yaml` is skipped

#### Scenario: Standalone local file resets the chain

- **GIVEN** `specd.yaml` exists
- **AND** `specd.local.yaml` exists without `extends`
- **WHEN** `load()` runs in discovery mode
- **THEN** `specd.local.yaml` becomes the active root
- **AND** previously accumulated shared layers are not inherited further

#### Scenario: Walk stops at VCS root

- **GIVEN** no discoverable candidates exist between startDir and the VCS root
- **WHEN** `load()` is called
- **THEN** the walk stops at the VCS root
- **AND** it does not inspect parent directories above that root

#### Scenario: No VCS repo — checks only startDir

- **GIVEN** `startDir` is not inside any VCS repository
- **AND** discoverable config candidates exist only in the parent directory
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

#### Scenario: No config file found

- **GIVEN** no discoverable config candidates exist in the applicable search area
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message indicating no config was found

### Requirement: Forced mode

#### Scenario: Forced path loads exact entrypoint chain

- **GIVEN** `specd.local.dev.yaml` declares `extends: true`
- **AND** other discoverable local variants also exist in the same directory
- **WHEN** `load()` is called with `{ configPath: '/repo/specd.local.dev.yaml' }`
- **THEN** the loader resolves only `/repo/specd.local.dev.yaml` and its `extends` chain
- **AND** the sibling variants are not added by discovery

#### Scenario: Forced path resolves relative path

- **WHEN** `load()` is called with `{ configPath: './custom/specd.yaml' }`
- **THEN** the path is resolved to an absolute path before reading

#### Scenario: Forced path file not found

- **GIVEN** the file at `configPath` does not exist
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message about the file not being found

#### Scenario: Forced mode extends target not found

- **GIVEN** a file is loaded with `--config` and declares `extends: specd.yaml`
- **AND** `specd.yaml` does not exist in the same directory
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message about the file not being found

#### Scenario: Forced mode extends true without base file

- **GIVEN** a file is loaded with `--config` and declares `extends: true`
- **AND** no previous candidate exists in the same directory
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

### Requirement: Layer merge semantics

#### Scenario: Later scalar overrides earlier scalar

- **GIVEN** two active layers define different values for the same scalar field
- **WHEN** the chain is merged
- **THEN** the later layer's scalar value wins

#### Scenario: Object keys deep-merge by path

- **GIVEN** a base layer defines `workspaces.default.codeRoot`
- **AND** a later layer defines `workspaces.default.ownership`
- **WHEN** the chain is merged
- **THEN** both keys are present in the merged object

#### Scenario: Inherited arrays append by default

- **GIVEN** a base layer defines `context: [{ instruction: 'base' }]`
- **AND** a later layer defines `context: [{ instruction: 'overlay' }]`
- **WHEN** the chain is merged
- **THEN** the merged config contains both context entries in chain order

#### Scenario: Array removal deletes inherited context by id

- **GIVEN** a base layer defines `context: [{ id: bootstrap, file: specd-bootstrap.md }]`
- **AND** a later layer declares `remove: { context: [{ id: bootstrap }] }`
- **WHEN** the chain is merged
- **THEN** the inherited `bootstrap` context entry is absent from the final config

#### Scenario: Standalone layer discards earlier inherited state

- **GIVEN** earlier shared layers are active
- **AND** a later discovered layer has no `extends`
- **WHEN** the chain is resolved
- **THEN** that standalone layer becomes the new root for subsequent layers

### Requirement: Native environment file support

#### Scenario: .env.local takes precedence over .env

- **GIVEN** `.env` has `FOO=bar`
- **AND** `.env.local` has `FOO=baz`
- **WHEN** loader runs
- **THEN** `process.env.FOO` is `baz` (or mapped accordingly)

### Requirement: YAML parsing and structural validation

#### Scenario: Invalid YAML syntax

- **GIVEN** the config file contains malformed YAML
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message containing the YAML parse error

#### Scenario: Missing required field

- **GIVEN** the config file is valid YAML but omits the `schema` field
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with the Zod path referencing the missing field

#### Scenario: Invalid adapter value

- **GIVEN** a workspace `specs` section declares `adapter: s3`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

#### Scenario: Validation precedes path resolution

- **GIVEN** the config has both an invalid structure and relative paths
- **WHEN** `load()` is called
- **THEN** the structural error is thrown before any path resolution occurs

### Requirement: Default workspace is required

#### Scenario: Missing default workspace

- **GIVEN** the config declares workspaces but none is named `default`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message indicating `workspaces.default` is required

### Requirement: Path resolution relative to config directory

#### Scenario: Relative spec path resolved from config directory

- **GIVEN** the config file is at `/repo/specd.yaml` and declares `specs.fs.path: specs/`
- **WHEN** `load()` is called
- **THEN** the workspace's `specsPath` is `/repo/specs`

#### Scenario: Storage paths resolved from config directory

- **GIVEN** the config file is at `/repo/specd.yaml` and declares `storage.changes.fs.path: specd/changes`
- **WHEN** `load()` is called
- **THEN** the resolved changes path is `/repo/specd/changes`

#### Scenario: Explicit metadataPath resolved from config directory

- **GIVEN** the config file is at `/repo/specd.yaml` and declares `specs.fs.metadataPath: .specd/metadata`
- **WHEN** `load()` is called
- **THEN** the workspace's `metadataPath` is `/repo/.specd/metadata`

#### Scenario: Absent metadataPath auto-derived from VCS root

- **GIVEN** the config file is at `/repo/specd.yaml` with no `specs.fs.metadataPath`
- **AND** the specs path is inside a git repo rooted at `/repo`
- **WHEN** kernel composition initializes the workspace
- **THEN** the workspace's `metadataPath` is `/repo/.specd/metadata`
- **NOTE** auto-derivation of absent `metadataPath` is a kernel composition responsibility (see `kernel-internals.ts`), not `config-loader.load()`. The loader only resolves explicit `metadataPath` values.

#### Scenario: Absent metadataPath with NullVcsAdapter fallback

- **GIVEN** the config has `specs.fs.path: /external/specs` with no `specs.fs.metadataPath`
- **AND** `/external/specs` is not inside any VCS
- **WHEN** kernel composition initializes the workspace
- **THEN** the workspace's `metadataPath` is `/external/.specd/metadata`
- **NOTE** same as above — fallback derivation is kernel composition responsibility.

### Requirement: Storage path containment

#### Scenario: Storage path outside VCS root

- **GIVEN** the loader `rootPath` is `/repo/` and `storage.changes.fs.path` resolves to `/other/changes`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` indicating the storage path resolves outside `rootPath`

#### Scenario: Storage path at VCS root is valid

- **GIVEN** the loader `rootPath` is `/repo/` and a storage path resolves to exactly `/repo`
- **WHEN** `load()` is called
- **THEN** the storage path is accepted without error

#### Scenario: No VCS repo — containment check skipped

- **GIVEN** `createVcsAdapter()` resolves to `NullVcsAdapter`
- **AND** `createDefaultConfigLoader()` normalizes `NullVcsAdapter.rootDir()` throwing into `rootPath = null`
- **AND** storage paths resolve to arbitrary locations
- **WHEN** `load()` is called
- **THEN** no containment error is thrown

### Requirement: isExternal inference for workspaces

#### Scenario: Workspace specsPath inside VCS root

- **GIVEN** the loader `rootPath` is `/repo/` and a workspace's `specsPath` resolves to `/repo/specs`
- **WHEN** `load()` is called
- **THEN** the workspace's `isExternal` is `false`

#### Scenario: Workspace specsPath outside VCS root

- **GIVEN** the loader `rootPath` is `/repo/` and a workspace's `specsPath` resolves to `/other-repo/specs`
- **WHEN** `load()` is called
- **THEN** the workspace's `isExternal` is `true`

#### Scenario: No VCS repo — all workspaces are not external

- **GIVEN** `createVcsAdapter()` resolves to `NullVcsAdapter`
- **AND** `createDefaultConfigLoader()` normalizes `NullVcsAdapter.rootDir()` throwing into `rootPath = null`
- **WHEN** `load()` is called
- **THEN** all workspaces have `isExternal` set to `false`

### Requirement: Default values for workspace fields

#### Scenario: Default workspace ownership defaults to owned

- **GIVEN** the `default` workspace omits `ownership`
- **WHEN** `load()` is called
- **THEN** the default workspace's `ownership` is `'owned'`

#### Scenario: Non-default workspace ownership defaults to readOnly

- **GIVEN** a non-default workspace omits `ownership`
- **WHEN** `load()` is called
- **THEN** that workspace's `ownership` is `'readOnly'`

#### Scenario: Default workspace codeRoot defaults to config directory

- **GIVEN** the `default` workspace omits `codeRoot` and the config is at `/repo/specd.yaml`
- **WHEN** `load()` is called
- **THEN** the default workspace's `codeRoot` is `/repo`

#### Scenario: Non-default workspace missing codeRoot

- **GIVEN** a non-default workspace omits `codeRoot`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` indicating `codeRoot` is required for that workspace

#### Scenario: Default workspace schemasPath defaults when omitted

- **GIVEN** the `default` workspace omits `schemas` and the config is at `/repo/specd.yaml`
- **WHEN** `load()` is called
- **THEN** the default workspace's `schemasPath` is `/repo/specd/schemas`

#### Scenario: Non-default workspace schemasPath is null when omitted

- **GIVEN** a non-default workspace omits `schemas`
- **WHEN** `load()` is called
- **THEN** that workspace's `schemasPath` is `null`

### Requirement: contextIncludeSpecs and contextExcludeSpecs pattern validation

#### Scenario: Valid bare wildcard

- **GIVEN** `contextIncludeSpecs` contains `'*'`
- **WHEN** `load()` is called
- **THEN** validation succeeds

#### Scenario: Valid qualified wildcard

- **GIVEN** `contextIncludeSpecs` contains `'billing:*'`
- **WHEN** `load()` is called
- **THEN** validation succeeds

#### Scenario: Valid prefix wildcard

- **GIVEN** `contextIncludeSpecs` contains `'auth/*'`
- **WHEN** `load()` is called
- **THEN** validation succeeds

#### Scenario: Wildcard in disallowed position

- **GIVEN** `contextIncludeSpecs` contains `'auth/*/login'`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

#### Scenario: Invalid workspace qualifier

- **GIVEN** `contextExcludeSpecs` contains `'BILLING:*'`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

#### Scenario: Workspace-level patterns are also validated

- **GIVEN** a workspace declares `contextIncludeSpecs` with an invalid pattern
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` identifying the workspace and field

### Requirement: Workflow and context entry mapping

#### Scenario: Run hook mapped to typed form

- **GIVEN** the config declares a workflow step with `hooks.post: [{ run: 'make test' }]`
- **WHEN** `load()` is called
- **THEN** the corresponding hook has `type: 'run'` and `command: 'make test'`

#### Scenario: Instruction hook mapped to typed form

- **GIVEN** the config declares a workflow step with `hooks.pre: [{ instruction: 'Check coverage' }]`
- **WHEN** `load()` is called
- **THEN** the corresponding hook has `type: 'instruction'` and `text: 'Check coverage'`

#### Scenario: Context entry with id is preserved

- **GIVEN** the config declares `context: [{ id: bootstrap, file: specd-bootstrap.md }]`
- **WHEN** `load()` is called
- **THEN** the mapped context entry preserves both `id` and `file`

#### Scenario: Agent plugin identity is name

- **GIVEN** the config declares `plugins.agents: [{ name: '@specd/plugin-agent-codex', config: { commandsDir: '.codex/commands' } }]`
- **WHEN** `load()` is called
- **THEN** the mapped plugin entry preserves `name` and `config`
- **AND** inherited removal resolves that entry by `name`

### Requirement: Approvals default to false

#### Scenario: Approvals section absent

- **GIVEN** the config omits the `approvals` section entirely
- **WHEN** `load()` is called
- **THEN** `approvals.spec` is `false` and `approvals.signoff` is `false`

#### Scenario: Partial approvals section

- **GIVEN** the config declares `approvals: { spec: true }` without `signoff`
- **WHEN** `load()` is called
- **THEN** `approvals.spec` is `true` and `approvals.signoff` is `false`

### Requirement: All errors are ConfigValidationError

#### Scenario: All validation errors use ConfigValidationError

- **GIVEN** any validation failure occurs during `load()`
- **WHEN** the error is caught
- **THEN** it is an instance of `ConfigValidationError`

#### Scenario: Invalid cascade chain still uses ConfigValidationError

- **GIVEN** an explicit `extends` target points outside the applicable chain
- **WHEN** `load()` is called
- **THEN** the thrown error is `ConfigValidationError`
