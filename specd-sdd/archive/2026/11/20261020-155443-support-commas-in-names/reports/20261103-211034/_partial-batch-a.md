# Batch A partial compliance report: support-commas-in-names

Scope: delta-focused (comma/array input, spec-id validation/normalization, spec-lock errors) plus skim. Spec IDs in the change use short form (`core:update-implementation-tracking`, not `core:core/...`). Code in `packages/core/src/application/use-cases/`, tests in `packages/core/test/application/use-cases/`.

## core:update-implementation-tracking

Requirements summary: Input contract (file, files[], validated specId); File names are whole names (no split/trim/case-fold; quote original in errors); Path separators normalized on Windows only (isolated helper taking platform); Multi-file mutations all-or-nothing; constraints.

Implementation status:

- Input contract: OK. `update-implementation-tracking.ts:27-40` (file, files, specId, symbols); specId parsed with workspaces at :122-127 when specRepositories present, syntax-only otherwise.
- Whole names: OK. No split/trim anywhere; files used verbatim except platform conversion (:112-120). Error quoting `ImplementationFileNotFoundError(file)` :201,:218.
- Windows normalization: OK. `domain/services/to-logical-file-path.ts` takes platform param; constructor `platform` default `process.platform` (:86); applied to every entry/action (:118-120).
- All-or-nothing: OK. Validation of all entries `_validateMutation` (:137-139) before any apply loop (:141-157), all inside `changes.mutate` callback so a throw persists nothing.
- Scenarios (invalid specId before mutation, bare specId normalized): OK (:122-127).

Discrepancies:

1. LOW. Code dedups entries (`new Set(...)` :118-120) after normalization. Spec says nothing about deduplication; "handles exactly two files" holds. Spec-side: silent; code-side: silently collapses duplicates (arguably desirable). Suggest documenting or leaving.
2. LOW. Spec: "A failure caused by a name MUST quote the full original value". On win32 the error quotes the normalized (`/`) form, not the original `\` input (:201/:218 use normalized `file`). Spec-side: original value; code-side: logical form. Spec itself says normalization is the only alteration, so arguably consistent; ambiguity worth a spec sentence.
3. LOW. Empty file list throws `ImplementationFileNotFoundError('')` (:133-135) for non-start action; spec does not define this (also `add`/`remove` without specId throw `ChangeNotFoundError(change.name)`, misleading, pre-existing :179-181, :257-259, :287-289). Spec silent.
4. INFO. specId validation happens inside `mutate` after change load, so `ChangeNotFoundError` takes precedence over `InvalidSpecIdError`; and parallel `Promise.all` validation means which error is thrown when several entries fail is non-deterministic in order (spec: "throw the typed error for that entry", unspecified which).

Test coverage (`update-implementation-tracking.spec.ts`): comma name exact (:527), quoted missing name (:544), leading/trailing spaces (:558), quote/backslash/non-ASCII (:574), SDK array (:590), win32 normalization (:613), linux keeps backslash (:637), win32 comma (:659), win32 batch (:683), four-file all-or-nothing (:709), invalid specId (:486), bare specId normalized (:506), unknown workspace (:441).
Missing tests: "Stored name uses forward slashes on Windows" for `add` (manifest stores normalized) - verify :613 covers add, not only resolve; "All valid files applied together in one persisted mutation" (single mutate call) not explicit; dedup behavior untested.

Counts: 5 requirements, 5 OK, 0 Deviation, 0 Missing; 4 discrepancies (3 LOW, 1 INFO).

## core:get-persisted-spec-deps / -implementation / -optimizations / -schema

Requirements summary (delta): new "Spec ID validation" requirement: parseSpecId with configured workspaces before resolving any repository; bare -> default workspace; result specId fully qualified; InvalidSpecIdError / WorkspaceNotFoundError quote original; adapters do no validation.

Implementation status:

- deps: OK `get-persisted-spec-deps.ts` (parseSpecId first, workspaces = repo keys; result uses parsed fully-qualified specId).
- implementation: OK `get-persisted-spec-implementation.ts:37`.
- optimizations: OK `get-persisted-spec-optimizations.ts:58`; returns qualified `specId` (:73,:104).
- schema: OK `get-persisted-spec-schema.ts:35`; qualified specId in result (:50-53).
- Invalid lock on read: `InvalidSpecLockError` is raised by `spec-repository.ts:798` (`parseSpecLock`) through `readPersistedState`; get-\* use cases do not catch it, so it propagates (consistent with core:spec-lock).

Discrepancies: none found. (INFO: workspaces passed as iterator `.keys()` to parseSpecId; parseSpecId consumes it once, OK.)

Test coverage: each has invalid specId rejected before any repository call, bare resolved to default, unknown workspace, fully-qualified accepted (deps :28-60; implementation :19-48; optimizations :95-129; schema :20-50).
Missing tests: "Malformed spec ID rejected quoting `Bad Id`" - tests use `Core/Foo`/`auth/a,b`/`''`; message-quoting assertion not seen. Result-specId-is-qualified assertion for bare input present in bare tests only for some (not verified per file). Optimizations-get has no `''` case at :95-105? (it does: :105).

Counts per spec: 1 requirement touched, 1 OK, 0 Deviation, 0 Missing (x4).

## core:update-persisted-spec-deps

Requirements summary: new "Spec ID validation and existing targets": validate+normalize specId and every add/set entry before any persisted-state I/O; InvalidSpecIdError/WorkspaceNotFoundError; targets of add/set must exist (SpecNotFoundError); remove entries not syntax-validated; invalid lock raises InvalidSpecLockError; nothing written on failure; constraints.

Implementation status:

- Validate specId/add/set: OK `update-persisted-spec-deps.ts:68-79` (all parsed with workspaces before repo access).
- Existence of add/set targets: OK :88-97 (SpecNotFoundError with qualified id), before any write.
- Remove not validated: OK :102 passes `input.remove` raw.
- Stored qualified: OK :100-101.
- InvalidSpecLockError on read: OK via `repo.readPersistedState` (:112) propagates; nothing written.
- readOnly before persisted I/O: OK :84-86 (but after validation, before target existence; fine).
- Clear: OK (`applyDependsOnMutation` clear -> []).

Discrepancies:

1. LOW. `remove` entries are neither normalized nor validated: `remove: ['auth/shared']` (bare) will not match stored `default:auth/shared` and fails with `InvalidInputError "not found in current deps"`. Spec: "not validated for syntax" (so deliberate), but silent on bare-ID normalization on remove; user-facing inconsistency with add/set which normalize. Code-side follows spec literally.
2. LOW. Order: mutual-exclusivity/min-operation errors (`InvalidInputError`, in `applyDependsOnMutation`) are raised after ID validation, target existence checks (repo.get calls) and persisted read, not before; a call like `{ clear: true, add: [...] }` performs target lookups first. Spec "Mutual exclusivity" requirement does not state ordering vs. validation; harmless but extra I/O.
3. INFO. With missing persisted state and only `remove` the use case returns no-op (:125-ish `createsState` false) without validating mutual exclusivity (pre-existing).

Test coverage (`update-persisted-spec-deps.spec.ts`): invalid ID before I/O (:41), missing dep target (:59), missing source spec (:75), bare stored qualified (:88), remove invalid stored value (:112), InvalidSpecLockError propagation (:134), clear (:156), unknown workspace (:179).
Missing tests: "Valid entries accepted" for qualified `core:storage` (only bare-stored test seen); `set` empty-string case asserts write not called (test :41 covers invalid generally; scenario says `set: ['']` - verify); bare `remove` behavior (discrepancy 1) untested; clear on lock with `created: false` asserted (OK).

Counts: 1 requirement (+ constraints), 1 OK, 0 Deviation, 0 Missing; 3 discrepancies (2 LOW, 1 INFO).

## core:update-persisted-spec-implementation

Requirements summary: Spec ID validation before workspace/schema/artifact/persisted I/O; qualified in result; nothing written on failure.
Implementation status: OK `update-persisted-spec-implementation.ts:84-87` first statement of `execute`; `specId` in all results qualified (:121 etc.).
Discrepancies: none for the delta. INFO: `file` parameter has no comma/Windows-separator handling here (spec for this use case doesn't require it; only core:update-implementation-tracking does) - note for cross-spec consistency: the persisted variant passes `input.file` through `_normalizeFile` unchanged by `toLogicalFilePath`.
Test coverage: invalid specId '' (:50), unknown workspace (:68), bare resolved before file checks (:81).
Missing tests: malformed `Bad Id` quote assertion; qualified `core:storage` accepted.
Counts: 1 requirement, 1 OK, 0 Deviation.

## core:update-persisted-spec-optimizations

Requirements summary: same Spec ID validation requirement; empty/malformed -> InvalidSpecIdError.
Implementation status:

- Deviation (empty specId): `update-persisted-spec-optimizations.ts:41` zod `specId: z.string().min(1)` runs in `parseUpdatePersistedSpecOptimizationsInput` (:109, called :158-ish) BEFORE `parseSpecId`. `specId: ''` therefore throws `InvalidInputError`, not `InvalidSpecIdError`. Whitespace-only and malformed reach parseSpecId correctly.
- Others: OK `parseSpecId` with workspaces then qualified specId used (:160-170).

Discrepancies:

1. MEDIUM. Spec-side: verify scenario "Empty spec ID rejected before any repository access -> InvalidSpecIdError". Code-side: zod `min(1)` yields `InvalidInputError` for `''`. Fix either by dropping `.min(1)` (let parseSpecId own it) or amending spec to allow InvalidInputError. Both sides valid; the spec text is explicit.
2. LOW. Zod validation also runs before spec-ID validation, so a call with both a bad specId and a bad set/clear payload reports the payload error first (spec: specId validated "before workspace resolution, schema resolution, artifact reads, persisted-state I/O" - still satisfied).
   Test coverage: invalid specId 'Core/Foo' (:324), bare resolved (:338), unknown workspace (:349). No `''` test for this use case, which is how deviation 1 slipped through.
   Missing tests: empty specId -> InvalidSpecIdError.
   Counts: 1 requirement, 0 OK-fully, 1 Deviation (MEDIUM), 0 Missing.

## core:update-persisted-spec-schema

Requirements summary: Spec ID validation (same).
Implementation status: OK `update-persisted-spec-schema.ts:77-79` first statement; qualified specId in results (:110, SpecNotInitializedError(specId) :95).
Discrepancies: none.
Test coverage: invalid 'Login' (:38), bare resolved before SpecNotInitializedError (:56), unknown workspace (:69).
Missing tests: `''` empty; `Bad Id` quote.
Counts: 1 requirement, 1 OK.

## Cross-spec / global checks

- `core:spec-id-format` (direct dep): `parse-spec-id.ts` implements blank, empty path, empty segment, ':' in path, Windows device names, backslash, segment charset, unknown workspace. Consistent with how these use cases use it. Segment-level rule that comma is invalid (`auth/a,b` rejected via `isValidCapabilitySegment`) matches get-schema test.
- `core:spec-lock` (dep of update-persisted-spec-schema): `InvalidSpecLockError` thrown at `spec-repository.ts:798`; no use case in this batch catches/swallows it. No contradiction.
- `_global/cross-platform`: `toLogicalFilePath` matches the stated rule; one consistency note: update-persisted-spec-implementation does not use it (see above).
- No contradictions found with `default:_global/*` for the reviewed code.

## Totals

- Specs audited: 9
- Requirements touched by delta: 12 (UIT 5, others 1 each x8... counted per spec above)
- OK: 8 specs fully OK on delta requirements; 1 spec (update-persisted-spec-optimizations) with 1 Deviation
- Deviations: 1 (MEDIUM)
- Missing: 0
- Discrepancies total: 12 (1 MEDIUM, 8 LOW, 3 INFO)
- Missing tests: UPSO empty-specId; several "quote Bad Id" assertions; UPSD qualified-valid acceptance and bare-remove behavior; UIT explicit add-on-Windows store normalization and dedup.
