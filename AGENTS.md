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
│   ├── mcp/               # @specd/mcp — MCP server adapter
│   ├── skills/            # @specd/skills — canonical skill definitions
│   ├── schema-std/        # @specd/schema-std — default schema
│   ├── schema-openspec/   # @specd/schema-openspec — OpenSpec-compatible schema
│   └── plugins/
│       ├── claude/        # @specd/plugin-claude
│       ├── copilot/       # @specd/plugin-copilot
│       └── codex/         # @specd/plugin-codex
├── specs/
│   ├── _global/           # Global constraints — apply to ALL packages
│   │   ├── architecture/  # spec.md + verify.md
│   │   ├── conventions/   # spec.md + verify.md
│   │   ├── commits/       # spec.md + verify.md
│   │   ├── testing/       # spec.md + verify.md
│   │   ├── docs/          # spec.md + verify.md
│   │   ├── eslint/        # spec.md + verify.md
│   │   ├── spec-layout/   # spec.md + verify.md
│   │   ├── schema-format/ # spec.md + verify.md — schema YAML structure
│   │   └── config/        # spec.md + verify.md — specd.yaml structure
│   └── core/              # Package specs for @specd/core
└── .specd/
    ├── INITIAL-PROPOSAL.md  # Full design proposal and rationale
    ├── PLAN.md              # Implementation plan
    └── WORKSPACE-DESIGN.md  # Workspace design notes
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

- [`specs/_global/schema-format/spec.md`](specs/_global/schema-format/spec.md) — when working on schema loading, parsing, or validation
- [`specs/_global/config/spec.md`](specs/_global/config/spec.md) — when working on config loading, resolution, or validation

Each `spec.md` has a paired `verify.md` in the same directory with WHEN/THEN scenarios. Read it if you need to verify expected behaviour or understand edge cases for a requirement.

**Package specs:** before working on a specific package, also read `specs/<package>/` if it exists (e.g. `specs/core/` when working on `@specd/core`). These are binding for that package.

---

## Package Dependencies

```
plugin-* → skills → core
cli      → core
mcp      → core
schema-* → (no specd deps)
```

No circular workspace dependencies.

---

## Key Design Decisions

See [`.specd/INITIAL-PROPOSAL.md`](.specd/INITIAL-PROPOSAL.md) for full design rationale. Key decisions:

- Rich domain entities — entities defend their own invariants
- Pure functions for stateless domain services (e.g. `mergeSpecs`, `hashFiles`)
- Manual dependency injection at entry points — no IoC container
- `fs` is the only storage adapter in v1
- All packages are ESM (`"type": "module"`, `NodeNext` resolution)
