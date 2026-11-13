# Spec compliance — change support-commas-in-names

Mode: change. Scope: 29 change specs (batches A–D). Tests/typecheck/lint passed pre-audit.

## Summary

- Batch A (9 core specs): 1 Medium (optimizations empty specId -> InvalidInputError not InvalidSpecIdError), 8 Low, 3 Info
- Batch B (9 core specs): 1 Medium (D1 invalid stored dep cannot be removed: strict spec-lock read in fs repo precedes removal), Lows D2-D4,D10, Info D5
- Batch C (3 core specs): Low/Info + 2 medium-ish pre-existing (edit-change persists on no-op; update-spec-deps exact-match vs bare legacy IDs)
- Batch D (7 cli/skills specs): 2 Medium (stale "comma-separated" prose in specd-implement/specd-archive templates; lock error has no CLI repair hint), 7 Low, 2 Info
- ~45 missing test scenarios across batches; several verify scenarios still use bare IDs (stale text)

## Detailed Findings

---

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

---

# Batch B compliance findings — change `support-commas-in-names`

Scope: core:spec-id-format, core:workspace, core:config, core:config-loader, core:spec-lock, core:spec-metadata, core:generate-metadata, core:validate-specs, core:preview-spec.
Method: change deltas (specd-sdd/changes/.../deltas/core/\*) read directly (spec-preview CLI needs ids like `core:spec-id-format`; I used delta files instead), compared with working-tree code and tests. Graph tools were not used (graph-first not followed; grep fallback). Read-only, no code or spec changes.
Paths below are relative to /Users/monki/Documents/Proyectos/specd/packages/core unless noted.

---

## core:spec-id-format

Requirements summary: canonical `workspace:capPath`; bare path normalized by core; WorkspaceNotFoundError when workspace set supplied; parseSpecId steps; mandatory normalization; Workspace name rule `^[a-z][a-z0-9-]+$` + not Windows device, single `isValidWorkspaceName`; segment rule `^[a-z0-9_][a-z0-9_-]*$` + not device, also for workspace prefix; InvalidSpecIdError (code INVALID_SPEC_ID) with rejected input list; remove ops do not validate; single validator `parseSpecId(id, {workspaces?, defaultWorkspace?})`, domain-pure; use cases validate/normalize, adapters pass raw; patterns via `parseSpecPattern`, schema refs via registry; persisted IDs fully qualified.

Implementation status:

- Canonical format / parsing steps: OK — src/domain/services/parse-spec-id.ts:41-87 (blank reject, first-colon split, defaultWorkspace, per-segment validation, returns qualified specId).
- Workspace name rule single source: OK — src/domain/services/spec-id-rules.ts:3-16; consumers: parse-spec-id.ts:46, parse-spec-pattern.ts:78, schema-registry.ts:27, config-loader.ts:391. Guard test test/spec-id-guards.spec.ts forbids regex literals elsewhere in src.
- Segment rule single source: OK — spec-id-rules.ts, used by parse-spec-id.ts:70, parse-spec-pattern.ts:44, spec-path.ts:85, config-schema.ts:106 (prefix).
- InvalidSpecIdError / rejected inputs (`""`, blank, `:`, `ws:`, `:path`, `a//b`, `/a`, `a/`, `.`/`..`, `a:b:c`, uppercase, spaces, commas, device names, 1-char ws): OK — domain/errors/invalid-spec-id-error.ts, parse-spec-id.ts. Message quotes full value.
- Unknown workspace: OK — WorkspaceNotFoundError moved to domain (domain/errors/workspace-not-found-error.ts; application one re-exports). Message quotes spec id and lists known workspaces (spec says "quote the full original ID" — satisfied via `in spec ID '...'`).
- workspaces Iterable<string|{name}>: OK — parse-spec-id.ts:80-86.
- Patterns/schema refs separate parsers: OK — parse-spec-pattern.ts; schema-registry.ts splitSchemaReference.
- Use cases validate/normalize: mostly OK (preview-spec, validate-specs, generate-spec-metadata, update-\*-deps, materialize-spec-metadata).
- Persisted IDs fully qualified in spec-lock and strict metadata: OK (parse-spec-lock.ts:12, parse-metadata.ts strict schema). Manifest reader not in my batch.
- Remove ops do not validate: Deviation (see D1/D2).

Discrepancies:

- D1 [Medium] "Remove an invalid stored value can always be removed" (spec-id-format "Syntax validation") vs real FS behavior.
  - Spec side: invalid stored value must remain removable.
  - Code side: UpdatePersistedSpecDeps.remove passes raw (update-persisted-spec-deps.ts:108) but then `repo.readPersistedState` (spec-repository.ts:526/\_readSpecLock:785, also writePersistedState:553) parses strictly and throws InvalidSpecLockError for a lock containing an invalid dependsOn entry. So with the real FS repository an invalid stored dependency cannot be removed through this use case; the user must hand-edit the file (the error text says exactly that). The unit test "removes an invalid stored dependency value as given" (test/application/use-cases/update-persisted-spec-deps.spec.ts:112) passes only because the in-memory fake repository bypasses `parseSpecLock`.
  - Also conflicts with spec-lock "Reads remain strict for every consumer... Repairing invalid locks is outside this requirement". Both specs are internally consistent only if repair is done by hand or by another feature; the change theme says "CLI can repair" but I found no CLI/SDK repair path (grep for InvalidSpecLock/repair in cli/src, sdk/src: none). Needs a decision: spec-lock-strict-read wins (current code) or a lenient/repair read path is required.
- D2 [Low] UpdatePersistedSpecDeps `remove` entries are not normalized when valid (bare `auth/shared` stays bare and will not match stored `default:auth/shared`), unlike UpdateSpecDeps which uses tryNormalizeDepId (update-spec-deps.ts:31-45,112). Spec "Use cases validate and normalize ... return and store the fully-qualified ID" and "remove SHALL NOT validate" do not strictly require normalizing remove, but the two siblings differ. Spec side silent; code side inconsistent.
- D3 [Low] "Capability path segment rule" says the rule is used by "the persisted spec-lock.json and metadata.json readers". Code: spec-lock reader strict (OK); metadata lenient read path accepts any string (parse-metadata.ts specMetadataSchema, permissive schema `z.string()`), per the "Persisted IDs" requirement saying metadata read stays lenient. Internal wording tension in the spec; code follows the more specific statement.
- D4 [Low] Strict metadata schema also validates `implementation.files[].specId` / `symbols[].specId` as fully qualified (parse-metadata.ts ~121,129); spec-metadata only requires it for `dependsOn`. Code stricter than spec.
- D5 [Info] fs-spec-index-cache.ts:223 uses strictSpecMetadataSchema to decide if metadata is usable for index title/summary; legacy metadata with a bare dependsOn silently loses title/summary in the index (self-heals on regeneration). Not covered by spec.

