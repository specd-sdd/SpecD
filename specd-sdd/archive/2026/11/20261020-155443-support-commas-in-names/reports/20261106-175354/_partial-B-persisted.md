# Partial B: spec-deps / persisted-spec specs (change support-commas-in-names)

Scope: core:update-spec-deps, cli:change-deps, core:update-persisted-spec-deps, cli:spec-deps, core:get-persisted-spec-deps, core:get-persisted-spec-implementation, core:get-persisted-spec-optimizations, core:get-persisted-spec-schema, core:update-persisted-spec-implementation, core:update-persisted-spec-optimizations, core:update-persisted-spec-schema.
Method: merged specs via `changes spec-preview`, read code and test titles (static, tests not executed). Neither spec nor code is treated as source of truth.
Paths: core use cases = /Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases (UC); CLI = /Users/monki/Documents/Proyectos/specd/packages/cli/src.

Overall: the change theme is implemented. No list splitting anywhere, `collect` appends whole values (cli/src/helpers/collect.ts:10), parseSpecId really rejects empty/blank/malformed, `changes deps --clear` exists, InvalidSpecLockError is typed and repairable. Discrepancies are minor.

---

## 1. core:update-spec-deps

Requirements summary: input contract (add/remove/set/clear, whole IDs, never split); change lookup; spec in change; set/clear/add+remove exclusivity; at least one op; set replaces (entries validated); clear via applyDependsOnMutation; parseSpecId validation of specId/add/set before mutation (InvalidSpecIdError, WorkspaceNotFoundError), remove tolerant and normalized when valid; remove validates existence; add idempotent; remove before add; persistence via ChangeRepository.mutate; typed errors; factory through resolveUpdateSpecDepsDeps.

Implementation status: implemented. UC/update-spec-deps.ts:87-143 (exclusivity :87-105, parse before mutate :108-121, mutate :123-142). tryNormalizeDepId :27-35 gives literal fallback for remove. Shared helper UC/\_shared/apply-depends-on-mutation.ts. Factory: composition/use-cases/update-spec-deps.ts exists (resolver helper present, test in core/test/composition/use-cases/update-spec-deps.spec.ts).

Discrepancies:

- D1 (spec internally inconsistent, spec wrong): spec.md "Spec must belong to the change" and "Remove validates existence" say "throw an `Error`", while verify.md says `InvalidInputError`, and "Typed errors" requirement forbids generic Error. Code throws InvalidInputError (update-spec-deps.ts:125, applyDependsOnMutation). Code is right; spec text "an `Error`" / verify "set ... throws an `Error`" / "No operation ... throws an `Error`" (verify scenarios) should say InvalidInputError.
- D2 (minor, spec vague): "validation happens before any mutation" but spec-membership and remove-existence checks run inside `mutate` callback (after ID validation). Net effect equal (nothing persisted on throw). No action needed; spec could state it.
- D3 (minor): "Set replaces ... empty entry rejected; clearing is the job of clear" vs verify scenario "Set with empty array clears dependencies" (set: []). Code allows set: [] (clears). Spec text is ambiguous; code and verify agree. Suggest clarifying that only empty STRING entries are rejected.

Test coverage (core/test/application/use-cases/update-spec-deps.spec.ts): add qualified, mutate usage, remove, set, clear, exclusivity matrix (it.each + add+remove), set [""], add [' '], comma ID as one value, malformed, unknown workspace, nonexistent target accepted, bare qualified, one-invalid-among-valid, remove invalid stored, specId not in change, change not found, no op, remove not found, add idempotent, set [], absent entry, clear on empty, INVALID_INPUT code, remove with bare ID.

Missing tests: (a) explicit "same ID in remove and add ends up present" with exact order ['default:core/b','default:core/a'] (only generic add+remove test exists); (b) `set: [':', 'ws:']` malformed-pair scenario; (c) "SDK same behavior" is implicit only; (d) clear with `set`/`add`/`remove` covered by matrix (assumed, not individually verified); (e) config-factory scenario "resolveUpdateSpecDepsDeps resolves workspace set" check that workspaces are included (verify it asserts `workspaces`).

