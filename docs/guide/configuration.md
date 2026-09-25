---
title: Configuring Your SpecD Project
description: Practical guide to specd.yaml configuration, workspaces, adapters, and the layered config cascade.
sidebar_position: 4
---

# Configuring Your SpecD Project

`specd.yaml` is the single configuration file for a SpecD project. Every tool in the SpecD ecosystem — the CLI, the MCP server, and agent plugins — reads it to understand where your specs live, how changes are stored, and what rules govern your workflow.

This guide walks through all configuration areas conceptually and provides a complete field-by-field reference. For real-world scenario examples and multi-workspace architectures, see [Configuration Examples](./configuration-examples.md).

---

## Getting a specd.yaml

Run `specd project init` in your project root. SpecD creates a `specd.yaml` with sensible defaults for a single-repo project. You will then edit it to reflect your team's structure and policies.

SpecD discovers its configuration by walking up from the current working directory to the active VCS root, collecting all `specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, and `specd.local.*.yaml` candidate files from the first directory that contains at least one. The candidates are resolved into an active chain, deep-merged, and validated as one config. See [Config cascade and local variants](#config-cascade-and-local-variants) below for details.

---

## The minimal configuration

This is the smallest valid `specd.yaml`. It covers everything SpecD needs to operate:

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs/

storage:
  changes:
    adapter:
      type: fs
      config:
        path: .specd/changes
  drafts:
    adapter:
      type: fs
      config:
        path: .specd/drafts
  discarded:
    adapter:
      type: fs
      config:
        path: .specd/discarded
  archive:
    adapter:
      type: fs
      config:
        path: .specd/archive
```

Every other field covered in this guide is optional. Start here and add what you need.

---

## Logging

SpecD supports project-level logging settings in `specd.yaml`:

```yaml
logging:
  level: info # trace | debug | info | warn | error | silent
```

- The section is optional.
- If omitted, SpecD defaults to `info`.
- Logs are written to `{configPath}/log/specd.log` as structured JSON.
- CLI runtime verbosity can be increased with `-v` / `-vv` for console output without changing file-level defaults.

---

## Environment variables and .env support

SpecD natively supports loading environment variables from `.env` and `.env.local` files in your project root. `.env.local` has higher priority and should be used for secrets that must never be committed (like privacy salts).

The following variables map directly to root-level configuration settings and **override** values in `specd.yaml` or `specd.local.yaml`:

| Variable               | Configuration Field   |
| ---------------------- | --------------------- |
| `SPECD_ACTOR_PROVIDER` | `actorProvider`       |
| `SPECD_PRIVACY_MODE`   | `privacy.mode`        |
| `SPECD_PRIVACY_SALT`   | `privacy.salt`        |
| `SPECD_LOG_LEVEL`      | `logging.level`       |
| `SPECD_CONTEXT_MODE`   | `contextMode`         |
| `SPECD_LLM_OPTIMIZED`  | `llmOptimizedContext` |
| `SPECD_SCHEMA`         | `schemaRef`           |

---

## Identity resolution

SpecD automatically identifies the user performing an operation by probing the environment. By default, it prioritizes Version Control Systems (Git, Mercurial, Subversion) to resolve the actor's name and email.

### Manual provider selection

If you need to bypass auto-detection and force a specific identity provider, use the `actorProvider` field:

```yaml
actorProvider: git # forces git even if other systems are detected
```

This is useful in environments where multiple systems might be present or when using a custom identity plugin.

---

## Privacy

For projects in public repositories, you might want to avoid exposing real names or emails in change manifests and archives. SpecD provides built-in privacy modes to obfuscate identity data:

```yaml
privacy:
  mode: mask # hash | mask | anonymous
  excludeActors: # optional: skip obfuscation for these actors
    - 'specd'
    - 'system@getspecd.dev'
  allowedMetadataKeys: # optional: preserve specific metadata keys
    - 'department'
```

- **`mode`**: Obfuscation mode (`hash`, `mask`, or `anonymous`). _Cascade:_ **Replaces**.
- **`salt`**: Secret salt string required when `mode` is `hash`. _Cascade:_ **Replaces**.
- **`excludeActors`**: Actor names or emails exempt from obfuscation.
  - _Default:_ Built-in defaults (`'specd'`, `'system@getspecd.dev'`).
  - _Engine replacement:_ When specified in configuration, it **replaces** the built-in defaults entirely (it does not append to them). If you specify custom excluded actors, you must explicitly include `'specd'` or `'system@getspecd.dev'` if you still want them exempt.
  - _Cascade behavior:_ Array — in configuration cascade, an overlay config file (`specd.local.yaml`) **appends** to the base config file's list.
- **`allowedMetadataKeys`**: Whitelist of metadata keys preserved under active privacy modes.
  - _Default:_ None (all metadata stripped).
  - _Cascade behavior:_ Array — an overlay config file **appends** to the base config file's list.

### Privacy modes

| Mode        | Effect                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| `hash`      | Obfuscates email using HMAC-SHA256 with a salt. Requires a `salt`.        |
| `mask`      | Partially masks name and email (e.g., `j***z@e***.com`).                  |
| `anonymous` | Replaces all identity data with "Anonymous" and `anonymous@getspecd.dev`. |

When using `hash` mode, you **must** provide a salt, preferably via the `SPECD_PRIVACY_SALT` environment variable.

### Metadata privacy

By default, any active privacy mode removes the internal `providerId` and all `metadata` fields to prevent accidental PII leakage. Use `allowedMetadataKeys` to whitelist specific non-sensitive keys you wish to preserve.

---

## Runtime and state paths: specdPath and configPath

SpecD distinguishes between workflow artifact storage and runtime operational state:

```yaml
# Directory for workflow state: changes, drafts, discarded, archive
specdPath: .specd # default: .specd

# Directory for runtime-owned state: graph indexes, scratch files, logs
configPath: .specd/config # default: .specd/config
```

- **`specdPath`**: Sets the root path for SpecD lifecycle state. Storage bindings (`changes/`, `drafts/`, `discarded/`, `archive/`) resolve relative to this directory.
  - _Default:_ `.specd`
  - _Cascade behavior:_ Scalar value — an overlay config **replaces** the base value.
- **`configPath`**: Sets the root path for backend-owned runtime data. Kept separate from workflow artifacts so caches and logs can be cleaned without touching spec or change history.
  - `{configPath}/graph` for persisted graph backend databases and indexes.
  - `{configPath}/tmp` for graph staging and temporary scratch files.
  - `{configPath}/log/specd.log` for structured logging.
  - _Default:_ `.specd/config`
  - _Cascade behavior:_ Scalar value — an overlay config **replaces** the base value.

