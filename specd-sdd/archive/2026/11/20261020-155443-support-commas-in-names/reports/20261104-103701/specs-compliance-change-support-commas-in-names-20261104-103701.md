# Spec Compliance — change support-commas-in-names

Mode: change. Scope: 29 change specs. Build, typecheck, eslint, all package tests pass (code-graph flaked once under turbo load; passes alone 1832/1832).

## Summary

| Batch                  | HIGH | MEDIUM        | LOW | INFO |
| ---------------------- | ---- | ------------- | --- | ---- |
| core A (7 specs)       | 0    | 2 root causes | ~13 | -    |
| core B (10 specs)      | 0    | 3             | 7   | 3    |
| core C (4 specs)       | 0    | 0             | 6   | 3    |
| cli + skills (7 specs) | 0    | 1             | 9   | 2    |

## Detailed Findings

---

# Partial compliance audit core-a — change `support-commas-in-names`

Scope: core:update-implementation-tracking, core:edit-change, core:spec-id-format, core:create-change, core:config, core:config-loader, core:workspace.
Method: merged deltas read from `deltas/core/<spec>/{spec,verify}.md.delta.yaml` + merged scenarios file; code in packages/core/src; tests in packages/core/test (not re-run; reported passing). Note: `changes spec-preview` needs the spec id without the `core/` path form (`core:update-implementation-tracking`); I used the delta files directly.

Legend: severity HIGH (behaviour contradicts a requirement) / MEDIUM (requirement partially met or cross-spec contradiction) / LOW (wording/edge/test-only).
For each discrepancy: (A) = spec drift, (B) = code bug.

---

## 1. core:update-implementation-tracking

### Requirements Summary

- Input contract: `name, action, file?, files?, specId?, symbols?`; `files` entries are whole names, duplicates collapsed; `specId` validated/normalized with `parseSpecId` + configured workspaces before any mutation (InvalidSpecIdError / WorkspaceNotFoundError).
- File names are whole names: no split/trim/case-fold; errors quote the full original value; hosts pass arrays.
- Path separators normalized on Windows hosts only, in one isolated helper taking platform as parameter, identical for every action/host.
- Multi-file mutations all-or-nothing (validate all, then apply).
- Constraints (never splits or trims).

### Implementation Status: IMPLEMENTED

- `files`/`file` merge + de-dup: `application/use-cases/update-implementation-tracking.ts:112-120` (`new Set(...)`).
- No split/trim/case-fold: the only transform is `toLogicalFilePath` (`domain/services/to-logical-file-path.ts:10-15`: `platform === 'win32' ? replaceAll('\\','/') : file`). Platform injected via constructor (`:70,86,119`). OK.
- specId validate/normalize: `:122-127` (`parseSpecId(..., {workspaces: this._specRepositories.keys()})`), runs inside `mutate` callback before any entity mutation, so throw => nothing persisted.
- All-or-nothing: validation loop `:137-139` completes before apply `switch` `:141-157`.
- Error quoting: `ImplementationFileNotFoundError` message `Implementation file "${file}" does not exist` (`domain/errors/implementation-file-not-found-error.ts`).
- Composition passes `specRepositories` (`composition/use-cases/update-implementation-tracking.ts:96-101`); platform defaults to `process.platform`.
- Hosts: CLI passes arrays (`cli/src/commands/change/implementation.ts:70,94,116,136,156`), no comma splitting.

### Discrepancies

1. LOW (A or B) — Error quotes the _normalized_ name, not the original, on Windows. Spec "File names are whole names": "MUST quote the full original value"; spec "Windows" says conversion is the only alteration. Code (`:118-120,201,218`) throws with the post-`toLogicalFilePath` value, so `a\b.ts` is reported as `a/b.ts` on win32. (A) clarify "original after separator normalization", or (B) carry original value to errors. No behaviour test for it.
2. LOW (A) — When both `file` and `files` are supplied, `files` wins and `file` is silently ignored (`:112-117`). Spec only says `file` "required ... unless `files` is given"; interface doc says "file remains the compatibility primary". Undefined by spec; add a sentence or union them.
3. LOW (B, pre-existing) — `add`/`remove` without `specId` throws `ChangeNotFoundError(change.name)` (`:179-181,257-259,287-289`), misleading error type. Not in delta; spec silent.
4. LOW (A) — specId workspace check is skipped when `specRepositories` is undefined (`:124-126`, constructor param optional). Spec says "configured workspaces". Composition always supplies them, so practical impact nil for hosts; direct constructor use would silently accept an unknown workspace.
5. LOW (A) — specId is validated for every non-`start` action, including `ignore/resolve/unresolve` when a `specId` is passed (spec says "for link mutations"). Harmless stricter behaviour.

No HIGH/MEDIUM.

### Test Coverage (packages/core/test/application/use-cases/update-implementation-tracking.spec.ts)

Covered: whole-name comma ignore (`:527`), missing comma name quoted (`:544`), leading/trailing spaces (`:558`), quote/backslash/non-ASCII on linux (`:574`, one combined name), SDK files array (`:590`), win32 resolve (`:613`), linux backslash (`:637`), win32 comma + add (`:659`), win32 batch add (`:683`), four-file missing fourth (`:709`), invalid specId (`:486`), bare specId normalized (`:506`), unknown workspace (`:441`), batch atomic invalid specId (`:460`), batch resolve/unresolve/ignore atomicity (`:132,154,175`).

### Missing Tests

- "Equivalent array input through the SDK": test (`:590`) uses `src/a.ts`,`src/b.ts`; no name containing a comma (`'b, c.md'`) and no assertion that exactly two files are handled. PARTIAL.
- "Quote, backslash, and non-ASCII names preserved": one combined name rather than three separate names; PARTIAL (low).
- "Comma names unaffected by separator normalization": test uses `add`, not `ignore` as in the scenario. PARTIAL.
- "Normalization applies to batches and every action": only `add` exercised on win32; `ignore/resolve/unresolve/remove` batch not tested on win32. PARTIAL.
- "All valid files applied together ... one persisted mutation": no test asserts both ignored files in one `mutate` call. MISSING.
- No direct unit test for `toLogicalFilePath` (no file in test/domain/services; grep finds no references). LOW.
- Duplicate collapse (`files: ['a','a']`) untested. MISSING.
- Error quoting of the full original value on win32 (discrepancy 1) untested.
- "Invalid specId rejected before any mutation": asserts rejection; confirm `change` untouched assertion (present at `:486` area) — OK.

Counts: Scenarios in merged spec (new + existing) relevant to this change: 14 new + 2 specId; covered fully 8, partial 5, missing 2 (one-persisted-mutation, duplicate collapse not a scenario).

---

## 2. core:edit-change

### Requirements Summary