Summary counts: requirements 14; implemented 14; discrepancies 3 (all minor/spec-text); missing tests 3-4 minor.

---

## 2. cli:change-deps

Requirements summary: signature with --add/--remove/--set repeatable, --clear, --force; values forwarded raw (never split), command must not import/call parseSpecId; display mode forwards raw specId to core op that normalizes; clear confirmation (TTY prompt, --force skip, non-TTY exit 1, decline exit 0 "cancelled"); output text/json/toon; output always shows normalized ID; error cases incl. invalid ID, unknown workspace.

Implementation status: implemented. cli/src/commands/change/deps.ts: options :19-34 (collect), no parseSpecId import; fast-fail conflicts :62-76; display uses kernel.changes.getSpecDeps (:82); listing via status :103; clear confirm via confirmOrExit :134-153 with message 'requires confirmation; pass --force to skip it'; modification :156-163 with normalized result.specId in text/json (:166-179). UC/get-change-spec-deps.ts validates/normalizes/matches change.specIds.

Discrepancies:

- D1 (spec stale, spec wrong): Constraints say "Listing and display modes use `GetStatus` or direct repository access". Display mode now uses GetChangeSpecDeps (itself built on GetStatus). Spec Purpose of signature section already describes the new op. Update Constraints wording.
- D2 (spec incomplete): "cancelled" JSON/TOON output for declined confirmation is `{result:'cancelled'}` (deps.ts:142) but spec only states text behaviour. Code fine; spec could mention.
- D3 (minor code/spec): `resolveCliContext` is invoked before argument conflict checks (deps.ts:48), so `--set --add` without config still triggers config discovery/failure first. Spec says conflict check is "fast-fail only"; arguable code could fail before loading context. Low.
- D4 (spec wording): verify.md has a duplicated scenario set ("Help lists --clear and --force", "Blank --add", "Unknown workspace") under two different requirements ("Command signature"/"Output shows the normalized spec ID"/"Error cases"). Duplicated, not contradictory.

Test coverage (cli/test/commands/change-deps.spec.ts): add/remove/set, json, none, change not found, specId not in change, set+add, list all, display via GetChangeSpecDeps, no specId with flags, remove nonexistent, --clear+--add and it.each other conflicts, --clear no specId, --set "", --set "core:a,b" one ID, raw bare specId, clear confirm accepted/declined/--force/non-TTY, display JSON/TOON/(none), it.each invalid display IDs, blank forward, blank --add, help lists flags, source does not import parseSpecId.

Missing tests: (a) "Unknown workspace in dependency (--add nope:auth/login)" on modification path (only display it.each includes nope: at :638); (b) "Dependency on spec not created yet is accepted" at CLI level; (c) text output shows normalized `default:auth/login` for bare specId in MODIFICATION mode (only display/json covered; "Text output prints the normalized spec ID" not found); (d) stored deps unchanged assertion after `--set ""`.

Summary counts: requirements 5; implemented 5; discrepancies 4 (0 hard); missing tests 4.

---

## 3. core:update-persisted-spec-deps

Requirements summary: input contract; set/clear exclusive, min op; parseSpecId validation of specId/add/set before I/O, target existence (SpecNotFoundError) for add/set, remove literal for invalid; lenient read for remove/set/clear, strict for add; remaining-invalid -> InvalidSpecLockError naming dependsOn; remove-before-add; read via readPersistedState; set/clear create missing state without derivation; non-empty add derives base then remove then add; remove/empty add no-op (created:false, initialized:false); patch helper; expectedRevision / ArtifactConflictError; SpecNotFoundError; result contract; factory.

