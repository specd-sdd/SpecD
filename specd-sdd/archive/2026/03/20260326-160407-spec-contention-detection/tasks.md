# Tasks: spec-contention-detection

## 1. Domain value objects

- [x] 1.1 Create `OverlapEntry` value object and `OverlapChange` interface
      `packages/core/src/domain/value-objects/overlap-entry.ts`:
      `OverlapEntry`, `OverlapChange` — new immutable value object + interface
      Approach: `OverlapChange` is a plain interface with `name: string` and
      `state: ChangeState`. `OverlapEntry` is a class with readonly `specId`
      and `changes` backed by private fields with getters.
      (Req: OverlapReport structure)
- [x] 1.2 Create `OverlapReport` value object
      `packages/core/src/domain/value-objects/overlap-report.ts`:
      `OverlapReport` — new immutable value object wrapping entries
      Approach: class with readonly `entries: readonly OverlapEntry[]` and
      computed getter `hasOverlap` returning `entries.length > 0`.
      (Req: OverlapReport structure)
- [x] 1.3 Export value objects from domain index
      `packages/core/src/domain/value-objects/index.ts`:
      add re-exports for `OverlapEntry`, `OverlapChange`, `OverlapReport`
      (Req: OverlapReport structure)

## 2. Domain error

- [x] 2.1 Create `SpecOverlapError`
      `packages/core/src/domain/errors/spec-overlap-error.ts`:
      `SpecOverlapError` — new error extending `SpecdError`
      Approach: constructor takes `readonly OverlapEntry[]`, exposes via getter.
      Error code: `'SPEC_OVERLAP'`. Message lists overlapping spec IDs and
      the names of other changes targeting them.
      (Req: Overlap guard — ArchiveChange)
- [x] 2.2 Export from domain errors index
      `packages/core/src/domain/errors/index.ts`:
      add re-export for `SpecOverlapError`

## 3. Domain service

- [x] 3.1 Implement `detectSpecOverlap` pure function
      `packages/core/src/domain/services/detect-spec-overlap.ts`:
      `detectSpecOverlap` — new pure function
      Approach: iterate changes, build `Map<string, OverlapChange[]>` from
      each change's `specIds` and `state`, filter to entries with length > 1,
      sort entries by specId, sort changes within entries by name, wrap in
      `OverlapReport`. JSDoc on the function.
      (Req: Domain service is a pure function, Overlap detection logic,
      Single-change and zero-change inputs)
- [x] 3.2 Export from domain services index
      `packages/core/src/domain/services/index.ts`:
      add re-export for `detectSpecOverlap`

## 4. Application use case

- [x] 4.1 Implement `DetectOverlap` use case
      `packages/core/src/application/use-cases/detect-overlap.ts`:
      `DetectOverlap`, `DetectOverlapInput` — new use case class
      Approach: constructor takes `ChangeRepository`. `execute(input?)` calls
      `this._changes.list()`, passes result to `detectSpecOverlap`. If
      `input.name` provided, verify name exists in list (throw `ChangeNotFoundError`
      if not), filter report entries to those containing the named change, return
      new `OverlapReport` with filtered entries.
      (Req: DetectOverlap use case, DetectOverlap accepts an optional
      change name filter, Constructor accepts a ChangeRepository)
- [x] 4.2 Export from use cases index
      `packages/core/src/application/use-cases/index.ts`:
      add type export for `DetectOverlap` and `DetectOverlapInput`

## 5. Archive overlap gate

- [x] 5.1 Add `allowOverlap` to `ArchiveChangeInput`
      `packages/core/src/application/use-cases/archive-change.ts`:
      `ArchiveChangeInput` — add `allowOverlap?: boolean` field
      (Req: Input — ArchiveChange)
- [x] 5.2 Implement overlap guard in `ArchiveChange.execute()`
      `packages/core/src/application/use-cases/archive-change.ts`:
      `execute()` — after archivable guard + transition to `archiving`,
      before pre-archive hooks
      Approach: if `!input.allowOverlap`, call `this._changes.list()`,
      exclude current change, call `detectSpecOverlap` with remaining + current,
      filter entries to those involving current change. If overlap found,
      throw `SpecOverlapError(filteredEntries)`. If `allowOverlap` is true,
      skip entirely. Import `detectSpecOverlap` from domain services.
      (Req: Overlap guard — ArchiveChange)

## 6. Composition layer

- [x] 6.1 Create `createDetectOverlap` factory
      `packages/core/src/composition/use-cases/detect-overlap.ts`:
      `createDetectOverlap` — new factory function with dual-overload pattern
      Approach: follow `createListChanges` pattern.
      (Req: Constructor accepts a ChangeRepository)
