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

#### Scenario: Command-specific bootstrap mode does not redefine --config

- **GIVEN** a command family defines a bootstrap mode that can operate without loading project config
- **WHEN** the user passes `--config /path/to/specd.yaml`
- **THEN** `--config` still means an explicit config file path override
- **AND** bootstrap mode is not selected by reinterpreting `--config` as a repository root

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

#### Scenario: Missing codeRoot in non-default workspace

- **WHEN** a non-`default` workspace entry omits `codeRoot`
- **THEN** specd exits with a `ConfigValidationError` at startup

### Requirement: Workspace graph config

#### Scenario: excludePaths replaces built-in defaults

- **GIVEN** a workspace with `graph.excludePaths: ["fixtures/"]`
- **WHEN** the config is loaded
- **THEN** `SpecdWorkspaceConfig.graph.excludePaths` is `["fixtures/"]`
- **AND** the built-in defaults (`node_modules/`, `dist/`, etc.) are NOT applied — only the declared patterns are used

#### Scenario: graph block absent — no field on workspace config

- **GIVEN** a workspace with no `graph` key
- **WHEN** the config is loaded
- **THEN** `SpecdWorkspaceConfig.graph` is `undefined`
- **AND** `discoverFiles` falls back to built-in default exclusions

#### Scenario: respectGitignore defaults to true

- **GIVEN** a workspace with `graph: {}` (no `respectGitignore` key)
- **WHEN** the config is loaded
- **THEN** `SpecdWorkspaceConfig.graph.respectGitignore` is `undefined` (treated as `true` by the indexer)

#### Scenario: respectGitignore set to false

- **GIVEN** a workspace with `graph.respectGitignore: false`
- **WHEN** the config is loaded
- **THEN** `SpecdWorkspaceConfig.graph.respectGitignore` is `false`

### Requirement: Storage configuration

#### Scenario: Default storage layout

- **WHEN** `specd.yaml` uses `adapter: fs` with `fs.path: specd/changes` and `fs.path: specd/archive`
- **THEN** active changes are at `specd/changes/` and archived changes at `specd/archive/`

#### Scenario: Unknown adapter

- **WHEN** `storage.changes.adapter` is set to an unrecognised value (e.g. `"s3"`)
- **THEN** specd exits with a validation error listing supported adapters

### Requirement: Named storage adapters

#### Scenario: Workspace selects a registered named adapter

- **GIVEN** a workspace storage config sets `adapter: git`
- **AND** the merged storage registry contains a `git` storage factory
- **WHEN** the config is loaded and prepared for kernel composition
- **THEN** the selected adapter name is preserved as `git`
- **AND** the adapter-specific `git:` block is passed through as adapter-owned configuration

#### Scenario: Workspace selects an unknown adapter

- **GIVEN** a workspace storage config sets `adapter: custom-remote`
- **AND** no built-in or external storage registration provides `custom-remote`
- **WHEN** config validation or kernel composition resolves the workspace storage
- **THEN** specd fails with a clear unknown-adapter error

### Requirement: Config path and derived directories

#### Scenario: configPath defaults to repo-local config directory

- **GIVEN** `specd.yaml` omits `configPath`
- **WHEN** the config is loaded
- **THEN** `configPath` resolves to `.specd/config` relative to the config file
- **AND** the derived directories are `.specd/config/graph`, `.specd/config/tmp`, and `.specd/config/tmp/change-locks`

#### Scenario: Explicit configPath stays project-level

- **GIVEN** `specd.yaml` declares `configPath: .specd/state`
- **WHEN** the config is loaded
- **THEN** the derived directories are `.specd/state/graph`, `.specd/state/tmp`, and `.specd/state/tmp/change-locks`
- **AND** `storage.changes`, `storage.drafts`, `storage.discarded`, and `storage.archive` remain governed by the separate storage section

#### Scenario: configPath also defines change-locks directory

- **GIVEN** `configPath` is set to `.specd/config`
- **WHEN** `FsChangeRepository` needs to acquire a change lock
- **THEN** the lock file is placed under `{configPath}/tmp/change-locks/`
- **AND** not under the changes storage directory

### Requirement: Template variables

#### Scenario: Archive pattern with year prefix

- **WHEN** `storage.archive.fs.pattern` is `'{{year}}/{{change.archivedName}}'`
- **THEN** a change archived in 2024 is stored at `specd/archive/2024/<archivedName>/`

#### Scenario: Unknown template variable emits warning

