# Partial compliance report core-b (read-only audit, change `support-commas-in-names`)

Specs: core:update-spec-deps, core:update-persisted-spec-deps, core:spec-lock, core:get-persisted-spec-deps, core:get-persisted-spec-implementation, core:get-persisted-spec-optimizations, core:get-persisted-spec-schema, core:update-persisted-spec-implementation, core:update-persisted-spec-optimizations, core:update-persisted-spec-schema.

Method: merged specs via `changes spec-preview`; code in `packages/core/src`; tests in `packages/core/test` (not re-run). Paths below are relative to `packages/core/` unless noted.

## Discrepancy summary (all specs)

| ID  | Sev    | Spec                                   | Short                                                                                                                                                                                                              |
| --- | ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | MEDIUM | update-persisted-spec-schema           | "load + verify artifacts parse under target schema" not enforced when target schema has no `dependsOn` extraction (and artifacts without a parser are skipped)                                                     |
| D2  | MEDIUM | update-persisted-spec-implementation   | Workspace-boundary check is a bare `startsWith` prefix check, and is skipped entirely for `ws:path` inputs (`core:../x`)                                                                                           |
| D3  | MEDIUM | spec-lock / update-persisted-spec-deps | No fs-level test for the lenient `dependsOn` read through the real repository (read + `writePersistedState` revision check)                                                                                        |
| D4  | LOW    | update-persisted-spec-deps             | `remove` + non-empty `add` against missing state: `remove` silently ignored (spec unclear)                                                                                                                         |
| D5  | LOW    | update-persisted-spec-optimizations    | Spec contradicts itself: Zod contract says empty/missing `specId` -> `InvalidInputError`; Spec-ID-validation says `''` -> `InvalidSpecIdError`; code/test follow the latter                                        |
| D6  | LOW    | update-spec-deps                       | Spec does not state that valid `remove` entries are normalized to fully-qualified form; code does (as update-persisted-spec-deps spec states)                                                                      |
| D7  | LOW    | spec-lock                              | Scenario "Error names spec, file, field, code `INVALID_SPEC_LOCK`, no repair advice" only partly tested                                                                                                            |
| D8  | LOW    | spec-lock / core:spec-repository-port  | Port spec (dependency) does not document the `lenientDependsOn` option on `readPersistedState` that spec-lock and the port code define                                                                             |
| D9  | LOW    | update-persisted-spec-implementation   | Ordering: `readPersistedState` runs before the add-time file-existence check (spec only requires no mutation)                                                                                                      |
| D10 | INFO   | get-persisted-spec-schema              | Dead branch `WorkspaceNotFoundError` after `parseSpecId` already validated workspaces (src/application/use-cases/get-persisted-spec-schema.ts:38-41)                                                               |
| D11 | INFO   | update-persisted-spec-schema           | Dependency equality reuses `DependsOnOverwriteError.areSame` (order-independent) – spec says "equal"; ordering semantics unspecified                                                                               |
| D12 | INFO   | update-persisted-spec-implementation   | `writePersistedState` in fs repo throws `ReadOnlyWorkspaceError` with a full message while use cases pass workspace name (src/infrastructure/fs/spec-repository.ts:548 vs use cases) – inconsistent arg convention |

Counts: HIGH 0, MEDIUM 3, LOW 6, INFO 3.
Missing-test counts are listed per spec (the dominant gap: most get/update-persisted specs have only 4-9 unit tests vs 20-40 scenarios).

Cross-spec contradictions: none blocking. spec-id-format ("remove SHALL NOT validate syntax", "every use case validates with parseSpecId", "readers reject bare/invalid persisted IDs") is consistent with all ten specs and with code. Only D8 (port spec silent on `lenientDependsOn`) and D5 (internal contradiction).

---

## 1. core:update-spec-deps

### Requirements Summary

Input contract (whole IDs, never split/joined); change lookup (`ChangeNotFoundError`); spec in change; set/clear/add+remove exclusivity; min one op; set replaces + validates; clear; spec-ID validation (parseSpecId, InvalidSpecIdError, WorkspaceNotFoundError, nothing stored on any invalid, remove not validated); remove must exist; add idempotent; remove-before-add; persist via `ChangeRepository.mutate`; typed errors; config factory via `resolveUpdateSpecDepsDeps`.

### Implementation Status

