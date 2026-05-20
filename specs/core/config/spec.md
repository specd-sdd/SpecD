# Project Configuration

## Purpose

Every tool in the specd ecosystem needs a shared, authoritative source for project-level settings — schema selection, workspace layout, storage paths, and installed plugins — to avoid each adapter hardcoding its own assumptions. `specd.yaml` is that single project-level configuration file: it declares which schema governs the project, how specs are organised across workspaces, where changes and archives are stored, per-artifact constraints, and installed plugins. The CLI, MCP server, and all plugins derive their wiring from it.

## Requirements

### Requirement: Config file location and format

`specd.yaml` must be a valid YAML file. specd discovers and resolves configuration using the following strategy, in order:

1. **`--config` flag** — if the CLI is invoked with `--config path/to/file.yaml`, that file becomes the single explicit entrypoint. specd MUST resolve that file and only its own `extends` chain. Normal filename discovery MUST NOT add any additional layers on top of the explicit chain.
2. **Walk up from CWD, bounded by the git repo root** — specd walks up from the current working directory, checking each directory for discoverable config candidates. The walk stops at the **first directory containing any matching config files** (nearest to CWD) or at the git repo root (the nearest ancestor directory containing `.git/`), whichever comes first. If no discoverable config files are found before or at the repo root, specd exits with an error.
3. **CWD only, when not inside a git repo** — if no `.git/` ancestor exists, specd checks only the current working directory and stops there. It does not walk further up.

Within the selected directory, normal discovery MUST evaluate candidate files in this order:

1. `specd.yaml`
2. `specd.*.yaml` in ascending alphabetical order
3. `specd.local.yaml`
4. `specd.local.*.yaml` in ascending alphabetical order

A discovered file without `extends` becomes a standalone root from that point. A discovered file with `extends: true` MUST inherit from the previous active layer in the resolved chain. A discovered file with `extends: <path>` MUST only activate when that explicit base file is already part of the active chain being resolved; otherwise the discovered file is ignored during normal discovery.

The search never goes above the git repo root. This prevents accidentally picking up a config from a parent repository in nested or sibling monorepo layouts.

Some command families may explicitly define a bootstrap mode that intentionally operates without loading project config. When they do, this requirement still governs normal configured operation and the meaning of `--config` remains unchanged: it is always an explicit config file entrypoint, never a repository root selector.

### Requirement: Privacy settings

`specd.yaml` MAY include a `privacy` section to control identity obfuscation.

- **`mode`** — MUST be one of: `hash`, `mask`, `anonymous`.
- **`salt`** — optional string for HMAC hashing (recommended via environment).
- **`excludeActors`** — optional array of names or emails to skip obfuscation. Defaults to `["specd", "system@getspecd.dev"]`.
- **`allowedMetadataKeys`** — optional whitelist of metadata keys to preserve under privacy modes.

### Requirement: Environment variable overrides

Root-level non-hierarchical configuration values SHALL be overridable by environment variables. The following mappings apply:

- `SPECD_ACTOR_PROVIDER` → `actorProvider`
- `SPECD_PRIVACY_SALT` → `privacy.salt`
- `SPECD_PRIVACY_MODE` → `privacy.mode`

Environment variables (including those from `.env` and `.env.local`) SHALL take precedence over values defined in `specd.yaml` and `specd.local.yaml`.

### Requirement: Forced actor provider

`specd.yaml` MAY include an `actorProvider` root field (string). When present, it MUST force the selection of the named provider from the kernel registry, bypassing auto-detection.

### Requirement: Local config override

Alongside `specd.yaml`, developers may place discoverable variant files to customize configuration without duplicating the entire shared config.

During normal discovery, later active layers merge on top of earlier active layers. Scalars use last-layer-wins semantics. Objects merge deeply by key. Arrays append by default unless an inherited entry is explicitly removed through the `remove` block.

`specd.local.yaml` remains backward-compatible:

- when it does not declare `extends`, it is a fully independent local config root and `specd.yaml` is not inherited
- when it declares `extends: true`, it inherits from the previous active layer and participates in the cascade

The `extends` field has exactly two valid forms:

