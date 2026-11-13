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
