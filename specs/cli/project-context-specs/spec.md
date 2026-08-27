# Project Context Specs

## Purpose

Agents need a lightweight CLI to discover which specs project and workspace context patterns select before a change has chosen its specs. `specd project context-specs` exposes Core `ResolveContextSpecs` as an ID-only query without rendering context content.

## Requirements

### Requirement: Command signature

The command MUST support:

```bash
specd project context-specs [options]
```

- `--workspace <name>` — optional; repeatable; limits which workspace-level pattern sets run (same collection pattern as `specs list`)
- `--workspaces-only` — optional; skips project-level patterns; only workspace-level includes are resolved
- `--format text|json|toon` — optional; defaults to `text`
- `--config <path>` — optional; path to `specd.yaml`

The command MUST NOT accept a positional workspace argument, a plural `--workspaces <csv>` flag, or comma-separated workspace lists in a single `--workspace` value.

`allowExcessArguments(false)` MUST be set.

### Requirement: Host wiring

The CLI MUST obtain a kernel via `resolveCliContext` and MUST call `kernel.project.resolveContextSpecs.execute` with:

- `workspaces` when at least one `--workspace` was provided
- `workspacesOnly: true` when `--workspaces-only` is set

The CLI MUST NOT import `@specd/core` for this path. Types MAY come from `@specd/sdk` core re-exports. The CLI MUST NOT call a dedicated SDK orchestration function whose only role is forwarding that kernel execute.

### Requirement: Output shape

**text mode (default):**

- Unless `--workspaces-only` is set, print a `project:` section listing project-layer IDs (or `(none)` when empty), then a blank line.
- Always print a `workspaces:` section. For each active workspace key from the result, print an indented `<name>:` group listing IDs (or `(none)` when empty).
- When `--workspaces-only` is set, omit the `project:` section entirely.

**json / toon mode:**

- Emit the structured `ResolveContextSpecsResult` (`project` + `workspaces`) without text-only `(none)` placeholders.
- Structured formats MUST still include `project: []` when `--workspaces-only` is set.

### Requirement: Errors

Unknown workspace names MUST surface as command failures via the shared CLI `handleError` path. Core MUST throw `InvalidInputError` (`SpecdError`, code `INVALID_INPUT`); the CLI MUST treat it as a domain/user error (exit code `1`, `error:` prefix / structured `code`), not as an unexpected fatal (exit `3`). The CLI MUST NOT silently drop unknown names.

### Requirement: Relationship to project context

This command is ID-only discovery. It MUST NOT render `context:` instruction/file entries or spec bodies. Full project context rendering remains `specd project context`.

## Constraints

- Repeatable `--workspace` only selects workspace-level pattern activation; it does not suppress project-layer results unless `--workspaces-only` is also set.
- Dual listing from Core MUST be preserved in both text nesting and structured output.

## Spec Dependencies

- [`core:resolve-context-specs`](../../core/resolve-context-specs/spec.md) — authoritative ID resolution and result shape
- [`cli:host-context`](../host-context/spec.md) — `resolveCliContext` / kernel bootstrap
- [`cli:project-context`](../project-context/spec.md) — sibling project command group conventions and contrast with rendered project context
