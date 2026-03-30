# specd — Agent Instructions

You are working on **specd**, a spec-driven development platform built in TypeScript as a pnpm monorepo.

> These instructions are the source of truth until the specd tool itself is operational. YOU MUST follow them exactly when reading, writing, or modifying code.

---

## Project Structure

```
specd/
├── packages/
│   ├── core/              # @specd/core — domain, application, infrastructure
│   ├── cli/               # @specd/cli — CLI adapter
│   ├── code-graph/        # @specd/code-graph — code graph indexing and analysis
│   ├── mcp/               # @specd/mcp — MCP server adapter (stub)
│   ├── skills/            # @specd/skills — skill registry API
│   ├── schema-std/        # @specd/schema-std — default schema
│   ├── schema-openspec/   # @specd/schema-openspec — OpenSpec-compatible schema (stub)
│   └── plugins/
│       ├── claude/        # @specd/plugin-claude (stub)
│       ├── copilot/       # @specd/plugin-copilot (stub)
│       └── codex/         # @specd/plugin-codex (stub)
├── specs/
│   ├── _global/           # Global constraints — apply to ALL packages (7 specs)
│   │   ├── architecture/  # spec.md + verify.md
│   │   ├── conventions/   # spec.md + verify.md
│   │   ├── commits/       # spec.md + verify.md
│   │   ├── testing/       # spec.md + verify.md
│   │   ├── docs/          # spec.md + verify.md
│   │   ├── eslint/        # spec.md + verify.md
│   │   └── spec-layout/   # spec.md + verify.md
│   ├── core/              # Package specs for @specd/core (77 specs)
│   ├── cli/               # Package specs for @specd/cli (55 specs)
│   └── code-graph/        # Package specs for @specd/code-graph (10 specs)
├── docs/
│   ├── adr/               # 19 Architecture Decision Records
│   ├── guide/             # Getting started, workflow, schemas, workspaces, config, selectors
│   ├── cli/               # CLI reference
│   ├── core/              # Core API docs (domain model, ports, services, use cases, errors)
│   ├── config/            # Config reference + examples
│   └── schemas/           # Schema format reference + examples
└── .specd/
    ├── archive/           # Archived changes (by year/month)
    ├── changes/           # Active changes
    ├── drafts/            # Draft changes
    ├── discarded/         # Discarded changes
    ├── metadata/          # Spec metadata (177 files)
    ├── schemas/           # Custom schemas
    ├── skills/            # Shared skill notes
    └── code-graph.lbug    # Persisted code graph index
```

---

## Mandatory: Read Before Writing Code

Before writing any code, you MUST read the following specs in full. They are binding constraints, not suggestions:

- [`specs/_global/architecture/spec.md`](specs/_global/architecture/spec.md)
- [`specs/_global/conventions/spec.md`](specs/_global/conventions/spec.md)
- [`specs/_global/commits/spec.md`](specs/_global/commits/spec.md)
- [`specs/_global/testing/spec.md`](specs/_global/testing/spec.md)
- [`specs/_global/docs/spec.md`](specs/_global/docs/spec.md)
- [`specs/_global/eslint/spec.md`](specs/_global/eslint/spec.md)
- [`specs/_global/spec-layout/spec.md`](specs/_global/spec-layout/spec.md)

**Contextual reads** — read these when working on the relevant area:

- [`specs/core/schema-format/spec.md`](specs/core/schema-format/spec.md) — when working on schema loading, parsing, or validation
- [`specs/core/config/spec.md`](specs/core/config/spec.md) — when working on config loading, resolution, or validation

Each `spec.md` has a paired `verify.md` in the same directory with WHEN/THEN scenarios. Read it if you need to verify expected behaviour or understand edge cases for a requirement.

**Package specs:** before working on a specific package, also read `specs/<package>/` if it exists. Spec workspaces with specs:

- `specs/core/` (77 specs) — when working on `@specd/core`
- `specs/cli/` (55 specs) — when working on `@specd/cli`
- `specs/code-graph/` (10 specs) — when working on `@specd/code-graph`

---

## Package Dependencies

```
plugin-* → skills → core
cli      → core, code-graph, skills, plugin-*, schema-std
code-graph → core
mcp      → core
schema-* → (no specd deps)
```

No circular workspace dependencies.

---

## Key Design Decisions

Key decisions:

- Rich domain entities — entities defend their own invariants
- Pure functions for stateless domain services (e.g. `mergeSpecs`, `hashFiles`)
- Manual dependency injection at entry points — no IoC container
- `fs` is the only storage adapter in v1
- All packages are ESM (`"type": "module"`, `NodeNext` resolution)