- `extends: true` — inherit from the previous active layer in the resolved chain
- `extends: <path>` — inherit from one explicit config file, which MUST already belong to the same applicable chain

The `remove` field is only valid in configs that declare `extends`. A standalone config root MUST NOT declare `remove`.

`remove` uses structural targeting rather than document-wide selectors:

- `remove.root` removes optional top-level fields by field name
- `remove.<mapName>` removes named keys from keyed object maps such as `workspaces` and `storage`
- `remove.<arrayName>` removes inherited array entries by that array's defined identity keys

Required top-level fields such as `schema` MUST NOT be removable.

Discoverable local variants remain ordered by filename. For example, `specd.local.10-team.yaml`, `specd.local.20-machine.yaml`, and `specd.local.99-final.yaml` apply in exactly that order, with the last file having the highest precedence among active local layers.

`specd init` must add both `specd.local.yaml` and `specd.local.*.yaml` to the project's `.gitignore` so local variants are never committed by default.

### Requirement: Cascade identity and removal model

Config inheritance MUST use local structural identity rules for removable collections.

The following identity rules apply in the first version:

- `context[]` supports an optional `id` field. When present, `id` is the preferred identity key for inherited removal.
- `plugins.agents[]` uses `name` as its identity key.
- keyed object maps such as `workspaces` and `storage` use their object keys as removal targets.

The system MUST NOT use arbitrary field-combination matching or AST-wide selector matching for config inheritance removal. Each removable array or map MUST define its own deterministic identity model.

A discovered layer with `extends: <path>` MUST only attach when that explicit base file is already active in the same chain. This allows files such as `specd.local.experimental.yaml` to remain discoverable by filename while staying inactive unless `specd.experimental.yaml` is already active or is selected explicitly with `--config`.

### Requirement: Schema reference

`specd.yaml` must declare a `schema` field identifying the schema that governs this project. Only one schema is active per project at a time — per-workspace schema selection is not supported. The field is required.

The value uses a prefix convention to make the resolution strategy explicit:

```yaml
schema: "@specd/schema-std"            # npm package — starts with @
schema: "#spec-driven"                 # default workspace's schemasPath (same as bare name)
schema: "spec-driven"                  # bare name — resolved from default workspace's schemasPath
schema: "#billing:my-billing-schema"   # named workspace's schemasPath
schema: "./schemas/custom/schema.yaml" # direct path — relative to specd.yaml location
schema: "/absolute/path/schema.yaml"   # direct absolute path
```

- **`@scope/name`** — an npm package. The schema file is loaded from `node_modules/@scope/name/schema.yaml`. Version selection is handled by npm via `package.json`.
- **`#workspace:name`** — a named schema resolved from a specific workspace's `schemas` section. `#billing:my-schema` loads from `workspaces.billing.schemas.fs.path/my-schema/schema.yaml`.
- **`#name` or bare name** — equivalent to `#default:name`. Resolved from the `default` workspace's `schemas` section.
- **Relative or absolute path** — a direct path to a `schema.yaml` file. Relative paths are resolved from the directory containing `specd.yaml`.

There is no implicit multi-level fallback — the prefix determines exactly where specd looks. `SchemaRegistry.resolve()` receives the full value from `specd.yaml` and dispatches based on the prefix.

**Resolution timing:** schema resolution happens at command dispatch time, immediately before the command body executes. Commands that do not require the schema — such as `--help`, `--version`, `init`, `config validate`, and `plugin` subcommands — skip resolution entirely.

**Error types:** both `ConfigValidationError` (malformed `specd.yaml`) and `SchemaNotFoundError` / `SchemaValidationError` (resolution failures) are domain errors defined in `@specd/core` and extend `SpecdError`. They are distinct types with distinct messages and exit codes — config errors indicate a problem with `specd.yaml` itself; schema errors indicate a problem with the referenced schema.

### Requirement: Invalidation policy configuration

`specd.yaml` MAY declare a root-level `invalidationPolicy` field controlling how artifact/file invalidation propagates when a change is invalidated.

Allowed values are:

- `none`
- `surgical`
- `downstream`
- `global`

The configured value is the project default used to seed new changes and to resolve effective invalidation policy when a change has not been overridden later.

