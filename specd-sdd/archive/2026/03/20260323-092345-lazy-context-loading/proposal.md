# Proposal: lazy-context-loading

## Motivation

`CompileContext` injects the full content of every matching spec into the compiled context. In a project with 30+ specs where a change touches 3, the agent receives all 30 in full. This wastes tokens, fills the context window, and scales poorly as the number of specs grows.

## Current behaviour

All specs collected via `contextIncludeSpecs` patterns (steps 1-4) and `dependsOn` traversal (step 5) are rendered into a single `contextBlock: string` with full structured content (rules, constraints, scenarios) or raw fallback. There is no distinction between specs the agent is actively working on and background context specs. The use case assembles the final text — CLI just prints it.

## Proposed solution

### Two-tier spec injection

Split context specs into two tiers controlled by a new `contextMode` config field:

**Tier 1 — Full content (always loaded):**

- Specs in `change.specIds` — the specs being created or modified
- Specs in `change.specDependsOn` — explicitly declared dependencies on the change

These are the focus of the agent's work. Rendered with full structured content as today.

**Tier 2 — Summary only (loaded on demand):**

- Specs matched by `contextIncludeSpecs` patterns (steps 1-4)
- Specs discovered via `dependsOn` metadata traversal (step 5)
- Excluding any spec already in tier 1

These are rendered as summaries: spec ID, title, and description only. The agent loads any it needs on demand via `specd spec show <spec-id>`.

The default is `contextMode: lazy`. Projects that want the previous behaviour (all specs fully loaded) can set `contextMode: full`.

### Structured result shape

`CompileContext` currently returns `contextBlock: string` — one assembled text blob. This couples the use case to text formatting.

The result changes to return structured data — the components separately:

- `projectContext` — project context entries
- `specs` — array of spec entries, each indicating its `mode` (`full` | `summary`) and `source` (`specIds` | `specDependsOn` | `includePattern` | `dependsOnTraversal`)
- `availableSteps` — step availability info

The CLI (`change context`, `project context`) becomes responsible for assembling the final text or JSON output from this structured result.

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/compile-context`: Replace `contextBlock: string` result with structured data. Add tier classification logic — each collected spec is tagged with its source and mode based on `contextMode`. When `lazy`, tier 2 specs carry only summary content.
- `core:core/config`: Add `contextMode` field (`'full' | 'lazy'`, default `'lazy'`) to `SpecdConfig`. Project-level only (not per-workspace). Add validation and defaults.
- `core:core/get-project-context`: Adapt to the new structured `CompileContextResult`. This use case wraps `CompileContext` for project-level context — it needs to pass through the structured data instead of a string.
- `cli:cli/change-context`: Adapt to structured `CompileContext` result. Assemble text output from components. In JSON mode, expose the structured spec entries with `mode` and `source` fields. In text mode, render full specs as today and summary specs with a note to load full content via CLI.
- `cli:cli/project-context`: Same adaptation as `change-context` — assemble output from structured result instead of printing `contextBlock`.

## Impact

- **`CompileContext` use case** — result shape changes (breaking for direct consumers)
- **`CompileContextResult` type** — `contextBlock` removed, replaced with structured fields
- **`SpecdConfig` type** — new optional field `contextMode`
- **Config validation** — new field validated at infrastructure boundary
- **CLI commands** — `change context` and `project context` now own text assembly
- **MCP** — if it consumes `CompileContextResult` directly, it needs updating
- **Backwards compatibility** — the result shape change is internal (CLI consumers see no difference in text output). Default `contextMode: lazy` changes the output for projects that haven't set the field — they will see summary specs instead of full content. Set `contextMode: full` to restore the previous behaviour.

## Open questions

_(resolved during discussion)_
