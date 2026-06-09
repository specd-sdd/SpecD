# specd.yaml Configuration Reference

`specd.yaml` is the single project-level configuration file for SpecD. It is read by the CLI, the MCP server, agent plugins, and the Studio HTTP API — every tool in the SpecD ecosystem derives its wiring from it.

For annotated, scenario-based examples see the [`examples/`](examples/) directory.

## Overview

Every SpecD project has exactly one active configuration file at a time. Normally that file is `specd.yaml`. Developers can create a `specd.local.yaml` alongside it as a complete local override — when it is present, SpecD uses it exclusively and ignores `specd.yaml` entirely. The local file is never merged or layered; it must be a valid, self-contained config on its own.

`specd project init` adds `specd.local.yaml` to `.gitignore` automatically. The file is intentionally not committed — it is for local experimentation and developer-specific overrides only.

## File discovery

SpecD locates its configuration using the following strategy, in order:

1. **`--config` flag** — if the CLI is invoked with `--config path/to/specd.yaml`, that exact file is used. No discovery takes place and no `specd.local.yaml` lookup is performed.
2. **Walk up from CWD, bounded by the git repo root** — SpecD walks up from the current working directory, checking each directory for `specd.local.yaml` first, then `specd.yaml`. The walk stops at the first match or at the git repo root (the nearest ancestor containing `.git/`), whichever comes first. If no config is found, SpecD exits with an error.
3. **CWD only, when not inside a git repo** — if no `.git/` ancestor exists, SpecD checks only the current working directory and stops there.

The walk never crosses the git repo root. In a monorepo where each package has its own `specd.yaml`, the package-level file is used when running SpecD from within that package — the root-level file is not considered.

## Bootstrap mode exceptions

Some `graph` CLI commands also support a repository bootstrap mode for code-graph bootstrapping before a project has been configured:

- `--path <repo-root>` forces bootstrap mode and is mutually exclusive with `--config`
- when no config is discovered, those commands fall back to bootstrap mode automatically

In bootstrap mode, SpecD behaves as if the repository were a single synthetic `default` workspace with `codeRoot` set to the VCS root. Any discovered `specd.yaml` is ignored when `--path` is provided explicitly.

Bootstrap mode is intended for initial indexing and exploratory graph queries. It is not the normal production mode for configured projects. Once a repository has a `specd.yaml`, standard configured execution should be preferred.

## Top-level fields

