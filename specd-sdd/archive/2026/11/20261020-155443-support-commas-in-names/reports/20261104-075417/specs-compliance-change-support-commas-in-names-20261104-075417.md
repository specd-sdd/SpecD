# Spec compliance: support-commas-in-names

Scope: 30 change specs (core 23, cli 6, skills 1). Typecheck + tests pass (core 2703, sdk 134, cli 1232, skills 50).

## Summary

- High: 0
- Medium: 5 (see below)
- Low: ~50, mostly spec wording / naming
- Missing tests: ~100, mostly low priority

## Medium findings

1. code-wrong, core:update-persisted-spec-deps: no up-front exclusivity/min-operation guard; silent no-op when spec has no persisted state.
2. spec-wrong, core:edit-change / core:spec-id-format: "invalid stored ID can always be removed" unmeetable for change specIds (loadChangeFromManifest throws CorruptedManifestError). Narrow promise to spec-lock dependsOn or make loader lenient.
3. code-wrong, InvalidSpecLockError message conflicts with CLI repair hint (two contradictory instructions).
4. spec/template-wrong, skills specd-archive & specd-implement templates still say files with confirmed links cannot be ignored.
5. code-wrong, `changes deps <name> <specId>` display mode rejects bare spec ID that --add accepts.

# Detailed Findings

---

## \_partial-core-ids.md

# Partial compliance audit: core ID specs (change support-commas-in-names)

Scope: core:spec-id-format, core:workspace, core:config, core:config-loader, core:spec-lock, core:create-change, core:edit-change.
Method: `change spec-preview` (merged spec+verify), read implementation under packages/core/src and packages/cli/src, read tests under packages/core/test. Read-only; typecheck/tests assumed green per caller.

Note: `changes spec-preview ... core:core/<name>` is wrong; the ids are `core:<name>` and the command is `change spec-preview`.

## Cross-cutting findings (top)

1. [MEDIUM, spec-vs-spec conflict, unreachable scenario] "Removal of an invalid stored ID" (core:edit-change, core:spec-id-format "Syntax validation" last paragraph) cannot happen on the real fs path.
   - `loadChangeFromManifest` (packages/core/src/infrastructure/fs/manifest-change-loader.ts, `assertQualifiedSpecId` on `specIds.N`, `specDependsOn.*`) throws `CorruptedManifestError` for any invalid/bare stored specId. `EditChange.execute` starts with `this._changes.get(name)`, which loads the manifest, so a change holding `Bad Id` never reaches the removal code. Additionally `FsChangeRepository.unscaffold` (change-repository.ts ~921) and `scaffold` callback `_specExists` call `parseSpecId` strictly, so even in-memory it would throw when any other invalid stored ID remains.
   - Evidence: spec-id-format "Persisted IDs are fully qualified" says manifest readers SHALL reject invalid IDs; "Syntax validation" and edit-change "Spec ID validation" say an invalid stored ID can always be removed. Both cannot hold for `specIds`. Only `spec-lock dependsOn` (lenient read) truly honours the repair promise.
   - Verdict: spec-wrong (over-broad) more than code-wrong. Narrow the "remove never validates" promise to dependsOn lists (spec-lock) and state the manifest case explicitly, or make the manifest loader lenient for specIds. Today the edit-change scenarios are only satisfiable with an in-memory repository mock.
2. [LOW-MEDIUM, test gap] No test for several verify scenarios of edit-change (empty ID, removal of invalid stored ID, removal of bare ID matching qualified form, error message quotes `auth/a,b`).
3. [LOW, spec-wrong stale refs] core:create-change and core:edit-change "Seeding rules" cite `readPersistedDependsOn(spec)`, which no longer exists in the codebase (code uses `loadPersistedSpecDependsOn` over `readPersistedState`). core:spec-id-format dependency line says compile-context "uses `_parseSpecId`", which no longer exists (it uses `parseSpecId`). Pre-existing staleness, not caused by this change, but spec-id-format's own dependency list now contradicts its "no lenient splitter" requirement.
4. [LOW, spec ambiguity] spec-id-format "Persisted IDs" lists "implementation links" as fully-qualified valid IDs, but the lock reader only checks `implementation[].file` is non-empty (`workspace:path` file identity is not a spec ID, and the spec-lock verify scenario `implementation.0.file` only requires non-empty). Code matches spec-lock; spec-id-format wording is imprecise.
5. [LOW, defence in depth] Lock write path (`serializeSpecLock`, archive publication at spec-repository.ts ~472, `writePersistedState`) does not validate `dependsOn`; only `UpdatePersistedSpecDeps` validates. A bad archive-materialized dependsOn would be written then fail every strict read. Not required by spec text (metadata is the one documented as "written strictly"); consider requiring it.
6. [LOW] `InvalidSpecLockError` thrown from `UpdatePersistedSpecDeps` post-mutation check passes `location = undefined`, so that variant of the message omits the lock file location that the spec says the message SHALL name. Also the CLI repair hint in `handle-error.ts` is generic ("specd specs deps remove|set|clear <spec-id>", real syntax is `remove <specPath> --dep <id>`).

## core:spec-id-format

Requirements summary: canonical `workspace:capPath`; bare path -> `default:` at input boundaries by core; unknown workspace -> `WorkspaceNotFoundError` quoting full ID and known list; parse steps; Windows device names rejected on all OS; normalization; workspace rule `^[a-z][a-z0-9-]+$` (+device) via `isValidWorkspaceName`; segment rule `^[a-z0-9_][a-z0-9_-]*$` (+device) one implementation; `InvalidSpecIdError` for empty/blank/`:`/`ws:`/`:path`/empty segments/`.`/`..`/colon in path/uppercase/space/comma/device/1-char ws/backslash (hint "'/' is the only separator"); remove ops don't validate; single validator `parseSpecId(id, {workspaces, defaultWorkspace})`; use cases validate+normalize, adapters pass raw; `parseSpecPattern` and schema-ref parsing separate; persisted IDs fully qualified.

Implementation status:

- `parseSpecId` (domain/services/parse-spec-id.ts) implements all rules; no application imports; workspaces iterable accepts string|object; `WorkspaceNotFoundError(workspace,{specId,known})` quotes full ID + known list; bare ID checks defaultWorkspace. COMPLIANT.
- `spec-id-rules.ts` is the sole holder of the two regexes; `spec-id-guards.spec.ts` enforces it by scanning core/src. SpecPath, parseSpecPattern, config-schema prefix, config-loader, parse-spec-lock, parse-metadata use shared helpers. COMPLIANT. (Other `[a-z][a-z0-9-]*` regexes in parse-metadata keywords and build-schema ids are unrelated.)
- `parseSpecPattern` exists and is used by config validation (`validateContextPattern`) and match time (`listMatchingSpecs`); both interpret identically. Unknown workspace stays a warning. COMPLIANT.
- No lenient splitter remains in core/cli/sdk/mcp src; `packages/cli/src/helpers/spec-path.ts` deleted; no `parseSpecId` in cli/src. COMPLIANT.
- Use cases (get-spec, update-spec-deps, update-persisted-spec-_, get-persisted-_, validate-\*, create/edit-change, generate-spec-metadata, etc.) call `parseSpecId` with configured workspaces. Remove paths use `tryNormalize...`. COMPLIANT.
- Persisted readers: manifest (`CorruptedManifestError` with value + field path), spec-lock (`InvalidSpecLockError`), metadata strict write / lenient read. COMPLIANT.
- Minor: several use cases still do a dead `if (repo === undefined) throw new WorkspaceNotFoundError(workspace)` without context (unreachable after parseSpecId with workspaces). No impact.