- src/application/use-cases/update-spec-deps.ts:84-99 exclusivity + min-op (`InvalidInputError`), :102-115 parse/normalize before mutation (`tryNormalizeDepId` for remove, :37-46), :117-136 `mutate` + `setSpecDependsOn`, :118 spec-in-change check (inside mutate, after validation: OK).
- src/application/use-cases/\_shared/apply-depends-on-mutation.ts:44-72 clear/set/remove-then-add/idempotent add.
- src/composition/use-cases/update-spec-deps.ts:27-32 `resolveUpdateSpecDepsDeps` (changes + workspace names), :40-87 factory delegation.
- All requirements implemented. Commas: IDs are mapped one-to-one (:106, :110), never split.

### Discrepancies

- D6 LOW. Spec "Spec ID validation" says remove entries "are not validated for syntax" but is silent on qualification; code qualifies valid ones (:37-46) and test (`removes deps ... remove: ['auth/jwt']`) relies on it. Spec drift (add one sentence) – code is right and matches persisted-deps spec.

### Test Coverage (test/application/use-cases/update-spec-deps.spec.ts)

Covered: add qualified (:15), mutate persistence (:36), remove (:52), set (:71), clear (:86), exclusivity matrix incl. clear+set/add/remove and set+add/remove (:103), add+remove (:122), `set['']` stores nothing (:139), `add[' ']` (:154), comma-containing ID rejected as whole value (:168), malformed (:195), unknown workspace (:208), non-existent target accepted (:222), bare qualified (:236), one-invalid-among-valid (:250), remove invalid stored value (:269), spec not in change (:284), change not found (:294), no operation (:303), remove missing dep (:313), no duplicates (:324).

### Missing Tests

- Set overwrites existing deps with multi-entry result (partly via :71, ok) / `set: []` clears (scenario "Set with empty array clears dependencies") – MISSING.
- "Remove and add in same call" asserting remove-before-add ordering with exact output order (`['default:core/config','default:billing/invoices']`) – only :122 covers a similar case; acceptable but order of an add+remove where same ID in both is not tested.
- "Dependencies with no prior state" (no `specDependsOn` entry) – MISSING.
- "Input accepts clear" / "clear on already empty list" – MISSING (:86 only non-empty).
- "Use case asks no confirmation" – n/a (implicit).
- Typed-error code `INVALID_INPUT` assertion – MISSING (tests assert class only).
- "Same behavior through the SDK" – no sdk-level test found (packages/sdk/test has no UpdateSpecDeps reference).
- `createUpdateSpecDeps` config factory / `resolveUpdateSpecDepsDeps` scenarios – MISSING (only barrel-kernel-coverage lists the name; no test/composition/use-cases/update-spec-deps.spec.ts exists).

---

## 2. core:update-persisted-spec-deps

### Requirements Summary

Input contract; exclusivity/min-op; spec-ID validation + target existence (`SpecNotFoundError`), bare remove normalization, invalid remove literal, lenient read for remove/set/clear and strict for add, post-mutation `InvalidSpecLockError` for any remaining invalid entry; remove-before-add; read snapshot with originalHash; set/clear create state w/o derivation; non-empty add uses `resolveInitialPersistedDependsOn`; remove/empty add vs missing state = no-op; patch helper; conditional write + `ArtifactConflictError`; `SpecNotFoundError`; result; factory.

### Implementation Status

src/application/use-cases/update-persisted-spec-deps.ts:

- :95-111 exclusivity/min-op before any I/O; :113-124 parse; :127-129 readOnly guard; :131-140 target existence (SpecNotFoundError); :142-145 remove normalization; :160-166 lenient read for clear/set/remove, strict for add; :171-182 post-mutation `isFullyQualifiedSpecId` check -> `InvalidSpecLockError(specId, undefined, 'dependsOn.i', ...)`; :183-189 patch helper + `expectedRevision: current.originalHash`; :200-251 missing state path (`created:true`, `expectedRevision:null`, no derivation for set/clear, derivation for add).
- Parsers: src/domain/services/parse-spec-lock.ts:82-93,104-133.
- Factory: src/composition/use-cases/update-persisted-spec-deps.ts (resolver; not re-read in detail; existence confirmed).

### Discrepancies

