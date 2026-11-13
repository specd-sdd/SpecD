# Partial C - core foundation (change support-commas-in-names)

Scope: core:spec-id-format, core:spec-lock, core:workspace, core:config, core:config-loader, core:spec-metadata, core:spec-repository-port, core:archived-change-index-entry, core:generate-metadata, core:validate-specs, core:preview-spec.
Method: read change deltas (deltas/core/\*/spec.md.delta.yaml), compared against packages/core/src and packages/core/test. Spec-preview merged text was generated but deltas were the audit basis. Paths below are under packages/core unless noted. Line numbers are approximate to the read version.

Overall: implementation is highly compliant. One real code-vs-spec gap (F1), a few spec-wording / low-severity items, and a handful of missing tests.

---

## core:spec-id-format

Requirements: canonical `workspace:capPath`; bare path -> default (core normalizes; contextual callers pass defaultWorkspace); unknown workspace -> WorkspaceNotFoundError (domain class, re-exported by application); parsing steps; mandatory normalization; Workspace name rule `^[a-z][a-z0-9-]+$` + not Windows device, exposed once as isValidWorkspaceName; Capability segment rule `^[a-z0-9_][a-z0-9_-]*$` + not device; Syntax validation (InvalidSpecIdError / INVALID_SPEC_ID, explicit reject list incl. backslash message); Single validator parseSpecId(id, {workspaces, defaultWorkspace}); use cases validate, adapters pass raw; patterns via parseSpecPattern, schema refs via registry; persisted IDs fully qualified; remove paths do not validate.

Implementation status: IMPLEMENTED.

- src/domain/services/parse-spec-id.ts: all 6 steps; blank rejected; first-colon split; empty path; ':' in path; empty segment; device name; backslash message "use '/' as the only path separator"; workspaces as Iterable<string|{name}>; returns qualified specId; throws WorkspaceNotFoundError(workspace,{specId,known}) quoting ID + known list. No application types imported.
- src/domain/services/spec-id-rules.ts: the only place of both regex literals (also enforced by test/spec-id-guards.spec.ts).
- src/domain/services/windows-device-name.ts: con/prn/aux/nul/com1-9/lpt1-9 whole-segment, case-insensitive.
- src/application/errors/workspace-not-found-error.ts re-exports the domain class (instanceof identical).
- src/domain/services/parse-spec-pattern.ts: `*` only alone / after `ws:` / trailing `/*`; qualifier validated with isValidWorkspaceName; segments with isValidCapabilitySegment; used by config-schema.ts:51 (load) and \_shared/spec-pattern-matching.ts (match) with defaultWorkspace -> same parser both sides.
- src/infrastructure/fs/schema-registry.ts:20-27 splitSchemaReference uses isValidWorkspaceName; schema name not subject to segment rule.
- src/domain/value-objects/spec-path.ts uses isValidCapabilitySegment + device check.
- Persisted IDs: parse-spec-lock.ts and parse-metadata.ts (strict) use isFullyQualifiedSpecId; metadata read path (specMetadataSchema) stays lenient (dependsOn z.string()).
- archive-change.ts:338 uses parseSpecId (no raw split of ':').
- update-persisted-spec-implementation.ts:224 splits `file` on ':' but this is a file locator, not a spec ID, and validates with isValidWorkspaceName (OK, not a violation).

Discrepancies:

1. Spec says "Operations that remove an entry from a persisted spec-lock dependsOn list SHALL NOT validate its syntax" - code honours this (tryNormalizeDepId swallows errors; update-persisted-spec-deps.ts:23-32) BUT see F1 below: a syntactically valid _bare_ stored entry is qualified on remove and then no longer matches the stored string.
2. Backslash handling order: parseSpecId checks device name before backslash and the generic segment rule; message for `ws:auth\login` correctly says '/' is the only separator. Spec-conform. No discrepancy.
3. Spec "message SHALL quote the full original ID and name the violated rule" - workspace-invalid message names rule text; segment messages name segment. OK.

- Spec wrong? none. Code wrong? none besides F1.

