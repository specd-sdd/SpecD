# specd — Agent Instructions

You are working on **specd**, a spec-driven development platform built in TypeScript as a pnpm monorepo.

> These instructions complement the specd workflow. YOU MUST follow them exactly when reading, writing, or modifying code, and when the tool can drive the workflow you MUST prefer the tool over ad hoc repo navigation.

---

## Mandatory: Enter Through specd

specd is now the primary workflow entry point for this repository. Do not treat the
repo as a generic codebase where you can inspect files and make edits directly first.

Only skip this if the user are not asking for changes in code, you can skip if the user
is investigating, but you MUST go throught `specd` in the moment something is going to be
modified.

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
- run `specd change transition`
- run `specd change approve`
- run `specd change archive`

## Explicit User Override: Escape Hatch

A direct, explicit user instruction in the current turn may authorize a one-off code or repo edit outside the normal `specd` change workflow when all of the following are true:

- the user clearly requests to bypass the workflow for this specific task
- the requested work is narrow, local, and immediately actionable
- the agent restates that it is proceeding outside the normal `specd` workflow
- the agent does not use this escape hatch to perform lifecycle operations on behalf of the user

This escape hatch is limited to direct repository edits and investigation work. It does NOT authorize the agent to autonomously perform any `specd` workflow or lifecycle action that would normally require explicit user choice or approval.

Even when this override is used:

- prefer the smallest possible change
- do not create, transition, approve, validate, archive, or discard changes unless the user explicitly asks for that exact workflow command
- do not treat the override as persistent; it applies only to the current task and current turn context
- still obey all other safety, filesystem, and non-destructive editing rules

If there is ambiguity about whether the user intends to bypass the workflow, default to the normal `specd` path.

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
│   ├── core/                 # @specd/core
│   ├── cli/                  # @specd/cli
│   ├── skills/               # @specd/skills
│   ├── code-graph/           # @specd/code-graph
│   ├── schema-std/           # @specd/schema-std
│   ├── mcp/                  # @specd/mcp
│   ├── plugin-manager/       # @specd/plugin-manager
│   ├── plugin-agent-claude/  # @specd/plugin-agent-claude
│   ├── plugin-agent-codex/   # @specd/plugin-agent-codex
│   ├── plugin-agent-copilot/ # @specd/plugin-agent-copilot
│   ├── plugin-agent-opencode/# @specd/plugin-agent-opencode
│   ├── plugin-agent-standard/# @specd/plugin-agent-standard
│   └── specd/                # @specd/specd (main)
├── apps/
│   └── public-web/           # @specd/public-web
├── dev/
│   ├── ai-agents/
│   └── scripts/
├── specs/                    # Specifications (managed via specd workflow or `specd` cli)
├── docs/                     # Documentation (including ADRs)
└── .specd/                   # Change workflow (changes/, drafts/, metadata/)
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

Each `spec.md` has a paired `verify.md` in the same directory with WHEN/THEN scenarios. Read it if you need to verify expected behaviour or understand edge cases for a requirement.

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

---

## Using Code Graph

Use the code graph for intelligent code search and impact analysis. All graph commands require an index to be built first.

### Index the codebase

```bash
node packages/cli/dist/index.js graph index
```

### Available commands

| Command                         | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `graph index`                   | Build the code graph index                        |
| `graph stats`                   | Show index statistics (files, symbols, languages) |
| `graph search <query>`          | Full-text search across symbols and specs         |
| `graph search --symbols`        | Search only symbols                               |
| `graph search --specs`          | Search only specs                                 |
| `graph impact --file <path...>` | Analyze impact on one or more files               |
| `graph impact --symbol <name>`  | Analyze impact on a symbol                        |
| `graph hotspots`                | Rank symbols by impact score (callers, importers) |

### Examples

```bash
# Search for a function across the codebase
node packages/cli/dist/index.js graph search "parseSpec" --format toon

# Find all usages of a symbol
node packages/cli/dist/index.js graph impact --symbol "mergeSpecs" --format toon

# Check what breaks if you modify a file
node packages/cli/dist/index.js graph impact --file packages/core/src/model.ts --format toon

# Analyze impact of multiple files
node packages/cli/dist/index.js graph impact --file a.ts --file b.ts --format toon

# Find high-impact symbols in the codebase
node packages/cli/dist/index.js graph hotspots --format toon
```

---

## Project Status

Use `project status` to get a consolidated overview of the project:

```bash
node packages/cli/dist/index.js project status --format toon
node packages/cli/dist/index.js project status --format toon --graph      # Include extended graph stats
node packages/cli/dist/index.js project status --format toon --context   # Include context references (instructions, files, specs to read)
```

Shows: workspaces, spec counts per workspace, active changes, drafts, discarded, graph freshness, and optionally context.
