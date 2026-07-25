# Proposal: save-artifact-reopen-vs-drift

## Motivation

Artifact writes and change persistence today can leave an in-memory `Change` whose
status does not match what a subsequent `get()` would report after reconciling with
disk. The public `save()` escape hatch and `saveArtifact`'s unconditional
`in-progress` reopen make that inconsistency easy to persist and hard to reason about.

## Current behaviour

`ChangeRepository.save(change)` is a public low-level manifest write. Callers can
`get` → mutate a stale snapshot → `save`, skipping the serialized load of `mutate`.
The only production use-case caller is `CreateChange` (first persist); every other
update path already uses `mutate` / `mutateDraft`, which call `save` internally.

`saveArtifact` writes file bytes and then calls `ChangeArtifact.setFileStatus(...,
'in-progress')` on the caller-supplied `Change`, without persisting the manifest.
`setFileStatus` has no other callers in the repo. Production code does not call
`saveArtifact` at all; agents typically edit files on disk directly. Read-path
`get()` already detects content vs `validatedHash` drift and may invalidate.

`mutate(name, fn)` loads a fresh `Change`, runs `fn`, saves that object, and returns
whatever `fn` returns. Many use cases `return fresh` (or `{ change: fresh, ... }`)
and treat that object as the durable result. That object is only as true as the
manifest just written: it is not guaranteed equal to a post-save `get()`, which may
re-derive status or fire `artifact-drift` against disk.

## Proposed solution

Make persistence follow one serialized model and one drift chokepoint:

1. **Public create, internal save**
   - Add `create(change)` for first-time persist of a new change.
   - Keep `save` as an **internal** primitive used by `create`, `mutate`, and
     `mutateDraft` — not part of the port surface use cases call.

2. **`mutate` / `mutateDraft` return `{ result, change }`**
   - `result` — value returned by the callback (projections, flags, `void`).
   - `change` — `Change` after save **and** a reconcile re-read through the same
     load path as `get` (drift / disk re-derive), so the returned aggregate matches
     what a following `get` would see.
   - Callbacks stop returning `fresh` as the durable change; use cases that need a
     `Change` take `.change`. Projections that depend on artifact status should be
     computed from `.change` when reconciliation can change them.

3. **`saveArtifact` writes bytes only (default: helper inside `mutate`)**
   - Default API: callable only inside an active `mutate` / `mutateDraft` window.
     Enforcement is repository-internal (the existing per-name in-progress mutation
     sets already used for drafted `save`/`saveArtifact` guards): if the change
     name is not in an active mutate window, `saveArtifact` MUST reject.
     Callers do not need a public `isMutating` API.
   - Writes artifact file content (with `originalHash` / `force` conflict checks).
   - Does **not** mutate the in-memory `Change` — no status, hash, history, or
     `setFileStatus`. Removes the unconditional `in-progress` reopen (and
     `setFileStatus` itself once unused).
   - Returns `void`. The durable post-write `Change` comes from `mutate`'s
     `.change` after reconcile — not from `saveArtifact`.
   - Does **not** classify drift; post-`mutate` reconcile (same load path as
     `get`) owns that. Optional later sugar that wraps `mutate` solely to write
     one file may return that `.change`, but is not required for this change.

4. **Read-path drift stays the safety net** for out-of-band disk edits.

## Specs affected

### New specs

None.

### Modified specs

- `core:change-repository-port`: replace public `save` with `create` + internal
  persist semantics; redefine `mutate` / `mutateDraft` return shape; redefine
  `saveArtifact` as in-mutate content write only (`void`, no Change mutation).
  - Depends on (added): none
  - Depends on (removed): none
- `core:fs-change-repository`: implement `create`, internal `save`, post-mutate
  reconcile re-read, and byte-only `saveArtifact` (no `setFileStatus`); index
  rules for non-listing writes unchanged.
  - Depends on (added): none
  - Depends on (removed): none
- `core:create-change`: persist via `create` instead of public `save`.
  - Depends on (added): none
  - Depends on (removed): none

Use-case specs whose **external** execute contracts stay returning `Change` /
result DTOs do not need requirement rewrites solely because they adapt to the new
`mutate` return shape; only ports and create persistence wording change unless a
spec explicitly documents `save()` or returning the pre-reconcile snapshot.

## Impact

### Port / infrastructure