- D4 LOW. Missing-state path (:205-211,:237-242): `remove: ['x'], add: ['y']` creates state and applies only `add`; `remove` is dropped. Spec: "remove-before-add" and "remove against missing state is no-op" only cover each in isolation. Either spec drift (document that remove is moot on a freshly-derived base... but the derived base may contain the removed dep!) or code bug (remove should apply to the derived base before add). Leaning code bug: derived `dependsOn` may contain the dep the user asked to remove.
- D3 MEDIUM (test gap, see Missing Tests).
- D12 INFO (see summary).

### Test Coverage (test/application/use-cases/update-persisted-spec-deps.spec.ts, plus UpdatePersistedSpecDeps cases in get-persisted-spec-deps.spec.ts:81-130)

Covered: remove noop on missing state (:27), conflicting flags before I/O (:42), no-op rejected (:62), invalid ID before I/O (:75), missing dep target SpecNotFoundError (:93), missing spec (:109), bare qualified (:122), remove invalid stored value with lenient (:146), InvalidSpecLockError propagation (:168), clear (:190), unknown workspace (:213), lenient read + bare remove normalization (:225), remaining invalid -> InvalidSpecLockError (:250), add strict (:276); create-on-set in other file (:94).

### Missing Tests

- Remove-before-add with overlap (`remove[core:a] add[core:a,core:c]` -> `[core:b,core:a,core:c]`) – MISSING.
- originalHash captured and passed as `expectedRevision` – MISSING.
- `set` against lock-less spec creates exact list without invoking derivation (spy on resolveInitialPersistedDependsOn) – partly (:94 in other file; no derivation-not-called assertion).
- `clear` against lock-less spec -> `created:true`, `[]` – MISSING.
- `add` against lock-less spec derives initial base then adds; and empty-base fallback – MISSING.
- `add: []` against missing state no-op – MISSING.
- Patch helper carries schema/implementation/optimizations unchanged – MISSING.
- `ArtifactConflictError` propagation without retry – MISSING.
- `created:false` on existing state with add – MISSING.
- Clear/set repair of a lock with invalid deps – only clear on valid lock (:190); "Clear and set repair" MISSING; "Valid entries accepted" MISSING.
- `ReadOnlyWorkspaceError` before I/O (constraint) – MISSING.
- `set: ['']` -> InvalidSpecIdError, `writePersistedState` not called – likely covered by :75 (verify literal) – partially.
- Config factory scenario (resolver incl. `initializePersistedSpecState` collaborator): test/composition/use-cases/update-persisted-spec-deps.spec.ts is a 602B smoke test only; does not assert resolver-derived deps.

---

## 3. core:spec-lock

### Requirements Summary

Sidecar location; immutable schema except guarded reassignment; persistent `dependsOn` fully-qualified; `InvalidSpecLockError` (code `INVALID_SPEC_LOCK`, names spec/file/field/rule, no repair advice), strict-by-default reads, lenient `dependsOn` exception, no rewrite on read; implementation links; optimizations block; lock-less specs & explicit init; archive-time materialization & conditional writers; sidecar as source of truth; hash via `persistedStateMeta`, no `persistedStateHash` on port; sidecar not an artifact.

### Implementation Status

- src/domain/services/parse-spec-lock.ts:14-16,82-93 (strict vs lenient schemas, other fields stay strict), :104-133 (ZodError -> `InvalidSpecLockError` with first-issue path).
- src/domain/errors/invalid-spec-lock-error.ts:6-31 code `INVALID_SPEC_LOCK`; message names spec, location, field, reason; no repair advice.
- src/infrastructure/fs/spec-repository.ts:528-536 `readPersistedState(spec, {lenientDependsOn})`, :546-584 `writePersistedState` (readOnly guard, lenient revision read :559, conditional `ArtifactConflictError`, atomic write), :631-637 `persistedStateMeta`, :793-812 `_readSpecLock` (read-only, never rewrites).
- No `persistedStateHash` method on port (grep clean in src/application/ports; the name only appears as a local variable in generate-spec-metadata.ts:166).
- `isFullyQualifiedSpecId` src/domain/services/parse-spec-id.ts:94-102 (rejects bare/empty/malformed).
- Archive materialization, reassignment, init semantic requirements: implemented in other use cases (archive, update-persisted-spec-schema, initialize-persisted-spec-state), out of scope except where noted.

### Discrepancies

