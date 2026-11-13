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