### Requirement: Workspaces

`specd.yaml` must declare at least one workspace under the `workspaces` key. Each workspace defines where its specs live, where the implementation code lives, where its local schemas are stored, and the ownership relationship the project has with those specs.

`default` is a reserved workspace name that identifies the local project workspace. Every config must contain a `default` workspace. `specd init` creates it automatically if no `workspaces` section is present.

```yaml
workspaces:
  default: # required — the local project workspace
    prefix: _global # optional — logical path prefix for all specs in this workspace
    specs: # where this workspace's spec files live (required)
      adapter: fs # storage adapter (required; only "fs" in v1)
      fs:
        path: specs/_global
        metadataPath: .specd/metadata # optional — where metadata.yaml files live
    schemas: # where named local schemas live (optional)
      adapter: fs
      fs:
        path: .specd/schemas # default: .specd/schemas (relative to specd.yaml)
    codeRoot: ./ # where implementation code lives (default: project root)
    ownership: owned # owned | shared | readOnly (default: owned)

  billing: # additional workspace
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    schemas:
      adapter: fs
      fs:
        path: ../billing/dev/schemas
    codeRoot: ../billing # required for non-default workspaces — no default
    ownership: readOnly # default for non-default workspaces
```

**`specs`** (required) — declares where this workspace's spec files live. Has its own `adapter` and adapter-specific config block. Only `"fs"` is supported in v1.

**`specs.fs.path`** (required for `fs` adapter) — directory where spec files live. Relative paths are resolved from the directory containing `specd.yaml`. May point outside the project repo root, in which case `RepositoryConfig.isExternal` is set to `true` by the application layer.

**`specs.fs.metadataPath`** (optional for `fs` adapter) — directory where `metadata.yaml` files live, mirroring the spec capability path structure. Relative paths are resolved from the directory containing `specd.yaml`. When absent, the config loader auto-derives the path from the VCS root of `specs.fs.path` + `/.specd/metadata/`. When the specs path is not inside any VCS, the fallback is `.specd/metadata/` relative to the specs path parent directory.

**`schemas`** (optional) — declares where named local schemas for this workspace are stored. Has its own `adapter` and adapter-specific config block, independent of `specs`. Used when the `schema` field references `#workspace:name` or a bare/hash-prefixed name targeting this workspace.

- For the `default` workspace, if omitted, defaults to `adapter: fs` with `fs.path: .specd/schemas`.
- For non-`default` workspaces, if omitted, the workspace has no local schemas — any schema reference targeting it (e.g. `#billing:name`) will produce a `SchemaNotFoundError`.

**`codeRoot`** — directory where the implementation code for this workspace lives. Used by `CompileContext` to tell the agent where to write code.

- For the `default` workspace, defaults to the project root (directory containing `specd.yaml`).
- For non-`default` workspaces, `codeRoot` is required — there is no default.

**`ownership`** — the project's relationship to this workspace's specs.

- `owned` — the project owns these specs and can create, modify, and archive changes against them. Default for the `default` workspace.
- `shared` — specs can be modified, but external teams may also modify them.
- `readOnly` — specs are imported for context only; changes cannot target them. Default for non-`default` workspaces.

**Workspace-specific context filtering:** Each workspace may optionally declare `context.includeSpecs` and `context.excludeSpecs` arrays to filter which specs appear in compiled context for changes touching that workspace's specs. These follow the same glob-like pattern syntax as the project-level `context.includeSpecs` / `context.excludeSpecs` and are combined (intersected) with the project-level filters.

### Requirement: Workspace graph config

Each workspace entry in `specd.yaml` MAY declare an optional `graph` block controlling how the code graph indexer discovers files for that workspace:

```yaml
workspaces:
  default:
    codeRoot: ./
    graph:
      respectGitignore: true # optional; default: true
      excludePaths: # optional; gitignore-syntax, supports negation with !
        - .specd/*
        - '!.specd/metadata/'
  core:
    codeRoot: packages/core
    graph:
      excludePaths:
        - dist/
```

**`graph.respectGitignore`** (boolean, default `true`) — whether `.gitignore` files are loaded and applied during file discovery for this workspace.