Discrepancies:

- D1 MEDIUM spec-vs-spec: removal of invalid stored ID vs manifest rejection (see cross-cutting 1). Spec-wrong.
- D2 LOW spec-wrong: stale `_parseSpecId` dependency line (cross-cutting 3).
- D3 LOW ambiguity: "implementation links" fully qualified wording (cross-cutting 4).
- D4 LOW: `parseSpecPattern(pattern)` spec signature has one parameter; code adds optional `{defaultWorkspace}` (required by "caller SHALL pass its own defaultWorkspace"). Spec-wrong (incomplete), trivial.

Test coverage (core/test/domain/services/parse-spec-id.spec.ts, spec-id-rules.spec.ts, parse-spec-pattern.spec.ts, spec-id-guards.spec.ts, windows-device-name.spec.ts, spec-path.spec.ts, parse-spec-lock.spec.ts, manifest-change-loader.spec.ts):

- Well covered: valid/bare/default workspace, invalid-input table (empty, blank, `:`, `ws:`, `:path`, empty segments, dot segments, uppercase, space, comma, 1-char ws, device `nul`, `a:b`), backslash hint, workspaces iterable forms (array/Set/Map.keys/objects), bare-with-missing-default WorkspaceNotFoundError message, isValidWorkspaceName/segment, patterns, one-implementation guard, bare/invalid dependsOn in lock, manifest empty ID.
  Missing tests:
- Explicit `nope:auth/login` WorkspaceNotFoundError message quoting full ID + listing `default`,`core` (only bare-ID variant tested).
- Syntax-only (no workspaces) returns unknown workspace unchanged; `billing/auth/login` slash-never-separator scenario; `com1`/`lpt9` segment via parseSpecId; `-bad/x`, `2fa/setup`, `_global/x`, `auth/"x"`, `auth/v1.2` at parseSpecId level; `Result is always fully qualified` explicit.
- `parseSpecPattern`: `*/x` and `ws:` + `core:nul/*` not covered; hyphen/plugin-agent names.
- "Domain service has no application dependency" and "no exported lenient splitter" (static inspection) have no tests.
- Metadata strict-write rejects bare dependsOn / lenient read accepts: not found in grep of parse-metadata.spec for this change (verify).
- Use-case-level: "SDK caller with specId '' throws InvalidSpecIdError" not found for most use cases; "Windows-style path `core:specs\auth\login` given to a command" only at parse level.

Summary counts: requirements 14; implemented 14; discrepancies 4 (0 high, 1 medium, 3 low); scenarios ~55, untested ~10.

## core:workspace

Requirements summary: workspace name rule (shared), reserved `default`/`root`/device names, uniqueness; properties/defaults; external inference; ownership + ReadOnly enforcement; prefix segments use segment rule, invalid prefix -> `ConfigValidationError`; workspace-qualified spec IDs with `WorkspaceNotFoundError`/`InvalidSpecIdError`; active/primary workspace derived via parseSpecId; port-per-workspace; context patterns; cross-workspace refs.

Implementation status: COMPLIANT for all changed requirements.

- Name rule: config-loader.ts uses `isValidWorkspaceName(name)` (message now generic: "is not a valid workspace name"); `root` and `default` handled explicitly. Device name rejection folded in.
- Prefix: `PrefixZodSchema` uses `isValidCapabilitySegment`; `PREFIX_SEGMENT_RE` removed. Rule applies to device names too.
- Qualified IDs: delegated to parseSpecId.
  Discrepancies: none high/medium. LOW: loader message for a device-name workspace changed from "is a Windows device name" to the generic message, which is less specific than before (spec does not mandate text). Code acceptable.
  Test coverage: config-loader.spec.ts `it.each(['a','Core','nul'])` rejects; `con-foo` present; `Team` prefix rejected (line ~754); existing ReadOnly tests in create/edit/archive/spec-repository.
  Missing tests: two-character workspace `ab` accepted (found nothing); "existing workspaces (core, cli, sdk, plugin-agent-claude) remain valid" explicit; `default`/`root` stay reserved with `con-foo` legal in same test (only separate); `123abc`/`my_service` names.
  Summary: requirements 11; implemented 11; discrepancies 0 medium+ (1 trivial); untested scenarios ~3.

## core:config

Requirements summary (changed): new "Workspace names and context patterns use the shared rules" (workspace name rule, prefix segment rule, patterns parsed by `parseSpecPattern` both at load and match, qualifier-less pattern contextual default supplied by caller, unknown workspace warns) + dependency on spec-id-format.
Implementation status: COMPLIANT. `validateContextPattern` delegates to `parseSpecPattern` and converts `InvalidSpecPatternError` into `ConfigValidationError` (message `${field}: ${reason} in pattern '${pattern}'`); `listMatchingSpecs` passes `{defaultWorkspace}`; unknown workspace still `unknown-workspace` warning (compile-context tests ~842, 1810).
Discrepancies: LOW code behaviour: at match time `parseSpecPattern` throws `InvalidSpecPatternError` (not a warning) for a malformed pattern that bypassed load validation (e.g. programmatic caller); acceptable given load-time validation and spec says "same parser". No action.
Test coverage: config-schema.spec.ts (digit segment, 1-letter qualifier, uppercase prefix), config-loader prefix/ws tests, compile-context unknown-workspace.
Missing tests: workspace-level qualifier-less pattern meaning `billing:auth/*` (spec-pattern-matching.spec may cover; not verified for default workspace override); `Prefix segment 'Team'` is covered; "Workspace name with one character rejected" covered by loader test.
Summary: 1 new requirement, implemented; 0 discrepancies; ~1 untested scenario.

## core:config-loader

Requirements summary (changed): pattern validation uses `parseSpecPattern`; qualifiers per workspace rule, segments per segment rule; loader keeps no private regex; new "Workspace names use the shared rule" requirement.
Implementation status: COMPLIANT. config-loader.ts imports `isValidWorkspaceName`; `validateContextPatterns(data, rootConfigPath)` runs for project and workspace patterns; no regex literals remain (guard test).
Discrepancies: none.
Test coverage: `rejects invalid workspace name` for `a`,`Core`,`nul`; `config-schema.spec.ts` for patterns; guard test for "no private copy".
Missing tests: loading with `contextIncludeSpecs: ['core:Auth/*']` -> `ConfigValidationError` (only unqualified `Team/*` tested at unit level); `['core:2fa/*']` accepted through the loader; `['a:*']` through loader (unit-tested only on `validateContextPattern`); workspace-level patterns through loader. Low severity (same code path).
Summary: 2 requirements; implemented 2; 0 discrepancies; ~3 low-value test gaps.

## core:spec-lock

Requirements summary (changed): dependsOn entries fully-qualified valid IDs (bare/empty/malformed rejected, no legacy form); new "Invalid lock fails with a typed error": `InvalidSpecLockError` (code INVALID_SPEC_LOCK) naming spec ID, location, field path, rule, and "must be corrected in that file"; reads strict by default, never drop/rewrite; only lenient dependsOn read (`lenientDependsOn`) for repair mutations (remove/set/clear) and writePersistedState revision check.
Implementation status:

