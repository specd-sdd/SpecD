# Tasks: remove-spec-cleanup

## 1. Add `unscaffold` to port interface

- [x] 1.1 Add `unscaffold` abstract method to `ChangeRepository`
      `packages/core/src/application/ports/change-repository.ts`:
      `ChangeRepository` — add `abstract unscaffold(change: Change, specIds: readonly string[]): Promise<void>`
      Approach: add the method declaration after `scaffold`, with JSDoc matching the spec requirement
      (Req: Directory cleanup on removal)

## 2. Implement `unscaffold` in `FsChangeRepository`

- [x] 2.1 Add `unscaffold` override to `FsChangeRepository`
      `packages/core/src/infrastructure/fs/change-repository.ts`:
      `FsChangeRepository` — implement the `unscaffold` method
      Approach: iterate over each specId, parse workspace/capPath, remove both specs/ and deltas/ directories using fs.rm with recursive: true. Catch ENOENT to ensure idempotency.
      (Req: unscaffold removes spec directories)

- [x] 2.2 Add `_rmrf` helper for safe directory removal
      `packages/core/src/infrastructure/fs/change-repository.ts`:
      `_rmrf(dirPath: string): Promise<void>` — private helper
      Approach: try fs.rm with recursive: true, catch ENOENT and silently ignore, re-throw other errors
      (Req: unscaffold is idempotent)

## 3. Call `unscaffold` from `EditChange`

- [x] 3.1 Call `unscaffold` after spec removal in `EditChange.execute`
      `packages/core/src/application/use-cases/edit-change.ts`:
      `execute()` — after `await this._changes.save(change)`, call `this._changes.unscaffold(change, input.removeSpecIds)` when removals occurred
      Approach: check if `input.removeSpecIds` is non-empty, then call unscaffold before returning
      (Req: Directory cleanup on removal)

## 4. Add unit tests for `EditChange`

- [x] 4.1 Add test: removing spec IDs calls unscaffold on the repository
      `packages/core/test/application/use-cases/edit-change.spec.ts`:
      new it block in "removing spec IDs" describe block
      Approach: verify that `repo.unscaffold` is called with the change and removed specIds
      (Req: Directory cleanup on removal)

- [x] 4.2 Add test: removing multiple specs calls unscaffold with all removed specIds
      `packages/core/test/application/use-cases/edit-change.spec.ts`:
      new it block in "removing spec IDs" describe block
      Approach: remove two specs, verify unscaffold was called once with both specIds
      (Req: Directory cleanup on removal)

- [x] 4.3 Add test: adding specs does not call unscaffold
      `packages/core/test/application/use-cases/edit-change.spec.ts`:
      new it block in "adding spec IDs" describe block
      Approach: only add specs, verify unscaffold is never called
      (Req: Directory cleanup on removal)

## 5. Add integration tests for `FsChangeRepository.unscaffold`

- [x] 5.1 Add test: unscaffold removes specs/ and deltas/ directories for a spec
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new describe block for `unscaffold`
      Approach: create change dir with specs/ and deltas/ subdirs, call unscaffold, verify directories are gone
      (Req: unscaffold removes spec directories)

- [x] 5.2 Add test: unscaffold is idempotent when directory does not exist
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new it block in `unscaffold` describe block
      Approach: call unscaffold with non-existent directory, verify no error is thrown
      (Req: unscaffold is idempotent)

- [x] 5.3 Add test: unscaffold removes directories containing files
      `packages/core/test/infrastructure/fs/change-repository.spec.ts`:
      new it block in `unscaffold` describe block
      Approach: create directory with a file inside, call unscaffold, verify directory and file are gone
      (Req: unscaffold removes directories with files)

## 6. Run lint and typecheck

- [x] 6.1 Verify code compiles and passes lint
      Run: `pnpm run lint` and `pnpm run typecheck` at package root
      Approach: ensure no lint errors or type errors were introduced by the changes