---

## Config cascade and local variants

SpecD supports a layered config cascade. Multiple YAML files in the same directory are discovered, resolved into an active chain, deep-merged, and validated as one.

### File naming and discovery order

When SpecD searches for configuration, it looks for files in this order within the directory containing `specd.yaml`:

1. `specd.yaml` — the committed project root (always the first active layer)
2. `specd.*.yaml` — named shared variants (e.g. `specd.ci.yaml`, `specd.staging.yaml`), sorted lexicographically
3. `specd.local.yaml` — personal local override
4. `specd.local.*.yaml` — named local variants (e.g. `specd.local.mono.yaml`), sorted lexicographically

Discovery walks up from the current working directory to the active VCS root and stops at the first directory containing at least one candidate file. `specd.yaml` must exist for discovery to succeed.

### Cascade resolution

Each variant file may declare an `extends` key:

| `extends` value | Behaviour                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------- |
| absent          | File becomes a **standalone root** — all previous layers are discarded and this file starts fresh |
| `true`          | File inherits from the previous active layer (or from `specd.yaml` if it is the first overlay)    |
| `<path>`        | File inherits from the named base file, but **only if that base is already in the active chain**  |

Resolution builds an active chain starting from `specd.yaml`. Each subsequent candidate is either attached (extends a layer in the chain) or skipped (its base is not active). A file with no `extends` becomes a new standalone root — everything before it is discarded.

### Forced mode (`--config`)

Passing `--config path/to/file.yaml` loads that file as a self-contained closed chain. If the file declares `extends: true`, it resolves against `specd.yaml` in the same directory. If it declares `extends: <path>`, the chain follows explicit links until no file extends further.

### Merge semantics

Layers in the active chain are deep-merged in order:

- **Scalars** — later values replace earlier ones
- **Objects** — recursively merged
- **Arrays** — later arrays **append** to earlier ones (no replacement)

### Removals

An overlay layer may declare a `remove` block to strip entries inherited from prior layers:

```yaml
extends: true
remove:
  root:
    - contextExcludeSpecs
  workspaces:
    - staging
  context:
    - id: ci-only-instruction
    - file: CI_AGENTS.md
  plugins:
    agents:
      - name: '@specd/plugin-agent-copilot'
```

| Removal target   | Keyed by                       | Effect                                |
| ---------------- | ------------------------------ | ------------------------------------- |
| `root`           | field name                     | Removes the named top-level field     |
| `workspaces`     | workspace name                 | Removes the named workspace           |
| `storage`        | storage key                    | Removes a storage binding             |
| `context`        | `id`, `file`, or `instruction` | Removes matching context entries      |
| `plugins.agents` | `name`                         | Removes a matching plugin declaration |

Removals are applied immediately after the layer that declares them is merged. A `remove` block without `extends` is an error.

### Gitignored local files

`specd project init` adds both `specd.local.yaml` and `specd.local.*.yaml` to `.gitignore` automatically. Local variants are for personal experimentation: trying a different schema branch, pointing at a local schema copy, or testing a configuration change without affecting the rest of the team.

### Common patterns

**Personal local override:**

```yaml
# specd.local.yaml
extends: true
schema: './my-local-schema'
```

**CI-specific variant:**

```yaml
# specd.ci.yaml
extends: true
context:
  - instruction: 'Running in CI. Skip interactive prompts.'
remove:
  plugins:
    agents:
      - name: '@specd/plugin-agent-copilot'
```

**Standalone local config (fresh start, no inheritance):**

```yaml
# specd.local.yaml — no extends key
schema: '@specd/schema-std'
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
```

### Bootstrap mode exceptions (`--path`)

Some `specd graph` CLI commands support an unconfigured repository bootstrap mode for initial indexing and exploration before a project has a `specd.yaml`:

- Passing `--path <repo-root>` forces bootstrap mode and is mutually exclusive with `--config`.
- When no `specd.yaml` is discovered in the directory walk up to the VCS root, those graph commands fall back to bootstrap mode automatically.

In bootstrap mode, SpecD behaves as if the repository were a single synthetic `default` workspace with `codeRoot` set to the VCS root. Any discovered `specd.yaml` is ignored when `--path` is explicitly provided. Bootstrap mode is intended for exploratory graph queries; once a project is initialized with `specd project init`, standard configured execution should always be preferred.

---

## Schema selection

The `schema` field tells SpecD which workflow schema to use. Schemas define your artifact types, lifecycle steps, and validation rules. There is exactly one active schema per project.

SpecD resolves the `schema` value using a prefix convention:

| Value                            | Where SpecD looks                                                               |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `'@specd/schema-std'`            | npm package in `node_modules/@specd/schema-std/schema.yaml`                     |
| `'my-workflow'`                  | Bare name — `.specd/schemas/my-workflow/schema.yaml` in the default workspace   |
| `'#my-workflow'`                 | Hash prefix — equivalent to bare name, explicit about resolving from `default`  |
| `'#billing:my-schema'`           | Workspace-qualified — resolves from the `billing` workspace's schemas directory |
| `'./schemas/custom/schema.yaml'` | Relative path from the `specd.yaml` directory                                   |

Most projects start with `@specd/schema-std`. If you need a workflow that differs substantially from the standard one, you can author a local schema and reference it by name. Local schemas live inside your repository and evolve with your project.

To customise the standard schema without forking it, use `schemaOverrides` — covered below.

---

## Workspaces

A workspace tells SpecD where a set of specs lives and what relationship the project has with them.

Every `specd.yaml` must declare a `default` workspace. This is the local project workspace — the one the current repository owns. Additional workspaces reference external repositories or sub-directories within a monorepo.

### The default workspace

```yaml
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
```

This is the minimum. Two useful optional fields:

- **`codeRoot`** — the directory where implementation code lives, relative to `specd.yaml`. Defaults to the project root. Useful if your code lives in a subdirectory.
- **`ownership`** — defaults to `owned`, meaning this project freely proposes changes to these specs. The default is almost always correct for the `default` workspace.

### Additional workspaces

In a monorepo or multi-repo setup, you can declare workspaces that point elsewhere:

```yaml
workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs/

  payments:
    specs:
      adapter:
        type: fs
        config:
          path: packages/payments/specs
    codeRoot: packages/payments
    ownership: owned

  platform:
    specs:
      adapter:
        type: fs
        config:
          path: ../platform-repo/specd/specs
    codeRoot: ../platform-repo
    ownership: readOnly
```