- When `true` (default): `.gitignore` rules are loaded hierarchically (git root → codeRoot → subdirectories during walk) and applied with **absolute priority**. No pattern in `excludePaths` can re-include a file that `.gitignore` excludes.
- When `false`: `.gitignore` files are not loaded. Only `excludePaths` governs file exclusion.

**`graph.excludePaths`** (string array, gitignore-syntax) — additional exclusion rules applied on top of `.gitignore` (or as the sole ruleset when `respectGitignore` is `false`). Patterns follow `.gitignore` format and support negation with `!`.

When `graph.excludePaths` is **not** specified, the following built-in defaults apply (equivalent to the previous hardcoded behaviour):

```
node_modules/
.git/
.specd/
dist/
build/
coverage/
.next/
.nuxt/
```

When `graph.excludePaths` **is** specified, it **replaces** the built-in defaults entirely. The user takes full ownership — built-in patterns are not merged. To retain standard exclusions alongside custom ones, include them explicitly:

```yaml
graph:
  excludePaths:
    - node_modules/
    - .git/
    - dist/
    - build/
    - coverage/
    - .specd/*
    - '!.specd/metadata/'
```

Patterns are evaluated relative to the workspace's `codeRoot`.

### Requirement: Storage configuration

`specd.yaml` must include a `storage` section with sub-keys for `changes` and `archive`. These paths are global — a project has one changes directory and one archive directory regardless of workspaces.

```yaml
storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes

  drafts:
    adapter: fs
    fs:
      path: specd/drafts

  discarded:
    adapter: fs
    fs:
      path: specd/discarded

  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{change.archivedName}}' # optional; default: "{{change.archivedName}}"
```

All four sub-keys (`changes`, `drafts`, `discarded`, `archive`) are required. `adapter` is required per sub-key; adapter-specific fields are nested under the adapter key (`fs:`). Unknown adapter values must produce a validation error. Relative paths are resolved from the directory containing `specd.yaml` and must remain within the project repo root.

**`drafts`** — shelved changes that are not ready for active development but may be recovered. A change can be moved from `changes/` to `drafts/` at any point before archiving; it retains its full internal state and can be moved back to `changes/` to continue from where it left off.

**`discarded`** — permanently abandoned changes. A change can be discarded from `changes/` or `drafts/`. A discarded change must include a reason; it cannot be recovered. `specd init` adds `specd/drafts/` and `specd/discarded/` to `.gitignore` by default — local-only directories unless the team opts in.

**`archive` index** — the archive directory contains a `.specd-index.jsonl` file that caches metadata from individual manifests for fast listing. This file is a **derived cache**, not a source of truth — the manifests inside each archived change directory are authoritative. `specd init` gitignores `.specd-index.jsonl` inside the archive directory (via a local `.gitignore`), so the index is never committed. When the index is missing (e.g. after a fresh clone) or stale (e.g. after pulling new archives from other developers), it is automatically rebuilt from the manifest files on disk. Staleness is detected by comparing manifest paths on disk against paths recorded in the index.

### Requirement: Named storage adapters

Workspace storage configuration SHALL support named storage adapter selection rather than assuming only the built-in filesystem composition path.

When a workspace selects a named storage adapter, any adapter-specific config block for that adapter SHALL be passed through as adapter-owned configuration. Referencing an adapter name that is not present in the merged built-in plus external storage registries MUST fail with a clear error.

### Requirement: Config path and derived directories

`specd.yaml` MAY declare a top-level `configPath` field for derived graph persistence and temporary runtime artifacts.

```yaml
configPath: .specd/config
```

When omitted, `configPath` defaults to `.specd/config` relative to the directory containing `specd.yaml`.

`configPath` is project-level only. It MUST resolve inside the project repo root and is used for tool-owned artifacts rather than authored project content.

The following derived directories are defined from it:

- **`{configPath}/graph`** — graph persistence root used by code-graph backends
- **`{configPath}/tmp`** — temporary scratch directory for graph/indexing artifacts
- **`{configPath}/tmp/change-locks`** — change lock files for serialized change mutations

