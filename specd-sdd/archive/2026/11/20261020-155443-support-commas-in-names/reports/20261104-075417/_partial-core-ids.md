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