`codeRoot` is required for any workspace that is not `default` — there is no sensible default.

> [!IMPORTANT]
> The workspace identifier `'root'` is reserved for project-global graph identities and cannot be used as a workspace name in `workspaces`.

The `ownership` field describes the project's relationship with each workspace's specs:

| Value      | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `owned`    | This project freely proposes and modifies specs here.          |
| `shared`   | Co-owned; changes may require coordination with other teams.   |
| `readOnly` | This project reads specs for context but does not modify them. |

`readOnly` is the default for non-`default` workspaces. Use it for external dependencies whose specs you want in context but do not control.

### Custom spec metadata location (`metadataPath`)

By default, spec metadata (`metadata.json`, validation status cache) is resolved automatically:

- For internal workspaces: `{specdPath}/metadata`
- For external workspaces: The nearest `.specd/metadata` traversing upwards from `codeRoot`

You can customize this location on the specs adapter via `metadataPath`:

```yaml
workspaces:
  payments:
    specs:
      adapter:
        type: fs
        config:
          path: packages/payments/specs
          metadataPath: packages/payments/.specd/metadata
```

### Workspace prefixes

Spec IDs always use the form `workspace:capability-path`. A spec in the `payments` workspace at `specs/checkout.md` has the ID `payments:checkout`. If you want every spec in a workspace to live under a leading path segment — for example to mirror a directory structure — you can declare `prefix`:

```yaml
workspaces:
  default:
    prefix: _global
    specs:
      adapter:
        type: fs
        config:
          path: specs/_global
```

With this configuration, specs under `specs/_global/` are addressed as `default:_global/architecture`.

`prefix` does not replace the workspace name in the spec ID. It prepends a path segment to the capability-path portion. In other words:

- workspace name: `default`
- prefix: `_global`
- resulting spec ID: `default:_global/architecture`

Each prefix segment must match `/^[a-z0-9_][a-z0-9_-]*$/`. Multi-segment prefixes (e.g. `shared/utils`) are separated by `/`, without leading or trailing slashes.

Concrete example:

- `specsPath` is `specs/_global`
- the spec lives on disk at `specs/_global/architecture`
- relative to the workspace root, the spec path is just `architecture`

Without `prefix`, the spec ID would therefore be `default:architecture`. `prefix: _global` exists precisely to add that lost leading path segment back into the capability-path, producing `default:_global/architecture`.

- _Default:_ None (bare capability paths).
- _Cascade behavior:_ Scalar value — an overlay config **replaces** the base prefix.

### Workspace schemas

Workspaces can optionally declare their own schema repository using the `schemas` adapter binding:

```yaml
workspaces:
  default:
    specs:
      adapter:
        type: fs
        config:
          path: specs/
    schemas:
      adapter:
        type: fs
        config:
          path: .specd/schemas
```

- When declared, schemas in that directory can be referenced via `#workspace:schema-name` (or `#schema-name` for `default`).
- _Default:_ `null` (no local workspace schemas; schema references targeting workspaces without `schemas` fail validation).
- _Cascade behavior:_ Object — deep merged with base workspace config.

### Workspace-level context specs

Workspaces can define targeted spec inclusion and exclusion filters that activate only when that workspace is touched by a change:

```yaml
workspaces:
  billing:
    specs:
      adapter: fs
      fs:
        path: packages/billing/specs
    contextIncludeSpecs:
      - 'billing:api/*' # include billing API specs when billing is active
    contextExcludeSpecs:
      - 'billing:internal/*' # exclude internal billing specs
```

- **`contextIncludeSpecs`**: Patterns matching specs in this workspace that must be included when active.
  - _Default:_ None (only specs explicitly declared in the change and their dependencies are included).
  - _Cascade behavior:_ Array — **appends** to inherited include patterns.
- **`contextExcludeSpecs`**: Patterns matching specs in this workspace to exclude from context.
  - _Default:_ None.
  - _Cascade behavior:_ Array — **appends** to inherited exclude patterns.

### Workspace code graph settings

Each workspace can fine-tune its code graph discovery inside its `codeRoot`:

```yaml
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    graph:
      respectGitignore: true # default: true
      excludePaths:
        - 'dist/**'
        - 'coverage/**'
      allowedPaths:
        - 'src/**'
```

- **`respectGitignore`**: Whether `.gitignore` files inside `codeRoot` are respected during symbol and file indexing.
  - _Default:_ `true`. When set to `false`, files ignored by Git are still discovered unless matched by `excludePaths`.
  - _Cascade behavior:_ Scalar boolean — **replaces** the base setting.
- **`excludePaths`**: Additional gitignore-syntax exclusion patterns relative to `codeRoot`.
  - _Default:_ None (inherits project-level and built-in defaults).
  - _Cascade behavior:_ Array — **appends** to project-level and workspace-level excludes.

  **Monorepo child workspace isolation pattern:**
  In monorepos where `workspaces.default.codeRoot` is `.` (the repository root), SpecD's file discovery traverses the entire project tree under `default`. If child workspaces define their own `codeRoot` pointing to subdirectories (e.g. `packages/core`, `packages/cli`, `apps/web`), the default workspace would physically crawl and index those directories as well. This leads to duplicate symbol definitions and index collisions.

  To prevent this, configure `workspaces.default.graph.excludePaths` to explicitly exclude child workspace directories:

  ```yaml
  workspaces:
    default:
      prefix: _global
      specs:
        adapter: fs
        fs:
          path: specs/_global
      codeRoot: .
      graph:
        excludePaths:
          - node_modules/
          - .git/
          - .specd/
          - dist/
          - build/
          - coverage/
          - packages/ # Indexed independently by child workspaces
          - apps/ # Indexed independently by child workspaces
          - specs/
          - specd-sdd/

    core:
      specs:
        adapter:
          type: fs
          config:
            path: specs/core
      codeRoot: packages/core
  ```

- **`allowedPaths`**: Allowlist restricting graph indexing to specific subdirectories within `codeRoot`.
  - _Default:_ None (entire `codeRoot` is visible to graph).
  - _Cascade behavior:_ Array — **appends**.

---

## Storage

`storage` declares where SpecD persists changes during their lifecycle. All four sub-keys are required.

```yaml
storage:
  changes:
    adapter:
      type: fs
      config:
        path: .specd/changes
  drafts:
    adapter:
      type: fs
      config:
        path: .specd/drafts
  discarded:
    adapter:
      type: fs
      config:
        path: .specd/discarded
  archive:
    adapter:
      type: fs
      config:
        path: .specd/archive
```