Implementation status: implemented. UC/update-persisted-spec-deps.ts: exclusivity :99-117, parse :119-128, readOnly :131-134, target exists :136-142, remove tolerant :144-148, lenient flag :164-170, post-mutation validity :172-182, write with originalHash :188; missing-state path :200-257 (no-op :208-210, set/clear skip derivation :222-235, null revision :255). Lenient read plumbed through ports/spec-repository.ts, infrastructure/fs/spec-repository.ts:530/795, domain/services/parse-spec-lock.ts:99-127.

Discrepancies:

- D1 (code vs spec, likely code wrong): spec cli:spec-deps says InvalidSpecLockError message names "the lock location"; the post-mutation InvalidSpecLockError thrown here is constructed with `location = undefined` (update-persisted-spec-deps.ts:171-176), so its message is "Invalid spec-lock for '<id>': field 'dependsOn.N' must be ... ." without the file path. Strict read errors do carry location (infrastructure/fs/spec-repository.ts:809). Spec core:spec-lock requires message to name "the lock file location". Fix options: pass location from repo, or spec: restrict requirement to read-time errors.
- D2 (spec gap): remove (non-empty add) against missing state: `_createMissingState` calls applyDependsOnMutation(initial, {remove, add}) (:236-241); a `remove` entry not present in the derived base throws InvalidInputError "dependency ... not found". Spec only says a removed ID in the derived base must not survive; it does not say what happens when the removed ID is absent. Spec should define (error vs ignore). Contrast with existing-state remove, which errors.
- D3 (minor spec wording vs code): `isFullyQualifiedSpecId` check (:172-182) only validates syntax, not that the workspace is configured, and only runs on the existing-state path; the missing-state path trusts derived values from artifacts (resolveInitialPersistedDependsOn). Spec says "if after the mutation any dependsOn entry is still not a valid fully-qualified spec ID ... throw" without limiting to existing state. Low risk since derived IDs are produced qualified.
- D4 (spec vs code order, harmless): spec lists "readOnly rejected before any persisted-state I/O" (code: after parse, before repo.get/readPersistedState: OK). Target-existence reads (repo.get) happen after readOnly check. Consistent.

Test coverage (core/test/.../update-persisted-spec-deps.spec.ts, plus UpdatePersistedSpecDeps in get-persisted-spec-deps.spec.ts:82-128): no-op remove missing state, conflicts before I/O, no-op without state, invalid ID before I/O, SpecNotFound for dep and target, bare qualified, remove invalid stored, strict read propagates InvalidSpecLockError, clear, unknown workspace, lenient read for remove + bare normalization, remaining invalid -> InvalidSpecLockError, add strict, remove-before-add existing, originalHash revision, ArtifactConflictError no retry, readOnly before I/O, missing-state: clear/set/add/remove+add (D4)/remove no-op/add:[] no-op.

Missing tests: (a) assertion that InvalidSpecLockError from remaining-invalid names `dependsOn` field AND lock location (would expose D1); (b) set/clear repair of an invalid lock (verify "Clear and set repair a lock with invalid dependencies") not as an explicit title; (c) "Invalid lock on non-dependsOn field on any mutation" (implementation.0.file) at use-case level; (d) remove-with-nonempty-add against missing state where removed ID absent from derived base (D2); (e) result fields `created/initialized` for set on existing state; (f) config factory test (resolveUpdatePersistedSpecDepsDeps) exists in composition tests only for get-persisted-spec-deps and update-spec-deps; I found no composition test for resolveUpdatePersistedSpecDepsDeps (grep: core/test/composition/use-cases contains only get-persisted-spec-deps.spec.ts and update-spec-deps.spec.ts).

Summary counts: requirements 14; implemented 14; discrepancies 4 (1 probable code gap, 1 spec gap); missing tests 6.

---

## 4. cli:spec-deps