- `parseSpecLock` (domain/services/parse-spec-lock.ts) validates `dependsOn` with `isFullyQualifiedSpecId`; invalid JSON and Zod failures are wrapped in `InvalidSpecLockError` (fieldPath from first issue, `''` for JSON); lenient schema keeps other fields strict. COMPLIANT.
- Message format: "Invalid spec-lock for '<id>' at <loc>: field '<path>' <reason>. Correct that field in the file." COMPLIANT.
- FsSpecRepository `_readSpecLock` passes specId/location; `readPersistedState(spec, {lenientDependsOn})`; `writePersistedState` reads leniently. No rewrite on read. COMPLIANT.
- `UpdatePersistedSpecDeps` uses lenient read for remove/set/clear, strict for add, validates final list (`InvalidSpecLockError` when invalid entries remain). `clear` + CLI `specs deps clear` with `--force`. CLI `handle-error.ts` adds a repair hint for `dependsOn*` field paths. COMPLIANT.
  Discrepancies:
- D1 LOW code: post-mutation `InvalidSpecLockError` has no `location` (message lacks lock file path).
- D2 LOW code: write path does not validate dependsOn (cross-cutting 5).
- D3 LOW spec-wrong: spec places "Sidecar is not a schema artifact" requirement after "Spec Dependencies" (structure only, pre-existing).
- D4 LOW: CLI hint text is generic and does not show actual flags (`--dep`).
- Observation (consistent with spec): any consumer with a corrupted lock (CreateChange/EditChange via `loadPersistedSpecSchema`, context traversal via `readPersistedState`) fails with `InvalidSpecLockError`; user repairs with `specs deps` (clear/set/remove). Only `dependsOn` corruption is CLI-repairable; a bad `schema` or `implementation` field requires manual file edit as the message states ("Correct that field in the file").
  Test coverage: parse-spec-lock.spec.ts (JSON error without ZodError, `''`/bare/`not valid`/`core:` rejected with field path, mix under strict, lenient tolerates, lenient still rejects other field `schema.name`); spec-repository.spec.ts ~1281 (readPersistedState rejects, file unchanged); update-persisted-spec-deps.spec.ts (invalid stored removed, lenient read for remove, invalid after repair throws, add stays strict, propagates InvalidSpecLockError); cli/test/commands/spec-deps.spec.ts; spec-id-guards.spec.ts parses every repo lock.
  Missing tests:
- Lenient read rejecting `implementation.0.file` empty (spec scenario names that exact path; test uses `schema.name`).
- "Qualified valid entries accepted" returning unchanged is covered by the valid parse test only partially (default:\_global/architecture).
- Error message includes the violated rule text and location through the fs repo (location asserted at parse level only).
- `writePersistedState` lenient revision check with an invalid-dependsOn lock then successful repair (integration at repo level).
- "No raw ZodError escapes" for non-dependsOn structural errors (only JSON case tested explicitly; implementation handles ZodError generally).
  Summary: 4 changed requirements; implemented 4; discrepancies 4 (all low); untested scenarios ~4.

## core:create-change

Requirements summary (changed): `specIds` entries are whole IDs; "Spec ID validation" (parseSpecId + workspaces, store qualified IDs, `InvalidSpecIdError`/`WorkspaceNotFoundError`, nothing created when any invalid, non-existent specs accepted); ReadOnly rejection after normalization with exact message lines and no remediation.
Implementation status: COMPLIANT (create-change.ts lines ~121-139). `input.specIds.map(parseSpecId(id,{workspaces}))`, readOnly check on normalized IDs, one line per offender plus the protected sentence, qualified IDs recorded in created event and Change. No split on commas anywhere in CLI (`--spec` uses `collect`, passes array straight through).
Discrepancies:

- D1 LOW: validation happens after the name-uniqueness check, schema resolution and actor resolution, so an invalid ID in a request with a schema failure surfaces the schema error first. Spec says only "before persistence". No action.
- D2 LOW spec-wrong: stale `readPersistedDependsOn` reference (cross-cutting 3).
- D3 LOW: duplicate IDs in `specIds` (`['a','a']`) not de-duplicated after normalization (bare + qualified forms of same ID produce duplicates); spec silent. Consider dedupe.
  Test coverage (create-change.spec.ts "spec ID validation"): invalid segment, comma, unknown workspace, bare normalized, one-of-several invalid creates nothing, non-existent accepted, readOnly one line per offender. CLI change-create.spec covers readOnly and passthrough.
  Missing tests: assertion that error message quotes `Bad Id`/`auth/a,b` (only `toThrow(Class)`); mixed owned+readOnly nothing created (partly); SDK-caller scenario (use case is the SDK path, covered implicitly); duplicate normalization.
  Summary: 2 changed requirements + input contract; implemented; 3 low discrepancies; ~2 test gaps.

## core:edit-change

Requirements summary (changed): add IDs validated/normalized (`parseSpecId` + workspaces), nothing persisted when any invalid; remove IDs not syntax-validated, valid ones normalized to qualified form before matching, invalid compared as given; ReadOnly rejection of added specs with exact message; constraint "never splits a spec ID".
Implementation status: COMPLIANT in use case (edit-change.ts ~104-140): `parsedAdds` -> readOnly check -> `addSpecIds`; `removeSpecIds` try/catch normalize else as-given; mutation via `changes.mutate`; removal ownership not checked. CLI `--add-spec/--remove-spec` use `collect`, arrays forwarded unmodified.
Discrepancies:

- D1 MEDIUM spec-wrong/unreachable: invalid stored ID removal cannot be reached through the fs repository (cross-cutting 1). Also `unscaffold`/`_specExists` would throw `InvalidSpecIdError` for any remaining invalid stored ID.
- D2 LOW code: actor identity is resolved before add-ID validation and before the idempotent no-op detection, contradicting the Constraint "Actor identity is only resolved when a persistence-worthy change occurs" for validation-failure and add-only-no-op calls (edit-change.ts line ~96). Pre-existing ordering; the change added validation after it. Move `actor.identity()` after validation / inside the effective change branch.
- D3 LOW spec-wrong: stale `readPersistedDependsOn` reference.
  Test coverage (edit-change.spec.ts "spec ID validation"): invalid segment, comma, unknown workspace, bare normalized, one invalid among several stores nothing, non-existent accepted, readOnly one line per offender, removal skips ownership.
  Missing tests:
- Empty ID `''` -> `InvalidSpecIdError` (verify scenario "Empty ID rejected").
- "Removal of an invalid stored ID" (verify scenario) and "Removal of a bare ID matches the qualified stored form" (test named "normalizes bare remove IDs" actually passes a qualified ID `platform:tokens`; no bare remove-ID test).
- Message quoting `Bad Id` / `auth/a,b` and no split (asserts only error class).
- Combined remove+add in one call with normalization.
  Summary: 2 changed requirements + constraint; implemented; discrepancies 3 (1 medium, 2 low); untested scenarios ~4.

## Totals (this partial)

- Specs audited: 7
- Discrepancies: 1 medium (spec-vs-spec/unreachable invalid stored ID removal), ~14 low
- No high-severity findings; no code-wrong item that breaks a spec scenario on the main path.
- Untested scenarios identified: ~25 (mostly low risk; highest value: edit-change empty ID, invalid-stored-ID removal, bare removal match, spec-lock `implementation.0.file` lenient scenario, loader-level pattern scenarios, `ab` workspace accepted).

---

## \_partial-core-deps.md

