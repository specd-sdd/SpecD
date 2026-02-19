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
│   └── _global/           # Global constraints — apply to ALL packages
│       ├── architecture/spec.md
│       ├── conventions/spec.md
│       ├── commits/spec.md
│       └── testing/spec.md
└── .specd/
    └── PROPOSAL.md        # Full design proposal
```

---

## Mandatory: Read Before Writing Code

Before writing any code, you MUST read the following specs in full. They are binding constraints, not suggestions:

- [`specs/_global/architecture/spec.md`](specs/_global/architecture/spec.md)
- [`specs/_global/conventions/spec.md`](specs/_global/conventions/spec.md)
- [`specs/_global/commits/spec.md`](specs/_global/commits/spec.md)
- [`specs/_global/testing/spec.md`](specs/_global/testing/spec.md)
- [`specs/_global/docs/spec.md`](specs/_global/docs/spec.md)

---

## Architecture Constraints

- `@specd/core` has three layers: `domain/`, `application/`, `infrastructure/`
- `domain/` must not import from `application/` or `infrastructure/`
- `application/` must not import from `infrastructure/`
- Use cases receive all dependencies via constructor — no module-level singletons
- Domain entities enforce their own state transitions and throw typed `SpecdError` subclasses
- Stateless domain operations are plain exported functions, not classes
- `@specd/cli`, `@specd/mcp`, `@specd/plugin-*` are adapters — no business logic

## Code Conventions

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` — always
- No default exports — named exports only
- No `any` — use `unknown` and narrow with type guards
- Source files: `kebab-case.ts`
- Test files: `test/<mirrors src path>/name.spec.ts` — never co-located with source

## Commit Conventions

Format: `<type>(<scope>): <description>`

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`
- Scope: short package name (`core`, `cli`, `mcp`, `skills`, `schema-std`, `root`)
- Imperative mood: "add", "fix", "remove" — not "added", "fixes"
- No trailing period
- No `Co-Authored-By` footer unless explicitly requested

## Testing

- Vitest only — no Jest
- Test files in `test/` directory mirroring `src/` structure
- Unit tests: mock all ports — no real filesystem or network
- Port mocks must fully implement the port interface (unused methods throw `new Error('not implemented')`)
- Integration tests use `os.tmpdir()` with a unique subfolder, cleaned up after each test
- No snapshot tests

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
