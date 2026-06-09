# Configuring Your SpecD Project

`specd.yaml` is the single configuration file for a SpecD project. Every tool in the SpecD ecosystem — the CLI, the MCP server, agent plugins, and SpecD Studio — reads it to understand where your specs live, how changes are stored, and what rules govern your workflow.

This guide walks through the main configuration areas conceptually, with practical examples. For the complete field-by-field reference, see the [Configuration Reference](../config/config-reference.md).

---

## Getting a specd.yaml

Run `specd project init` in your project root. SpecD creates a `specd.yaml` with sensible defaults for a single-repo project. You will then edit it to reflect your team's structure and policies.

SpecD discovers its configuration by walking up from the current working directory to the git repo root, collecting all `specd.yaml`, `specd.*.yaml`, `specd.local.yaml`, and `specd.local.*.yaml` candidate files from the first directory that contains at least one. The candidates are resolved into an active chain, deep-merged, and validated as one config. See [Config cascade and local variants](#config-cascade-and-local-variants) below for details.

---

## The minimal configuration

This is the smallest valid `specd.yaml`. It covers everything SpecD needs to operate:

```yaml
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
    fs:
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

## Runtime-owned config root

Beyond `storage`, SpecD also keeps backend-owned runtime files under `configPath`. This root is for project-local operational state rather than workflow artifacts.

```yaml
configPath: .specd/config
```

When omitted, this is the default. Today the code graph uses it like this:

- `{configPath}/graph` for persisted graph backend files
- `{configPath}/tmp` for graph staging and scratch files

This keeps graph runtime state separate from lifecycle directories such as `changes/`, `drafts/`, and `archive/`.

---

## Config cascade and local variants

SpecD supports a layered config cascade. Multiple YAML files in the same directory are discovered, resolved into an active chain, deep-merged, and validated as one.

### File naming and discovery order

When SpecD searches for configuration, it looks for files in this order within the directory containing `specd.yaml`:

1. `specd.yaml` — the committed project root (always the first active layer)
2. `specd.*.yaml` — named shared variants (e.g. `specd.ci.yaml`, `specd.staging.yaml`), sorted lexicographically
3. `specd.local.yaml` — personal local override
4. `specd.local.*.yaml` — named local variants (e.g. `specd.local.mono.yaml`), sorted lexicographically

Discovery walks up from the current working directory to the git root and stops at the first directory containing at least one candidate file. `specd.yaml` must exist for discovery to succeed.

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

| Removal target   | Keyed by                       | Effect                                   |
| ---------------- | ------------------------------ | ---------------------------------------- |
| `root`           | field name                     | Removes the named top-level field        |
| `workspaces`     | workspace name                 | Removes the named workspace              |
| `storage`        | storage key                    | Removes a storage binding                |
| `context`        | `id`, `file`, or `instruction` | Removes matching context entries         |
| `plugins.agents` | `name`                         | Removes a matching plugin declaration    |
| `plugins.ui`     | `name`                         | Removes a matching UI plugin declaration |

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
    fs:
      path: .specd/archive
```

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
      adapter: fs
      fs:
        path: specs/

  payments:
    specs:
      adapter: fs
      fs:
        path: packages/payments/specs
    codeRoot: packages/payments
    ownership: owned

  platform:
    specs:
      adapter: fs
      fs:
        path: ../platform-repo/specd/specs
    codeRoot: ../platform-repo
    ownership: readOnly
```

`codeRoot` is required for any workspace that is not `default` — there is no sensible default.

The `ownership` field describes the project's relationship with each workspace's specs:

| Value      | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `owned`    | This project freely proposes and modifies specs here.          |
| `shared`   | Co-owned; changes may require coordination with other teams.   |
| `readOnly` | This project reads specs for context but does not modify them. |

`readOnly` is the default for non-`default` workspaces. Use it for external dependencies whose specs you want in context but do not control.

### Workspace prefixes

Spec IDs always use the form `workspace:capability-path`. A spec in the `payments` workspace at `specs/checkout.md` has the ID `payments:checkout`. If you want every spec in a workspace to live under a leading path segment — for example to mirror a directory structure — you can declare `prefix`:

```yaml
workspaces:
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs/_global
```

With this configuration, specs under `specs/_global/` are addressed as `default:_global/architecture`.

`prefix` does not replace the workspace name in the spec ID. It prepends a path segment to the capability-path portion. In other words:

- workspace name: `default`
- prefix: `_global`
- resulting spec ID: `default:_global/architecture`

Concrete example:

- `specsPath` is `specs/_global`
- the spec lives on disk at `specs/_global/architecture`
- relative to the workspace root, the spec path is just `architecture`

Without `prefix`, the spec ID would therefore be `default:architecture`. `prefix: _global` exists precisely to add that lost leading path segment back into the capability-path, producing `default:_global/architecture`.

---

## Storage

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
  adapter: fs
  fs:
    path: specs/
```

The built-in path is `fs`, but `createKernel(config, options)` and `createKernelBuilder(config)` can register additive storage factories under other adapter names. The config loader preserves the selected adapter name and its opaque config block; the kernel then validates that the named factory exists in the merged registry.

That split is deliberate:

- `FsConfigLoader` resolves and validates `fs` paths
- the kernel validates whether non-built-in adapter names are actually registered

Use this when you need a custom storage backend without forking the core workflow model.

By default, `specd project init` adds `.specd/drafts/` and `.specd/discarded/` to `.gitignore`. Teams who want to commit drafts — for example, to share in-progress work across machines — can remove those entries.

### Organising the archive

By default, archived changes are stored with the name `{{change.archivedName}}` — a slug prefixed with the archive date, for example `2024-01-15-add-auth-flow`. You can customise this with the `pattern` field:

```yaml
archive:
  adapter: fs
  fs:
    path: .specd/archive
    pattern: '{{year}}/{{change.archivedName}}'
```

This organises archived changes into yearly subdirectories. Available variables: `{{change.archivedName}}`, `{{change.name}}`, `{{change.workspace}}`, `{{year}}`, `{{date}}`.

---

## Context configuration

SpecD compiles a context block for the agent at each lifecycle step. The context includes relevant specs, schema instructions, and any additional content you inject here.

### Injecting files and instructions

The `context` field at the top level injects content before any spec content, for every change in the project:

```yaml
context:
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files over creating new ones.'
```

- `file` entries are read at compile time and injected verbatim. If the file does not exist, a warning is emitted and the entry is skipped.
- `instruction` entries are injected as-is.

This is the right place for project-wide agent guidance — coding conventions, team norms, architectural principles.

### Controlling which specs are included

By default, when a change touches specs in a workspace, all specs in that workspace are included in context. You can narrow or expand this with `contextIncludeSpecs` and `contextExcludeSpecs`.

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

### Context rendering mode

`contextMode` controls how specs are rendered in the compiled context:

```yaml
contextMode: lazy # default
```

- **`lazy`** (default) — specs directly referenced by the change are rendered in full. Specs pulled in transitively via `dependsOn` links are rendered as metadata summaries. This keeps context size manageable for most changes.
- **`full`** — every collected spec is rendered with full content. Use this for highly cross-cutting changes where the agent needs the complete text of every in-context spec.

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

## SpecD Studio (`api` and `plugins.ui`)

SpecD Studio is the browser IDE started with `specd ui serve`. Two optional config areas matter:

**UI plugin** — declares which Studio front end to load:

```yaml
plugins:
  ui:
    - name: '@specd/plugin-ui-studio'
```

Install with `specd plugins install @specd/plugin-ui-studio` (embedded bundle) or `@specd/studio-web` (Vite dev server). Only the first `plugins.ui` entry is used.

**HTTP API** — auth and CORS for `specd serve` / `specd ui serve`:

```yaml
api:
  auth:
    type: disabled
  cors:
    origins:
      - http://127.0.0.1:5174
```

v1 supports only `auth.type: disabled`. CORS is needed when the UI runs on a different origin than the API (dev-server plugin); bundle mode on a single port usually does not need extra origins.

See [Studio getting started](../studio/getting-started.md) and the [`api`](../config/config-reference.md#api) / [`plugins.ui`](../config/config-reference.md#plugins) reference sections.

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

---

## Validating your configuration

Run `specd config validate` at any time to check your configuration:

```bash
specd config validate
```

This runs a stricter check than the startup validator:

- Unknown workspace qualifiers in context patterns are **errors**, not warnings — a typo silently excludes specs from context, which is a dangerous silent failure in team environments.
- Patterns that match no specs on disk emit warnings — useful for catching typos early.

SpecD also validates configuration at startup before every command that requires it. Hard errors abort startup immediately; the most common causes are:

- `schema` field missing
- `workspaces` section missing or no `default` workspace
- `specs` path missing from any workspace
- `codeRoot` missing from a non-`default` workspace
- `storage` section missing, or `changes` or `archive` absent
- `adapter: fs` declared but `fs.path` missing
- A storage path that resolves outside the repository root

## Where to go next

| Topic                                                           | Document                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Full field-by-field reference with all defaults and constraints | [Configuration Reference](../config/config-reference.md) |
| Annotated scenario-based examples                               | [Configuration Examples](../config/examples/)            |
| Schema format — authoring or customising a schema               | [Schema Format Reference](../schemas/schema-format.md)   |
| Lifecycle states, transitions, hooks, and approval gates        | [Workflow Reference](workflow.md)                        |
| Full CLI command reference                                      | [CLI Reference](../cli/cli-reference.md)                 |
