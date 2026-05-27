# Design: invalidate-drift-poll-dedupe

## How to use this artifact

**Authoritative inputs:**

1. **`proposal.md`** — problem, approach, spec inventory.
2. **`deltas/**`\*\* — spec + verify contracts for four core specs.
3. **`tasks.md`** — ordered checklist; each task maps to files and verify scenarios.

This `design.md` is the implementer's map. Requirements live in deltas; do not implement from this file alone.

---

## Problem summary

Studio global poll (`useProjectPoll`, 2.5s) triggers change status reads. Each read loads via `ChangeRepository.get()` → `_reconcileArtifactDrift`. Persistent drift caused a new `invalidated` event + manifest write every poll even when the change was already in `designing` with the same drift scope.

## Solution (two layers)

```
Poll → GetStatus → ChangeRepository.get()
                         │
                         ▼
              _reconcileArtifactDrift()
                         │
                         ▼
              Change.invalidate('artifact-drift')
                    │              │
         [new drift scope]    [same scope + designing]
                    │              │
                    ▼              ▼
           append history      dedupe (no new events)
                    │              │
                    ▼              ▼
           write manifest       skip manifest write
```

### Layer 1 — Domain (`core:change`)

**File:** `packages/core/src/domain/entities/change.ts` — method `invalidate()`

Before pushing history, when:

- `cause === 'artifact-drift'`
- `this.state === 'designing'`
- last `invalidated` event has same cause
- normalized expanded `affectedArtifacts` equals last event's set

→ return early without appending events. Still call `markDrifted()` on focused files from caller payload.

**Must NOT dedupe:** `artifact-review-required`, `spec-overlap-conflict`, `spec-change`, etc.

**Equivalence:** JSON-normalize map of `{ type → sorted file keys[] }` after policy expansion.

### Layer 2 — Repository (`core:change-repository-port`)

**File:** `packages/core/src/infrastructure/fs/change-repository.ts` — `_reconcileArtifactDrift()`

After `change.invalidate(...)`:

- Compare **history length** (or explicit domain signal) before vs after
- If unchanged → return `false`, do **not** call `_writeManifestAtomic`
- If increased → persist manifest, return `true`

> **Note:** Do not rely on `change.updatedAt` alone — `invalidate()` does not call `touchUpdatedAt()`; only `save()` does. History-length comparison matches the spec contract.

---

## Spec coverage

| Spec ID                       | Delta focus                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| `core:change`                 | Idempotent `artifact-drift` in `Policy-aware invalidation`    |
| `core:change-repository-port` | Idempotent manifest persistence on drift reconciliation       |
| `core:kernel`                 | Kernel load path must not amplify history on repeated polls   |
| `core:get-status`             | Status reads side-effect idempotent for unchanged drift scope |

No CLI, API, or UI code changes.

---

## Blast radius

| Symbol / file             | Risk   | Dependents                                                        |
| ------------------------- | ------ | ----------------------------------------------------------------- |
| `Change.invalidate`       | MEDIUM | All invalidation use cases, repository drift hook, validate drift |
| `_reconcileArtifactDrift` | LOW    | `get()`, `SaveChangeArtifact`, `reconcileArtifactDrift()` port    |
| `GetStatus.execute`       | LOW    | API handler, CLI status, Studio hooks                             |

Existing overlap invalidation and manual invalidate flows are explicitly out of dedupe scope — regression focus on `GetStatus` overlap-detail tests.

---

## Testing strategy

| File                                                             | Scenarios                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/core/test/domain/entities/change.spec.ts`              | Dedupe, manual invalidate not deduped, expanded set not deduped |
| `packages/core/test/infrastructure/fs/change-repository.spec.ts` | Double `get()` with stable drift → history length unchanged     |
| `packages/core/test/application/use-cases/get-status.spec.ts`    | Double `execute()` → stable history                             |

---

## Non-goals

- Changing poll interval or disabling drift reconciliation on reads
- Deduping non-`artifact-drift` invalidation causes
- UI spec changes (`ui:hooks-project`)

---

## Pre-existing code

Domain dedupe and repository guard were implemented before this change was created. Implementation tasks should verify behaviour against verify deltas and fix the repository no-op detection if it uses `updatedAt` instead of history length.