`configPath` does not replace the `storage` section for changes, drafts, discarded changes, or archives. Those remain governed by `storage.*`.

### Requirement: Template variables

Archive patterns and hook commands contain `{{namespace.key}}` tokens expanded at runtime. The `TemplateExpander` resolves each token against the variable map.

When a token does not match any registered namespace or key, the original token MUST be preserved unchanged in the output and a warning MUST be emitted. The warning identifies the unresolved token and is informational only — it does not halt processing.

### Requirement: Schema plugins

`specd.yaml` may include a `schemaPlugins` field — an array of schema-plugin references. Each reference uses the same convention as the `schema` field (npm package, workspace-qualified, bare name, or path). Plugins are resolved and applied as merge layers after the base schema's `extends` chain, in declaration order.

```yaml
schemaPlugins:
  - '@specd/plugin-rfc'
  - '#my-plugin'
```

Each referenced file must have `kind: schema-plugin`. If a reference resolves to a file with `kind: schema`, startup must fail with `SchemaValidationError`. If a reference cannot be resolved, startup must fail with `SchemaNotFoundError`.

### Requirement: Schema overrides

`specd.yaml` may include a `schemaOverrides` field — an inline block containing merge operations applied after all plugins. The structure mirrors the `SchemaOperations` interface from the merge engine:

```yaml
schemaOverrides:
  append:
    artifacts:
      - id: specs
        rules:
          post:
            - id: rfc-reference
              text: 'All requirements must reference the relevant RFC number'
    workflow:
      - step: archiving
        hooks:
          post:
            - id: notify-team
              run: 'pnpm run notify-team'
  remove:
    workflow:
      - step: implementing
        hooks:
          post:
            - id: run-tests
  set:
    description: 'Custom project schema description'
```

The five operations (`create`, `remove`, `set`, `append`, `prepend`) are all optional. They follow the same semantics as `mergeSchemaLayers` — see [`core:schema-merge`](../schema-merge/spec.md).

`schemaOverrides` is validated structurally at startup (correct shape, valid operation keys). Semantic validation (e.g. removing a non-existent entry) happens at schema resolution time when the merge engine processes the override layer.

### Requirement: Context spec selection

`contextIncludeSpecs` and `contextExcludeSpecs` can be declared at two levels with different semantics:

- **Project level** (top-level in `specd.yaml`) — patterns are always applied, regardless of which workspaces the current change touches. Use this for specs that must always be in context: global constraints, cross-cutting architecture specs, shared external specs.
- **Workspace level** (inside a workspace entry) — patterns are applied only when that workspace is active in the current change. Use this for specs that are relevant only when working within that workspace.

**A workspace is considered active if at least one of its specs is listed in the current change's metadata.** When a change is created or updated, the set of specs it contains is recorded in its metadata file. `CompileContext` reads that list and resolves each spec's workspace by matching its path against the declared `specs.fs.path` entries — not by scanning the filesystem at compile time, not by CWD, not by `codeRoot`. A change whose metadata lists specs from both `default` and `billing` activates both workspaces simultaneously.

**Pattern syntax:**

| Pattern               | Meaning at project level                                          | Meaning at workspace level                                        |
| --------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `*`                   | All specs in all workspaces                                       | All specs in this workspace (= `{self}:*`)                        |
| `workspace:*`         | All specs in the named workspace                                  | All specs in the named workspace                                  |
| `prefix/*`            | All specs under `prefix/` in `default`                            | All specs under `prefix/` in this workspace                       |
| `workspace:prefix/*`  | All specs under `prefix/` in the named workspace                  | All specs under `prefix/` in the named workspace                  |
| `path/name`           | Exact spec in `default` (does not match descendants)              | Exact spec in this workspace (does not match descendants)         |
| `workspace:path/name` | Exact spec ID in the named workspace (does not match descendants) | Exact spec ID in the named workspace (does not match descendants) |

`*` may only appear in three positions: alone (`*`), as the sole suffix after `workspace:` (`billing:*`), or as the sole suffix after a path prefix ending in `/` (`_global/*`). It may not appear in the middle of a path segment or in any other position.

**Qualifier resolution by level:**