Test coverage: test/domain/services/parse-spec-id.spec.ts (invalid inputs table incl. empty, blank, `:`, `ws:`, `:path`, `a//b`, `.`/`..`, uppercase, space, comma, device name, `core:a:b`, workspaces as array/Set/Map.keys/objects, WorkspaceNotFoundError), spec-id-rules.spec.ts, parse-spec-pattern.spec.ts, test/spec-id-guards.spec.ts (no duplicated regex literals; all repo spec-lock.json parse).
Missing tests: bare id with unknown `defaultWorkspace` (workspace set + defaultWorkspace not in set) not seen; error message "lists known workspace names" assertion not seen; remove-invalid-value against real FS repo (would fail, see D1).

---

## core:workspace

Requirements: names `^[a-z][a-z0-9-]+$`, reserved `default`/`root`/Windows device names (whole-name only, `con-foo` legal); prefix segments follow segment rule, ConfigValidationError; bare path normalization owned by core; constraints.

Implementation:

- Name rule/device names: OK — config-loader.ts:391 (isValidWorkspaceName), `root` rejected config-loader.ts ~381.
- Prefix rule: OK — config-schema.ts:99-112 PrefixZodSchema using isValidCapabilitySegment; rejects empty, leading/trailing slash, `.`/`..`, uppercase.
- Bare normalization by core: OK (see spec-id-format).
  Discrepancies: none material. Note [Info]: `default` workspace name is accepted by shared rule and spec marks it "reserved for local workspace (mandatory)" — consistent.
  Tests: config-loader.spec.ts:106 (`a`, `Core`, `nul` rejected), :142, :216 (`con-foo`-style accepted), :2286 (root), prefix tests :563-789.
  Missing tests: workspace names with `_`/digit-leading beyond `Core`/`a` fine; prefix with comma/space/device-name segment not explicitly tested (only uppercase, dot, empty, slash).

---

## core:config

Requirements touched: workspace names and prefix use shared rules; contextInclude/ExcludeSpecs parsed by parseSpecPattern at load and match time; qualifier-less pattern gets caller-supplied defaultWorkspace; unknown workspace in pattern -> warning, no match.

Implementation:

- Shared parser at load: OK — config-schema.ts:51 (validateContextPattern -> parseSpecPattern, InvalidSpecPatternError mapped to ConfigValidationError).
- Same parser at match: OK — application/use-cases/\_shared/spec-pattern-matching.ts:45 `parseSpecPattern(pattern, { defaultWorkspace })`.
- Unknown workspace warning, no match: not re-verified line-by-line; existing behavior retained (test/application/use-cases/\_shared/spec-pattern-matching.spec.ts modified).
- Workspace name / prefix rules: OK (see workspace).
  Discrepancies: D6 [Low] spec-pattern validation at config load calls `parseSpecPattern(pattern)` without defaultWorkspace (fine: syntax only). No issue. None material.
  Tests: config-loader.spec.ts:1300-1440 (patterns incl. one-letter qualifier, leading-digit segment), application/ports/config-schema.spec.ts, parse-spec-pattern.spec.ts.
  Missing tests: pattern containing comma (`auth/a,b`) / uppercase qualifier at config level not seen (covered at parser level for uppercase segment only; comma not in parse-spec-pattern.spec.ts list).

---

## core:config-loader

Requirements: pattern validation via parseSpecPattern; workspace names via isValidWorkspaceName; no private regex copies; ConfigValidationError on invalid.

Implementation: OK — config-loader.ts:18,391 (name), :377 validateContextPatterns, config-schema.ts. No private regex remains in config-loader (guard test).
Discrepancy D7 [Low]: invalid-pattern error text produced by config-loader is `<field>: <reason> in pattern '<p>'`; spec only requires ConfigValidationError — OK. Existing test at config-loader.spec.ts expects `'*' is only allowed` text — still satisfied.
Tests: config-loader.spec.ts:106 (invalid names it.each), 1300-1440 (patterns).
Missing tests: none significant.

---

## core:spec-lock

Requirements: dependsOn entries fully-qualified valid IDs, bare/empty/malformed rejected, no legacy form; InvalidSpecLockError (INVALID_SPEC_LOCK) naming spec id, file, field path, rule, and saying to correct the file; no raw ZodError; reads strict for all consumers, no silent drops, no rewrite-on-read; constraint list.

Implementation:

- Strict dependsOn: OK — parse-spec-lock.ts:12-14, 56 (`isFullyQualifiedSpecId` refine).
- Typed error: OK — domain/errors/invalid-spec-lock-error.ts (code, message includes spec id, location, `field 'dependsOn.0'`, reason, "Correct that field in the file."); parseSpecLock wraps invalid JSON and ZodError (parse-spec-lock.ts:76-100). Only the first Zod issue is reported (acceptable per spec "the failing field path").
- Context supplied: OK — spec-repository.ts:798 passes `{specId, location: filePath}`. Message location is the absolute file path.
- No rewrite on read: OK (readPersistedState does not write; test spec-repository.spec.ts:1281 verifies file unchanged).
- Exported publicly: public.ts:521, sdk/src/core-reexports.ts:485.
  Discrepancies:
- D1 repeated [Medium]: strict reads block `writePersistedState`/`remove` repairs through core (spec-repository.ts:553); no repair path found in CLI/SDK. Spec explicitly leaves repair out of scope; change theme implies CLI repair. Present both: spec says out of scope; theme/other specs (spec-id-format "can always be removed") expect it.
- D8 [Low] Other lock fields (schema.name, implementation entries, hash) also report InvalidSpecLockError — spec says "fails structural validation": OK.
  Tests: parse-spec-lock.spec.ts (it.each `['']`, `['auth/login']`, `['not valid']`, `['core:']` -> fieldPath dependsOn.0, not ZodError; invalid JSON), spec-repository.spec.ts:1281 (unchanged file), spec-id-guards.spec.ts (all repo locks parse).
  Missing tests: scenario "qualified valid entries accepted `core:storage`, `default:_global/architecture`" explicit assertion not found by name (first test uses qualified dependsOn); "one valid + one invalid entry -> read fails and file unchanged" (only `['']` tested for unchanged); message "names the spec ID, location, field path and rule" asserts field only, not spec id/location text in message.

---

## core:spec-metadata