# Partial compliance audit: core deps/persisted-get specs (change support-commas-in-names)

Method: spec-preview (spec+verify) of each spec read; implementation read directly (packages/core/src/application/use-cases/_, composition/use-cases/_, \_shared/apply-depends-on-mutation.ts, domain/services/parse-spec-id.ts); tests under packages/core/test/application/use-cases/. Typecheck/tests were stated as passing; not re-run. Note: graph tooling was not used for this audit (the specs map 1:1 to single use-case files; direct reads were sufficient). Fallback justified by narrow scope.

Global specs check: default:\_global/error-handling-conventions - all new errors are typed SpecdError subclasses (InvalidSpecIdError, InvalidInputError, InvalidSpecLockError, WorkspaceNotFoundError with specId+known-workspaces context). Consistent. No cross-spec conflicts found with core:spec-id-format (parseSpecId is the single validator) or core:spec-lock (lenientDependsOn exists in port, fs repo, parse-spec-lock).

---

## 1. core:update-spec-deps

### Requirements summary

Input contract (whole IDs, never split; clear flag); change lookup; spec in change; exclusivity (set / clear / add+remove); at-least-one-op; set replaces (entries validated, '' rejected); clear removes all via applyDependsOnMutation; spec ID validation via parseSpecId+workspaces before mutation (remove entries lenient, target existence not checked); remove validates existence; add idempotent; remove-before-add; persistence via ChangeRepository.mutate; typed errors; factory via resolveUpdateSpecDepsDeps (changes + workspaces).

### Implementation status

All requirements implemented (update-spec-deps.ts, \_shared/apply-depends-on-mutation.ts, composition/use-cases/update-spec-deps.ts).

- Exclusivity/at-least-one checked up front, before parsing; ids validated/normalized (specId, add, set) before mutate; remove uses tryNormalizeDepId (valid -> qualified, invalid kept literal). Workspaces snapshot taken once (handles one-shot iterables).
- Spec-in-change check happens inside mutate on the fresh Change; ChangeNotFoundError comes from mutate.
- resolveUpdateSpecDepsDeps resolves changes + workspaces.

### Discrepancies

1. LOW (spec-wrong, wording): verify scenarios "Set used together with add/remove" and "No operation specified" say "throws an `Error`"; code throws InvalidInputError (typed, code INVALID_INPUT) which matches the later "Typed errors" requirement and the spec's own "MUST throw a typed error". Spec verify wording is stale; code is right.
2. LOW (spec ambiguity): validation order - InvalidSpecIdError for an invalid `specId` is thrown before ChangeNotFoundError (parse precedes mutate). Spec states no order. Acceptable; consider documenting.
3. LOW (spec-wrong, minor): Requirement "Remove validates existence" says "throw an Error identifying the missing dependency"; code message is `dependency 'x' not found in current deps` (InvalidInputError). Fine; wording only.
4. INFO: Spec "Input contract" scenario omits `clear`, covered by separate scenario. OK.

No code-wrong findings.

### Test coverage (update-spec-deps.spec.ts)

Covered: add qualified, mutate-persistence, remove, set, clear, exclusivity matrix (5 combos, stored deps unchanged), add+remove together, set [''] , add [' '], comma-containing ID rejected as one whole value, malformed, unknown workspace, nonexistent target accepted, bare->qualified, one-invalid-among-valid stores nothing, remove invalid stored value, spec not in change, change not found, no operation, remove missing, add idempotent.

### Missing tests

- Scenario "clear on an already empty list" (succeeds with []) - not explicit.
- Scenario "clear alone satisfies minimum operation" - implicit via clear test only.
- `set: [':', 'ws:']` malformed multi-entry (single malformed case present).
- Remove-before-add ordering with both in one call is only covered by "allows add+remove together" (order of result asserted; ok). Explicit "Remove and add in same call" with overlapping ID not tested.
- Typed error code assertion (`INVALID_INPUT`) not asserted (only class).
- Composition: no test for resolveUpdateSpecDepsDeps / createUpdateSpecDeps(config) resolving `changes` + workspaces (grep found no test referencing the resolve\* helpers under packages/core/test).
- "Same behavior through the SDK" is an SDK-level test, out of scope here.

### Summary counts

Requirements 14 / implemented 14. Discrepancies: 0 high, 0 medium, 3 low (all spec wording), 1 info. Missing tests: ~5 (low).

---

## 2. core:update-persisted-spec-deps

### Requirements summary

Input contract; mutual exclusivity + min operation (typed error "before reading or writing persisted state" per verify); spec ID validation + existing targets (parseSpecId before any I/O, SpecNotFoundError for missing add/set targets, remove normalization/literal match, lenient read for remove/set/clear, strict for add, InvalidSpecLockError naming dependsOn field when entries still invalid after mutation); remove-before-add; read state with originalHash; set/clear create missing state without derivation; non-empty add creates via resolveInitialPersistedDependsOn; remove/empty-add on missing state are no-ops; patch helper; conditional write (expectedRevision); SpecNotFoundError; result contract; factory.

### Implementation status

Largely implemented. Parse-before-I/O, workspace/readOnly checks, target existence, remove normalization, lenient read for repair ops (`isRepairOp`), post-mutation isFullyQualifiedSpecId guard throwing InvalidSpecLockError(`dependsOn.<i>`), expectedRevision = originalHash / null, patch helper, created flag - all present.

### Discrepancies

1. MEDIUM (code-wrong): Mutual-exclusivity and minimum-operation validation is NOT performed up front. It lives only in `applyDependsOnMutation`, which runs after `repo.get` and `readPersistedState`. Consequences:
   a. verify scenario "set combined with add is rejected ... throws a typed validation error before reading or writing persisted state" is violated: the repo is read first (and, for a missing-state spec, getActiveSchema.execute() is invoked) before InvalidInputError. Also target-existence checks on add/set run first, so `set+add` with a nonexistent target yields SpecNotFoundError instead of the exclusivity error.
   b. "No operation provided is rejected" is violated on lock-less specs: with no add/remove/set/clear and `readPersistedState === null`, `_createMissingState` computes `createsState=false` and returns `{dependsOn: [], created: false}` with NO error. The same input against an existing lock throws (via applyDependsOnMutation). Inconsistent behavior; spec says MUST throw typed validation error. Same hole for `remove+add:[]`-type combos is not an issue; but `{ remove }` with `clear` on missing state does throw (clear -> createsState) only after getActiveSchema.
   c. Also `set+remove`/`clear+remove` on missing state: `createsState` true so applyDependsOnMutation throws, but after schema resolution I/O.
   Evidence: update-persisted-spec-deps.ts lines ~108-170 (no pre-check before readPersistedState); apply-depends-on-mutation.ts holds the only guards; update-spec-deps.ts, by contrast, pre-validates. Spec is right (and consistent with core:update-spec-deps); fix: run the three guards at the top of execute (before parseSpecId I/O or at least before any repo access).
2. LOW (spec-wrong, naming): Spec says composition helper resolves `specs` and an `initializePersistedSpecState` collaborator; code resolves `specRepositories`, `getActiveSchema`, `parsers`, `extractorTransforms`, `contentHasher` (the pieces resolveInitialPersistedDependsOn needs) instead. Pre-existing divergence, outside this change's theme; spec wording should be aligned or code adapted.
3. LOW (spec-wrong): spec "Reading current persisted state" says `readPersistedState(spec)`; code passes `{lenientDependsOn: true}` for repair ops. Allowed by the "Spec ID validation" requirement; the first requirement text could mention the option.
4. LOW (potential gap, spec silent): missing-state path never applies the post-mutation fully-qualified guard, but set/add entries were parsed and normalized so it cannot trigger. No issue.
5. INFO: `remove` entries are not checked against workspaces and a mismatch (e.g. `nope:x`) is just a literal; spec allows ("matched literally, never rejected").

