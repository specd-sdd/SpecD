# Partial compliance audit: core persisted/metadata specs (change support-commas-in-names)

Scope: core:update-implementation-tracking, core:update-persisted-spec-implementation, core:update-persisted-spec-optimizations, core:update-persisted-spec-schema, core:generate-metadata, core:validate-specs, core:preview-spec, core:spec-metadata.
Method: change deltas (deltas/core/\*) were used as the merged spec delta source (spec-preview output was retrieved and sized but the delta YAML is the authoritative statement of what changed); implementation read in packages/core/src; tests in packages/core/test. Read-only; no code/spec edits. Graph tools not used (grep/read fallback; rtk rewrote grep output, so line numbers were taken from direct reads).

Shared implementation facts

- `parseSpecId` (packages/core/src/domain/services/parse-spec-id.ts) is the single validator: blank -> InvalidSpecIdError; bare -> `default:`; segment regex `^[a-z0-9_][a-z0-9_-]*$` (so `a,b`, `Bad Id`, backslashes, Windows device names rejected); workspace regex `^[a-z][a-z0-9-]+$` (>=2 chars); unknown workspace -> WorkspaceNotFoundError(name,{specId,known}) message quotes full specId. InvalidSpecIdError message quotes full original value.
- `toLogicalFilePath(file, platform)` (to-logical-file-path.ts): `\` -> `/` only on win32; isolated helper with platform param.

---

## 1. core:update-implementation-tracking

Requirements summary

- Input contract: `file`, `files` (each entry a whole name), `specId` validated+normalized with parseSpecId and configured workspaces before any mutation (InvalidSpecIdError / WorkspaceNotFoundError).
- File names are whole names: no split/trim/case-fold; failure quotes full value (`Implementation file "a,b.md" does not exist`).
- Windows hosts normalize `\` to `/` (only alteration), isolated helper, same for every action.
- Multi-file mutations all-or-nothing (validate all, then apply).
- Constraints: raw project-relative paths, never split/trimmed.

Implementation status: COMPLIANT (with minor notes).

- update-implementation-tracking.ts: builds list from `files` ?? [`file`], maps `toLogicalFilePath(entry, this._platform)`, no split/trim. specId parsed with `{workspaces: specRepositories.keys()}` inside the mutate callback before any entity mutation. `Promise.all(validate)` precedes the apply loop, so a failing 4th entry leaves entity untouched. ImplementationFileNotFoundError message quotes whole name (domain error: `Implementation file "${file}" does not exist`).
- Platform injected via constructor (default process.platform); composition wires it.

Discrepancies

1. LOW (code-extra / spec silent): `rawFiles` is deduplicated with `new Set(...)`. Spec says "handles exactly two files" for two inputs and says nothing about dedup; a caller passing the same name twice silently gets one. Harmless but undocumented; consider a sentence in spec ("duplicates collapse") or drop the Set. Verdict: spec incomplete rather than code wrong.
2. LOW (spec vs code): spec Input contract limits `files` to `ignore`/`resolve`/`unresolve`; code accepts `files` for every action including `add`/`remove` (and tests rely on `add` with `files`, e.g. "accepts an SDK-style files array", "normalizes a win32 batch"). Spec-wrong: spec text should say `files` applies to all file-based actions (CLI/MCP already pass arrays for add). Also the spec's scenario "Normalization applies to batches and every action" itself implies all actions.
3. LOW (code vs spec): when `specRepositories` is undefined the code calls `parseSpecId(input.specId)` without workspace check, so WorkspaceNotFoundError cannot occur; spec says "the configured workspaces". Only reachable by direct construction without repos (composition always passes them) - acceptable, note as optional-param looseness.
4. LOW: validation uses `Promise.all`, so when several entries fail, which typed error surfaces depends on I/O timing, not entry order. Spec only requires "the typed error for that entry"; deterministic order (sequential or first-by-index) would be safer for UX/tests.
5. INFO: `files.length === 0` -> `ImplementationFileNotFoundError('')` (message `Implementation file "" does not exist`) for add/remove/ignore/resolve/unresolve with no file. Pre-existing behaviour, spec silent; arguably InvalidInputError would be more accurate.
6. INFO: `start` with a `specId` is not validated (spec: "link mutations" only) - consistent.

Test coverage (packages/core/test/application/use-cases/update-implementation-tracking.spec.ts)

- Comma name on ignore (scenario "Name with a comma"), quoted missing name `a,b.md`, leading/trailing spaces, quote/backslash/non-ASCII on linux, SDK files array, invalid specId (Bad id, batch add atomic), bare specId normalization, unknown workspace, win32 normalization (resolve, batch, comma, linux backslash preserved), four-file batch with missing fourth. All named scenarios have a test.
  Missing tests
- "All valid files applied together in one persisted mutation": no assertion that a single `mutate`/save happens (only end state checked).
- Mixed failure ordering (two failing entries); duplicate names in `files`.
- Spec scenario "Missing name is reported whole" uses `resolve` with `files: ['a,b.md']`; test uses `ignore` with `file` (equivalent path but not the literal scenario).
- Spec scenario uses long real name with em-dash/comma for ignore; test COMMA_NAME presumably equivalent (not verified literal).
- Atomicity at persistence level (apply-phase throw, e.g. remove of unlinked) not tested.

Summary counts: requirements 4 + constraints; scenarios ~17; fully implemented 4/4; discrepancies 0 high, 0 medium, 4 low, 2 info; scenarios without test (strict) 1-2.

---

## 2-4. core:update-persisted-spec-implementation / -optimizations / -schema (identical delta)

Requirements summary

- Spec ID validation: before workspace/schema resolution, artifact reads, or persisted I/O, validate+normalize specId with parseSpecId + configured workspaces; bare -> `default:`; result specId fully-qualified; InvalidSpecIdError / WorkspaceNotFoundError quoting full original value; nothing written; adapters do no validation.
- Scenarios: empty rejected before any repo access; `Bad Id` rejected quoting it; `nope:auth/login` -> WorkspaceNotFoundError; bare `_global/architecture` -> `default:_global/architecture` in result; qualified `core:storage` accepted.

Implementation status: COMPLIANT for all three.

- implementation: execute() first statement is `parseSpecId(input.specId,{workspaces: this.specRepositories.keys()})`; `specId` (normalized) used for SpecNotFoundError, result, and persisted-state patch metadata; `normalizedInput` passed to `_createAndMutate`.
- optimizations: zod input schema relaxed from `z.string().min(1)` to `z.string()` so empty specId reaches parseSpecId and yields InvalidSpecIdError (not InvalidInputError) - correct. parse happens after zod shape validation but before any repository/schema access. Normalized specId used everywhere incl. result and `getActiveSchema` is not called on invalid ID (tested).
- schema: same pattern; SpecNotInitializedError / PersistedSchemaDependencyConflictError use normalized id.

Discrepancies

1. LOW (code readability, not behavior): after parseSpecId an additional `repo === undefined -> WorkspaceNotFoundError(workspace)` branch remains in all three; it is now unreachable (parseSpecId already throws with known workspaces). Dead code; remove or keep as defense.
2. LOW (JSDoc): `@throws` lists omit `InvalidSpecIdError` in all three execute() docblocks (lint/doc drift against docs rule).
3. INFO: WorkspaceNotFoundError thrown by parseSpecId includes `in spec ID '<full>'` so the "quote full original value" requirement is met.
4. INFO: optimizations: ordering relative to zod validation means a non-string specId yields InvalidInputError rather than InvalidSpecIdError - acceptable.

Test coverage

- implementation spec: empty specId + no `get`/`writePersistedState` spy calls (OK), unknown workspace (`unknown:auth/login`), bare specId reaches ImplementationFileNotFoundError (proves normalization indirectly).
- schema spec: `Login` invalid + no repo calls, bare id reaches SpecNotInitializedError, unknown workspace.
- optimizations spec: `Core/Foo`, empty, bare -> asserts `result.specId === 'default:auth/login'`, unknown workspace.
  Missing tests
- `Bad Id` literal / assertion that the error message quotes the full original value (all three).
- Qualified `core:storage` accepted unchanged scenario (non-default workspace success path) in implementation and schema specs (optimizations uses only default).
- implementation & schema: no test asserts the RESULT `specId` is `default:...` for a bare input on a success path (only error-type proxy). Weak vs scenario "any specId in the result is default:\_global/architecture".
- No test that write helpers receive the normalized specId (patch metadata).
- Unknown workspace tests do not assert zero repository writes.

Summary counts (each): requirement 1/1 implemented; discrepancies 0 high, 0 medium, 2 low, 2 info; scenario tests: schema/implementation ~3-4 of 5 fully asserted, optimizations 4-5 of 5.

---

## 5. core:generate-metadata

Requirements summary: Spec resolution validates+normalizes via parseSpecId and configured workspaces; InvalidSpecIdError before any repository lookup; unknown workspace -> WorkspaceNotFoundError; SpecNotFoundError otherwise. Scenarios: `Bad Id` rejected; bare `_global/architecture` -> workspace default.

Implementation status: COMPLIANT.

- generate-spec-metadata.ts: `listWorkspaces.execute()` is called, then `parseSpecId(input.specId,{workspaces})`; normalized `specId` used for SpecNotFoundError and passed into dependsOn/implementation resolution (resolveCanonicalDependsOn etc.).

Discrepancies

1. LOW (ordering vs spec wording): workspace listing (`ListWorkspaces`) happens before syntactic validation; spec says InvalidSpecIdError "before any repository lookup". No SpecRepository access occurs first so it is satisfied; but a syntactically bad ID costs a workspace listing. Cheap improvement: validate syntax first, then workspaces. Spec-ok / code could be tighter.
2. LOW: `ws === undefined -> WorkspaceNotFoundError` branch after parse is now effectively unreachable.

Test coverage: empty specId (+no repo `get` spy), bare id resolves (asserts metadata defined and hasExtraction false only), unknown workspace.
Missing tests: literal `Bad Id` (malformed vs empty); assertion that bare ID resolves to workspace `default`/path `_global/architecture` (current test just shows success); normalized specId propagated to dependsOn/implementation provenance.

Summary: 1 requirement implemented; 0 high/medium, 2 low; 2 scenario tests weak/partial.

---

## 6. core:validate-specs

Requirements summary: Single-spec mode: `specPath` bare or `workspace:capPath`; parseSpecId with workspaces -> InvalidSpecIdError; unknown workspace -> WorkspaceNotFoundError; SpecNotFoundError. Scenarios: `ws:` rejected; bare resolves to default; `auth/a,b` -> InvalidSpecIdError quoting it (no comma split).

Implementation status: COMPLIANT. validate-specs.ts: `parseSpecId(input.specPath,{workspaces:this._specs.keys()})`; SpecNotFoundError uses normalized specId. Verified `ws:` -> empty capPath -> InvalidSpecIdError; `auth/a,b` -> segment `a,b` fails regex -> InvalidSpecIdError whose message contains `auth/a,b`.

Discrepancies

1. LOW: unreachable `specRepo === undefined -> WorkspaceNotFoundError` branch after parse (same as above).
2. INFO: error for comma case reports reason "segment 'a,b' is invalid" (quotes full value in message prefix) - satisfies spec.

Test coverage: validate-specs.spec.ts: unknown workspace (two tests), `''` and `auth/a,b` -> InvalidSpecIdError with no repo `get`, bare specPath resolves and passes (totalSpecs 1).
Missing tests: literal `ws:` case; assertion on error message quoting `auth/a,b`; assertion that the reported validation entry uses `default:` qualified ID for a bare input (only counts asserted).

Summary: 1 requirement implemented; 0 high/medium, 1 low; scenarios 3/3 behaviorally covered, 2 weakly asserted.

---

## 7. core:preview-spec

Requirements summary: Input: bare or qualified specId; Spec ID validation: MUST validate+normalize before any other work (InvalidSpecIdError / WorkspaceNotFoundError quoting original), then check membership of normalized id in change.specIds (SpecNotInChangeError); Spec Dependencies add core:spec-id-format. Scenarios: `Bad Id` rejected before membership check; bare normalized then matched against `default:auth/login`; `nope:` -> WorkspaceNotFoundError.

Implementation status: COMPLIANT. preview-spec.ts parses first (before `_changes.get`), compares normalized id to `change.specIds`, uses normalized id for artifact lookup, warnings and result.specId. Spec dependency on core:spec-id-format is in the delta (spec text), and spec-id-format is a direct dependency (consistent).

Discrepancies

1. LOW (spec wording vs code): spec says "before any other work"; code also validates before ChangeNotFoundError, i.e. an invalid id on a nonexistent change yields InvalidSpecIdError (stricter ordering, matches spec). Fine.
2. LOW: workspace set used for validation is `this._specs.keys()` (spec repositories), which is the configured workspaces - fine. CLI-level concerns are outside this spec.
3. INFO: Error message for SpecNotInChangeError now quotes the normalized id, not the original (e.g., bare `auth/login` reported as `default:auth/login`). Arguably better; spec silent on which form.

Test coverage: preview-spec.spec.ts: empty and `Core/Foo` invalid (no spec repo `get`), bare normalized (result.specId default:...), qualified accepted, unknown workspace before change lookup (`changes.get` not called), invalid before change lookup.
Missing tests: literal `Bad Id`; bare ID NOT in change -> SpecNotInChangeError quoting normalized id; message quoting of original value for WorkspaceNotFoundError.

Summary: 2 requirements implemented; 0 high/medium, 2 low, 1 info; scenarios 3/3 covered.

---

## 8. core:spec-metadata

Requirements summary (delta): `strictSpecMetadataSchema` (PersistSpecMetadata guard) requires `dependsOn` to be an array of fully-qualified valid spec IDs per core:spec-id-format (bare/empty/malformed rejected; schema does not keep its own copy of regexes); persistence rejected with typed validation error and nothing written; lenient read path still accepts bare entries and file treated as regenerable; spec dependency on core:spec-id-format added.

Implementation status: COMPLIANT for schema-level behavior.

- parse-metadata.ts: removed private WORKSPACE_RE/CAP_SEGMENT_RE; new `qualifiedSpecIdString = z.string().refine(isFullyQualifiedSpecId)` (delegates to parseSpecId; requires `:`). Used for strict `dependsOn`, and for strict `implementation.files[].specId` / `symbols[].specId` (EXTRA: beyond the delta text, which mentions only dependsOn). Lenient `specMetadataSchema` and `permissiveSpecMetadataSchema` now use plain `z.string()` for dependsOn / implementation specIds, so existing metadata with bare entries still reads. PersistSpecMetadata throws MetadataValidationError before `writeMetadataSnapshot`, so no file written.

Discrepancies

1. LOW (spec incomplete): strict schema also enforces fully-qualified IDs for implementation file/symbol specIds; spec requirement lists only `dependsOn`. Behavior is consistent in spirit (same rule) - spec should mention it, or code should limit. Spec-wrong (incomplete).
2. LOW: `isFullyQualifiedSpecId` calls parseSpecId without workspace set, so strict schema validates syntax only, not workspace existence. Matches spec ("satisfying the rules of core:spec-id-format") - OK.
3. LOW (behavioral risk to verify): the lenient read of a metadata.json with bare/invalid dependsOn is claimed "treated as regenerable"; I found tests only for the parse step (`still accepts bare dependsOn entries`), not for the freshness/regeneration treatment in the read path (spec-repository / CompileContext fallback).
4. INFO: previously `specIdString` accepted bare IDs even in strict mode; any producer of bare dependsOn (extractors) must now qualify. GenerateSpecMetadata normalizes via resolveCanonicalDependsOn; test suites pass per caller.

Test coverage: parse-metadata.spec.ts: bare accepted by lenient parse, qualified accepted, invalid id rejected, bare rejected, empty rejected, underscore-workspace rejected, qualified underscore segment accepted.
Missing tests

- PersistSpecMetadata (persist-spec-metadata.spec.ts has ONLY the happy path): no test that bare/empty `dependsOn` is rejected with MetadataValidationError and that `writeMetadataSnapshot` is NOT called ("no file is written").
- No test that an existing metadata.json with a bare entry reads through the repository/CompileContext path and is treated as stale/regenerable.
- No test for strict implementation specId rejection (extra behavior).

Summary: 2 requirements (structural validation; dependency declaration) implemented; 0 high/medium, 3 low, 1 info; 2 of 4 scenarios have only schema-level (not persistence-level / read-path) coverage.

---

## Cross-spec / global consistency

- \_global/cross-platform: toLogicalFilePath is isolated, platform-parameterized, forward-slash logical paths - consistent. `\` in spec IDs is rejected by parseSpecId with an actionable reason - consistent with spec-id-format (path separator `/` only).
- core:spec-id-format direct dep: parser behaviour matches Canonical format, Bare shorthand, Unknown workspace, Windows device names. Note workspace regex requires >= 2 chars (`[a-z][a-z0-9-]+`); verify the spec-id-format / config specs state the same minimum (not in this audit's scope; flagged for the spec-id-format auditor).
- All eight use cases pass raw strings to core; no adapter-side validation was inspected here (CLI/SDK audited separately).

## Overall counts (this partial)

- Specs audited: 8. Requirements implemented: 8/8 (all delta requirements).
- Discrepancies: 0 high, 0 medium, ~17 low, ~7 info. No spec-wrong vs code-wrong conflicts that block; the spec-wrong items are #2 (files for all actions) and #1 (dedupe) in update-implementation-tracking, and spec-metadata implementation specId strictness.
- Top test gaps: (1) PersistSpecMetadata rejection/no-write test for bare/empty dependsOn; (2) bare-spec-ID success paths in update-persisted-spec-implementation/schema and generate-metadata do not assert normalized `default:` result; (3) no `Bad Id`/`ws:` literal scenarios and no message-quoting assertions; (4) all-or-nothing "one persisted mutation" assertion; (5) lenient read -> regenerable path.