- Input contract: `addSpecIds`/`removeSpecIds` whole spec IDs, never split.
- Spec ID validation: every `addSpecIds` entry `parseSpecId` + workspaces, stored qualified; InvalidSpecIdError/WorkspaceNotFoundError quoting the full value; nothing persisted if any invalid. `removeSpecIds` not syntax validated -> SpecNotInChangeError; valid entries normalized before matching, otherwise compared as given. Spec need not exist.
- ReadOnly workspace rejection moved into use case: one line per offender, trailing sentence, no remediation, removal exempt, atomic.
- Constraints; dependency on core:spec-id-format. Existing scenarios re-qualified (`default:` prefixes).

### Implementation Status: IMPLEMENTED

- Validation: `application/use-cases/edit-change.ts:103-106` (`parseSpecId(id, {workspaces})`) before `mutate` (`:151`); no persistence on failure.
- ReadOnly: `:108-121`; message lines `Cannot add spec "<id>" to change — workspace "<ws>" is readOnly.` + `\n\nReadOnly workspaces are protected: their specs and code cannot be modified by changes.` matches spec text exactly; no remediation.
- Removal: `:124-133` try-parse-else-as-given; `SpecNotInChangeError(id, name)` at `:165`.
- Spec-existence not checked (`_specExists` is only used for scaffold).
- CLI passes raw arrays and holds no workspace/ownership logic in edit (cli/src/commands/change/edit.ts; verified no parseSpecId there).

### Discrepancies

1. LOW (A) — Constraint "Actor identity is only resolved when a persistence-worthy change occurs": `await this._actor.identity()` runs at `:149` for any request that is not a total no-op, including an idempotent add (no effective change). Pre-existing wording; spec could say "when an edit is requested".
2. LOW (A, pre-existing) — `EditChangeInput` has `invalidationPolicy` (`:35-36`) but "Input contract" lists only name/addSpecIds/removeSpecIds/description. A separate "Invalidation policy edits" requirement exists, so the contract list is incomplete.
3. LOW (B) — Duplicate entries in `removeSpecIds` (`['a','a']`) make the second throw `SpecNotInChangeError` (`:162-168`); duplicate `addSpecIds` are tolerated. Spec silent; inconsistent.
4. LOW (B) — Removal normalization ignores unknown workspaces by falling back to the raw id (`:127-131`), per spec ("compared as given"). Fine, noted only.

No HIGH/MEDIUM.

### Test Coverage (edit-change.spec.ts)

Covered: invalid segment (`:427`), comma segment (`:438`), unknown workspace (`:448`), bare normalized (`:458`), invalid among valid (`:467`), non-existent spec accepted (`:478`), readOnly one-line-per-offender atomic (`:490`), removal ownership exemption (`:528`), plus pre-existing scenarios.

### Missing Tests

- "Empty ID rejected" (`addSpecIds: ['']`) — MISSING.
- "Invalid ID rejected ... quoting `Bad Id`" and comma test do not assert the message quotes the full value (`auth/a,b`, `Bad Id`); only error class. PARTIAL.
- "Removal entry is not syntax-validated" (`removeSpecIds: ['Bad Id']` -> SpecNotInChangeError quoting it, not InvalidSpecIdError) — MISSING.
- "Removal of a bare ID matches the qualified stored form": test `:528` is titled "normalizes bare remove IDs" but removes the already-qualified `platform:tokens`; a bare ID (`auth/login`) is never removed. MISSING.
- "Adding a readOnly spec": exact string `platform:auth/tokens` and "no remediation" not asserted; "One line per offending spec and nothing applied" lacks the mixed case (`default:auth/register` + two platform specs) — test uses only platform specs. PARTIAL.
- "SDK callers are covered": implicit (use-case level), acceptable.
- "Unknown workspace" test does not assert quoting.
- Pre-existing scenarios without a test in this file (listing from `it(` names): description-only does not invalidate, description+add together, addSpecIds with no effective change, remove-and-add same call, remove-and-re-add same, directory cleanup on removal (unscaffold x3 scenarios), freshest persisted list, execute accepts input/returns result (some may be covered indirectly or in other specs). Possibly outside delta, flag for completeness: "Removing a spec cleans up its scaffolded directories", "Removing multiple specs", "Adding a spec does not trigger unscaffold", "Remove and add in same call", "Remove and re-add the same spec", "Description-only update does not invalidate" — no matching `it(` found.

---

## 3. core:spec-id-format

### Requirements Summary

Canonical format; bare path shorthand (core normalizes, callers pass `defaultWorkspace` for contextual cases); unknown workspace -> WorkspaceNotFoundError when workspace set supplied; Parsing rules (6 steps); Normalization; Workspace name rule `^[a-z][a-z0-9-]+$` + not device name, exposed once as `isValidWorkspaceName`; Capability path segment rule `^[a-z0-9_][a-z0-9_-]*$` + not device name; Syntax validation (empty/blank/`:`/`ws:`/`:path`/empty segment/`.`/`..`/`:`/uppercase/space/comma/device/one-char workspace; backslash never a separator with hint; remove ops do not validate); Single validator (`parseSpecId(id, options?)`, domain, no I/O); Use cases validate/normalize, adapters pass raw; Patterns & schema refs use dedicated parsers, no lenient splitter; Persisted IDs fully qualified (manifest, spec-lock reject; metadata strict write, lenient read).

### Implementation Status: IMPLEMENTED (core), with CLI/SDK residue

- Rules: `domain/services/spec-id-rules.ts:3-24`; device names `windows-device-name.ts:1`.
- `parseSpecId`: `domain/services/parse-spec-id.ts:40-86` (steps 1-6 match; first colon; backslash hint `:63-69`; workspaces Iterable of string|{name} `:11,78-84`; WorkspaceNotFoundError with specId+known `:82`). Domain-only imports (no application types).
- `parseSpecPattern`: `domain/services/parse-spec-pattern.ts:64-111`; used by config validation (`application/ports/config-schema.ts:51`) and matching (`application/use-cases/_shared/spec-pattern-matching.ts:45`).
- Schema reference parser: `infrastructure/fs/schema-registry.ts:23-28` uses `isValidWorkspaceName`, name validated elsewhere.
- Segment rule reused by `SpecPath` (`domain/value-objects/spec-path.ts`), prefix (`config-schema.ts:100-113`), spec-lock/metadata readers (`parse-spec-lock.ts:14`, `parse-metadata.ts:9`).
- Manifest: `infrastructure/fs/manifest-change-loader.ts` `assertQualifiedSpecId` on `specIds` and `specDependsOn` -> `CorruptedManifestError` with value and field path.
- Single copy of the regexes in core: grep confirms only `spec-id-rules.ts` (other `^[a-z][a-z0-9-]*$` hits are keyword/schema-id rules, not workspace rules).

### Discrepancies

