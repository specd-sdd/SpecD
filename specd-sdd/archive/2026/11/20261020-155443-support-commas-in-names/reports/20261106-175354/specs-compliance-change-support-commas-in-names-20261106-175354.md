# Specs compliance — change support-commas-in-names

Mode: change. Scope: 33 change specs (+ project-wide specs, depth-1 deps). Audit basis: static review + CLI checks. Test runs by verify step: typecheck OK; core (2 load timeouts, pass in isolation), cli 1279, sdk 134, skills 52 pass; code-graph 4 timeouts in untouched package.

## Executive summary

- Code gaps: UpdatePersistedSpecDeps remove normalizes bare ids (F1); lock error lacks location after mutation; cli:change-edit last-spec invariant not implemented; invalidation policy unvalidated; `start` skips specId validation; EditChange no-op still persists; CreateChange schema-compat skip; change-implementation start output thin.
- Spec defects: wording/dependency mismatches (edit-change, update-spec-deps, change-deps, update-persisted-spec-\*, spec-lock vs global error conventions, cross-platform case-sensitivity conflict).
- Missing tests: ~40 across batches.

## Detailed Findings

---

# Partial A - tracking / edit / create (change support-commas-in-names)

Scope: core:update-implementation-tracking, cli:change-implementation, core:edit-change, cli:change-edit, core:create-change, cli:change-create.
Method: `changes spec-preview` (merged spec + verify), code read, test inventories. Neither spec nor code is treated as truth. Line refs are approximate to the files as read on 2026-11-06.
Note: spec-preview needs the unprefixed ID form (`core:update-implementation-tracking`, not `core:core/...`).

Paths:

- core UC: packages/core/src/application/use-cases/{update-implementation-tracking,edit-change,create-change}.ts
- composition: packages/core/src/composition/use-cases/update-implementation-tracking.ts
- cli: packages/cli/src/commands/change/{implementation,edit,create}.ts, packages/cli/src/helpers/collect.ts
- tests: packages/core/test/application/use-cases/{update-implementation-tracking,edit-change,create-change}.spec.ts, packages/core/test/domain/services/to-logical-file-path.spec.ts, packages/cli/test/commands/{change-implementation,change-edit,change-create}.spec.ts

---

## 1. core:update-implementation-tracking

### Requirements summary

Input contract (name, action, file, files, specId, symbols; file+files combined, deduped; specId parsed via parseSpecId for ANY action; add/remove without specId -> InvalidInputError); whole file names (no split/trim/case-fold; errors quote the original value, incl. Windows `a\b.ts`); all-or-nothing multi-file; win32 separator normalization via isolated helper with platform param; add/remove/resolve/unresolve/ignore/start semantics; ChangeNotFoundError; typed ImplementationFileNotFoundError; persistence via mutate; config factory via resolveUpdateImplementationTrackingDeps.

### Implementation status

Implemented: whole names (loop at update-implementation-tracking.ts execute, no split/trim); error quotes `target.original` (\_validateMutation/\_requireExists); `toLogicalFilePath(original, platform)` isolated helper with ctor platform param; dedupe by logical name; file-then-files order; all entries validated before apply, single `mutate`; add/remove without specId rejected before mutate (InvalidInputError, `specId is required for action "..."`); parseSpecId with workspace keys; SpecNotFoundError for add; factory deps always include specRepositories.

### Discrepancies

D1. `start` with `specId` is not validated. Spec: "Whenever it is supplied, for any action, it is validated and normalized ... before any mutation". Code returns early for `start` (execute, `if (input.action === 'start') {...return}`) before `parseSpecId`. Code wrong vs spec (minor; low practical impact). Alternatively spec could say "for any action except start".
D2. Spec text says `resolveUpdateImplementationTrackingDeps` resolves `specRepositories?` (optional) while the same spec says the use case "MUST always be constructed with the project's spec repositories". Code: `specRepositories` is required in UpdateImplementationTrackingDeps and ctor (composition/use-cases/update-implementation-tracking.ts:23, 42). Spec wrong (self-contradiction); code matches the MUST.
D3. Case sensitivity vs project-wide `_global/cross-platform` ("Case sensitivity": code MUST NOT treat paths differing only in case as distinct on Windows/macOS). This spec requires "no case-fold ... matched exactly", and code compares with `===` (`_trackedEntry`). Spec/spec contradiction. Neither is clearly wrong: this spec's exactness is the theme of the change; cross-platform spec has no exemption for logical identifiers. Needs an explicit exception in one of them.
D4. Cross-platform says platform detection MUST be in one isolated helper rather than `process.platform` in logic. The UC ctor defaults `platform = process.platform` (update-implementation-tracking.ts ctor) and `toLogicalFilePath` defaults it too. Spec says helper takes platform as a parameter (satisfied) but the default reading lives in two places. Minor, mostly consistent.
D5. Empty-batch behavior is unspecified: when no `file`/`files` given for add/resolve/etc., code throws `ImplementationFileNotFoundError('')` (error message `Implementation file "" does not exist`). For `remove` with no file also the same. Spec: silent. Spec gap; code message is poor (arguably InvalidInputError). Not covered by tests.
D6. Spec "Remove mutation" never states whether `remove` validates file existence; code skips (early return) and tests assert it. Fine, but note: spec "Missing-file validation" says "file-required mutation", ambiguous for remove. Spec gap only.
D7. Spec verify has a duplicate scenario ("Quote, backslash, and non-ASCII names are preserved" and "... each preserved separately"). Spec wording duplication only.