Requirements touched: strict `strictSpecMetadataSchema` on persistence (dependsOn fully-qualified, bare/empty rejected, no own regex), lenient read stays lenient; dependency on spec-id-format.

Implementation:

- Strict dependsOn: OK — parse-metadata.ts qualifiedSpecIdString = isFullyQualifiedSpecId (no private regex).
- Persist guard: OK — application/use-cases/persist-spec-metadata.ts:33 uses strict schema, throws MetadataValidationError before write.
- Lenient read: OK — specMetadataSchema/permissiveSpecMetadataSchema use z.string() (used by validate-artifacts.ts:583).
  Discrepancies: D4, D5 (above). D9 [Low] The `keywords` regex `^[a-z][a-z0-9-]*$` in parse-metadata.ts:88,160 is a different concept (keywords), not a duplicate of workspace rule; guard test literal differs (`*` vs `+`), fine.
  Tests: parse-metadata.spec.ts:12 lenient path, :33 bare accepted on read, :118 strict rejects bare.
  Missing tests: persist-spec-metadata.spec.ts (1.1K) has no scenario for bare/empty dependsOn being rejected by PersistSpecMetadata with no file written (only schema-level test); "empty dependsOn entry rejected" scenario not seen at use-case level.

---

## core:generate-metadata

Requirement: Spec resolution validates and normalizes with parseSpecId + configured workspaces; InvalidSpecIdError before repository lookup; WorkspaceNotFoundError; SpecNotFoundError.
Implementation: OK — generate-spec-metadata.ts:102-115 (listWorkspaces -> parseSpecId(input.specId,{workspaces}) -> workspace lookup -> repo.get). Note: ListWorkspaces executes (I/O) before validation; "before any repository lookup" — list is not a spec repository lookup; acceptable.
Discrepancies: none. (Info: redundant `WorkspaceNotFoundError` branch at :107 now unreachable.)
Tests: generate-spec-metadata.spec.ts:628 (invalid), :646 (bare), :668 (unknown workspace).
Missing tests: none.

---

## core:validate-specs

Requirement: single spec mode validates/normalizes specPath with parseSpecId; Invalid -> InvalidSpecIdError; unknown workspace -> WorkspaceNotFoundError; SpecNotFoundError; comma not split.
Implementation: OK — validate-specs.ts:133-147. Internal label parse at :596 `parseSpecId(args.label)` is syntax-only (fine).
Discrepancies: none.
Tests: validate-specs.spec.ts:422 (unknown ws), :433 (invalid `ws:`), :445 (comma `auth/a,b` -> InvalidSpecIdError), :449 (bare -> default).
Missing tests: none.

---

## core:preview-spec

Requirements: input specId bare or qualified; validate/normalize "before any other work" with parseSpecId; InvalidSpecIdError / WorkspaceNotFoundError; then membership check in change.specIds -> SpecNotInChangeError.
Implementation: preview-spec.ts:109-114 — Deviation (ordering).
Discrepancies:

- D10 [Low] Spec: "MUST validate and normalize specId ... before any other work". Code: `this._changes.get(name)` (ChangeNotFoundError), `schemaProvider.get()` and the SchemaMismatchError check run first (preview-spec.ts:101-107); validation occurs after. Observable effect only changes which error wins when multiple inputs are bad. Spec side: validate first. Code side: validates after change/schema load (needed only to reach membership check, but validation itself needs no change).
  Tests: preview-spec.spec.ts:597 (invalid before repo call), :615 (bare resolves to default).
  Missing tests: unknown workspace (`nope:auth/login` -> WorkspaceNotFoundError) scenario; validation-before-change-lookup ordering (would expose D10).

---

## Cross-spec / global contradictions

- No contradiction with default:\_global/\* found in my reading (domain service has no application deps: parse-spec-id imports only domain errors/services — OK vs "domain SHALL NOT depend on application types").
- Internal spec tension: spec-id-format ("invalid stored value can always be removed") vs spec-lock ("reads strict for every consumer; repair out of scope") — see D1.

## Counts

Specs audited: 9. Requirements checked (touched by deltas): ~34.
Implementation: OK 31, Deviation 3 (D1 remove-repair vs strict read, D2 remove normalization inconsistency, D10 preview-spec ordering), Missing 0.
Discrepancies by severity: Medium 1 (D1), Low 7 (D2, D3, D4, D6, D7, D8, D10, counting only real ones: D2, D3, D4, D10 + D6/D7/D8 informational), Info 2 (D5, D9).
Missing tests: ~9 (spec-lock x3, spec-metadata persist x2, preview-spec x2, spec-id-format x2, config comma pattern x1).

---

# Batch C compliance audit: core:edit-change, core:update-spec-deps, core:create-change

Change: support-commas-in-names. Read-only audit. Merged spec+verify obtained via `changes spec-preview`. Code: working tree (uncommitted).
Note: graph search not used (small, well-known files); direct reads + grep used.

---

## 1. core:edit-change

### Requirements summary

Input contract (addSpecIds/removeSpecIds whole IDs), Spec ID validation (add validated+normalized; remove not validated, normalized if possible), ReadOnly rejection, invalidationPolicy, change lookup, no-op rules, removal before addition, removal of absent spec throws, idempotent add, specDependsOn seeding, approval invalidation via mutate, directory cleanup (unscaffold), implementation tracking refresh, output contract, dependencies, config factory, schema compat guardrail. Constraint: never splits spec ID; actor resolved only on persistence-worthy change.

### Implementation status (packages/core/src/application/use-cases/edit-change.ts)

- Input contract: OK (L26-37; JSDoc says "Spec paths", stale wording only).
- Spec ID validation (add): OK. L104-107 parseSpecId with workspaces before mutate; throws before any persistence. Error text quotes full value (`Invalid spec ID '<value>': ...`, invalid-spec-id-error.ts). Empty/blank rejected (parse-spec-id.ts:38). Comma: `a,b` fails the segment regexp, no split.
- Spec ID validation (remove): OK. L125-134 try/catch fallback to raw id.
- ReadOnly rejection: OK. L109-122, message format matches spec exactly, no remediation. Runs before schema check and before mutate.
- Invalidation policy: OK (L200-202).
- Change lookup: OK (L85-88; mutate used for effective update L150).
- No-op / description-only: OK for the early-return path (L96-98, before actor resolution). Description-only returns invalidated false (L204).
- Removal precedes addition, absent removal throws SpecNotInChangeError, idempotent add: OK (L160-176). Error id is the normalized id.
- Seeding specDependsOn: Deviation (low), see D3.
- Approval invalidation via mutate + updateSpecIds: OK (L184-187).
- Directory cleanup: OK (L209-211), after persist.
- Refresh implementation tracking: OK (L217-222).
- Output contract: OK.
- Dependencies / factory: see D2 (spec text internally inconsistent).
- Schema compat guardrail: OK (L136-148), before mutate.
- Constraint "never splits spec ID": OK.

