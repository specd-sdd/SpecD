# Tasks: serialize-change-mutations

## 1. Repository contract and lock infrastructure

- [x] 1.1 Add the serialized mutation API to the port
      `packages/core/src/application/ports/change-repository.ts`: `ChangeRepository` — add the new abstract `mutate<T>(name, fn)` method and JSDoc that distinguishes snapshot reads from serialized persisted mutations
      Approach: introduce `mutate<T>(name: string, fn: (change: Change) => Promise<T> | T): Promise<T>` as the only concurrency-safe read-modify-write API for existing changes; keep `get()` as a snapshot read and `save()` as low-level manifest persistence
      (Req: get returns a Change or null, mutate serializes persisted change updates, save persists the change manifest only)

- [x] 1.2 Implement per-change locking in the fs repository
      `packages/core/src/infrastructure/fs/change-repository.ts`: `FsChangeRepository.mutate`, `_withChangeLock`, `_lockDirPath`, `_acquireLock`, `_releaseLock`, `_writeLockOwner`, `_readLockOwner`, `_isPidAlive` — serialize persisted mutations of a single change name
      Approach: derive a private lock root from `path.dirname(this._changesPath)`, acquire a per-change lock with `fs.mkdir(lockDir)`, store owner metadata with PID and timestamp, reap stale locks when the owner PID is dead, reload the fresh change after lock acquisition, persist on callback success, and always release in `finally`
      (Req: mutate serializes persisted change updates)

- [x] 1.3 Keep the factory aligned with the new port without widening public options
      `packages/core/src/composition/change-repository.ts`: `createChangeRepository` — ensure the existing factory still returns a fully usable `ChangeRepository` after the port gains `mutate()`
      Approach: keep the public `FsChangeRepositoryOptions` signature unchanged; rely on the concrete repository implementation to derive its own lock root so composition fan-in does not grow
      (Req: mutate serializes persisted change updates)

## 2. Migrate fully encapsulated change mutations

- [x] 2.1 Move validation persistence onto repository mutation
      `packages/core/src/application/use-cases/validate-artifacts.ts`: `ValidateArtifacts.execute` — stop persisting a stale in-memory `Change` after validation
      Approach: preserve the existing validation pipeline and result shape, then enter `this._changes.mutate(input.name, fn)` to apply invalidation, `markComplete`, and `setSpecDependsOn` on the fresh persisted change before returning the validation result
      (Req: Save after validation)

- [x] 2.2 Migrate simple lifecycle/event use cases to `mutate()`
      `packages/core/src/application/use-cases/draft-change.ts`: `DraftChange.execute`; `packages/core/src/application/use-cases/restore-change.ts`: `RestoreChange.execute`; `packages/core/src/application/use-cases/discard-change.ts`: `DiscardChange.execute`
      Approach: replace `get() -> entity mutation -> save()` with `this._changes.mutate(input.name, fn)` and perform `change.draft(...)`, `change.restore(...)`, or `change.discard(...)` inside the callback so relocation happens after serialized persistence
      (Req: Persistence)

- [x] 2.3 Migrate approval and skip flows to `mutate()`
      `packages/core/src/application/use-cases/approve-spec.ts`: `ApproveSpec.execute`; `packages/core/src/application/use-cases/approve-signoff.ts`: `ApproveSignoff.execute`; `packages/core/src/application/use-cases/skip-artifact.ts`: `SkipArtifact.execute`
      Approach: compute any prerequisite data needed for the mutation, then use `mutate()` so approval/signoff recording, state transition, and artifact skip recording happen on the fresh persisted `Change`; keep artifact file reads via `artifact(...)`
      (Req: Persistence and return value, Persistence and output)

- [x] 2.4 Migrate dependency updates to `mutate()`
      `packages/core/src/application/use-cases/update-spec-deps.ts`: `UpdateSpecDeps.execute` — persist `specDependsOn` changes without overwriting concurrent manifest updates
      Approach: keep input validation outside the critical section, then call `this._changes.mutate(input.name, fn)` and run `change.setSpecDependsOn(input.specId, result)` inside the callback before returning the result DTO
      (Req: Change lookup, Persistence and output)

## 3. Migrate hybrid flows without over-locking hooks or filesystem work

- [x] 3.1 Serialize the persisted scope change while keeping scaffold work outside the lock
      `packages/core/src/application/use-cases/edit-change.ts`: `EditChange.execute` — move the effective `specIds` mutation onto the repository mutation path but leave scaffold cleanup/creation outside the critical section
      Approach: keep no-op detection and candidate spec list computation outside the lock, resolve actor once, then run `change.updateSpecIds(specIds, actor)` inside `mutate()`; perform `unscaffold()` and `scaffold()` only after the manifest has been safely persisted
      (Req: Change lookup, Approval invalidation on effective change, Directory cleanup on removal)