### Test coverage (core)

Covered: all-or-nothing batch (136,158,179,703); comma exact match (531), whole-name error quote (548), spaces (562), quote/backslash/non-ASCII on linux (578, 750), SDK files array (594, 732), win32 normalize / linux keep / comma on win32 (617-676), win32 batch + every action (677, 790), single mutate call (826), dedupe (839), file+files combine (854), win32 error quotes original (870), add/remove without specId (885), invalid specId syntax (490, 904), unknown workspace (445), bare specId normalization (510), batch add atomic w/ invalid spec (464), start (352/369), toLogicalFilePath pure fn (to-logical-file-path.spec.ts).

### Missing tests

M1. "specId is validated for any action" scenario (`resolve` + `Bad Id` -> InvalidSpecIdError, file untouched): no test found (only add uses a bad spec ID, line 914).
M2. `start` + malformed specId (spec/code mismatch D1) not tested either way.
M3. win32 `add` stores forward-slash form (verify scenario "Stored name uses forward slashes on Windows") - covered only through the "every action" test at 790 (verify by reading; appears to cover remove/resolve/unresolve/ignore - confirm `add` is included).
M4. Empty batch (D5).

### Summary counts

Requirements 14 (spec) | implemented 13 | partially 1 (input contract/start specId) | spec defects 3 (D2, D6, D7) | spec/spec conflicts 1 (D3) | test gaps 3-4.

---

## 2. cli:change-implementation

### Requirements summary

Subcommands list/add/resolve/unresolve/ignore/remove/review/start; repeatable and variadic options collect whole values with the CLI's single repeatable-option helper; resolve/unresolve/ignore accept `--file a --file b` and `--file a b`, never split/trim; add/remove forward `--spec` and `--symbol` raw; list text prints one name per line, json/toon arrays; list/review use SDK projection (no CLI fallback); start delegates to UpdateImplementationTracking and renders name, `trackingActive: true`, and start timestamp.

### Implementation status

Implemented: implementation.ts uses `collect` from helpers/collect.ts for `--symbol`, and commander variadic `<paths...>` for ignore/resolve/unresolve; add/remove forward `files:[opts.file]` plus `file`; spec ID forwarded raw (no CLI normalization); text listing one file per line (renderImplementationState loop); json/toon output arrays; no splitting anywhere in the file. List/review delegate to `enrichImplementationTracking` (SDK).

### Discrepancies

C1. `start` text output: spec requires "structured confirmation including the change name, active tracking status (`trackingActive: true`), and the timestamp when tracking commenced". Code prints `✓ Implementation tracking is active for '<name>'.` (text) - no timestamp, no `trackingActive`; json/toon emit `implementationTracking` projection and omit an explicit `trackingActive` field (implementation.ts mutateImplementationTracking tail). Code wrong vs spec (or spec stale if the projection is considered to carry it - verify projection contains `startedAt`). Test at 353 checks only text.
C2. Spec "single repeatable-option helper" is satisfied inside this command, but repo-wide there are still private copies: graph/impact.ts:42, graph/search.ts:26, graph/hotspots.ts:25, spec/search.ts:15, spec/list.ts:22, and an inline accumulator in change/invalidate.ts:34. Not part of these 6 specs but relevant to the "CLI's single repeatable-option helper" claim. These do not split on commas (collect only appends), so behavior is fine; the claim "single helper" is false project-wide. Spec scope or code cleanup.
C3. Mutation text output for non-start actions: `updated implementation tracking for <name> (<action>)` is unspecified (spec silent). Spec gap.
C4. `add`/`remove` define `--file <path>` single-valued while spec signature says `--file <path>` (consistent). OK. (No discrepancy.)
C5. Empty `files` returns silently with exit 0 (`if (primaryFile === undefined) return`); unreachable because `requiredOption` enforces a value, harmless dead path.
C6. Spec says add "use the raw project-relative file path exactly as supplied ... after path normalization" - normalization happens in the use case (win32 only). Consistent but wording refers to "path normalization" the CLI does not do. Spec wording.

### Test coverage (cli/test/commands/change-implementation.spec.ts)

Covered: repeated+variadic resolve (115, 410), comma-named ignore (143), `f3.ts,f4.ts` whole-name failure (178), raw spec ID on add (215), list text one-name-per-line (246), json comma names stay entries (438), `--symbol "A.b,c"` raw on remove (464), spaces untouched (429), unresolve repeated + comma (420), resolve `a, b.md` (401), help lists 8 subcommands (482), start text + idempotent (353, 503), review (28, 282), add missing file (78), SDK enrichment tests (change-implementation-tracking.spec.ts: 3 tests).