Requirements summary: `specs deps list|add|remove|set|clear`; list distinguishes uninitialized and json has `initialized`; add/remove/set map directly to updatePersistedDeps; set may be empty; clear needs confirmation (--force, non-TTY exit 1 without mentioning --clear, decline -> cancelled exit 0); output renders real `initialized`; no CLI merge logic; raw IDs, no split; error mapping incl. InvalidSpecLockError repair hint (exactly the three commands, nothing else, only for dependsOn fields), ArtifactConflictError retry, ReadOnly no workaround; allowExcessArguments(false).

Implementation status: implemented. cli/src/commands/spec/deps.ts: renderDepsResult :18-48; list :64-76; add :78-97; remove :99-123 (custom "nothing was removed" text); set :125-142; clear :144-181 (message 'clearing requires confirmation; pass --force to skip it'); all leaf commands allowExcessArguments(false). Hint: cli/src/handle-error.ts:152-170 ('Repair with: specd specs deps remove <spec-id>, specd specs deps set <spec-id>, or specd specs deps clear <spec-id>'), appended only when fieldPath is `dependsOn` or `dependsOn.*`.

Discrepancies:

- D1 (spec vs code, minor): hint is implemented globally in handleError, so any command that surfaces InvalidSpecLockError with a dependsOn field (e.g. `specs show`, `change` commands) gets a `specs deps` hint, while the spec only scopes it to `specs deps` commands. Probably desirable; spec should say "any command".
- D2 (code vs spec): spec says add requires at least one dep and remove likewise; code relies on both `requiredOption` and a redundant `opts.dep.length === 0` check (deps.ts:86,107). `requiredOption` with a default `[]` never triggers (default is defined), so only the manual check works. Behaviour correct; the `requiredOption` is dead.
- D3 (spec vs code): spec Clear: "after confirmation ... print resulting (empty) list". Code OK. Spec text for non-interactive says error "stating that clearing requires confirmation and that --force skips it": OK.
- D4 (spec mismatch, minor): list text for uninitialized: spec requires "not yet initialized"; code prints "spec X is not initialized — run specs init first" (deps.ts:24). Meaning equivalent; wording differs from "not yet".
- D5: in json mode the repair hint is embedded into the JSON `message` field (cliError receives the hint-augmented message, handle-error.ts:168-170) rather than separate field. Spec says "on a following line"; for structured output it pollutes `message`. Low.

Test coverage (cli/test/commands/spec-deps.spec.ts, cli/test/handle-error.spec.ts:119-184): list delegates, set delegates, --dep "" rejected, missing target exit 1, InvalidSpecLockError exit 1 no stack, clear confirmation (accept/decline/force/non-TTY), not-initialized hint, `(empty)`, json initialized, remove uninit wording, clear wording no --clear, invalid ID, --dep a,b one value, ArtifactConflictError, ReadOnlyWorkspaceError; hint exact form/once/no --force/no parenthetical/omitted for non-dependsOn.

Missing tests: (a) add and remove mapping onto input with several --dep (only add ['a,b'] via the comma test); (b) `set` with no --dep sends `set: []` (verify scenario); (c) clear sends `clear: true` through full command with JSON; (d) mutation commands render `initialized: true` for add/set/clear; (e) end-to-end invalid-lock list message names spec, lock location, `dependsOn.0` (handle-error test uses synthetic error); (f) bare spec ID forwarded unchanged on list; (g) unknown spec on `list` explicit test; (h) allowExcessArguments(false) per leaf.

Summary counts: requirements 10; implemented 10; discrepancies 5 (all minor); missing tests 8.

---

## 5. core:get-persisted-spec-deps

Requirements summary: raw specId validated with parseSpecId + configured workspaces before repo access; bare resolves to default; only readPersistedState; exact stored order, no dedup; uninitialized -> [] + initialized:false; SpecNotFoundError; factory via resolveGetPersistedSpecDepsDeps; read-only.

Implementation status: implemented. UC/get-persisted-spec-deps.ts:26-44. Result includes `initialized` in both cases. Reads strictly (`readPersistedState(spec)` with no lenient flag), consistent with spec-lock ("strict by default").

