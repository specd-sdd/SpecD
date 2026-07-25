# Tasks: save-artifact-reopen-vs-drift

## 1. Port surface

- [x] 1.1 Add `MutateResult<T>` type
      `packages/core/src/application/ports/change-repository.ts`: export `MutateResult<T>` with `result` and `change`
      Approach: `export interface MutateResult<T> { readonly result: T; readonly change: Change }`
      (Req: mutate serializes persisted change updates)

- [x] 1.2 Change `mutate` / `mutateDraft` signatures to return `MutateResult<T>`
      `packages/core/src/application/ports/change-repository.ts`: abstract `mutate` / `mutateDraft`
      Approach: `Promise<MutateResult<T>>`; JSDoc states `.change` is post-reconcile
      (Req: mutate serializes…, mutateDraft serializes…)

- [x] 1.3 Add abstract `create(change)` and remove public abstract `save`
      `packages/core/src/application/ports/change-repository.ts`: abstract methods list
      Approach: `abstract create(change: Change): Promise<void>`; delete `abstract save`; document internal persist in class JSDoc only
      (Req: create persists a new change; save is internal; Abstract class with abstract methods)

- [x] 1.4 Rewrite `saveArtifact` port contract
      `packages/core/src/application/ports/change-repository.ts`: `saveArtifact`
      Approach: JSDoc — void; mutate-window only; no Change mutation; conflict checks unchanged
      (Req: saveArtifact with optimistic concurrency)

## 2. FsChangeRepository

- [x] 2.1 Move public `save` body to internal `_persistManifest`
      `packages/core/src/infrastructure/fs/change-repository.ts`: private `_persistManifest`
      Approach: rename/move current `save` implementation; keep drafted-window guard
      (Req: create persists…; save is internal)

- [x] 2.2 Implement `create(change)`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `create`
      Approach: refuse if name exists in any bucket; mkdir + `_persistManifest` (first-persist path)
      (Req: create delegates to internal first persist)

- [x] 2.3 Return `MutateResult` from `mutate` with post-persist reconcile
      `packages/core/src/infrastructure/fs/change-repository.ts`: `mutate`
      Approach: after `_persistManifest(fresh)`, reload via get/`_manifestToChange` path under lock; persist again if needed; return `{ result, change }`
      (Req: mutate serializes…; mutate and mutateDraft reconcile after persist)

- [x] 2.4 Return `MutateResult` from `mutateDraft` with post-persist reconcile
      `packages/core/src/infrastructure/fs/change-repository.ts`: `mutateDraft`
      Approach: same as mutate; reload from post-move bucket
      (Req: mutateDraft serializes…; mutate and mutateDraft reconcile after persist)

- [x] 2.5 Enforce mutate window and byte-only `saveArtifact`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `saveArtifact`
      Approach: reject if name not in `_activeMutationInProgress` / `_draftMutationInProgress`; write bytes; remove `setFileStatus` call
      (Req: saveArtifact…; saveArtifact requires mutate window…)

- [x] 2.6 Align write-path index comments/behaviour with `create` / internal persist
      `packages/core/src/infrastructure/fs/change-repository.ts`: index maintenance after `_persistManifest` / `create`
      Approach: ensure create upserts like former first save; saveArtifact still skips index
      (Req: Write-path index maintenance)

## 3. Domain cleanup

- [x] 3.1 Remove `setFileStatus` if unused
      `packages/core/src/domain/entities/change-artifact.ts`: `setFileStatus`
      Approach: delete method after saveArtifact no longer calls it; fix any stray references
      (Req: saveArtifact MUST NOT mutate Change)

- [x] 3.2 Add or reuse error for saveArtifact outside mutate window
      `packages/core/src/domain/errors/`: dedicated or existing machine-readable error
      Approach: per design — `ChangeMutationRequiredError` or reuse if a clear fit exists; export from errors index
      (Req: saveArtifact outside mutate window is rejected)

## 4. CreateChange

- [x] 4.1 Persist via `create`
      `packages/core/src/application/use-cases/create-change.ts`: `execute`
      Approach: replace `_changes.save(change)` with `_changes.create(change)`
      (Req: Persistence and scaffolding)

## 5. Use-case mutate adaptations

- [x] 5.1 Adapt approvals to `.change`
      `approve-spec.ts`, `approve-signoff.ts`
      Approach: `const { change } = await mutate(...); return change` (callback returns void)
      (Req: mutate returns { result, change })

- [x] 5.2 Adapt discard / restore / skip / update-spec-deps
      `discard-change.ts`, `restore-change.ts`, `skip-artifact.ts`, `update-spec-deps.ts`
      Approach: durable entity from `.change`; deps list in `result` where applicable
      (Req: mutate / mutateDraft return shape)

- [x] 5.3 Adapt transition / edit / invalidate
      `transition-change.ts`, `edit-change.ts`, `invalidate-change.ts`
      Approach: callback returns flags only; assemble results with `.change`
      (Req: mutate returns…)

- [x] 5.4 Adapt archive / draft / validate-artifacts
      `archive-change.ts`, `draft-change.ts`, `validate-artifacts.ts`
      Approach: where `change = await mutate`, use `.change`; side-effect-only awaits ignore return
      (Req: mutate returns…)

- [x] 5.5 Adapt implementation-tracking projections
      `refresh-implementation-tracking.ts`, `update-implementation-tracking.ts`
      Approach: project from `.change` after mutate when status-sensitive; else keep projection in `result` and document
      (Req: mutate returns…; post-reconcile change)

## 6. Tests

- [x] 6.1 Update `StubChangeRepository`
      `packages/core/test/application/use-cases/helpers.ts`
      Approach: implement `create`; mutate/mutateDraft return `MutateResult`; saveArtifact no status touch / window optional for stub
      (Req: Abstract class; mutate return; saveArtifact)

- [x] 6.2 FS repository integration tests for create / reconcile / saveArtifact
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`
      Approach: cover create collision, mutate `.change` vs get after saveArtifact drift, outside-window reject, no setFileStatus
      (Req: verify scenarios for create, mutate reconcile, saveArtifact)

- [x] 6.3 Update create-change unit tests
      `packages/core/test/application/use-cases/create-change.spec.ts`
      Approach: assert `create` called instead of `save`
      (Req: Persistence and scaffolding scenarios)

- [x] 6.4 Fix compiling use-case tests for `MutateResult`
      Affected `*.spec.ts` under `packages/core/test/application/use-cases/`
      Approach: update stubs/mocks and assertions that assumed `mutate` returned `Change` directly
      (Req: mutate returns…)

## 7. Docs and verification

- [x] 7.1 Update ports documentation
      `docs/core/ports.md` (+ examples if they show `save`)
      Approach: document `create`, internal save, `{ result, change }`, byte-only in-mutate `saveArtifact`
      (Req: default:\_global/docs)

- [x] 7.2 Run `@specd/core` tests
      Approach: `pnpm --filter @specd/core test` (or repo-equivalent); fix failures
      (Req: Testing)

- [x] 7.3 Manual drift check after saveArtifact-in-mutate
      Approach: complete artifact → mutate+saveArtifact different content → confirm `.change` / `changes status` show drift without saveArtifact forcing in-progress
      (Req: Post-save reconcile detects disk drift…)
