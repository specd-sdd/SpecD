# Project Configuration

## Purpose

Every tool in the specd ecosystem needs a shared, authoritative source for project-level settings — schema selection, workspace layout, storage paths, and installed plugins — to avoid each adapter hardcoding its own assumptions. `specd.yaml` is that single project-level configuration file: it declares which schema governs the project, how specs are organised across workspaces, where changes and archives are stored, per-artifact constraints, and installed plugins. The CLI, MCP server, and all plugins derive their wiring from it.

## Requirements

### Requirement: Config file location and format

`specd.yaml` must be a valid YAML file. specd discovers it using the following strategy, in order:

1. **`--config` flag** — if the CLI is invoked with `--config path/to/specd.yaml`, that path is used directly; no discovery takes place.
2. **Walk up from CWD, bounded by the git repo root** — specd walks up from the current working directory, checking each directory for `specd.yaml`. The walk stops at the **first match** (nearest to CWD) or at the git repo root (the nearest ancestor directory containing `.git/`), whichever comes first. If no `specd.yaml` is found before or at the repo root, specd exits with an error.
3. **CWD only, when not inside a git repo** — if no `.git/` ancestor exists (e.g. the user is running specd from outside any repository, as in a coordinator script), specd checks only the current working directory and stops there. It does not walk further up.

The search never goes above the git repo root. This prevents accidentally picking up a `specd.yaml` from a parent repository in nested or sibling monorepo layouts. In a monorepo where each package has its own `specd.yaml`, the package-level file is used when running specd from within that package — the root-level file is not considered.

Some command families may explicitly define a bootstrap mode that intentionally operates without loading project config. When they do, this requirement still governs normal configured operation and the meaning of `--config` remains unchanged: it is always an explicit config file path override, never a repository root selector.

Bootstrap mode, when defined by a command spec, is for setup and early repository exploration rather than the intended steady-state mode for configured projects. Such command specs MUST document when bootstrap mode is entered, how repository root is resolved, and how it differs from configured operation.

### Requirement: Local config override

Alongside `specd.yaml`, developers may place a `specd.local.yaml` file in the same directory to use a fully independent local configuration. When `specd.local.yaml` is present, specd uses it exclusively — `specd.yaml` is not read and no merging takes place. The local file is a complete, self-contained config that must be valid on its own.

The file is optional — its absence is normal. `specd init` must add `specd.local.yaml` to the project's `.gitignore` so it is never committed.

The typical workflow for local customisation is: copy `specd.yaml` to `specd.local.yaml`, then edit the copy. This keeps the mental model simple — there is always exactly one active config file.

When the CLI is invoked with `--config path/to/specd.yaml`, that file is used exactly as specified — no `specd.local.yaml` lookup takes place. This allows testing with the shared config without the local override interfering.

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

### Requirement: Graph config path

`specd.yaml` MAY declare a top-level `configPath` field for derived graph persistence and temporary graph artifacts.

```yaml
configPath: .specd/config
```

When omitted, `configPath` defaults to `.specd/config` relative to the directory containing `specd.yaml`.

`configPath` is project-level only. It MUST resolve inside the project repo root and is used for tool-owned graph artifacts rather than authored project content.

The following derived directories are defined from it:

- **`{configPath}/graph`** — graph persistence root used by code-graph backends
- **`{configPath}/tmp`** — temporary scratch directory for graph/indexing artifacts

`configPath` does not replace the `storage` section for changes, drafts, discarded changes, or archives. Those remain governed by `storage.*`.

### Requirement: Template variables

Some configuration values support template variables that specd expands at use time. The following sets of variables are defined:

The following variables are available in **`archivePattern`**:

| Variable                  | Value                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `{{change.name}}`         | The change's slug name                                                                                  |
| `{{change.archivedName}}` | The change's full archived directory name (e.g. `2024-01-15-add-auth-flow`) — the default pattern value |
| `{{change.workspace}}`    | The primary workspace of the change                                                                     |
| `{{year}}`                | Four-digit current year (e.g. `2024`)                                                                   |
| `{{date}}`                | ISO date at archive time (e.g. `2024-01-15`)                                                            |

The following variables are available in **`schemaOverrides` workflow hook `run` commands** and in **schema-level workflow hook `run` commands**:

| Variable               | Value                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `{{change.name}}`      | The change's slug name                                       |
| `{{change.workspace}}` | The primary workspace of the change                          |
| `{{change.path}}`      | Absolute path to the change directory                        |
| `{{project.root}}`     | Absolute path to the project root (where `specd.yaml` lives) |

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

The five operations (`create`, `remove`, `set`, `append`, `prepend`) are all optional. They follow the same semantics as `mergeSchemaLayers` — see [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md).

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

Specs matched by earlier patterns take priority if the context must be truncated. A spec matched by multiple include patterns appears only once, at the position of the first matching pattern. Specs added in step 6 that were already included in steps 2–5 also appear only once (at their earlier position). Step 1 (`context` entries) is not part of spec collection — those entries are injected as-is and are not deduplicated against specs. See [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) for the `.specd-metadata.yaml` format.

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