### Missing tests

- start json/toon output and timestamp (C1).
- Remove with no `--symbol` / last-symbol semantics are core behavior; no CLI-level scenario test for "Removing last symbol preserves explicit file-level link" (belongs in core:change).
- No CLI test that a symbol with a comma is forwarded on `add` (only remove).

### Summary counts

Requirements 11 | implemented 10 | partial 1 (start output) | discrepancies 2 real (C1, C2) + 2 spec gaps | missing tests 2-3.

---

## 3. core:edit-change

### Requirements summary

Input contract (addSpecIds/removeSpecIds whole IDs); add IDs validated+normalized with parseSpecId and configured workspaces before mutation (InvalidSpecIdError/WorkspaceNotFoundError; nothing persisted); remove IDs not syntax-validated, normalized when possible, compared as given otherwise, deduped after normalization, absent -> SpecNotInChangeError; readOnly rejection with one line per spec; invalidationPolicy; no-op returns without persisting or resolving actor; removal before addition; idempotent add; specDependsOn seeding; approvals invalidation inside `mutate`; unscaffold after persist; refresh implementation tracking; schema compatibility guardrail.

### Implementation status

Implemented: parse/normalize adds (edit-change.ts execute, `parsedAdds`), readOnly message per spec, remove normalization with try/catch fallback and `Set` dedupe, lazy `resolveActor`, mutate with removals before adds, seeding via loadPersistedSpecDependsOn, unscaffold then scaffold then refresh, schema compat with uninitialized spec fallback to active schema.

### Discrepancies

E1. No-op persistence: spec "Requirement: No-op when specIds unchanged after processing" says return unchanged "without persisting". Code always calls `ChangeRepository.mutate` when `hasSpecChanges` (e.g. idempotent add of an existing ID); the fs `mutate` unconditionally calls `_persistManifest` (change-repository.ts mutate, `await this._persistManifest(change)`). No actor is resolved and no event is added (test at 614 proves this), but the manifest is rewritten and `updatedAt` may change. Code wrong vs spec (minor), or spec should say "without recording events".
E2. Dependencies requirement is stale: it lists `specs: ReadonlyMap<string, SpecRepository>` injected via constructor; code ctor takes `(changes, listWorkspaces, actor, schemaProvider, refreshImplementationTracking?)` (edit-change.ts ctor), and the factory requirement of the same spec lists `listWorkspaces`, `schemaProvider`. Spec wrong (internal contradiction). Also factory list omits nothing in code; ok.
E3. Spec says `change.updateSpecIds(specIds, actor)`; code calls `updateSpecIds(specIds, actor, schema.artifactDag())` (change.ts:1052). Spec stale.
E4. Schema compatibility section sits after "Spec Dependencies" (structure), and is missing from the Dependencies list (SchemaProvider/GetActiveSchema, core:get-active-schema dep absent from Spec Dependencies). Spec structure/deps defect.
E5. Invalidation policy values are only type-cast by callers; neither use case nor `Change.invalidationPolicy` setter validates them (change.ts:519). Spec: "Allowed values are none, surgical, downstream, global" - an invalid string from SDK/JS callers is persisted. Code gap (the theme "really validated" is applied to spec IDs only).
E6. Spec is silent on `removeSpecIds` entry that is empty/blank: code compares `''` as given -> `SpecNotInChangeError("")` (fine, consistent with spec text).
E7. Empty-result invariant (change must retain at least one specId) is stated in cli:change-edit but absent from core:edit-change and not enforced in code (see section 4, F1).
E8. Spec lists `unscaffold` before persistence ("call MUST happen after change is persisted") - satisfied. Code additionally calls `scaffold` for adds (not in this spec; spec gap).

### Test coverage

Covered: ChangeNotFound, no-op, add/dup/seeding, remove/absent, description, policy, combined, invalidation, refresh, schema guardrail (4), spec ID validation (invalid segment, comma, unknown workspace, bare normalization, atomic multi-invalid, non-existent spec accepted, readOnly one line each, remove skips ownership), audit hardening (empty add rejected, raw quoted in SpecNotInChangeError, bare remove, mixed readOnly, duplicate removal collapse, actor not resolved on idempotent add / resolved on change, unscaffold only on remove).

### Missing tests

- E1: that nothing is persisted on idempotent add (test checks only actor).
- E5: invalid policy.
- Policy-only edit does not resolve actor / persists (spec constraint) - not explicitly asserted.
- Empty `removeSpecIds`/`addSpecIds` arrays plus description only (spec "Both add and remove are empty arrays" verify scenario) - covered by verify text; confirm test exists (not found by name).

### Summary counts

Requirements 17 | implemented 15 | partial 2 (no-op persistence, policy validation) | spec defects 3 (E2, E3, E4) | missing tests 3-4.

