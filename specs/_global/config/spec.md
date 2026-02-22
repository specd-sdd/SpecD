# Project Configuration

## Overview

`specd.yaml` is the single project-level configuration file for specd. It declares which schema governs the project, where specs and changes are stored, which external spec sources are available, per-scope code root overrides, project-level workflow hooks, per-artifact constraints, and installed plugins. Every tool in the specd ecosystem reads this file — the CLI, MCP server, and plugins all derive their wiring from it.

## Requirements

### Requirement: Config file location and format

`specd.yaml` must be a valid YAML file. specd discovers it using the following strategy, in order:

1. **`--config` flag** — if the CLI is invoked with `--config path/to/specd.yaml`, that path is used directly; no discovery takes place.
2. **Walk up from CWD, bounded by the git repo root** — specd walks up from the current working directory, checking each directory for `specd.yaml`. The walk stops at the git repo root (the nearest ancestor directory containing `.git/`). If no `specd.yaml` is found before or at the repo root, specd exits with an error.
3. **CWD only, when not inside a git repo** — if no `.git/` ancestor exists (e.g. the user is running specd from outside any repository, as in a coordinator script), specd checks only the current working directory and stops there. It does not walk further up.

The search never goes above the git repo root. This prevents accidentally picking up a `specd.yaml` from a parent repository in nested or sibling monorepo layouts.

#### Scenario: Config found inside repo

- **WHEN** the user runs any specd command from inside a git repository containing `specd.yaml` at the repo root
- **THEN** specd uses that file, regardless of the current working directory depth within the repo

#### Scenario: Config not found inside repo

- **WHEN** the user runs any specd command inside a git repository and no `specd.yaml` exists between the CWD and the repo root
- **THEN** specd exits with an error explaining that `specd.yaml` was not found and pointing to `specd init`

#### Scenario: Invoked outside a git repo

- **WHEN** the user runs specd from a directory that is not inside any git repository
- **THEN** specd checks only the current working directory for `specd.yaml` and exits with an error if not found there

#### Scenario: Explicit config flag

- **WHEN** `specd --config /path/to/specd.yaml <command>` is invoked
- **THEN** specd uses the specified file and skips all discovery logic

### Requirement: Local config override

Alongside `specd.yaml`, developers may place a `specd.local.yaml` file in the same directory to use a fully independent local configuration. When `specd.local.yaml` is present, specd uses it exclusively — `specd.yaml` is not read and no merging takes place. The local file is a complete, self-contained config that must be valid on its own.

The file is optional — its absence is normal. `specd init` must add `specd.local.yaml` to the project's `.gitignore` so it is never committed.

The typical workflow for local customisation is: copy `specd.yaml` to `specd.local.yaml`, then edit the copy. This keeps the mental model simple — there is always exactly one active config file.

When the CLI is invoked with `--config path/to/specd.yaml`, specd looks for `specd.local.yaml` in the same directory as the specified file and uses it if present.

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

`specd.yaml` must declare a `schema` field naming the schema that governs this project. The field is required — specd cannot start without it.

```yaml
schema: "@specd/schema-std"   # npm-distributed schema
# or:
schema: "my-team-schema"       # project-local or user-global schema
```

The value is a plain name — no version pinning, no path. Version selection is handled by npm or by placing a specific version in the project-local schemas directory. `SchemaRegistry.resolve()` receives the name verbatim and applies the three-level lookup defined in `specs/_global/schema-format/spec.md`.

Schema resolution happens eagerly at startup, before any command is executed. A schema that cannot be resolved or fails structural validation causes specd to exit immediately. This ensures that all commands operate against a valid, fully-parsed schema.

#### Scenario: npm-distributed schema

- **WHEN** `schema: "@specd/schema-std"` is declared and the package is installed
- **THEN** `SchemaRegistry.resolve("@specd/schema-std")` finds it under `node_modules/` and returns the parsed schema

#### Scenario: Project-local schema

- **WHEN** `schema: "my-team-schema"` is declared and `specd/schemas/my-team-schema/schema.yaml` exists
- **THEN** the project-local version is used and takes precedence over any npm-installed version with the same name

#### Scenario: Schema not found

- **WHEN** the declared schema name matches nothing in any lookup level
- **THEN** specd exits with a `SchemaNotFoundError` listing the name and the locations that were searched

#### Scenario: Schema fails validation

- **WHEN** the schema file is found but contains structural errors (e.g. missing `name`, circular `requires`)
- **THEN** specd exits with a `SchemaValidationError` describing the problem before any command runs