- [x] 6.2 Export factory from composition use-cases index
      `packages/core/src/composition/use-cases/index.ts`:
      add re-export for `createDetectOverlap` and its context/options types
- [x] 6.3 Add `detectOverlap` to kernel interface and wiring
      `packages/core/src/composition/kernel.ts`:
      `Kernel['changes']` — add `detectOverlap: DetectOverlap`
      `createKernel()` — add `detectOverlap: new DetectOverlap(i.changes)`
      (Req: Kernel entry mapping — changes.detectOverlap)

## 7. CLI command

- [x] 7.1 Implement `registerChangeOverlap` command
      `packages/cli/src/commands/change/overlap.ts`:
      `registerChangeOverlap` — new CLI command registration
      Approach: register `overlap [name]` subcommand with `--format` and
      `--config` options. Text mode: iterate entries, print specId as header
      with indented change name + state rows. No overlap: `no overlap detected`.
      JSON/toon: serialize report. Catch `ChangeNotFoundError`.
      (Req: Command signature, Text output format, JSON output format,
      No overlap output, Named change not found, Exit codes)
- [x] 7.2 Register command in CLI entrypoint
      `packages/cli/src/index.ts`:
      import and call `registerChangeOverlap(changeCmd)`
- [x] 7.3 Add inline overlap warning to `create` command
      `packages/cli/src/commands/change/create.ts`:
      after successful creation, call `kernel.changes.detectOverlap.execute({ name })`
      and print warning to stderr if `hasOverlap` is true
- [x] 7.4 Add inline overlap warning to `edit` command
      `packages/cli/src/commands/change/edit.ts`:
      after successful edit (when specs changed), call
      `kernel.changes.detectOverlap.execute({ name })` and print warning
- [x] 7.5 Add `--allow-overlap` option to `archive` command
      `packages/cli/src/commands/change/archive.ts`:
      add `--allow-overlap` option, pass `allowOverlap: true` to use case.
      Catch `SpecOverlapError` and display message suggesting the flag.

## 8. Tests — domain

- [x] 8.1 Unit tests for `detectSpecOverlap`
      `packages/core/test/domain/services/detect-spec-overlap.spec.ts`:
      new test file covering all domain service scenarios
      Approach: two changes sharing one spec, three changes sharing two specs,
      no overlap, empty input, single change, sort order verification.
      (Req: Overlap detection logic, Single-change and zero-change inputs)

## 9. Tests — use case

- [x] 9.1 Unit tests for `DetectOverlap`
      `packages/core/test/application/use-cases/detect-overlap.spec.ts`:
      new test file with mocked `ChangeRepository`
      Approach: mock `list()`, verify delegation, test name filter, test
      not-found throws `ChangeNotFoundError`, test no name returns full report.
      (Req: DetectOverlap use case, DetectOverlap accepts an optional
      change name filter)

## 10. Tests — archive overlap gate

- [x] 10.1 Unit tests for archive overlap guard
      `packages/core/test/application/use-cases/archive-change.spec.ts`:
      add new describe block for overlap guard
      Approach: mock `list()` to return other changes with overlapping specs.
      Test: overlap without flag throws `SpecOverlapError`, overlap with
      `allowOverlap: true` proceeds, no overlap proceeds, current change
      excluded from check.
      (Req: Overlap guard — ArchiveChange)

## 11. Tests — kernel

- [x] 11.1 Verify `detectOverlap` in kernel integration test
      `packages/core/test/composition/kernel.spec.ts`:
      add assertion for `kernel.changes.detectOverlap`
      (Req: Kernel entry mapping)

## 12. Tests — CLI

- [x] 12.1 Unit tests for CLI overlap command
      `packages/cli/test/commands/change/overlap.spec.ts`:
      new test file covering CLI output scenarios
      (Req: Text output format, JSON output format, No overlap output,
      Named change not found, Exit codes)
- [x] 12.2 Tests for create/edit inline warnings
      `packages/cli/test/commands/change/create.spec.ts`,
      `packages/cli/test/commands/change/edit.spec.ts`:
      add tests for overlap warning display
- [x] 12.3 Tests for archive `--allow-overlap` flag
      `packages/cli/test/commands/change/archive.spec.ts`:
      add tests for `SpecOverlapError` handling and flag pass-through

## 13. Manual verification

- [x] 13.1 End-to-end smoke test
      Create two changes targeting the same spec, verify create warning,
      run `specd change overlap` in text/JSON, test archive blocking +
      `--allow-overlap` bypass, clean up test changes.