---

## 4. cli:change-edit

### Requirements summary

Signature with repeatable `--add-spec`/`--remove-spec` whole values (never split, forwarded unchanged, command does not validate/qualify); at least one edit flag required, usage error exit 1 BEFORE config resolution; workspaces derived by core; readOnly via use case; invariant: change keeps >=1 specId (exit 1 before changes); invalidation warning to stderr; text/json output; error cases.

### Implementation status

Implemented: edit.ts uses `collect`; usage check (`cliError`) occurs before `resolveCliContext`; values forwarded raw; no config/workspace reading; JSON output contains result/name/specIds/workspaces/invalidated/state; invalidation warning on stderr; overlap warning best-effort via `kernel.changes.detectOverlap` (not in spec).

### Discrepancies

F1. Invariant enforcement not implemented: spec requires "If `--remove-spec` operations would leave `specIds` empty, the command exits with code 1 before making any changes", plus verify scenario "Removing last spec rejected" and "Error cases: if the result would leave specIds empty exits 1". Code: no check in edit.ts, no check in EditChange (edit-change.ts), no check in `Change.updateSpecIds` (change.ts:1052 just assigns `[...new Set(specIds)]`). Grep for "at least one spec"/"would leave" across core/cli src: no hits. Code wrong vs spec; alternatively spec wrong, because `cli:change-create` and core:create-change allow an empty `specIds`, so an empty-scope change is a valid state. Strong candidate for a spec/spec conflict: create allows empty, edit forbids empty. No test exists.
F2. Spec constraint "A discarded change cannot be edited": EditChange uses `this._changes.get` (active only), so a discarded/draft change reports ChangeNotFoundError; no explicit test.
F3. JSON/TOON output requirement body is truncated in the spec ("outputs (encoded in the respective format):" followed by nothing); the real shape is only in the help text. Spec defect.
F4. `--invalidation-policy` is cast `as 'none'|...` without validation (edit.ts); invalid values reach core (E5). Spec says allowed values `none|surgical|downstream|global`; exit-code behavior for other values is unspecified and untested.
F5. cli:change-edit Spec Dependencies omit `core:edit-change` (referenced in the readOnly requirement) and core:workspace; its dependency on `cli:change-create` is for "spec id format" which now lives in core:spec-id-format (stale rationale: "spec id format and workspace derivation logic").
F6. Description requirement says `--description` "sets or replaces"; empty string `--description ""` is passed (`!== undefined`) and sets empty description; unspecified.

### Test coverage (cli/test/commands/change-edit.spec.ts)

Covered: no options exit 1 (44), new spec (55), invalidation warning (83), JSON with invalidated flag (107), change not found (133), no invalidation w/o approval (147), JSON fields (176), raw add + WorkspaceNotFoundError (212), comma ID one value (229), readOnly mapping (247), no spec-path helper import (266), `Bad Id` quoted (276), `auth/a,b` quoted (292), remove raw (307), usage error before config (325), command does not read SpecdConfig (340).

### Missing tests

- Last-spec removal rejection (F1) - no test and no implementation.
- Workspace derivation scenarios (added/removed/unchanged workspace) - only via JSON field test; no dedicated scenario tests.
- `--invalidation-policy` (any value) and `--description` only (no invalidation) at CLI level.
- Removing a spec in a readOnly workspace not blocked (CLI level).

### Summary counts

Requirements 8 | implemented 6 | not implemented 1 (Invariant enforcement) | partial 1 (error cases: empty result) | spec defects 3 (F3, F5, F6) | missing tests 4.

---

## 5. core:create-change

### Requirements summary

Input contract (whole spec IDs; schemaName/version both or neither; includeOverlapCheck); spec IDs validated and normalized (InvalidSpecIdError/WorkspaceNotFoundError quoting the full value; nothing created; duplicates collapsed in first-occurrence order; name/schema checks run first so ChangeAlreadyExistsError wins); readOnly rejection one line per spec; active schema resolution; optional overlap check; initial invalidation policy; name uniqueness (active/draft/discarded); actor; single `created` event; construction; specDependsOn seeding; persistence+scaffold; schema compat guardrail; factory via resolveCreateChangeDeps.

### Implementation status

Implemented: create-change.ts execute: uniqueness checks (active, draft, discarded) first, then `_resolveSchemaIdentity` (InvalidCreateChangeInputError for half-override), actor, parse+normalize (lines ~125-138), readOnly message, dedupe via Set, seeding, create + scaffold + changePath, best-effort overlap.

### Discrepancies

