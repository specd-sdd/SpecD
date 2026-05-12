# Tasks: ownership-enforcement

## 1. Error class

- [x] 1.1 Create `ReadOnlyWorkspaceError`
      `packages/core/src/domain/errors/read-only-workspace-error.ts` (NEW):
      New error class extending `SpecdError`
      Approach: follow `ArtifactConflictError` pattern — extend `SpecdError`,
      code `'READ_ONLY_WORKSPACE'`, constructor takes `message: string`
      (Req: ReadOnlyWorkspaceError)

- [x] 1.2 Export from error barrel
      `packages/core/src/domain/errors/index.ts`:
      Add `export { ReadOnlyWorkspaceError } from './read-only-workspace-error.js'`
      Approach: single re-export line, alphabetical order
      (Req: ReadOnlyWorkspaceError)

- [x] 1.3 Re-export from `@specd/core` barrel
      Check `packages/core/src/index.ts` for domain error re-exports and add
      `ReadOnlyWorkspaceError` if errors are re-exported from there
      Approach: follow existing pattern for other error exports
      (Req: ReadOnlyWorkspaceError)

## 2. SpecRepository guards

- [x] 2.1 Add readOnly guard to `FsSpecRepository.save()`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `save()` method
      Approach: first line of method — `if (this.ownership() === 'readOnly')
    throw new ReadOnlyWorkspaceError(...)` with message format:
      `Cannot write to spec "<workspace>:<specName>" — workspace "<workspace>" is readOnly.`
      (Req: save persists a single artifact with conflict detection)

- [x] 2.2 Add readOnly guard to `FsSpecRepository.saveMetadata()`
      `packages/core/src/infrastructure/fs/spec-repository.ts`: `saveMetadata()` method
      Approach: same pattern as 2.1 — ownership check before any I/O
      (Req: saveMetadata persists metadata with conflict detection)

## 3. ArchiveChange guard

- [x] 3.1 Add readOnly workspace guard to `ArchiveChange.execute()`
      `packages/core/src/application/use-cases/archive-change.ts`: `execute()` method
      Approach: after archivable guard + transition to archiving (after `change.transition('archiving', ...)`
      and `this._changes.save(change)`), before pre-archive hooks — iterate
      `change.specIds`, look up each workspace's `SpecRepository` from `this._specs`,
      check `ownership()`. Collect all readOnly specs, throw single
      `ReadOnlyWorkspaceError` listing all affected specs
      (Req: ReadOnly workspace guard)

## 4. CLI guards

- [x] 4.1 Add readOnly check to `change create`
      `packages/cli/src/commands/change/create.ts`: action handler
      Approach: refactor `parseSpecId` call to keep parsed results (workspace + specId).
      After parsing, iterate and check each workspace's `ownership` from
      `config.workspaces`. If any is `readOnly`, write error to stderr and `process.exit(1)`.
      One error per readOnly spec. Check before invoking `kernel.changes.create.execute()`
      (Req: ReadOnly workspace rejection — change create)

- [x] 4.2 Add readOnly check to `change edit`
      `packages/cli/src/commands/change/edit.ts`: action handler
      Approach: same pattern as 4.1 but only for `--add-spec` values (not `--remove-spec`).
      After `parseSpecId` resolves `addSpecIds`, check each workspace's ownership.
      If any is `readOnly`, error and exit before applying any edits
      (Req: ReadOnly workspace rejection — change edit)

## 5. Tests

- [x] 5.1 Unit test for `ReadOnlyWorkspaceError`
      `packages/core/test/domain/errors/read-only-workspace-error.spec.ts` (NEW):
      Approach: verify extends `SpecdError`, `code` returns `'READ_ONLY_WORKSPACE'`,
      message is preserved. Follow existing error test patterns
      (Req: ReadOnlyWorkspaceError)

- [x] 5.2 Unit tests for `FsSpecRepository` readOnly guards
      `packages/core/test/infrastructure/fs/spec-repository.spec.ts` (MODIFY):
      Approach: add test group for readOnly ownership — `save()` throws
      `ReadOnlyWorkspaceError`, `saveMetadata()` throws, read operations
      (`get`, `list`, `artifact`, `metadata`) still work. Create repo with
      `ownership: 'readOnly'` in test setup
      (Req: save, saveMetadata)

- [x] 5.3 Unit test for `ArchiveChange` readOnly guard
      `packages/core/test/application/use-cases/archive-change.spec.ts` (MODIFY):
      Approach: add test — mock `SpecRepository` with `ownership() === 'readOnly'`
      for one workspace, verify `ReadOnlyWorkspaceError` is thrown, no hooks executed,
      no spec files written
      (Req: ReadOnly workspace guard)

- [x] 5.4 CLI tests for `change create` readOnly rejection
      `packages/cli/test/commands/change/create.spec.ts` (MODIFY or NEW):
      Approach: set up config with a readOnly workspace, run create with `--spec`
      targeting it, assert exit code 1 and error message content
      (Req: ReadOnly workspace rejection — change create)

- [x] 5.5 CLI tests for `change edit` readOnly rejection
      `packages/cli/test/commands/change/edit.spec.ts` (MODIFY or NEW):
      Approach: set up config with readOnly workspace, test `--add-spec` rejection,
      test `--remove-spec` not affected by ownership
      (Req: ReadOnly workspace rejection — change edit)