Discrepancies: none. Note (consistency): an invalid dependsOn in a lock makes `specs deps list` fail (by design); repair hint points to remove/set/clear, which work via lenient reads. Consistent.

Test coverage: uninitialized, invalid specId before repo call, bare resolved, unknown workspace, qualified accepted, order/duplicates kept, SpecNotFoundError, quoted malformed ID never writes; composition test core/test/composition/use-cases/get-persisted-spec-deps.spec.ts.
Missing tests: "Reading never calls generated metadata / only readPersistedState" explicit assertion; "Reading creates no state: no write method called" (partially in 'never writes persisted state').
Summary: requirements 7; implemented 7; discrepancies 0; missing tests ~1-2.

---

## 6. core:get-persisted-spec-implementation

Requirements: Spec ID validation requirement (new); reads state; result [] + initialized.
Implementation: UC/get-persisted-spec-implementation.ts:30-48; parseSpecId with repo keys.
Discrepancies: none. (Note: spec.md base requirements were not re-audited beyond the delta.)
Tests: uninitialized, invalid id before repo, bare, unknown workspace, qualified, order/duplicates, SpecNotFound, malformed quoted/no write.
Missing: none material. Counts: reqs 4 (approx); impl all; disc 0.

---

## 7. core:get-persisted-spec-optimizations

Requirements: Spec ID validation (new); modified: absent field reported as `{freshness:'missing', reasons:['missing']}` without value; with no filter and no optimizations block result has neither field and fresh:false; field shape admits missing.
Implementation: UC/get-persisted-spec-optimizations.ts:51-97; `_fieldResult` :118-138 returns missing only when a filter names the field (`filter === name`).

Discrepancies:

- D1 (spec ambiguous; code arguably deviates): spec text "for each requested field that is absent, a field entry {missing}... An absent field is therefore reported explicitly, never silently dropped". With NO filter and a partial block (e.g. only optimizedDescription present), code omits optimizedContext entirely (test 'omits an absent field when no filter is given', get-persisted-spec-optimizations.spec.ts:188). The spec's last sentence only fixes the no-block/no-filter case. If "requested" = both when no filter, code is wrong (should emit missing); if "requested" = filtered only, spec text "never silently dropped" is misleading. Needs a spec decision. Also in the no-filter/no-block case the fresh flag: code returns false (includedFields empty): matches spec.
- D2: uninitialized spec returns `{initialized:false, fresh:false}` with no fields even when filter given (line 74-76); spec for `missing` applies "when persisted state exists", so consistent.
- D3: `schemaResult.raw` -> InvalidInputError('schema resolution failed') generic, no actionable detail (error-handling-conventions asks actionable messages). Minor, outside delta.
  Tests: uninit, missing field filtered, aggregate false no fields, invalid id, bare, unknown ws, filter present/absent, omits absent without filter, artifact-changed/removed/added, lastModified only, schema-changed, aggregate over filtered field, SpecNotFound, never writes.
  Missing: none for the delta other than a test of partial block + no filter against the spec statement (test exists but asserts the omit behaviour, which is contested by D1).
  Counts: reqs ~4 delta; impl 4; disc 1 real ambiguity.

---

## 8. core:get-persisted-spec-schema

Requirements: Spec ID validation (new); returns schema; SpecNotInitializedError for no lock; SpecNotFoundError first.
Implementation: UC/get-persisted-spec-schema.ts:39-58, documented @throws match.
Discrepancies: none.
Tests: not initialized, invalid id, bare before NotInitialized, unknown ws, qualified with lock, SpecNotFound precedence, malformed quoted.
Missing: none material. Counts: disc 0.

---

## 9. core:update-persisted-spec-implementation