G1. Schema compatibility guardrail rule 1 ("If the spec has no persisted semantic state (uninitialized) ... assumes it uses the project's active global schema") is NOT applied: code only checks when `persisted.schema !== null` (create-change.ts ~149-174); uninitialized specs skip the check. EditChange does implement the fallback (edit-change.ts `persisted.schema !== null ? ... : schema.name()`). Only matters when a caller passes an explicit schemaName/Version different from the active schema. Code wrong vs spec (or spec should say uninitialized specs are exempt). Test at 567 ("allows uninitialized spec fallback when global schema matches change") cannot detect it.
G2. Compat comparison differs between UCs: create resolves compat via `GetActiveSchema` (only when `changeSchema.name() === schemaName`), edit uses `schemaProvider` and `schema.compat()?.name`. Spec text identical for both; implementations diverge (and create swallows GetActiveSchema errors). Code inconsistency.
G3. `created` event `specIds`: spec says "the input spec paths"; code records normalized, deduped IDs. Code is better (spec stale/imprecise).
G4. Initial invalidation policy: spec says "MUST be one of none|surgical|downstream|global"; code does not validate the string (create-change.ts passes through; Change setter/ctor unvalidated). Code gap, same as E5.
G5. Spec structure: schema compat requirement appended after "Spec Dependencies"; the dependency list lacks core:get-active-schema usage for compat (it is listed) but also lacks core:workspace although readOnly rule references it. Minor.
G6. Actor is resolved before spec-ID validation (create-change.ts:119 vs 125); spec only requires "before constructing the change" (OK) but a failing validation still triggers identity resolution (git calls). Behavior, not a violation.
G7. Spec says "`Change` ... history exactly one `created` event ... `specIds`: input" and "without CLI" fine.

### Test coverage (core)

Covered: repository create then scaffold, history event, specIds on event, description, policy (given and default downstream), dependsOn seeding (4 cases + non-existent), schema resolve/skip/propagate, overlap (4), half schema input (2), duplicate name active/draft/discarded, compat (4), spec ID validation (invalid segment, comma, unknown workspace, bare normalization, atomic multi-invalid, nonexistent accepted, readOnly), audit hardening (name-before-spec-ID order, empty ID, duplicate collapse, mixed readOnly).

### Missing tests

- Uninitialized spec with explicit schema override differing from active (G1).
- Invalid initial invalidation policy (G4).
- Actor-resolution order vs invalid spec ID (G6, if desired).

### Summary counts

Requirements 14 | implemented 12 | partial 2 (compat guardrail rule 1, policy validation) | spec defects 2 (G3, G5) | inconsistency 1 (G2) | missing tests 3.

---

## 6. cli:change-create

### Requirements summary

Signature (`--spec` repeatable whole values, never split, forwarded unchanged; empty specIds allowed); no workspace/ownership logic in CLI; no getActiveSchema call; `includeOverlapCheck: true` when specs present; overlap warning from result; output text/json with changePath; duplicate name exit 1.

### Implementation status

Implemented: create.ts passes `specIds: opts.spec` raw via `collect`; includeOverlapCheck only when specs present; no direct detectOverlap call; stderr warning formatting; text `created change <name>`; JSON `{result, name, state, changePath}`; errors via handleError.

### Discrepancies

H1. `--invalidation-policy` value cast without validation; when both CLI flag and project config absent nothing is passed (default from core). Spec: "when absent the project configuration's invalidationPolicy applies" - satisfied. Invalid value behavior unspecified/untested (see E5).
H2. Help text schema `{ result, name, state }` omits `changePath` that the spec requires in json (create.ts addHelpText). Code (docs) wrong vs spec; minor.
H3. Spec defects: "Output on success" requirement is truncated (`prints a single line to stdout:` followed by nothing); "JSON output includes changePath" and "JSON output on success" duplicate each other.
H4. The spec lists dependencies cli:entrypoint, core:change, core:spec-id-format only; it references `core:create-change` and the config `invalidationPolicy` but does not depend on them.
H5. Spec scenario "Invalid ID rejected" (`--spec "Bad Id"`) has no CLI test (see below).

### Test coverage (cli/test/commands/change-create.spec.ts)

Covered: missing name (52), no --spec (62), raw bare ID (84), raw explicit workspace (108), unknown workspace mapping (133), comma ID as one value (158), no spec-path helper (176), text/json output incl. changePath (189,212), duplicate name (242), no getActiveSchema in CLI (258), includeOverlapCheck (278), overlap warning (305), readOnly mapping/mixed/multiple (339, 384, 413), invalid name (368), integration: manifest schema identity (512) and overlap with real DetectOverlap (543).

### Missing tests

- `--spec "Bad Id"` quoted InvalidSpecIdError exit 1 (verify scenario "Invalid ID rejected").
- `--invalidation-policy` flag/config precedence (no test mentions it).
- "No overlap check when specIds empty" at CLI level (core has it).
- Integration case verifying `default:auth/a,b` is not created on disk.

### Summary counts

Requirements 8 | implemented 8 (with H1/H2 caveats) | spec defects 3 (H3, H4, spec duplicate) | missing tests 4.

---

## 7. Consistency vs project-wide specs and direct deps (contradictions)