`specd.yaml` MUST accept an optional top-level `contextMode` field that controls how `CompileContext` renders specs in the compiled context.

Valid values:

- `'lazy'` (default) — specs are split into two tiers. Tier 1 specs (those in the change's `specIds` and `specDependsOn`) are rendered with full content. Tier 2 specs (those from include patterns and `dependsOn` traversal) are rendered as summaries (spec ID, title, description only).
- `'full'` — all collected specs are rendered with full structured content (rules, constraints, scenarios). This preserves the pre-change behaviour.

`contextMode` is project-level only — it MUST NOT appear inside workspace entries. If declared inside a workspace, startup validation MUST reject it as an unknown field.

When omitted, `contextMode` defaults to `'lazy'`.

### Requirement: Project context instructions

`specd.yaml` may include a top-level `context` field to inject additional freeform content into the compiled context alongside specs. Each entry is either an inline instruction string or a reference to an external file.

```yaml
context:
  - file: specd-bootstrap.md # file path relative to specd.yaml
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files over creating new ones.'
```

Each item is an object with exactly one of the following keys:

- **`instruction`** — a string injected verbatim as an additional context block.
- **`file`** — the file at the given path is read at compile time and its content is injected verbatim. Paths are relative to the directory containing `specd.yaml`. Absolute paths are also accepted.

The `context` field is optional. If absent, no additional content is injected. Entries are prepended to the compiled context in declaration order, before any spec content.

If a referenced file does not exist at compile time, specd emits a warning identifying the missing file, skips that entry, and continues compilation normally.

There is no depth limit on file content — the full file is injected. Files are not parsed or transformed; markdown, plain text, and any other format are all treated as opaque strings.

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

### Requirement: LLM optimization

`specd.yaml` may include a top-level `llmOptimizedContext` boolean field. When `true`, specd may invoke an LLM for optimization tasks that produce richer output than deterministic extraction alone. When `false` or absent (the default), all operations use deterministic processing only.

```yaml
llmOptimizedContext: true # default: false
```

The first use case is spec metadata generation: with `llmOptimizedContext: false`, the metadata agent extracts rules and scenarios by parsing the structural conventions of `spec.md` and `verify.md` directly; with `true`, the LLM generates richer `description`, structured `given`/`when`/`then` for free-form scenarios, and more precise `dependsOn` suggestions. Further use cases may be added in future versions.

This field is a project-level opt-in. Teams that have no LLM available in their automation pipeline (e.g. offline CI, air-gapped environments) leave it `false`. Teams that want LLM-enriched output set it to `true` and ensure their tooling has access to a model.

### Requirement: Skills manifest

`specd.yaml` may include a `skills` section recording which skills from `@specd/skills` have been installed at the project level for each agent. This manifest is written and read by `specd skills install` and `specd skills update`.

```yaml
skills:
  claude:
    - specd-bootstrap
    - specd-spec-metadata
```

Keys are agent IDs (e.g. `claude`); values are arrays of skill names. The section is optional — its absence means no skills are tracked. Skills installed globally (`--global`) are not recorded here.

### Requirement: Plugin declarations

`specd.yaml` may include a `plugins` section declaring which agent-integration plugins are installed. Each entry must include `name`; `options` is plugin-specific and optional.

```yaml
plugins:
  - name: '@specd/plugin-claude'
  - name: '@specd/plugin-copilot'
    options:
      commandsDir: .github/copilot/instructions
```

Plugin declarations are used by `specd project init`, `specd plugin add`, and `specd project update` to install and maintain the plugin's skill files and hooks in the project. They do not affect schema resolution, storage, or context compilation.

### Requirement: Config writer port

`@specd/core` exposes a `ConfigWriter` application port for all operations that mutate `specd.yaml`. Adapters (CLI, MCP) never serialise or deserialise YAML directly — they call use cases that delegate to `ConfigWriter`.

The port defines the following operations:

- **`initProject(options)`** — writes a new `specd.yaml` at the given path with the provided schema reference, workspace id, and workspace specs path. Fails if the file already exists and `force` is false. Also creates the standard storage directories (`changes/`, `drafts/`, `discarded/`, `archive/`), appends `specd.local.yaml` to `.gitignore`, and creates a `.gitignore` inside the archive directory to exclude `index.jsonl`.
- **`recordSkillInstall(configPath, agent, skillNames)`** — adds the given skill names to `specd.yaml`'s `skills.<agent>` array, deduplicating existing entries.
- **`readSkillsManifest(configPath)`** — returns the `skills` section of `specd.yaml` as a typed map `{ [agent: string]: string[] }`. This is a targeted read that does not require a fully validated `SpecdConfig`.

The `FsConfigWriter` adapter implements this port using the filesystem. It reads the existing YAML (when required), makes the targeted mutation, and writes the file back, preserving comments and key order as much as the YAML library permits.

**Responsibility boundary:** `@specd/core` owns all YAML serialisation and deserialisation. Adapters (CLI, MCP) call use cases with typed inputs and receive typed outputs — they never read or write `specd.yaml` directly. Conversely, `@specd/core` never writes agent-specific files (e.g. `.claude/commands/*.md`) — those are adapter-layer concerns. This boundary is intentional: `@specd/skills` depends on `@specd/core`, not the other way around, so core cannot resolve skill content.

Use cases that call `ConfigWriter`:

| Use case             | Operation            |
| -------------------- | -------------------- |
| `InitProject`        | `initProject`        |
| `RecordSkillInstall` | `recordSkillInstall` |
| `GetSkillsManifest`  | `readSkillsManifest` |

### Requirement: Startup validation

`specd.yaml` MUST be validated at startup. The following conditions are **errors** that prevent startup:

- File does not exist at the discovered path (after traversal)
- YAML parse failure
- Missing required top-level field: `schema`
- `schema` value does not match `<name>@<version>` format (when string) or is not a valid object with `name` and `version`
- Duplicate workspace names (last-wins in YAML; reject if detected)
- Unknown adapter value in any `specs`, `schemas`, or storage section
- Required adapter-specific fields are absent (e.g. `fs.path` missing when `adapter: fs`)
- Storage path (`changes.fs.path` or `archive.fs.path`) resolves outside the repo root
- Invalid `contextIncludeSpecs` or `contextExcludeSpecs` pattern syntax (e.g. `*` in a disallowed position)
- `schemaPlugins` entry is not a valid string reference
- `schemaOverrides` has an invalid structure (unknown operation keys, wrong types)
- `contextMode` value is not `'full'` or `'lazy'`
- `contextMode` appears inside a workspace entry (it is project-level only)
- `graph.respectGitignore` is present but not a boolean
- `graph.excludePaths` is present but not an array of strings

The following conditions emit **warnings** but allow startup to proceed:

- Duplicate workspace names (YAML retains last-wins; warn about the pattern)
- Unknown workspace qualifier in a `contextIncludeSpecs` or `contextExcludeSpecs` pattern (runtime only — `specd config validate` treats this as an error)

## Constraints

- specd.yaml is the single source of truth for project configuration
- One schema reference per project — all workspaces share the same schema, with optional per-workspace schema overrides
- adapter is required in every specs, schemas, and storage section; adapter-specific fields are nested under the adapter key
- storage section is required and must contain both changes and archive sub-keys
- All relative paths resolve from the specd.yaml directory; storage paths (fs.path in changes and archive) must remain within the repo root
- Project-level contextIncludeSpecs defaults to \['default:\*']; project-level contextExcludeSpecs defaults to \[]
- Workspace-level contextIncludeSpecs defaults to \['\*'] (all specs in that workspace); workspace-level contextExcludeSpecs defaults to \[]
- contextMode is optional; defaults to 'lazy'; must be 'full' or 'lazy' — any other value is a startup validation error
- contextMode is project-level only; it MUST NOT appear inside workspace entries
- llmOptimizedContext is optional; defaults to false; must be a boolean — any other type is a startup validation error
- context is optional; each entry is an object with exactly one key: either file or instruction — no other shapes are valid
- context file paths are resolved relative to the specd.yaml directory; absolute paths are accepted
- approvals is optional; when present it must contain at least one of spec or signoff; each is an object with required enabled boolean and optional actor string
- skills is optional; when present it must be an object (the manifest body); specd does not validate skill content beyond YAML structure
- plugins is optional; each entry must contain a package string pointing to a resolvable npm package, with optional config of any shape; specd validates structure but not plugin-specific config semantics
- graph is optional per workspace; when present, graph.respectGitignore must be boolean and graph.excludePaths must be an array of strings
- graph.excludePaths replaces built-in defaults entirely when specified; it does not merge with them
- graph.respectGitignore defaults to true; when true, .gitignore has absolute priority and cannot be overridden by excludePaths

## Examples

### Single-repo project (minimal)

```yaml
schema: '@specd/schema-std'

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

- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — schema structure, `kind`, `extends`, and resolution order
- [`specs/core/schema-merge/spec.md`](../schema-merge/spec.md) — merge engine operations used by `schemaOverrides`
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port and adapter design
- [`specs/core/storage/spec.md`](../storage/spec.md) — storage adapter behavior
- [`specs/core/spec-metadata/spec.md`](../spec-metadata/spec.md) — `.specd-metadata.yaml` format, `dependsOn` traversal in step 5
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace identity, properties, ownership, and prefix semantics

## ADRs

- [ADR-0012: Configuration File Strategy](../../../docs/adr/0012-config-file-strategy.md)
- [ADR-0013: Workspaces, Not Scopes](../../../docs/adr/0013-workspaces-not-scopes.md)
- [ADR-0014: Single Changes and Archive Storage Per Project](../../../docs/adr/0014-single-storage-per-project.md)
