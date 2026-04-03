# Workspaces

A workspace is the fundamental unit of organization in specd. It groups a set of specs, a code location, and an ownership relationship under a single named entry in `specd.yaml`. Everything in specd that involves specs — context compilation, archiving, change tracking, schema resolution — resolves through workspaces.

This guide explains what workspaces are, why they exist, when you need more than one, and how they interact with spec IDs, context, and multi-repo setups.

---

## Why workspaces exist

In a simple project, all specs live in one directory and all code lives in one place. A single `default` workspace handles this perfectly.

But real projects outgrow that quickly:

**Monorepos with multiple packages.** A monorepo containing `packages/core`, `packages/cli`, and `packages/mcp` needs separate spec directories for each package. Each has its own code root, its own domain, and potentially its own team. Without workspaces, all specs would live in a single flat directory — making it impossible to scope context to the package being worked on.

**Multi-repo microservice architectures.** A payments service needs to read the platform team's API specs for context, but should never modify them. An auth service defines its own specs but needs visibility into the shared contracts. Without workspaces, each repo would be isolated — no cross-repo spec visibility, no coordinated changes.

**Central spec governance.** An architecture team maintains a coordinator repo that governs specs across ten service repos. They need to propose changes to any service's specs, track those changes through the lifecycle, and archive them — all from a single project. Without workspaces, they would need ten separate specd projects with no unified view.

**Mixed ownership.** Some specs are owned by your team. Others are read-only references maintained by another team. You need both in context — but only your specs should be modifiable. Without workspaces, there is no way to express "include these specs for context but prevent changes to them."

Workspaces solve all of these by letting a single `specd.yaml` declare multiple spec locations, each with its own path, code root, ownership, and context rules.

---

## What is a workspace?

When specd needs to work with a spec, it needs to know:

- Where the spec files live on disk
- Where the implementation code for those specs lives
- Whether this project is allowed to modify those specs
- What to call those specs in fully-qualified IDs

A workspace provides all of that. It is not a directory; it is a declaration in `specd.yaml` that names and describes a location for specs and connects it to the rest of the project.

Every project has at least one workspace: `default`. Most single-repo projects only need that one.

---

## The default workspace

`default` is a reserved name that identifies the local project workspace — the specs this repository owns. Every `specd.yaml` must declare it.

```yaml
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
```

The `default` workspace has sensible defaults that make minimal configuration sufficient:

- `codeRoot` — defaults to the project root (the directory containing `specd.yaml`)
- `ownership` — defaults to `owned`, meaning this project freely creates and modifies specs here

For most single-repo projects, this is all you ever need. Additional workspaces are for when your project spans multiple spec locations.

---

## Spec IDs and the prefix field

Every spec in specd has a fully-qualified spec ID in the format `workspace:capability-path`. The workspace name comes first, separated by a colon from the capability path — which mirrors the directory structure inside the workspace's specs directory.

For example, a spec stored at `specs/auth/login/` in the `default` workspace has the ID `default:auth/login`. A spec in a `payments` workspace at `specs/checkout/` has the ID `payments:checkout`.

Bare paths (without a colon) are shorthand for `default:path`. So `auth/login` and `default:auth/login` are equivalent. Internally, specd always uses the fully-qualified form.

### The prefix field

By default, the workspace name is the qualifier in spec IDs. The optional `prefix` field lets you use a different string as that qualifier, without changing the workspace name:

```yaml
workspaces:
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs/_global
```

With this configuration, specs under `specs/_global/` are addressed as `_global:architecture` — not `default:architecture`. The workspace is still named `default` (you still write `default:` in patterns when referring to it by workspace name), but the spec IDs visible in context output and change metadata use the prefix.

**When to use a prefix:** when the workspace name and the logical label for your specs diverge — for example, when the `default` workspace holds global constraints that live under a `_global/` directory and should be addressed as such for clarity.

This is exactly how specd's own project uses it: the `default` workspace has `prefix: _global`, so architecture and conventions specs are referenced as `_global:architecture` and `_global:conventions`.

---

## Workspace fields

The full set of fields available on any workspace:

| Field                 | Required           | Default (`default` ws)  | Default (non-`default` ws)            | Description                                            |
| --------------------- | ------------------ | ----------------------- | ------------------------------------- | ------------------------------------------------------ |
| `specs`               | always             | —                       | —                                     | Storage adapter and path where spec files live         |
| `codeRoot`            | non-`default` only | project root            | (must be declared)                    | Directory where implementation code lives              |
| `schemas`             | no                 | `.specd/schemas`        | (none)                                | Storage adapter and path for named local schemas       |
| `ownership`           | no                 | `owned`                 | `readOnly`                            | The project's relationship to these specs              |
| `prefix`              | no                 | (none)                  | (none)                                | Override the qualifier used in spec IDs                |
| `contextIncludeSpecs` | no                 | (project-level default) | `['*']` (all specs in this workspace) | Include patterns applied when this workspace is active |
| `contextExcludeSpecs` | no                 | `[]`                    | `[]`                                  | Exclude patterns applied when this workspace is active |