X1 (spec/spec). `core:update-implementation-tracking` ("no case-folding, exact matching") vs `_global/cross-platform` "Case sensitivity" (paths differing only by case must not be distinct on Windows/macOS). Same conflict applies to logical file names stored in the manifest. Needs an explicit exemption or a case-insensitive comparison rule for tracked files.
X2 (spec/spec). `cli:change-edit` requires non-empty specIds after edit; `cli:change-create`/`core:create-change` allow an empty specIds list and `core:edit-change` is silent. Either create-from-empty then edit-remove-to-empty is inconsistent, or the edit invariant is stale. Code enforces neither at edit.
X3 (spec/spec). `core:edit-change` Dependencies (`specs` map) contradicts its own factory requirement (`listWorkspaces`) and the code.
X4 (spec/code). `core:update-implementation-tracking` deps `specRepositories?` optional vs MUST always supplied.
X5. Consistency OK with `core:spec-id-format` (parseSpecId usage; error text quotes full value via InvalidSpecIdError(specId, ...)) and `_global/cross-platform` filesystem path rule (logical forward-slash identifiers, isolated platform helper).
X6. All three core UCs repeat the readOnly message literal; `core:workspace` is the cited source but is not in `Spec Dependencies` of core:create-change / core:edit-change (dependency omission, minor).
X7. Policy values: `core:create-change`, `core:edit-change`, both CLI specs name four values but no spec assigns validation to a layer (core vs CLI) and no code validates (E5/F4/G4/H1).
X8. Project convention `_global/architecture` (delivery adapters hold no domain rules): CLI edit/create/implementation follow it (raw forwarding); the exception is the unchecked `as` cast of the policy string in create.ts/edit.ts.

---

## Overall counts

- Specs audited: 6; requirements ~72.
- Not implemented: 1 (cli:change-edit invariant enforcement F1, possibly a spec defect).
- Partial / real code discrepancies: C1 (start output), D1 (start specId), E1 (persist on no-op), E5/F4/G4/H1 (policy validation), G1 (uninitialized compat), G2 (compat inconsistency), H2 (help text).
- Spec defects: D2, D6, D7, E2, E3, E4, F3, F5, F6, G3, G5, H3, H4, plus X1-X3.
- Missing tests (principal): resolve + bad specId (M1), start + bad specId, last-spec removal rejection, invalid policy in all layers, create CLI "Bad Id", start json/toon/timestamp, no-persist on idempotent add, uninitialized compat with override.

---

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

---

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

---

# Partial D: cli:graph-index, cli:project-init, skills:workflow-automation + global specs

Read-only audit. Specs read via `changes spec-preview`. Tests not executed (static review of diffs only).

## cli:graph-index

Requirements touched by the change: "Command signature" (`--exclude-path` repeatable, each value whole, never comma-split, listing allowed). Related requirement "CLI reference documentation" (describe `--exclude-path`: repeatable, gitignore-syntax, project-relative, merges into global layer).

Implementation status: IMPLEMENTED.

- packages/cli/src/commands/graph/index-graph.ts:~70-74: option is `<glob...>` (variadic) and argParser is `(prev ?? []).concat(val)`, with no `split(',')`. Matches spec ("repeat the option or list them after it").
- docs/cli/cli-reference.md (graph index section) updated: signature `--exclude-path <glob...>`, comma-separated text removed, example `--exclude-path "packages/generated/*" "tmp/"` added. docs/cli/graph.md:37 also uses `<glob...>`.

Discrepancies:

- None between spec and code.
- Minor (docs, not spec-violating): docs/guide/cli.md:260 and docs/guide/code-graph.md:70 still say `--exclude-path <glob>` (singular, no variadic mention). Not wrong, just not updated. Low.
- Minor: the "CLI reference documentation" requirement does not mention variadic or no-comma-split, but the docs now state it. Spec is narrower than docs; harmless.
- Note: commander's `argParser` on a variadic option receives `prev` as the accumulated array, so `concat(val)` is correct for both `--exclude-path a b` and `--exclude-path a --exclude-path b`.

Test coverage (packages/cli/test/commands/graph-index.spec.ts):

- Existing test changed from `'foo,bar'` -> `['foo','bar']` to `'{a,b}/**'` -> `['{a,b}/**']` (:99-111).
- New: "accepts the listed --exclude-path form" (`a b` -> `['a','b']`), "keeps a brace glob as a single --exclude-path pattern" (:~289-311).

Missing tests: none material. The repeated-flag form (`--exclude-path a --exclude-path b`) is not asserted explicitly in the new tests. Low.

Counts: requirements 1 (+1 related docs), implemented 2/2, discrepancies 0 blocking, 2 minor docs nits.

## cli:project-init

Requirements touched: new "Workspace id validation" (use `isValidWorkspaceName` from core:spec-id-format, `^[a-z][a-z0-9-]+$`, >=2 chars, no Windows device names; non-interactive: exit 1, `error:` to stderr quoting full value and naming the rule, no file written; interactive: prompt rejects with same message; never trim or alter; `default` valid; CLI MUST NOT keep its own regex).

Implementation status: IMPLEMENTED.

