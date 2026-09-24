---
title: Project Structure & Organization
description: Guide to repository organization, specifications directory, changes directory, and monorepo structure in SpecD
sidebar_position: 4
---

# Project Structure & Organization

SpecD establishes clear boundaries between living specifications, active change workflows, and your application source code.

---

## High-Level Repository Layout

A typical repository managed by SpecD looks like this:

```
my-project/
├── specd.yaml                  # Project configuration root
├── specs/                      # Living specifications (source of truth)
│   └── auth/
│       └── login/
│           ├── spec.md         # Requirements and normative constraints
│           ├── verify.md       # Acceptance criteria and test scenarios
│           └── spec-lock.json  # Persisted semantic state (deps, code links, optimizations)
├── .specd/                     # Managed by SpecD CLI and agent workflows
│   ├── changes/                # Active changes currently in progress
│   │   └── 20260923-add-auth/
│   │       ├── manifest.yaml   # Machine-readable change metadata & hash baselines
│   │       ├── proposal.md     # Problem statement and intent
│   │       ├── specs/          # Proposed new specs or deltas
│   │       ├── design.md       # Technical design and trade-offs
│   │       └── tasks.md        # Implementation task checklist
│   ├── drafts/                 # Shelved or paused changes
│   ├── discarded/              # Abandoned changes (audit history)
│   ├── archive/                # Completed and verified changes (permanent history)
│   └── metadata/               # Gitignored local metadata and search cache
└── src/                        # Your application source code
```

The `specs/` directory holds your specifications. The `.specd/` directory is managed by SpecD and tracks all change state. Your application code sits alongside both — SpecD does not impose any structure on your application code.

---

## 1. The `specs/` Directory

The `specs/` directory contains living specifications representing the current agreed-upon behavior of your system.

- **Organized by Capability:** Each capability lives in its own directory (e.g. `specs/billing/invoices/`, `specs/auth/login/`).
- **Paired Documents:** Each capability contains `spec.md` (requirements) and `verify.md` (acceptance criteria).
- **Semantic Sidecar (`spec-lock.json`):** Persists durable machine-readable metadata alongside each spec, including schema identity, curated dependencies (`dependsOn`), code implementation links, and LLM optimization baselines.
- **Immutable during Active Changes:** You never edit `specs/` directly when implementing a feature or bugfix. You modify specs through active change deltas, which are merged into `specs/` only when the change is archived.

---

## 2. The `.specd/` Directory

The `.specd/` directory is the operational engine of the SpecD platform. It tracks changes throughout their lifecycle:

### `changes/`

Holds changes currently in progress. Each change directory is named with a timestamped slug (e.g. `.specd/changes/20260923-add-auth/`).

Inside an active change:

- `manifest.yaml`: Machine-readable tracking file recording the change name, lifecycle state, targeted spec IDs, artifact hashes, and audit history.
- `proposal.md`: Explains what is being built and why.
- `specs/`: Proposed new spec files, or `deltas/` containing structured YAML patches (`*.delta.yaml`) for existing specs.
- `design.md`: Technical architecture and implementation strategy.
- `tasks.md`: Implementation task checklist (`- [ ]` to `- [x]`).

### `drafts/`

When work on an active change needs to be paused or shelved, running `specd changes draft <name>` moves it to `.specd/drafts/`. Shelved changes are preserved exactly as they were and can be restored at any time via `specd drafts restore <name>`.

### `discarded/`

When a proposed change is abandoned, running `specd changes discard <name>` moves it to `.specd/discarded/`. Retaining discarded changes ensures an immutable audit log of ideas and investigations without cluttering the active workspace.

### `archive/`

When a change is verified and approved, running `specd changes archive <name>` applies its delta patches to the living `specs/` directory and archives the entire change package under `.specd/archive/`. Archived records serve as a permanent history of system evolution.

### `metadata/`

Contains local indices, SQLite code graph caches, and self-healing materialized metadata projections (`.specd/metadata/<spec>.json`). SpecD automatically adds `.specd/metadata/` to `.gitignore`.

---

## 3. Monorepo Organization

For multi-package repositories, SpecD supports declared workspaces. Each package can have its own dedicated workspace with isolated specifications and code roots:

```
my-monorepo/
├── specd.yaml                  # Root config declaring all workspaces
├── packages/
│   ├── core/
│   │   ├── specs/              # Specs for the 'core' workspace
│   │   └── src/
│   ├── cli/
│   │   ├── specs/              # Specs for the 'cli' workspace
│   │   └── src/
│   └── mcp/
│       ├── specs/              # Specs for the 'mcp' workspace
│       └── src/
└── .specd/                     # Shared project-wide change management
```

Workspaces are declared as a map in `specd.yaml`:

```yaml
workspaces:
  default:
    codeRoot: .
    specs:
      adapter: fs
      fs:
        path: specs/

  core:
    codeRoot: packages/core
    specs:
      adapter: fs
      fs:
        path: packages/core/specs

  cli:
    codeRoot: packages/cli
    specs:
      adapter: fs
      fs:
        path: packages/cli/specs

  mcp:
    codeRoot: packages/mcp
    specs:
      adapter: fs
      fs:
        path: packages/mcp/specs
```

See the [Workspaces Guide](./workspaces.md) for detailed configuration, cross-workspace dependencies, and ownership rules.