- At project level, omitting the workspace qualifier is equivalent to `default:`.
- At workspace level, omitting the workspace qualifier means _this workspace_ — e.g. inside `billing:`, `['auth/*']` means `billing:auth/*` and `['*']` means all specs in `billing`.

**Defaults:**

- Project-level `contextIncludeSpecs`: `['default:*']`
- Project-level `contextExcludeSpecs`: `[]`
- Workspace-level `contextIncludeSpecs`: `['*']` (equivalent to `{workspace-name}:*`)
- Workspace-level `contextExcludeSpecs`: `[]`

**Resolution order:** `CompileContext` builds the compiled context in this sequence:

1. Project-level `context` entries (in declaration order) — always first, before any spec content
2. Project-level include patterns (in declaration order) — always applied
3. Project-level exclude patterns — always applied; removes specs from the set accumulated in step 2
4. Workspace-level include patterns from each active workspace (in workspace declaration order, then pattern order within each workspace)
5. Workspace-level exclude patterns from each active workspace (same order as step 4)
6. All specs reachable via `dependsOn` traversal — starting from the change's `specIds`, following `dependsOn` links (resolved via the three-tier order: `change.specDependsOn`, `.specd-metadata.yaml`, content extraction) transitively until no new specs are found. These specs are **not subject to exclude rules from steps 3 or 5** — a declared dependency is always included regardless of project or workspace excludes.

Specs matched by earlier patterns take priority if the context must be truncated. A spec matched by multiple include patterns appears only once, at the position of the first matching pattern. Specs added in step 6 that were already included in steps 2–5 also appear only once (at their earlier position). Step 1 (`context` entries) is not part of spec collection — those entries are injected as-is and are not deduplicated against specs. See [`core:spec-metadata`](../spec-metadata/spec.md) for the `.specd-metadata.yaml` format.

```yaml
# always in context — global constraints regardless of change scope
contextIncludeSpecs:
  - 'shared:_global/*'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    contextIncludeSpecs:
      - '*' # all default specs, when default is active

  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    codeRoot: ../billing
    contextIncludeSpecs:
      - '*' # all billing specs, when billing is active
    contextExcludeSpecs:
      - 'drafts/*' # exclude billing drafts (resolves to billing:drafts/*)

  shared:
    specs:
      adapter: fs
      fs:
        path: ../shared/specs
    ownership: readOnly
    # no workspace-level context — project-level shared:_global/* covers it
```

References to unknown workspace qualifiers produce a warning at startup but do not prevent startup — runtime is tolerant to allow working with partial workspace setups. However, `specd config validate` must fail with an error if any unknown workspace qualifier is found: a typo in a qualifier silently excludes specs from context, which is a dangerous silent failure in teams. References to non-existent spec IDs are silently skipped at context-compilation time — this avoids breaking when a spec is temporarily deleted or not yet created. Invalid pattern syntax is an error caught at startup.

`specd config validate` additionally warns when a pattern (include or exclude, at any level) matches no specs on disk at validation time. This is not a runtime error — specs may not exist yet — but the warning helps catch typos early.

### Requirement: Context mode

`specd.yaml` MUST accept an optional top-level `contextMode` field that controls how context commands render specs in compiled context output.

Accepted values:

- `'list'` — render collected specs as spec IDs and source metadata only, without descriptions or full content
- `'summary'` (default) — render collected specs as a catalogue with spec ID, title, and description, without full content
- `'full'` — render all collected specs with full content
- `'hybrid'` — render direct change specs in full when the caller includes them, and render all other collected specs as summaries

The legacy `'lazy'` value is removed. It MUST NOT be accepted as an alias or fallback for `hybrid`.

`contextMode` is project-level only — it MUST NOT appear inside workspace entries. If declared inside a workspace, startup validation MUST reject it as an unknown field.

When omitted, `contextMode` defaults to `'summary'`.

### Requirement: Project context instructions

`specd.yaml` MAY declare a `context` array to inject project-specific instructions before spec content.

Each entry MUST be one of:

- `{ instruction: string }`
- `{ file: string }`
- `{ id: string, instruction: string }`
- `{ id: string, file: string }`