### Discrepancies

- D1 (Low-Med) "No-op when specIds unchanged ... without persisting" and "Actor identity only resolved when persistence-worthy".
  - Spec: remove+re-add same spec, or add of already-present spec, returns invalidated:false WITHOUT persisting; actor only resolved on persistence-worthy change.
  - Code: edit-change.ts L100 resolves actor and L150 always calls `mutate()` whenever any of description/policy/non-empty spec lists is given. `mutate` always calls `_persistManifest` (change-repository.ts ~L350-352) even when specIds unchanged. So the no-op cases persist (a manifest rewrite) and resolve the actor. Pre-existing behaviour, not introduced by this change, but verify scenarios "Remove and re-add the same spec" / "addSpecIds with no effective change" imply no persistence. Both sides defensible: the spec could be relaxed or code could short-circuit.
- D2 (Low, spec-side inconsistency) Dependencies requirement lists ports `ChangeRepository, ActorResolver, specs: ReadonlyMap<string, SpecRepository>`; the factory requirement and code (L62-68) use `ChangeRepository, ListWorkspaces, ActorResolver, SchemaProvider, RefreshImplementationTracking?`. Code matches the factory requirement; Dependencies requirement + its three verify scenarios (spec-repos map) are stale. The change did not touch this section.
- D3 (Low, spec vs code) Seeding fallback to canonical `metadata.json.dependsOn` (incl. stale) is specified (req + 2 scenarios). Code (loadPersistedSpecDependsOn) only reads `repo.readPersistedState`; no metadata.json fallback. Pre-existing; tests named "from stale metadata" actually exercise persisted state. Not part of this change.
- D4 (Low, spec-side) Verify scenarios use bare IDs (`'auth/login'`, `['billing/invoices','auth/signup']` resulting specIds) while Spec ID validation now stores `default:auth/login`. Scenarios "Remove and add in same call", "Adding a spec already present", etc. read as unqualified results; stale vs new normalization requirement. Directory-cleanup scenarios use `core:edit-change` with dirs `specs/core/core/edit-change/` (ok).
- D5 (Info) JSDoc `@throws` omits InvalidSpecIdError / WorkspaceNotFoundError / ReadOnlyWorkspaceError / IncompatibleSchemaError (edit-change.ts L77-83). Interface comments still say "Spec paths".
- D6 (Info) Early-return no-op check (L96) evaluates `hasPolicyChange`; spec text for "no spec changes at all" lists only add/remove/description, so policy-only update is consistent with the Invalidation policy requirement. No conflict.
- Cross-spec: core:workspace (ReadOnly message) matches. core:spec-id-format: parseSpecId usage consistent (default workspace `default`, blank/malformed rejection, WorkspaceNotFoundError). No contradiction with default:\_global/\*.

### Test coverage (packages/core/test/application/use-cases/edit-change.spec.ts)

Covered: change not found; no-op no changes; add; no-duplicate add; seeding x2; remove; remove absent; description; policy; combined; invalidation; refresh tracking; 4 schema-compat scenarios; invalid segment (`Core/Foo`); comma segment; unknown workspace; bare->qualified; one invalid among valid (nothing stored); non-existent spec accepted; readOnly multi-line + nothing applied (platform only); removal skips ownership.

### Missing tests

- Spec ID validation: "Empty ID rejected" (`['']`), "Bad Id" quoted in message, comma test does not assert the error quotes `auth/a,b` / not split (only error class), unknown-workspace uses `missing:` (ok), "Removal of an invalid stored ID" (`Bad Id`), "Removal of a bare ID matches the qualified stored form" (existing test titled "normalizes bare remove IDs" actually removes `platform:tokens`, qualified, so bare not tested).
- ReadOnly: mixed case `default:auth/register` + platform specs asserting default not added; "SDK callers" has no distinct test (use case test covers it implicitly).
- Directory cleanup: no test for `unscaffold` called with removed ids (single/multiple) nor "adding does not call unscaffold" (grep unscaffold = 0 hits).
- Removal precedes addition; "Remove and re-add same spec" (invalidated false); "Both add and remove empty arrays"; "Description and addSpecIds together"; description-only does not invalidate an approved change; "Effective change applied on freshest persisted spec list" (mutate freshness); "Existing in-change snapshot not overwritten"; "invalidationPolicy does not invent drift"; input/output/dependency-contract scenarios; resolveEditChangeDeps composition test (none found in test/composition/use-cases for edit-change).

---

## 2. core:update-spec-deps

### Requirements summary

Input (name, specId validated+normalized and in change, add/remove/set/clear, whole IDs never split), change lookup via ChangeRepository.get, spec-in-change, set/clear/add-remove exclusivity, at least one op, set replaces (entries validated, '' rejected), clear via shared applyDependsOnMutation, spec ID validation (add/set/specId; remove not validated; existence rule for remove still applies), remove validates existence, add idempotent, remove before add, persistence via mutate + setSpecDependsOn, typed errors (INVALID_INPUT), config factory (changes + workspaces). Constraints: no invalidation, no actor, strict parseSpecId, non-existent targets accepted.

### Implementation status (packages/core/src/application/use-cases/update-spec-deps.ts)

- Input contract incl. `clear`: OK (L7-20).
- Change lookup: Deviation (D1).
- Spec must belong to change: OK-ish (D2), L118-122 InvalidInputError inside mutate.
- Exclusivity: OK (L84-89 and again in applyDependsOnMutation). add+remove allowed.
- At least one op: OK (L90-99); clear alone satisfies.
- Set replaces / '' rejected: OK (L108-111 parseSpecId throws InvalidSpecIdError on blank).
- Clear: OK (L130 -> applyDependsOnMutation clear -> []; L134 persist). No confirmation. OK.
- Spec ID validation: OK. Snapshots workspaces (L102), parses specId/add/set before mutate; remove via tryNormalizeDepId (L37-46). Missing spec not checked (accepted). Bare -> `default:`. Nothing stored when any invalid (validation before mutate).
- Remove validates existence / add idempotent / remove before add: OK (apply-depends-on-mutation.ts L50-68). Existence checked against normalized form.
- Persistence and output: OK (mutate, setSpecDependsOn, returns {specId, dependsOn}).
- Typed errors: OK, InvalidInputError code INVALID_INPUT. No generic Error remains.
- Config factory: OK, composition/use-cases/update-spec-deps.ts resolves `changes` and `workspaces` (keys of spec repositories) and passes them to the constructor.
- Constraints: OK (no actor, no invalidation).

