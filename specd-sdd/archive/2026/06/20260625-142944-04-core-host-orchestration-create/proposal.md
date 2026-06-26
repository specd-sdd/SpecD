# Proposal: 04-core-host-orchestration-create

## Motivation

CLI `change create` resolves the active schema via `getActiveSchema` before calling `CreateChange`, then runs a separate `detectOverlap` pass for stderr warnings. Schema resolution is host orchestration that belongs inside the use case — same pattern as P1a (`CompileContext` / `GetProjectContext` baking yaml-derived defaults at construction).

## Current behaviour

Today:

- `packages/cli/src/commands/change/create.ts` calls `kernel.specs.getActiveSchema.execute()` (~lines 67–69), extracts `schema.name()` / `schema.version()`, and passes them as required `CreateChangeInput` fields.
- After `create.execute`, the CLI calls `kernel.changes.detectOverlap.execute({ name })` in a try/catch to emit a stderr overlap warning (~lines 86–105).
- `CreateChangeInput` requires `schemaName` and `schemaVersion` on every call.
- `createCreateChange(config)` wires `ChangeRepository`, `ListWorkspaces`, and `ActorResolver` only — callers must supply schema identity externally.

## Proposed solution

**P1b — bake schema resolution into `CreateChange`:**

1. Make `schemaName` and `schemaVersion` optional on `CreateChangeInput`. When both are absent, `CreateChange` calls `GetActiveSchema.execute()` (project mode) and derives schema identity from the returned `Schema`.
2. When both are provided, use them directly (explicit override for tests and programmatic callers).
3. Add optional `includeOverlapCheck?: boolean`. When `true` and `specIds` is non-empty, after persistence the use case calls `DetectOverlap.execute({ name })` and includes `overlapReport` on `CreateChangeResult`. Overlap detection failures are non-fatal (best-effort, same as CLI today).
4. Inject `GetActiveSchema` and `DetectOverlap` into `CreateChange` constructor; update kernel and `createCreateChange` wiring.
5. CLI drops `getActiveSchema` prelude and inline `detectOverlap` block; passes `includeOverlapCheck: true` when `specIds.length > 0` and formats stderr warning from `result.overlapReport`.

## Specs affected

### New specs

_none_

### Modified specs

- `core:create-change`: optional schema fields with internal `GetActiveSchema` resolution; optional overlap check via `DetectOverlap`; updated constructor dependencies and result type.
  - Depends on (added): `core:get-active-schema`, `core:spec-overlap`
  - Depends on (removed): none

- `core:get-active-schema`: no API change — remains the canonical project-mode schema resolver that `CreateChange` delegates to.
  - Depends on (added): none
  - Depends on (removed): none

- `cli:change-create`: remove host-side schema resolution and overlap detection; delegate to `CreateChange` orchestration.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Core:** `CreateChange`, `createCreateChange`, `kernel.ts` / `kernel-internals.ts`, unit tests.
- **CLI:** `change/create.ts`, `change-create.spec.ts`, `change.spec.ts`.
- **API surface:** `CreateChangeInput` loses required `schemaName`/`schemaVersion`; gains `includeOverlapCheck?`. `CreateChangeResult` gains `overlapReport?`. Constructor gains `GetActiveSchema` and `DetectOverlap`.
- **Blast radius:** MEDIUM — 7 affected files including kernel wiring (per graph impact analysis).

## Technical context

- Precedent: P1a baked yaml-derived `CompileContextConfig` at construction; P1b bakes schema resolution orchestration into the create use case instead of repeating it in every host.
- `GetActiveSchema` project mode is already a thin delegate to `ResolveSchema` — `CreateChange` must not duplicate resolution logic.
- Overlap warning formatting stays in CLI (presentation); detection moves to core (orchestration).
- `createCreateChange(SpecdConfig)` must wire `GetActiveSchema` and `DetectOverlap` alongside existing ports so standalone factory callers get the same behaviour as kernel hosts.
- Independent of P0/P1a; can land after P0 wave.

## Open questions

_none — explicit schema override retained for tests; overlap check opt-in preserves current CLI warning behaviour._
