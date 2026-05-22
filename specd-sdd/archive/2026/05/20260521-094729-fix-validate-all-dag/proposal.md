# Proposal: fix-validate-all-dag

## Motivation

`specd changes validate --all` is the natural batch command for agents finishing design, but today it does not respect the artifact dependency graph from the active schema. That produces spurious dependency-blocked failures, redundant work, and unnecessary re-validation of files already marked `complete` — which can interact badly with approval drift detection and invalidation policies.

The same problem exists elsewhere: several subsystems **rebuild the artifact DAG locally** from `requires` instead of sharing one schema-derived implementation, which risks drift in ordering, descendants, and tree shape.

## Current behaviour

### `changes validate --all`

With `--all`, the CLI loads the change's `specIds` and, for **each** spec, invokes `ValidateArtifacts` without `--artifact`. That attempts to validate **every** schema artifact on every iteration.

Inside `ValidateArtifacts`, artifacts are processed in schema **declaration** order. Dependency checks use a lifecycle snapshot taken **once** at the start of `execute`, so a parent validated in the same pass is not yet visible as `complete` to dependents processed later in that pass.

Additional problems:

- **Change-scoped** artifacts (`proposal`, `design`, `tasks`) are re-validated once per specId.
- **Spec-scoped** aggregates block change-scoped deps: `design` requires `specs` and `verify` to be complete across **all** spec files, so early specs in the batch often fail even when their own deltas are fine.
- Files already at file-level status `complete` are re-read and re-validated; with active spec approval or signoff, that can trigger `artifact-drift` invalidation and `downstream` policy expansion.

### Ad hoc DAG construction (must be unified)