All relative paths resolve from the directory containing `specd.yaml`.

---

## Ownership: owned, shared, readOnly

The `ownership` field describes the project's relationship to a workspace's specs. It has three values:

**`owned`** — this project freely creates and modifies specs in this workspace. The default for `default`.

**`shared`** — this project co-owns these specs alongside other teams. Changes may require coordination before being applied. Use this for workspaces where multiple repos contribute specs but none has unilateral authority.

**`readOnly`** — this project reads these specs for context but does not modify them. The default for non-`default` workspaces.

`readOnly` is the most common setting for additional workspaces. It tells specd that you can see the specs in context — and the agent can read them — but the project should not propose modifications to them. This prevents accidental changes to specs owned by another team.

You can override `readOnly` to `owned` when your coordinator repo is the actual owner of those specs, as in a central spec management setup.

---

## Context and workspaces

Context compilation — assembling the spec content the agent sees at each lifecycle step — is workspace-aware.

### Workspace activation

A workspace is considered active in the context of a change when at least one of the change's specs belongs to that workspace. A change touching `core:compile-context` activates the `core` workspace. A change touching both `_global:architecture` and `core:schema-format` activates both `default` (where `_global:*` specs live) and `core` simultaneously.

### Project-level vs workspace-level patterns

`contextIncludeSpecs` and `contextExcludeSpecs` can be declared at two levels with different behaviour:

**Project-level** patterns (at the top of `specd.yaml`) apply to every compiled context, regardless of which change is active. Use these for specs that must always be present: global constraints, cross-cutting architecture specs.

**Workspace-level** patterns (inside a workspace entry) apply only when that workspace is active. Use these for specs that are only relevant when work is happening within that workspace.

```yaml
# Always include global constraints — regardless of what the change touches
contextIncludeSpecs:
  - 'default:*'

workspaces:
  core:
    specs:
      adapter: fs
      fs:
        path: specs/core
    codeRoot: packages/core
    # When the core workspace is active, include all core specs
    contextIncludeSpecs:
      - '*'
    # But exclude draft specs even when active
    contextExcludeSpecs:
      - 'drafts/*'
```

### Pattern syntax

| Pattern              | At project level                                 | At workspace level                               |
| -------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `*`                  | All specs in all workspaces                      | All specs in this workspace                      |
| `workspace:*`        | All specs in the named workspace                 | All specs in the named workspace                 |
| `prefix/*`           | All specs under `prefix/` in `default`           | All specs under `prefix/` in this workspace      |
| `workspace:prefix/*` | All specs under `prefix/` in the named workspace | All specs under `prefix/` in the named workspace |
| `path/name`          | Exact spec in `default`                          | Exact spec in this workspace                     |

`*` may only appear in three positions: alone, as `workspace:*`, or as a path suffix (`prefix/*`).

At workspace level, an unqualified pattern like `auth/*` means "specs under `auth/` in this workspace" — not the `default` workspace. This is a key difference from project-level patterns, where unqualified paths resolve to `default`.

One important note: specs added to context via `dependsOn` traversal are never subject to exclude patterns. A declared dependency is always included regardless of what the exclude patterns say.

---

## The monorepo pattern

**The problem:** You have a monorepo with `packages/core`, `packages/cli`, and `packages/mcp`. Each package has its own domain, its own specs, and its own code. When an agent works on a change to `packages/core`, it should see core's specs in full detail and the other packages' specs only as background context. You also want changes that span packages — like updating an architecture spec that affects both core and cli — to be tracked as a single unit of work.

**The solution:** One `specd.yaml` at the monorepo root, multiple workspaces pointing to package subdirectories:

```yaml
workspaces:
  default:
    prefix: _global
    specs:
      adapter: fs
      fs:
        path: specs/_global
    ownership: owned

  core:
    prefix: core
    specs:
      adapter: fs
      fs:
        path: specs/core
    codeRoot: packages/core
    ownership: owned

  cli:
    prefix: cli
    specs:
      adapter: fs
      fs:
        path: specs/cli
    codeRoot: packages/cli
    ownership: owned
```

This is specd's own configuration. Three workspaces, all `owned`, each pointing to a subdirectory of `specs/` and a matching package directory. The prefixes — `_global`, `core`, `cli` — become the qualifiers in spec IDs:

- `_global:architecture` — an architecture spec
- `core:schema-format` — a schema format spec in the core package
- `cli:config` — a config spec for the CLI package

