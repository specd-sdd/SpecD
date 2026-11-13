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
