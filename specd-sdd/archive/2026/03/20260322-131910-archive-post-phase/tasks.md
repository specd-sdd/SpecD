# Tasks: archive-post-phase

## 1. ArchiveRepository port

- [x] 1.1 Add `archivePath` abstract method to `ArchiveRepository`
      `packages/core/src/application/ports/archive-repository.ts`:
      after line 87 — add `abstract archivePath(archivedChange: ArchivedChange): string`
      Approach: mirrors `ChangeRepository.changePath(change)` pattern
      (Req: archivePath returns the absolute path for an archived change)

- [x] 1.2 Implement `archivePath` in `FsArchiveRepository`
      `packages/core/src/infrastructure/fs/archive-repository.ts`:
      add concrete method using `_archivePath` and `_expandPattern()` to
      reconstruct the absolute path from the `ArchivedChange`'s properties
      Approach: use `_expandPattern()` with archived change metadata then
      join with `this._archivePath` to produce the absolute directory path
      (Req: archivePath returns the absolute path for an archived change)

## 2. RunStepHooks fallback

- [x] 2.1 Add `ArchiveRepository` to `RunStepHooks` constructor
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      constructor (line 67) — add `archive: ArchiveRepository` parameter,
      store as `this._archive`
      (Req: Ports and constructor)

- [x] 2.2 Implement conditional archive fallback in change lookup
      `packages/core/src/application/use-cases/run-step-hooks.ts`:
      line 84 — after `ChangeRepository.get()` returns null, check if
      `step === 'archiving' && phase === 'post'`; only then call
      `this._archive.get(name)`. If found, build variables from
      `ArchivedChange` properties; if null, throw `ChangeNotFoundError`.
      For any other step/phase, throw `ChangeNotFoundError` immediately.
      Approach: inline branch — when archived, use `archivedChange.name`,
      `archivedChange.workspace` (string), and
      `this._archive.archivePath(archivedChange)` for `change.path`
      (Req: Change lookup, HookVariables construction)

## 3. GetHookInstructions fallback

- [x] 3.1 Add `ArchiveRepository` to `GetHookInstructions` constructor
      `packages/core/src/application/use-cases/get-hook-instructions.ts`:
      constructor (line 45) — add `archive: ArchiveRepository` parameter,
      store as `this._archive`
      (Req: Ports and constructor)

- [x] 3.2 Implement conditional archive fallback in change lookup
      `packages/core/src/application/use-cases/get-hook-instructions.ts`:
      line 62 — same conditional fallback as RunStepHooks: only for
      `step === 'archiving' && phase === 'post'`
      Approach: after `ChangeRepository.get()` returns null, check
      step/phase; if archiving+post, try `this._archive.get(name)`.
      Build template variables using `ArchivedChange` properties and
      `archivePath()`. Otherwise throw `ChangeNotFoundError`.
      (Req: Change lookup)

## 4. Kernel composition

- [x] 4.1 Inject `ArchiveRepository` into `RunStepHooks` at all instantiation points
      `packages/core/src/composition/kernel.ts` line 171,
      `packages/core/src/composition/use-cases/transition-change.ts` line 130,
      `packages/core/src/composition/use-cases/archive-change.ts` line 190
      Approach: pass `i.archive` (or equivalent) as second constructor arg
      (Req: Ports and constructor — RunStepHooks)

- [x] 4.2 Inject `ArchiveRepository` into `GetHookInstructions`
      `packages/core/src/composition/kernel.ts` line 215
      Approach: pass `i.archive` as second constructor arg
      (Req: Ports and constructor — GetHookInstructions)

## 5. Tests — ArchiveRepository

- [x] 5.1 Test `archivePath` returns correct absolute path
      `packages/core/test/infrastructure/fs/archive-repository.spec.ts`:
      new test — archive a change, then call `archivePath()` with the
      returned `ArchivedChange` and verify it matches `archiveDirPath`
      (Verify: Path is consistent with archive() result)

## 6. Tests — RunStepHooks

- [x] 6.1 Test archive fallback — change found in archive
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      new test — ChangeRepository returns null, ArchiveRepository returns
      ArchivedChange → hooks execute using archived properties
      (Verify: Change not in ChangeRepository but exists in archive)

- [x] 6.2 Test archive fallback — change not in either repository
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      new test — both repos return null → throws ChangeNotFoundError
      (Verify: Change not in either repository)

- [x] 6.3 Test active change takes precedence
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      new test — ChangeRepository returns change → ArchiveRepository.get
      is never called
      (Verify: Active change takes precedence over archived)

- [x] 6.4 Test non-archiving step does not fall back to archive
      `packages/core/test/application/use-cases/run-step-hooks.spec.ts`:
      new test — ChangeRepository returns null, step is `implementing` →
      throws ChangeNotFoundError, ArchiveRepository.get() never called
      (Verify: Non-archiving step does not fall back to archive)

## 7. Tests — GetHookInstructions

- [x] 7.1 Test archive fallback — change found in archive
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`:
      new test — same pattern as 6.1 for instructions
      (Verify: Change not in ChangeRepository but exists in archive)

- [x] 7.2 Test archive fallback — change not in either repository
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`:
      new test — both repos return null → throws ChangeNotFoundError
      (Verify: Change not in either repository)

- [x] 7.3 Test active change takes precedence
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`:
      new test — active change used, archive not queried
      (Verify: Active change takes precedence over archived)

- [x] 7.4 Test non-archiving step does not fall back to archive
      `packages/core/test/application/use-cases/get-hook-instructions.spec.ts`:
      new test — same as 6.4 for instructions
      (Verify: Non-archiving step does not fall back to archive)

## 8. Manual verification

- [x] 8.1 E2E: verify post-archive commands work after archiving
      Create change, progress through lifecycle, archive, then run
      `change hook-instruction` and `change run-hooks` for archiving post phase