Changes that span packages simply list specs from multiple workspaces:

```yaml
# A change that touches both global and core specs
specIds:
  - _global:architecture
  - core:compile-context
```

Both the `default` and `core` workspaces are active for that change. Context compilation applies project-level patterns always, plus workspace-level patterns from both active workspaces.

### Each package has its own code root

`codeRoot` tells specd where the implementation code for a workspace lives. When an agent compiles context for a change in the `core` workspace, the compiled output tells it to write code under `packages/core`. This ensures the agent knows exactly where each workspace's implementation sits, without having to guess from the workspace name.

`codeRoot` is required for non-`default` workspaces — there is no sensible default for external or package workspaces.

---

## The multi-repo coordinator pattern

**The problem:** You have five microservices in separate repos. The architecture team needs to define cross-service API contracts, track changes to any service's specs, and ensure consistency across the system. Each service team owns their code, but the specs that define the contracts between services need central governance. Some services' specs should be read-only from the coordinator's perspective (the platform team manages those), while others can be freely modified.

**The solution:** A coordinator repository declares each service's spec directory as a workspace. The services do not need their own `specd.yaml` — the coordinator manages everything centrally.

```yaml
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
    ownership: readOnly
```

The coordinator owns `auth` and `payments` specs — it can freely create and modify them. The `platform` workspace is `readOnly` — its specs are available to the agent as context but the coordinator does not modify them.

Several things are worth noting about this pattern:

**Paths resolve relative to `specd.yaml`.** `../auth-service/specd/specs` is resolved from the directory containing `specd.yaml`. This means the repos must be cloned in a predictable relative layout. This is typical in monorepo-adjacent setups where service repos are siblings.

**External workspaces are inferred, not declared.** When a workspace's specs path resolves outside the project's repository root, specd marks it as external automatically. You do not declare `isExternal` — it is computed from the path. External workspaces receive `readOnly` as their ownership default.

**Each project's `specd.yaml` is its own source of truth.** specd never reads the service repositories' own `specd.yaml` (if they have one). All properties — paths, schemas, ownership — must be declared in the coordinator's `specd.yaml`. Two projects can declare overlapping workspace paths without conflict; each project has its own independent view.

**Service repos do not need a `specd.yaml`.** They just need their spec directories to be present at the expected path. The coordinator manages the change lifecycle for all of them.

---

## Schema resolution from workspaces

Schemas can be stored locally inside a workspace's `schemas` directory. The resolution prefix determines which workspace specd looks in:

| Reference                       | Where specd looks                       |
| ------------------------------- | --------------------------------------- |
| `my-workflow` or `#my-workflow` | `default` workspace's schemas directory |
| `#billing:my-schema`            | `billing` workspace's schemas directory |
| `@specd/schema-std`             | npm package in `node_modules`           |

The `default` workspace has a schemas directory by default (`.specd/schemas`). Non-`default` workspaces have no schemas directory unless you declare one explicitly:

```yaml
workspaces:
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
```

Without the `schemas` section, any schema reference targeting the `billing` workspace — such as `#billing:my-schema` — produces a `SchemaNotFoundError`.

---

## Archive patterns with workspaces

When changes are archived, their location in the archive directory is controlled by the `pattern` field. The `{{change.workspace}}` template variable expands to the primary workspace of the change — the workspace of the first spec listed in the change.

This lets you organize archives by workspace:

```yaml
storage:
  archive:
    adapter: fs
    fs:
      path: .specd/archive
      pattern: '{{change.workspace}}/{{change.archivedName}}'
```

With this pattern, a change whose first spec belongs to `core` is archived under `.specd/archive/core/2024-03-15-add-schema-format`. This keeps cross-workspace change histories cleanly separated without manual organization.

Available template variables in archive patterns:

| Variable                  | Value                                                              |
| ------------------------- | ------------------------------------------------------------------ |
| `{{change.name}}`         | The change's slug name                                             |
| `{{change.archivedName}}` | Date-prefixed slug (e.g. `2024-01-15-add-auth-flow`) — the default |
| `{{change.workspace}}`    | The primary workspace of the change                                |
| `{{year}}`                | Four-digit year at archive time                                    |
| `{{date}}`                | ISO date at archive time                                           |

---

## Where to go next

| Topic                                                      | Document                                                               |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| Full field-by-field reference for all workspace options    | [Configuration Reference](../config/config-reference.md)               |
| Getting started and project structure overview             | [Getting Started](getting-started.md)                                  |
| How changes move through the lifecycle and span workspaces | [Workflow Reference](workflow.md)                                      |
| All `specd.yaml` configuration options explained           | [Configuring Your Project](configuration.md)                           |
| Annotated multi-repo coordinator example                   | [Multi-Repo Coordinator](../config/examples/multi-repo-coordinator.md) |