`id` is optional but, when present, it provides a stable identity for inherited removal in layered config resolution.

File paths remain resolved relative to the directory containing the active config file unless they are already absolute.

### Requirement: Approvals

`specd.yaml` may include an `approvals` section to configure which lifecycle gates require explicit human approval. Both gates are disabled by default — teams opt in to the level of governance they need.

```yaml
approvals:
  spec: false # require approval of the spec before implementation (default: false)
  signoff: false # require sign-off of the completed work before archiving (default: false)
```

**`spec`** — when `true`, a change in `ready` state cannot transition directly to `implementing`. It must first enter `pending-spec-approval` and receive an explicit approval (with approver identity, reason, and timestamp) before transitioning to `spec-approved` and then to `implementing`. When `false` (default), `ready → implementing` is a free transition.

**`signoff`** — when `true`, a change in `done` state cannot transition directly to `archivable`, regardless of whether it contains structural modifications or only additions. It must enter `pending-signoff`, receive explicit sign-off, and transition through `signed-off → archivable`. The sign-off record captures what was reviewed — new specs, modified specs, and removed specs alike. When `false` (default), `done → archivable` is a free transition.

Both flags are independent — any combination is valid.

### Requirement: Logging configuration

`specd.yaml` MAY declare a `logging` section at the root. This section is OPTIONAL. If omitted, the system SHALL fallback to built-in defaults.

- **`level`** (optional) — sets the minimum log level for the project. Supported values MUST include `trace`, `debug`, `info`, `warn`, `error`, and `silent`. Defaults to `info`.

### Requirement: LLM optimization

`specd.yaml` may include a top-level `llmOptimizedContext` boolean field. When `true`, specd may invoke an LLM for optimization tasks that produce richer output than deterministic extraction alone. When `false` or absent (the default), all operations use deterministic processing only.

```yaml
llmOptimizedContext: true # default: false
```

The first use case is spec metadata generation: with `llmOptimizedContext: false`, the metadata agent extracts rules and scenarios by parsing the structural conventions of `spec.md` and `verify.md` directly; with `true`, the LLM generates richer `description`, structured `given`/`when`/`then` for free-form scenarios, and more precise `dependsOn` suggestions. Further use cases may be added in future versions.

This field is a project-level opt-in. Teams that have no LLM available in their automation pipeline (e.g. offline CI, air-gapped environments) leave it `false`. Teams that want LLM-enriched output set it to `true` and ensure their tooling has access to a model.

### Requirement: Plugin declarations

`specd.yaml` MUST include a `plugins` section declaring installed plugins, grouped by type. The config loader MUST validate the `plugins` field at load time using the Zod schema — structural errors MUST produce a `ConfigValidationError` before any command runs.

The validated structure is:

```typescript
plugins: {
  agents?: Array<{ name: string; config?: Record<string, unknown> }>
}
```

Each plugin entry has `name` (required) and optional `config`. Unknown plugin types are rejected at validation time.

### Requirement: Config writer port

`ConfigWriter` is an application-layer port that defines the contract for writing to `specd.yaml`. It complements the read-only `ConfigLoader` with mutation operations for project initialisation and plugin management.

The port MUST define the following methods:

- `initProject(configPath: string, options: InitProjectOptions): Promise<InitProjectResult>` — creates a new `specd.yaml` with default content
- `addPlugin(configPath: string, type: string, name: string, config?: Record<string, unknown>): Promise<void>` — adds a plugin entry to `plugins.<type>`, with optional config
- `removePlugin(configPath: string, type: string, name: string): Promise<void>` — removes a plugin entry from `plugins.<type>`
- `listPlugins(configPath: string, type: string): Promise<Array<{ name: string; config?: Record<string, unknown> }>>` — reads plugin entries from `plugins.<type>`

The `addPlugin` method accepts four parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `type: string` — the plugin type (e.g. `"agents"`)
3. `name: string` — the plugin package name (e.g. `"@specd/plugin-agent-claude"`)
4. `config?: Record<string, unknown>` — optional plugin configuration

It MUST return `Promise<void>`. The method MUST add the plugin to the `plugins.<type>` array in `specd.yaml`. If the plugin is already present, the method MUST NOT duplicate it.

