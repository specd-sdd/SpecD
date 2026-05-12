# Proposal: delta-visibility

## Motivation

When working on a change that modifies existing specs via deltas, agents and humans see the base (canonical) spec content — not the version they're actually implementing. The merged result only materializes at archive time, creating a gap where the "true" spec state is invisible throughout the entire implementation and verification lifecycle.

## Current behaviour

| Operation           | Reads base spec                | Merges deltas          | Exposes merged result           |
| ------------------- | ------------------------------ | ---------------------- | ------------------------------- |
| `CompileContext`    | Yes (full content or metadata) | No                     | No                              |
| `ValidateArtifacts` | Yes                            | Yes (internal preview) | No — discarded after validation |
| `ArchiveChange`     | Yes                            | Yes                    | Yes — writes to canonical spec  |

`CompileContext` assembles spec content for agents entering a lifecycle step. For specs targeted by the active change, it returns the canonical (pre-delta) content. The delta merge infrastructure exists and works (`ArtifactParser.apply()`, used by `ValidateArtifacts`), but is not exposed to context consumers.

There is no command to preview what a spec will look like after delta application.

## Proposed solution

Two read-only capabilities, ordered by value:

**Level 2 — PreviewSpec use case and CLI command.** A new `PreviewSpec` use case that loads a base spec, applies deltas from a named change, and returns the merged result per artifact file. A new `specd change spec-preview <change-name> <specId> [--diff]` CLI command wraps this use case. Without `--diff`, outputs the full merged spec (all `scope: spec` artifacts concatenated: `spec.md` first if present, then remaining files alphabetically). With `--diff`, outputs a colorized unified diff (3 lines of context) using the `diff` npm package and `chalk` (already in `@specd/cli`): green for additions, red for removals, cyan for hunk headers, dim for context lines.

**Level 1 — Materialized view in CompileContext.** `CompileContext` uses `PreviewSpec` internally when compiling context for a change. For each spec in `change.specIds` that has validated delta artifacts, it calls `PreviewSpec` to obtain the merged content and uses that instead of the base content. The canonical spec is never mutated — this is a read-only view. If preview fails, fall back to base content with a warning.

Both levels use the same `PreviewSpec` use case — Level 2 exposes it via CLI, Level 1 consumes it from `CompileContext`.

## Specs affected

### New specs

- `core:core/preview-spec`: Use case that loads a base spec, applies deltas from a named change, and returns the merged result (or a diff). Standalone from `CompileContext` — can be used by the CLI or any other consumer.
  - Depends on: `core:core/delta-format`, `core:core/artifact-parser-port`, `core:core/change-layout`, `core:core/file-reader-port`

- `cli:cli/change-spec-preview`: CLI command wrapping the `PreviewSpec` use case. Signature: `specd change spec-preview <name> <specId> [--diff] [--format text|json]`.
  - Depends on: `core:core/preview-spec`

### Modified specs

- `core:core/compile-context`: Use `PreviewSpec` internally to merge deltas for specs in `change.specIds`. When merging succeeds, `ContextSpecEntry.content` contains the merged result instead of the base content.
  - Depends on (added): `core:core/preview-spec`

## Impact

- **`@specd/core` application layer:** New `PreviewSpec` use case; modified `CompileContext` use case (now depends on `PreviewSpec`).
- **`@specd/core` composition layer:** New composition function for `PreviewSpec`; `CompileContext` composition updated to receive `PreviewSpec` as a dependency.
- **`@specd/cli`:** New `change spec-preview` command and handler.
- **`ChangeRepository` port:** May need a method to read delta files for a change, if one doesn't already exist. Needs investigation during design.
- **New dependency:** `diff` (jsdiff) npm package in `@specd/core` for unified diff generation in `PreviewSpec`.
- **No breaking changes:** `ContextSpecEntry` shape is unchanged — `content` already exists as an optional string field. Consumers that read context output see richer content but don't need to change.

## Open questions

None — all design decisions are settled:

- Only validated deltas are merged in `CompileContext` (unvalidated deltas are skipped with a warning)
- `--diff` uses unified diff format with 3 lines of context, colorized in text mode via `chalk`
- `PreviewSpec` applies deltas without re-validating them (validation is `ValidateArtifacts`' concern)
- Preview operates only on specs in the change's `specIds`
- Only `scope: spec` artifacts with `delta: true` are candidates for merge
- Artifact concatenation order for preview output: `spec.md` first (if present), then remaining alphabetically
- New dependency: `diff` (jsdiff) npm package added to `@specd/core` for unified diff generation