| Area                                          | Change                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChangeRepository` port                       | Add `create`; remove public `save` (or mark non-callable from use cases); `mutate`/`mutateDraft` → `{ result, change }`; `saveArtifact` contract rewrite |
| `FsChangeRepository`                          | Implement above; after `save` in mutate paths, reconcile via load/`get` path; drop `setFileStatus` in `saveArtifact`                                     |
| `ChangeArtifact.setFileStatus`                | Remove if nothing else needs it                                                                                                                          |
| Test stubs (`StubChangeRepository`, FS specs) | Match new port surface                                                                                                                                   |

### Use cases — `save` → `create`

| Use case       | Change                                                          |
| -------------- | --------------------------------------------------------------- |
| `CreateChange` | `await this._changes.create(change)` instead of `.save(change)` |

### Use cases — adapt to `mutate` / `mutateDraft` → `{ result, change }`

| Use case                        | Today                                                                            | Required change                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApproveSpec`                   | `return mutate(..., () => { ...; return fresh })`                                | Return `.change` (callback `result` unused / `void`)                                                                                                                                            |
| `ApproveSignoff`                | same                                                                             | same                                                                                                                                                                                            |
| `DiscardChange`                 | `return mutate` / `mutateDraft` with `return change`                             | Return `.change`                                                                                                                                                                                |
| `RestoreChange`                 | `return mutateDraft` with `return change`                                        | Return `.change`                                                                                                                                                                                |
| `SkipArtifact`                  | `return mutate` with `return change`                                             | Return `.change`                                                                                                                                                                                |
| `UpdateSpecDeps`                | `return mutate` with deps array / change                                         | Split: deps list in `result`, durable entity from `.change` if returned                                                                                                                         |
| `TransitionChange`              | `persistedChange = mutate(..., return fresh)`                                    | Use `.change`                                                                                                                                                                                   |
| `EditChange`                    | `persisted = mutate(..., return { change: fresh, invalidated, removedSpecIds })` | Callback returns `{ invalidated, removedSpecIds }`; assemble `{ change: .change, ...result }`                                                                                                   |
| `InvalidateChange`              | same pattern with `{ change, affected }`                                         | same — prefer `.change` over fresh                                                                                                                                                              |
| `ArchiveChange`                 | assigns `change = mutate(..., return fresh)` (and other fire-and-forget mutates) | Use `.change` where the returned entity is kept; ignore `.result` on side-effect-only calls                                                                                                     |
| `DraftChange`                   | `await mutate` (discard return)                                                  | Optional: ignore `{ result, change }` or assert post-draft location via `.change`                                                                                                               |
| `ValidateArtifacts`             | `await mutate` (side effects only)                                               | Ignore return (or use `.change` if later logic needs it)                                                                                                                                        |
| `RefreshImplementationTracking` | `implementationTracking = mutate(..., return project...(fresh))`                 | Prefer `project...( .change )` after mutate if projection depends on reconciled artifact/implementation state; else keep projection in `result` and document that it was computed pre-reconcile |
| `UpdateImplementationTracking`  | same                                                                             | same                                                                                                                                                                                            |

### `saveArtifact`

| Area                        | Change                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Port + `FsChangeRepository` | In-mutate byte write only; `void`; no `setFileStatus` / no Change touch                                              |
| Call sites                  | None in production today; update FS tests that expect in-progress on the in-memory change after `saveArtifact` alone |

### Out of scope

- Index-cache `mutate` helpers (`FsChangeIndexCache`, validation-result cache) — unrelated API
- Changing LifecycleEngine transition rules
- SpecList / Meta work on other changes

## Technical context

Agreed direction from design discussion:

- The manifest **is** the persisted `Change`; artifact file bytes are separate.
- Anything that updates change state for an **existing** change goes through
  `mutate` / `mutateDraft`. `save` must not remain a public bypass.
- `fresh` inside the callback can still diverge from disk (TOCTOU hash,
  out-of-band file edits, writes during the callback). Drift detection must stay
  in the **single load/reconcile path**, not be copied into `saveArtifact`.
- Post-mutate re-read may perform a second manifest write when reconcile detects
  drift — that is intended.
- Guarantee is **at mutate exit** (`.change`), not mid-callback.
- `mutateDraft` should use the same `{ result, change }` shape; load after save
  must resolve the correct bucket after directory moves (draft ↔ active ↔
  discarded).

Alternatives rejected:

1. Keep public `save` + document “prefer mutate” — still allows stale snapshot writes.
2. Classify drift inside `saveArtifact` — duplicates load-path logic; misses other
   inconsistency sources.
3. Only remove `setFileStatus` without post-mutate reconcile — fixes false reopen
   but still lets callers trust a pre-reconcile `fresh` return value.
4. `get()` after `save` as an ad-hoc caller pattern — correct idea, wrong layer;
   belongs inside `mutate` so every caller gets it.

## Open questions

None. Scope includes port reshape (`create` / internal `save` / mutate return /
`saveArtifact`) and mechanical use-case adaptations listed above; detailed
signatures and reconcile helper shape belong in design/specs.