- D7 LOW: code `INVALID_SPEC_LOCK` and the "no hand-edit / no repair command" message property are never asserted (grep `INVALID_SPEC_LOCK` in test/ = 0 hits). Implementation is compliant (error file lines 26-29). Test gap, not a bug.
- D3 MEDIUM: fs-level `lenientDependsOn` and the lenient revision read inside `writePersistedState` (spec-repository.ts:559) have no repository test (`lenientDependsOn` appears only in parse-spec-lock.spec.ts, use-case spec via fakes, and spec-id-guards). If someone removed the lenient flag at :559 no test would fail and repair writes of invalid locks would throw.
- D8 LOW: dependency `core:spec-repository-port` spec does not mention `lenientDependsOn` (grep of merged preview = 0 hits) although spec-lock normatively names `readPersistedState` option `lenientDependsOn: true`. Drift in the port spec (port code src/application/ports/spec-repository.ts:212-217 has it).

### Test Coverage

parse-spec-lock.spec.ts: valid qualified entries (:7), invalid JSON typed (:22), `[''] ['auth/login'] ['not valid'] ['core:']` rejected at `dependsOn.0` with spec/location/field in message (:36-58), strict rejects mix (:59), lenient tolerates (:75), lenient still strict on other fields (:89), schema/optimizations backward compat (:129,:140).
spec-repository.spec.ts: lock excluded from filenames (:150,:304), `readPersistedState` `dependsOn:[""]` -> InvalidSpecLockError + file unchanged (:1281), old locks w/o optimizations (:1315), persistedStateMeta null/lastModified/hash (:1389-1420), sidecar rejected by `artifact()` (:1474), conflict (:1275).

### Missing Tests

- `INVALID_SPEC_LOCK` code assertion; "message does not prescribe repair" – MISSING.
- Lenient read still validates `implementation.0.file` via repository (domain-level covered at parse-spec-lock.spec.ts:89, repository-level MISSING).
- `writePersistedState` succeeds over a lock with invalid `dependsOn` (repair write) – MISSING.
- "Reading never rewrites ... one valid + one invalid entry" at fs level (only `[""]` case :1281) – partial.
- "Sidecar dependencies used as durable fallback" (metadata regeneration) – not examined here (generate-spec-metadata scope).
- Lock-less ordinary read does not upgrade; "lock cannot be created without canonical artifacts" – not located in scope.
- Reassignment scenarios (see §10), explicit init scenarios (belong to initialize-persisted-spec-state), archive materialization scenarios (belong to archive-change) – not audited here.
- `Spec.persistedStateStamp.present` true & absent from `Spec.artifacts` – partly covered at spec-repository.spec.ts:150,:1431-1452; "no persistedStateHash on port" – MISSING (no type-level/negative test).

---

## 4. core:get-persisted-spec-deps

### Requirements Summary

Input; spec-ID validation (parseSpecId w/ workspaces, bare->default, fully-qualified result); reads via `readPersistedState` only; initialized result preserves order/duplicates; uninitialized -> `[]`, `initialized:false`, no side effects, no projection fallback; unknown spec typed error; factory.

### Implementation Status

src/application/use-cases/get-persisted-spec-deps.ts:34-49: `parseSpecId(input.specId,{workspaces: keys()})` (:34-36), `SpecNotFoundError(specId)` (:41), `readPersistedState(spec)` (:44), `dependsOn: persisted?.dependsOn ?? []` unmodified (:47). Compliant. Factory file src/composition/use-cases/get-persisted-spec-deps.ts.

### Discrepancies

None.

### Test Coverage (test/application/use-cases/get-persisted-spec-deps.spec.ts)

uninitialized empty (:18), invalid specId '' and 'Core/Foo' before repo calls (:28), bare->default (:42), unknown workspace (:51), qualified accepted with `initialized:true` (:60). Composition smoke: test/composition/use-cases/get-persisted-spec-deps.spec.ts (constructor-type only).

### Missing Tests

- Stored order preserved incl. duplicates (`['core:b','core:a','core:a']`) – MISSING.
- `SpecNotFoundError` for unresolvable spec – MISSING.
- Malformed `'Bad Id'` error quoting the value – MISSING (uses 'Core/Foo'); message-quoting not asserted.
- Never reads metadata / lock directly (spy that only `readPersistedState` is called) – MISSING.
- No state created as a side effect – MISSING.
- Factory resolver scenario: smoke only.