| Location                                                                                     | What it does today                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/core/src/domain/entities/change.ts` — `_findDagDescendants`                        | BFS descendants from `change.artifacts` `requires` (policy `downstream`)              |
| `packages/core/src/application/use-cases/invalidate-change.ts` — `orderArtifactsByTraversal` | DFS forest from `change.artifacts` `requires` (affected-set reporting order)          |
| `packages/cli/src/commands/change/status.ts` — `renderDag`                                   | Roots = no `requires`; children = `filter(requires.includes(id))` on schema artifacts |
| `packages/cli/src/commands/change/status.ts` — JSON `artifactDag`                            | Same inline `children` derivation in structured output                                |
| `packages/core/src/domain/services/lifecycle-engine.ts` — `_nextArtifact`                    | First incomplete artifact in **declaration** order whose deps are ready               |
| `packages/core/src/application/use-cases/validate-artifacts.ts`                              | Full pass in declaration order; frozen lifecycle snapshot                             |

`build-schema` only validates acyclic `requires` at load time — it does not expose runtime traversal.

## Proposed solution

1. Add **`Schema.artifactDag()`** returning a cached **`ArtifactDag`** value object built only from `artifacts[].requires` (cycles already rejected at schema load). Surface: `roots()`, `childrenOf(id)`, `topologicalOrder()`, `descendantsOf(ids)`.

2. **Mandate**: any runtime code that derives artifact DAG structure (roots, children, topological order, descendants, or equivalent) MUST use `schema.artifactDag()` — no local adjacency maps or `requires.includes` filters.

3. Rewrite **`changes validate --all`** to drive validation from `artifactDag().topologicalOrder()`:
   - **`scope: change`** — validate each artifact type once per batch.
   - **`scope: spec`** — validate for each `specId` in the change.
   - **Skip** tracked files whose status is already `complete` (do not re-run structural validation or `markComplete`).
   - Refresh dependency/lifecycle state between DAG steps so children see parents completed in the same batch.

4. **Refactor all DAG consumers** in the table above to delegate to `artifactDag()`. `Change.invalidate` downstream expansion receives the active schema (or precomputed descendants) from the calling use case rather than re-deriving edges from persisted artifact `requires`.

## Specs affected

### New specs

_none_

### Modified specs

- `core:schema-format`: Document `Schema.artifactDag()` and `ArtifactDag`; forbid duplicate DAG derivation outside this API.
  - Depends on (added): none

- `core:change`: `invalidate` policy `downstream` expansion MUST use `schema.artifactDag().descendantsOf()` (schema passed from use case), not `_findDagDescendants` over local maps.
  - Depends on (added): `core:schema-format`

- `core:invalidate-change`: Affected-artifact reporting order MUST use `artifactDag()` traversal semantics (replace `orderArtifactsByTraversal` local graph).
  - Depends on (added): `core:schema-format`, `core:change`

- `core:lifecycle-engine`: `nextArtifact` MUST be the first artifact in `artifactDag().topologicalOrder()` whose effective status is not `complete`/`skipped` and whose required dependencies are satisfied.
  - Depends on (added): `core:schema-format`

- `core:validate-artifacts`: DAG-ordered batch validation, per-file skip when `complete`, refreshed dependency evaluation between steps; single-artifact loops SHOULD respect topological order when validating all artifacts for one spec.
  - Depends on (added): `core:schema-format`, `core:lifecycle-engine`

- `cli:change-validate`: `--all` (and `--all --artifact`) orchestration via `artifactDag().topologicalOrder()` and scope rules.
  - Depends on (added): `core:validate-artifacts`, `core:schema-format`, `cli:entrypoint`

- `cli:change-status`: ASCII DAG tree and JSON `artifactDag[].children` MUST be derived from `schema.artifactDag()` (roots, children, stable ordering) — no inline `requires.includes` in the CLI layer.
  - Depends on (added): `core:lifecycle-engine`, `core:schema-format`, `cli:entrypoint`

- `core:get-artifact-instruction`: When `artifactId` is omitted, auto-selection MUST use `LifecycleEngine.nextArtifact` (topological DAG order). No local DAG derivation in this use case.
  - Depends on (added): `core:lifecycle-engine`, `core:schema-format`

### Graph impact — DAG migration candidates

`graph impact` on the seven known DAG files reports **CRITICAL** blast radius for `schema.ts` (expected — `Schema` is widely consumed). Grep shows **five production sites** that build artifact DAG edges locally; no other `requires.includes` artifact-child filters in TS.

| Priority    | Location                                                             | Action                                                 | Spec                                             |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| **P0**      | `change.ts` `_findDagDescendants`                                    | `artifactDag().descendantsOf()`                        | `core:change`                                    |
| **P0**      | `invalidate-change.ts` `orderArtifactsByTraversal`                   | `artifactDag()` traversal                              | `core:invalidate-change`                         |
| **P0**      | `status.ts` `renderDag` + JSON `children`                            | `roots()` / `childrenOf()`                             | `cli:change-status`                              |
| **P0**      | `validate-artifacts.ts`, `validate.ts` `executeBatch`                | Topo batch + skip `complete`                           | `core:validate-artifacts`, `cli:change-validate` |
| **P0**      | `schema.ts`                                                          | `artifactDag()` API                                    | `core:schema-format`                             |
| **P1**      | `lifecycle-engine.ts` `_nextArtifact`                                | `topologicalOrder()` + deps ready                      | `core:lifecycle-engine`                          |
| **P1**      | `get-artifact-instruction.ts`                                        | Consumes `lifecycle.nextArtifact` only                 | `core:get-artifact-instruction`                  |
| **P2**      | `*_spec.ts` (status, validate, invalidate, lifecycle, change entity) | Assertion updates                                      | design/tasks only                                |
| **Exclude** | `compile-context`, `archive-change`, `generate-spec-metadata`        | Use `artifacts()` for content iteration, not DAG shape | —                                                |
| **Exclude** | `depends-on-traversal`                                               | Spec `dependsOn` graph, not artifact DAG               | —                                                |
| **Exclude** | `build-schema` `detectCycle`                                         | Load-time acyclic check (optional future share)        | —                                                |
| **Exclude** | `build-schema` workflow `requires.includes`                          | Step vs artifact ID check, not DAG children            | —                                                |

## Impact

- **Core domain**: `ArtifactDag` VO; `Schema.artifactDag()`; remove or delegate `Change._findDagDescendants`
- **Core application**: `validate-artifacts.ts`, `invalidate-change.ts`, `lifecycle-engine.ts`; `Change.invalidate` signature/callers may pass `Schema` or `ArtifactDag`
- **CLI**: `change/validate.ts`, `change/status.ts`
- **Tests**: dedicated `artifact-dag` / `schema` unit tests; update `change.spec.ts`, `change-status.spec.ts`, `invalidate-change.spec.ts`, `lifecycle-engine.spec.ts`, `change-validate.spec.ts`
- **Out of scope**: `build-schema` cycle detection (unchanged); `schema show` listing (declaration order OK for display)

## Technical context

- User confirmed DAG must come from **schema only** — no hardcoded artifact lists.
- Preferred API: single **`schema.artifactDag()`** on `Schema`.
- User requested **all DAG construction sites** move to the shared implementation and **corresponding specs** be included in this change.
- Re-validation of `complete` files is risky when approval/signoff is active (`artifact-drift` + `downstream` policy).
- **Spec overlap warning** (non-blocking for design): `core:change` and `cli:change-status` are also targeted by active change `implementation-file-tracking`. Archive order or `--allow-overlap` may be needed later.

## Resolved decisions

1. **Batch skip rule**: Skip validation only for file status `complete` or `skipped`. Re-validate `drifted-pending-review`, `complete-with-drift`, `in-progress`, `pending-review`, `missing`, and all other non-terminal states.
2. **Structured status wire shape**: `ArtifactDag` exposes `childrenOf(id)` only; CLI (`change status` JSON/toon) and any other consumers map to `artifactDag[].children` at the presentation layer — no precomputed children map on the VO.
3. **Documentation**: Update `docs/cli/cli-reference.md` for `--all` DAG semantics — tracked in `design.md` / `tasks.md`.
4. **`LifecycleEngine.nextArtifact`**: First artifact in `artifactDag().topologicalOrder()` whose effective status is not `complete`/`skipped` and whose `requires` dependencies are satisfied (replaces declaration-order scan).
5. **`--all --artifact <id>`**: Uses the same DAG-aware batch driver as full `--all`; walks topological order and runs only steps matching `<id>` (change-scoped once, spec-scoped per `specId`).
6. **`build-schema` graph build**: Out of scope for v1 — keep existing `detectCycle` at load; do not require `ArtifactDag` reuse inside `validateArtifactGraph` in this change.

## Compliance remediation (post-audit)

Full-mode compliance (`reports/20260522-193804/`) found **partial** alignment after the main DAG implementation. This pass closes:

| ID              | Fix                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------- |
| SF-1            | `EditChange` uses active `schema.artifactDag()` (not `artifactDagFromChangeArtifacts`)       |
| VA-1 / CLI-V1   | Change-scoped `ValidateArtifacts` omits `specPath`; batch driver does not pass a placeholder |
| CLI-V2          | Batch JSON `results[]` exposes `warnings` per merged spec                                    |
| CLI-S1 / CLI-S2 | Text DAG uses `displayStatus`; `hasTasks` true when `taskCompletionCheck` is set             |
| VA-2 / SF-2     | Unit tests for topo multi-artifact order; status prefers `schema.artifactDag()`              |
| UX              | Text DAG renders each artifact id once (skip already-drawn nodes in convergent graphs)       |

Specs, design, tasks, and verify deltas are updated; implementation follows in `/specd-implement`.

## Open questions

_none — resolved 2026-05-21._