#### Scenario: Schema field missing

- **WHEN** `specd.yaml` does not include a `schema` field
- **THEN** specd exits with a validation error on startup

### Requirement: Schema lookup path

`specd.yaml` may include a `schemas` section configuring the project-local directory for schema files. This controls only the first lookup level; user-global and npm lookup levels are fixed and require no configuration.

```yaml
schemas:
  path: specd/schemas # default; relative to specd.yaml location
```

When omitted, `specd/schemas` is used as the default. If the configured directory does not exist, that lookup level is silently skipped — it is not an error. Only when none of the three levels yields a match does resolution fail.

#### Scenario: Default path used

- **WHEN** `schemas` is omitted from `specd.yaml`
- **THEN** `SchemaRegistry` searches `specd/schemas/<name>/schema.yaml` as the project-local level

#### Scenario: Custom path

- **WHEN** `schemas.path: team/schemas` is set
- **THEN** `SchemaRegistry` searches `team/schemas/<name>/schema.yaml` as the project-local level

#### Scenario: Configured directory does not exist

- **WHEN** `schemas.path` points to a directory that does not exist on disk
- **THEN** the project-local lookup level yields no results and resolution continues to the next level; no error is emitted

### Requirement: Storage configuration

`specd.yaml` must include a `storage` section with sub-keys for `specs`, `changes`, and `archive`. Each sub-key declares the storage adapter and its configuration for that data type.

```yaml
storage:
  specs:
    adapter: fs
    path: specd/specs

  changes:
    adapter: fs
    path: specd/changes

  archive:
    adapter: fs
    path: specd/archive
    pattern: '{{change.archivedName}}' # optional; default: "{{change.archivedName}}"
```

`adapter` and `path` are required per sub-key. Unknown adapter values must produce a validation error.

#### Scenario: Default storage layout

- **WHEN** `specd.yaml` uses the paths shown above
- **THEN** specs are at `specd/specs/`, active changes at `specd/changes/`, and archived changes at `specd/archive/`

#### Scenario: Unknown adapter

- **WHEN** `storage.specs.adapter` is set to an unrecognised value (e.g. `"s3"`)
- **THEN** specd exits with a validation error listing supported adapters

### Requirement: Schema lookup path

`specd.yaml` may include a `schemas` section to set the project-local directory where schema files are searched before user-global and npm locations.

```yaml
schemas:
  path: specd/schemas # default; relative to project root
```

When omitted, the default is `specd/schemas`. See `specs/_global/schema-format/spec.md` for the full three-level resolution order.

#### Scenario: Custom schema path

- **WHEN** `schemas.path` is set to `team/schemas`
- **THEN** `SchemaRegistry.resolve()` searches `team/schemas/<name>/schema.yaml` first

### Requirement: External scopes

`specd.yaml` may declare external spec sources under `externalScopes`. Each key is an alias that becomes the namespace prefix for all `SpecPath` values originating from that source. Aliases must be unique and must not collide with any local scope prefix.

```yaml
externalScopes:
  auth-lib: # alias = SpecPath namespace prefix
    path: ../auth-lib/specs # path to the external specs directory
    ownership: readOnly # readOnly | shared | owned (default: readOnly)
    codeRoot: ../auth-lib # where the implementation code lives (default: path)

  shared:
    path: ../company-shared/specs
    # ownership defaults to readOnly
    # codeRoot defaults to path value
```

A spec at `../auth-lib/specs/oauth/spec.md` is addressable as `auth-lib/oauth` from within the project. The alias is always the first segment.

`ownership` for external scopes defaults to `readOnly`. Setting it to `shared` or `owned` signals that the project can propose changes upstream — tooling may use this to unlock additional approval flows.

`codeRoot` for an external scope identifies where the implementation code for those specs lives. When absent, it defaults to the resolved `path` value (the spec directory itself, which is likely wrong for most cases — prefer declaring it explicitly).

#### Scenario: External scope referenced

- **WHEN** `externalScopes: { auth-lib: { path: ../auth-lib/specs } }` is declared
- **THEN** `SpecRepository` for the `auth-lib` scope is instantiated with `isExternal: true`, `ownership: readOnly`, and the resolved path
- **AND** specs from that source are addressable as `auth-lib/<original-path>`

#### Scenario: Alias collision with local scope

- **WHEN** an `externalScopes` alias matches the first segment of a local spec path (e.g. alias `auth` and local spec at `specd/specs/auth/oauth/spec.md`)
- **THEN** specd must exit with a validation error identifying the collision