### Discrepancies

- D1 (Low) Spec: "MUST load the change by name via ChangeRepository.get ... throw ChangeNotFoundError". Code never calls `get`; only `mutate`, which throws ChangeNotFoundError itself (change-repository.ts L343-352). Behaviour equal, mechanism differs. Also input validation (conflicts, ID parsing) runs before lookup, so invalid input on a nonexistent change reports validation error not ChangeNotFound (spec orders lookup first, not mandated strictly).
- D2 (Low-Med, spec vs code) specId matching: code compares the normalized specId against `change.specIds` with exact equality. A change whose stored specIds contain bare/legacy entries (e.g. `auth/login`) would reject `auth/login` (normalized to `default:auth/login`). Verify scenarios ("Spec ID not in change", `specIds: ['auth/login']`) still use bare IDs. Core:spec-lock/migrate not audited here; the loader may normalize on read (manifest-change-loader.ts modified). Flagging for batch owner of core:workspace/loader.
- D3 (Low) Error text embeds CLI flag syntax (`--set`, `--clear`, `at least one of --add, ...`, update-spec-deps.ts L85,88,97) in core, while applyDependsOnMutation uses plain wording ("set is mutually exclusive ..."). Spec scenario text says "`set` is mutually exclusive with `add` and `remove`". Layering smell (core message leaks CLI flags); also not mentioning `clear` in the first message wording vs spec wording. Both messages are produced depending on call path (use case guard fires first).
- D4 (Info) Duplicate precondition checks in the use case and in applyDependsOnMutation (dead code in helper path for this use case); formatting: L84 is a >100-char line (prettier would wrap), lint said clean so likely format not enforced.
- D5 (Info, spec-side) Verify scenarios still use bare IDs and `'core/session'`-style paths in set/remove/add examples, which now would be normalized (`default:core/session`). Stale vs Spec ID validation requirement. Also scenario "Mutually exclusive flags" speaks of `--set`/`--add` flags at use-case level.
- D6 (Info, spec-side) Input contract verify scenario lists fields without `clear` ("execute accepts UpdateSpecDepsInput" with name/specId/add/remove/set) but a separate "Input accepts clear" scenario exists. Fine.
- Cross-spec: default:\_global/error-handling-conventions satisfied (typed errors). core:spec-id-format consistent.

### Test coverage (test/application/use-cases/update-spec-deps.spec.ts)

Covered: add (qualified), persist through mutate, remove, set, clear, exclusivity matrix (5 combos, nothing stored), add+remove together, set [''], add [' '], malformed ID, unknown workspace, non-existent target accepted, bare->qualified, one invalid among valid stores nothing, remove invalid stored value, specId not in change, change not found, no operation, remove missing dep, no duplicates.

### Missing tests

- clear on already-empty list; "Set with empty array clears dependencies"; "Set overwrites existing" (set test exists but not empty-array variant — verify); remove-before-add ordering is only implicitly tested (add+remove test is order-agnostic in result: `[shared, core]` does demonstrate order, OK).
- `set: [':', 'ws:']` specific malformed; `InvalidSpecIdError` quoting asserted? (not asserted for `' '`: only class).
- Error code `INVALID_INPUT` not asserted for mutually exclusive flags.
- Factory: no test in test/composition/use-cases for `resolveUpdateSpecDepsDeps` returning `workspaces` (no update-spec-deps composition spec found).
- Comma-in-ID for add/set/remove (change theme): no test that `add: ['a,b']` is rejected whole (not split) nor that remove of a comma-containing stored value works.
- "Same behavior through the SDK": no SDK-level test (use case tests cover).

---

## 3. core:create-change

### Requirements summary

Input contract (specIds whole IDs), Spec ID validation (before persistence, qualified), ReadOnly rejection, active schema resolution, optional overlap check, initial invalidation policy, name uniqueness, actor resolution, single created event, change construction, specDependsOn seeding, persistence+scaffolding, dependencies, config factory, schema compat guardrail.

### Implementation status (packages/core/src/application/use-cases/create-change.ts)

- Input contract: OK; partial schema override rejected before persistence (L225-229).
- Spec ID validation: OK. L121 parseSpecId with workspaces; before `create` (L194). Comma not split. Non-existent accepted.
- ReadOnly rejection: OK, L122-133, format exactly per spec; before persistence.
- Active schema resolution: OK (L231, uses `.name()`/`.version()`, errors propagate).
- Overlap check: OK (L198-205).
- Invalidation policy: OK (L189-191; default downstream in Change).
- Name uniqueness: OK (active, draft, discarded; broader than spec).
- Actor resolution: OK. Single created event: OK (L136-143, specIds are normalized).
- Change construction: OK (description conditional; same `now`).
- Seeding: Deviation (D2).
- Persistence/scaffolding: OK (create -> scaffold -> changePath).
- Dependencies/factory: OK; composition spec tests exist.
- Schema compat guardrail: OK-ish, see D3.

### Discrepancies

- D1 (Low, spec-side stale) Verify "specIds are recorded in the created event": expects `['auth/login','auth/register']`; code/test record `['default:auth/login','default:auth/register']` (test at create-change.spec.ts L86-101 asserts qualified). Contradicts the scenario text but follows the new Spec ID validation requirement ("store the fully-qualified IDs"). Also requirement "Initial history" says `specIds`: "the input spec paths". Spec needs updating.
- D2 (Low, pre-existing) Seeding: spec says existing spec -> persisted state, else metadata.json fallback, else empty array. Code (L172-178) seeds only if `source !== 'empty'`; an existing spec without persisted state gets no entry (not `[]`) and there is no metadata.json fallback (loadPersistedSpecDependsOn reads readPersistedState only). Test names mention "falls back to persisted state" for the sidecar scenarios. Not touched by this change.
- D3 (Low, pre-existing) Compat guardrail: spec says uninitialized spec falls back to global schema and compat is declared on the Change's schema; code skips check when no persisted schema (equivalent result only if active == change schema; with explicit schemaName override differing from the active schema, uninitialized specs are not checked) and evaluates compat via `GetActiveSchema` schema rather than the change's explicit schemaName schema (requires `changeSchema.name() === schemaName`). Edge only.
- D4 (Info) Ordering: name-uniqueness and schema/actor resolution occur before spec ID validation, so an invalid ID with an existing name reports ChangeAlreadyExists. Spec only says "before persistence". Acceptable.
- D5 (Info) JSDoc `@throws` lacks InvalidSpecIdError/WorkspaceNotFoundError/ReadOnlyWorkspaceError/IncompatibleSchemaError; `specIds` comment says "Spec paths".
- Cross-spec: core:workspace and core:spec-id-format consistent; default:\_global/architecture no conflict.