- **GIVEN** a `TemplateExpander` constructed with an `onUnknown` callback
- **WHEN** a template string contains `{{unknown.variable}}`
- **THEN** the literal string `{{unknown.variable}}` is preserved in the output
- **AND** the `onUnknown` callback is called with `"unknown.variable"`

#### Scenario: Unknown variable without callback is silent

- **GIVEN** a `TemplateExpander` constructed without an `onUnknown` callback
- **WHEN** a template string contains `{{unknown.variable}}`
- **THEN** the literal string `{{unknown.variable}}` is preserved in the output
- **AND** no callback is invoked

### Requirement: Schema plugins

#### Scenario: Plugin resolved and applied

- **GIVEN** `schemaPlugins: ['@specd/plugin-rfc']` is declared and the plugin package is installed
- **WHEN** the schema is resolved
- **THEN** the plugin's operations are applied as a merge layer after the base schema's extends chain

#### Scenario: Plugin reference not found

- **WHEN** `schemaPlugins` references a plugin that cannot be resolved
- **THEN** specd exits with `SchemaNotFoundError`

#### Scenario: Plugin reference points to a full schema

- **WHEN** `schemaPlugins` references a file with `kind: schema` instead of `kind: schema-plugin`
- **THEN** specd exits with `SchemaValidationError`

### Requirement: Schema overrides

#### Scenario: Override appends rules to an artifact

- **GIVEN** `schemaOverrides.append.artifacts: [{ id: specs, rules: { post: [{ id: rfc, text: '...' }] } }]`
- **WHEN** the schema is resolved
- **THEN** the `specs` artifact's `rules.post` includes the `rfc` entry

#### Scenario: Override removes a workflow hook

- **GIVEN** `schemaOverrides.remove.workflow: [{ step: implementing, hooks: { post: [{ id: run-tests }] } }]`
- **WHEN** the schema is resolved
- **THEN** the `implementing` step no longer has the `run-tests` hook

#### Scenario: Invalid override structure rejected at startup

- **WHEN** `schemaOverrides` contains an unknown operation key (e.g. `modify`)
- **THEN** specd exits with `ConfigValidationError`

### Requirement: LLM optimization

#### Scenario: Flag absent — deterministic mode

- **GIVEN** a `specd.yaml` with no `llmOptimizedContext` field
- **WHEN** the metadata agent runs
- **THEN** it uses deterministic structural extraction only — no LLM is invoked

#### Scenario: Flag false — deterministic mode

- **GIVEN** a `specd.yaml` with `llmOptimizedContext: false`
- **WHEN** the metadata agent runs
- **THEN** it uses deterministic structural extraction only — no LLM is invoked

#### Scenario: Flag true — LLM mode

- **GIVEN** a `specd.yaml` with `llmOptimizedContext: true`
- **WHEN** the metadata agent runs
- **THEN** it invokes the LLM to produce richer metadata (descriptions, structured scenarios, dependsOn suggestions)

#### Scenario: Non-boolean value — startup error

- **WHEN** `llmOptimizedContext` is set to a non-boolean value (e.g. `"yes"`, `1`)
- **THEN** specd exits with a startup validation error

### Requirement: Plugin declarations

#### Scenario: Plugins section with agents array

- **WHEN** `specd.yaml` has a `plugins` section
- **THEN** it is validated by the config loader's Zod schema at load time

#### Scenario: Agent plugin entry

- **GIVEN** `plugins.agents` has an entry
- **THEN** each entry has `name` (required) and optional `config`

#### Scenario: Invalid plugin structure rejected at startup

- **WHEN** `specd.yaml` has `plugins.agents: [{ invalid: true }]` (missing `name`)
- **THEN** config validation fails with `ConfigValidationError`

#### Scenario: ConfigWriter.addPlugin adds to array