1. MEDIUM (B) — CLI validates/normalizes a spec ID itself: `packages/cli/src/commands/change/deps.ts:3,99` calls `parseSpecId(specId,{workspaces}).specId` in the display branch (no use case involved). Contradicts "Use cases validate and normalize" ("Delivery adapters SHALL NOT validate, qualify, or normalize spec IDs") and scenarios "Adapters do not normalize" / "CLI holds no spec ID helper". (B) route through a core/SDK read use case, or (A) carve out read-only display paths in spec and in `cli:change-deps`.
2. MEDIUM (B) — Workspace-name copy in CLI: `cli/src/commands/project/init.ts:188` validates the default workspace id with `/^[a-z][a-z0-9-]*$/` (allows one-character names and device names such as `nul`). Violates "No consumer SHALL keep its own copy of the expression" / scenario "One shared implementation" (though the enumerated consumers list does not include CLI init) and creates a `specd.yaml` the loader then rejects. (B) use `isValidWorkspaceName` from the SDK, or (A) restrict the spec to the enumerated consumers.
3. LOW (A/B) — Lenient splitters exist outside core: `sdk/src/orchestration/build-implementation-review.ts:120` and `core/src/domain/archived-change-index-entry.ts:35-39` (`workspacesFromSpecIds`, exported domain function that splits on the first `:` without validating) and `sdk/.../project-relative-path.ts:34`. Scenario "No lenient generic splitter: there is no exported function that splits a spec ID without validating it" is stated for "the core"; `workspacesFromSpecIds` is arguably such a function (it only takes the prefix; inputs are manifest IDs already validated at load). (A) narrow wording, or (B) reimplement via `parseSpecId`.
4. LOW (B) — `WorkspaceNotFoundError` is declared in two places (`domain/errors/workspace-not-found-error.ts` and a modified `application/errors/workspace-not-found-error.ts`); verify the application one is a pure re-export so `instanceof` works for both import paths (not examined in depth).
5. LOW (A) — Spec says error for backslash "SHALL say that `/` is the only separator"; code emits it only when the backslash is detected per segment, after the device-name check (`parse-spec-id.ts:60-69`). A segment `nul\x` yields the segment text, not a device error, so fine; no gap found. Informational.

### Test Coverage

`test/domain/services/parse-spec-id.spec.ts`, `spec-id-rules.spec.ts`, `parse-spec-pattern.spec.ts`, `value-objects/spec-path.spec.ts`, `parse-spec-lock.spec.ts`, `parse-metadata.spec.ts`, `manifest-change-loader.spec.ts`, `spec-pattern-matching.spec.ts`, config-loader spec.

### Missing Tests

- "Unknown workspace with a workspace set raises the typed error": existing test uses a bare ID and default; no test for `nope:auth/login` with `{workspaces:[default,core]}`, no assertion of code `WORKSPACE_NOT_FOUND`, message quoting `nope:auth/login` and listing `default` and `core`. PARTIAL.
- "Syntax-only validation without a workspace set": no test that `parseSpecId('nope:auth/login')` returns workspace `nope`. MISSING.
- "Nested capability path / only first colon": covered.
- "Space, comma, dot, quote, and backslash rejected": `v1.2` and `auth/"x"` not tested (`.` only via `a/./b`). PARTIAL.
- "Segment may start with digit or underscore but not hyphen": no `parseSpecId` test for `2fa/setup`, `_global/x` success or `-bad/x` rejection (only `isValidCapabilitySegment`). PARTIAL.
- "Valid segments `team/shared_core/api-v2`": MISSING at parseSpecId level.
- "Device name segment" `com1`: only `nul`. LOW.
- "Windows-style path given as a spec ID" (`core:specs\auth\login`): not exactly (only `ws:section\other\id`). LOW.
- "Result always fully qualified": covered by first tests. "Default workspace override": covered.
- "Domain service has no application dependency": no architecture/import test. MISSING (static).
- "Name iterables accepted": array/Set/Map.keys covered.
- "Use case rejects an invalid ID raised through MCP or SDK" `specId: ''` and "Use case stores the qualified form": covered for create/edit; `''` at use-case level MISSING (edit-change, create-change, update-implementation-tracking).
- "CLI holds no spec ID helper": no test; code actually violates (Discrepancy 1).
- "Schema references split into workspace and name": no test located for `#billing:my-schema` / `#my-schema` in `schema-registry.spec.ts` diff (spec shows +49 lines; not inspected line by line). UNVERIFIED.
- "No lenient generic splitter": no test.
- "Patterns validated at load are interpreted identically": covered indirectly via config-loader + pattern-matching tests.
- "Misplaced wildcard rejected" (`a*b`, `a/*/b`, `*/x`): `*/x` not tested in parse-spec-pattern spec. PARTIAL (low).
- "Bare dependency in a lock rejected on read" (`dependsOn.0`): covered (`parse-spec-lock.spec.ts:35-38`).
- "Manifest rejects an invalid ID": covered for `specIds: ['']`; bare ID (`auth/login`) and `specDependsOn` keys/deps not tested. PARTIAL.
- "Metadata written strictly, read leniently": strict schema covered; explicit "bare dependsOn rejected on write but readable" not seen. PARTIAL.
- "Remove operations do not validate syntax": belongs to update-spec-deps; not in scope here.

---

## 4. core:create-change

### Requirements Summary

Input `specIds` whole IDs; Spec ID validation (parseSpecId + workspaces, qualified, nothing created if any invalid, spec need not exist); ReadOnly rejection moved from CLI to use case (message format identical to edit-change); dependency on core:spec-id-format; created event records normalized IDs.

### Implementation Status: IMPLEMENTED

- `application/use-cases/create-change.ts` (execute): `parseSpecId(id,{workspaces})` over all entries -> readOnly check (ownership from `ListWorkspaces`) -> exact message text -> `[...new Set(...)]` -> created event with qualified IDs -> `changes.create`. All before persistence.

### Discrepancies

1. LOW (A) — IDs are de-duplicated (`new Set`) silently; spec silent (reasonable).
2. LOW (A) — Name-already-exists (ChangeAlreadyExistsError) and schema-identity errors are raised before spec ID validation, so an invalid ID on a duplicate name reports the duplicate; spec does not define precedence.

No HIGH/MEDIUM.

### Test Coverage (create-change.spec.ts `:623-760`, `:86`)

Covered: invalid segment + nothing created, comma segment, unknown workspace, bare normalized, one invalid among valid creates nothing, non-existent spec accepted, readOnly one line per offender (platform-only), created event holds qualified IDs (`:86-101`).

### Missing Tests

- Invalid ID error "quoting `Bad Id`" / `auth/a,b` — class only asserted. PARTIAL.
- "Mixed owned and readOnly specs" (`default:auth/login` + `platform:auth/tokens`): MISSING (test uses two platform specs).
- readOnly message first-scenario exact string for `platform:auth/tokens` and "no remediation": partially (individual lines asserted for other ids). The trailing sentence is not asserted in create or edit tests. LOW.
- Empty ID `''` use-case level: MISSING.

---

## 5. core:config

### Requirements Summary

Workspace names and context patterns use shared rules: names per `isValidWorkspaceName`; `prefix` segments follow the segment rule; `contextIncludeSpecs/ExcludeSpecs` parsed by `parseSpecPattern` at load and at match time; qualifier-less pattern keeps contextual meaning via caller-supplied default workspace; unknown workspace in pattern -> warning + no match.

### Implementation Status: IMPLEMENTED

