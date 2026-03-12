# Verification: Config Loader

## Requirements

### Requirement: Factory signature and return type

#### Scenario: Factory returns a ConfigLoader

- **WHEN** `createConfigLoader({ startDir: '/some/dir' })` is called
- **THEN** the returned object satisfies the `ConfigLoader` interface
- **AND** it exposes a `load()` method returning `Promise<SpecdConfig>`

### Requirement: Discovery mode

#### Scenario: Config found in startDir

- **GIVEN** `specd.yaml` exists in `/repo/project/`
- **WHEN** `load()` is called with `{ startDir: '/repo/project/' }`
- **THEN** it returns a `SpecdConfig` with `projectRoot` equal to `/repo/project`

#### Scenario: Config found in ancestor directory

- **GIVEN** `specd.yaml` exists in `/repo/` (the git root) but not in `/repo/packages/foo/`
- **WHEN** `load()` is called with `{ startDir: '/repo/packages/foo/' }`
- **THEN** it returns a `SpecdConfig` with `projectRoot` equal to `/repo`

#### Scenario: Local config takes precedence over specd.yaml

- **GIVEN** both `specd.yaml` and `specd.local.yaml` exist in `/repo/`
- **WHEN** `load()` is called with `{ startDir: '/repo/' }`
- **THEN** the loader reads `specd.local.yaml` exclusively
- **AND** `specd.yaml` is not read

#### Scenario: Local config found at higher directory level

- **GIVEN** `specd.local.yaml` exists in `/repo/` but only `specd.yaml` exists in `/repo/sub/`
- **WHEN** `load()` is called with `{ startDir: '/repo/sub/' }`
- **THEN** the loader uses `specd.yaml` in `/repo/sub/` (first match wins during walk)

#### Scenario: Walk stops at git root

- **GIVEN** `specd.yaml` exists in `/parent/` but the git root is `/parent/repo/`
- **WHEN** `load()` is called with `{ startDir: '/parent/repo/src/' }`
- **THEN** `load()` throws `ConfigValidationError` with a message about no config found

#### Scenario: No git repo — checks only startDir

- **GIVEN** `startDir` is not inside any git repository
- **AND** `specd.yaml` exists in the parent of `startDir` but not in `startDir` itself
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError`

#### Scenario: No config file found

- **GIVEN** no `specd.yaml` or `specd.local.yaml` exists in or above `startDir` up to the git root
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message indicating no config was found

### Requirement: Forced mode

#### Scenario: Forced path loads exact file

- **GIVEN** `specd.yaml` and `specd.local.yaml` both exist in `/repo/`
- **WHEN** `load()` is called with `{ configPath: '/repo/specd.yaml' }`
- **THEN** the loader reads `/repo/specd.yaml`
- **AND** `specd.local.yaml` is not consulted

#### Scenario: Forced path resolves relative path

- **WHEN** `load()` is called with `{ configPath: './custom/specd.yaml' }`
- **THEN** the path is resolved to an absolute path before reading

#### Scenario: Forced path file not found

- **GIVEN** the file at `configPath` does not exist
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` with a message about the file not being found

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
- **THEN** `storage.changesPath` is `/repo/specd/changes`

#### Scenario: projectRoot is config file directory

- **GIVEN** the config file is at `/repo/specd.yaml`
- **WHEN** `load()` is called
- **THEN** `projectRoot` is `/repo`

### Requirement: Storage path containment

#### Scenario: Storage path outside git root

- **GIVEN** the git root is `/repo/` and `storage.changes.fs.path` resolves to `/other/changes`
- **WHEN** `load()` is called
- **THEN** `load()` throws `ConfigValidationError` indicating the storage path resolves outside the repo root

#### Scenario: Storage path at git root is valid

- **GIVEN** the git root is `/repo/` and a storage path resolves to exactly `/repo`
- **WHEN** `load()` is called
- **THEN** the storage path is accepted without error

#### Scenario: No git repo — containment check skipped

- **GIVEN** startDir is not inside a git repository
- **AND** storage paths resolve to arbitrary locations
- **WHEN** `load()` is called
- **THEN** no containment error is thrown

### Requirement: isExternal inference for workspaces

#### Scenario: Workspace specsPath inside git root

- **GIVEN** the git root is `/repo/` and a workspace's `specsPath` resolves to `/repo/specs`
- **WHEN** `load()` is called
- **THEN** the workspace's `isExternal` is `false`

#### Scenario: Workspace specsPath outside git root

- **GIVEN** the git root is `/repo/` and a workspace's `specsPath` resolves to `/other-repo/specs`
- **WHEN** `load()` is called
- **THEN** the workspace's `isExternal` is `true`

#### Scenario: No git repo — all workspaces are not external

- **GIVEN** startDir is not inside a git repository
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