| Field                 | Type    | Required | Default           | Description                                                                                                          |
| --------------------- | ------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `configPath`          | string  | no       | `.specd/config`   | Root directory for specd-owned runtime state such as graph backends and graph temp files.                            |
| `schema`              | string  | yes      | —                 | Schema reference. See [`schema`](#schema).                                                                           |
| `workspaces`          | object  | yes      | —                 | Workspace declarations. Must include `default`.                                                                      |
| `storage`             | object  | yes      | —                 | Storage paths for changes, drafts, discarded, and archive.                                                           |
| `actorProvider`       | string  | no       | —                 | Forced actor provider name (e.g. `'git'`, `'ldap'`). Bypasses auto-detection. See [`actorProvider`](#actorprovider). |
| `privacy`             | object  | no       | —                 | Identity obfuscation settings. See [`privacy`](#privacy).                                                            |
| `context`             | array   | no       | `[]`              | Additional content injected into compiled context before spec content.                                               |
| `contextIncludeSpecs` | array   | no       | —                 | Spec patterns always included in compiled context. When absent, no project-level include patterns are applied.       |
| `contextExcludeSpecs` | array   | no       | —                 | Spec patterns always excluded from compiled context.                                                                 |
| `contextMode`         | string  | no       | `'summary'`       | Context rendering mode: `'list'`, `'summary'`, `'full'`, or `'hybrid'`. See [`contextMode`](#contextmode).           |
| `approvals`           | object  | no       | both `false`      | Approval gate configuration.                                                                                         |
| `logging`             | object  | no       | `level: info`     | Project-level logging configuration.                                                                                 |
| `llmOptimizedContext` | boolean | no       | `false`           | Opt in to LLM-enriched context operations.                                                                           |
| `plugins`             | object  | no       | —                 | Installed plugins grouped by type (`agents`, `ui`).                                                                  |
| `api`                 | object  | no       | see [`api`](#api) | HTTP API settings for `specd serve` and `specd ui serve`.                                                            |
| `schemaPlugins`       | array   | no       | `[]`              | Schema plugin references loaded and merged into the active schema.                                                   |
| `schemaOverrides`     | object  | no       | —                 | Inline schema override operations applied after plugins. See [`schemaOverrides`](#schemaoverrides).                  |
| `invalidationPolicy`  | string  | no       | `'downstream'`    | Default policy for automatic and manual artifact invalidation. See [`invalidationPolicy`](#invalidationpolicy).      |

## Environment overrides

SpecD natively supports environment variables to override root-level configuration settings. These variables are loaded from the system environment and `.env` / `.env.local` files in the project root.

| Variable               | Mapping               | Description                                 |
| ---------------------- | --------------------- | ------------------------------------------- |
| `SPECD_ACTOR_PROVIDER` | `actorProvider`       | Forced provider name.                       |
| `SPECD_PRIVACY_MODE`   | `privacy.mode`        | Privacy mode (`hash`, `mask`, `anonymous`). |
| `SPECD_PRIVACY_SALT`   | `privacy.salt`        | HMAC salt for hashing.                      |
| `SPECD_LOG_LEVEL`      | `logging.level`       | Minimum log level.                          |
| `SPECD_CONTEXT_MODE`   | `contextMode`         | Context rendering mode.                     |
| `SPECD_LLM_OPTIMIZED`  | `llmOptimizedContext` | Boolean (`true`/`false`).                   |
| `SPECD_SCHEMA`         | `schemaRef`           | Active schema reference.                    |

Environment variables (including those from `.env.local`) always take precedence over values in `specd.yaml` and `specd.local.yaml`.

## schema

The `schema` field identifies the schema that governs this project. It is required — SpecD cannot start without it. Only one schema is active per project at a time.

The value uses a prefix convention that determines exactly where SpecD looks:

| Value                            | Resolves from                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `'@specd/schema-std'`            | npm package — `node_modules/@specd/schema-std/schema.yaml`                       |
| `'spec-driven'`                  | Bare name — default workspace's `schemas.fs.path/spec-driven/schema.yaml`        |
| `'#spec-driven'`                 | Hash prefix — equivalent to bare name, resolves from `default` workspace         |
| `'#billing:my-schema'`           | Workspace-qualified — `workspaces.billing.schemas.fs.path/my-schema/schema.yaml` |
| `'./schemas/custom/schema.yaml'` | Relative path from the `specd.yaml` directory                                    |
| `'/absolute/path/schema.yaml'`   | Absolute path                                                                    |

Schema resolution happens at command dispatch time, immediately before the command body executes. Commands that do not require the schema — `--help`, `--version`, `specd project init`, `specd config validate`, and `specd plugin` subcommands — skip resolution entirely.
schema resolution entirely.

```yaml
# npm package (most common)
schema: '@specd/schema-std'

# local schema stored in .specd/schemas/my-workflow/schema.yaml
schema: 'my-workflow'

# schema from a specific workspace's schemas directory
schema: '#billing:billing-schema'

# direct path
schema: './schemas/custom/schema.yaml'
```

## actorProvider

`actorProvider` forces SpecD to use a specific identity provider, bypassing the default auto-detection logic (which normally probes for VCS repositories like Git).

```yaml
actorProvider: git
```

This is useful when multiple providers might apply or when using a custom identity plugin. This field can be overridden by the `SPECD_ACTOR_PROVIDER` environment variable.

## privacy

`privacy` configures how actor identities are obfuscated before being stored in change manifests and archives. This is recommended for projects in public repositories.

```yaml
privacy:
  mode: hash
  salt: 'optional-salt'
  excludeActors:
    - 'specd'
    - 'system@getspecd.dev'
  allowedMetadataKeys:
    - 'dept'
```

### Privacy fields

| Field                 | Type   | Required | Default                            | Description                                                                                                  |
| --------------------- | ------ | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `mode`                | string | yes      | —                                  | Obfuscation mode: `'hash'`, `'mask'`, or `'anonymous'`.                                                      |
| `salt`                | string | no       | —                                  | Secret salt for `'hash'` mode. **Required** when `mode: hash`. Recommended via `SPECD_PRIVACY_SALT` env var. |
| `excludeActors`       | array  | no       | `['specd', 'system@getspecd.dev']` | List of actor names or emails to keep verbatim. Case-insensitive.                                            |
| `allowedMetadataKeys` | array  | no       | `[]`                               | Whitelist of metadata keys to preserve. All other metadata and `providerId` are removed under privacy modes. |

## configPath

`configPath` defines the root directory where SpecD stores runtime-owned project data that does not belong in the workflow `storage` lifecycle directories. The path is resolved relative to the directory containing `specd.yaml`.

When omitted, it defaults to `.specd/config`.

```yaml
configPath: .specd/config
```

The code-graph subsystem derives its backend-owned paths from this root:

- graph database files live under `{configPath}/graph`
- graph scratch and staged files live under `{configPath}/tmp`

`configPath` must remain within the repository root.

## workspaces

`workspaces` declares where specs live, where implementation code lives, and what relationship the project has with each set of specs. Every config must contain a `default` workspace. Additional workspaces reference external repos or sub-directories.

Workspace names must match `/^[a-z][a-z0-9-]*$/`. The name `default` is reserved for the local project workspace.

### Workspace fields

| Field                 | Required        | Default   | Description                                                                                                           |
| --------------------- | --------------- | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `specs`               | yes             | —         | Where this workspace's spec files live.                                                                               |
| `specs.adapter`       | yes             | —         | Storage adapter name. Built-in kernels provide `fs`; external adapters may be registered at kernel construction time. |
| `specs.<adapter>`     | yes             | —         | Adapter-owned config block. For `fs`, this is `fs.path`.                                                              |
| `schemas`             | no              | see below | Where named local schemas for this workspace are stored.                                                              |
| `schemas.adapter`     | yes if declared | —         | Storage adapter name for schemas.                                                                                     |
| `schemas.<adapter>`   | yes if declared | —         | Adapter-owned config block. For `fs`, this is `fs.path`.                                                              |
| `codeRoot`            | no / yes        | see below | Directory where implementation code lives.                                                                            |
| `ownership`           | no              | see below | Relationship this project has with specs in this workspace.                                                           |
| `contextIncludeSpecs` | no              | `['*']`   | Spec patterns included when this workspace is active.                                                                 |
| `contextExcludeSpecs` | no              | `[]`      | Spec patterns excluded when this workspace is active.                                                                 |

**`schemas`** — for the `default` workspace, if omitted, defaults to `adapter: fs` with `fs.path: .specd/schemas`. For non-`default` workspaces, omitting it means no local schemas — schema references targeting that workspace produce an error.

**`codeRoot`** — for the `default` workspace, defaults to the project root (the directory containing `specd.yaml`). For non-`default` workspaces, `codeRoot` is required — there is no sensible default.

**`ownership`** — the relationship this project has with specs in this workspace:

| Value      | Meaning                                                     | Default for              |
| ---------- | ----------------------------------------------------------- | ------------------------ |
| `owned`    | This project owns these specs; changes are freely proposed. | `default` workspace      |
| `shared`   | Co-owned; changes may require coordination.                 | —                        |
| `readOnly` | This project reads but does not modify these specs.         | Non-`default` workspaces |

```yaml
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    schemas: # optional — defaults to .specd/schemas
      adapter: fs
      fs:
        path: .specd/schemas
    codeRoot: ./ # optional for default — project root is the default
    ownership: owned # optional for default — owned is the default

  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    codeRoot: ../billing # required for non-default workspaces
    ownership: readOnly # optional — readOnly is the default for non-default
```

### Context spec selection

`contextIncludeSpecs` and `contextExcludeSpecs` can be declared at two levels:

- **Project level** (top-level in `specd.yaml`) — patterns are always applied, regardless of which workspaces the current change touches. Use this for specs that must always be in context: global constraints, cross-cutting architecture specs, shared external specs.
- **Workspace level** (inside a workspace entry) — patterns are applied only when that workspace is active in the current change. A workspace is active when at least one of its specs is listed in the change's metadata.

**Pattern syntax:**

| Pattern               | At project level                                 | At workspace level                               |
| --------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `*`                   | All specs in all workspaces                      | All specs in this workspace                      |
| `workspace:*`         | All specs in the named workspace                 | All specs in the named workspace                 |
| `prefix/*`            | All specs under `prefix/` in `default`           | All specs under `prefix/` in this workspace      |
| `workspace:prefix/*`  | All specs under `prefix/` in the named workspace | All specs under `prefix/` in the named workspace |
| `path/name`           | Exact spec in `default`                          | Exact spec in this workspace                     |
| `workspace:path/name` | Exact spec in the named workspace                | Exact spec in the named workspace                |

`*` may only appear in three positions: alone (`*`), as `workspace:*`, or as a path suffix (`prefix/*`). Any other position is a startup error.

At project level, omitting the workspace qualifier is equivalent to `default:`. At workspace level, omitting it means the declaring workspace itself.

**Resolution order** — `CompileContext` assembles context in this sequence:

1. Project-level `context` entries (always first)
2. Project-level `contextIncludeSpecs` patterns (always applied)
3. Project-level `contextExcludeSpecs` patterns (always applied)
4. Workspace-level include patterns from each active workspace
5. Workspace-level exclude patterns from each active workspace
6. Specs reachable via `dependsOn` traversal — these are never removed by exclude rules

A spec matched by multiple include patterns appears only once, at the position of the first match.

## storage

`storage` declares where SpecD persists changes during their lifecycle. All four sub-keys are required.

```yaml
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes

  drafts:
    adapter: fs
    fs:
      path: .specd/drafts

  discarded:
    adapter: fs
    fs:
      path: .specd/discarded

  archive:
    adapter: fs
    fs:
      path: .specd/archive
      pattern: '{{change.archivedName}}' # optional; this is the default
```

| Sub-key     | Description                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------- |
| `changes`   | Active changes currently in progress.                                                       |
| `drafts`    | Shelved changes not ready for active development. Can be restored to `changes` at any time. |
| `discarded` | Permanently abandoned changes. Cannot be recovered.                                         |
| `archive`   | Completed changes after archiving. Permanent record.                                        |

`specd project init` adds `.specd/drafts/` and `.specd/discarded/` to `.gitignore` by default. Teams that want to commit drafts and discarded changes can opt out by removing those entries.

All relative paths resolve from the `specd.yaml` directory. Storage paths must remain within the repo root.

The built-in `fs` adapter resolves `path` values to absolute paths during config loading. Non-`fs` adapter blocks are preserved opaquely in `SpecdConfig` and validated later during kernel construction, because external storage factories are only known once additive kernel registries are available.

### Named adapter bindings

Every workspace and storage declaration preserves two pieces of information into the resolved `SpecdConfig`:

- the selected adapter name
- the adapter-owned config block

For `fs`, the loader also resolves `path` to an absolute path and keeps the legacy `*Path` fields populated for backward compatibility. For non-`fs` adapters, the opaque config block is passed through unchanged and the kernel validates the adapter name against the merged storage registry when it is constructed.

### Archive pattern

The `storage.archive.fs.pattern` field controls the directory name given to each archived change. It supports template variable interpolation:

| Variable                  | Value                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| `{{change.archivedName}}` | Full archived directory name — e.g. `2024-01-15-add-auth-flow` (default) |
| `{{change.name}}`         | The change's slug name — e.g. `add-auth-flow`                            |
| `{{change.workspace}}`    | The primary workspace of the change                                      |
| `{{year}}`                | Four-digit year at archive time — e.g. `2024`                            |
| `{{date}}`                | ISO date at archive time — e.g. `2024-01-15`                             |

```yaml
# organise archives by year
pattern: '{{year}}/{{change.archivedName}}'

# organise by workspace, then name
pattern: '{{change.workspace}}/{{change.archivedName}}'
```

Unknown variables are left as-is and a warning is emitted.

## context

`context` injects additional freeform content into the compiled context before any spec content. Each entry is either an inline instruction or a reference to an external file.

```yaml
context:
  - file: specd-bootstrap.md # path relative to specd.yaml
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files over creating new ones.'
```

Each item must have exactly one key: `file` or `instruction`.

- **`file`** — the file is read at compile time and its content injected verbatim. Paths are relative to the `specd.yaml` directory; absolute paths are also accepted. If the file does not exist at compile time, SpecD emits a warning and skips the entry — it does not abort.
- **`instruction`** — a string injected verbatim as a context block.

Entries are prepended to the compiled context in declaration order, before any spec content. File content is not parsed or transformed — markdown, plain text, and any other format are treated as opaque strings.

## plugins

`plugins` declares installed plugins grouped by type. The config loader validates
this structure at startup.

```yaml
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-codex'
      config:
        commandsDir: .codex/commands
  ui:
    - name: '@specd/plugin-ui-studio'
```

### `plugins.agents`

Each entry requires `name` and may include `config` (plugin-specific). Agent plugins install skills and agent integrations via `specd plugins install`.

### `plugins.ui`

Each entry requires `name` and may include `config`. UI plugins power SpecD Studio (`specd ui serve`).

- **`specd ui serve`** uses the **first** `plugins.ui` entry only.
- Install UI plugins with `specd plugins install @specd/plugin-ui-studio` or `specd plugins install @specd/studio-web` — prefer the CLI over hand-editing this list.
- Packages must ship `specd-plugin.json` with `"pluginType": "ui"`.
- **Bundle plugins** (for example `@specd/plugin-ui-studio`) declare `"staticDir"` and are served from the API origin.
- **Server plugins** (for example `@specd/studio-web`) run a separate dev server; the CLI merges their origin into API CORS and passes `apiBaseUrl` at init.

See [Studio getting started](../studio/getting-started.md).

Unknown plugin bucket keys are rejected at startup validation.

## api

`api` configures the Studio HTTP API started by `specd serve` and `specd ui serve`. When omitted from YAML, SpecD still applies defaults (`auth.type: disabled`, no extra CORS origins).

```yaml
api:
  auth:
    type: disabled
  cors:
    origins:
      - http://127.0.0.1:5174
```

### `api.auth`

| Field    | Type   | Required | Description                                     |
| -------- | ------ | -------- | ----------------------------------------------- |
| `type`   | string | yes      | v1 allows only `disabled`.                      |
| `config` | object | no       | Reserved for future verifier-specific settings. |

Bearer or JWT auth is planned for remote deployments; v1 local Studio runs with auth disabled on loopback.

### `api.cors`

| Field     | Type            | Required | Description                                                             |
| --------- | --------------- | -------- | ----------------------------------------------------------------------- |
| `origins` | array of string | no       | Additional allowed `Origin` values for browser clients calling the API. |

Loopback API defaults do not require CORS for same-origin bundle UIs. Server UI plugins and standalone web apps need their UI origin listed here and/or merged automatically by `specd ui serve`.

## approvals

`approvals` configures which lifecycle gates require explicit human approval before the change can progress. Both gates are disabled by default — teams opt in to the level of governance they need.

```yaml
approvals:
  spec: false # default
  signoff: false # default
```

| Gate      | When `true`                                                                                                    | When `false` (default)                       |
| --------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `spec`    | `ready → implementing` is blocked. The change must pass through `pending-spec-approval → spec-approved` first. | `ready → implementing` is a free transition. |
| `signoff` | `done → archivable` is always blocked. The change must pass through `pending-signoff → signed-off` first.      | `done → archivable` is a free transition.    |

Both gates are independent — any combination is valid.

## logging

`logging` configures project-level logging defaults:

```yaml
logging:
  level: info
```

| Field   | Required | Default | Allowed values                                      |
| ------- | -------- | ------- | --------------------------------------------------- |
| `level` | no       | `info`  | `trace`, `debug`, `info`, `warn`, `error`, `silent` |

When present, this level is used for default file logging. Logs are written under `{configPath}/log/specd.log`.

## llmOptimizedContext

`llmOptimizedContext` opts the project into LLM-enriched processing for tasks that benefit from it. When `false` or absent (the default), all operations use deterministic processing only.

```yaml
llmOptimizedContext: true # default: false
```

When enabled:

- **Spec Metadata**: `CompileContext` and `GetSpecContext` prefer the `optimizedContext` and `optimizedDescription` fields from `metadata.json` if they exist.
- **Project Context**: `GetProjectContext` uses the cached, optimized version of the project-level background from `project-metadata.json` (if fresh).
- **Code Graph**: The indexer uses the optimized descriptions for improved search results.

With `llmOptimizedContext: false`, all context is assembled by joining raw artifact content and deterministic metadata.

### `project-metadata.json`

When `llmOptimizedContext` is active, SpecD can use a cached version of the project background context. This cache is stored in `project-metadata.json` under the resolved `configPath`. It includes SHA-256 hashes of `specd.yaml`, context files, and included spec metadata to ensure the cache remains fresh. If any input changes, the cache is invalidated and SpecD falls back to raw compilation until an agent runs the optimization skill to regenerate it.

## contextMode

`contextMode` controls how context commands render collected specs:

- `specd changes context`
- `specd project context`
- `specd specs context`

| Value       | Behaviour                                                                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'list'`    | Render only the spec identifier catalogue (no summary metadata, no full content).                                                                                                                                                                     |
| `'summary'` | Render spec catalogue entries with summary metadata (`title`, `description`) but no full spec body. This is the default.                                                                                                                              |
| `'full'`    | Render full content for every collected spec.                                                                                                                                                                                                         |
| `'hybrid'`  | Keep tiered rendering for `change context`: specs seeded directly from `change.specIds` render as full, while include-pattern and dependency-traversal specs render as summary. For `project context` and `spec context`, `hybrid` behaves as `full`. |

```yaml
contextMode: summary # default
```

Section flags (`--rules`, `--constraints`, `--scenarios`) only affect full-mode rendering. In `list` and `summary` modes those flags are accepted but have no effect on output shape.

`lazy` is no longer a valid value. Migrate old configs by replacing:

- `contextMode: lazy` with `contextMode: hybrid` to keep tiered behaviour.
- `contextMode: lazy` with `contextMode: summary` to adopt the new default compact output.

## schemaPlugins

`schemaPlugins` lists schema plugin references that are loaded and merged into the active schema before `schemaOverrides` is applied. Each entry is a schema reference string using the same resolution rules as the top-level `schema` field.

```yaml
schemaPlugins:
  - '@acme/specd-plugin-compliance'
  - '#billing:billing-plugin'
```

Plugins are applied in declaration order. Each plugin's merge operations are applied to the schema resolved from the `schema` field. If a plugin cannot be resolved, SpecD exits with an error.

## schemaOverrides

`schemaOverrides` applies inline merge operations directly to the active schema without creating or referencing a plugin file. It is applied after all `schemaPlugins` have been merged. This is the recommended way to add project-specific additions to a shared base schema.

`schemaOverrides` supports five operations:

| Operation | Effect                                                                                      |
| --------- | ------------------------------------------------------------------------------------------- |
| `create`  | Adds new entries (artifacts, workflow steps) to the schema. Fails if the ID already exists. |
| `append`  | Appends entries to arrays (e.g. adds artifact rules or workflow hook entries at the end).   |
| `prepend` | Prepends entries to arrays.                                                                 |
| `set`     | Replaces scalar fields or whole array entries by identity.                                  |
| `remove`  | Removes entries from arrays by identity (`id` for artifacts, `step` for workflow).          |

Each operation targets one or more of these schema sections: `artifacts`, `workflow`, `metadataExtraction`.

```yaml
schemaOverrides:
  append:
    artifacts:
      - id: design
        rules:
          post:
            - id: check-compliance
              text: >-
                Cross-reference this design against global specs before proceeding.
    workflow:
      - step: implementing
        hooks:
          post:
            - id: run-tests
              run: 'pnpm test'
  remove:
    workflow:
      - step: designing
        hooks:
          post:
            - id: old-hook
```

Hook entries in `schemaOverrides` require an `id` field — this is how append/prepend/remove identify individual hooks within a step's array. The `id` must be unique within the `pre` or `post` array it belongs to.

## invalidationPolicy

`invalidationPolicy` controls how artifact invalidation propagates when a change's files drift from their validated baseline or when manual invalidation is triggered. The policy is persisted on each change at creation time (inheriting this project default) and can be overridden per-change with `specd changes edit --invalidation-policy` or per-execution with `specd changes invalidate --policy`.

```yaml
invalidationPolicy: downstream # default
```

| Policy       | Automatic drift invalidation                                                              | Manual `change invalidate`                                                                 |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `none`       | No artifacts are reopened. Drift is recorded (`hasDrift: true`) but states are preserved. | Change transitions to `designing` but no artifacts are reopened. `--target` is disallowed. |
| `surgical`   | Only the specific files that drifted are reopened.                                        | Only explicitly targeted files are reopened. Requires `--target`.                          |
| `downstream` | Drifted files plus their DAG descendants are reopened. This is the default.               | Targets plus all DAG descendants are reopened. Requires `--target`.                        |
| `global`     | All artifacts in the change are reopened.                                                 | All artifacts are reopened. `--target` is disallowed.                                      |

When `invalidationPolicy` is omitted from `specd.yaml`, new changes default to `downstream` — the same behaviour as before this field was introduced.

Display status reflects drift even under `none`: files show `complete-with-drift` in `changes status` and `changes artifacts` output while remaining canonically `complete`.

## Validation

### Errors that abort startup

SpecD validates `specd.yaml` before executing any command that requires a config. The following conditions are hard errors — SpecD exits immediately:

| Condition                                                                       | Error                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `schema` field is missing                                                       | Config is invalid without a schema reference.                    |
| `workspaces` section is missing or has no `default` workspace                   | Every project must declare a default workspace.                  |
| `specs` section is missing in any workspace                                     | SpecD cannot locate specs without a specs path.                  |
| `codeRoot` is missing in any non-`default` workspace                            | Required for non-default workspaces; no sensible default exists. |
| `storage` section is missing, or `changes` or `archive` sub-key is absent       | Both are required.                                               |
| `adapter` is missing in any `specs`, `schemas`, or storage section              | Required in every storage declaration.                           |
| Required adapter-specific fields are absent (e.g. `fs.path` when `adapter: fs`) | The adapter cannot function without its required fields.         |
| An adapter name has no registered factory at kernel construction time           | The kernel rejects unknown named adapters with a clear error.    |
| Storage path resolves outside the repo root                                     | Paths must stay within the repository.                           |
| Invalid `contextIncludeSpecs` or `contextExcludeSpecs` pattern syntax           | e.g. `*` in a disallowed position.                               |
| `llmOptimizedContext` is not a boolean                                          | Any other type is a startup validation error.                    |
| Legacy `artifactRules` field is present                                         | Use `schemaOverrides` instead.                                   |

Commands that skip validation entirely: `--help`, `--version`, `specd project init`, `specd config validate`, and `specd plugin` subcommands.

### Warnings that allow startup to proceed

| Condition                                                       | Warning                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| Duplicate workspace names                                       | YAML retains last-wins; the duplicate is a likely mistake. |
| Unknown workspace qualifier in a context pattern (runtime only) | A typo silently excludes specs.                            |

### What `specd config validate` checks additionally

`specd config validate` runs a stricter check than the startup validator:

- Unknown workspace qualifiers in `contextIncludeSpecs` or `contextExcludeSpecs` patterns are treated as **errors**, not warnings. A typo in a qualifier silently excludes specs from context — this is a dangerous silent failure in team environments.
- A warning is emitted for any include or exclude pattern (at any level) that matches no specs on disk at validation time. This is not a runtime error (specs may not exist yet), but it helps catch typos early.