### Test coverage (test/application/use-cases/create-change.spec.ts, test/composition/use-cases/create-change.spec.ts)

Covered: create->scaffold order, history, specIds recorded (qualified), description, policy seeding/default, dependency seeding (persisted/stale/prefers persisted/non-existent), active schema/explicit override/error propagation, overlap (included/throws/absent/empty), partial schema input x2, duplicate name x3 (active/draft/discarded), 4 schema compat scenarios, spec ID validation (invalid segment, comma, unknown workspace, bare->qualified, one invalid among many, non-existent accepted), readOnly (one line per offender, nothing created), composition factory (wired/deps/rejects/resolveCreateChangeDeps).

### Missing tests

- Comma test only asserts error class, not that message quotes `auth/a,b`; no "Bad Id" quoted-message assertion.
- ReadOnly "mixed owned and readOnly specs" appears covered by the multi-offender test only if it includes an owned spec (not verified; lines ~722-760 show only platform specs). "SDK callers" none distinct.
- "Actor identity recorded" / "initial state drafting" / "Result includes changePath" / "Description omitted" not individually located (likely in 'seeds the creation history event'/'creates a change' tests, not verified line by line).

---

## Counts

- core:edit-change: 15 reqs checked; OK 13, Deviation 2 (no-op persists/actor; metadata fallback seeding); spec-side stale items 3 (Dependencies, bare IDs in scenarios, JSDoc). Missing tests: ~16 scenarios.
- core:update-spec-deps: 13 reqs checked; OK 12, Deviation 1 (get vs mutate lookup, minor); other findings 4 (flag text in core, specId bare-legacy match, stale scenarios, long line). Missing tests: ~7.
- core:create-change: 15 reqs checked; OK 13, Deviation 2 (seeding fallback, compat edge, both pre-existing); spec-side stale 1 (created event specIds). Missing tests: ~3.
- Total: 0 High, 2 Medium-ish (edit-change D1, update-spec-deps D2 verification-dependent), rest Low/Info. No missing implementation of any change-theme requirement (comma-safe whole IDs, real validation, clear, ReadOnly) in these three specs.

---

# Batch D compliance audit - change `support-commas-in-names`

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation.
Method: spec-preview needs ids without folder prefix (e.g. `cli:change-deps`) but the preview output was large; I read the change deltas (`deltas/**/spec.md.delta.yaml`, `verify.md.delta.yaml`) directly, which carry every added/modified requirement and scenario. Code was read from the working tree (git diff + files). Graph search was not used (git working tree is uncommitted so the index would be stale); direct reads/grep instead.

Common code facts:

- `packages/cli/src/helpers/spec-path.ts` deleted (parseSpecId in CLI gone). New `packages/cli/src/helpers/confirm.ts` (`confirmOrExit`).
- Core normalizes/validates in use cases: create-change.ts, edit-change.ts, update-spec-deps.ts, update-persisted-spec-deps.ts, update-implementation-tracking.ts (all modified, uncommitted).

---

## 1. cli:change-implementation

Requirements (delta): Resolve / Unresolve / Ignore take whole file names (repeated `--file` or variadic, no comma split, no trim); one missing file aborts the whole op; new "Raw values and unambiguous listings" (raw `--file`/`--symbol`/`--spec`, text lists one name per line, json/toon arrays).

Implementation status

- Resolve/Unresolve/Ignore whole names, no split/trim: OK. `packages/cli/src/commands/change/implementation.ts` `--file <paths...>` (lines ~140-190), `mutateImplementationTracking` (~L292) removed `split(',')`/`trim()`, passes `files` unchanged. Variadic + repeated both supported by commander.
- Missing file aborts all / error quotes full name: OK (delegated to core; `ImplementationFileNotFoundError` message `Implementation file "<file>" does not exist`, core/src/domain/errors/implementation-file-not-found-error.ts:10). Core validates all files before first mutation (update-implementation-tracking.ts Promise.all of `_validateMutation`).
- Raw `--spec`, `--symbol`: OK (add/remove pass `opts.spec`, `files: [opts.file]`, symbols unchanged). Core `UpdateImplementationTracking` normalizes spec id (parseSpecId).
- Text listing one name per line for tracked files: OK (implementation.ts ~L191-200).
- Text listing of "other names": DEVIATION (Low). Requirement says "Text output that lists file names or other names MUST print one name per line, never joined by a separator that a name can contain". `renderImplementationState` still joins with `', '`: out-of-scope spec IDs (`outOfScopeSpecIds.join(', ')`, ~L205), link symbols (`link.symbols.join(', ')`, ~L212), candidates ids (`...join(', ')`). Spec ids can no longer contain commas now (OK), but symbol names/target ids can (e.g. signatures, overloaded/generic names), so symbols line violates the letter of the requirement.
- Structured output arrays: OK (`trackedFiles`, `links` arrays).

Discrepancies

1. [Low] Symbols/candidates joined with ', ' in `change implementation list/review` text. Spec side: "never joined by a separator that a name can contain". Code side: symbols joined with ', ' (implementation.ts ~L212). Either spec scope ("file names or other names") should be narrowed to file names, or code should print symbols one per line.
2. [Info, pre-existing] specd-archive/specd-implement templates say "Files with active confirmed links cannot be ignored", while spec says ignore MUST preserve links and MUST NOT reject because links exist (see section 7).

Test coverage (packages/cli/test/commands/change-implementation.spec.ts): resolve repeated+variadic (L114), ignore comma-named file (L142), ignore `f3.ts,f4.ts` whole name error (L177), raw spec on add (L214), list one per line (L245), unresolve (L320).
Missing tests: resolve with comma name `a, b.md`; "one missing file aborts whole resolve" (CLI-level; core covers atomicity - not verified here); unresolve with repeated + comma name; "values never trimmed" (`" spaced.md "`); `--format json` list keeps arrays; ignore multi-file `--file f3.ts --file f4.ts`.

---

## 2. cli:change-edit

Requirements: `--add-spec/--remove-spec` forwarded raw (no comma split); command holds no workspace/ownership/spec-id logic; ReadOnly rejection from EditChange (one line per spec, no remediation); errors: InvalidSpecIdError, WorkspaceNotFoundError, readOnly, empty specIds.

