# Proposal: project-context-specs

## Motivation

Before a change has selected specs, fast-track and other pre-change agent workflows need a lightweight, authoritative way to discover which specs are injected by resolved project and workspace context patterns. Today that discovery either renders full context (`project context`) or requires an existing change (`change context`). Project-level include/exclude loops are also duplicated across `CompileContext` and `GetProjectContext`, inviting drift.

## Current behaviour

- `specd project context` compiles and renders project-level context content (instructions + matched specs). It is not an ID-only query and, per its contract, does not apply workspace-level patterns.
- `specd change context` requires a named change and lifecycle step; it cannot answer “which context specs apply before I pick specs?”
- Include/exclude pattern matching for project and workspace layers lives inside `CompileContext`, while `GetProjectContext` reimplements project-only include/exclude with the same `listMatchingSpecs` calls. There is no shared, content-free resolution surface for hosts that only need partitioned spec IDs.

## Proposed solution

Add a read-only Core use case `ResolveContextSpecs` that resolves configured context patterns to a provenance-partitioned result `{ project, workspaces }` without rendering content, metadata, dependency traversal, or warnings.

Extract the shared project/workspace include/exclude pipeline into a Core helper (`resolveConfiguredContextSpecs`) so:

- `CompileContext` uses it for steps 1–4 (keeps change seeding, protection, and `followDeps`)
- `ResolveContextSpecs` uses it for ID-only resolution (with provenance via `onOperation`)
- `GetProjectContext` uses it for project-only collection by passing an empty `activeWorkspaces` set (workspace-level patterns remain disabled; public behaviour unchanged)

Expose `ResolveContextSpecs` on the kernel (`kernel.project.resolveContextSpecs`) and via SDK core re-exports (types/class/factory only — no dedicated orchestration wrapper). Add a thin CLI command that mirrors `project context` host wiring:

```bash
specd project context-specs [--workspace <name>...] [--workspaces-only] [--format text|json|toon]
```

`--workspace` is repeatable and only selects which workspace-level pattern sets run. Project-level patterns still apply unless `--workspaces-only` is set. Dual listing is required when both layers include the same ID.

## Specs affected

### New specs

- `core:resolve-context-specs`: ID-only resolution of configured context patterns into `{ project, workspaces }`, including the shared collector helper contract, workspace filter, `workspacesOnly`, unknown-workspace errors, and dual-listing provenance.
  - Depends on: `core:list-workspaces`, `core:config`

- `cli:project-context-specs`: CLI command `project context-specs` — signature, repeatable `--workspace`, `--workspaces-only`, text/json/toon output shape, host wiring via `resolveCliContext` → `kernel.project.resolveContextSpecs.execute` (same pattern as `project context`).
  - Depends on: `core:resolve-context-specs`, `cli:host-context`, `cli:project-context`

### Modified specs

- `core:compile-context`: Require steps 1–4 of context spec collection (project/workspace include/exclude) to delegate to the shared configured-context helper used by `ResolveContextSpecs`, preserving protected `specIds`, optimized-project-context skip of project patterns, and step 5 ownership.
  - Depends on (added): `core:resolve-context-specs`
  - Depends on (removed): none

- `core:get-project-context`: Require project-level include/exclude collection to use the same shared helper with an empty `activeWorkspaces` set so workspace-level patterns never run, without changing rendered output or public inputs.
  - Depends on (added): `core:resolve-context-specs`
  - Depends on (removed): none

## Impact

- **Core**: new use case + composition factory + kernel `project.resolveContextSpecs`; shared helper under application `_shared`; `CompileContext` and `GetProjectContext` migration onto the helper; public exports; barrel/kernel coverage and unit tests.
- **SDK**: core type/class/factory re-exports only (no orchestration facade).
- **CLI**: new `project context-specs` command registered next to `project context`; help text; CLI tests and mock-kernel adoption.
- **Docs**: CLI reference, dedicated command page, core use-cases, SDK CLI mapping, getting-started context compilation note (already drafted in fast-track; specs remain source of truth).
- **Agent workflows**: fast-track and similar pre-change skills can query ID-only context before selecting specs.

## Technical context

- Rejected extending `project context` to become the ID-only query (would conflate rendering with resolution).
- Rejected CLI-local pattern matching (belongs in Core).
- Rejected a dedicated SDK orchestration wrapper (`resolveProjectContextSpecs`): it was a one-line pass-through; CLI calls `kernel.project.resolveContextSpecs.execute` like `project context`, and SDK re-exports Core symbols.
- Shared helper uses a source-free `collector.include/exclude(spec)` path identical to pre-extraction CompileContext callbacks, plus optional `onOperation` for provenance.
- `GetProjectContext` reuses the helper with empty `activeWorkspaces` rather than inventing a project-only helper mode — empty active set skips steps 3–4 by construction.
- Result shape for ResolveContextSpecs is `{ project, workspaces }` (not a flat `specIds` list). A brief `global` naming experiment was rejected in favour of `project`.
- Unknown workspace names fail hard (unlike `specs list`, which ignores unknown `--workspace` values).
- Comma-separated / plural `--workspaces <csv>` rejected; repeatable `--workspace` matches `specs list`.
- `--workspaces-only` skips project-level patterns at resolution time (`project: []`; text omits the `project:` section).

## Open questions

- None — naming (`project` vs `global`), `--workspace` vs comma lists, `--workspaces-only`, SDK layering, and GetProjectContext helper adoption were settled during design.