### Test coverage (update-persisted-spec-deps.spec.ts)

Covered: remove no-op on missing state; invalid specId/add entry rejected with no read/write; missing dep target; missing spec; bare ID qualified; remove invalid stored value (lenient); InvalidSpecLockError propagated from readPersistedState; clear; unknown workspace; lenient read + bare remove normalized; remaining invalid after repair -> InvalidSpecLockError; add strict against invalid lock. Additional set-creates-state and conflicting-flags tests exist in get-persisted-spec-deps.spec.ts (describe 'UpdatePersistedSpecDeps' misplaced in that file).

### Missing tests

- Exclusivity/min-op before any I/O (no spy on readPersistedState); the only conflict test (set+add, in the wrong file) uses valid existing targets and does not assert I/O absence. Hence discrepancy 1 is untested; add tests for: no operation on lock-less spec, clear+remove, set+add with I/O spies, set+remove.
- Scenario "Clear and set repair a lock with invalid dependencies" for `set` (clear covered only on valid lock and via lenient path; confirm both).
- Scenario "Invalid lock on strict read ... field other than dependsOn" for a mutation of kind remove/set/clear (only generic propagation tested).
- Remove-before-add with overlapping ID (["core:a","core:b"] -> remove a, add a,c).
- Set/clear against missing state (clear creates with created=true; set does not invoke derivation) - set partially tested, clear not.
- Non-empty add on lock-less spec using resolveInitialPersistedDependsOn + empty-base fallback; empty add no-op.
- Patch carries only dependsOn (other fields carried through), stale expectedRevision -> ArtifactConflictError propagation, readOnly workspace -> ReadOnlyWorkspaceError, originalHash captured as expectedRevision, factory resolver test.

### Summary counts

Requirements 13 / fully implemented 12 / partial 1 (mutual exclusivity ordering + no-op-on-missing-state hole). Discrepancies: 0 high, 1 medium (code-wrong), 3 low (spec wording), 1 info. Missing tests: ~9.

---

## 3. core:get-persisted-spec-deps

### Requirements summary

Input; spec ID validation before repository resolution (InvalidSpecIdError / WorkspaceNotFoundError quoting original; bare -> default; result specId qualified); reads via readPersistedState only; result for initialized (stored order, no dedupe); uninitialized -> [] + initialized:false; unknown spec typed error; factory via resolveGetPersistedSpecDepsDeps (specs map).

### Implementation status

Fully implemented. parseSpecId with `specRepositories.keys()` at top; WorkspaceNotFoundError carries `in spec ID '<original>'` and known list; SpecNotFoundError on missing spec; dependsOn returned unchanged; initialized flag. Factory helper exists (resolveGetPersistedSpecDepsDeps). `specRepositories` field name vs spec's `specs` - naming only.

### Discrepancies

1. LOW (spec-wrong, naming): spec says deps include `specs: ReadonlyMap`; code names it `specRepositories`. Wording only.
2. INFO: WorkspaceNotFoundError after parseSpecId is unreachable (parseSpecId already checks); defensive only.

### Test coverage

Covered: uninitialized; invalid specId ('' and 'Core/Foo') with get/readPersistedState spies not called; bare resolves default; unknown workspace; qualified accepted; spec-lock read order exists in other tests.

### Missing tests

- 'Bad Id' quoted in error message; message quoting full original value for WorkspaceNotFoundError.
- Stored order preserved with duplicates; no-materialize/no-direct-lock-read scenario; unknown spec -> SpecNotFoundError (not an empty result); factory resolve test; "specId is required" scenario (type-level).

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low, 1 info. Missing tests: ~5 (low).

---

## 4. core:get-persisted-spec-implementation

### Requirements summary

Same pattern: spec ID validation first; read via readPersistedState; implementation links returned unchanged (file-level vs symbol-level); uninitialized -> [] + initialized false; unknown spec typed error; factory.

### Implementation status

Fully implemented (get-persisted-spec-implementation.ts); same parse/lookup structure as spec 3. Result returns persisted?.implementation ?? [] unchanged.

### Discrepancies

1. LOW (spec-wrong, naming) factory deps naming as in spec 3 (not verified in detail for the implementation factory).
   No code-wrong findings.

### Test coverage

Covered: uninitialized; invalid specId rejected before repository call; bare resolves default; unknown workspace; qualified accepted.

### Missing tests

- 'Bad Id' quoting; unknown spec -> SpecNotFoundError; file-level vs symbol-level links passed through unchanged; no metadata/lock direct read; factory resolver test.

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low. Missing tests: ~4.

---

## 5. core:get-persisted-spec-optimizations

### Requirements summary

Input (specId + optional field filter); spec ID validation; reads via readPersistedState; uninitialized -> initialized:false/fresh:false; initialized without optimizations -> empty result; per-field freshness (added/removed artifact, hash changes, lastModified diagnostic only, schema change); field result shape; aggregate freshness; unknown spec error; factory.

### Implementation status

Implemented. Validation block identical to spec 3 and precedes repository access. Freshness logic unchanged by this change (classifyOptimizationFieldFreshness); aggregate fresh = included fields non-empty and all fresh; filtered field absent -> `missing`.

### Discrepancies

1. LOW (code/spec nuance): spec scenario "Initialized spec with no optimizations block returns empty result" - code returns `{initialized:true, fresh:false}` with no field keys; matches. Note code throws a generic `Error('schema resolution failed')` when schema raw (not typed) - violates spirit of default:\_global/error-handling-conventions (code-wrong, LOW, pre-existing, same in update-persisted-spec-deps `_createMissingState`). Out of change theme.
2. LOW (spec-wrong, naming) factory deps naming.

### Test coverage

Covered: uninitialized; missing field when filtered field absent; initialized with no fields -> fresh false; invalid specId before repository call; bare default; unknown workspace.

### Missing tests