Each directory holds changes in a different state:

- **`changes`** — active changes currently in progress
- **`drafts`** — shelved changes that can be restored at any time
- **`discarded`** — abandoned changes, kept for reference but no longer active
- **`archive`** — completed changes; the permanent record after archiving

All paths resolve relative to the `specd.yaml` directory and must stay within the repository root.

### Adapter bindings and kernel extensions

Every workspace and storage declaration is a named adapter binding:

```yaml
specs:
  adapter:
    type: fs
    config:
      path: specs/
```

The built-in path is `fs`, but `createKernel(config, options)` and `createKernelBuilder(config)` can register additive storage factories under other adapter names. The config loader preserves the selected adapter name and its configuration block; the kernel then validates that the named factory exists in the merged registry.

That split is deliberate:

- `FsConfigLoader` resolves and validates `fs` paths
- the kernel validates whether non-built-in adapter names are actually registered

Use this when you need a custom storage backend without forking the core workflow model.

By default, `specd project init` adds `.specd/drafts/` and `.specd/discarded/` to `.gitignore`. Teams who want to commit drafts — for example, to share in-progress work across machines — can remove those entries.

### Organising the archive

By default, archived changes are stored with the name `{{change.archivedName}}` — a timestamped directory name in the format `YYYYMMDD-HHmmss-<name>`, for example `20260924-143511-add-auth-flow`. You can customise this hierarchy with the `pattern` field using direct token replacement:

```yaml
archive:
  adapter:
    type: fs
    config:
      path: .specd/archive
      pattern: '{{year}}/{{month}}/{{change.archivedName}}'
```

This organises archived changes into structured subdirectories (e.g. yearly and monthly folders).

| Variable                  | Value                                                             | Example                         |
| :------------------------ | :---------------------------------------------------------------- | :------------------------------ |
| `{{change.archivedName}}` | Full timestamped directory name (default)                         | `20260924-143511-add-auth-flow` |
| `{{change.name}}`         | Change slug name                                                  | `add-auth-flow`                 |
| `{{year}}`                | Four-digit calendar year at archive time (`YYYY`)                 | `2026`                          |
| `{{month}}`               | Two-digit calendar month at archive time (`MM`, `01`–`12`)        | `09`                            |
| `{{day}}`                 | Two-digit calendar day of month at archive time (`DD`, `01`–`31`) | `24`                            |
| `{{date}}`                | Calendar date at archive time (`YYYY-MM-DD`)                      | `2026-09-24`                    |

---

## Context configuration

SpecD compiles a context block for the agent at each lifecycle step. The context includes relevant specs, schema instructions, and any additional content you inject here.

### Injecting files and instructions

The `context` field at the top level injects content before any spec content, for every change in the project:

```yaml
context:
  - id: agents-guidance
    file: AGENTS.md
  - id: edit-preference
    instruction: 'Always prefer editing existing files over creating new ones.'
```

- `file` entries are read at compile time and injected verbatim. If the file does not exist, a warning is emitted and the entry is skipped.
- `instruction` entries are injected as-is.
- `id` is an optional unique identifier for the entry. Specifying an `id` allows downstream cascade layers (such as `specd.local.yaml`) to cleanly remove or replace the entry via `remove.context: [{ id: 'edit-preference' }]`.

This is the right place for project-wide agent guidance — coding conventions, team norms, architectural principles.

### Controlling which specs are included

By default, only the specs declared by the change and their explicit dependencies are included in context. You can expand or narrow this with `contextIncludeSpecs` and `contextExcludeSpecs`.

These can be declared at two levels:

- **Project level** — patterns apply to every compiled context, regardless of which change is active. Use this for specs that should always be present: global constraints, cross-cutting architecture specs.
- **Workspace level** — patterns apply only when that workspace is active in the current change (i.e., at least one of its specs is listed in the change).

```yaml
# Always include global constraints
contextIncludeSpecs:
  - 'default:_global/*'

# Never include commit message guidelines (not relevant to agents)
contextExcludeSpecs:
  - 'default:commits'
```

Pattern syntax:

| Pattern              | Matches                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `*`                  | All specs in all workspaces (at project level) or this workspace (at workspace level)         |
| `workspace:*`        | All specs in the named workspace                                                              |
| `prefix/*`           | All specs under `prefix/`                                                                     |
| `workspace:prefix/*` | All specs under `prefix/` in the named workspace                                              |
| `path/name`          | Exact spec path (resolved from `default` at project level, this workspace at workspace level) |

`*` is only valid in three positions: alone, as `workspace:*`, or as a path suffix (`prefix/*`).

### Spec collection order and priority

During context compilation, SpecD collects and filters specs in a deterministic 6-step pipeline:

1. **Change specs (`specIds`)**: Specs directly declared on the active change (`change.specIds`) are seeded and protected from exclusion.
2. **Direct dependencies (`specDependsOn`)**: Direct dependencies declared on change specs are included.
3. **Project-level includes (`contextIncludeSpecs`)**: Project-wide glob patterns are matched and added.
4. **Project-level excludes (`contextExcludeSpecs`)**: Project-wide exclude patterns remove matching non-protected specs.
5. **Workspace-level filters**: For each active workspace in the change:
   - Workspace `contextIncludeSpecs` are added.
   - Workspace `contextExcludeSpecs` are removed.
6. **Transitive dependency traversal**: When `followDeps` is enabled, specs reachable via `dependsOn` traversal are added (and survive exclude rules).

**Deduplication rule:** A spec matching multiple include rules appears only once in compiled context, retaining first-match ordering.

### Context rendering mode

`contextMode` controls how specs are formatted and presented in the compiled context delivered to AI agents:

```yaml
contextMode: summary # default: summary (list | summary | full | hybrid)
```

- **`summary`** _(default)_ — Renders spec catalogue entries (title and description) extracted from frontmatter and overview headings. This delivers the highest signal-to-token ratio and keeps prompt context compact for routine tasks.
- **`hybrid`** — Renders specs directly touched or modified by the active change with their complete Markdown content, while transitively referenced specs (via `dependsOn`) are rendered as metadata summaries.
- **`full`** — Renders every in-context spec with its complete, verbatim Markdown content. Useful for complex refactoring where agents require the full text of all dependencies.
- **`list`** — Renders only spec identifiers with source and mode metadata (minimal tokens).
- _Cascade behavior:_ Scalar value — an overlay config **replaces** the base mode.
- _Environment override:_ `SPECD_CONTEXT_MODE`.

