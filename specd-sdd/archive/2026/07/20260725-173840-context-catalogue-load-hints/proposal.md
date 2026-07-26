# Proposal: context-catalogue-load-hints

## Motivation

`change context` text output suggests `changes spec-preview` for every non-full catalogue entry. That command only works for `change.specIds` and returns raw merged artifacts — not optimized context. Agents following the hint for dependency specs fail or load the wrong shape. `project context` has the same catalogue with no drill-down guidance at all, and must never suggest `spec-preview` because it has no change scope.

## Current behaviour

- Core returns structured `CompileContextResult` / `GetProjectContextResult`.
- CLI assembles agent-facing markdown inline in `change/context.ts` and `project/context.ts`.
- Change catalogue uses one blanket `spec-preview` hint for all non-full specs.
- Project catalogue renders a table with no load hint.
- `specs context` already provides optimized canonical context for any spec, but is not advertised from either catalogue.

## Proposed solution

Move text-mode rendering into `@specd/sdk` presentation helpers reused by CLI and future hosts:

- `changeContextToMarkdown(context, { changeName })` — fingerprint, project entries, full specs, source-aware catalogue hints
- `projectContextToMarkdown(context)` — project entries, full specs, catalogue hint to `specs context` only

Hint routing for change context catalogue entries (`mode` other than `full`):

| `source`  | Drill-down                                   | Why                                                                                   |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `specIds` | `specd changes spec-preview <name> <specId>` | Change-scoped: may have deltas or be new; not available correctly via `specs context` |
| other     | `specd specs context <specId>`               | Canonical workspace specs                                                             |

Catalogue tables are partitioned by hint group (`specIds` vs canonical), with `dependsOnTraversal` under `### Via dependencies`.

CLI text mode becomes a thin adapter that calls these helpers. JSON/TOON stay structured passthrough. Core use cases stay unchanged.

## Specs affected

### New specs

- `sdk:context-markdown`: Pure presentation helpers that turn compile/project context into agent-facing markdown with correct load hints.
  - Depends on: `core:compile-context`, `core:get-project-context`

### Modified specs

- `cli:change-context`: Text output MUST delegate to `changeContextToMarkdown`; replace blanket `spec-preview` guidance with source-aware hints.
  - Depends on (added): `sdk:context-markdown`
  - Depends on (removed): none
- `cli:project-context`: Text output MUST delegate to `projectContextToMarkdown`; add `specs context` catalogue hint; never mention `spec-preview`.
  - Depends on (added): `sdk:context-markdown`
  - Depends on (removed): none
- `sdk:composition`: Public barrel MUST export the new presentation helpers and their option types.
  - Depends on (added): `sdk:context-markdown`
  - Depends on (removed): none

## Impact

- New `packages/sdk/src/presentation/` module + tests
- CLI `change/context.ts` and `project/context.ts` refactor to call SDK helpers
- CLI/SDK docs for context commands and presentation API
- MCP and other hosts can reuse the same markdown without duplicating hint logic

## Technical context

- Text assembly today lives only in CLI (`change/context.ts` ~line 180; `project/context.ts` ~line 120). Core has no presentation strings.
- `buildProjectStatusSnapshot` is structured-only by design; this change deliberately introduces presentation helpers because agent-facing hints are product contract, not host decoration.
- Change catalogue already splits `dependsOnTraversal` under `### Via dependencies` — preserve that in the SDK helper.
- Agreed API shape: first parameter is named `context` (not `result`); `changeContextToMarkdown` needs `changeName` for `spec-preview` hints; `projectContextToMarkdown` takes only the context.
- `spec-preview` is only for change-scoped catalogue specs (`source: 'specIds'`) because they may have deltas or be new; canonical specs use `specs context`.
- Deferred: unified `change spec-context` command; optimizing merged preview content; `recommendedLoadCommand` on core entries; defaulting hybrid/`--include-change-specs`.

## Open questions

None — wording and presentation choices settled:

- Prose hints above catalogue sections (not a `Load via` table column).
- Same hints for `list` and `summary` catalogue entries.
- Hint wording: change specs → `spec-preview` for merged content; everything else / project → `specs context` for optimized context.