- **WHEN** `ConfigWriter.addPlugin(configPath, 'agents', '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is added to `plugins.agents` array

#### Scenario: ConfigWriter.addPlugin with config

- **WHEN** `ConfigWriter.addPlugin(configPath, 'agents', '@specd/plugin-agent-claude', { commandsDir: '.claude/commands' })` is called
- **THEN** the plugin entry includes both `name` and `config`

#### Scenario: ConfigWriter.removePlugin removes from array

- **WHEN** `ConfigWriter.removePlugin(configPath, 'agents', '@specd/plugin-agent-claude')` is called
- **THEN** the plugin is removed from the array

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

#### Scenario: Resolution order — project includes, project excludes, workspace includes, workspace excludes

- **GIVEN** project-level `contextIncludeSpecs: ['default:*']` and `contextExcludeSpecs: ['default:drafts/*']`
- **AND** `default` workspace declares `contextIncludeSpecs: ['*']` and the change is active in `default`
- **WHEN** `CompileContext` builds the context
- **THEN** project-level includes are accumulated first, then project-level excludes remove `default:drafts/*`, then workspace-level includes from `default` add remaining specs, in that order

#### Scenario: Project-level exclude applied before workspace-level includes

- **GIVEN** project-level `contextExcludeSpecs: ['default:auth/*']`
- **AND** `default` workspace declares `contextIncludeSpecs: ['auth/*']` and is active
- **WHEN** `CompileContext` builds the context
- **THEN** `default:auth/*` specs are excluded — the project-level exclude (step 2) fires before workspace-level includes (step 3)

#### Scenario: Project-level exclude always applied regardless of active workspace

- **WHEN** project-level `contextExcludeSpecs: ['default:drafts/*']` is declared and the change only touches `billing`
- **THEN** `drafts/*` specs are still excluded from context even though `default` is not the active workspace

#### Scenario: Workspace declaration order determines workspace-level priority

- **WHEN** `default` and `billing` both declare `contextIncludeSpecs: ['*']` and the change touches both, and `default` is declared first in `specd.yaml`
- **THEN** `default` specs appear before `billing` specs in context

#### Scenario: Spec matched by multiple patterns appears once

- **WHEN** project-level includes `shared:_global/*` and `default` workspace includes `['shared:_global/architecture']`, and both match the same spec
- **THEN** the spec appears once, at the position determined by the project-level pattern (first match)

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

#### Scenario: Non-existent spec ID silently skipped at compile time

- **WHEN** `contextIncludeSpecs: ['auth/does-not-exist']` is declared and no such spec exists on disk
- **THEN** `CompileContext` produces no error — the missing path is silently skipped

#### Scenario: Unmatched pattern warns in config validate

- **WHEN** `specd config validate` is run and a pattern in `contextIncludeSpecs` or `contextExcludeSpecs` matches no specs on disk
- **THEN** specd emits a warning identifying the pattern — the command still exits successfully

#### Scenario: Unknown workspace qualifier warns at runtime

- **WHEN** `contextIncludeSpecs: ['unknown-workspace:*']` is declared and no workspace named `unknown-workspace` exists
- **THEN** specd emits a warning at startup but does not exit — context compilation proceeds without that pattern

#### Scenario: Unknown workspace qualifier fails config validate

- **WHEN** `specd config validate` is run and a pattern contains a workspace qualifier that does not match any declared workspace
- **THEN** specd exits with an error — unknown qualifiers are treated as errors in validate to catch typos before they silently drop specs from context

#### Scenario: Workspace becomes active from change metadata

- **WHEN** a change's metadata lists specs from both the `default` workspace and the `billing` workspace
- **THEN** both workspaces are considered active and both workspace-level `contextIncludeSpecs` patterns are applied

#### Scenario: Workspace not active when absent from change metadata

- **WHEN** a change's metadata lists only `default` specs
- **THEN** the `billing` workspace is not active and its workspace-level patterns are not applied, regardless of CWD or codeRoot

#### Scenario: Invalid pattern syntax is a startup error

- **WHEN** `contextIncludeSpecs: ['auth/*/login']` is declared (`*` in the middle of a path segment)
- **THEN** specd exits with a config validation error at startup

### Requirement: Context mode

#### Scenario: contextMode summary is the default

- **GIVEN** `specd.yaml` does not declare `contextMode`
- **WHEN** config is loaded
- **THEN** `config.contextMode` defaults to `"summary"` at the use case level

#### Scenario: contextMode list is accepted

- **GIVEN** `specd.yaml` declares `contextMode: list`
- **WHEN** config is loaded
- **THEN** `config.contextMode` is `"list"`

#### Scenario: contextMode summary is accepted

- **GIVEN** `specd.yaml` declares `contextMode: summary`
- **WHEN** config is loaded
- **THEN** `config.contextMode` is `"summary"`

#### Scenario: contextMode full is accepted

- **GIVEN** `specd.yaml` declares `contextMode: full`
- **WHEN** config is loaded
- **THEN** `config.contextMode` is `"full"`

#### Scenario: contextMode hybrid is accepted

- **GIVEN** `specd.yaml` declares `contextMode: hybrid`
- **WHEN** config is loaded
- **THEN** `config.contextMode` is `"hybrid"`

#### Scenario: legacy lazy value is rejected

- **GIVEN** `specd.yaml` declares `contextMode: lazy`
- **WHEN** config is loaded
- **THEN** startup validation fails with an error identifying `lazy` as invalid

#### Scenario: contextMode inside workspace is rejected

