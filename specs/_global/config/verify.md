# Verification: Project Configuration

## Requirements

### Requirement: Config file location and format

#### Scenario: Config found — nearest file used

- **WHEN** a `specd.yaml` exists somewhere between the CWD and the git repo root
- **THEN** specd uses the nearest one (closest to CWD) and stops walking

#### Scenario: Monorepo — package config takes precedence

- **WHEN** a monorepo has a `specd.yaml` at the root and another at `packages/billing/specd.yaml`, and the user runs specd from within `packages/billing/`
- **THEN** specd uses `packages/billing/specd.yaml` and does not continue walking up to the root

#### Scenario: Config not found inside repo

- **WHEN** the user runs any specd command inside a git repository and no `specd.yaml` exists between the CWD and the repo root
- **THEN** specd exits with an error explaining that `specd.yaml` was not found and pointing to `specd init`

#### Scenario: Invoked outside a git repo

- **WHEN** the user runs specd from a directory that is not inside any git repository
- **THEN** specd checks only the current working directory for `specd.yaml` and exits with an error if not found there

#### Scenario: Explicit config flag bypasses local override

- **WHEN** `specd --config /path/to/specd.yaml <command>` is invoked
- **THEN** specd uses the specified file exactly as-is — discovery and `specd.local.yaml` lookup are both skipped

### Requirement: Local config override

#### Scenario: Local file takes full precedence

- **WHEN** `specd.local.yaml` exists alongside `specd.yaml`
- **THEN** specd loads only `specd.local.yaml`; `specd.yaml` is ignored entirely

#### Scenario: Local file absent

- **WHEN** no `specd.local.yaml` exists alongside `specd.yaml`
- **THEN** specd loads `specd.yaml` as normal; no error is emitted

#### Scenario: Local file not committed

- **WHEN** `specd init` is run
- **THEN** `specd.local.yaml` is added to `.gitignore` if not already present

#### Scenario: Local file must be valid standalone

- **WHEN** `specd.local.yaml` is present but missing required fields (e.g. `schema`)
- **THEN** specd exits with a validation error — partial configs are not supported

### Requirement: Schema reference

#### Scenario: npm package schema

- **WHEN** `schema: "@specd/schema-std"` is declared and the package is installed
- **THEN** `SchemaRegistry.resolve()` loads it from `node_modules/@specd/schema-std/schema.yaml`

#### Scenario: Bare name resolved from default workspace

- **WHEN** `schema: "spec-driven"` is declared and `workspaces.default.schemas.fs.path` is `specd/schemas`
- **THEN** `SchemaRegistry.resolve()` loads `specd/schemas/spec-driven/schema.yaml`

#### Scenario: Hash-prefixed name resolved from default workspace

- **WHEN** `schema: "#spec-driven"` is declared
- **THEN** `SchemaRegistry.resolve()` behaves identically to the bare name form

#### Scenario: Workspace-qualified schema reference

- **WHEN** `schema: "#billing:my-billing-schema"` is declared and `workspaces.billing.schemas.fs.path` is `../billing/dev/schemas`
- **THEN** `SchemaRegistry.resolve()` loads `../billing/dev/schemas/my-billing-schema/schema.yaml`

#### Scenario: Direct path schema

- **WHEN** `schema: "./custom/schema.yaml"` is declared
- **THEN** `SchemaRegistry.resolve()` loads that file relative to the `specd.yaml` directory

#### Scenario: Schema not found

- **WHEN** the declared schema reference matches no file at the resolved location
- **THEN** specd exits with `SchemaNotFoundError` identifying the reference and the path searched

#### Scenario: Schema fails validation

- **WHEN** the schema file is found but contains structural errors (e.g. missing `name` or `version`, circular `requires`)
- **THEN** specd exits with `SchemaValidationError` describing the problem; the command does not run

#### Scenario: Schema field missing

- **WHEN** `specd.yaml` does not include a `schema` field
- **THEN** specd exits with `ConfigValidationError` on startup

#### Scenario: Schema-independent command skips resolution

- **WHEN** `specd --help` or `specd init` is run
- **THEN** `SchemaRegistry.resolve()` is not called; the command runs regardless of whether the schema is valid or even declared

### Requirement: Workspaces

#### Scenario: Default workspace only (simple project)

- **WHEN** `specd.yaml` declares only a `default` workspace with `specs.adapter: fs` and `specs.fs.path: specs/`
- **THEN** all spec paths are relative to `specs/` and there are no external workspaces

#### Scenario: specd init creates default workspace