- [x] 3.2 Serialize the final persisted lifecycle transition
      `packages/core/src/application/use-cases/transition-change.ts`: `TransitionChange.execute` — keep route resolution, requires checks, task checks, and hooks outside the lock while applying the persisted redesign/transition mutation safely
      Approach: reuse the existing pre-transition logic, then enter `mutate()` for the final persisted step and reapply redesign invalidation, validation clearing, and `change.transition(...)` against the fresh persisted change before emitting the success result
      (Req: Persistence)

- [x] 3.3 Serialize the initial move into `archiving` without locking the rest of archive
      `packages/core/src/application/use-cases/archive-change.ts`: `ArchiveChange.execute` — protect only the active-change mutation that transitions `archivable` to `archiving`
      Approach: start the use case with `this._changes.mutate(input.name, fn)` so `change.assertArchivable()` and `change.transition('archiving', actor)` run on fresh persisted state, then continue overlap checks, hooks, spec sync, archive repository work, and metadata generation outside the lock using the returned change
      (Req: Archivable guard)

## 4. Test the new repository contract and migrated use cases

- [x] 4.1 Teach the in-memory test repository the new contract
      `packages/core/test/application/use-cases/helpers.ts`: `StubChangeRepository.mutate` — make the shared test repository implement the new abstract method so use-case suites can assert the port contract without real filesystem locks
      Approach: implement `mutate()` as `get -> callback -> save` against the in-memory store, throwing `ChangeNotFoundError` when the target is missing and preserving the fresh persisted change semantics expected by unit tests
      (Req: mutate serializes persisted change updates)

- [x] 4.2 Add repository integration coverage for serialized mutation
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: new `describe('mutate()')` block — verify lock semantics and callback persistence behaviour in the real fs adapter
      Approach: add tests for missing-change rejection, successful callback persistence, thrown callback rollback, concurrent same-change serialization, unrelated-change parallel independence, and stale-lock recovery using owner metadata + dead PID cleanup
      (Req: mutate serializes persisted change updates, save persists the change manifest only)

- [x] 4.3 Update use-case suites for the new persistence boundary
      `packages/core/test/application/use-cases/validate-artifacts.spec.ts`, `edit-change.spec.ts`, `draft-change.spec.ts`, `restore-change.spec.ts`, `discard-change.spec.ts`, `approve-spec.spec.ts`, `approve-signoff.spec.ts`, `skip-artifact.spec.ts`, `transition-change.spec.ts`, `update-spec-deps.spec.ts`, `archive-change.spec.ts` — replace stale `save(change)` assumptions with `mutate()` assertions
      Approach: add or update focused scenarios so each migrated use case proves it performs its persisted mutation through `ChangeRepository.mutate(...)`, and for hybrid flows assert that only the manifest mutation is serialized while hooks/scaffolding/archive sync remain outside
      (Req: Save after validation, Approval invalidation on effective change, Persistence, Persistence and return value, Persistence and output, Archivable guard)

## 5. Documentation and verification

- [x] 5.1 Update developer documentation for the new port contract
      `docs/core/ports.md`: `ChangeRepository`; `docs/core/use-cases.md`: affected use-case sections; `docs/core/overview.md`: repository/use-case summaries; `docs/core/examples/implementing-a-port.md`: custom `ChangeRepository` example
      Approach: add `mutate()` to the documented abstract contract, explain the `get()` / `mutate()` / `save()` / `saveArtifact()` split, and update the documented persistence narrative for the affected use cases and port implementation example
      (Req: mutate serializes persisted change updates, Save after validation, Persistence, Persistence and return value, Persistence and output, Archivable guard)

- [x] 5.2 Run targeted automated verification
      `packages/core/test/infrastructure/fs/change-repository.spec.ts` and `packages/core/test/application/use-cases/*.spec.ts` — execute the repository and migrated use-case suites after implementation
      Approach: run the fs repository spec plus the affected use-case spec files so every scenario added in `verify` is exercised before marking implementation complete
      (Req: mutate serializes persisted change updates, Save after validation, Approval invalidation on effective change, Persistence, Persistence and return value, Persistence and output, Archivable guard)

- [x] 5.3 Perform manual concurrency checks against a real change
      `.specd/changes/20260402-134008-serialize-change-mutations/manifest.json`: runtime persisted state — confirm that concurrent operations no longer lose manifest updates
      Approach: run parallel `change validate` commands against the same change, run a mixed mutation race such as `change draft` with `change deps`, and verify that both effects survive in order; also simulate stale-lock recovery by interrupting a locked process and rerunning a mutation
      (Req: mutate serializes persisted change updates, Save after validation, Persistence, Persistence and output, Archivable guard)