---

## Approval gates

By default, the change lifecycle flows freely. Two optional gates can require explicit human approval before a change advances:

```yaml
approvals:
  spec: false # default
  signoff: false # default
```

Setting either gate to `true` changes the lifecycle:

| Gate      | Effect when `true`                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spec`    | `ready → implementing` is blocked until a human runs `specd approve spec`. The change must pass through `pending-spec-approval → spec-approved` first. |
| `signoff` | `done → archivable` is blocked until a human runs `specd approve signoff`. The change must pass through `pending-signoff → signed-off` first.          |

The two gates are independent — you can enable either or both.

Enable `spec` approval when your team wants a human review of the spec design before any code is written. Enable `signoff` approval for compliance requirements or regulated environments where a named person must sign off on each completed change before it is committed to the archive.

Both approval records capture the approver's git identity, a reason, and a hash of the artifacts at approval time — creating a tamper-evident audit trail.

---

## Invalidation policy

When a change's validated artifacts drift from their baseline (files edited on disk after validation) or when you manually invalidate a change, SpecD reopens artifacts for review. The `invalidationPolicy` field controls how far that reopening propagates:

```yaml
invalidationPolicy: downstream # default
```

| Policy       | What gets reopened                                                                           |
| ------------ | -------------------------------------------------------------------------------------------- |
| `none`       | Nothing. Drift is tracked but artifacts stay `complete`. Status shows `complete-with-drift`. |
| `surgical`   | Only the specific files that changed.                                                        |
| `downstream` | Changed files plus all artifacts that depend on them in the DAG. This is the default.        |
| `global`     | Every artifact in the change, regardless of which file triggered the invalidation.           |

The project-level default is persisted on each change at creation time. You can change it per-change with:

```bash
specd changes edit my-change --invalidation-policy surgical
```

Or override it for a single manual invalidation:

```bash
specd changes invalidate my-change --reason "API changed" --target specs --policy surgical
```

Under `none`, drift is still visible — `changes status` and `changes artifacts` show `complete-with-drift` and a `[drift]` tag — but the lifecycle is not blocked and artifacts are not reopened. Use `none` when you want informational drift tracking without automatic reopening.

---

## Schema overrides

`schemaOverrides` lets you customise the active schema for your project without forking it or publishing a new package. Changes are applied inline, on top of whatever schema is declared in the `schema` field.

This is the recommended way to add project-specific automation and rules.

### Operations

| Operation | What it does                                                                |
| --------- | --------------------------------------------------------------------------- |
| `append`  | Adds entries to the end of an array (hooks, artifact rules, artifacts)      |
| `prepend` | Adds entries to the start of an array                                       |
| `create`  | Adds a new artifact or workflow step that does not exist in the base schema |
| `set`     | Replaces a scalar field or a whole array entry by identity                  |
| `remove`  | Removes entries from an array by identity                                   |

Each operation targets one or more schema sections: `artifacts`, `workflow`, or `metadataExtraction`.

### Common uses

**Adding shell hooks to lifecycle steps:**

```yaml
schemaOverrides:
  append:
    workflow:
      - step: implementing
        hooks:
          post:
            - id: run-tests
              run: 'pnpm test'
            - id: run-lint
              run: 'pnpm lint'
      - step: archiving
        hooks:
          pre:
            - id: pre-archive-tests
              run: 'pnpm test'
```

This runs tests and lint after each implementing step, and runs tests again before archiving. If a `run:` hook exits non-zero, the transition is aborted.

**Adding instruction hooks:**

```yaml
schemaOverrides:
  append:
    workflow:
      - step: designing
        hooks:
          post:
            - id: check-global-compliance
              instruction: >-
                Before finishing design, review all artifacts against the global specs.
                Flag any violation before transitioning to ready.
```

Instruction hooks inject text into the compiled context at that lifecycle step. Use them to remind the agent of project-specific checks.

**Adding per-artifact rules:**

```yaml
schemaOverrides:
  append:
    artifacts:
      - id: design
        rules:
          post:
            - id: check-adr-references
              text: 'Architecture decisions must reference an ADR number.'
```

This adds a rule injected into the compiled context alongside the schema's own instruction for the `design` artifact. It is additive — it does not replace the schema's instruction.

Hook and rule entries in `schemaOverrides` require an `id` field. This is how subsequent `append`, `prepend`, `set`, and `remove` operations identify individual entries within an array.

### Real example: specd's own configuration

The specd project uses `schemaOverrides` to enforce its own global constraints during development:

```yaml
schemaOverrides:
  append:
    artifacts:
      - id: design
        rules:
          post:
            - id: check-global-specs-compliance
              text: >-
                Cross-reference this design against the global specs:
                architecture (hexagonal layers, dependency direction, no I/O in domain),
                conventions (naming, exports, ESM, no default exports, no any),
                and testing (test structure, coverage). Flag any decision that violates
                a global constraint before proceeding.
    workflow:
      - step: designing
        hooks:
          post:
            - id: designing-check-global-specs
              instruction: >-
                Before finishing design, review all artifacts and deltas in this change
                against the global specs. Check compliance with architecture, conventions,
                testing, and any other applicable global constraint. Flag violations
                before transitioning to ready.
      - step: implementing
        hooks:
          post:
            - id: implementing-run-tests
              run: 'pnpm test'
            - id: implementing-run-lint
              run: 'pnpm lint'
      - step: archiving
        hooks:
          pre:
            - id: archiving-run-tests
              run: 'pnpm test'
            - id: archiving-run-lint
              run: 'pnpm lint'
```

---

## Schema plugins

`schemaPlugins` lists schema reference strings that are loaded and merged into the active schema before `schemaOverrides` is applied. Each entry uses the same resolution rules as the top-level `schema` field.

```yaml
schemaPlugins:
  - '@acme/specd-plugin-compliance'
  - '#billing:billing-plugin'