- **WHEN** `specd init` is run in a project with no `specd.yaml`
- **THEN** a `specd.yaml` is created with a `default` workspace using `specs.adapter: fs`, `specs.fs.path: specs/`, storage paths `specd/changes` and `specd/archive`, and no other workspaces

#### Scenario: Non-default workspace resolves outside repo

- **WHEN** a workspace declares `specs.fs.path: ../other-repo/specs` which resolves outside the current git repo root
- **THEN** `RepositoryConfig.isExternal` is `true` for that workspace; no config error is emitted

#### Scenario: Non-default workspace with custom schemas path

- **WHEN** `workspaces.billing.schemas.fs.path: ../billing/dev/schemas` is declared
- **THEN** `schema: "#billing:my-schema"` resolves to `../billing/dev/schemas/my-schema/schema.yaml`

#### Scenario: Workspace-qualified schema with no schemas section declared

- **WHEN** `schema: "#billing:my-schema"` is declared and the `billing` workspace has no `schemas` section
- **THEN** specd exits with `SchemaNotFoundError` — there is no schema path configured for that workspace

#### Scenario: Workspace name collision

- **WHEN** two entries in `workspaces` use the same key
- **THEN** YAML parsing produces only one entry (last wins); `specd config validate` must warn about this pattern

#### Scenario: Missing default workspace

- **WHEN** `specd.yaml` declares a `workspaces` section but omits `default`
- **THEN** specd exits with a `ConfigValidationError`

### Requirement: Storage configuration

#### Scenario: Default storage layout

- **WHEN** `specd.yaml` uses `adapter: fs` with `fs.path: specd/changes` and `fs.path: specd/archive`
- **THEN** active changes are at `specd/changes/` and archived changes at `specd/archive/`

#### Scenario: Unknown adapter

- **WHEN** `storage.changes.adapter` is set to an unrecognised value (e.g. `"s3"`)
- **THEN** specd exits with a validation error listing supported adapters

### Requirement: Template variables

#### Scenario: Archive pattern with year prefix

- **WHEN** `storage.archive.fs.pattern` is `'{{year}}/{{change.archivedName}}'`
- **THEN** a change archived in 2024 is stored at `specd/archive/2024/<archivedName>/`

#### Scenario: Unknown template variable

- **WHEN** a template string contains `{{unknown}}`
- **THEN** the literal string `{{unknown}}` is used and a warning is emitted

### Requirement: Workflow additions

#### Scenario: Project hook appended

- **WHEN** both the schema and `specd.yaml` define hooks for `archive.post`
- **THEN** schema hooks fire first, project hooks second, within the same lifecycle point

#### Scenario: requires in project workflow entry

- **WHEN** a project-level workflow entry includes a `requires` field
- **THEN** specd must reject it with a validation error on startup

#### Scenario: Hook for skill not in schema

- **WHEN** a project-level workflow entry names a skill not declared in the schema's workflow
- **THEN** the hooks are registered for that skill; they fire if the skill is ever invoked, and a warning is emitted at startup

### Requirement: Project-level artifact rules

#### Scenario: Rules injected

- **WHEN** `artifactRules.specs` is set
- **THEN** `CompileContext` includes those strings in the compiled context for the `specs` artifact as constraints the agent must follow

#### Scenario: Unknown artifact ID

- **WHEN** `artifactRules` contains a key not matching any artifact ID in the active schema
- **THEN** specd emits a warning at startup and ignores those rules

### Requirement: Plugin declarations

#### Scenario: Plugin installed

- **WHEN** `plugins: [{ name: "@specd/plugin-claude" }]` is declared
- **THEN** `specd update` ensures the plugin's skill files and hook configuration are up to date

### Requirement: Context spec selection

#### Scenario: Project-level patterns always apply

- **WHEN** project-level `contextIncludeSpecs: ['shared:_global/*']` is declared and the current change only touches the `default` workspace
- **THEN** `CompileContext` still includes `shared:_global/*` specs — project-level patterns are not filtered by change scope

#### Scenario: Workspace-level patterns only apply when workspace is active

- **WHEN** `billing` workspace declares `contextIncludeSpecs: ['*']` and the current change touches only `default` specs
- **THEN** `CompileContext` does not include billing specs — the `billing` workspace is not active

#### Scenario: Workspace-level patterns apply when workspace is active

- **WHEN** `billing` workspace declares `contextIncludeSpecs: ['*']` and the current change touches a `billing` spec
- **THEN** `CompileContext` includes all `billing` workspace specs

#### Scenario: Qualifier omitted at workspace level resolves to that workspace