- **GIVEN** `specd.yaml` declares `contextMode: summary` inside a workspace entry
- **WHEN** config is loaded
- **THEN** startup validation fails with an error indicating `contextMode` is project-level only

### Requirement: Startup validation

#### Scenario: Valid minimal config passes validation

- **GIVEN** a `specd.yaml` with only `schema: schema-std@1`
- **WHEN** config is validated at startup
- **THEN** validation passes with defaults applied

#### Scenario: Invalid contextMode value rejected

- **GIVEN** `specd.yaml` contains `contextMode: partial`
- **WHEN** config is validated at startup
- **THEN** validation fails with a `ConfigValidationError` identifying the invalid `contextMode` value

#### Scenario: Legacy lazy contextMode rejected

- **GIVEN** `specd.yaml` contains `contextMode: lazy`
- **WHEN** config is validated at startup
- **THEN** validation fails with a `ConfigValidationError` because lazy is no longer accepted

#### Scenario: contextMode in workspace entry rejected with specific message

- **GIVEN** `specd.yaml` contains a workspace with `contextMode: summary`
- **WHEN** config is validated at startup
- **THEN** validation fails with a `ConfigValidationError` with the message "`contextMode` is not valid inside a workspace — it is a project-level setting"

#### Scenario: artifactRules rejected at startup

- **GIVEN** `specd.yaml` contains `artifactRules: { specs: [...] }`
- **WHEN** config is validated at startup
- **THEN** validation fails with `ConfigValidationError` suggesting migration to `schemaOverrides`

#### Scenario: skills field rejected at startup

- **GIVEN** `specd.yaml` contains a `skills` field
- **WHEN** config is validated at startup
- **THEN** validation fails with `ConfigValidationError` explaining skills are managed via the plugin system

#### Scenario: Invalid level string

- **GIVEN** `specd.yaml` with `logging: { level: 'verbose' }` (not a recognized level)
- **WHEN** config is validated at startup
- **THEN** validation MUST fail with a `ConfigValidationError`

### Requirement: Project context instructions

#### Scenario: Context entries injected before spec content

- **GIVEN** `specd.yaml` declares `context: [{ instruction: "Always prefer editing existing files." }]`
- **WHEN** `CompileContext` builds the compiled context
- **THEN** the instruction appears before any spec content in the output

#### Scenario: File reference is read and injected verbatim

- **GIVEN** `specd.yaml` declares `context: [{ file: specd-bootstrap.md }]` and the file exists
- **WHEN** `CompileContext` builds the compiled context
- **THEN** the full content of `specd-bootstrap.md` is injected verbatim, before spec content

#### Scenario: Missing file emits a warning

- **GIVEN** `specd.yaml` declares `context: [{ file: does-not-exist.md }]`
- **WHEN** `CompileContext` builds the compiled context
- **THEN** a warning is emitted identifying the missing file, compilation proceeds normally, and the entry is absent from the output

#### Scenario: context absent — no effect

- **GIVEN** `specd.yaml` does not declare a `context` field
- **WHEN** `CompileContext` builds the compiled context
- **THEN** the output is identical to a config with `context: []` — no error, no warning

#### Scenario: Mixed inline and file entries preserve declaration order

- **GIVEN** `context: [{ file: AGENTS.md }, { instruction: "Inline note." }, { file: specd-bootstrap.md }]`
- **WHEN** `CompileContext` builds the compiled context
- **THEN** `AGENTS.md` content appears first, then `"Inline note."`, then `specd-bootstrap.md` content, before any spec content

#### Scenario: File path resolved relative to specd.yaml directory

- **GIVEN** `specd.yaml` is at `/project/specd.yaml` and declares `context: [{ file: docs/bootstrap.md }]`
- **WHEN** `CompileContext` resolves the file entry
- **THEN** it reads `/project/docs/bootstrap.md`

#### Scenario: Absolute file path accepted

- **GIVEN** `specd.yaml` declares `context: [{ file: /shared/instructions.md }]` and that file exists
- **WHEN** `CompileContext` resolves the file entry
- **THEN** it reads `/shared/instructions.md` directly, without resolving relative to the specd.yaml directory

### Requirement: Logging configuration

#### Scenario: Section present with all fields

- **GIVEN** a `specd.yaml` with `logging: { level: 'debug' }`
- **WHEN** the config is loaded
- **THEN** `config.logging.level` MUST be `'debug'`

#### Scenario: Section absent — defaults applied

- **GIVEN** a `specd.yaml` without a `logging` section
- **WHEN** the config is loaded
- **THEN** the logging configuration MUST use the default level `'info'`
