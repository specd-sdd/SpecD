# specd — Agent Instructions

You are working on **specd**, a spec-driven development platform built in TypeScript as a pnpm monorepo.

> These instructions complement the specd workflow. YOU MUST follow them exactly when reading, writing, or modifying code, and when the tool can drive the workflow you MUST prefer the tool over ad hoc repo navigation.

---

## Mandatory: Enter Through specd

specd is now the primary workflow entry point for this repository. Do not treat the
repo as a generic codebase where you can inspect files and make edits directly first.

- Start by using the `specd` skill, when you need to orient yourself, inspect active changes, or decide the next workflow step
- Use the CLI via `node packages/cli/dist/index.js ...` for specd commands; do not use bare `specd`
- Every meaningful change must go through a specd change workflow; there is no "code-only" path
- Specs are the source of truth and implementation follows specs, not the other way around
- Do not write directly into `specs/` as an ad hoc edit; create or continue a change and let the workflow own the spec artifacts
- Before implementing, confirm whether an existing spec already covers the behaviour; if not, create or extend the relevant spec as part of the change
- When project or change context is available through specd, load it and follow it before making decisions

If there is no active change yet, use specd to inspect the project state and either
continue an existing change/draft or start a new one before making substantive edits.

## Mandatory: Follow Skills Literally

When a `specd` skill is invoked (`specd` or `specd-*` skills), you MUST
follow that skill exactly as written. This is a hard requirement, not guidance:

- Treat every instruction inside the active skill as binding, especially any line
  that says "stop", "ask the user", "present and stop", "do not continue", or
  "let the user decide"
- Do not replace a skill's required stop point with autonomous execution
- Do not continue past a skill step that requires user choice or confirmation
  unless the user explicitly gives that confirmation in the current turn
- General instructions such as "be autonomous", "persist until solved", or
  "carry through implementation" do NOT override a skill's explicit stop points
- If there is any conflict between the active skill and general agent behaviour,
  the skill wins

## Mandatory: No Autonomous Workflow Progression

For this repository, when operating under a skill-driven workflow such as `specd`
(`specd` or `specd-*` skills), you MUST NOT advance the workflow unless the active
skill explicitly permits it without asking.

The following actions always require an explicit instruction from the user in the
current turn when the active skill says to stop or let the user decide:

- create a new change
- restore or continue a different change or draft
- add or remove specs from a change
- write artifacts, spec files, verify files, or deltas
- run `change validate`
- run `change transition`
- run `change approve`
- run `change archive`

## Mandatory: specd Skill Stop Rule

When using the `specd` skills (`specd` or `specd-*` skills), you MUST stop at its "Present and stop" step.

After `specd` shows the project state, active changes, drafts, and suggested next
action, you MUST wait for the user's decision. You MUST NOT automatically create a
change, continue a change, write artifacts, validate artifacts, run hooks, or
transition lifecycle state unless the user explicitly asks you to do that after
the `specd` skill presents the situation.

## Instruction Precedence

Priority order for this repository:

1. Repository-local instructions in `AGENTS.md`
2. Explicit instructions inside the active skill
3. General agent autonomy instructions

If the active skill requires less autonomy than the default agent behaviour, you
MUST obey the skill.

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