- packages/cli/src/commands/project/init.ts:2 imports `isValidWorkspaceName` from `@specd/sdk` (re-exported from core at packages/sdk/src/core-reexports.ts:573, so the "hosts import sdk only" rule holds).
- init.ts:~63: non-interactive check runs before banner/initProject, calls `cliError(invalidWorkspaceMessage(...), format)`. Message: `Invalid workspace id '<value>': use two or more of a-z, 0-9 and "-", starting with a letter, and not a Windows device name`. It quotes the whole value and names the rule.
- init.ts:~201: the wizard validator uses `isValidWorkspaceName(value ?? '')` and the same message. The old trimmed `/^[a-z][a-z0-9-]*$/` regex is removed.

Discrepancies:

- Possible spec/code mismatch to confirm: the spec requires a `error:` prefix on stderr and exit code 1. This depends on `cliError` in packages/cli/src/handle-error.ts, which has its own diff in this change. The test asserts exit(1) and message content, not the literal `error:` prefix. Code or test gap: low. Confirm `cliError` prints `error: `.
- Possible gap: with `--format json|toon`, `cliError(msg, opts.format)` may emit structured output instead of the "stderr `error:` message" the spec states. The spec does not distinguish formats. Spec is silent, code is plausibly fine.
- The validator in the wizard returns the message via `invalidWorkspaceMessage(value ?? '')`. When value is `undefined` it quotes `''`. Harmless.
- Spec "Command signature" lists `--workspace <id>` with no mention of the grammar. Fine, covered by the new requirement.

Test coverage (packages/cli/test/commands/project-init.spec.ts, +110 lines, describe "project init workspace id validation (audit hardening)"):

- Rejects `a`, `Core`, `nul` with exit 1, error quotes id, contains `a-z`, and `initProject` not called.
- Does not trim (`ab` -> error quoting `' ab '`).
- Accepts `ab`.
- The wizard validator (via mocked @clack/prompts) rejects `a`, `Core`, `nul`, `ab` and accepts `default` and `ab`.
- Static test: no `[a-z][a-z0-9-]` regex in packages/cli/src (matches the "MUST NOT keep its own copy" rule).

Missing tests: no assertion that no file is written beyond the initProject mock not being called. The `error:` prefix and the json/toon format behaviour are not asserted. The wizard re-ask loop is not tested (only the validator function). All low.

Counts: requirements 1 new, implemented 1/1, blocking discrepancies 0, 2 items to confirm.

## skills:workflow-automation

Requirement touched: "Implementation traceability policy": when resolving or ignoring multiple files, pass one whole name per value (repeat `--file` or list after it); MUST NOT comma-join.

Implementation status: IMPLEMENTED.

- packages/skills/templates/skills/specd-implement/SKILL.md.tpl and specd-archive/SKILL.md.tpl: comma-separated examples replaced with `--file <path1> --file <path2> ...`; "comma-separated" text removed.
- The "Files with active confirmed links cannot be ignored" claim was replaced with "Ignoring a file preserves any confirmed links on it." This is an extra behaviour change in the templates. It must match cli/core `ignore` semantics; it is not covered by this spec, so check the implementation spec (cli:change-implementation) agrees. Evidence of the CLI side: packages/cli/src/commands/change/implementation.ts:109,129,149 declare `--file <paths...>` for resolve/unresolve/ignore, and the help text says commas are not separators.
- No comma-joined `--file/--spec/--add` examples remain in packages/skills, dev/ai-agents, or docs (git grep with regex found none). specd-fasttrack template has no `ignore` text and no comma lists.

Discrepancies:

- Spec scope gap: the spec does not mention the confirmed-links-on-ignore claim that the templates now assert, and the new test (template-workflow.spec.ts, "does not claim confirmed links block ignore") enforces it. Either add it to the spec or confirm it is in cli:change-implementation. Spec incomplete rather than code wrong. Low/medium.
- `--spec`/`--add`/`--add-spec` are covered by the template test but the spec text only talks about implementation files. Spec is narrower than the enforced test.

Test coverage (packages/skills/test/template-workflow.spec.ts, +37):

- No comma-joined `--file` lists or "comma-separated" in implement, archive, and fasttrack templates.
- Scans all `.tpl`/`.md` under the templates root for `--file|--spec|--add|--add-spec` followed by `a,b` or `<a>,<b>`.
- Confirmed-links wording check.

Missing tests: no check that `dev/ai-agents/skills/*` copies match. The templates are the source, so this is low. The regexes look only for a flag followed by a no-space `a,b` token, so quoted or `=`-joined forms (`--file=a,b`) would pass. Low.

Counts: requirements 1, implemented 1/1, discrepancies 0 blocking, 2 spec-scope notes.

## Project-wide specs (default:\_global/\*) vs change diff