- Freshness scenarios (artifact added/removed, hash change, lastModified-only, schema change); stale/fresh field shape and reasons; aggregate fresh with all fields/with filter; field filter restricts; unknown spec -> SpecNotFoundError; qualified accepted; 'Bad Id' quoting; factory resolver test. (Most pre-date this change; only validation scenarios are in this change's scope.)

### Summary counts

Requirements 10 / implemented 10. Discrepancies: 0 high, 0 medium, 2 low. Missing tests: ~9 (mostly pre-existing, 3 in scope).

---

## 6. core:get-persisted-spec-schema

### Requirements summary

Input; spec ID validation; read via readPersistedState; uninitialized -> SpecNotInitializedError; result returns exact persisted schema identity; unknown spec -> SpecNotFoundError before initialization check; factory.

### Implementation status

Fully implemented; order: parse -> repo -> spec lookup (SpecNotFoundError) -> persisted read -> SpecNotInitializedError.

### Discrepancies

1. LOW (spec-wrong, naming) factory deps naming.
   No code-wrong findings.

### Test coverage

Covered: SpecNotInitializedError when no lock; invalid specId before repository call; bare resolves before throwing SpecNotInitializedError; unknown workspace; qualified accepted with lock.

### Missing tests

- Unknown spec -> SpecNotFoundError before initialization check; 'Bad Id' quoting; no-direct-lock/metadata read; factory resolver test.

### Summary counts

Requirements 7 / implemented 7. Discrepancies: 0 high, 0 medium, 1 low. Missing tests: ~4.

---

## Overall summary (6 specs)

- High: 0. Medium: 1 (code-wrong). Low: ~10 (mostly spec wording/naming). Missing tests: ~36, most low priority.
- Top finding (MEDIUM, code-wrong): UpdatePersistedSpecDeps does not pre-validate operation exclusivity / minimum operation. Guards live only in applyDependsOnMutation after repo reads; with no operation against a lock-less spec the use case silently returns `{dependsOn: [], created: false}` instead of throwing a typed validation error; and verify scenario "rejected before reading or writing persisted state" is not satisfied. Fix: replicate update-spec-deps' up-front guards (or extract a shared `assertDependsOnOperation(input)`), add tests with readPersistedState spies. Suggested fix location: packages/core/src/application/use-cases/update-persisted-spec-deps.ts execute() top.
- Theme checks pass: no comma splitting (all lists are readonly string[], never joined; comma-ID test exists in update-spec-deps), parseSpecId truly validates (empty/blank/malformed -> InvalidSpecIdError, bare -> default:), clear implemented in both draft and persisted updaters via shared helper, lenient read repair path for invalid spec-lock dependsOn with InvalidSpecLockError naming `dependsOn.<i>`.
- Coverage gaps worth closing in scope: persisted-deps exclusivity/min-op/ordering tests, clear/set against missing state, repair scenarios for `set`, 'Bad Id'/original-value quoting in get-\* tests, factory resolver tests (no test references resolveUpdateSpecDepsDeps/resolveGetPersistedSpecDepsDeps).

---

## \_partial-core-persisted.md

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

---

## \_partial-cli-skills.md

# Partial compliance report: CLI + skills (change support-commas-in-names)

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation.
Method: spec-preview merged spec+verify read in full; source read of packages/cli/src/commands/{change,spec,graph}, helpers/confirm.ts, handle-error.ts, core UpdatePersistedSpecDeps/parseSpecLock/InvalidSpecLockError; CLI tests grep; skills templates diff; commander behaviour verified empirically (variadic + custom argParser, repeated `--file`).
Read-only: no code/spec edits.

## Cross-cutting findings

- No leftover references to the deleted `packages/cli/src/helpers/spec-path.ts` in src/ or tests (only negative "does not import helpers/spec-path" assertions in change-create.spec.ts and change-edit.spec.ts); no dist/helpers dir exists. Deletion is clean.
- No comma splitting remains in any command in scope: `collect` helper (`[...previous, value]`) for `--spec/--add-spec/--remove-spec/--add/--remove/--set/--dep/--symbol`; `implementation.ts` no longer does `f.split(',').map(trim)`; `graph index --exclude-path` argParser now `concat(val)`. Remaining `parseCommaSeparatedValues` users (`--skip-hooks`, `--kind` graph) are enum lists, out of scope.
- Committed spec artifacts outside the change still carry the old behaviour (expected until archive): `specs/cli/change-implementation/verify.md:41,97` (`--file f1.ts,f2.ts`), `specs/cli/change-implementation/spec-lock.json` rules ("comma-separated paths"). Not a defect, but the lock metadata will need regeneration on archive.
- UpdatePersistedSpecDeps repair path is real: `remove/set/clear` read the lock with `lenientDependsOn: true`; `add` stays strict. So "invalid spec-lock -> actionable error CLI can repair" is implemented end to end (parse -> use case -> handle-error hint).
- Tests in cli mock the kernel/use cases and `confirmOrExit`; true "spec IDs validated" behaviour is covered only in core (out of this partial's scope).

## cli:change-implementation

Requirements summary: list/review/start/add/remove/resolve/unresolve/ignore; resolve/unresolve/ignore take whole file names (repeat `--file` or list after one), never split on commas or trimmed; all values (`--file`, `--symbol`, `--spec`) forwarded raw; text listings one name per line; JSON/TOON arrays.

Implementation status: Implemented.

- resolve/unresolve/ignore: `--file <paths...>` required option; `files` passed unchanged; `file: files[0]` plus `files`. Verified commander accumulates `--file a --file b,c d` -> `['a','b,c','d']`.
- add/remove: `--spec` raw, single `--file`, `--symbol` via local `collectString` (no splitting).
- Text list: files by state, out-of-scope sidecars, symbols, candidates now one per line (`(none)` placeholder).
- CLI does not validate spec IDs (core does).

Discrepancies:

1. MEDIUM, code/template-wrong (adjacent to this change): `packages/skills/templates/skills/specd-archive/SKILL.md.tpl` and `specd-implement/SKILL.md.tpl` still say "Files with active confirmed links **cannot** be ignored." Spec requires ignore to preserve links and "MUST NOT reject the state transition solely because links still exist"; verify scenario "Ignoring a linked tracked file preserves confirmed links". Evidence: template diff only changed the comma lines, left that sentence. Template is wrong (spec is right; code does not reject).
2. LOW, spec-gap: spec says `--file` for `add`/`remove` is `<path>` and command list "list, add, resolve, ignore, remove, review" in the Command-signature scenario omits `unresolve` and `start` (both implemented). Spec/verify wording incomplete.
3. LOW, code-quality: `collectString` in implementation.ts duplicates `helpers/collect.ts`. Same duplication exists pre-change in graph search/impact/hotspots and spec/search.ts.
4. LOW, spec-gap: "Raw values" requirement says symbols are never split; `--symbol` text rendering still joins nothing, OK. No discrepancy; noted for completeness.

Test coverage (cli/test/commands/change-implementation.spec.ts): resolve variadic (`--file f1.ts f2.ts`) covered; ignore comma-named file covered; ignore `f3.ts,f4.ts` one name + ImplementationFileNotFoundError covered; raw spec ID on add; list text one-per-line for files (`a,b.ts`); unresolve basic; add missing file.
Missing tests:

- resolve with a comma-named file (scenario "Resolve a file whose name contains a comma"), and "One missing file aborts the whole resolve" (CLI-level forwarding of two files incl. missing).
- unresolve with repeated `--file` plus comma name (scenario "Unresolve accepts repeated names and names with commas").
- resolve with repeated `--file f1 --file f2` (only variadic form tested, though both are specified).
- `--symbol "a,b"` forwarded as one symbol on add/remove.
- one-per-line rendering of symbols, candidates and out-of-scope sidecars (only file lines asserted).
- JSON/TOON keep names as arrays (not asserted).
- "Subcommands are reachable" help scenario.

Summary counts: requirements 12 (11 met, 1 partially verified by tests); discrepancies 1 medium, 3 low; missing tests 7.

## cli:change-edit

Requirements summary: `--add-spec/--remove-spec` repeatable, forwarded unchanged to EditChange, never split; command validates/qualifies nothing; usage error without flags; use case rejects invalid ID (InvalidSpecIdError quoting full value), unknown workspace (WorkspaceNotFoundError), readOnly; invalidation warning; text/JSON output.

Implementation status: Implemented. `collect` accumulators, `addSpecIds/removeSpecIds` passed as received, no spec-path/SpecdConfig read in the command, errors via generic `handleError` (exit 1, message quotes use-case text).

Discrepancies:

1. LOW, spec-wrong: command also exposes `--invalidation-policy` (and requires at least one of four flags); spec signature lists only `--add-spec/--remove-spec/--description/--format`, and error message "at least one of --add-spec, --remove-spec, --description, or --invalidation-policy". Pre-existing; spec should list it.
2. LOW, spec-gap: spec "Output on success" JSON bullet is empty (`outputs (encoded...):` with nothing after) - truncated schema block in spec.md; code emits result,name,specIds,workspaces,invalidated,state (matches verify scenario).
3. INFO: "Workspace derivation" is stated as CLI logic ("the CLI derives...") but is now fully in EditChange; contradicts "command must not resolve workspaces". Spec wording stale, code is consistent with the newer requirements.

Test coverage: no-flags exit 1; forwards raw `--add-spec` and maps WorkspaceNotFoundError; comma ID forwarded as one value with InvalidSpecIdError; readOnly mapping; invalidation warning; JSON output; "does not import helpers/spec-path".
Missing tests: "Command resolves no workspace itself" source-inspection scenario (partially covered by the no-import check but not by a SpecdConfig-not-read assertion); invalid ID `"Bad Id"` scenario at CLI level; remove-spec raw forwarding with comma; removing-last-spec / remove-not-in-specIds error mapping.

Summary counts: requirements 7 (7 met); discrepancies 0 medium, 3 low/info; missing tests 4.

## cli:change-deps

Requirements summary: `--add/--remove/--set` repeatable whole IDs; `--clear` (exclusive with add/remove/set, requires specId), `--force` skips confirmation; non-TTY without `--force` -> exit 1 with message mentioning `--clear` requires confirmation and `--force`; decline -> "cancelled", exit 0; use case rejects empty/blank/malformed IDs, unknown workspace; deferred missing specs accepted.

Implementation status: Implemented.

- `confirmOrExit` (helpers/confirm.ts): force -> true; non-interactive -> cliError(exit 1); prompt via @clack/prompts; decline -> command prints `cancelled`.
- Conflict checks fast-fail in CLI; use case remains authority (`clear: true` forwarded).
- `--set ""` is forwarded (`opts.set.length > 0` true), so rejection happens in use case.

Discrepancies:

1. MEDIUM, code-wrong (minor behaviour): display mode (`change deps <name> <specId>` no flags) compares the raw `specId` against `change.specIds` (canonical `default:...`) and looks up `specDependsOn[specId]` by raw key. A bare ID (`auth/login`), which the spec's own modify scenarios use, therefore errors with "not in the scope" in display mode while the same ID works for `--add`. Spec requires the command not to normalise IDs, so either spec must say display needs a canonical ID or display should delegate to a core lookup (e.g. GetStatus resolving the ID). Evidence: deps.ts lines `change.specIds.includes(specId)` and `specDependsOn[specId] ?? []`.
2. LOW, code-wrong: clear confirmation ordering - conflict/specId checks run after `resolveCliContext` (fine), but the confirmation prompt appears before the spec ID is validated or existence verified, so a user can confirm and then get InvalidSpecIdError/SpecNotFound. Spec: "ask for confirmation before calling the use case" - compliant; UX nit only.
3. LOW, spec-gap: error-cases list says "`--set`, `--clear`, and `--add`/`--remove` combined in a way that is not allowed" while Constraints give the precise rule; fine. Help text listing `--set` as "repeatable" matches.
4. INFO: Output spec example for add scenario (verify "the output is:" block) is empty/truncated.

Test coverage (change-deps.spec.ts): all original scenarios; `--clear` with add/remove/set (parametrised); `--clear` without specId; `--set ""` rejection; `--set core:a,b` forwarded as one; raw bare specId forwarded; confirm accepted/declined/`--force`; non-TTY error (via mocked `confirmOrExit`).
Missing tests:

- `--add " "` blank scenario.
- "Unknown workspace in a dependency" and "dependency on a spec not created yet is accepted" at CLI level (only core-level presumably).
- Help lists `--clear` and `--force`.
- `confirmOrExit` itself has NO unit test (no test/helpers/confirm.spec.ts): real non-TTY branch, `isTTY` detection, default clack prompt cancel handling, derived message fallback are untested everywhere because all command tests mock it.
- JSON/TOON output of declined clear (`{result:'cancelled'}`), not in spec either (spec says only "prints that it was cancelled").

Summary counts: requirements 4 (4 met, 1 with edge defect); discrepancies 1 medium, 2 low, 1 info; missing tests 5.

## cli:spec-deps

Requirements summary: list/add/remove/set/clear; `clear [--force]` confirmed like change deps; raw IDs, never comma-split; one `updatePersistedDeps` call per mutation; error mapping incl. InvalidSpecLockError with message naming spec/location/field path and, for `dependsOn.*`, a following repair hint naming `specd specs deps remove`, `set`, or `clear`; `.allowExcessArguments(false)` on every leaf.

Implementation status: Implemented with two wording issues.

- All five leaves call `.allowExcessArguments(false)`; each mutation maps flags directly to `UpdatePersistedSpecDepsInput` (`add`, `remove`, `set`, `clear: true`).
- `InvalidSpecLockError` branch in handle-error.ts: exit 1, no stack, appends "Repair with: specd specs deps remove|set|clear <spec-id> (use --force to skip confirmation on clear)" when fieldPath is `dependsOn` or `dependsOn.N`.
- Core repair path verified (lenient read on remove/set/clear).

Discrepancies:

1. MEDIUM, code-wrong (core message): `InvalidSpecLockError` message ends with "Correct that field in the file." and the CLI then appends "Repair with: specd specs deps ...", so the user sees contradictory instructions (edit file by hand vs use command) for dependsOn failures. Spec wants the actionable CLI hint; the trailing sentence should be dropped or made conditional. Evidence: core/domain/errors/invalid-spec-lock-error.ts message tail + handle-error.ts hint.
2. LOW, code-wrong: the hint text is `specd specs deps remove|set|clear`, which does not literally contain `specd specs deps set` / `specd specs deps clear`; spec says the hint "naming `specd specs deps remove`, `set`, or `clear`". Borderline; a grep-style check for each command name would fail for `set`/`clear`. Also hint mentions `--force` for clear only; fine.
3. LOW, code-wrong: non-interactive error for `specs deps clear` reads "--clear requires confirmation; pass --force to skip it", but that subcommand has no `--clear` flag. Spec: "an error stating that clearing requires confirmation and that `--force` skips it". Use e.g. "clearing requires confirmation; pass --force to skip it" for specs deps clear. The test asserts only `--force`, and it uses the mocked helper so the real message is not checked.
4. LOW, spec-wrong/gap: `list` does not run through repair (as intended); the spec scenario shows `list` throwing InvalidSpecLockError with a repair hint, consistent. But `specs deps add` on an invalid lock also surfaces the hint (add stays strict) - spec does not say so; behaviour is sensible.
5. LOW: help signature in spec uses `<spec-id>`, code arg name is `<specPath>` (docs also `<specPath>`). Cosmetic.
6. INFO: `add`/`remove` use `requiredOption('--dep', ..., collect, [])` plus a dead `opts.dep.length === 0` check; since collect starts at `[]` and requiredOption demands a value, the check is unreachable. Harmless.

Test coverage (spec-deps.spec.ts): list delegates; set delegates; `--dep ""` rejected; missing target exit 1; InvalidSpecLockError exit 1, contains `dependsOn.0`, no stack; clear confirm accepted/declined/force/non-TTY (mock).
Missing tests:

- Repair hint presence/format for `dependsOn.*` and absence for other fields (handle-error.spec.ts has no InvalidSpecLockError test at all; spec-deps test does not assert the hint or location).
- `add --dep "core:a,b"` forwarded as one value and rejected (scenario "Dependency with a comma is one value").
- Bare spec ID forwarded unchanged (`_global/architecture`).
- list on uninitialized spec (text and `initialized:false` JSON); remove on uninitialized no-op; add/remove multi-`--dep` forwarding; ArtifactConflictError and ReadOnlyWorkspaceError mapping; `--format json` valid output; `.allowExcessArguments(false)` constraint.
- Integration test that remove/set/clear actually repair a lock with invalid `dependsOn.0` through the CLI (only core use case has lenient flag).

Summary counts: requirements 8 (7 met, 1 partial: error mapping hint/wording); discrepancies 1 medium, 4 low, 1 info; missing tests 8.

## cli:graph-index

Requirements summary: `--exclude-path <pattern>...` repeatable and listable, each value one whole gitignore pattern, never split on commas; remaining requirements unchanged (SDK worker, output sections, diagnostics, docs).

Implementation status: Implemented. The only source change is `argParser((val, prev) => (prev ?? []).concat(val))` (was `concat(val.split(','))`). Verified with real commander: `--e a b,c --e '{a,b}/**' d` -> `['a','b,c','{a,b}/**','d']`. Docs (`docs/cli/cli-reference.md`) updated: removed "comma-separated values accepted"; option row now `<glob...>`; no remaining comma wording.

Discrepancies:

1. LOW, spec-gap: spec text says `--exclude-path <pattern>`, code/docs use `<glob...>` metavar. Cosmetic.
2. INFO: the "CLI reference documentation" requirement lists six subcommands; not re-audited here beyond the `--exclude-path` row (unchanged by this change).

Test coverage (graph-index.spec.ts): `{a,b}/**` single pattern (forced descriptor test) and repeated `--exclude-path` flags covered.
Missing tests: "Several patterns listed after one option" (`--exclude-path 'app/tmp/' 'dist/'`) has no test; no test mixing list and repeat; no test for `a,b` plain (non-brace) value remaining unsplit (brace case is covered).

Summary counts: requirements 11 (all met); discrepancies 0 medium, 1 low, 1 info; missing tests 2.

## cli:change-create

Requirements summary: `--spec <id>` repeatable, each value passed to CreateChange unchanged, never split; no CLI workspace parsing or ownership checks; CreateChange validates IDs (InvalidSpecIdError), unknown workspace (WorkspaceNotFoundError), readOnly; no schema prelude; overlap check delegation; JSON/text output.

Implementation status: Implemented. `specIds: opts.spec` forwarded as-is; `includeOverlapCheck: true` only when specs present; no `getActiveSchema`; overlap warning from `overlapReport`; errors via `handleError`.

Discrepancies:

1. LOW, spec-wrong: Constraints say "The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case", but the command performs no validation (CreateChange/core owns it). Pre-existing; spec should say use case validates. Not verified in core here.
2. LOW, spec-gap: spec signature omits `--invalidation-policy` (present) and the Output requirement text lists `changePath` while the base "Output on success" says "No further output is produced" and "JSON output on success" duplicates "JSON output includes changePath" (the `{ result, name, state }` schema in the help text omits `changePath`: help says `{ result: "ok", name: string, state: string }` but output includes `changePath`). Code-wrong minor: help schema stale.
3. INFO: Output-on-success bullets in spec.md are truncated (empty code blocks).

Test coverage (change-create.spec.ts): missing name; empty specIds; raw bare ID forwarded; explicit workspace forwarded; unknown workspace mapping; comma ID forwarded and InvalidSpecIdError; no spec-path import; success text/JSON; duplicate name; no getActiveSchema; includeOverlapCheck; overlap warning; readOnly mapping; schema identity persisted (real use case); real DetectOverlap integration.
Missing tests: `"Bad Id"` invalid-ID scenario (only comma ID tested); "Multiple readOnly specs each produce an error" and "Mixed owned and readOnly" at CLI level; "No overlap check when specIds empty" asserting `includeOverlapCheck` is not true (the empty case exists but verify assertion unclear); a no-ownership-read source inspection.

Summary counts: requirements 9 (9 met); discrepancies 0 medium, 2 low, 1 info; missing tests 4.

## skills:workflow-automation

Requirements summary: new/changed requirement "Implementation traceability policy": when resolving/ignoring multiple files agents SHOULD pass one whole name per value (`--file a --file b` or `--file a b`) and MUST NOT join with commas. Other requirements unchanged (diagnostic priority, data extraction, spec read surface, outline, repair, canonical plural, necessity, validation, context optimization).

Implementation status: Implemented in templates. `specd-archive/SKILL.md.tpl` and `specd-implement/SKILL.md.tpl` now teach `--file <path1> --file <path2> ...` and no longer say "comma-separated". Test `template-workflow.spec.ts` "does not teach comma-joined --file lists for implementation tracking" added.

Discrepancies:

1. MEDIUM, template-wrong: both templates still state "Files with active confirmed links cannot be ignored" which contradicts cli:change-implementation (ignore preserves links; see above). Not covered by this spec but shipped in the same lines being edited.
2. LOW, test weakness: the negative regexes `/--file\s+[^\n]*\w,\w/` and `/--file\s+<path1>,<path2>/` only catch `a,b` forms with word chars on both sides; `--file a.ts, b.ts` or `--file "a, b"`-style regressions in non-listed templates are missed, and only the two named templates are checked (verify the test's file list). The positive scenario "Agent resolves several files with repeated options" is only implicitly covered (no assertion that `--file <path1> --file <path2>` appears in both templates, if not already asserted).
3. LOW, code-wrong: agent skill/doc templates elsewhere (other agent plugins, `.agents/skills`, specd-fasttrack, docs/guide/skills.md) were not audited for remaining comma-joined `--file` examples; grep over docs/ and skills templates found none, but generated `.agents/`/plugin outputs were not scanned.

Test coverage: template-workflow.spec.ts negative checks as above.
Missing tests: positive assertion that archive and implement templates show repeated `--file` (and/or list-after-one-option) forms for both resolve and ignore; assertion that `--format toon` / text guidance unchanged is pre-existing.

Summary counts: requirements 10 (10 met); discrepancies 1 medium, 2 low; missing tests 2.

## Overall

Totals: discrepancies 3 medium, 12 low, 5 info (de-duplicated: the template "cannot be ignored" item counted once under change-implementation and again under skills).
Top issues:

1. InvalidSpecLockError message ("Correct that field in the file.") contradicts the CLI repair hint (core wording).
2. `confirmOrExit` and the real non-TTY/--force flows have no direct tests (all command tests mock it); the `specs deps clear` non-TTY message mentions a non-existent `--clear` flag.
3. `change deps <name> <specId>` display mode compares raw specId against canonical specIds, so bare IDs fail while modify mode accepts them.
4. Skill templates still claim linked files cannot be ignored (contradicts cli:change-implementation).
5. Test gaps: comma-named files for resolve/unresolve, `--exclude-path` listed-after-one-option, spec-deps comma `--dep` and lock-repair hint, handle-error InvalidSpecLockError, change deps blank `--add " "`.