```

Plugins are full schema layers — they can add or modify artifacts, workflow steps, and metadata extraction rules in bulk. They are applied in declaration order. `schemaOverrides` is applied after all plugins, so your inline overrides always take final precedence.

Use plugins when you have a set of schema customisations that is shared across multiple projects and you want to manage it as a versioned package.

---

## LLM-optimised context

```yaml
llmOptimizedContext: true # default: false
```

When `true`, SpecD prefers LLM-optimized descriptions and context blocks when available. This improves agent performance and reduces token usage by providing a condensed, high-signal representation of specs and project background.

When enabled:

- **Agents** populate `optimizedDescription` and `optimizedContext` fields in `metadata.json`.
- **Compilers** prefer these fields over raw artifact content.
- **Cache**: Project-level background context is cached in `project-metadata.json` and verified with hashes.

When `false` or absent, SpecD uses standard deterministic extraction from Markdown artifacts.

Set this to `true` to unblock advanced agent features and optimize token costs.

- _Default:_ `false`
- _Cascade behavior:_ Scalar boolean — an overlay config **replaces** the base setting.
- _Environment override:_ `SPECD_LLM_OPTIMIZED`.

---

## Code Graph configuration

SpecD includes an in-memory and persisted code graph for symbol indexing, dependency blast-radius analysis, and architectural impact assessment. Configure global indexing boundaries with the top-level `graph` section:

```yaml
graph:
  includePaths:
    - 'apps/**'
    - 'packages/**'
  excludePaths:
    - '**/*.test.ts'
    - '**/*.spec.ts'
    - '**/node_modules/**'
    - '**/dist/**'
```

- **`includePaths`**: Project-global glob patterns (relative to the project root) included in the code graph, indexed under the reserved `root:` namespace.
  - _Default:_ None (all discovered files within registered workspace `codeRoot` directories are indexed).
  - _Cascade behavior:_ Array — an overlay config **appends** to inherited include paths.
- **`excludePaths`**: Project-global gitignore-syntax patterns excluded during symbol, file, and spec discovery across all workspaces.
  - _Default:_ Built-in defaults (`node_modules/`, `.git/`, `.hg/`, `.svn/`, `.specd/`, `dist/`, `build/`, `coverage/`, `.next/`, `.nuxt/`).
  - _Engine replacement:_ When `graph.excludePaths` is specified in your configuration, it **replaces** the built-in defaults entirely (it does not append to them). If you specify custom exclusions, you should include standard directories you still wish to exclude, or rely on `.gitignore` with `respectGitignore: true`.
  - _Cascade behavior:_ Array — in configuration cascade, an overlay config file (`specd.local.yaml`) **appends** to the base config file's (`specd.yaml`) exclusion patterns. Workspace-level `graph.excludePaths` are also additive on top of this global set.

---

## Plugins

SpecD supports agent plugins that integrate with coding assistants (Claude Code, Copilot, Codex, OpenCode):

```yaml
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-copilot'
      config:
        model: 'gpt-4o'
```

- **`plugins.agents`**: A list of agent plugin declarations.
  - `name`: Package or module name of the plugin (e.g. `'@specd/plugin-agent-claude'`).
  - `config`: Optional plugin-specific configuration record passed to the plugin adapter during initialization.
  - _Default:_ None (no third-party plugins loaded; built-in plugins activate via project defaults).
  - _Cascade behavior:_ Array — an overlay config **appends** new plugin declarations to the inherited list. To remove an inherited plugin in an overlay config, use `remove.plugins.agents: [{ name: '@specd/plugin-agent-copilot' }]`.

### Synchronizing plugin assets with `specd project update`

Declaring agent plugins in `specd.yaml` registers their configuration in the project, but does not alter files on disk automatically. To synthesize, regenerate, or update the agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, etc.) and skill assets corresponding to declared plugins, run:

```bash
specd project update
```

- **When `specd project update` is required:**
  - After manually editing `plugins.agents` in `specd.yaml` (e.g. adding, removing, or reconfiguring plugins by hand rather than using `specd plugins install`).
  - After upgrading SpecD CLI or agent plugin packages (`pnpm update @specd/cli` or `@specd/plugin-agent-*`), to regenerate agent instructions and skill templates with the newest upstream definitions.
- **When `specd project update` is NOT required:**
  - For normal configuration changes (`workspaces`, `codeRoot`, `ownership`, `specs`, `archivePattern`, `contextIncludeSpecs`, etc.). SpecD reloads `specd.yaml` dynamically on every command execution, so general configuration updates take effect immediately in real time without needing any update command.

---

## Config cascade and local variants

SpecD projects support layered configuration through candidate files in the same directory:

- `specd.yaml`: Base project configuration committed to version control.
- `specd.<variant>.yaml`: Shared variant configuration (e.g. `specd.ci.yaml`).
- `specd.local.yaml`: Developer-local overrides (automatically gitignored).
- `specd.local.<variant>.yaml`: Variant-specific developer-local overrides.

### Inheritance with `extends`

A config layer can inherit from prior candidates in the cascade:

```yaml
# specd.local.yaml
extends: true # Inherit from the preceding configuration candidate

logging:
  level: debug # Override just the log level locally
```

Or inherit explicitly from another config file path:

```yaml
extends: '../shared/specd.base.yaml'
```

### Targeted removals with `remove`

When extending a configuration, you can explicitly remove inherited elements:

```yaml
extends: true
remove:
  workspaces:
    - legacy-app # Exclude a workspace in your local environment
  context:
    - id: global-notice # Remove a specific context injection entry