- Names: `infrastructure/fs/config-loader.ts:391-396` (ConfigValidationError).
- Prefix: `application/ports/config-schema.ts:100-113` `PrefixZodSchema` using `isValidCapabilitySegment`; used by `WorkspaceRawZodSchema` (`:140`).
- Patterns: `config-schema.ts:49-58` (`validateContextPattern` -> `parseSpecPattern`), `validateContextPatterns` project + workspace level `:70-98`, invoked at `config-loader.ts` `_buildConfig` (`validateContextPatterns(data, rootConfigPath)`); matching uses `parseSpecPattern(pattern,{defaultWorkspace})` (`spec-pattern-matching.ts:45`), unknown ws warning `:58-66`.

### Discrepancies

1. LOW (A) — `core:config` states contextual defaulting is "at project level `default`, at workspace level the owning workspace, supplied by the caller". `validateContextPattern` calls `parseSpecPattern(pattern)` without default workspace (fine for validation); matching callers supply it — verified for `listMatchingSpecs`; compile-context callers not re-verified.
2. LOW (B) — At match time a pattern that fails `parseSpecPattern` throws `InvalidSpecPatternError` (uncaught in `listMatchingSpecs`) rather than a warning; unreachable for config-loaded patterns, but possible for patterns passed programmatically. Spec silent.

### Test Coverage

`config-loader.spec.ts` (workspace-name rejection `:106`, prefix `Team` `:754`, uppercase `:719`, one-letter qualifier `:1372`), `spec-pattern-matching.spec.ts:95` (unknown workspace warning), `compile-context.spec.ts:1810`.

### Missing Tests

- "Qualifier-less pattern keeps its contextual workspace" (workspace `billing` with `auth/*` -> `billing:auth/*`): `parse-spec-pattern.spec.ts:43` and `spec-pattern-matching` use `default` only; no `billing` case. PARTIAL.
- "Workspace name with one character rejected": covered via it.each `'a'` (`config-loader.spec.ts:106`) — OK.
- "Prefix segment violating the rule" (`prefix: Team`): covered.

---

## 6. core:config-loader

### Requirements Summary

Pattern validation through `parseSpecPattern` (project + workspace level), qualifier/segment rules from spec-id-format with no private copy; Workspace names validated with `isValidWorkspaceName` -> ConfigValidationError; dependency list.

### Implementation Status: IMPLEMENTED (indirect)

- `config-loader.ts:18,391` imports and uses `isValidWorkspaceName`; patterns via `validateContextPatterns` in `application/ports/config-schema.ts`. The loader file itself contains no workspace/segment regex (grep clean).

### Discrepancies

1. LOW (A) — Scenario "Loader keeps no private copy of the expressions: it calls `parseSpecPattern` and `isValidWorkspaceName`". `config-loader.ts` only calls `isValidWorkspaceName` directly; `parseSpecPattern` is called from `application/ports/config-schema.ts`, which the loader consumes. Equivalent behaviour; reword scenario to "through shared helpers".
2. LOW (A) — Order: `validateContextPatterns` (and thus error for pattern `workspaces.Core...`) runs before `workspaces.default` and workspace-name checks (`_buildConfig`). Immaterial.

### Test Coverage

Workspace-name rejection `Core`/`a`/`nul` (it.each at `:106`), leading-digit segment accepted (`:1360`, `auth/2fa`), one-letter qualifier rejected (`:1372`), workspace-level patterns validated (`:1427`).

### Missing Tests

- "Pattern with an uppercase segment rejected" (`core:Auth/*`): MISSING in config-loader spec (only `auth*`, `auth/lo*in` style wildcard errors; uppercase covered only for prefixes and in parse-spec-pattern unit test).
- "Segment with a leading digit accepted" for the qualified form `core:2fa/*`: tested as `auth/2fa`. PARTIAL.
- "Loader keeps no private copy of the expressions": no static test. MISSING (low).
- "Two-character workspace accepted" (`ab` with codeRoot): no test found. MISSING (this scenario lives in core:workspace verify too).

---

## 7. core:workspace

### Requirements Summary

Workspace identity: `^[a-z][a-z0-9-]+$` (>= 2 chars), shared rule, reserved `default`, `root`, device names (whole-name match; `con-foo` legal); Prefix semantics: every segment satisfies segment rule; Workspace-qualified spec IDs: bare = `default:`, resolved by core, unknown ws -> WorkspaceNotFoundError, malformed -> InvalidSpecIdError, adapters do not normalize; constraints.

### Implementation Status: IMPLEMENTED

- Name rule and device names: `spec-id-rules.ts`, `config-loader.ts:391`; `root` rejection `config-loader.ts` ("'workspaces.root' is invalid..."); `default` mandatory.
- Prefix: `PrefixZodSchema`.
- Typed errors in `parseSpecId`.

### Discrepancies