#### Scenario: Duplicate alias

- **WHEN** two entries in `externalScopes` use the same alias key
- **THEN** YAML parsing produces only one entry (last wins), which is a configuration mistake; `specd validate-config` must warn about this pattern

### Requirement: Local scope overrides

`specd.yaml` may include a `scopes` section to override `codeRoot` and `ownership` for local scope prefixes. Each key is the first segment of a `SpecPath` that identifies the scope.

```yaml
scopes:
  auth:
    codeRoot: ../auth-service/src # where code for auth specs lives
    ownership: owned # default for local scopes

  payments:
    codeRoot: ../payments-service/src
```

When a scope has no entry in `scopes`, it inherits the project-level `codeRoot` and `ownership: owned`.

`RepositoryConfig.isExternal` is always `false` for scopes declared here. `isExternal: true` is exclusively for `externalScopes`.

#### Scenario: Coordinator pattern

- **WHEN** a coordinator repository declares scopes with different `codeRoot` values
- **THEN** `specd ctx` includes the applicable `codeRoot` in the compiled instruction block so the agent knows where to write implementation code

#### Scenario: Scope with no override

- **WHEN** a spec path begins with a segment not listed in `scopes`
- **THEN** the scope inherits `codeRoot: <project root>` and `ownership: owned`

### Requirement: Project-level code root

`specd.yaml` may declare a top-level `codeRoot` as the default for all scopes not overridden in `scopes` or `externalScopes`.

```yaml
codeRoot: ./ # default; relative to specd.yaml location
```

When omitted, `codeRoot` defaults to the git repository root (the directory containing `specd.yaml`).

#### Scenario: Default code root

- **WHEN** `codeRoot` is not set in `specd.yaml` and a scope has no override
- **THEN** the code root for that scope is the repository root

#### Scenario: Explicit global code root

- **WHEN** `codeRoot: ./src` is set at the top level
- **THEN** all scopes without a specific override use `./src` as their code root

### Requirement: Path resolution

All relative paths in `specd.yaml` — including `storage.specs.path`, `externalScopes[*].path`, `scopes[*].codeRoot`, and `codeRoot` — are resolved relative to the directory containing `specd.yaml` (the repository root). Absolute paths are accepted only when `allowExternalPaths: true` is set on the relevant section.

```yaml
storage:
  specs:
    adapter: fs
    path: specd/specs
    allowExternalPaths: false # default
```

`allowExternalPaths` defaults to `false`. When `false`, paths that resolve outside the repository root are rejected with a validation error. External scope paths (`externalScopes[*].path`) always require `allowExternalPaths: true` on the `externalScopes` section, or are allowed unconditionally (since external scopes are explicitly declared to be outside the repo).

#### Scenario: Relative path within repo

- **WHEN** `storage.specs.path: specd/specs` is set
- **THEN** the resolved path is `<repo-root>/specd/specs`

#### Scenario: Path outside repo without flag

- **WHEN** `storage.changes.path: ../shared-changes` is set without `allowExternalPaths: true`
- **THEN** specd must exit with a validation error

#### Scenario: External scope path always allowed

- **WHEN** `externalScopes.auth-lib.path: ../auth-lib/specs` points outside the repo
- **THEN** it is allowed without requiring `allowExternalPaths` — the `externalScopes` declaration itself is the explicit opt-in

### Requirement: Workflow additions

`specd.yaml` may include a `workflow` section to add project-level hooks to skill lifecycle points. Entries are matched to schema workflow entries by `skill` name; schema hooks fire first, then project hooks. `requires` is not valid in project-level workflow entries and must be rejected.

```yaml
workflow:
  - skill: archive
    hooks:
      post:
        - run: 'pnpm run notify-team'
        - run: 'git checkout -b specd/{{change.name}}'
  - skill: apply
    hooks:
      pre:
        - instruction: |
            Prefer editing existing files over creating new ones.
```

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

`specd.yaml` may include an `artifactRules` section to add per-artifact constraints without forking the schema. Keys are artifact IDs; values are arrays of constraint strings. `CompileContext` injects them as a distinct block in the compiled instruction, after the schema's instruction.

```yaml
artifactRules:
  specs:
    - 'All requirements must reference the relevant RFC number'
    - 'Scenarios must use WHEN/THEN/AND format'
  design:
    - 'Architecture decisions must reference an ADR'
```

Keys are validated against the active schema's artifact IDs at startup. Unknown keys emit a warning but do not prevent startup.

