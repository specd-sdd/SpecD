# Proposal: drafted-change-read-only

## Motivation

Drafted changes are meant to be parked copies of in-progress work — visible and restorable, but not part of the active working set. Today the core layer treats a drafted change like an active one: `ChangeRepository.get()` and `mutate()` resolve a name in both `changes/` and `drafts/`, so lifecycle transitions, artifact validation, and other writes can run against a drafted change. That bypasses the intent of drafting and can corrupt workflow history. We need a clear storage/API split plus a read-only surface so drafts cannot be mutated by accident or by type-unsafe callers.

## Current behaviour

- `Change.isDrafted` is derived from history (`drafted` / `restored` events) and only affects directory placement under `.specd/drafts/` when persisted.
- `ChangeRepository.get()` and `mutate()` resolve a change by name across both `changes/` and `drafts/` with no immutability check.
- Mutating use cases (`TransitionChange`, `ValidateArtifacts`, `EditChange`, approvals, etc.) can run against a drafted change if the caller supplies its name.
- `list()` already excludes drafts; `get()` does not — API inconsistency.
- `specs/core/change/spec.md` documents draft, restore, and discard as storage moves orthogonal to lifecycle state, but does not require immutability while drafted.
- CLI `drafts show` checks `isDrafted` after loading via status; that is not a core enforcement gate.

## Proposed solution

Introduce **drafted read-only semantics in `@specd/core`** in three layers (defence in depth):

### 1. Repository resolution split (primary gate)

| API                     | Resolves in     | Purpose                                    |
| ----------------------- | --------------- | ------------------------------------------ |
| `get(name)`             | `changes/` only | Active working set; used by `mutate`       |
| `getDraft(name)`        | `drafts/` only  | Read drafted change via facade (see below) |
| `mutate(name, fn)`      | active only     | Serialized RMW for active changes          |
| `mutateDraft(name, fn)` | drafts only     | `RestoreChange`, `DiscardChange` only      |

Lifecycle and transforming use cases keep calling `get` / `mutate` unchanged — a drafted name returns `null` / `ChangeNotFoundError`, so drafts cannot be mutated through the default path.

### 2. Read-only facade (type safety)

`getDraft(name)` returns a **`DraftedChangeView`** (facade), not a mutable `Change`:

- Wraps the loaded `Change` internally; **does not** expose the inner instance to callers.
- Exposes read accessors needed for status, listing, preview, and context (`name`, `state`, `specIds`, artifact states, schema identity, `isDrafted: true`, etc.).
- Does **not** expose `transition`, `updateSpecIds`, `draft`, `restore`, or other mutating entity methods.

Restore and discard use `mutateDraft` inside the repository/use case boundary, where the full `Change` is available for domain events and persistence.

### 3. Secondary guards

- `DraftedChangeReadOnlyError` when `save` / `saveArtifact` (or direct manifest writes) are attempted for a drafted change outside `mutateDraft`.
- Optional entity-level checks as belt-and-suspenders; repository rules are authoritative.

**Allowlisted while drafted:** `RestoreChange`, `DiscardChange`, read-only use cases via `getDraft` / `listDrafts`.

**Blocked while drafted:** all other transforms (transitions, validation persistence, scope edits, approvals, etc.) — unreachable via `get`/`mutate` on active paths.

Terminology: use **Draft** / **Drafted** only in new requirements, types, and messages — not **Shelved**.

CLI error messaging may improve as a consequence; not the primary deliverable.

## Specs affected

### New specs

- `core:read-only-change-view`: Shared read-only contract and single `ReadOnlyChangeFacade` for drafted and discarded projections (`toDraftedChangeView` / `toDiscardedChangeView`).
  - Depends on: `core:change`

- `core:drafted-change-view`: `DraftedChangeView extends ReadOnlyChangeView` (+ `isDrafted`).
  - Depends on: `core:read-only-change-view`, `core:change`, `core:change-repository-port`

- `core:discarded-change-view`: `DiscardedChangeView extends ReadOnlyChangeView` (+ discard metadata accessors).
  - Depends on: `core:read-only-change-view`, `core:change`, `core:change-repository-port`

- `core:drafted-change-read-only-error`: Domain error when a transforming operation targets a drafted change outside `mutateDraft` (secondary guard).
  - Depends on: `core:change`

- `core:get-draft`: Application use case to load a single drafted change by name via `ChangeRepository.getDraft`, returning `DraftedChangeView`.
  - Depends on: `core:drafted-change-view`, `core:change-repository-port`