```

---

## Validating your configuration

Run `specd config validate` at any time to check your configuration:

```bash
specd config validate
```

This runs a stricter check than the startup validator:

- Unknown workspace qualifiers in context patterns are **errors**, not warnings — a typo silently excludes specs from context, which is a dangerous silent failure in team environments.
- Patterns that match no specs on disk emit warnings — useful for catching typos early.

### Startup validation matrix

SpecD validates `specd.yaml` before executing any command that requires configuration.

#### Errors that abort startup

The following conditions are hard errors — SpecD exits immediately:

| Condition                                                                        | Error Cause                                                      |
| :------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| `schema` field is missing                                                        | Config is invalid without a schema reference.                    |
| `workspaces` section is missing or has no `default` workspace                    | Every project must declare a default workspace.                  |
| `specs` section is missing in any workspace                                      | SpecD cannot locate specs without a specs adapter path.          |
| `codeRoot` is missing in any non-`default` workspace                             | Required for non-default workspaces; no sensible default exists. |
| `storage` section is missing, or `changes` or `archive` sub-key is absent        | Both storage directories are mandatory.                          |
| `adapter` is missing in any `specs`, `schemas`, or `storage` section             | Required in every storage declaration.                           |
| Required adapter-specific fields are absent (e.g. `config.path` when `type: fs`) | The adapter cannot function without its required options.        |
| An adapter name has no registered factory at kernel construction time            | The kernel rejects unknown named adapters with a clear error.    |
| Storage or config path resolves outside the repository root                      | Paths must remain within the VCS repository root boundary.       |
| Invalid `contextIncludeSpecs` or `contextExcludeSpecs` pattern syntax            | e.g. `*` in a disallowed position.                               |
| `llmOptimizedContext` is not a boolean                                           | Any other type is rejected.                                      |
| Legacy `artifactRules` or `skills` fields are present                            | Use `schemaOverrides` or the plugin system instead.              |

#### Warnings that allow startup to proceed

| Condition                                                  | Warning Behavior                                                             |
| :--------------------------------------------------------- | :--------------------------------------------------------------------------- |
| Duplicate workspace names                                  | YAML parser retains last-wins; the duplicate is flagged as a probable error. |
| Unknown workspace qualifier in a context pattern (runtime) | A typo silently excludes specs; warned at runtime.                           |

#### Commands that skip validation entirely

The following lightweight or bootstrap commands do not require a valid `specd.yaml`:

- `--help`, `--version`
- `specd project init`
- `specd config validate`
- `specd plugin` subcommands
- `specd graph` commands run with `--path <repo-root>` (bootstrap mode)

## Complete configuration reference and cascade rules

The table below catalogs every configuration option supported by `specd.yaml` and its cascade layers, including its level, data type, default value, how it behaves under the layered configuration cascade (whether overlay values **replace** base scalars, **append** to arrays, or **deep-merge** objects), and its operational effect.

| Option                                     | Level         | Type                                                            | Default                                          | Cascade Rule                                  | Effect & Description                                                                                                                                                                                                                |
| :----------------------------------------- | :------------ | :-------------------------------------------------------------- | :----------------------------------------------- | :-------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`                                   | Project       | `string`                                                        | _(Required)_                                     | **Replaces**                                  | Reference to the active workflow schema (e.g. `'@specd/schema-std'`, `'#workspace:schema'`, `'./path'`). Overridden by `SPECD_SCHEMA`.                                                                                              |
| `specdPath`                                | Project       | `string`                                                        | `'.specd'`                                       | **Replaces**                                  | Directory for SpecD state and change tracking directories (`changes/`, `drafts/`, `discarded/`, `archive/`).                                                                                                                        |
| `configPath`                               | Project       | `string`                                                        | `'.specd/config'`                                | **Replaces**                                  | Root directory for backend-owned operational data (graph databases, logs, temporary scratch files).                                                                                                                                 |
| `workspaces`                               | Project       | `Record<string, Workspace>`                                     | `{ default: ... }`                               | **Deep-merges**                               | Map of workspace definitions. Must contain at least `default`. Merged per workspace name; remove with `remove.workspaces`. Identifier `'root'` is reserved and rejected.                                                            |
| `workspaces.<name>.specs`                  | Workspace     | `AdapterBinding`                                                | _(Required)_                                     | **Deep-merges**                               | Named adapter binding for specs repository (e.g. `adapter: { type: 'fs', config: { path: 'specs/' } }`).                                                                                                                            |
| `workspaces.<name>.specs.metadataPath`     | Workspace     | `string`                                                        | `{specdPath}/metadata`                           | **Replaces**                                  | Optional custom path for workspace spec metadata and validation status cache (`metadata.json`). Resolves to nearest `.specd/metadata` upwards for external workspaces.                                                              |
| `workspaces.<name>.prefix`                 | Workspace     | `string`                                                        | `null` (None)                                    | **Replaces**                                  | Logical path prefix prepended to all spec IDs in this workspace (e.g. `_global` -> `default:_global/spec`). Must match `/^[a-z0-9_][a-z0-9_-]*$/` per segment.                                                                      |
| `workspaces.<name>.schemas`                | Workspace     | `AdapterBinding`                                                | `null` (None)                                    | **Deep-merges**                               | Optional adapter binding for workspace-local custom schemas.                                                                                                                                                                        |
| `workspaces.<name>.codeRoot`               | Workspace     | `string`                                                        | `'.'` for `default`, _(Required)_ for others     | **Replaces**                                  | Filesystem directory where implementation source code lives relative to `specd.yaml`.                                                                                                                                               |
| `workspaces.<name>.ownership`              | Workspace     | `'owned' \| 'shared' \| 'readOnly'`                             | `'owned'` for `default`, `'readOnly'` for others | **Replaces**                                  | Governance relationship: `owned` (fully mutable), `shared` (co-owned), or `readOnly` (context-only).                                                                                                                                |
| `workspaces.<name>.contextIncludeSpecs`    | Workspace     | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Patterns matching specs in this workspace that must be included in context when this workspace is active.                                                                                                                           |
| `workspaces.<name>.contextExcludeSpecs`    | Workspace     | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Patterns matching specs in this workspace to exclude from context when this workspace is active.                                                                                                                                    |
| `workspaces.<name>.graph.respectGitignore` | Workspace     | `boolean`                                                       | `true`                                           | **Replaces**                                  | When `true`, Git-ignored files in `codeRoot` are skipped during code graph indexing. When `false`, they are discovered.                                                                                                             |
| `workspaces.<name>.graph.excludePaths`     | Workspace     | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Gitignore-syntax patterns relative to `codeRoot` excluded from graph indexing. Additive over project excludes.                                                                                                                      |
| `workspaces.<name>.graph.allowedPaths`     | Workspace     | `string[]`                                                      | `[]` (Entire codeRoot)                           | **Appends**                                   | Inclusions restricting code graph index visibility to specific subdirectories within `codeRoot`.                                                                                                                                    |
| `actorProvider`                            | Project       | `string`                                                        | Auto-detected                                    | **Replaces**                                  | Forces a specific VCS actor identity provider (e.g. `'git'`, `'hg'`). Overridden by `SPECD_ACTOR_PROVIDER`.                                                                                                                         |
| `privacy.mode`                             | Project       | `'hash' \| 'mask' \| 'anonymous'`                               | `null` (None)                                    | **Replaces**                                  | Identity obfuscation strategy for manifests and archives. Overridden by `SPECD_PRIVACY_MODE`.                                                                                                                                       |
| `privacy.salt`                             | Project       | `string`                                                        | `null`                                           | **Replaces**                                  | Secret salt string required when `privacy.mode` is `'hash'`. Overridden by `SPECD_PRIVACY_SALT`.                                                                                                                                    |
| `privacy.excludeActors`                    | Project       | `string[]`                                                      | `['specd', 'system@getspecd.dev']`               | **Appends** (cascade) / **Replaces defaults** | Case-insensitive actors exempt from obfuscation. When specified, replaces built-in defaults (`specd`, `system@getspecd.dev`). Overlay files in cascade append to base config.                                                       |
| `privacy.allowedMetadataKeys`              | Project       | `string[]`                                                      | `[]` (Strips all)                                | **Appends**                                   | Whitelist of non-PII metadata keys preserved under active privacy modes.                                                                                                                                                            |
| `storage.changes`                          | Project       | `AdapterBinding`                                                | `.specd/changes`                                 | **Deep-merges**                               | Named adapter binding for in-progress change directories.                                                                                                                                                                           |
| `storage.drafts`                           | Project       | `AdapterBinding`                                                | `.specd/drafts`                                  | **Deep-merges**                               | Named adapter binding for shelved drafts.                                                                                                                                                                                           |
| `storage.discarded`                        | Project       | `AdapterBinding`                                                | `.specd/discarded`                               | **Deep-merges**                               | Named adapter binding for abandoned changes.                                                                                                                                                                                        |
| `storage.archive`                          | Project       | `AdapterBinding`                                                | `.specd/archive`                                 | **Deep-merges**                               | Named adapter binding for permanent change archive records.                                                                                                                                                                         |
| `storage.archive.pattern`                  | Project       | `string`                                                        | `'{{change.archivedName}}'`                      | **Replaces**                                  | Direct token replacement pattern defining archive subfolder hierarchy (e.g. `'{{year}}/{{month}}/{{change.archivedName}}'`). Supports `{{year}}`, `{{month}}`, `{{day}}`, `{{date}}`, `{{change.name}}`, `{{change.archivedName}}`. |
| `approvals.spec`                           | Project       | `boolean`                                                       | `false`                                          | **Replaces**                                  | When `true`, blocks `ready → implementing` until human reviewer records `specd changes approve-spec`.                                                                                                                               |
| `approvals.signoff`                        | Project       | `boolean`                                                       | `false`                                          | **Replaces**                                  | When `true`, blocks `done → archivable` until human reviewer records `specd changes signoff`.                                                                                                                                       |
| `graph.includePaths`                       | Project       | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Global file globs included in code graph indexing under reserved `root:` namespace.                                                                                                                                                 |
| `graph.excludePaths`                       | Project       | `string[]`                                                      | Built-in defaults                                | **Appends** (cascade) / **Replaces defaults** | Global file globs excluded from discovery. When specified, replaces built-in defaults (`node_modules/`, `.git/`, `dist/`, etc.). Overlay files in cascade append to base config.                                                    |
| `logging.level`                            | Project       | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'silent'` | `'info'`                                         | **Replaces**                                  | Minimum threshold for `{configPath}/log/specd.log`. Overridden by `SPECD_LOG_LEVEL`.                                                                                                                                                |
| `context`                                  | Project       | `ContextEntry[]`                                                | `[]` (None)                                      | **Appends**                                   | Static `{ id?: string, file?: string }` or `{ id?: string, instruction?: string }` blocks injected into every compiled context for AI agents.                                                                                       |
| `contextIncludeSpecs`                      | Project       | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Global spec inclusion patterns applied across all compiled contexts regardless of active workspace.                                                                                                                                 |
| `contextExcludeSpecs`                      | Project       | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Global spec exclusion patterns applied across all compiled contexts.                                                                                                                                                                |
| `contextMode`                              | Project       | `'list' \| 'summary' \| 'full' \| 'hybrid'`                     | `'summary'`                                      | **Replaces**                                  | Spec presentation format in compiled context. Overridden by `SPECD_CONTEXT_MODE`.                                                                                                                                                   |
| `llmOptimizedContext`                      | Project       | `boolean`                                                       | `false`                                          | **Replaces**                                  | When `true`, prefers condensed descriptions from metadata cache. Overridden by `SPECD_LLM_OPTIMIZED`.                                                                                                                               |
| `schemaPlugins`                            | Project       | `string[]`                                                      | `[]` (None)                                      | **Appends**                                   | Schema package references merged into active schema prior to inline `schemaOverrides`.                                                                                                                                              |
| `schemaOverrides`                          | Project       | `SchemaOverrides`                                               | `null` (None)                                    | **Deep-merges**                               | Inline schema modification operations: `create`, `remove`, `set`, `append`, `prepend`.                                                                                                                                              |
| `invalidationPolicy`                       | Project       | `'none' \| 'surgical' \| 'downstream' \| 'global'`              | `'downstream'`                                   | **Replaces**                                  | Default artifact invalidation propagation policy assigned to newly created changes.                                                                                                                                                 |
| `plugins.agents`                           | Project       | `PluginEntry[]`                                                 | `[]` (None)                                      | **Appends**                                   | Registered agent plugin definitions (`name` and optional `config`). Remove with `remove.plugins.agents`.                                                                                                                            |
| `extends`                                  | Cascade Layer | `true \| string`                                                | `null` (Standalone)                              | _Special_                                     | Controls inheritance: `true` inherits from preceding layer; `<path>` inherits from specific active file.                                                                                                                            |
| `remove.root`                              | Cascade Layer | `string[]`                                                      | `null`                                           | _Removal_                                     | Drops inherited top-level fields (e.g. `contextExcludeSpecs`, `actorProvider`). Cannot remove `schema`.                                                                                                                             |
| `remove.workspaces`                        | Cascade Layer | `string[]`                                                      | `null`                                           | _Removal_                                     | Drops inherited workspace definitions by name.                                                                                                                                                                                      |
| `remove.storage`                           | Cascade Layer | `string[]`                                                      | `null`                                           | _Removal_                                     | Drops inherited storage adapter bindings by key (`changes`, `drafts`, `discarded`, `archive`).                                                                                                                                      |
| `remove.context`                           | Cascade Layer | `RemovalMatcher[]`                                              | `null`                                           | _Removal_                                     | Drops matching inherited context injection entries by `id`, `file`, or `instruction`.                                                                                                                                               |
| `remove.plugins.agents`                    | Cascade Layer | `{ name: string }[]`                                            | `null`                                           | _Removal_                                     | Drops inherited agent plugin declarations by package name.                                                                                                                                                                          |

---

## Where to go next

| Topic                                                    | Document                                               |
| :------------------------------------------------------- | :----------------------------------------------------- |
| Practical and exhaustive scenario examples               | [Configuration Examples](configuration-examples.md)    |
| Schema format — authoring or customising a schema        | [Schema Format Reference](../schemas/schema-format.md) |
| Lifecycle states, transitions, hooks, and approval gates | [Workflow Reference](workflow.md)                      |
| Full CLI command reference                               | [CLI Reference](../cli/cli-reference.md)               |
