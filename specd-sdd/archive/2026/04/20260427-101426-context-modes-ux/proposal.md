# Proposal: context-modes-ux

## Motivation

CLI context commands (`project context`, `change context`, `spec context`) provide section-level filtering but lack direct control over the display mode (`list`, `summary`, `full`, `hybrid`). Furthermore, the default output for `full` mode (raw markdown) is often too verbose. We need a way to explicitly set the mode via CLI and ensure that "full" content defaults to the most relevant sections (rules and constraints) while maintaining the tiered logic of `hybrid` mode.

## Current behaviour

- Users cannot explicitly set the display mode via CLI flags.
- `full` mode defaults to showing raw artifact content (markdown) when no sections are specified in `project context` and `change context`.
- `spec context` follows the project's `contextMode` configuration, which is unintuitive for a command dedicated to inspecting a specific spec.
- Providing section flags (`--rules`, etc.) in `change context` and `project context` doesn't automatically ensure a sensible display mode if the config is set to something like `summary`.

## Proposed solution

### Context Compilation (`project context`, `change context`)

- Add a `--mode <mode>` flag to explicitly override `specd.yaml`.
- **Preserve Hybrid Tiers**: When in `hybrid` mode (via config or `--mode`), the command MUST maintain tiers: change specs are rendered in `full`, others in `summary`.
- **Smart Section Filtering**: If `--rules`, `--constraints`, or `--scenarios` are provided, they apply as filters ONLY to specs rendered in `full` mode. The tiered structure of `hybrid` remains intact (non-change specs stay in `summary`).
- **New Full Defaults**: If a spec is rendered in `full` mode (either because of `full` mode or being a change spec in `hybrid` mode) and NO section flags are provided, it defaults to rendering **Description + Rules + Constraints** using structured output.
- **Header Persistence**: In `full` mode, the **Title** and **Description** MUST always be rendered to provide context, even when section flags (`--rules`, etc.) are used to filter the content.

### Spec Inspection (`specd spec context`)

- **Ignore project configuration** for `contextMode`.
- **Default to full**: The command always operates in `full` mode by default.
- **Header Persistence**: Always include **Title** and **Description**.
- **Default Sections**: Render **Rules + Constraints** by default.
- **Override**: If specific section flags are provided, they override the default sections, but Title and Description remain.

### Core Use Cases

- Update `CompileContext`, `GetProjectContext`, and `GetSpecContext` to implement the "Rules + Constraints" default for `full` mode when no sections are explicitly requested.
- `CompileContext` and `GetProjectContext` will switch from raw markdown to structured rendering for their `full` mode default.

## Specs affected

### New specs

_none_

### Modified specs

- `cli:cli/project-context`: Add `--mode` flag; implement default sections (Rules + Constraints) for full mode.
- `cli:cli/change-context`: Add `--mode` flag; ensure section flags filter the `full` tier while preserving `hybrid` structure.
- `cli:cli/spec-context`: Change default to `full` mode with Rules + Constraints; ignore config `contextMode`.
- `core:core/compile-context`: Update to default `full` mode to Rules + Constraints when no sections are provided; use structured rendering.
- `core:core/get-spec-context`: Update to default `full` mode to Rules + Constraints when no sections are provided.
- `core:core/get-project-context`: Update to default `full` mode to Rules + Constraints when no sections are provided; use structured rendering.
- `core:core/config`: No changes needed to `SpecdContextMode` (CLI handles the logic).

## Impact

- Improved signal-to-noise ratio in AI agent context.
- More predictable behavior for `specd spec context`.
- Consistent rendering of rules and constraints across the ecosystem.

## Technical context

- Core use cases will handle the "default sections" logic (`['rules', 'constraints']` when `sections` is undefined/empty).
- The transition from raw markdown to structured metadata in `CompileContext` and `GetProjectContext` will require using the metadata extraction path even when no sections are requested.

## Open Questions

- Should we keep a way to get raw markdown? (e.g., `--mode raw` or similar). _Decision: Postponed; structured output is the priority for UX consistency._