- `core:get-discarded`: Load one discarded change via `getDiscarded` → `DiscardedChangeView` (fixes `discarded show`).
  - Depends on: `core:discarded-change-view`, `core:change-repository-port`

- `core:list-discarded`: Returns `DiscardedChangeView[]` via shared facade (parity with `listDrafts`).

### Modified specs

- `core:change`: Drafted changes are outside the active working set; read-only until restored; document relationship to `DraftedChangeView` and allowed operations.
  - Depends on (added): none

- `core:change-repository-port`: `get` / `mutate` active-only; `getDraft` → `DraftedChangeView`; `mutateDraft` for draft-only RMW; `save` / `saveArtifact` guards.
  - Depends on (added): `core:drafted-change-view`, `core:drafted-change-read-only-error`

- `core:restore-change`: Uses `mutateDraft` (or equivalent); only path that clears drafted status.
  - Depends on (added): none

- `core:discard-change`: Uses `mutateDraft` when discarding from `drafts/`.
  - Depends on (added): none

- `core:list-drafts`: Returns `DraftedChangeView[]` via `listDrafts()`.
  - Depends on (added): `core:drafted-change-view`

- `core:get-status`: `get` then `getDraft`; `draftView` when drafted; read-only transitions.
  - Depends on (added): `core:drafted-change-view`, `core:get-draft`

- `core:draft-change`: Returns `DraftedChangeView` after draft.
  - Depends on (added): `core:drafted-change-view`

### CLI specs (tracking / codegraph)

- `cli:drafts-show`: Uses `GetDraft`, not `GetStatus`.
- `cli:discarded-show`: Uses `GetDiscarded` + `DiscardedChangeView`, not `GetStatus`.
- `cli:discarded-list`: Uses `ListDiscarded` views (discard fields from view, not CLI history scan).
- `cli:drafts-list`: Uses `ListDrafts` read model (`DraftedChangeView[]`).
- `cli:change-status`: Read-only output when status is for a drafted change.
- `cli:change-draft`: No-op delta (behaviour unchanged; included for graph coverage).
- `cli:project-status`, `cli:project-dashboard`: No-op deltas (count-only `listDrafts`; graph coverage).

## Impact

| Area                                    | Impact                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| `change-repository.ts`                  | Split `_resolveDir`; implement `getDraft`, `mutateDraft`; narrow `get`/`mutate` |
| `change-repository-port`                | New methods and `DraftedChangeView` type                                        |
| `domain/`                               | `DraftedChangeView` facade + `DraftedChangeReadOnlyError`                       |
| `restore-change`, `discard-change`      | `mutateDraft`                                                                   |
| `get-status`                            | `get` then `getDraft`; `draftView` + read-only transitions when drafted         |
| `list-drafts`, `draft-change`           | Return / list `DraftedChangeView`                                               |
| CLI `drafts show/list`, `change status` | `GetDraft`, `ListDrafts`, read-only drafted status                              |
| CLI `discarded show`                    | `GetDiscarded` (not `GetStatus`)                                                |
| `get-discarded` / `getDiscarded`        | `discarded/` only; read-only audit load                                         |
| `create-change`                         | Collision check includes `getDraft`                                             |
| Most mutating use cases                 | **No change** (draft invisible to `get`)                                        |
| Tests                                   | Repo + facade + transition-on-draft-name → not found                            |

Out of scope: `mutateDiscarded` / undiscard; renaming all legacy "shelved" strings repo-wide.

## Technical context

- **Agreed with user:** `get` = active only; explicit `getDraft` for drafts — fewer call-site changes than rewriting every use case.
- **Agreed with user:** Facade is required for security even with repo split — compile-time/read API must not surface a mutable `Change` for drafts.
- **`DraftChange`:** Still uses `mutate` on active change to append `drafted` and move to `drafts/`.
- **`GetStatus`:** May load via `get` then `getDraft`; when drafted, surface read-only status (no actionable transitions) — detail in design.
- **Not using** `class Draft extends Change` — composition over inheritance; inner `Change` stays package-private to repository/facade construction.
- **Error name:** `DraftedChangeReadOnlyError` (resolved for secondary guards).

## Open questions

1. Exact surface of `DraftedChangeView` — enumerate getters in design from `GetStatus`, `PreviewSpec`, `CompileContext`, `drafts show`.
2. Whether `changePath` for drafted changes lives on the facade or a draft-specific repository helper.
3. CLI spec in this change vs follow-up.