#### Scenario: Rules injected

- **WHEN** `artifactRules.specs` is set
- **THEN** `CompileContext` includes those strings in the compiled context for the `specs` artifact as constraints the agent must follow

#### Scenario: Unknown artifact ID

- **WHEN** `artifactRules` contains a key not matching any artifact ID in the active schema
- **THEN** specd emits a warning at startup and ignores those rules

### Requirement: Plugin declarations

`specd.yaml` may include a `plugins` section declaring which agent-integration plugins are installed. Each entry must include `name`; `options` is plugin-specific and optional.

```yaml
plugins:
  - name: '@specd/plugin-claude'
  - name: '@specd/plugin-copilot'
    options:
      commandsDir: .github/copilot/instructions
```

Plugin declarations are used by `specd init`, `specd plugin add`, and `specd update` to install and maintain the plugin's skill files and hooks in the project. They do not affect schema resolution, storage, or context compilation.

#### Scenario: Plugin installed

- **WHEN** `plugins: [{ name: "@specd/plugin-claude" }]` is declared
- **THEN** `specd update` ensures the plugin's skill files and hook configuration are up to date

### Requirement: Startup validation

specd must validate `specd.yaml` before executing any command. Validation must catch: missing `schema`, unknown storage adapters, duplicate external scope aliases, `requires` in project workflow entries, and paths outside the repo without `allowExternalPaths`. Warnings (not errors) are emitted for: unknown `artifactRules` keys, and project workflow entries for skills not in the schema.

#### Scenario: Invalid config blocks startup

- **WHEN** `specd.yaml` has a validation error (e.g. missing `schema`, unknown adapter)
- **THEN** specd exits immediately with a descriptive error before executing the requested command

#### Scenario: Warning does not block startup

- **WHEN** `specd.yaml` has an `artifactRules` key for an unknown artifact
- **THEN** a warning is printed but the command proceeds normally

## Constraints

- `schema` is required — specd cannot start without a schema reference
- `specd.local.yaml` is always `.gitignored`; `specd init` must add it automatically
- When `specd.local.yaml` is present it is the sole active config — `specd.yaml` is not read
- `specd.local.yaml` must be a complete, valid config on its own; partial overrides are not supported
- `externalScopes` aliases must be unique within the file and must not match the first segment of any local spec path
- `requires` is not valid in project-level `workflow` entries
- Relative paths resolve from the `specd.yaml` directory; paths outside the repo root require `allowExternalPaths: true` (external scope paths are unconditionally allowed)
- `ownership` values are limited to `readOnly`, `shared`, and `owned`
- Local scopes (`scopes`) always have `isExternal: false`; external scopes (`externalScopes`) always have `isExternal: true`
- `codeRoot` for external scopes should be declared explicitly — the default (the spec path) is rarely the correct code location

## Examples

### Single-repo project (minimal config)

```yaml
schema: '@specd/schema-std'

storage:
  specs:
    adapter: fs
    path: specd/specs
  changes:
    adapter: fs
    path: specd/changes
  archive:
    adapter: fs
    path: specd/archive
```

### Coordinator repo managing multiple service repos

```yaml
schema: '@specd/schema-std'

storage:
  specs:
    adapter: fs
    path: specd/specs
  changes:
    adapter: fs
    path: specd/changes
  archive:
    adapter: fs
    path: specd/archive
    pattern: '{{year}}/{{change.archivedName}}'

scopes:
  auth:
    codeRoot: ../auth-service
  payments:
    codeRoot: ../payments-service
  notifications:
    codeRoot: ../notifications-service

workflow:
  - skill: archive
    hooks:
      post:
        - run: 'git -C {{codeRoot}} checkout -b specd/{{change.name}}'
```

### Project consuming external specs (read-only)

```yaml
schema: '@specd/schema-std'

storage:
  specs:
    adapter: fs
    path: specd/specs
  changes:
    adapter: fs
    path: specd/changes
  archive:
    adapter: fs
    path: specd/archive

externalScopes:
  platform:
    path: ../platform-repo/specs
    codeRoot: ../platform-repo

artifactRules:
  specs:
    - 'All requirements must reference the platform contract they satisfy'
```

## Spec Dependencies

- [`specs/_global/schema-format/spec.md`](../schema-format/spec.md) — schema structure and resolution order
- [`specs/_global/architecture/spec.md`](../architecture/spec.md) — port and adapter design
- [`specs/core/storage/spec.md`](../../core/storage/spec.md) — storage adapter behavior

## ADRs

_none_
