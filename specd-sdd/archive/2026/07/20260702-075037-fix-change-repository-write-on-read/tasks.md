# Tasks: fix-change-repository-write-on-read

## 1. Repository implementation

- [x] 1.1 Guard drift detection and sync in `_manifestToChange`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange` — skip sync and drift checking when `artifactTypes` is empty.
      Approach: check `if (artifactTypes.length === 0)` and bypass sync and drift validation blocks.
      (Req: Artifact status derivation)
- [x] 1.2 Remove direct manifest writes from `_manifestToChange`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_manifestToChange` — remove `_writeManifestAtomic` calls.
      Approach: delete `await this._writeManifestAtomic(dir, changeToManifest(change))` lines from sync and drift-invalidation blocks.
      (Req: get returns a Change or null)
- [x] 1.3 Implement lock-based writes inside `_getInternal()` and delegate `get()`
      `packages/core/src/infrastructure/fs/change-repository.ts`: `_getInternal`, `get`, `mutate` — detect if loaded change has pending updates and write them under the lock.
      Approach: Create a private `_getInternal(name, options?: { skipWrite?: boolean })` helper. If `hasChangesToPersist` is true, `artifactTypes` is resolved, and `skipWrite` is not true, acquire `_withChangeLock(name)`, reload manifest, re-map, and call `_writeManifestAtomic` under the lock. Update `mutate()` to call `this._getInternal(name, { skipWrite: true })` and `get()` to call `this._getInternal(name, { skipWrite: false })`.
      (Req: get returns a Change or null, Auto-invalidation on get when artifact files drift)
- [x] 1.4 Align `list()` with lock-based auto-invalidation
      `packages/core/src/infrastructure/fs/change-repository.ts`: `list` — ensure loaded changes with drift/sync are safely written under lock.
      Approach: Extract the change slug name from the directory name of each active change using RegExp, and call `this.get(name)` to load them.
      (Req: list returns active changes in creation order)

## 2. Unit tests

- [x] 2.1 Add test for uninitialized repository drift bypass
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: `load-time drift by policy` — add test for uninitialized repository.
      Approach: Load a change with drifted files using a repository with empty `artifactTypes` and assert that no write to disk or invalidation occurs.
      (Req: Auto-invalidation on get when artifact files drift)
- [x] 2.2 Add test for lock-based auto-invalidation
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: `auto-invalidation with drifted IDs` — add test for lock-based invalidation.
      Approach: Spy on `_withChangeLock` and `_writeManifestAtomic`, load a change with drifted files using an initialized repository, and assert that the lock is acquired, the manifest is reloaded inside it, and the invalidation is persisted.
      (Req: Auto-invalidation on get when artifact files drift)
- [x] 2.3 Add test for load bypass inside mutate()
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`: `mutate` — add test for loading inside mutate.
      Approach: Spy on `_withChangeLock` and `_writeManifestAtomic` and verify that the lock is NOT acquired a second time during the internal load inside `mutate`, preventing deadlock, while the final `save` successfully writes the manifest.
      (Req: mutate serializes persisted change updates)

## 3. E2E Verification

- [x] 3.1 Verify status behavior end-to-end
      `packages/cli/`: CLI — run status commands to check behavior.
      Approach: Run `node packages/cli/dist/index.js changes status fix-change-repository-write-on-read` and `node packages/cli/dist/index.js project status --graph` and verify they run successfully without generating unexpected files or manifest edits.
      (Req: get returns a Change or null)