Requirements: Spec ID validation (new) before workspace/schema/artifact/persisted I/O, nothing written; modified confinement: path-relative containment (not empty, not starting with `..`, not absolute), applies to qualified `ws:` paths (`core:../x`), foreign qualifier rejected, Windows drive-letter not a qualifier, ImplementationWorkspaceBoundaryError, existence check after confinement.
Implementation: UC/update-persisted-spec-implementation.ts: parse :94-97, readOnly :98-100, `_normalizeFile` :232-259 (qualifier only if isValidWorkspaceName prefix, foreign -> boundary error, relative test). add-existence check after confinement :115-120 before readPersistedState :122.

Discrepancies:

- D1 (spec too literal, spec wrong): spec says relative path "MUST NOT start with `..`". Code rejects `..` or `..<sep>…` only (:249-253). A legitimate file/dir named `..foo/x` is accepted by code and is inside the codeRoot; the spec's literal rule would reject it. Code is more correct; spec should say "is `..` or starts with `..` + separator".
- D2 (spec gap): symlink escapes are not handled (path.resolve is lexical); spec silent.
- D3 (ordering, minor): readOnly check and repo.get (spec lookup) happen before confinement/boundary check, so an out-of-boundary path against a missing spec reports SpecNotFound first. Spec only fixes order relative to mutation. Fine.
- D4: remove on missing state returns `{created:false}` with no `initialized` field (spec silent; peers update-persisted-spec-deps expose `initialized`). Informational.
  Tests: missing file, invalid id, unknown workspace, bare resolved before file checks, ESCAPES it.each (:143), drive-letter, nested forward slash, own-qualifier, symbols add/remove, lock-less add, no write remove missing, originalHash/conflict, SpecNotFound, readOnly, existence after confinement, no persisted read when file missing.
  Missing: test for `..foo` sibling-like legitimate name (would contrast with D1); test for sibling-prefix dir `/repo/core-evil` (check ESCAPES list includes it; I did not verify content).
  Counts: delta reqs 2; impl 2; disc 4 (1 spec-wrong, rest informational).

---

## 10. core:update-persisted-spec-optimizations

Requirements: Spec ID validation (new); input contract: strict Zod schema for shape (unknown keys, non-string specId, bad set/clear, empty set/clear, no op, both), shape errors -> InvalidInputError; empty-string specId passes shape and fails parseSpecId with InvalidSpecIdError; spec ID content failures never InvalidInputError.
Implementation: UC/update-persisted-spec-optimizations.ts: schema :16-61 (strict, nonempty clear, superRefine), parse :120-139 -> InvalidInputError, parseSpecId :178-181 after shape validation, readOnly :186-188.

Discrepancies:

- D1 (code vs spec, minor): spec says "Before workspace resolution ... validate shape". Code does shape first then parseSpecId; correct. No contradiction.
- D2 (minor code gap): `set` values of empty string are accepted (z.string()); spec lists "non-string set values" only. Neutral.
- D3: `schemaResult.raw` -> generic InvalidInputError('schema resolution failed') (not actionable). Outside delta.
  Tests: no-op clear missing state, schema recorded, partial clear, absent clear no-op, remove block after final clear, it.each (shape) :175 and :235, invalid specId, empty specId -> InvalidSpecIdError (:333), bare resolved, unknown ws, specId undefined -> InvalidInputError no port touched (:396), baseline per set field, create semantic, ArtifactConflictError, readOnly.
  Missing: none material.
  Counts: reqs 2 delta; impl 2; disc 0 real.

---

## 11. core:update-persisted-spec-schema

Requirements: Spec ID validation (new); modified: artifact parse verification unconditional for every target schema (whether or not it declares dependsOn extraction); formats without parser skipped; parse failure aborts with typed error and no mutation.
Implementation: UC/update-persisted-spec-schema.ts: parse :80-83, `_loadParsedArtifacts` :152-176 (parse for every spec-scope artifact that has a parser/file), invoked :113 unconditionally of schema.metadataExtraction (only `_extractDependsOn` is conditional :199).

Discrepancies:

- D1 (spec vs code): spec says verification runs "for every target schema". Code returns early with `changed:false` when the target schema equals the persisted identity (:100-109), before any artifact parse. Test 'returns changed:false without parsing or writing when the schema is the same' (update-persisted-spec-schema.spec.ts:241) enforces that. Spec wording should say "for every reassignment (a no-op reassignment to the same schema does not verify)". Code is reasonable.
- D2 (code vs lock-repairability): schema update reads strictly (`readPersistedState(spec)` :94). A lock with invalid dependsOn thus fails with InvalidSpecLockError, whose CLI hint recommends `specs deps remove/set/clear`; consistent with spec-lock ("only remove/set/clear use lenient"). No issue.
- D3: `schemaResult.raw` generic message (not actionable). Outside delta.
  Tests: never creates lock, invalid id, bare before NotInitialized, unknown ws, malformed artifact aborts without write when schema has no dependsOn extraction (:177), skips no-parser formats, skips missing files, success preserves impl/optimizations, unchanged returns changed:false, ref mode, dependency conflict, accepts equal extraction, optimizations stale after reassignment, originalHash, ArtifactConflictError, SpecNotFound, readOnly.
  Missing: none material.
  Counts: delta reqs 2; impl 2; disc 1 minor spec wording.

---

## Cross-spec / project-wide consistency (project context + direct deps)

Project context checked: adapters delivery-only (cli -> sdk), expected failures extend SpecdError with actionable messages, graph-first rules.

- C1 (tension, not hard contradiction): core:spec-lock requires InvalidSpecLockError messages to NOT prescribe repair commands ("single consistent instruction reaches the user" via CLI), while default:\_global/error-handling-conventions requires actionable messages. Non-CLI hosts (SDK/MCP) get no repair instruction at all. Consistent for CLI only. Consider noting in spec-lock that hosts SHOULD add guidance, or an MCP equivalent.
- C2: cli:spec-deps places hint logic in global handleError; spec-lock says "repair guidance belongs to the delivery mechanism" (consistent), but cli:change-deps and others do not mention it.
- C3 (internal inconsistency in the change): update-spec-deps (draft) accepts non-existent targets while update-persisted-spec-deps requires existing targets (SpecNotFoundError). Both documented explicitly; consistent by design.
- C4: core:update-spec-deps says `remove` valid IDs are normalized; update-persisted-spec-deps same; cli:change-deps text "removes dependency spec IDs" with raw forwarding; consistent.
- C5: core:spec-id-format dependency: parseSpecId in domain/services/parse-spec-id.ts implements empty/blank, workspace-name (>=2 chars), `:` in capPath, empty segment, Windows device names, backslash. Spec scenarios on update-spec-deps for `[':', 'ws:']` rely on these; `ws:` -> "capability path must not be empty" ok; `:` -> workspace '' invalid ok.
- C6: cli:change-deps "Constraints: Listing and display modes use GetStatus or direct repository access" vs actual GetChangeSpecDeps (see section 2 D1).
- C7: project rule "cli -> sdk": cli/src/handle-error.ts imports `InvalidSpecLockError` from '@specd/sdk' (compliant); `resolveCliContext` returns a `kernel` (core kernel), consistent with memory note that CliContext simplification is deferred.
- No spec contradicts a direct dependency in a way requiring spec change, other than the items above.

## Overall tallies

Specs audited: 11. Requirements audited (approx.): 85. Fully implemented: all. Hard code-wrong findings: 1 (update-persisted-spec-deps InvalidSpecLockError lacks lock location, section 3 D1). Spec-wrong/ambiguous: ~9 (generic Error wording; `..` literal; schema verification "every"; missing-state remove semantics; no-filter missing field; constraints wording; hint scope; set:[] wording; "not yet initialized" wording). Missing tests: ~30 minor, most notable: no composition test for resolveUpdatePersistedSpecDepsDeps; no CLI test for spec-deps add/remove multi-dep mapping and initialized:true on mutations; change-deps modification-path unknown workspace and normalized text output; use-case-level test asserting lock location in post-mutation InvalidSpecLockError.