Diff: `git diff HEAD --stat` shows 17 files in cli/skills/docs scope for this partial. Whole-change CLI diff includes many commands, core changes (untracked new files: spec-id-rules.ts, parse-spec-pattern.ts, invalid-spec-id-error.ts, invalid-spec-lock-error.ts, invalid-spec-pattern-error.ts, workspace-not-found-error.ts, get-change-spec-deps.ts, to-logical-file-path.ts, confirm.ts), and the deletion of packages/cli/src/helpers/spec-path.ts and test/helpers/spec-path.spec.ts.

- architecture: CLI imports `isValidWorkspaceName` via `@specd/sdk`, not core, so the adapter-only rule holds. Core domain files are pure functions (spec-id-rules, parse-spec-pattern, to-logical-file-path); not deeply audited here (other partials cover core). New use cases get-change-spec-deps has an application file and a composition factory, consistent with the layering. OK.
- error-handling-conventions: the new errors InvalidSpecIdError (`INVALID_SPEC_ID`), InvalidSpecLockError (`INVALID_SPEC_LOCK`, carries specId/location/fieldPath/reason, message names the field), InvalidSpecPatternError and WorkspaceNotFoundError extend `SpecdError` with UPPER_SNAKE codes and actionable messages. Conforms. Note: InvalidSpecLockError message tells what is wrong but does not itself say how to repair (e.g. "regenerate with ..."); the theme "actionable repairable error" may be satisfied in the CLI layer (handle-error.ts diff), which was not verified here. Flag for the CLI-error auditor. Medium-low.
- testing: new tests are `.spec.ts` under test/ mirroring src. Cross-platform: tests use `import.meta.url`/URL for file reads (fine). The static source-scan tests (`readdir(..., {recursive:true})`) with forward-slash keys are fine. The template-test regexes assume LF; `readTemplate` should LF-normalise. Not checked, low. The new tests do not use snapshots. project-init test includes a "(audit hardening)" describe name; this is not Given/When/Then phrasing, a cosmetic deviation from "Given/When/Then" in `_global/testing`. Low.
- docs: docs/cli/_ , docs/core/_, docs/guide/\*, docs/sdk/index.md updated. `_global/docs` requires "Update docs for public composition / template / list-contract changes" -> done for the list contract (cli-reference, graph.md, changes.md, spec-deps.md), the core errors (docs/core/errors.md adds invalid spec id/lock/pattern, workspace not found), services/use-cases/ports, and the workspaces guide (spec ID grammar). The docs/guide frontmatter was not altered. Minor stale: docs/guide/cli.md:260 and docs/guide/code-graph.md:70 `--exclude-path <glob>` singular wording; no docs/skills page references the template change (none found needing it).
- cross-platform: `isValidWorkspaceName` includes Windows device name rejection, consistent. No hardcoded separators in the CLI diff seen.
- eslint/conventions: init.ts new helper has JSDoc and an explicit return type. Named exports only. OK.

## Dangling references to packages/cli/src/helpers/spec-path.ts

- `git grep "helpers/spec-path|spec-path\.js"` across packages/_/src, packages/_/test, docs, apps: only matches are the intentional negative assertions in packages/cli/test/commands/change-create.spec.ts:176-183 and change-edit.spec.ts:266-271 (assert the import is gone and the file is gone). No dangling imports. The deleted unit test packages/cli/test/helpers/spec-path.spec.ts is also removed (status ` D`).
- Other `spec-path` hits are the `<spec-path>` doc placeholders (docs/guide/deltas.md, docs/adr/0010, dev/ai-agents/skills/specd-new/SKILL.md:95) and are unrelated.
- Not verified: a fresh build/typecheck (not run, read-only audit). packages/cli/dist may still contain a stale spec-path.js; irrelevant to source.
- Untracked-file caveat: new core files and the CLI helper confirm.ts are untracked (`??`), so they must be added to the commit.

## Other comma-split spots remaining (informational, consistent with the theme)

- packages/cli/src/helpers/parse-comma-values.ts (`parseCommaSeparatedValues`) is still used by `--skip-hooks` (archive.ts:50, transition.ts:260) and graph kinds (parse-graph-kinds.ts). Values are enumerated tokens with no commas in names, so this is acceptable and not in the change's scope.
- packages/cli/src/commands/graph/impact.ts:95 splits `--type` on commas and parse-file-categories.ts:21 splits categories. Both are enum lists. OK.
- packages/skills/src/application/specd-block-manager.ts:89,185 split agent lists inside marker comments. Internal, not a CLI option.

## Overall summary

- Specs audited: 3 (+ global set). Requirements: 3 changed or added, 3 implemented (100%).
- Blocking discrepancies: 0.
- Items for follow-up: (1) confirm `cliError` prints the `error:` prefix and its behaviour with `--format json|toon` for init validation; (2) spec for workflow-automation does not cover the "ignore preserves confirmed links" wording that the templates and test now enforce, so reconcile with cli:change-implementation; (3) docs/guide/cli.md:260 and docs/guide/code-graph.md:70 are stale on `--exclude-path` variadic form; (4) InvalidSpecLockError message lacks an explicit repair hint, so check it is added in the CLI layer; (5) new untracked files need committing.
