## Spec compliance audit — drafted-change-read-only

Date: 2026-05-26
Change: `drafted-change-read-only`
Mode: full (verification + compliance)

### Scope

Specs in change (22):

- core:change
- core:change-repository-port
- core:restore-change
- core:discard-change
- core:drafted-change-view
- core:drafted-change-read-only-error
- core:get-draft
- core:list-drafts
- core:get-status
- core:draft-change
- core:get-discarded
- core:discarded-change-view
- core:list-discarded
- core:read-only-change-view
- cli:drafts-show
- cli:drafts-list
- cli:change-draft (no-op)
- cli:change-status
- cli:project-status (no-op)
- cli:project-dashboard (no-op)
- cli:discarded-show
- cli:discarded-list

### Method (what “full” means here)

This audit checks **code compliance against the merged specs and scenarios**, not just tracking hygiene.

- **Spec source of truth**: merged spec/scenario content from:
  - `node packages/cli/dist/index.js changes spec-preview drafted-change-read-only <specId> --artifact specs|verify`
    (deltas applied).
- **Implementation evidence**: code inspection (located via `specd graph search/impact`) plus:
  - pre-verifying hooks (tests/lint/typecheck)
  - manual smoke steps from design.md

### Evidence executed

- Verifying pre-hooks: tests/lint/typecheck ok.
- Post-verifying hooks: none configured.
- Manual smoke:
  - Draft lifecycle: drafted changes cannot transition; `drafts show` works; restore returns to active transitions.
  - Discarded show: `discarded show` prints reason; `change status` fails for discarded-only name.
- Code graph re-indexed: stale diagnostics cleared; symbol links validated.

### Spec-by-spec compliance summary (merged specs + scenarios)

#### core:get-status + cli:change-status (drafted read-only status)

- **Spec requirement**: `GetStatus` resolves active via `get()`, then draft via `getDraft()`, never via `getDiscarded()`. Drafted status must be inspection-only (no transitions, no transition/validate commands).
- **Code evidence**:
  - `packages/core/src/application/use-cases/get-status.ts`: `execute()` resolution order and `_buildDraftedResult()` (draftView, empty transitions, nextAction.command null).
  - `packages/cli/src/commands/change/status.ts`: branches on `draftView` and renders drafted marker.
- **Scenario evidence**:
  - Manual 7.1: `change transition` for drafted name fails; after restore `change status` shows transitions again.

#### core:get-draft + cli:drafts-show

- **Spec requirement**: `GetDraft` calls only `ChangeRepository.getDraft()`, throws `ChangeNotFoundError` otherwise, and is read-only (no mutate/save).
- **Code evidence**:
  - `packages/core/src/application/use-cases/get-draft.ts`: calls `getDraft` only; no mutation calls.
  - `packages/cli/src/commands/drafts/show.ts`: calls `kernel.changes.getDraft.execute`.
- **Scenario evidence**:
  - Manual 7.1: `drafts show <name>` renders metadata for drafted change.

#### core:get-discarded + cli:discarded-show

- **Spec requirement**: `GetDiscarded` calls only `ChangeRepository.getDiscarded()`, throws otherwise, and is read-only. CLI prints `discardReason`.
- **Code evidence**:
  - `packages/core/src/application/use-cases/get-discarded.ts`
  - `packages/cli/src/commands/discarded/show.ts`
- **Scenario evidence**:
  - Manual 7.2: `discarded show` prints the discard reason; `change status` reports not found.

#### core:change-repository-port (storage split + guards)

- **Spec requirement**:
  - `get`/`mutate` are active-only.
  - `getDraft`/`mutateDraft` are drafts-only.
  - `getDiscarded` is discarded-only.
  - drafted changes are read-only except within `mutateDraft` (and active→draft move path).
- **Code evidence**:
  - `packages/core/src/infrastructure/fs/change-repository.ts`: `get`, `getDraft`, `getDiscarded`, `mutate`, `mutateDraft`, drafted save/saveArtifact guards.
- **Test evidence**:
  - FS repo + archive tests executed via hooks.

#### core:read-only-change-view / core:drafted-change-view / core:discarded-change-view

- **Spec requirement**: views expose read-only fields; discarded view maps discard metadata; factories reject wrong lifecycle shapes.
- **Code evidence**: `packages/core/src/domain/read-only-change-view.ts`
- **Test evidence**: `packages/core/test/domain/read-only-change-view.spec.ts`

#### core:drafted-change-read-only-error

- **Spec requirement**: error uses code `DRAFTED_CHANGE_READ_ONLY` and carries `changeName` + `operation`.
- **Code evidence**: `packages/core/src/domain/errors/drafted-change-read-only-error.ts`

#### core:restore-change / core:discard-change / core:draft-change / core:change

- **Spec requirement**:
  - restore uses `mutateDraft`
  - discard branches active vs drafted, persists to discarded
  - draft returns drafted view (via `getDraft`)
  - create rejects collisions with active OR drafted, but allows discarded reuse
- **Code evidence**: corresponding use cases in `packages/core/src/application/use-cases/`.
- **Test evidence**: use-case tests executed via hooks; additional tests added/updated during implementation.

#### cli:drafts-list / cli:discarded-list

- **Spec requirement**: list commands derive fields from the read models (views), not by scanning history.
- **Code evidence**:
  - `packages/cli/src/commands/drafts/list.ts`
  - `packages/cli/src/commands/discarded/list.ts`

### Compliance result

- **No discrepancies found** between merged specs/scenarios and the current implementation for the audited surface.

### Notes / follow-ups

- `changes context` emitted warnings about missing spec metadata for some new specs (`core:get-draft`, `core:get-discarded`, `core:drafted-change-view`). This does not affect runtime behavior, but it can reduce dependency traversal completeness until metadata is generated.