Implementation status

- Raw forwarding: OK. edit.ts: `addSpecIds = opts.addSpec` / `removeSpecIds = opts.removeSpec` passed to `kernel.changes.edit.execute`. `config` no longer read; parseSpecId import removed.
- Command holds no ownership logic: OK.
- EditChange validates (parseSpecId with workspaces) and rejects readOnly: OK (core/src/application/use-cases/edit-change.ts). `--remove-spec` normalized leniently (try/catch fallback to raw), consistent with "not re-validated".
- Error mapping to exit 1 with message: OK via `handleError` (SpecdError -> exit 1, message verbatim).
- At least one flag / empty specIds: unchanged, OK.

Discrepancies

1. [Low] ReadOnly message: spec says "one line per offending spec and no remediation steps". Core message = per-spec lines + trailing paragraph "ReadOnly workspaces are protected: their specs and code cannot be modified by changes." (edit-change.ts / create-change.ts). Not remediation per se, but is extra text beyond "one line per spec". Spec-side: lines only; code-side: lines + explanatory paragraph (pre-existing wording moved from CLI to core).

Test coverage (change-edit.spec.ts): forwards raw + WorkspaceNotFoundError (L212), comma ID as one value (L229), ReadOnly mapping (L247), no helper import (L266).
Missing tests: `--add-spec "Bad Id"` -> InvalidSpecIdError exit 1 message (CLI-level mapping); "Values forwarded unchanged" asserting `auth/register` raw (partly covered by L212); `--remove-spec` raw. Core `edit-change.spec.ts` covers use case.

---

## 3. cli:change-deps

Requirements: signature adds `--clear` and `--force`; values raw, no comma split; new "Clear confirmation" (TTY prompt, --force skip, non-TTY without force -> exit 1 mentioning `--clear` requires confirmation and `--force`, declined -> "cancelled" exit 0); errors: invalid ID (empty/blank/malformed) -> InvalidSpecIdError, unknown workspace -> WorkspaceNotFoundError; dependency on non-existent spec accepted; `--set` excl. with add/remove/clear; `--clear` excl. with add/remove.

Implementation status (packages/cli/src/commands/change/deps.ts)

- Signature/help `--clear`, `--force`: OK (L22-30).
- Raw values, no parse: OK (passes `opts.add/remove/set` to `updateSpecDeps`). Core `UpdateSpecDeps` validates via parseSpecId, normalizes; remove lenient (update-spec-deps.ts).
- Clear confirm: OK via `confirmOrExit` (force -> true; non-interactive -> cliError exit 1; decline -> `output('cancelled')` exit 0). Confirmation placed after list-mode and option-conflict checks, before use case call: matches spec.
- Mutual exclusion: OK in CLI (fast-fail) and core (authority). `--clear` without specId: OK ("modification flags ... require a specId").
- `--set ""` rejected, nothing stored: OK (validation before `mutate`, update-spec-deps.ts).
- Not-yet-created dependency accepted: OK (no existence check in UpdateSpecDeps).
- Output `dependsOn: (none)` after clear: OK.

Discrepancies

1. [Low] Non-TTY error text. Spec: error "stating that `--clear` requires confirmation and that `--force` skips it". Code (confirm.ts `confirmOrExit`): derives from message -> `Clear all dependencies of <specId> requires confirmation; pass --force to skip it`. Says `--force` skips it, but does not name `--clear`. Spec-side wants the flag named; code-side says "Clear all dependencies of X".
2. [Low] Declined prints `cancelled` via `output('cancelled','text')` even with `--format json|toon` (no structured payload). Spec only says "prints that it was cancelled"; structured consumers get plain text. Same for spec deps clear.
3. [Info] Text-mode display joins dependency ids with ', ' (deps.ts L108-118); IDs can no longer contain commas, so unambiguous.

Test coverage (change-deps.spec.ts): clear + add conflict (L330), clear w/o specId (L353), `--set ""` (L366), `--set core:a,b` one ID (L392), raw bare id (L419), clear confirmed (L450), declined (L479), --force (L500), non-TTY (L525).
Missing tests: help lists `--clear`/`--force`; `--clear` with `--remove` and with `--set` (only `--add` tested); `--add " "` blank; unknown workspace `--add nope:auth/login` (CLI mapping); dependency on not-yet-created spec accepted; non-TTY error message text content.

---

## 4. cli:spec-deps

Requirements: Clear needs confirmation or `--force` (same as change deps); new "Raw spec IDs" (spec-id and each `--dep` raw, no validate/qualify/split; core applies parseSpecId; bare path -> default); error mapping adds InvalidSpecIdError, WorkspaceNotFoundError, InvalidSpecLockError (names spec, lock location, field path), SpecNotFoundError for missing dependency target.

Implementation status (packages/cli/src/commands/spec/deps.ts)

- Clear confirm: OK (L152-190), `--force` option present; confirm occurs before kernel resolve.
- Raw ids: OK; all subcommands pass `specPath` and `opts.dep` straight to `kernel.specs.*PersistedDeps`.
- Core: UpdatePersistedSpecDeps validates add/set, checks workspace + target existence (SpecNotFoundError), normalizes (update-persisted-spec-deps.ts).
- `--dep ""` on `set`: reaches core -> InvalidSpecIdError; `add`/`remove` with no `--dep` rejected by requiredOption/`--dep requires at least one value`. OK.
- InvalidSpecLockError mapping: OK via generic `handleError` (SpecdError -> exit 1, message verbatim, no stack). Message: `Invalid spec-lock for '<id>' at <location>: field '<path>' <reason>. Correct that field in the file.` (core/src/domain/errors/invalid-spec-lock-error.ts). Names spec, location, field path as required.
- InvalidSpecIdError message quotes full value: OK (`Invalid spec ID '<value>': <reason>`).

Discrepancies

1. [Medium, theme-level] Task theme says the invalid persisted spec-lock error is one "the CLI can repair". Message says "Correct that field in the file" (manual edit); no CLI repair hint/command. cli:spec-deps spec only requires name/location/field path, so spec-compliant; flag as design gap vs. theme (spec-side: no repair mandate here; code-side: manual guidance only). Possibly covered by core:spec-lock / other batches.
2. [Low] Same confirmation-message and non-structured `cancelled` notes as change-deps (confirm.ts).

