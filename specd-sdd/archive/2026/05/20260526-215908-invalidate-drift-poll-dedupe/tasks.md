# Tasks: invalidate-drift-poll-dedupe

## Before you implement

Read for every task:

1. **`proposal.md`** and **`design.md`**
2. Matching **`deltas/core/*/spec.md.delta.yaml`** and **`verify.md.delta.yaml`**
3. Run `node packages/cli/dist/index.js changes spec-preview invalidate-drift-poll-dedupe <specId> --artifact specs|verify --format text`

---

## 1. Domain — idempotent artifact-drift invalidation

- [x] 1.1 Implement dedupe gate in `Change.invalidate()`
      `packages/core/src/domain/entities/change.ts`
      Approach: before pushing history, compare last `invalidated` event (cause + normalized expanded affected set) when state is `designing` and cause is `artifact-drift`; skip append; still `markDrifted()` on focused files
      (Req: `core:change` — Policy-aware invalidation idempotent artifact-drift)

- [x] 1.2 Domain unit tests
      `packages/core/test/domain/entities/change.spec.ts`
      Approach: cover dedupe, drift flag materialization on dedupe, manual invalidate not deduped, expanded set change not deduped
      (Req: `core:change` verify scenarios)

---

## 2. Repository — idempotent manifest persistence

- [x] 2.1 Fix no-op detection in `_reconcileArtifactDrift`
      `packages/core/src/infrastructure/fs/change-repository.ts`
      Approach: compare `change.history.length` before/after `invalidate()` (not `updatedAt` alone); skip `_writeManifestAtomic` when length unchanged; return `false`/`true` accordingly
      (Req: `core:change-repository-port` — Idempotent drift reconciliation persistence)

- [x] 2.2 Repository integration tests
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`
      Approach: setup change with drift already invalidated in `designing`; call `get()` twice; assert history length and manifest mtime stable on second load
      (Req: `core:change-repository-port` verify scenarios)

---

## 3. Use case — GetStatus polling idempotency

- [x] 3.1 Confirm `GetStatus` double-load stability
      `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: mock or fs-fixture change in `designing` with persisted artifact-drift; two consecutive `execute()` calls; history length unchanged
      (Req: `core:get-status` — Read paths do not amplify artifact-drift invalidation)

---

## 4. Kernel regression

- [x] 4.1 Verify overlap invalidation tests still pass
      `packages/core/test/application/use-cases/get-status.spec.ts`
      Approach: re-run scenario merging multiple unhandled overlap invalidations — must still produce two overlap entries (dedupe must not affect non-drift causes)
      (Req: `core:kernel` — manual/non-drift invalidation unaffected)

- [x] 4.2 Run core test suite
      `pnpm -C packages/core test`
      Approach: full suite green after changes
      (Req: all verify scenarios)

---

## 5. Manual verification (Studio)

- [x] 5.1 Poll active invalidated change
      Studio with `specd-studio` change in `designing` + drift
      Approach: open Events tab or watch manifest history length while idle; confirm no new `invalidated` events every 2.5s
      (Req: end-to-end polling honesty)
