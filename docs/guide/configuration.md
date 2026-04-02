# Configuring Your SpecD Project

`specd.yaml` is the single configuration file for a SpecD project. Every tool in the SpecD ecosystem — the CLI, the MCP server, and agent plugins — reads it to understand where your specs live, how changes are stored, and what rules govern your workflow.

This guide walks through the main configuration areas conceptually, with practical examples. For the complete field-by-field reference, see the [Configuration Reference](../config/config-reference.md).

---

## Getting a specd.yaml

Run `specd project init` in your project root. SpecD creates a `specd.yaml` with sensible defaults for a single-repo project. You will then edit it to reflect your team's structure and policies.

SpecD discovers its configuration file by walking up from the current working directory to the git repo root, checking for `specd.local.yaml` first, then `specd.yaml`. The walk stops at the first match.

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

## Local overrides

Alongside `specd.yaml` you can create a `specd.local.yaml`. When this file is present, SpecD uses it exclusively and ignores `specd.yaml` entirely — it is not merged or layered on top. The local file must be a valid, self-contained configuration on its own.

`specd project init` adds `specd.local.yaml` to `.gitignore` automatically. It is for personal experimentation: trying a different schema branch, pointing at a local schema copy, or testing a configuration change without affecting the rest of the team.

Because it is a complete replacement, make a full copy of `specd.yaml` as a starting point when creating one.

---

## Schema selection

The `schema` field tells SpecD which workflow schema to use. Schemas define your artifact types, lifecycle steps, and validation rules. There is exactly one active schema per project.

SpecD resolves the `schema` value using a prefix convention:

| Value                            | Where SpecD looks                                                               |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `'@specd/schema-std'`            | npm package in `node_modules/@specd/schema-std/schema.yaml`                     |
| `'my-workflow'`                  | Bare name — `specd/schemas/my-workflow/schema.yaml` in the default workspace    |
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

Workspace names map directly to spec IDs. A spec in the `payments` workspace at `specs/checkout.md` has the ID `payments:checkout`. If you want a different prefix — for example to mirror a directory structure — you can declare one:

```yaml
workspaces:
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs/_global
```

With this configuration, specs under `specs/_global/` are addressed as `_global:architecture` rather than `default:architecture`.

---

## Storage

`storage` declares where SpecD persists changes during their lifecycle. All four sub-keys are required.

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
```

Each directory holds changes in a different state:

- **`changes`** — active changes currently in progress
- **`drafts`** — shelved changes that can be restored at any time
- **`discarded`** — abandoned changes, kept for reference but no longer active
- **`archive`** — completed changes; the permanent record after archiving

All paths resolve relative to the `specd.yaml` directory and must stay within the repository root.

By default, `specd project init` adds `drafts/` and `discarded/` to `.gitignore`. Teams who want to commit drafts — for example, to share in-progress work across machines — can remove those entries.

### Organising the archive

By default, archived changes are stored with the name `{{change.archivedName}}` — a slug prefixed with the archive date, for example `2024-01-15-add-auth-flow`. You can customise this with the `pattern` field:

```yaml
archive:
  adapter: fs
  fs:
    path: specd/archive
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

When `true`, SpecD uses an LLM to generate richer metadata when building `metadata.json` files: more precise descriptions, better-structured scenarios, and more accurate `dependsOn` suggestions.

When `false` or absent, metadata is extracted by parsing the structural conventions of `spec.md` and `verify.md` directly — deterministic, no LLM required.

Leave this `false` in offline CI, air-gapped environments, or any pipeline without LLM access. Set it to `true` if you want higher-quality metadata and your tooling has model access.

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

---

## Artifact rules

`artifactRules` is a lighter-weight alternative to `schemaOverrides` for adding per-artifact writing conventions. Keys are artifact IDs; values are arrays of rule strings injected after the schema's own artifact instruction:

```yaml
artifactRules:
  specs:
    - 'All requirements must use SHALL or MUST for normative statements.'
    - 'Every requirement must have at least one WHEN/THEN scenario in verify.md.'
  design:
    - 'Architecture decisions must reference an ADR number.'
```

Use `artifactRules` for project-specific writing standards. Use `schemaOverrides` when you need to add hooks, change workflow behaviour, or add new artifacts.

---

## Where to go next

| Topic                                                           | Document                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Full field-by-field reference with all defaults and constraints | [Configuration Reference](../config/config-reference.md) |
| Annotated scenario-based examples                               | [Configuration Examples](../config/examples/)            |
| Schema format — authoring or customising a schema               | [Schema Format Reference](../schemas/schema-format.md)   |
| Lifecycle states, transitions, hooks, and approval gates        | [Workflow Reference](workflow.md)                        |
| Full CLI command reference                                      | [CLI Reference](../cli/cli-reference.md)                 |