---

## 5. core:get-persisted-spec-implementation

### Implementation Status

src/application/use-cases/get-persisted-spec-implementation.ts:36-52: same pattern; `implementation: persisted?.implementation ?? []`, `initialized` flag. Compliant. File-level vs symbol-level entries pass through untouched.

### Discrepancies

None.

### Test Coverage (test/application/use-cases/get-persisted-spec-implementation.spec.ts)

uninitialized (:9), invalid specId (:19), bare->default (:31), unknown workspace (:40), qualified (:48).

### Missing Tests

- File-level vs symbol-level links distinguished in stored order – MISSING.
- `SpecNotFoundError` – MISSING.
- Only `readPersistedState` used / no state creation – MISSING.
- `'Bad Id'` quoting – MISSING.
- Factory scenario – smoke only.

---

## 6. core:get-persisted-spec-optimizations

### Requirements Summary

Input (`field` filter); spec-ID validation; `readPersistedState` + `artifactMeta` only; uninitialized -> `initialized:false`, `fresh:false`; initialized no optimizations -> omitted field, reason `missing`; per-field freshness (added/removed/changed/lastModified-only/schema-changed); field shape (`value`, `freshness`, ordered `reasons`); aggregate fresh; `SpecNotFoundError`; factory.

### Implementation Status

src/application/use-cases/get-persisted-spec-optimizations.ts: :58-61 parse; :64-66 SpecNotFound; :68-71 uninitialized result; :73-77 current artifact state via `artifactMeta(includeHash)` over `scope:'spec'` artifacts (:155-170); :119-145 field result (filtered/missing/fresh/stale via `classifyOptimizationFieldFreshness`); :94-99 aggregate (`>0 && every fresh`).
Note: for a requested-but-absent field, the code returns `{freshness:'missing', reasons:['missing']}` as a field entry (:129-132), whereas spec text says the field is "omitted from the result ... annotated with reason `missing`" and the field-shape requirement says freshness is `'fresh' | 'stale'`. Ambiguous spec: field is not literally omitted.

### Discrepancies

- D13 LOW (not in summary table above; counted below): `freshness: 'missing'` is a third value not in spec's `'fresh'|'stale'` (field-shape req.) and the field is present, not omitted. Spec drift (spec should define `missing` shape) vs code bug (omit field, report reason elsewhere). Test at :39 asserts current behavior.
- Freshness domain service is in src/domain/services/spec-optimization-freshness.ts (test/domain/services/spec-optimization-freshness.spec.ts, 2.2K) – reasons order/`lastModified` handling not re-verified line by line.

### Test Coverage (test/application/use-cases/get-persisted-spec-optimizations.spec.ts)

uninitialized (:26), missing filtered field (:39), initialized with none -> fresh false (:71), invalid specId (:95), bare (:110), unknown workspace (:122).

### Missing Tests

- Field filter with both fields present; omit filter returns both – MISSING.
- All freshness reasons at use-case level (added, removed, changed, lastModified-only fresh, schema-changed) – MISSING here; only possibly in domain freshness spec.
- Ordered multi-reason; empty reasons for fresh – MISSING.
- Aggregate fresh true/false/filtered – MISSING.
- `SpecNotFoundError` – MISSING; no generated-metadata read – MISSING; `'Bad Id'` – MISSING; factory – smoke only.

---

## 7. core:get-persisted-spec-schema

### Implementation Status

src/application/use-cases/get-persisted-spec-schema.ts:34-54: parse (:35-37), SpecNotFound before init check (:43-46), `SpecNotInitializedError` (:48-51), returns exact `persisted.schema` (:53). Compliant.

### Discrepancies

- D10 INFO: unreachable `WorkspaceNotFoundError` branch (:38-41).

### Test Coverage (test/application/use-cases/get-persisted-spec-schema.spec.ts)

not-initialized (:10), invalid specId (:20), bare then NotInitialized (:32), unknown workspace (:42), qualified with lock (:50).

### Missing Tests

- `SpecNotFoundError` precedes `SpecNotInitializedError` (unknown spec) – MISSING.
- Exact schema identity `{name:'default',version:2}` – partially (:50).
- No metadata read – MISSING; `'Bad Id'` quoting; factory smoke only.

---