1. MEDIUM (cross-spec/B) — "Delivery adapters pass raw IDs and do not normalize them" is violated by `cli/src/commands/change/deps.ts:99` (see spec-id-format #1). Same issue.
2. MEDIUM (B) — `specd project init` accepts workspace ids the loader rejects (`cli/src/commands/project/init.ts:188`, see spec-id-format #2).
3. LOW (A) — Workspace "Constraints" still say "A change's workspaces are derived ... via parseSpecId()" — consistent. No further issue.

### Test Coverage

Workspace-name rejection (`Core`, `a`, `nul`, `prn`, `aux`, `con`) and acceptance of `con-foo` (`config-loader.spec.ts:106,142,162,216`); `root` rejected (`:2286`); prefix `Team`/uppercase/dot/leading slash/empty (`:649-789`); `isValidWorkspaceName('plugin-agent-claude')` (`spec-id-rules.spec.ts`).

### Missing Tests

- "Two-character workspace name accepted" (`ab`): MISSING.
- "Existing project workspaces remain valid" (`core`, `cli`, `sdk`, `plugin-agent-claude` validated): only `plugin-agent-claude` in unit test; no loader-level test. PARTIAL (low).
- "Prefix segment violating the segment rule" with multi-segment (`team/Shared`): existing tests use `Team` and uppercase; segment-in-middle case covered by logic but untested. LOW.
- "Unknown workspace in a spec ID raises the typed error" / "Malformed spec ID (`ws:`)": covered at parseSpecId and create/edit use-case level.

---

## Cross-spec contradictions flagged

1. spec-id-format / workspace ("adapters do not normalize") vs cli code `change/deps.ts:99` (and possibly the `cli:change-deps` spec, which was not in this audit's scope; check whether it permits the display-mode normalization).
2. spec-id-format "one shared implementation" vs cli `project/init.ts:188` private workspace regex.
3. update-implementation-tracking "quote the full original value" vs win32 normalization of reported name (needs one-line clarification in either spec).
4. edit-change input contract omits `invalidationPolicy` that the same spec defines elsewhere.
5. spec-id-format "no lenient splitter" vs `workspacesFromSpecIds` in `core/src/domain/archived-change-index-entry.ts:35`.
   No contradictions found between create-change/edit-change ReadOnly messages and core:workspace ("must not suggest remediation") — messages match exactly.

## Totals (core-a)

- Discrepancies: HIGH 0, MEDIUM 4 (cli deps normalization counted in spec-id-format and workspace; project init regex counted in both = 2 distinct root causes, 4 mentions), LOW 18.
- Distinct root causes: MEDIUM 2, LOW ~13.
- Missing/partial test items: update-implementation-tracking 7, edit-change ~9 (+6 pre-existing scenarios without `it`), spec-id-format ~14, create-change 4, config 1, config-loader 4, workspace 3.

---

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

---

# Partial compliance: core-c (generate-metadata, validate-specs, preview-spec, spec-metadata)

Change: support-commas-in-names. Read-only audit. Note: `changes spec-preview` rejected `core:core/...` ids; used delta files in `deltas/core/<spec>/` plus code instead. Spec IDs for this change are `core:<name>` style paths (e.g. `core:generate-metadata`), the merged text was taken from the delta YAMLs.

Shared implementation: `packages/core/src/domain/services/parse-spec-id.ts:42-83` (`parseSpecId`: blank check, split at first `:`, workspace rule, empty cap path, `:` in path, per segment empty / Windows device / backslash / `[a-z0-9_][a-z0-9_-]*`, optional workspace-set check -> `WorkspaceNotFoundError`, returns `{workspace, capPath, specId}`); `isFullyQualifiedSpecId` at :91-100; rules in `spec-id-rules.ts`. A comma fails the segment regex, so `auth/a,b` -> `InvalidSpecIdError` whose message is `Invalid spec ID '<value>': ...` (`invalid-spec-id-error.ts:26-28`) i.e. quotes the full value.

---

## core:generate-metadata (Requirement: Spec resolution, modified)

### Requirements Summary

Validate/normalize `specId` with `parseSpecId` + configured workspaces; invalid -> `InvalidSpecIdError`; unknown workspace -> `WorkspaceNotFoundError`; spec missing -> `SpecNotFoundError`; adapters do no own validation.

### Implementation Status: COMPLIANT

- `generate-spec-metadata.ts:101-103` `listWorkspaces` then `parseSpecId(input.specId, { workspaces })`; `:105-110` repo lookup, `SpecNotFoundError` at `:110-112`.
- Parse happens before `specRepo.get`, satisfying "before any repository lookup".

### Scenarios and test coverage

| Scenario                                                         | Status                  | Evidence                                                                                                                                                                        |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid spec ID rejected (`'Bad Id'`)                            | Covered (input differs) | `generate-spec-metadata.spec.ts:~633-645` uses `''` and asserts `repo.get` not called. `'Bad Id'` (space/uppercase segment path) not used                                       |
| Bare spec ID normalized (`_global/architecture` -> default)      | Partial                 | `:~652-668` bare `auth/login` resolves; asserts only that result exists, not workspace `default` / capPath explicitly. `:170-264` is a different (dependsOn normalization) test |
| Unknown workspace -> WorkspaceNotFoundError (existing behaviour) | Covered                 | `:671-686`                                                                                                                                                                      |

### Discrepancies

- LOW (test gap): scenario literal inputs `'Bad Id'` / `_global/architecture` not exercised; resolved workspace/capPath not asserted. Option A (test gap): tighten tests. Option B (spec drift): none, equivalent semantics.
- INFO: schema provider and `listWorkspaces` run before `parseSpecId` (`:93-103`), so an invalid id still pays schema load cost. Spec only requires parse before repository lookup; no violation.

### Missing tests

1. Explicit `'Bad Id'` case; 2. assertion of `default` / `_global/architecture` resolution.

---

## core:validate-specs (Requirement: Single spec validation mode, modified)

### Requirements Summary

`specPath` is `workspace:capPath` or bare (-> default). Steps: validate+normalize with parseSpecId (InvalidSpecIdError), repo lookup (WorkspaceNotFoundError), `repo.get` (SpecNotFoundError), validate single spec. No adapter validation.

### Implementation Status: COMPLIANT

- `validate-specs.ts:132-146`: `parseSpecId(input.specPath, { workspaces: this._specs.keys() })`, `specRepo = this._specs.get(workspace)!`, `SpecNotFoundError(specId)` at :142-144. Workspace unknown handled inside parseSpecId (same error class: `application/errors/workspace-not-found-error.ts` re-exports the domain one).
- `:593` second `parseSpecId(args.label)` is internal on an already-qualified label; fine.

### Scenarios and test coverage

| Scenario                     | Status                 | Evidence                                                                                                   |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| Invalid specPath (`'ws:'`)   | MISSING for this input | `validate-specs.spec.ts:433-446` tests `''` and `'auth/a,b'`; `'ws:'` (empty capPath) not tested           |
| Bare specPath -> default     | Covered                | `:448-466` asserts totalSpecs 1, passed 1 (does not assert the entry id is `default:_global/architecture`) |
| Comma not split (`auth/a,b`) | Covered, weak          | `:445` asserts `InvalidSpecIdError` only; spec says "quoting `auth/a,b`" -> message/`value` not asserted   |
| Unknown workspace            | Covered                | `:~425-431`                                                                                                |
| SpecNotFound                 | Covered                | `:~468-475`                                                                                                |

### Discrepancies

- LOW (test gap): `'ws:'` untested; quoting of `auth/a,b` unasserted (code does quote via `InvalidSpecIdError.value`).

### Missing tests

1. `specPath: 'ws:'`; 2. assert `error.value === 'auth/a,b'` or message contains it; 3. assert entry resolves to `default:...`.

---

## core:preview-spec (Input, Spec ID validation, Spec Dependencies, modified)

### Requirements Summary

`specId` bare or qualified, normalized; validated "before any other work" with `parseSpecId` + configured workspaces (InvalidSpecIdError, WorkspaceNotFoundError quoting full original value); then must be in `change.specIds` else `SpecNotInChangeError`. Dependency on `core:spec-id-format` declared.

### Implementation Status: COMPLIANT

- `preview-spec.ts:101-103` parseSpecId is first statement; change lookup at :105; membership check at :112-114 uses normalized `specId`.
- Spec/delta dependency list: `core:spec-id-format` added by delta (spec text only).

### Scenarios and test coverage

| Scenario                               | Status                                       | Evidence                                                                       |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Invalid specId before membership check | Covered (`''`, `'Core/Foo'`, not `'Bad Id'`) | `preview-spec.spec.ts:598-614`, also :651-659 asserts `changes.get` not called |
| Bare specId normalized then checked    | Covered                                      | `:616-629` asserts `result.specId === 'default:auth/login'`                    |
| Unknown workspace                      | Covered                                      | `:639-649` (also asserts change not loaded)                                    |
| SpecNotInChange (existing)             | Covered                                      | `:133`                                                                         |

### Discrepancies

- LOW (doc drift in code): `execute` TSDoc `@throws` (:92-96) lists ChangeNotFound/SchemaMismatch/SpecNotInChange but not `InvalidSpecIdError` / `WorkspaceNotFoundError`. Option A: code docs bug, add `@throws`. Option B: none (spec is correct).
- INFO: spec says error "quoting the full original value"; test does not assert quoting.

### Missing tests

Assertion of quoted original value; literal `'Bad Id'` (equivalent).

---

## core:spec-metadata (Requirement: Structural validation before persistence, modified)

### Requirements Summary

`PersistSpecMetadata` validates with `strictSpecMetadataSchema`; `dependsOn` and `implementation[].specId` must be fully-qualified per `core:spec-id-format`; schema does not keep own regex; failure -> typed error, no write. Lenient read path tolerates bare entries.

### Implementation Status: COMPLIANT

- `parse-metadata.ts:9-11` `qualifiedSpecIdString` refine using `isFullyQualifiedSpecId` (delegates to parseSpecId, no own regexes). Used at :91 (`dependsOn`), :124 (`implementation.files[].specId`), :132 (`symbols[].specId`).
- Lenient `specMetadataSchema` (:14-) uses plain `z.string()` for dependsOn (:19), so bare/empty entries read OK.
- `persist-spec-metadata.ts:33-38` `strictSpecMetadataSchema.safeParse` -> `MetadataValidationError`, no write.

### Scenarios and test coverage

| Scenario                               | Status                       | Evidence                                                                                                                             |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bare dependsOn rejected on persistence | Covered                      | `persist-spec-metadata.spec.ts:~33-60` (typed error + `writeMetadataSnapshot` not called); schema level `parse-metadata.spec.ts:118` |
| Empty dependsOn entry rejected         | Covered at schema level only | `parse-metadata.spec.ts:126`; no PersistSpecMetadata-level test                                                                      |
| Existing bare entry still reads        | Covered                      | `parse-metadata.spec.ts:33-42`                                                                                                       |
| implementation specId strict           | Covered                      | `parse-metadata.spec.ts:210` (bare file specId); symbols specId not separately tested                                                |

### Discrepancies

- LOW (pre-existing spec drift, outside delta): bullet list in the requirement differs from `strictSpecMetadataSchema`: `keywords` regex `^[a-z][a-z0-9-]*$` (spec: "non-empty lowercase strings"), `contentHashes` values must match `sha256:<64 hex>` (spec: "hash string"), `scenarios` given/when optional and only `then` required non-empty (spec: all of requirement, name, when, then, given), `rules.rules` nonempty, plus undocumented `context`, `generatedBy`. Option A: update spec to match code. Option B: code too lenient/strict vs spec. Not introduced by this change.
- LOW (test gap): empty-entry scenario and `symbols[].specId` not tested via `PersistSpecMetadata`.

### Contradictions with dependency specs

None found. `core:spec-id-format` (`specs/core/spec-id-format/spec.md`) requires split on first colon, default workspace, unknown workspace rejection, Windows device names: all implemented in `parseSpecId`. Note: that spec as read does not explicitly list allowed characters (the segment regex and "no comma" rule live only in code and in this change's other specs); confirm another spec in the change covers them (not in my scope).

---

## Counts

Discrepancies: HIGH 0, MEDIUM 0, LOW 6 (generate-metadata test gap; validate-specs test gap; preview-spec TSDoc drift; spec-metadata pre-existing schema drift; spec-metadata test gap; plus quoting-not-asserted across 3 specs counted within them), INFO 3.
Implementation of all four specs: compliant; every scenario has at least partial test coverage; missing exact-input tests: generate-metadata `'Bad Id'`, validate-specs `'ws:'`, spec-metadata PersistSpecMetadata empty entry.

---

# Partial compliance audit: CLI + skills (change `support-commas-in-names`)

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation. Read-only audit; tests were not re-run.

## Cross-cutting checks

- No CLI option splits on commas except enum lists: remaining `split(',')` are `helpers/parse-comma-values.ts` (used by `change transition`/`change archive` `--status`-style enums and `graph/parse-graph-kinds.ts`), `graph/parse-file-categories.ts:21` (`--category` enum) and `graph/impact.ts:95` (`--type` enum). All acceptable. `graph/index-graph.ts:73-76` no longer splits (diff: `.concat(val.split(','))` -> `.concat(val)`).
- `packages/cli/src/helpers/spec-path.ts` and `test/helpers/spec-path.spec.ts` are deleted; no remaining import of `spec-path` in `packages/cli/src` (grep clean). `change-edit.spec.ts:266` and `change-create.spec.ts:176` assert it.
- CLI spec-ID handling: only `change/deps.ts:99` calls `parseSpecId` (from `@specd/sdk`), and only in display mode, which the spec explicitly requires. Everything else forwards raw values (`create.ts:42`, `edit.ts:68-71`, `implementation.ts` `specId: opts.spec`, `spec/deps.ts`).
- Invalid-spec-lock repair path: `handle-error.ts:196-209` maps `InvalidSpecLockError`/code `INVALID_SPEC_LOCK` to exit 1, adds a following-line hint only when `fieldPath` is `dependsOn` or starts with `dependsOn.`. Test: `test/handle-error.spec.ts:119-145`.
- Skills: `specd-implement` and `specd-archive` `SKILL.md.tpl` no longer teach comma lists (grep of `packages/skills/templates` finds no comma-joined `--file`/`--spec`/`--add`).

---

## cli:change-implementation

### Requirements Summary

Command signature; list (SDK projection, no CLI fallback); add; resolve/unresolve/ignore (`--file <paths...>`, whole names, never split/trimmed); remove; review; start; shared path semantics; raw values and unambiguous (one-per-line) listings.

### Implementation Status

- resolve/unresolve/ignore: `packages/cli/src/commands/change/implementation.ts:~96-146` use `requiredOption('--file <paths...>')` and pass `opts.file` as `files` unchanged. Verified with commander at runtime: `--file "a, b.md" --file c d` -> `["a, b.md","c","d"]` (repeat and variadic both work, no split, no trim).
- add/remove: single `--file`, `--symbol` via local `collectString` (no split), `--spec` forwarded raw (`implementation.ts:~62,~84`).
- Text list: one file per line (`implementation.ts:~175-183`, `    ${entry.file}`), symbols one per line; JSON/TOON emit arrays (`~226-235`).
- list/review use `enrichImplementationTracking` (SDK) and render `symbolResolutions` status/reason/target/candidates/provenance (`~188-208`); no CLI fallback logic.
- start: delegates to `updateImplementationTracking` with action `start`.
- File-existence, tracked-only, removed-state, ignore-missing-if-tracked, abort-all semantics live in core `UpdateImplementationTracking` (`core/.../update-implementation-tracking.ts:113-155`); not CLI.

### Discrepancies

- INFO: `implementation.ts` defines a private `collectString` duplicating `helpers/collect.ts`. Harmless; cleanup only.
- LOW (spec drift): verify scenario "Subcommands are reachable" lists `list, add, resolve, ignore, remove, review` but omits `unresolve` and `start`, which exist in code and in other requirements. Spec text drift, not a code bug.
- No code bugs found.

### Test Coverage (packages/cli/test/commands/change-implementation.spec.ts)

Covered: variadic resolve (`:115`), ignore comma-named file (`:143`), `f3.ts,f4.ts` as one name (`:178`), raw spec ID on add (`:215`), one-name-per-line text list incl. `a,b.ts` (`:246`), review removed files (`:282`), unresolve action (`:321`), start (`:353`), add missing file error (`:78`).

### Missing Tests

- Resolve of a comma-named file (`"a, b.md"`) at CLI level.
- Repeated `--file a --file b` form for resolve (only variadic `--file a b` tested); ignore with several files.
- Unresolve with repeated names + comma name.
- "Values are never trimmed" (`--file " spaced.md "`).
- Structured output (`--format json`) keeping file names as arrays.
- Raw `--spec`/`--symbol` forwarding for `remove`; `--symbol` containing a comma.
- List renders SDK projection (re-export/hierarchy/ambiguous/incomplete) - test only passes `symbolResolutions: []`; "Review distinguishes missing from inconclusive" absent at CLI level (may live in sdk/core).
- Start idempotency (second run) and "Subcommands are reachable" help test.
- Scenarios for add-creates-tracked, add-enriches, remove-symbol, resolve-untracked/removed/missing, ignore-linked etc. are core behaviours (mock kernel at CLI level); assumed covered in core tests (not verified here).

---

## cli:change-edit

### Requirements Summary

Signature (`--add-spec`/`--remove-spec` raw, repeatable, never split), workspace derivation, readOnly rejection (delegated), invariant, approval invalidation, output, error cases, constraint "command holds no spec ID or ownership rule".

### Implementation Status

`packages/cli/src/commands/change/edit.ts`: `collect` accumulator (no split, `:19-20`), values passed as `addSpecIds`/`removeSpecIds` unchanged (`:66-76`), no config/workspace reads, `ReadOnlyWorkspaceError`/`InvalidSpecIdError`/`WorkspaceNotFoundError` flow through `handleError` (exit 1, message on stderr). Core `edit-change.ts:100-128` parses/normalizes IDs, builds readOnly message with one line per offender (matches `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`).

### Discrepancies

- LOW (spec drift): Requirement "Workspace derivation" says "the CLI derives the new workspaces set", while requirement "ReadOnly workspace rejection" and the Constraints say the command MUST NOT resolve workspaces. Implementation follows the latter (core derives). Fix the spec wording (code is right), or, if the intent is CLI derivation, the code deviates - unlikely given scenario "Command resolves no workspace itself".
- LOW (pre-existing drift): code has `--invalidation-policy` and `--config`, not in the spec's signature block. Not related to this change.
- LOW: `resolveCliContext` runs before the "no flags" usage check (`edit.ts:~57-66`), so a missing config yields a config error instead of a usage error. Pre-existing.

### Test Coverage (change-edit.spec.ts)

Covered: no options (`:44`), add spec (`:55`), invalidation warning (`:83`), JSON (`:107`,`:176`), not found (`:133`), no invalidation (`:147`), raw forward + WorkspaceNotFound (`:212`), comma value (`:229`), readOnly mapping (`:247`), spec-path import absent (`:266`).

### Missing Tests

- "Invalid spec ID" (`"Bad Id"`) explicit scenario; the comma test mocks `InvalidSpecIdError` but does not assert the quoted full value `auth/a,b` in stderr.
- "Command resolves no workspace itself" (source-inspection: no `SpecdConfig`/ownership read) - only spec-path import is checked.
- Forwarding of `--remove-spec` raw; removal of last spec / remove-not-present error mapping at CLI level (core).
- readOnly "atomic rejection" and "removing is not ownership checked" are core behaviours (not covered at CLI).

---

## cli:change-deps

### Requirements Summary

Signature with `--add/--remove/--set/--clear/--force`, whole-ID values never split, display mode resolves bare `<specId>` via core parser, clear confirmation, output formats, error cases.

### Implementation Status

`packages/cli/src/commands/change/deps.ts`: `collect` for add/remove/set (`:21-27`, no split); values forwarded raw to `kernel.changes.updateSpecDeps` (`:~154-162`); mutual-exclusion fast-fails (`:~66-77`); display mode uses `parseSpecId(specId, { workspaces })` from `@specd/sdk` (`:98-99`) then membership check; clear flow uses `confirmOrExit` (`:~140-157`), prints `cancelled` on decline (exit 0), non-interactive error message "--clear requires confirmation; pass --force to skip it". `--set ""` / `--add " "` reach the use case (nonempty array), which rejects (`opts.set.length > 0` is true for `['']`).

### Discrepancies

- LOW: text output of modification mode prints the raw typed `specId` (`:~166`), while JSON prints the normalized `result.specId`. Spec says `<specId>`; ambiguous. Either accept or print normalized.
- LOW: for `--clear`, the confirmation prompt happens before the use case validates the spec/IDs, so an invalid/unknown spec still prompts first. Spec says confirmation precedes the use-case call, so this matches the spec; noted only.
- No code bugs found.

### Test Coverage (change-deps.spec.ts)

Covered: add/remove/set/list/display (display uses bare `auth/login` via mocked workspaces -> covers "Display mode accepts a bare spec ID"), JSON, none, not found, not in scope, set+add conflict, removing nonexistent, flags without specId, clear conflicts (add; table of other combos at `:~327-377`), clear without specId (`:379`), `--set ""` (`:392`), `--set core:a,b` one ID (`:418`), raw bare specId (`:445`), clear confirmed/declined/force/non-TTY (`:476-556`).

### Missing Tests

- "Help lists --clear and --force".
- `--add " "` blank value; unknown workspace in a dependency (`nope:auth/login`) mapping; dependency on not-yet-existing spec accepted (core-level).
- `--add` raw forward only asserted with `--add`; `--remove` raw forward not asserted.

---

## cli:spec-deps

### Requirements Summary

list/add/remove/set/clear under `specs deps`; clear confirmation; no CLI mutation logic; raw spec IDs; error mapping incl. `InvalidSpecLockError` with `dependsOn` repair hint.

### Implementation Status

`packages/cli/src/commands/spec/deps.ts`: each handler calls exactly one kernel use case with raw `specPath`/`opts.dep` (`:60-165`), `collect` accumulates without splitting, `.allowExcessArguments(false)` on every leaf. Clear uses `confirmOrExit`. Hint in `handle-error.ts:196-209`.

### Discrepancies

- MEDIUM: "Remove on an uninitialized spec reports a no-op, not an error." `add/remove/set/clear` all call `renderDepsResult({ ...result, initialized: true }, ...)` (`deps.ts:~94,~116,~138,~176`), overriding reality. Core returns `{dependsOn: [], created: false}` for `remove` on missing state (`update-persisted-spec-deps.ts:~205`), so the CLI prints `dependsOn: (empty)` as if state exists; no distinct no-op outcome. Possibilities: (a) code bug: should use `created`/read state to report "not initialized / nothing to remove"; (b) spec drift: the scenario assumes a no-op message that no layer produces (core result has no `initialized`/noop flag). This predates the change (not touched by the comma work) but the spec is in scope.
- LOW: the hint appended in `handle-error.ts:~205` is `Repair with: specd specs deps remove <spec-id>, ... set ..., or ... clear ... (use --force to skip confirmation on clear)`. The trailing `--force` parenthetical may violate "MUST NOT add any other repair instruction". Either (a) remove the parenthetical (code), or (b) relax the spec.
- LOW: non-interactive failure message for `specs deps clear` reads "--clear requires confirmation; pass --force to skip it" (`deps.ts:~160`) though that command has no `--clear` option; spec says "clearing requires confirmation". Wording only; (a) fix message, (b) spec accepts.
- INFO: `add`/`remove` `requiredOption('--dep', ..., [])` with a default plus a manual `--dep requires at least one value` check; `set` with no `--dep` correctly sends `set: []`.

### Test Coverage (spec-deps.spec.ts + handle-error.spec.ts)

Covered: list (`:46`), set delegation (`:63`), `--dep ""` (`:90`), missing target exit 1 (`:110`), invalid lock message + no stack (`:135`), repair hint (handle-error.spec `:129`), clear confirmed/declined/force/non-TTY (`:160-217`).

### Missing Tests

- `--dep "core:a,b"` forwarded as one ID (no test found in spec-deps.spec.ts).
- list on uninitialized spec (text "not initialized" + JSON `initialized:false`); remove no-op on uninitialized spec.
- add (multi-dep) / remove / clear delegation mapping (`add: [...]`, `remove: [...]`, `clear: true`); set with no `--dep`.
- Bare spec ID forwarded unchanged (`_global/architecture`) - list test uses `auth/login` partially.
- Error mapping scenarios for `ArtifactConflictError` (retry message), `ReadOnlyWorkspaceError` (no config workaround) at CLI command level; unknown spec for list; invalid/unknown workspace IDs mapping. Hint negative case (non-`dependsOn` field gets no hint) not tested.

---

## cli:graph-index

### Requirements Summary

`--exclude-path <pattern>` repeatable/listable, each value one whole pattern; plus the (unchanged) isolated-worker, output, size-skip, overlap, diagnostics, error and docs requirements.

### Implementation Status

`packages/cli/src/commands/graph/index-graph.ts:70-76`: `Option('--exclude-path <glob...>').argParser((val, prev) => (prev ?? []).concat(val))`; the value goes to task input `index.excludePaths` (`:~163`). Runtime check with commander: `--exclude-path '{a,b}/**' --exclude-path x/ y/` -> `["{a,b}/**","x/","y/"]`. Docs: `docs/cli/cli-reference.md:1289,1343-1349` document repeated and listed forms. Other (unchanged) requirements not re-audited here beyond the touched line.

### Discrepancies

- None.

### Test Coverage (graph-index.spec.ts)

Covered: comma pattern `{a,b}/**` as one pattern (`:96-112`), repeated option accumulation (`:277`).

### Missing Tests

- "Several patterns listed after one option" (`--exclude-path 'app/tmp/' 'dist/'`).

---

## cli:change-create

### Requirements Summary

`--spec <id>` repeatable, each value passed to `CreateChange` unchanged, never split; workspace derivation and readOnly rejection delegated; schema resolved inside use case; overlap delegation; output; duplicate error; constraint "CLI holds no spec ID or ownership rule".

### Implementation Status

`packages/cli/src/commands/change/create.ts`: `collect` (`:17`), `specIds: opts.spec` raw (`:~42`), `includeOverlapCheck` only when non-empty (`:~43`), no schema call, no workspace/ownership reads, errors via `handleError`. Core `create-change.ts:~120-137` normalizes and reports readOnly offenders one per line.

### Discrepancies

- LOW (spec drift, pre-existing): Constraint "the CLI validates the kebab-case name format before invoking the use case" - validation is in core (`domain/entities/change.ts:283`, `InvalidChangeName`-style error), not CLI. (a) update spec; (b) add CLI pre-check (unnecessary).
- LOW (pre-existing drift): `--invalidation-policy`, `--config` options not in spec signature.

### Test Coverage (change-create.spec.ts)

Covered: missing name (`:52`), no `--spec` (`:62`), bare ID forwarded raw (`:84`), qualified ID raw (`:108`), unknown workspace (`:133`), comma ID one value (`:158`), spec-path gone (`:176`), success/JSON (`:189,:212`), duplicate (`:242`), no `getActiveSchema` (`:258`), overlap flag/warning (`:278,:305`), readOnly mapping (`:339`), manifest schema identity (`:431`), real DetectOverlap (`:462`).

### Missing Tests

- "Invalid ID rejected" (`"Bad Id"`) explicit; comma test should assert message quotes `auth/a,b`.
- "Multiple readOnly specs each produce an error" / "Mixed owned and readOnly" (core behaviour; CLI level only single mapping).
- "Command checks no ownership itself" and "Workspace derived by use case" (source inspection) not asserted.

---

## skills:workflow-automation

### Requirements Summary

Changed requirement: "Implementation traceability policy" - agents pass one whole file name per value (repeat `--file` or list after it), MUST NOT join with commas.

### Implementation Status

`packages/skills/templates/skills/specd-implement/SKILL.md.tpl:~185-197` and `specd-archive/SKILL.md.tpl:~103-117` now teach `--file <path1> --file <path2> ...`, drop "comma-separated" language and the false claim that linked files cannot be ignored (now "preserves any confirmed links"). No other template mentions comma-joined lists (`specd-fasttrack` checked by test).

### Discrepancies

- LOW: templates show only the repeated-option form; the listed form (`--file a.ts b.ts`) allowed by the spec is not shown. Spec says SHOULD either; acceptable.

### Test Coverage (packages/skills/test/template-workflow.spec.ts:111-130)

Covered by negative checks: no `--file x,y`, no `comma-separated`, no "cannot be ignored", has "preserves any confirmed links" (implement/archive/fasttrack).

### Missing Tests

- Positive assertion that templates show `--file <path1> --file <path2>` (scenario "resolves several files with repeated options"); only negatives are tested. The regex `/--file\s+[^\n]*\w,\w/` could false-positive on legitimate prose but passes today.

---

## Counts

Discrepancies by severity (code vs. spec, all seven specs): HIGH 0, MEDIUM 1 (spec-deps remove no-op reported as initialized), LOW 9 (change-implementation scenario list omits unresolve/start; change-edit workspace-derivation wording contradiction; change-edit/create pre-existing `--invalidation-policy`/`--config` signature drift; change-edit config-before-usage order; change-create kebab validation location; change-deps specId raw vs normalized in text output; spec-deps hint extra `--force` text; spec-deps clear message cites `--clear`; skills templates show only one form), INFO 2.

No contradictions with project or dependency specs found beyond those listed (core:spec-id-format semantics are applied in core, CLI holds no spec-ID helper).