- **WHEN** inside `billing` workspace, `contextIncludeSpecs: ['payments/*']` is declared
- **THEN** `CompileContext` resolves it as `billing:payments/*`, not `default:payments/*`

#### Scenario: Default project-level include is all default workspace specs

- **WHEN** project-level `contextIncludeSpecs` is omitted
- **THEN** `CompileContext` behaves as if `contextIncludeSpecs: ['default:*']` were declared at project level

#### Scenario: Default workspace-level include is all specs in that workspace

- **WHEN** a workspace declares no `contextIncludeSpecs` and that workspace is active in the current change
- **THEN** `CompileContext` includes all specs in that workspace, as if `contextIncludeSpecs: ['*']` were declared

#### Scenario: Resolution order — project-level before workspace-level

- **WHEN** project-level includes `shared:_global/*` and `default` workspace includes `['*']`, and the change is active in `default`
- **THEN** `shared:_global/*` specs appear first in context, followed by `default:*` specs

#### Scenario: Workspace declaration order determines workspace-level priority

- **WHEN** `default` and `billing` both declare `contextIncludeSpecs: ['*']` and the change touches both, and `default` is declared first in `specd.yaml`
- **THEN** `default` specs appear before `billing` specs in context

#### Scenario: Spec matched by multiple patterns appears once

- **WHEN** project-level includes `shared:_global/*` and `default` workspace includes `['shared:_global/architecture']`, and both match the same spec
- **THEN** the spec appears once, at the position determined by the project-level pattern (first match)

#### Scenario: Project-level exclude always applied

- **WHEN** project-level `contextExcludeSpecs: ['default:drafts/*']` is declared and the change only touches `billing`
- **THEN** `drafts/*` specs are still excluded from context even though `default` is not the active workspace

#### Scenario: Workspace-level exclude only applied when workspace is active

- **WHEN** `billing` workspace declares `contextExcludeSpecs: ['drafts/*']` and the change only touches `default`
- **THEN** the billing exclude is not applied — `billing` is not active

#### Scenario: Workspace-level exclude qualifier resolves to that workspace

- **WHEN** inside `billing`, `contextExcludeSpecs: ['drafts/*']` is declared and `billing` is active
- **THEN** `billing:drafts/*` specs are excluded from context

#### Scenario: Direct include path selects only that spec

- **WHEN** `contextIncludeSpecs: ['auth/login']` is declared and both `auth/login` and `auth/register` exist in the `default` workspace
- **THEN** `CompileContext` includes `auth/login` and does not include `auth/register`

#### Scenario: Direct exclude path removes only that spec

- **WHEN** `contextIncludeSpecs: ['auth/*']` and `contextExcludeSpecs: ['auth/login']` are declared and both `auth/login` and `auth/register` exist
- **THEN** `CompileContext` includes `auth/register` but not `auth/login`

#### Scenario: Non-existent spec path silently skipped

- **WHEN** `contextIncludeSpecs: ['auth/does-not-exist']` is declared and no such spec exists on disk
- **THEN** `CompileContext` produces no error — the missing path is silently skipped

#### Scenario: Unknown workspace qualifier warns

- **WHEN** `contextIncludeSpecs: ['unknown-workspace:*']` is declared and no workspace named `unknown-workspace` exists
- **THEN** specd emits a warning at startup but does not exit

#### Scenario: Invalid pattern syntax is a startup error

- **WHEN** `contextIncludeSpecs: ['auth/*/login']` is declared (`*` in the middle of a path segment)
- **THEN** specd exits with a config validation error at startup

### Requirement: Startup validation

#### Scenario: Missing required field blocks startup

- **WHEN** `specd.yaml` is missing any required field (e.g. `schema`, `storage`, `default` workspace, `adapter` in a specs section)
- **THEN** specd exits immediately with a descriptive error before executing the requested command

#### Scenario: Invalid pattern syntax blocks startup

- **WHEN** `contextIncludeSpecs` contains an invalid pattern such as `'auth/*/login'`
- **THEN** specd exits with a config validation error at startup

#### Scenario: Storage path outside repo root blocks startup

- **WHEN** `storage.changes.fs.path` resolves to a directory outside the project repo root
- **THEN** specd exits with a config validation error at startup

#### Scenario: Warning does not block startup

- **WHEN** `specd.yaml` has an `artifactRules` key for an unknown artifact
- **THEN** a warning is printed but the command proceeds normally

#### Scenario: specd init requires no existing config

- **WHEN** `specd init` is run in a directory with no `specd.yaml`
- **THEN** specd does not attempt to validate a config — it creates one from defaults and exits successfully