## 8. core:update-persisted-spec-implementation

### Requirements Summary

Input; spec-ID validation first; file must exist for add (`ImplementationFileNotFoundError`); canonical `workspace:path` + codeRoot confinement (`ImplementationWorkspaceBoundaryError`); add creates/enriches; remove (symbols / whole entry); add creates missing state via `resolveInitialPersistedDependsOn`; remove vs missing no-op; patch helper + `expectedRevision`; conflict; `SpecNotFoundError`; result; factory.

### Implementation Status

src/application/use-cases/update-persisted-spec-implementation.ts: :85-91 parse + readOnly guard; :93-96 SpecNotFound; :103 `_normalizeFile` (:209-224); :104 read; :106-115 add existence check; :117-122 missing-state; :124-136 patch + write w/ `expectedRevision: current.originalHash`; :148-183 create path (`expectedRevision:null`, `created:true`); link merge in `_shared/apply-persisted-implementation-mutation.ts` (not re-read).

### Discrepancies

- D2 MEDIUM (pre-existing, not in this change's diff): :219 `absolute.startsWith(path.resolve(codeRoot))` accepts sibling directories sharing a prefix (`/repo/core` vs `/repo/core-evil/x`). And the qualified branch (:210-216) only compares workspace name; `core:../../etc/passwd` is normalized to `core:../../etc/passwd` and then existence-checked via `path.resolve(codeRoot, relativePath)` (:111) with no confinement. Spec: out-of-codeRoot MUST throw `ImplementationWorkspaceBoundaryError`. Code bug vs spec: spec is clear -> code bug (unless an out-of-scope earlier layer normalizes). Also `file.includes(':')` treats Windows drive paths (`C:\x`) as workspace-qualified (cross-platform convention spec concern).
- D9 LOW: read of persisted state precedes file-existence check; harmless.
- D12 INFO.

### Test Coverage (test/application/use-cases/update-persisted-spec-implementation.spec.ts)

missing file add (:33), invalid specId before repo (:50), unknown workspace (:68), bare->default before file checks (:81).

### Missing Tests

- Boundary error (absolute outside, `../`, prefix sibling, qualified `core:../x`) – MISSING (and would expose D2).
- Nested path normalized to forward slashes – MISSING.
- Add symbols to file-level link; add without symbols leaves symbol entries; remove symbols; remove last symbol; remove whole entry – MISSING (maybe covered in `_shared` helper tests; use-case level MISSING).
- Add against lock-less state: initial base via resolveInitialPersistedDependsOn, `created:true` – MISSING.
- Remove against missing state no-op, `writePersistedState` not called – MISSING.
- `expectedRevision` observed hash / `null`; `ArtifactConflictError` – MISSING.
- `SpecNotFoundError`; readOnly rejection – MISSING.
- Factory (`files`, `workspaces`, `initializePersistedSpecState`) – smoke only (test/composition/use-cases/update-persisted-spec-implementation.spec.ts 729B).

---

## 9. core:update-persisted-spec-optimizations

### Implementation Status

src/application/use-cases/update-persisted-spec-optimizations.ts: strict Zod schema :23-64 (strict root, strict `set`, nonempty `clear`, enum names, exclusivity via superRefine); `InvalidInputError` mapping :105-124; :163 validation before any I/O; :165-180 parse/readOnly/lookup; :182-185 clear-vs-missing no-op; :193 artifact state (via `artifactMeta`, normalized/sorted at :232 via `normalizeArtifactState`); :196-215 create via `resolveInitialPersistedDependsOn`; :224-241 set/clear per-field; :243-247 omit empty block (`null` patch); :261-263 `expectedRevision` hash/null; :265-281 projection result.

### Discrepancies

- D5 LOW: spec Input contract says `specId` "non-empty string" and Zod rejects "missing or empty `specId`" with `InvalidInputError`; schema uses `z.string()` (no `.min(1)`), so `''` falls through to `parseSpecId` -> `InvalidSpecIdError` (test :330 asserts this), matching the "Spec ID validation / Empty spec ID rejected" scenario. Spec is internally contradictory: fix spec (drop "non-empty"/"empty" from Zod contract) or add `.min(1)` and change scenario. Same-ID-scenario precedence favors current behavior.
- Missing `specId` (undefined) correctly -> InvalidInputError via Zod (:25-30).

### Test Coverage (test/application/use-cases/update-persisted-spec-optimizations.spec.ts)

clear no-op on missing state (:61), schema recorded from persisted state (:73), partial clear retains baseline (:103), absent-field clear no-op (:127), last-field clear omits block (:150), invalid specId (:316), empty specId -> InvalidSpecIdError (:330), bare->default (:344), unknown workspace (:355). Composition test test/composition/use-cases/update-persisted-spec-optimizations.spec.ts (2.7K) exists – covers resolver deps (not read in detail).

### Missing Tests

- Strict-input rejection matrix (unknown root/set key, non-string value, empty set, empty clear, both set+clear, neither, non-array clear, non-object input) with no ports touched – lines 160-315 may hold these (describe/it listing only matched 5+4 titles; `it.each` blocks not detected). Verify; treat as POSSIBLY COVERED.
- Set captures fresh baseline per field / unchanged field retains baseline – MISSING (only :73 schema).
- Recorded schema = effective project schema when creating – MISSING.
- First set creates state through `resolveInitialPersistedDependsOn`, `created:true`, `expectedRevision:null` – MISSING.
- `ArtifactConflictError`; `SpecNotFoundError`; readOnly – MISSING.
- Result `created:false` for existing; result omits `optimizations` after last clear – MISSING (written-state asserted at :150, result only partly).
- Real-repository round-trip of partial and final clear – MISSING.

---

## 10. core:update-persisted-spec-schema

### Implementation Status

src/application/use-cases/update-persisted-spec-schema.ts: :77-83 parse + readOnly; :85-88 SpecNotFound before init; :90-93 `SpecNotInitializedError`; :95 `getActiveSchema.execute({mode:'ref', ref})`; :102-112 same-schema no-op (`changed:false`, no write, before dependency validation); :114-127 extraction + `PersistedSchemaDependencyConflictError`; :129-135 state constructed directly (no `applyPersistedSpecStatePatch`), `expectedRevision: current.originalHash`; :136-141 result.

### Discrepancies

- D1 MEDIUM: spec "Loading and parsing declared artifacts under the target schema": MUST load current artifacts and verify they parse under the target schema; parse failure aborts with typed error. `_extractDependsOn` (:154-189) returns `undefined` immediately when the target schema declares no `metadataExtraction().dependsOn` (:161-163), so no parse verification occurs at all for such schemas (the common case for "preserve dependsOn"), and artifacts whose format has no parser are silently skipped (:171). No scenario in code or tests asserts the "parse failure aborts" scenario. Spec drift (relax: only verify when dependency extraction exists) vs code bug (always run `extractMetadataFromSpecArtifacts`/parse). Spec text is unambiguous -> likely code bug.
- D11 INFO order-independent equality.

### Test Coverage (test/application/use-cases/update-persisted-spec-schema.spec.ts)

never creates a lock (:25), invalid specId (:38), bare then NotInitialized (:56), unknown workspace (:69).

### Missing Tests

- Entire happy path: reassignment success (`changed:true`, new schema, preserved implementation/optimizations verbatim) – MISSING.
- Same-schema no-op (no write, `changed:false`, conflict validation skipped) – MISSING.
- Ref-mode resolution (`{mode:'ref', ref}`, no project fallback) – MISSING.
- Parse failure aborts w/o mutation – MISSING (and D1).
- Dependency preservation when no extraction; extracted equal -> proceeds; extracted differs -> `PersistedSchemaDependencyConflictError` – MISSING.
- Optimizations become stale (`schema-changed`) after reassignment – MISSING.
- `expectedRevision`; `ArtifactConflictError`; `SpecNotFoundError` before init; readOnly – MISSING.
- Factory (`specs`, `getActiveSchema`) – smoke only.

---

## Counts

Discrepancies by severity: HIGH 0 | MEDIUM 3 (D1, D2, D3) | LOW 7 (D4, D5, D6, D7, D8, D9, D13) | INFO 3 (D10, D11, D12).

Test posture: update-spec-deps and spec-lock/parse layer well covered; get-persisted-_ and update-persisted-_ (deps/impl/opt/schema) have only ID-validation + a few behavior tests; update-persisted-spec-schema and update-persisted-spec-implementation happy paths are essentially untested at use-case level; all config-factory scenarios rely on smoke tests (type-only) except optimizations.