### Requirement: Startup validation

Config startup validation MUST reject invalid cascade instructions before any command proceeds.

Validation MUST fail with `ConfigValidationError` when:

- `remove` appears in a config that does not declare `extends`
- `extends` uses any value other than `true` or a string path
- `extends: <path>` points outside the applicable config chain
- `remove.root` attempts to delete a required field such as `schema`
- `remove.workspaces` or `remove.storage` names a key that does not exist in the inherited base
- array removal cannot resolve exactly one inherited target under that array's identity rules

These validation failures remain domain-level configuration errors and therefore MUST surface through the normal `SpecdError` / `ConfigValidationError` path.

## Constraints

- Every field in specd.yaml is validated at load time by the Zod schema
- When `privacy.mode` is set to `hash`, a `salt` MUST be provided (via config or environment) or validation SHALL fail
- Unknown fields at the top level are rejected by the strict Zod schema

## Examples

### Single-repo project (minimal)

```yaml
schema: '@specd/schema-std'

# logging section is optional (defaults to level: info)
logging:
  level: info

llmOptimizedContext: true # omit or set false for deterministic-only processing

context:
  - file: specd-bootstrap.md
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files over creating new ones.'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

### Single-repo project with local schema

```yaml
schema: 'spec-driven' # resolves from default.schemas.fs.path (specd/schemas/spec-driven/schema.yaml)

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    schemas:
      adapter: fs
      fs:
        path: specd/schemas

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive
```

### Coordinator repo managing multiple service repos

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    codeRoot: ./

  auth:
    specs:
      adapter: fs
      fs:
        path: ../auth-service/specd/specs
    codeRoot: ../auth-service
    ownership: owned

  payments:
    specs:
      adapter: fs
      fs:
        path: ../payments-service/specd/specs
    codeRoot: ../payments-service
    ownership: owned

  platform:
    specs:
      adapter: fs
      fs:
        path: ../platform-repo/specd/specs
    codeRoot: ../platform-repo
    ownership: readOnly # specs are readable but not modifiable; loads by default when active

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{year}}/{{change.archivedName}}'

# workspace-level contextIncludeSpecs defaults to ['*'] —
# default, auth, and payments each load all their own specs when active

schemaOverrides:
  append:
    workflow:
      - step: archiving
        hooks:
          post:
            - id: create-branch
              run: 'git -C {{codeRoot}} checkout -b specd/{{change.name}}'
```

### Project with workspace-specific schema

```yaml
schema: '#billing:billing-schema' # ../billing/dev/schemas/billing-schema/schema.yaml

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

  billing:
    specs:
      adapter: fs
      fs:
        path: ../billing/specd/specs
    schemas:
      adapter: fs
      fs:
        path: ../billing/dev/schemas
    codeRoot: ../billing
    ownership: readOnly

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  archive:
    adapter: fs
    fs:
      path: specd/archive

schemaOverrides:
  append:
    artifacts:
      - id: specs
        rules:
          post:
            - id: platform-contract
              text: 'All requirements must reference the platform contract they satisfy'
```

## Spec Dependencies

- [`core:schema-format`](../schema-format/spec.md) — schema structure, `kind`, `extends`, and resolution order
- [`core:schema-merge`](../schema-merge/spec.md) — merge engine operations used by `schemaOverrides`
- [`default:_global/architecture`](../../_global/architecture/spec.md) — port and adapter design
- [`core:storage`](../storage/spec.md) — storage adapter behavior
- [`core:spec-metadata`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal in step 5
- [`core:workspace`](../workspace/spec.md) — workspace identity, properties, ownership, and prefix semantics
- [`default:_global/logging`](../../_global/logging/spec.md) — global logging standards followed by the config schema

## ADRs

- [ADR-0012: Configuration File Strategy](../../../docs/adr/0012-config-file-strategy.md)
- [ADR-0013: Workspaces, Not Scopes](../../../docs/adr/0013-workspaces-not-scopes.md)
- [ADR-0014: Single Changes and Archive Storage Per Project](../../../docs/adr/0014-single-storage-per-project.md)