Test coverage (spec-deps.spec.ts): list delegates (L46), set delegates (L63), `--dep ""` (L90), missing target (L110), InvalidSpecLockError exit 1 no stack (L135), clear confirmed/declined/force/non-TTY (L160-217).
Missing tests: bare id `_global/architecture` forwarded unchanged on `list`; `--dep "core:a,b"` forwarded as single value and InvalidSpecIdError; invalid/unknown workspace id mapping; InvalidSpecLockError assertion that message contains spec id, lock location, `dependsOn.0` (verify scenario names this field).

---

## 5. cli:graph-index

Requirements: `--exclude-path <pattern>...` values are whole patterns, never comma-split; repeat option or list after it.

Implementation status

- index-graph.ts L72-76: `new Option('--exclude-path <glob...>').argParser((val, prev) => (prev ?? []).concat(val))`: `.split(',')` removed. OK. Variadic + repeat both accumulate (commander variadic parser per value).
- Value passed as `excludePaths: opts.excludePath` in task input (L163): OK.
- Help text says "one or more gitignore-syntax patterns, relative to the project root" - OK.
- docs/cli/graph.md L37 documents `<glob...>`; matches.

Discrepancies: none material. [Info] spec text uses `<pattern>...`, code uses `<glob...>` placeholder name (help only).

Test coverage (graph-index.spec.ts L99-108): `'{a,b}/**'` becomes single pattern (updated from 'foo,bar').
Missing tests: repeated `--exclude-path a --exclude-path b`; listed form `--exclude-path a b` (not verified at runtime by tests, relies on commander semantics).

---

## 6. cli:change-create

Requirements: `--spec` raw whole IDs (no comma split); CLI does not resolve workspaces; CreateChange validates and derives workspaces, raises WorkspaceNotFoundError/InvalidSpecIdError/ReadOnlyWorkspaceError; CLI maps to exit 1; no ownership logic in CLI; slug validation "CLI validates format before invoking".

Implementation status (create.ts)

- Raw `--spec` forward `specIds: opts.spec`; includeOverlapCheck when non-empty: OK. parseSpecId/ownership removed: OK.
- CreateChange parses, readOnly check before create, normalized specIds stored (create-change.ts): OK.
- Error mapping via handleError: OK.
- Slug validation in CLI: not found in create.ts (no kebab check; grep of create-change.ts also found none). DEVIATION (Low, likely pre-existing): Constraint "The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case". Unchanged text from canonical spec; verify whether the change-name validation lives elsewhere (e.g. Change entity/repository) - not audited further.
- Option description `--spec <id>` says "spec path (repeatable)" (create.ts L16): stale wording, minor.

Discrepancies

1. [Low] Slug validation constraint not visible in CLI (pre-existing, outside this change's delta but sits in "Constraints" that the delta rewrote while keeping that line).
2. [Low] ReadOnly message extra paragraph (see change-edit #1).

Test coverage (change-create.spec.ts): bare id raw (L84), explicit ws raw (L108), WorkspaceNotFoundError (L133), comma id one value (L158), no helper import (L176), ReadOnly mapping (L339), integration tests (L367+).
Missing tests: `--spec "Bad Id"` -> exit 1, no change created (InvalidSpecIdError mapping); CLI-level assertion that comma value yields InvalidSpecIdError message (only forwarding is asserted).

---

## 7. skills:workflow-automation

Requirement (Implementation traceability policy): when resolving/ignoring multiple files, agents SHOULD pass one whole name per value (`--file a --file b` or `--file a b`); MUST NOT join file names with commas. Scenarios: agent uses repeated options; never writes `--file a.ts,b.ts`.

Implementation status

- packages/skills/templates/skills/specd-implement/SKILL.md.tpl: examples changed to `--file <path1> --file <path2> ...` (L182, L194): OK for command examples.
- specd-archive/SKILL.md.tpl: examples changed (L109-119): OK for command examples.
- DEVIATION (Medium): prose still teaches commas. specd-archive/SKILL.md.tpl L110-111 "It supports a comma-separated list of paths for efficient bulk resolution." and L114 "It also supports comma-separated lists."; specd-implement/SKILL.md.tpl L191-192, L194 same text. These contradict the spec ("MUST NOT join file names with commas") and the new CLI behavior (commas are not separators), and sit right next to updated examples. The new test regex only checks `--file ...x,y` patterns, so it does not catch this prose.
- specd-fasttrack template: no comma-list guidance found.
- Pre-existing: both templates say "Files with active confirmed links cannot be ignored", contradicting cli:change-implementation Ignore requirement (MUST NOT reject solely because links exist). Not introduced by this change but now adjacent to touched lines.

Discrepancies

1. [Medium] Stale "comma-separated list" prose in specd-implement and specd-archive templates (spec-side: no comma joining; template-side: tells agent it is supported).
2. [Low, pre-existing] "cannot be ignored" vs cli:change-implementation spec.

Test coverage (packages/skills/test/template-workflow.spec.ts L109-120): asserts no `--file ...\w,\w` and no `--file <path1>,<path2>` in implement/archive/fasttrack templates.
Missing: test asserting presence of repeated-`--file` guidance; nothing catches prose "comma-separated".

---

## Docs check

- docs/cli/changes.md: create/edit/deps/implementation sections updated (raw ID, never comma-split, `--clear`, `--force`, `--file <paths...>`). Matches code. OK.
- docs/cli/cli-reference.md L41-47: matches create.
- docs/cli/spec-deps.md: documents `clear [--force]` and confirmation prompt; OK. Does not document InvalidSpecLockError behavior (optional).
- docs/cli/graph.md L37: `--exclude-path <glob...>` - truncated in grep output, not verified to state "never comma-split".
- `specs/cli/*` canonical specs still carry comma wording; expected until archive.

## Cross-spec / global checks

- No contradictions with default:\_global/\* found for these specs. Error handling: typed errors exit 1 consistently.
- Direct deps: cli:change-edit depends on cli:change-create and core:spec-id-format - consistent (both CLI commands now forward raw). core:spec-id-format requires validation in use cases; cli:change-deps/spec-deps rely on it correctly.

## Counts

- Specs audited: 7
- Requirements/scenario groups checked: ~45 scenarios in verify deltas
- Implementation status: all requirements OK except partial deviations below
- Discrepancies: Medium 2 (stale comma prose in skill templates; invalid lock error has no CLI repair hint vs theme), Low 7 (symbols joined with ', '; ReadOnly extra paragraph; non-TTY message omits `--clear`; `cancelled` unstructured; slug validation not in CLI; stale `--spec` option help "spec path"; pre-existing "cannot be ignored" text), Info 2.
- Missing code: 0. Missing tests: ~20 scenarios lack direct tests (listed per spec), none critical.