Test coverage: test/domain/services/parse-spec-id.spec.ts (invalid it.each, backslash, workspaces as array/Set/Map.keys/objects, unknown workspace message, instanceof across import paths, isFullyQualifiedSpecId); spec-id-rules.spec.ts; parse-spec-pattern.spec.ts (misplaced \*, one-letter, uppercase, InvalidSpecPatternError code, wrapped by validateContextPattern); test/spec-id-guards.spec.ts (regex literals only in spec-id-rules; every specs/\*\*/spec-lock.json parses).
Missing tests: (a) blank-only string (" ") and `:`/`ws:`/`:path` explicit cases - verify the it.each list at parse-spec-id.spec.ts:41-68 contains them (not individually confirmed); (b) schema-registry splitSchemaReference with invalid workspace qualifier (`#A:foo`, `#c:foo`) - no test found; (c) match-time InvalidSpecPatternError from a programmatic bad pattern through listMatchingSpecs/compile-context/list-specs ("never ignored, never a warning") - no use-case-level test found; (d) "Adapters MUST NOT call parseSpecId for display" is a CLI concern (other partial).
Summary: 14 requirement-groups, 14 implemented, 0 spec-wrong, 0 code-wrong (1 interaction bug filed under F1), 3 missing tests.

---

## core:spec-lock

Requirements: persisted dependsOn are fully-qualified valid IDs, bare/empty/malformed rejected (no legacy form); typed InvalidSpecLockError / INVALID_SPEC_LOCK for any structural failure (never raw ZodError), message names spec ID, location, field path (e.g. dependsOn.0), rule; message MUST NOT prescribe repair; strict reads by default, no silent drop, no rewrite on read; only exception lenientDependsOn used by repair mutations remove/set/clear and by writePersistedState revision check.

Implementation status: IMPLEMENTED.

- domain/errors/invalid-spec-lock-error.ts: code INVALID_SPEC_LOCK; message "Invalid spec-lock for '<id>' at <loc>: field '<path>' <reason>." no repair advice.
- domain/services/parse-spec-lock.ts: JSON parse error -> InvalidSpecLockError(fieldPath ''); ZodError caught -> first issue path/message; strict specIdString via isFullyQualifiedSpecId; lenient schema variant keeps every other field strict (incl. nested optimizations).
- infrastructure/fs/spec-repository.ts:\_readSpecLock (~795-812) passes {specId, location}; readPersistedState forwards option; writePersistedState reads lenient for revision (~559). Reads never write.
- update-persisted-spec-deps.ts:157-182: lenient only for clear/set/remove; `add` alone strict; post-mutation validation raises InvalidSpecLockError('dependsOn.N') if invalid entries remain.

Discrepancies:

- F1 (code wrong, medium/low): stored bare entry e.g. `dependsOn: ["auth/shared"]` (invalid per spec, "repairable by removing"). `remove: ['auth/shared']` is normalized by tryNormalizeDepId to `default:auth/shared`, which does not match the stored string, so the entry survives and the post-check throws InvalidSpecLockError (update-persisted-spec-deps.ts:141-142, 167-178). Repair is only possible via `set`/`clear` or by typing... nothing - removing exact stored string is impossible for a bare entry. Existing test (update-persisted-spec-deps.spec.ts:242 "normalizes a bare remove entry") tests the opposite case (stored qualified, remove bare). Suggested fix: match remove against both the raw and normalized forms. Alternatively spec could say bare entries are repaired only by set/clear - but spec text says "removing, replacing, or clearing", so code is the side to change.
- F2 (code vs spec wording, low): the post-mutation InvalidSpecLockError in update-persisted-spec-deps.ts:171 passes location `undefined`, while spec says the message names the lock file location. That error is raised for a computed list, not a disk read, so arguably out of the "reading" requirement. Spec could say "when read from disk".
- F3 (spec wording, low): "the violated rule" - the Zod message is a generic "must be a fully-qualified valid spec ID (workspace:capabilityPath)" and does not say which rule (comma, uppercase, etc.). Acceptable but spec-id-format promises per-rule messages for IDs; lock error doesn't surface them. Either tone down spec or enrich message with InvalidSpecIdError.reason.

Test coverage: domain/services/parse-spec-lock.spec.ts (invalid JSON no Zod, it.each invalid deps, mix strict, lenient, other fields still strict, error code/message with no repair advice); infrastructure/fs/spec-repository.spec.ts:1281-1376 (strict read InvalidSpecLockError fieldPath dependsOn.0, lenient read, other fields strict, no rewrite, writePersistedState with invalid lock); update-persisted-spec-deps.spec.ts:163-315; spec-id-guards.spec.ts (repo's own locks valid).
Missing tests: remove of a stored _bare_ entry (F1); clear on an invalid lock end-to-end in use case (clear test at :207 uses valid lock - verify); set on an invalid lock.
Summary: 3 requirements, 3 implemented; code-wrong 1 (F1); wording 2 (F2,F3); 3 missing tests.

---

## core:workspace

Requirements: workspace name rule shared (two+ chars); reserved: default, root, Windows device names (whole name only; `con-foo` legal); prefix segments follow capability segment rule; spec IDs qualified with core owning bare normalization; project init validates workspace id.

Implementation status: IMPLEMENTED.

- infrastructure/fs/config-loader.ts:391 isValidWorkspaceName(name) -> ConfigValidationError "is not a valid workspace name"; `root` rejected at :381-386; `default` required.
- application/ports/config-schema.ts:100-113 PrefixZodSchema uses isValidCapabilitySegment, rejects empty/leading/trailing slash/`.`/`..`.
- cli project init (packages/cli/src/commands/project/init.ts:63,201) uses isValidWorkspaceName re-exported by @specd/sdk (sdk/src/core-reexports.ts:573).

Discrepancies:

- F4 (spec wrong/incomplete, low): spec lists `default` as reserved "for spec workspaces" and also mandatory; fine. But loader order: prefix check is in Zod schema, device-name check for prefix segments is covered by isValidCapabilitySegment (ok).
- Base (pre-change) specs/core/workspace/spec.md:11 still says `/^[a-z][a-z0-9-]*$/` and spec-lock.json cache (specs/core/workspace/spec-lock.json:42) too; the delta supersedes them. Not a contradiction post-archive; metadata/lock regen needed after archive.
  Test coverage: config-loader.spec.ts:106 (a, Core, nul rejected), :142 (device name), :175/:212 messages, :216 (device-prefix name accepted), :253 (two-char accepted), prefix tests :599-760 (leading slash, dot segment, uppercase).
  Missing tests: prefix segment that is a Windows device name (e.g. `team/nul/x`); prefix containing comma; `project init` workspace validation test lives in cli package (other partial).
  Summary: 5 requirements, 5 implemented, 0 code-wrong; 2 missing tests.

---

## core:config

Requirements: workspace names and context patterns use shared rules; prefix segments follow segment rule; parseSpecPattern at load and match time, same parser; qualifier-less patterns use contextual default workspace supplied by caller; unknown workspace in pattern -> warning, no matches; unparsable pattern at match time -> InvalidSpecPatternError, never warning; every caller supplies default workspace.

Implementation status: IMPLEMENTED.

- config-schema.ts:49-58 validateContextPattern wraps InvalidSpecPatternError into ConfigValidationError (field + reason + pattern).
- \_shared/spec-pattern-matching.ts:listMatchingSpecs calls parseSpecPattern(pattern,{defaultWorkspace}) (throws, no catch); unknown workspace -> 'unknown-workspace' warning and []; bare '\*' special-cased for allWorkspacesOnBareStar.
  Discrepancies:
- F5 (code smell, low, no spec breach): listByPattern (spec-pattern-matching.ts ~95-135) keeps try/catch around SpecPath.parse and downgrades to 'missing-spec' warnings ("Invalid prefix/path in pattern"). After parseSpecPattern succeeded these branches are effectively unreachable (SpecPath.parse uses the same segment rule), but they contradict the letter "never downgraded to a warning". Remove dead catch or note in spec.
- Spec requirement "Every caller that matches patterns supplies the contextual default workspace": not verified for every caller in this partial (list-specs, compile-context, get-project-context); listMatchingSpecs signature makes defaultWorkspace mandatory, so enforced by types.
  Test coverage: parse-spec-pattern.spec.ts; config-loader.spec.ts pattern validation; compile-context.spec.ts:842,1810-1816 (unknown-workspace warning).
  Missing tests: match-time InvalidSpecPatternError (see spec-id-format c); workspace-level pattern default workspace = owning workspace (verify in compile-context spec).
  Summary: 4 requirement-groups, 4 implemented, 0 code-wrong; 1 dead-code note; 2 missing tests.

---

## core:config-loader

Requirements: pattern validation via parseSpecPattern (project and workspace level) -> ConfigValidationError; workspace names validated with isValidWorkspaceName, no private regex; dependency declaration on spec-id-format.
Implementation status: IMPLEMENTED (config-loader.ts:18,391; config-schema.ts via validateContextPatterns called at config-loader.ts:~378). No private regex copies (guarded by spec-id-guards.spec.ts).
Discrepancies: none. (Base spec specs/core/config-loader/spec.md:157 still shows old regexes `/^[a-z][a-z0-9-]*$/` and `/^[a-z_][a-z0-9_-]*$/`; the delta replaces it.)
Test coverage: config-loader.spec.ts workspace name tests (see core:workspace) and context pattern validation tests.
Missing tests: invalid qualifier/segment in a _workspace-level_ pattern (e.g. `workspaces.x.contextIncludeSpecs: ['A/*']`) - verify; pattern with comma.
Summary: 3 requirements, 3 implemented; 1-2 missing tests.

---

## core:spec-metadata

Requirements: strictSpecMetadataSchema dependsOn and implementation.files/symbols[].specId are fully-qualified valid IDs (no private regex); read path lenient; dependency on spec-id-format.
Implementation status: IMPLEMENTED: parse-metadata.ts:9-11 qualifiedSpecIdString = z.string().refine(isFullyQualifiedSpecId); used at :99 (dependsOn) and :132,:140 (implementation specId). Lenient specMetadataSchema retains z.string().
Discrepancies: none. Note spec text says keywords regex `^[a-z][a-z0-9-]*$` matches parse-metadata.ts:96,168.
Test coverage: domain/services/parse-metadata.spec.ts:33 ("still accepts bare dependsOn entries" lenient) and strict tests at :44+.
Missing tests: strict rejection of bare / comma / uppercase dependsOn and implementation[].specId specifically (not confirmed present; only generic strict tests seen).
Summary: 2 requirements, 2 implemented; 1 missing test group.

---

## core:spec-repository-port

Requirements: readPersistedState(spec, options?) with lenientDependsOn; strict default; invalid fields -> InvalidSpecLockError; read never rewrites; writePersistedState reads leniently for revision comparison.
Implementation status: IMPLEMENTED: application/ports/spec-repository.ts:200-222 (abstract signature + JSDoc); infrastructure/fs/spec-repository.ts:525-535, 559, 795-812.
Discrepancies: none.
Test coverage: spec-repository.spec.ts:1281-1376 (strict throws with fieldPath, lenient returns as stored, other fields strict, writePersistedState replaces an invalid lock using lenient.originalHash).
Missing tests: other SpecRepository implementations (memory/test doubles in test/application/use-cases/helpers.ts) do not need it; none.
Summary: 1 requirement, implemented; 0 gaps.

---

## core:archived-change-index-entry

Requirements: ArchiveListEntry fields unchanged; workspacesFromSpecIds retained only for archive path templating; MUST derive prefix via parseSpecId, unique in encounter order, InvalidSpecIdError on invalid ID; dependency on spec-id-format.
Implementation status: IMPLEMENTED: domain/archived-change-index-entry.ts:35-41.
Discrepancies:

- F6 (spec wrong, low): spec says helper is "retained only for archive path templating (ArchivePathEntry)". A grep of packages/core/src shows no production caller (only re-exports in domain/index.ts:18 and public.ts:570, plus tests). So the stated "real use" is not true of the code. Either remove the helper or reword the spec to "public helper".
- Helper accepts bare IDs (maps to default) while spec says archived specIds are fully qualified; the test at archived-change-index-entry.spec.ts:10 asserts bare -> default. Harmless but slightly looser than "persisted IDs are qualified"; spec text ("a bare ID yields default" is in code JSDoc only) does not forbid it.
  Test coverage: domain/archived-change-index-entry.spec.ts (unique/order, bare->default, empty, 'a:b:c' and '' rejected).
  Missing tests: comma ID / uppercase workspace rejection (covered indirectly by parseSpecId tests).
  Summary: 2 requirements, 2 implemented; 1 spec-wrong note (F6).

---

## core:generate-metadata

Requirements: spec resolution validates/normalizes ID via parseSpecId with configured workspaces; InvalidSpecIdError; unknown workspace; adapters pass raw; (delta only touches Spec resolution requirement).
Implementation status: IMPLEMENTED: application/use-cases/generate-spec-metadata.ts:105 parseSpecId(input.specId,{workspaces}) before repo lookup; JSDoc @throws InvalidSpecIdError (:91).
Discrepancies: none. Minor: `workspaceMap.get(workspace)!` non-null assertion relies on parseSpecId workspace check (valid).
Test coverage: generate-spec-metadata.spec.ts:631-645 (invalid ID, '' rejected before any repository call), :707-709 (it.each incl. `auth/a,b` quoting whole value).
Missing tests: none significant.
Summary: 1 requirement implemented; 0 gaps.

---

## core:validate-specs

Requirements: single spec mode: parseSpecId with workspaces -> InvalidSpecIdError; WorkspaceNotFoundError; SpecNotFoundError; validate only that spec.
Implementation status: IMPLEMENTED: validate-specs.ts:136-150 (parseSpecId with this.\_specs.keys()); validate-specs.ts:595 parseSpecId(args.label) for an already-qualified internal label (fine).
Discrepancies: none. The delta's step 2 "Look up the workspace's SpecRepository. If not found, throw WorkspaceNotFoundError" is subsumed by parseSpecId's workspace-set check, with a non-null assertion on `_specs.get(workspace)!`. Equivalent behaviour.
Test coverage: validate-specs.spec.ts:433-445 (invalid specPath rejected before repo call; '' and 'auth/a,b').
Missing tests: unknown-workspace case in single-spec mode (probably present in earlier tests; not confirmed); bare path -> default normalization in single mode.
Summary: 1 requirement implemented; 1-2 minor missing tests.

---

## core:preview-spec

Requirements: Input (bare or qualified specId, normalized); Spec ID validation performed first (before change lookup) with InvalidSpecIdError / WorkspaceNotFoundError; execute @throws lists InvalidSpecIdError and WorkspaceNotFoundError; then membership check (SpecNotInChangeError) against normalized ID.
Implementation status: IMPLEMENTED: preview-spec.ts:96-118: parseSpecId first; JSDoc @throws lists InvalidSpecIdError, WorkspaceNotFoundError, ChangeNotFoundError, SchemaMismatchError, SpecNotInChangeError; membership uses normalized specId.
Discrepancies: none.
Test coverage: preview-spec.spec.ts:597-671 (invalid id before any repo call, InvalidSpecIdError, unknown workspace, message quoting).
Missing tests: bare path normalized and matched to change.specIds (likely existing; unconfirmed).
Summary: 3 requirements implemented; 0 gaps.

---

## Cross-spec / project-wide consistency

- Base specs still carrying the old workspace/segment regex (specs/core/workspace/spec.md:11, specs/core/config-loader/spec.md:157) and their cached specs/\*\*/spec-lock.json / metadata.json contents are all superseded by this change's deltas; no remaining contradiction once archived, but metadata regeneration is required afterwards. Other spec files matching the old regex (parse-schema-yaml, build-schema, schema-format) concern schema/artifact ids, not workspaces: unrelated.
- core:spec-id-format "Persisted IDs fully qualified" says manifest readers reject bare IDs; core:spec-lock covers lock; consistent. Spec-id-format says "remove" from change draft deps must not validate - belongs to other partial (cli/core-deps).
- Project-wide ban on adapters normalizing IDs vs core:archived-change-index-entry helper accepting bare IDs: no conflict.
- Contradiction candidate: core:spec-id-format says an invalid persisted dependency "can always be removed" while core:spec-lock requires post-mutation validation of the resulting list (InvalidSpecLockError if invalid entries remain). Consistent only if a remove targets all invalid entries; documented in code, and tested (spec.ts:267). Worth one sentence in the spec.

## Totals (this partial)

Requirement groups audited: ~38. Fully implemented: all. Code-wrong: 1 (F1, bare stored dependsOn entry unremovable via `remove`). Spec wording/accuracy: F2, F3, F6 (low). Code smell: F5. Missing tests: remove-bare-stored (F1); match-time InvalidSpecPatternError at use-case level; schema-registry invalid workspace qualifier; prefix device-name segment; strict metadata rejection of bare/comma dependsOn and implementation specIds; unknown-workspace and bare-normalization in validate-specs single mode.
Not verified (time): exact contents of parse-spec-id.spec.ts it.each invalid list (lines 41-68), workspace-level pattern tests in config-loader.spec.ts, and whether every pattern-matching caller (list-specs, get-project-context) passes defaultWorkspace (enforced by signature).
