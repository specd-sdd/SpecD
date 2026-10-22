# Spec compliance — archive-schema-checks-and-skip-flag (delegated, attempt verification-attempt-4)

Mode: delegated, Full verify. Timestamp 20261022-105635. Tests/lint/typecheck green.

## Summary

- No High findings; code conforms to all 12 specs.
- Batch B Medium (\_mergeBlockers OR-ed skippability) is STALE: fixed via separate transitionSkippable/archiveSkippable maps (batch C confirms).
- Remaining: Low spec wording (get-status nextAction.reason unconditional flag; archive-change ctor snippet; transition-checks deps; workflow-model rule 6 prose/scenario id), lifecycle-verdict hardcoded isSkippable/bypassFlag (latent), test gaps.

## Detailed Findings

# Partial audit (batch A): core:archive-change, core:check-registry

Change: `archive-schema-checks-and-skip-flag` (working tree vs HEAD). Method: merged spec+verify via `changes spec-preview`, code and tests read directly (tests not executed). Baseline: reports/20261022-093411/\_partial-core-archive.md.

Key code: `packages/core/src/application/use-cases/archive-change.ts` (execute 288-520, throwMappedArchiveFailure 1489-1597), `application/services/validate-skip-checks.ts`, `domain/errors/spec-overlap-error.ts`, `domain/services/check-bindings.ts` (ARCHIVE_BINDING_SPECS 150-245), `domain/services/check-registry.ts` (default bindings incl. ARCHIVE_BINDINGS), `domain/services/build-schema.ts` (assertDeclarationGovernance 724-759, archiveChecks loop 1006-1029), `composition/use-cases/archive-change.ts` (118-218).

## Delta vs baseline audit (what changed since 093411)

- D1 (SpecOverlapError omitted peer names) is FIXED: message is now `Cannot archive: specs [<specId> (<peer1>, <peer2>)] are also targeted by other active changes.` Test `spec-overlap-error.spec.ts` asserts spec + peers (`beta`, `gamma`) in the message.
- D2 (CLI flag text in core error) is FIXED for `SpecOverlapError`: message neutral, `skippable` exposed (default true), ArchiveChange passes `skippable` from the resolved `spec.overlap` binding (archive-change.ts:1503-1506). Tests assert no `--skip-checks`/`--allow-overlap`, and `skippable` false when schema hardens it.
- D4 and D8 (missing dependency entries) are FIXED in the specs: archive-change deps now list `core:transition-checks` and `core:check-registry`; check-registry deps now list `core:schema-format`.
- D3 wording is FIXED in spec: verify scenario now states "the only state written earlier is canonical validity reconciliation".
- Previously missing tests now present: plugin failure without code -> `CHECK_FAILED` (archive-change.spec.ts:4758), schema-hardened and schema-disabled `impl.linksInScope` (4895, 4902), readOnly skip rejected with zero progress events and state still archivable (4911), spec.overlap skip + readOnly failing -> peer untouched (4678), retry from archiving (4699).

---

## 1. core:archive-change

### Requirements Summary

Ports/ctor (optional trailing `CheckRegistry`, no `RunStepHooks`), archive bindings as base only, Input (`skipHookPhases`, `skipChecks`; no bypass booleans), sovereign schema resolution, archivable guard, canonical validity preflight, deferred transition, readOnly guard (fully locked), overlap guard (skippable/disable/harden by schema, neutral error with `skippable`), hooks by binding phase, tracked artifact selection, prepare/commit/snapshot/restore/orphan/rollback, debug logging, delta merge, validity evidence, archive repo call, index metadata, post hooks, metadata generation (sovereign schema), spec-lock persistence, result shape, typed errors (incl. `UnknownCheckError`, `CheckNotSkippableError`, `CheckPredicateFailedError`), archive checks sharing runners, effective bindings + skip validation, impl review guard (locked), implementation materialization, out-of-scope guard (`impl.linksInScope` bypass via skipChecks), config factory via `resolveArchiveChangeDeps`, shared fallback snapshot.

### Implementation Status (change-related requirements; unchanged ones not re-audited in depth)

| Requirement                                                                                                                                        | Status                                    | Evidence                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ctor: optional `CheckRegistry` last; no RunStepHooks                                                                                               | Conformant                                | archive-change.ts:232-271; composition/use-cases/archive-change.ts:199,218                                                        |
| Base bindings not executed directly; resolved per execute; not mutated                                                                             | Conformant                                | archive-change.ts:327-332 local const, all predicates/effects use `effectiveBindings` (342,392,436); `_archiveBindings` read-only |
| `resolveArchiveChangeDeps` has `checkRegistry`, no `runStepHooks`                                                                                  | Conformant                                | composition/use-cases/archive-change.ts:123,157; test composition/use-cases/archive-change.spec.ts:59                             |
| Input `skipChecks`, no `allowOverlap`/`allowOutOfScope`                                                                                            | Conformant                                | archive-change.ts:96; `archive-change-input.spec.ts`                                                                              |
| Skip validation: unknown/hook/non-skippable/registered-unbound/dedupe/case-sensitive                                                               | Conformant                                | validate-skip-checks.ts:44-59                                                                                                     |
| Ordering: schema resolution -> reconcile -> state guard -> skip validation -> predicates -> hooks -> writes                                        | Conformant                                | archive-change.ts:295, 303-316, 333, 342, 392                                                                                     |
| Governance: only `spec.overlap`, `impl.linksInScope` skippable; rest locked                                                                        | Conformant                                | check-bindings.ts:158-245; build-schema.ts:745-758                                                                                |
| `workspace.readOnly` / `impl.filesResolved` fully locked on archive                                                                                | Conformant                                | check-bindings.ts:187-215 (all four locks false); `validateSkipChecks` rejects skip                                               |
| Overlap guard keyed on `spec.overlap` bypass; peers loaded only after predicates; schema-disabled -> no scan                                       | Conformant                                | archive-change.ts:338-365, 377-381                                                                                                |
| `SpecOverlapError` names specs+peers, no delivery flag, exposes `skippable`                                                                        | Conformant                                | spec-overlap-error.ts:30-37                                                                                                       |
| Peer invalidation via reconciler `spec-overlap-conflict`, never `Change.invalidate`                                                                | Conformant                                | `_invalidateOverlappingChanges` (reached from archive-change.ts:377)                                                              |
| Bypass does not bypass other failing checks (no peer invalidated)                                                                                  | Conformant                                | failed predicates thrown (367-376) before invalidation (377)                                                                      |
| Plugin/embedded failure -> `CheckPredicateFailedError` with id,label,code (`CHECK_FAILED`),message,command,details,skippable from resolved binding | Conformant                                | archive-change.ts:1584-1595                                                                                                       |
| Built-in failures keep dedicated errors                                                                                                            | Conformant                                | switch 1497-1583                                                                                                                  |
| Bypass reported `outcome: 'skip'` with same marker                                                                                                 | Conformant (indirect)                     | skipChecks passed to `executeMatchingPredicates` + `buildCheckExecutionContext` (342-353), same path as TransitionChange          |
| Hooks selected by binding phase, honoring `onFailure`; `skipHookPhases` skips effects only                                                         | Conformant                                | archive-change.ts:392-414                                                                                                         |
| `impl.linksInScope` only evaluated via predicate; disabled -> no out-of-scope failure                                                              | Conformant                                | no other out-of-scope throw in use case (only count logging 474)                                                                  |
| Metadata materialization with sovereign schemaName                                                                                                 | Not re-audited (unchanged by this change) | -                                                                                                                                 |

### Discrepancies

- **A1 (Low, spec-vs-code doc)**: Spec ctor listing (spec.md "Ports and constructor") omits the `reconcile: ReconcileChangeValidity` (required, throws `InvalidCompositionFactoryArgumentsError` when missing) and `resolveChangeSchema` parameters that exist in code between `hasher` and `checkRegistry`. The "Canonical validity" requirement says the reconciler is mandatory in every constructor, so the listing is incomplete rather than contradictory. Spec wrong (listing); code is consistent with the other requirement. Suggest adding the two params to the signature snippet.
- **A2 (Low, ordering/behavior, pre-existing)**: Peer invalidation (`spec.overlap` bypassed) is applied at archive-change.ts:377-381, BEFORE pre-archive hooks, post-hook reconciliation/rerun, plan preflight and snapshots. If a pre-archive hook, post-hook validity re-check, rerun predicate (e.g. a later `deps.consistent` failure), or plan preflight then aborts the archive, overlapped peers stay invalidated although nothing was archived. Spec verify only covers "other failing checks in the first predicate pass -> no peer invalidated" (satisfied). Code possibly wrong (move invalidation after preflight/just before transition to `archiving`) or spec should state invalidation timing explicitly ("Overlap guard ... evaluated before hooks; invalidation applied when bypassed" is silent). Recommend clarifying in spec whichever behavior is intended.
- **A3 (Low, domain purity)**: Core text still mentions delivery flags in non-error-message places: `HOOK_CHECK_NOT_SKIPPABLE_REASON` ("CLI: --skip-hooks"), JSDoc of `SpecOverlapError.skippable` ("with `--skip-checks`"). Archive spec only forbids flags in the `SpecOverlapError` message and requires the hook message to point to `skipHookPhases` (satisfied: both mentioned). Under `default:_global/architecture` delivery-agnostic core this is cosmetic; spec wording for the hook case ("points to skipHookPhases") is satisfied. No action required; optionally neutralize.
- **A4 (Info, spec wording)**: Spec says skip validation happens "after the archivable/state guard", but reconcile (state-writing) runs earlier; verify scenario now documents this. Conformant.

Cross-checks with dependencies/project specs:

- `core:transition-checks`: archive resolves via `resolveEffectiveBindings({operation:'archive'})` and attempt `{scope:'archive'}`; consistent.
- `core:check-registry`: archive governance defaults in code match (see section 2).
- `default:_global/architecture`: use case depends on ports/domain services only; `validateSkipChecks` in application layer; composition wires registry. OK.
- `default:_global/error-handling-conventions`: new errors extend `SpecdError`, messages actionable (hook case points to skipHookPhases; overlap case lets hosts compose hint). `CheckPredicateFailedError.code` is dynamic (plugin codes not validated UPPER_SNAKE_CASE) - minor, pre-existing contract.
- `default:_global/testing` (colocated unit tests, no I/O in domain tests): new tests follow the pattern (fakes, no fs).

### Test Coverage

Files: `test/application/use-cases/archive-change.spec.ts` (overlap 3338-3520; impl guards 3557-3680; effective bindings/skipChecks 4389-4959), `test/application/services/validate-skip-checks.spec.ts`, `test/application/use-cases/archive-change-input.spec.ts`, `test/domain/errors/spec-overlap-error.spec.ts`, `test/composition/use-cases/archive-change.spec.ts`, `test/composition/use-cases/workflow-check-registry.spec.ts`.

| Scenario group                                                                                                                                                                      | Coverage                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ctor/CheckRegistry, deps                                                                                                                                                            | Covered (composition specs)                                                                                                                                |
| skipChecks default/empty/dup/case/unknown/hook/locked/registered-unbound/disabled/mixed/state-before/schema-before                                                                  | Covered (4504-4611)                                                                                                                                        |
| spec.overlap: error names spec+peer, neutral, skippable true/false, bypass+invalidate, none-overlap, schema-disabled, non-skippable, retry from archiving, other-check-not-bypassed | Covered (3338-3520, 4613-4717, SpecOverlapError spec)                                                                                                      |
| Plugin/embedded: order, failure, code, `CHECK_FAILED`, skippable carry, schema-skippable, disable, embedded non-skippable, declaration order                                        | Covered (4719-4845)                                                                                                                                        |
| impl.linksInScope: default fail, bypass publishes, schema hardened, schema disabled; filesResolved not bypassable; linksInScope bypass does not bypass open file                    | Covered (3579-3680, 4895-4930) - disabled test is weak, see below                                                                                          |
| workspace.readOnly skip rejected before anything runs                                                                                                                               | Covered (4911)                                                                                                                                             |
| Base bindings unmutated / resolved per run                                                                                                                                          | Partial (4847 compares two separate ArchiveChange instances; no same-instance two-schema test, no identity/frozen assertion on the injected array)         |
| Peers listed only after predicates return                                                                                                                                           | Missing (no ordering assertion on `list()`/`get()` relative to predicate execution; only "schema-disabled -> no scan" indirectly via invalidation absence) |
| Both spec.overlap and impl.linksInScope failing, only overlap skipped                                                                                                               | Missing                                                                                                                                                    |
| Bypass outcome `skip` marker                                                                                                                                                        | Covered (4600 area; progress events)                                                                                                                       |

### Missing / Weak Tests

1. Same `ArchiveChange` instance archiving two changes with different sovereign schemas (scenario "Bindings are resolved on every execute").
2. Assert peers are not listed/loaded before predicates return (spy on `ChangeRepository.list` call order or call count when no failure and no bypass).
3. Scenario "Bypassing one check does not bypass another" with the literal pair `spec.overlap` + `impl.linksInScope`.
4. Weak: `does not evaluate impl.linksInScope when the schema disables it` (archive-change.spec.ts:4902) swallows the result with `.catch(() => undefined)` and only asserts no progress event; it does not assert the archive succeeds ("archive does not fail for out-of-scope updates").
5. Assertion that the injected `archiveBindings` array identity/contents are unchanged after a run with `disabled: true` (spec "not mutated") - currently inferred from a second instance.
6. No test for A2 (peer state after an archive aborted by a later hook/preflight failure after overlap bypass).

### Spec Dependency Chain

core:archive-change -> core:change, core:schema-format, core:delta-format, core:validate-artifacts, core:storage, core:run-step-hooks, core:hook-execution-model, core:template-variables, core:spec-metadata, core:content-extraction, default:\_global/architecture, core:workspace, core:spec-id-format, core:spec-overlap, default:\_global/logging, core:spec-lock, default:\_global/error-handling-conventions, core:materialize-spec-metadata, core:spec-optimization, core:initialize-persisted-spec-state, core:composition-resolver, core:transition-checks, core:resolve-change-schema, core:check-registry. Dependency list is now complete for the new requirements (transition-checks, check-registry, schema-format all listed). No circular spec dependency introduced by this change besides existing mutual references (transition-checks <-> check-registry, workflow-model <-> archive-change) which are pre-existing/benign (doc links).

### Summary counts

Requirements: 31 in spec; change-related 14 checked in depth, 14/14 conformant in code. Verify scenarios: ~190 total; change-related ~75: ~66 covered, 4 partial/weak, 3-4 missing. Discrepancies: 0 High, 0 Medium, 3 Low (A1 spec listing, A2 invalidation timing, A3 cosmetic CLI text), 1 Info (A4).

---

## 2. core:check-registry

### Requirements Summary

Open registry API; built-ins immutable (16 checks); namespacing; CustomCheckDefinition adaptation; binding coordinates (transition/archive/step-skip) with duplicate prevention incl. one `archiveChecks` declaration per check id; two-tier governance and monotonic locks incl. merge of `archiveChecks`; Category A/B/C defaults plus the archive exception (`workspace.readOnly`, `impl.filesResolved`, `deps.consistent` fully locked on archive); composition fidelity and executable instances; archive declarations governed by the same locks; cascading config hierarchy.

### Implementation Status

| Requirement                                                                                                         | Status                                              | Evidence                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Registry holds archive default bindings                                                                             | Conformant                                          | check-registry.ts default `defaultBindings = [...TRANSITION_BINDINGS, ...ARCHIVE_BINDINGS]`           |
| Archive coordinate `{checkId, scope:'archive'}`; duplicate declaration -> `DuplicateCheckBindingError`              | Conformant                                          | build-schema.ts:1012-1016                                                                             |
| Archive/transition coordinates independent                                                                          | Conformant                                          | coord key `${id}::archive` vs transition keys; resolver overlays per scope                            |
| Archive exception locks on 3 checks (all four values false)                                                         | Conformant                                          | check-bindings.ts:187-215; transition rows unchanged                                                  |
| Category A archive checks reject disable/skippable; `workflow.taskCompletion` also locked                           | Conformant                                          | check-bindings.ts:160-171, 217-245                                                                    |
| `spec.overlap`/`impl.linksInScope` tunable on archive                                                               | Conformant                                          | check-bindings.ts:172-180, 216-224                                                                    |
| Governance shared via `assertDeclarationGovernance` for archiveChecks; placement/policy/disable/config              | Conformant                                          | build-schema.ts:724-759, 1018-1028                                                                    |
| Plugin archive binding tunable without embedding; plugin lacking archive binding -> embedding forbidden when locked | Conformant                                          | ownBinding lookup requires `scope==='archive'` (1018-1020); placement lock 729-731                    |
| Plugin binding `skippable` default normalized (undefined -> false) so lock comparisons are stable                   | Conformant                                          | transition-checks.ts:523 (`spec.skippable ?? false`)                                                  |
| Layer merge keeps `archiveChecks` collision-safe                                                                    | Conformant                                          | merge-schema-layers.ts (archiveChecks branch); tests merge-schema-layers.spec.ts:457-530              |
| Registration fidelity: composition forwards archive default bindings                                                | Conformant                                          | check-registry.ts:290 normalizes `scope:'archive'`; composition specs                                 |
| Executable instances for archive checks                                                                             | Conformant                                          | composition/use-cases/archive-change.ts uses registry.checkRegistry; test composition archive spec:59 |
| Cascade config once in resolver                                                                                     | Conformant (unchanged; transition-checks.spec 1227) | -                                                                                                     |

### Discrepancies

- **R1 (Low, doc)**: `Spec Dependencies` link for `default:_global/architecture` in check-registry/spec.md is `../../default/_global/architecture/spec.md`, which resolves to a nonexistent `specs/default/...` (real location `specs/_global/architecture/`; archive-change uses `../../_global/...`, transition-checks uses `../../../_global/...`). Pre-existing, not introduced by this change but touched file; spec wrong.
- **R2 (Low, spec precision)**: Governance scenario "Category A archive checks reject disablement" lists `workflow.taskCompletion` as Category A, but the Requirement text classifies it as Category B (native step attribute). Behavior is identical (all locked on archive; code applies same locks). Spec wording only.
- **R3 (Info)**: `assertDeclarationGovernance` compares schema `skippable` against `ownBinding.skippable` only when `allowBindingOverride === false`; redundant redeclaration is accepted as spec requires. No defect.
- No code defects found.

### Test Coverage

Files: `test/domain/services/build-schema-archive-checks.spec.ts`, `check-bindings.spec.ts`, `check-registry.spec.ts` ("archive bindings"), `merge-schema-layers.spec.ts` (archiveChecks 457+), `test/composition/composition-registries.spec.ts`, `transition-checks.spec.ts` (1113-1330), `schema-std-load.spec.ts` (no default archiveChecks), `infrastructure/schema-yaml-parser.spec.ts` (archiveChecks parsing).

| Scenario                                                                                   | Coverage                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate archiveChecks declaration                                                        | Covered (build-schema-archive-checks.spec.ts:121)                                                                                                                         |
| Archive vs transition independence; archive exception does not touch transitions           | Covered (127, 201; check-bindings spec)                                                                                                                                   |
| Archive exception locks readOnly disable, filesResolved skippable, deps.consistent config  | Covered (158-185)                                                                                                                                                         |
| spec.overlap / linksInScope tunable                                                        | Covered (191)                                                                                                                                                             |
| Plugin tunable without embedding; locked plugin without archive binding rejected           | Covered (209, 224)                                                                                                                                                        |
| Plugin policy/config/disable locks on archive                                              | Covered (240)                                                                                                                                                             |
| Plugin config merged over defaults (effective config `{minSeverity: critical}`)            | Partial (build test at 218 only asserts acceptance; the merge result is covered at resolver level transition-checks.spec 1227 and parser level, not the literal scenario) |
| archiveChecks survive layer merging with locks intact                                      | Partial (merge/duplicate covered in merge-schema-layers.spec; "later layer cannot relax a lock" enforced at build only and not tested through merged layers end to end)   |
| Category A archive checks reject disable/skippable; embedding of `approval.spec` forbidden | Covered (158, 166, 183)                                                                                                                                                   |
| Redeclare locked check unchanged accepted                                                  | Covered (187)                                                                                                                                                             |
| Schema-owned binding changed by later layer / check-level locks honored for schema-owned   | Not archive-related; unchanged                                                                                                                                            |

### Missing Tests

1. End-to-end: base + `schemaOverrides` layer where the later layer tries `skippable: true` on `impl.filesResolved` (or `disabled: true` on `workspace.readOnly`) in `archiveChecks`, rejected after merge+build.
2. Plugin archive binding with `defaultConfig` merged through `buildSchema` + `resolveEffectiveBindings` yielding effective `{minSeverity: 'critical'}`.

### Spec Dependency Chain

core:check-registry -> core:transition-checks (also depends back on check-registry; mutual doc reference), default:\_global/architecture, core:schema-format -> core:delta-format, core:selector-model, core:content-extraction, core:schema-merge. Archive-change depends on check-registry (documented). Dependency set now complete (schema-format added).

### Summary counts

Requirements: 8; change-related 4 (coordinates, governance/archive exception, archive declarations, merge safety) all conformant. Verify scenarios change-related ~22: 20 covered, 2 partial, 0 missing. Discrepancies: 0 High, 0 Medium, 2 Low (R1 broken link, R2 category wording), 1 Info.

---

## Totals

- High 0, Medium 0, Low 5 (A1, A2, A3, R1, R2), Info 2 (A4, R3).
- Resolved since baseline: D1 (Medium), D2, D3, D4, D8, plus 6 previously-missing tests.
- Remaining test gaps: 6 (archive-change) + 2 (check-registry).

# Partial compliance report, batch B

Change: `archive-schema-checks-and-skip-flag`. Specs: core:schema-format, core:transition-checks, core:workflow-model.
Paths relative to `packages/core/` unless prefixed. Graph index was not used (known stale); code read directly. Baseline: 20261022-093411 `_partial-core-schema-status.md` (schema-format, workflow-model sections). Re-verified against the current working tree; baseline conclusions still hold, with the corrections noted below.

Project-wide checks (`default:_global/architecture`, `error-handling-conventions`, `testing`):

- Architecture: CONFORMANT. `domain/services/{build-schema,transition-checks,check-bindings,check-registry,merge-schema-layers}.ts` and `domain/value-objects/workflow-step.ts` import only domain modules. Zod strictness lives in `infrastructure/schema-yaml-parser.ts` (allowed direction). `application/services/validate-skip-checks.ts` is application-layer and reads resolved bindings only.
- Error handling: CONFORMANT. `SchemaValidationError` for schema shape and wrong step, `InvalidInputError` for resolver misuse, the typed governance errors (`CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`, `CheckDisableForbiddenError`, `UnknownCheckError`, `DuplicateCheckBindingError`) reused, none new.
- Testing: mostly conformant. One nit (Low, uncertain): the new `test/domain/services/build-schema-archive-checks.spec.ts` does not mirror a single source file (it splits out of `build-schema.spec.ts`); acceptable but not 1:1.
- Doc nit (Low): `OverlayDeclaration` in `transition-checks.ts` L577-583 has no per-member JSDoc while sibling interfaces do. Cosmetic.

---

## 1. core:schema-format

### Requirements Summary

Changed requirement: Workflow. Adds `archiveChecks` (valid only on the `archiving` entry, otherwise `SchemaValidationError` naming the step); declarations accept only `id`, `skippable`, `disabled`, `config`; `onFailure` and unknown keys are rejected, never stripped; must be an array of objects with string `id`, boolean flags, object `config`; entries identified by `id` for layering and an id introduced by two layers is rejected; empty array equals omitted; `checks` on the archiving entry is a different surface; schema-std declares none. Also restates axis ordering and that a non-`ChangeState` `step` throws.

### Implementation Status

| Facet                                                                                            | Status                     | Evidence                                                                                |
| ------------------------------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------- |
| `WorkflowStepArchiveCheckDeclaration` type and `WorkflowStep.archiveChecks`                      | Conformant                 | `src/domain/value-objects/workflow-step.ts` L91-110, L160-166                           |
| Strict parse (`.strict()`, array, bool, record, `id` required)                                   | Conformant                 | `src/infrastructure/schema-yaml-parser.ts` L287-294, L311                               |
| Authoritative re-validation for plugin or `schemaOverrides` layers (config-schema is permissive) | Conformant                 | `build-schema.ts` `assertArchiveCheckShape` (L648-676), called at the check loop        |
| Archiving-only, message names step                                                               | Conformant                 | `build-schema.ts` L867-872 (also rejects when the array is empty)                       |
| Layering by `id`, cross-layer duplicate rejected                                                 | Conformant                 | `src/domain/services/merge-schema-layers.ts` L656-667 `addToArray(..., 'id', ...)`      |
| Empty array equals omitted                                                                       | Conformant (behaviourally) | Zod accepts `[]`, build loop no-op. Raw step keeps `archiveChecks: []` (not normalized) |
| `checks` on archiving is not converted                                                           | Conformant                 | separate field, separate loop                                                           |
| schema-std no `archiveChecks`                                                                    | Conformant                 | unchanged                                                                               |
| Order/axis, non-state `step` throws                                                              | Conformant (pre-existing)  | unchanged code                                                                          |

### Discrepancies

- D-SF-1 (Low, info): `onFailure` and unknown keys in a plain `schema.yaml` are rejected by Zod `.strict()` with a generic "unrecognized key" message; layers via buildSchema get a specific message. Both are `SchemaValidationError`. Spec only demands the type. No action.
- D-SF-2 (Low, spec/code wording): spec says "An empty `archiveChecks` array is equivalent to omitting it". Code keeps `[]` on the resolved `WorkflowStep` (not `undefined`). Equivalent for all consumers read (`?? []`), but `schema-std` test asserts `toBeUndefined()` only for the default. Either normalize in code or soften spec; not behaviour-affecting.
- D-SF-3 (Low, code): `archiveChecks` on a non-`archiving` step is rejected even when the array is empty (`build-schema.ts` L867 tests `!== undefined`). Spec says "on any other entry ... MUST throw" so this matches; flagged only because workflow-model's "Empty archiveChecks is valid" scenario concerns the archiving step only. Consistent.
- No spec-vs-code contradictions.

### Test Coverage

| Scenario                                        | Coverage                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| accepted on archiving                           | covered: `test/infrastructure/schema-yaml-parser.spec.ts` L968; `build-schema-archive-checks.spec.ts` L61                                                                                                |
| rejected on other step (names step)             | covered: build-schema-archive-checks L73 (name asserted)                                                                                                                                                 |
| onFailure rejected, not stripped                | covered: parser L993; build-schema-archive-checks L94                                                                                                                                                    |
| unknown keys rejected                           | covered: parser L1003; build-schema-archive-checks L94                                                                                                                                                   |
| identified by id when layering                  | covered: `merge-schema-layers.spec.ts` (distinct ids from two layers both present)                                                                                                                       |
| checks on archiving do not become archiveChecks | PARTIAL: build-schema-archive-checks L127 asserts both fields coexist; no parser assertion that `archiveChecks` is absent when only `checks` is given (parser L981 tests plain absence without `checks`) |
| standard schema declares none                   | covered: `schema-std-load.spec.ts` L53                                                                                                                                                                   |
| options accepted                                | covered: parser L1024                                                                                                                                                                                    |
| archiveChecks must be an array                  | MISSING: build-schema-archive-checks L82 only tests a non-object ENTRY; no `archiveChecks: {id: ...}` case at parser or build level                                                                      |
| declaration without id                          | covered: parser L1009, build L88                                                                                                                                                                         |
| wrongly typed fields                            | covered: parser L1009-1019, build L103                                                                                                                                                                   |
| empty equals omitted                            | covered: parser L986, build L68                                                                                                                                                                          |
| same id from two layers rejected                | covered: merge-schema-layers ("rejects an id that a later layer introduces")                                                                                                                             |
| override adds to entry without it               | covered: merge-schema-layers                                                                                                                                                                             |
| plugin schema layer can declare                 | PARTIAL: only the generic layer-merge path; no schema-plugin loader test                                                                                                                                 |

### Missing Tests

1. Non-array `archiveChecks` (e.g. `{ id: spec.overlap }`) at parser and `buildSchema` level (verify scenario "archiveChecks must be an array"). Note this is a real gap: Zod `z.array` would throw, but buildSchema's `for ... .entries()` over a non-array object from a plugin layer would throw a `TypeError`, not `SchemaValidationError` (code-wrong possibility, Medium-Low; unverified at runtime).
2. Parser-level "checks only, archiveChecks absent".
3. Plugin-sourced layer through the real schema-plugin path.

### Spec Dependency Chain

schema-format -> transition-checks (cross-link for axis), workflow-model, check-registry. The schema-format spec states how declarations are registered/evaluated "by the workflow and check specs". Consistent: the option list in schema-format matches `WorkflowStepArchiveCheckDeclaration` in workflow-model and the `OverlayDeclaration` handling in transition-checks. Stale-spec risk: verify scenario "Declarations are identified by id when layering" is worded for `schemaOverrides.append.workflow` only; plugin layer covered by a separate scenario.

### Summary

Facets: 9, conformant 9. Discrepancies: 3 Low (no contradictions). Scenarios: 21, covered 17, partial 3, missing 1 (non-array).

---

## 2. core:transition-checks

### Requirements Summary

Changed requirements: (a) "Dynamic runtime binding composition..." now has item 4 extended with `archiveChecks`, item 7 (resolver single owner covers `archiveChecks`), item 9 (derived policy, including `--skip-checks` for archive) and new item 10 (archive operation bindings: disable, synthesize with `skippable` default false, overlay `skippable`/`config` subject to locks, keep base `onFailure`, synthesized appended in declaration order, dropped without a registry, mutually exclusive with `targetStep`/`bypassedSteps` via `InvalidInputError`, one shared parameterized overlay); (b) "Archive is an operation not an edge": archive resolves through `resolveEffectiveBindings`, attempt is `{ scope: 'archive' }`; (c) "Projections": archive blocker `bypassFlag` only when the resolved archive binding is skippable.

### Implementation Status

| Requirement                                                                                                       | Status                          | Evidence                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Item 10 operation input and mutual exclusion                                                                      | Conformant                      | `src/domain/services/transition-checks.ts` L561 `operation`, L649-653 throws `InvalidInputError`       |
| Shared parameterized overlay for checks/skipChecks/archiveChecks                                                  | Conformant                      | `overlay()` L677-719 used at L729, L749, L762                                                          |
| Disabled declaration removes archive coordinate only                                                              | Conformant                      | `edit.decl.disabled` skip at L783; rows scoped by `rowsOf` filter on `scope === 'archive'`             |
| Synthesized binding: non-skippable default, registry governance, default failure policy                           | Conformant                      | L700-716 (`skippable ?? false`, `onFailure ?? 'abort'`, governance from registry)                      |
| Overlay `skippable`/`config` over base                                                                            | Conformant                      | L786-792; cascade once via `cascadeConfig` (check default -> binding -> decl)                          |
| Keep base `onFailure`                                                                                             | Conformant                      | L785 `edit.decl.onFailure ?? b.onFailure`; archive decls carry none                                    |
| Synthesized appended after base in declaration order                                                              | Conformant                      | L821 `result.push(...synthesizedBindings)`                                                             |
| Dropped without registry; inert disabled for unserved check                                                       | Conformant                      | L700 `registry` guard and `chk.disabled !== true`                                                      |
| Coordinate isolation incl. archive                                                                                | Conformant                      | each overlay edits only its own scope's rows; residual rows kept (L795-818)                            |
| Archive locks                                                                                                     | Conformant                      | `check-bindings.ts` L176-203 (3 checks fully locked, not skippable); transition rows untouched         |
| ArchiveChange resolves via resolver, attempt `{scope:'archive'}`, validates `--skip-checks` on effective bindings | Conformant                      | `src/application/use-cases/archive-change.ts` L320-340; `application/services/validate-skip-checks.ts` |
| Signoff not an archive predicate                                                                                  | Conformant                      | `ARCHIVE_BINDINGS` has no `approval.signoff`; `approval.signoff` bound only to `done -> archivable`    |
| GetStatus archive blocker `bypassFlag` only if resolved skippable                                                 | Conformant (see D-TC-2)         | `application/use-cases/get-status.ts` L649-664, `_mergeBlockers`                                       |
| Registry default bindings include archive; composition forwards all scopes                                        | Conformant                      | `check-registry.ts` L81; `composition/composition-registries.ts` L222-225                              |
| Items 1-3, 5-6, 8 (pre-existing)                                                                                  | Conformant, unchanged semantics | same function refactored to the shared overlay                                                         |

### Discrepancies

- D-TC-1 (Low, test only): see Missing Tests; the "dropped without a registry" scenario is not exercised.
- D-TC-2 (Medium, latent, carried from baseline D-GS-1): `get-status.ts` `_mergeBlockers` computes skippability by check id OR-ed across transition candidates and archive bindings. A check present on both coordinates with different skippability (`impl.linksInScope`) could leak a bypass flag onto an archive blocker. Code-wrong (blocker should use archive bindings only). Spec ("only when the resolved archive binding for that check is skippable") is correct. Not reachable from `archivable` today.
- D-TC-3 (Low, spec gap): spec item 10 says synthesized bindings take "the default failure policy" without naming it. Code uses `'abort'`. Document or fine.
- D-TC-4 (Low, spec inconsistency): `Spec Dependencies` list core:check-registry etc. but not `core:archive-change` or `core:get-status`, although the changed requirements now bind both. Spec-wrong (missing dependency link); no code impact.
- D-TC-5 (Info, baseline carry-over, spec-right/code-incomplete): `domain/services/lifecycle-verdict.ts` `blockersFromFailedChecks` still hardcodes `isSkippable` / `bypassFlag` for overlap and linksInScope (spec item 9 says derive from resolved bindings). Public GetStatus blocker is overridden downstream so output is correct; verdict-level field is not. Not re-verified here in detail (file unchanged in the diff list).

### Test Coverage

`test/domain/services/transition-checks.spec.ts` (archive block L1113-1300), `execute-matching-predicates.spec.ts`, `transition-change.spec.ts`, `get-status.spec.ts`, `archive-change.spec.ts`, `validate-skip-checks.spec.ts`.
| Scenario | Coverage |
|---|---|
| Target step schema checks / disabled / skip-checks / governance / cascade / coordinate isolation / along-from / wildcard narrowing / runner executes only resolved / executable instance / derived policy | covered (pre-existing suites: L523-1100; `execute-matching-predicates.spec.ts` L428-621; `transition-change.spec.ts` L3050+) |
| archiveChecks disabled removes archive only | covered L1153 (also transition untouched) |
| skippable overlays base binding | covered L1170 |
| Embedded plugin check synthesizes archive binding | covered L1188 |
| Synthesized defaults to non-skippable | covered L1188 |
| Keep base failure policy | covered L1180 |
| Config cascade once on archive | covered L1227 |
| Dropped without registry | MISSING: helper `resolveArchive(schema, registry = new CheckRegistry())` turns an explicit `undefined` into the default registry, so the no-registry path is unreachable through it and no test passes none |
| Archive combined with transition -> InvalidInputError | covered L1276 |
| Schema without archiveChecks leaves base unchanged | covered L1145 |
| Disabling a check with no archive binding is inert | covered L1217 |
| Synthesized follow declaration order | covered L1204 |
| checks and archiveChecks independent | PARTIAL L1260: uses different ids (`spec.overlap` in archive, `deps.consistent` in checks); the verify scenario is the same id in both (disabled only in archive); the case where the transition coordinate keeps and the archive coordinate is removed for the SAME id is not asserted. Use `impl.linksInScope` (tunable on both). |
| Redundant declaration keeps base policy | covered L1250 |
| Signoff is not an archive predicate | covered L214 `ARCHIVE_BINDINGS` has no `approval.signoff` |
| Archive resolves through same resolver, attempt `{scope:'archive'}` | covered indirectly: `archive-change.spec.ts` / `execute-matching-predicates.spec.ts` L158; no assertion that attempt has no from/to/along |
| Archive blocker bypassFlag only for skippable / locked has none | covered: `get-status.spec.ts` L1714+ |
| Projections scenarios (incomplete tasks, verify skill, spec gate, backward hops) | covered (pre-existing `get-status.spec.ts`, not re-audited in depth) |

### Missing Tests

1. Resolver with `operation: 'archive'` and NO registry (declaration for an unserved check dropped; overlay declarations still apply).
2. Same-id in `checks` and `archiveChecks` with `disabled` only on the archive side.
3. Mixed transition+archive same-id skippability in `GetStatus` (D-TC-2).
4. Attempt shape `{ scope: 'archive' }` asserted in ArchiveChange/GetStatus calls.

### Spec Dependency Chain

transition-checks -> check-registry (governance, archive exception present in its delta, lines 48/56-58, matches code), workflow-model (rules 5-6), workflow-topology, schema-format, architecture. Consistency: archive exception text in check-registry delta (three checks fully locked, not skippable) matches `ARCHIVE_BINDING_SPECS`; "at most one declaration per check id" matches `${id}::archive` coordinate check in buildSchema. Dependencies list is missing archive-change and get-status (D-TC-4).

### Summary

Requirement facets: 15, conformant 15. Discrepancies: 1 Medium latent (carried), 4 Low/Info. Scenarios: about 30 (archive-related 17), covered 27, partial 2, missing 1.

---

## 3. core:workflow-model

### Requirements Summary

Changed: "Step names reference domain lifecycle states" (`archiveChecks` listed among row extras) and "Workflow step checks and skip-checks declarations" (adds `archiveChecks` declaration shape; existence rule 1, coordinate uniqueness rule 2 with `{id, scope:'archive'}`, governance rule 3 with archive coordinate, new rule 5 archive step only, new rule 6 archive locks for `workspace.readOnly`, `impl.filesResolved`, `deps.consistent`), and Spec Dependencies (+ `core:check-registry`). Other requirements (sovereign schema, requires/task gating, hooks, ordering) unchanged by this change.

### Implementation Status

| Requirement                                                                     | Status                                        | Evidence                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row attaches `archiveChecks` without new state                                  | Conformant                                    | `build-schema.ts` L825 copies field                                                                                                                                                      |
| Rule 1 existence                                                                | Conformant                                    | `UnknownCheckError` via `activeRegistry.has` in archive loop                                                                                                                             |
| Rule 2 coordinate uniqueness `{id, scope:'archive'}`                            | Conformant                                    | key `${id}::archive` separate from transition and step-skip keys                                                                                                                         |
| Rule 3 governance (placement, policy, parameter, disablement) shared helper     | Conformant                                    | `assertDeclarationGovernance` L735+; transition and skip behaviour preserved in refactor. Coordinate matching for archive finds the registry binding with an `archive` applicability row |
| Rule 4 skipChecks on disabled step                                              | Conformant, unchanged                         |                                                                                                                                                                                          |
| Rule 5 archive step only                                                        | Conformant                                    | L867                                                                                                                                                                                     |
| Rule 6 archive locks                                                            | Conformant                                    | `ARCHIVE_BINDING_SPECS` (3 checks)                                                                                                                                                       |
| Redundant locked declaration accepted                                           | Conformant                                    | compares against `ownBinding.skippable`                                                                                                                                                  |
| Fallback registry (no injected registry) knows archive bindings                 | Conformant                                    | `build-schema.ts` L919-920                                                                                                                                                               |
| Disabling one coordinate does not affect the other                              | Conformant                                    | resolver coordinate isolation                                                                                                                                                            |
| Unchanged requirements (sovereign authority, gating, hooks, ordering, topology) | Not re-audited in depth; no diff touches them |                                                                                                                                                                                          |

### Discrepancies

- D-WM-1 (Low, spec gap): `resolveEffectiveBindings` throws `InvalidInputError` for `operation:'archive'` + `targetStep`/`bypassedSteps`; workflow-model does not say, but transition-checks item 10 does. No conflict.
- D-WM-2 (Low, spec wording): rule 6 says a declaration that "makes them skippable ... SHALL throw". Code (and the redundant-declaration scenario) allow `skippable: false` equal to base. Spec scenarios agree; only the rule-6 prose is imprecise. Spec-wrong (wording).
- D-WM-3 (Low, spec inconsistency): the "Workflow step checks..." requirement text says an `archiveChecks` declaration carrying any other key "is rejected by schema validation". In a plain `schema.yaml` that is the parser; for plugin/override layers it is `assertArchiveCheckShape` in buildSchema. Both exist, so OK; but a `TypeError` risk for a non-array `archiveChecks` from a layer (see schema-format Missing Test 1) is untested.
- D-WM-4 (Low, spec): "Step check declarations" requirement still lists only `WorkflowStepCheckDeclaration`; `WorkflowStepArchiveCheckDeclaration` interface is not shown there (only prose in the previous requirement). Not wrong, only incomplete.

### Test Coverage

`test/domain/services/build-schema-archive-checks.spec.ts`, `transition-checks.spec.ts`, `build-schema.spec.ts`, `workflow-topology.spec.ts`.
| Scenario | Coverage |
|---|---|
| Invalid step / drain-state rejected, omitted row does not delete state | covered (pre-existing: `build-schema.spec.ts` L1865; `transition-checks.spec.ts` L80-87) |
| A workflow row may attach archiveChecks | covered L61 |
| Optional/disabled, bedrock, approval anchor, disabling all delivery steps, done mandatory | covered by `build-schema.spec.ts` L51/L59 and `workflow-topology.spec.ts` L156/L163/L263/L332; the "including specd schema validate / not deferred to first topology query" scenario not located (not touched by this change) |
| Schema builds checks/skipChecks, UnknownCheck, Duplicate, locks, disabled-step skipChecks | covered (pre-existing `build-schema.spec.ts`) |
| archiveChecks on archiving / other step / unregistered / duplicate | covered L61/L73/L117/L121 |
| Archive locks enforced | covered L158/L166/L177 |
| Placement lock for archiveChecks | covered L183/L224 |
| Same id in checks and archiveChecks (no duplicate) | WEAK L127: uses `deps.consistent` in `checks` but `spec.overlap` in `archiveChecks`; does not exercise the same id |
| Disabling one coordinate does not affect other | WEAK: resolver test L1260 uses different ids (see transition-checks) |
| Redundant locked declaration accepted | covered L187 |
| Empty archiveChecks valid | covered L68 |
| Declarations for non-archive checks unaffected | covered implicitly by existing suites |

### Missing Tests

1. Same-id `deps.consistent` in `checks` and `archiveChecks` of one archiving entry building without error (verify scenario literal).
2. Same-id with `disabled` only on archive side at the resolver (use a non-locked check such as `impl.linksInScope`; note `deps.consistent` itself cannot be disabled on archive, so the verify scenario's "disabled: true only in archiveChecks" cannot literally use `deps.consistent`: spec-wrong, see D-WM-5).
3. Approval-anchor-at-build-time via `schema validate` (pre-existing, not in this change's scope).

Additional: D-WM-5 (Low, spec-wrong): workflow-model verify "Disabling one coordinate does not affect the other" says "the same id is declared in checks and archiveChecks with disabled: true only in archiveChecks" without naming an id, while the sibling scenario "Same id in checks and archiveChecks" uses `deps.consistent`, which is archive-locked (disable throws `CheckDisableForbiddenError`). Authors/implementers need a tunable id (`spec.overlap` has no transition binding; `impl.linksInScope` serves both). Suggest naming `impl.linksInScope` in the scenario.

### Spec Dependency Chain

workflow-model -> check-registry (new dependency listed, matches), schema-format (shape), build-schema, archive-change, get-status, transition-change, hook-execution-model, workflow-topology. The new `core:check-registry` link is present. Cross-spec consistency: rules 5-6 match schema-format (step restriction) and check-registry (archive exception). Sovereign-schema requirement is orthogonal to this change.

### Summary

Requirement facets: 10 conformant of 10 changed. Discrepancies: 5 Low (no code-vs-spec contradiction). Scenarios (changed requirements): 24, covered 21, weak 2, partially unverified 1.

---

## Batch totals

- Code-vs-spec contradictions: 0 High, 1 Medium latent (D-TC-2, carried from baseline, `get-status.ts` `_mergeBlockers` OR across coordinates), remainder Low or info.
- Test gaps to fix: (1) resolver with no registry, (2) same-id checks+archiveChecks (build and resolver, using a tunable id), (3) non-array `archiveChecks` at parser and build (and possible `TypeError` instead of `SchemaValidationError` for plugin layers), (4) parser-level "checks only => archiveChecks absent", (5) plugin-loader archiveChecks layer, (6) GetStatus mixed-coordinate skippability.
- Spec edits suggested: add `core:archive-change` and `core:get-status` to transition-checks Spec Dependencies; fix the "Disabling one coordinate" verify scenario id; clarify rule 6 wording about redundant `skippable: false`; optionally normalize or document `archiveChecks: []`.

# Partial audit batch C: cli:change-archive, cli:change-status, core:get-status

Change: archive-schema-checks-and-skip-flag. Implementation: uncommitted working tree. Audit date 2026-10-22. Read-only.

Key files: packages/cli/src/commands/change/archive.ts, packages/cli/src/commands/change/status.ts, packages/core/src/application/use-cases/get-status.ts, packages/core/src/domain/errors/spec-overlap-error.ts, packages/core/src/application/use-cases/archive-change.ts (~L1504). Tests: packages/cli/test/commands/change/archive.spec.ts, packages/cli/test/commands/change/status.spec.ts (L1736-1840), packages/core/test/application/use-cases/get-status.spec.ts (L1390-1470, L1740-1900).

Note: graph index not used (known stale); direct file reads. Tests were read, not executed.

---

## 1. cli:change-archive

### Requirements Summary

Command signature with `--skip-checks <ids>` (repeatable, comma-separated), `--allow-overlap` and `--allow-out-of-scope` aliases, `--skip-hooks`. CLI only translates to `ArchiveChangeInput.skipChecks` and does not validate skippability. Prerequisites delegated to ArchiveChange. Check progress rendering (gerund labels, no `Executing:`). Post-hook failure exits 2. Output on success text/json, invalidatedChanges. Error cases: unknown check, non-skippable/hook check, CheckPredicateFailedError with conditional `bypass:` line, SpecOverlapError with a `Use --skip-checks spec.overlap...` line only when skippable. Canonical naming.

### Implementation Status

| Requirement                                 | Status                                              | Evidence                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature / flags                   | Implemented                                         | archive.ts L66-79 options; comma split + trim + filter(Boolean) into a Set (dedup, case-sensitive); aliases add `impl.linksInScope` / `spec.overlap`; only `skipChecks` (omitted when empty) plus `skipHookPhases` passed. No local skippability validation. |
| `--skip-checks` with no value = usage error | Implemented                                         | commander required-arg option                                                                                                                                                                                                                                |
| Prerequisites (no CLI state table)          | Implemented                                         | none in CLI; delegated                                                                                                                                                                                                                                       |
| Behaviour / hooks                           | Implemented                                         | skipHookPhases forwarded                                                                                                                                                                                                                                     |
| Check progress rendering                    | Implemented                                         | `_check-progress-presenter` (not re-audited here; `skipChecks` set passed so skipped checks are shown)                                                                                                                                                       |
| Post-archive hooks exit 2                   | Implemented                                         | `cliError(..., 2)`                                                                                                                                                                                                                                           |
| Output on success (text/json, extended)     | Implemented                                         | `archived change X → path`, `invalidated N overlapping changes:` section, NDJSON complete record                                                                                                                                                             |
| Error cases: unknown/non-skippable/hook     | Implemented via `handleError` (core errors)         |                                                                                                                                                                                                                                                              |
| CheckPredicateFailedError bypass line       | Implemented                                         | archive.ts: `bypass:  Retry with --skip-checks <id> if an exception is granted` only when `err.skippable === true`; text mode only; json goes to handleError                                                                                                 |
| SpecOverlapError hint                       | Implemented                                         | hint composed in CLI only when `err.skippable` (new neutral message in core); ends with `Use --skip-checks spec.overlap to proceed despite overlap.`                                                                                                         |
| Canonical naming                            | Implemented (parent registration, not in this file) |                                                                                                                                                                                                                                                              |

### Discrepancies

1. LOW, spec-wrong or code-wrong: the spec says "ending with `Use --skip-checks spec.overlap to proceed despite overlap.`". Implementation emits a trailing blank-line-separated sentence followed by `\n`. Consistent in substance; no action.
2. LOW, code gap (pre-existing behaviour): `SpecOverlapError` is always rendered as text on stderr and exits 1 even with `--format json|toon`. The spec only requires the hint text; the structured-error scenario is only specified for CheckNotSkippable / plugin failure. If a structured error record is wanted for overlap, spec should say so. Possible spec gap.
3. LOW, spec ambiguity: spec says "(`UnknownCheckError`) exits with code 1" and "Hook check ... message points to `--skip-hooks`": relies on core (core:archive-change batch), not CLI-verifiable here; CLI test only asserts that message (see tests).
4. INFO: text-mode `bypass:` line for CheckPredicateFailedError is printed to stderr, spec says "prints" (unspecified stream). Fine.
5. INFO: `SpecOverlapError.message` is now neutral. The CLI no longer prints `err.message`; it builds its own list. Consistent with spec; verify no other consumer (MCP, other CLI command) relied on the old message flag text (outside this batch).

### Test Coverage (archive.spec.ts)

Covered: missing name, skip-hooks (all/pre/post/pre,post/default), alias translation (both), omit skipChecks when none, comma list, repeatable, trim/empty, blank value omitted, duplicates collapse, case-sensitive forward, singular alias, combine skip-hooks + skip-checks, `--skip-checks` without value rejected with no execute, --help lists flags and alias text, unknown check id, hook check -> `--skip-hooks` pointer, non-skippable (also via alias), structured error in json, overlap hint when skippable, no hint when not skippable (neither `--skip-checks` nor `--allow-overlap`), plugin failure bypass line when skippable / none when not / json record, invalid-state with skip flag, invalidated peers with `--skip-checks spec.overlap`, progress rendering with gerund and no `Executing:`, archiving-state forward, not-archivable, post-hook exit 2, JSON stream.

### Missing / Weak Tests

- WEAK: "Hook progress rides the same bus" (`Running pre hooks`, id `hook.pre`, streamed lines before check-done): not seen in archive.spec.ts test names; may be covered in the presenter spec (not checked).
- WEAK: "CLI does not validate skippability itself" (`workspace.readOnly` forwarded): the non-skippable test mocks the use case rejection; no explicit assertion that the id is forwarded unchanged (partially covered by case-sensitive forward test).
- WEAK: "Overlap: stderr lists peers and ends with"; test asserts `toContain`, not "ends with". Minor.
- Missing: SpecOverlapError with `--format json` behaviour (unspecified, see Discrepancy 2).
- Missing: Alias for non-skippable `impl.linksInScope` is covered ("also through an alias").

### Spec Dependency Chain

- cli:entrypoint, core:change, core:archive-change, core:hook-execution-model, cli:command-resource-naming, core:transition-checks. Consistent with the others as far as read: the cli spec requires `ArchiveChangeInput.skipChecks` as the sole bypass field; the code matches. core:archive-change is in another batch (confirm it declares `skipChecks` and the `SpecOverlapError.skippable` contract; core code does). Project-wide specs: architecture (CLI is a thin adapter: complies, no skippability logic in CLI), error-handling (typed errors with codes, CLI maps via handleError: complies, SpecOverlapError exposes `code` SPEC_OVERLAP and a structured `skippable` property rather than embedding delivery text: improvement), testing (unit tests with mocked kernel: complies).

### Summary counts

Requirements 12; implemented 12; discrepancies 0 high, 0 medium, 2 low, 3 info; weak tests 3; missing tests 1 (spec-undefined).

---

## 2. cli:change-status

### Requirements Summary

Many pre-existing requirements (drafted read-only, DAG, display state, lifecycle projections, review text, blockers with labels, schema warnings, etc.). This change's delta: Requirement "Archive bypass hints come from resolved bindings": the CLI renders `bypassFlag` exactly as supplied by GetStatus; never builds, adds or removes; no flag for non-skippable (locked built-in or schema-hardened); next-action reason ends with `Use --skip-checks spec.overlap to archive anyway.` unless the message already contains it; JSON/TOON carry `bypassFlag` exactly when text shows one. Also `Text blockers include check labels` shape.

### Implementation Status

| Requirement (change-relevant)                      | Status                                                                           | Evidence                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archive bypass hints render                        | Implemented                                                                      | status.ts ~L267-273: after each blocker line pushes `    bypass: ${b.bypassFlag}` only if defined; comment states CLI never builds one                                                                                                                                                                                      |
| Structured output includes `bypassFlag`            | Implemented                                                                      | status.ts ~L455 maps `bypassFlag` into blockers for json/toon                                                                                                                                                                                                                                                               |
| next-action reason with/without hint               | Delegated to core (see core:get-status); CLI prints `nextAction.reason` as given |                                                                                                                                                                                                                                                                                                                             |
| Text blockers with labels                          | Implemented                                                                      | `! CODE — label: message` / `! CODE: message`                                                                                                                                                                                                                                                                               |
| Overlap invalidation not shown as OVERLAP_CONFLICT | Implemented                                                                      | `textBlockers` filter when `review.reason === 'spec-overlap-conflict'`. NOTE: this filter also removes a LIVE `OVERLAP_CONFLICT` blocker (archivable) if review.reason happens to be `spec-overlap-conflict`; core spec says invalidation overlap never adds the blocker, so such co-occurrence should not arise; low risk. |

Other pre-existing requirements were not re-audited in depth in this pass (unchanged files outside the diff).

### Discrepancies

1. MEDIUM, spec gap: the spec does not define the textual shape of the bypass line (`    bypass: <flag>` under the blocker). Spec says only "shows the bypass flag". Docs (docs/cli/cli-reference.md) now show a `bypass:` example. Suggest recording the shape in the spec or leaving it to docs; either is acceptable.
2. LOW, spec-wrong candidate: scenario "Locked check shows no bypass ... in text, JSON, or TOON" and "Several archive blockers each carry their own flag": satisfied by delegation; the CLI test uses mocked GetStatus, so integration correctness depends entirely on core:get-status (covered there).
3. LOW: text mode prints blocker `bypass:` for every blocker including non-archive ones (e.g. `IMPLEMENTATION_STATE` on `implementing -> verifying`, flag `--skip-checks impl.linksInScope`, accepted by `changes transition`, not `changes archive`). The spec requirement title is about archive blockers, but the "CLI renders as provided" rule is generic; the spec statement "always `--skip-checks <checkId>`, which `changes archive` accepts" is only true for archive blockers. Minor spec wording inaccuracy (spec-wrong, since transition blockers carry the same flag form and `changes transition --skip-checks` accepts them).

### Test Coverage (status.spec.ts L1736-1840)

Covered: text shows projected flag; each skippable blocker has its own flag and locked has none (2 `bypass:` lines); CLI adds nothing when absent and does not print `--skip-checks` (incl. reason without hint); json and toon include same hints (`bypassFlag` present for overlap, undefined for readOnly); disabled overlap shows none.

### Missing / Weak Tests

- WEAK: scenario "next-action reason ends with `Use --skip-checks spec.overlap to archive anyway.`": only the core test checks this; CLI test passes a literal reason. Acceptable.
- Missing: scenario "The shown flag is accepted by changes archive" (cross-command contract). No test asserts that the flag string from status is parseable by the archive command (could be a small contract test, e.g. parse `--skip-checks spec.overlap` in archive spec: effectively covered by archive tests passing the same literal).
- Missing: scenario "Plugin archive check follows its resolved skippability" at CLI level: only core.
- Missing: scenario "A hardened archive blocker mixed with a skippable one" (workspace.readOnly + spec.overlap): covered effectively by 'gives every skippable blocker its own flag and none to a locked one'.
- Missing: `--help` JSON schema documentation of `bypassFlag` in blockers (not required by spec text; not verified).

### Spec Dependency Chain

- cli:entrypoint, core:change, core:get-status, sdk:build-implementation-review, core:transition-checks, core:lifecycle-engine, core:resolve-change-schema. The change delta depends on core:get-status (consistent: `bypassFlag` semantics match) and core:transition-checks (effective bindings). Project-wide: architecture OK (no local recomputation), error-handling n/a, testing OK (mocked kernel).

### Summary counts

Change-relevant requirements 1 (+1 label requirement); implemented 2; discrepancies 0 high, 1 medium (spec gap), 2 low; weak tests 1; missing tests 3 (low).

---

## 3. core:get-status

### Requirements Summary

Change-relevant delta: (a) "Execute matching predicates then project": archivable status executes archive-scope predicates from the EFFECTIVE archive bindings (`resolveEffectiveBindings` operation `archive`, including schema `archiveChecks`; skipChecks empty; disabled check not evaluated; bypassFlag only for a skippable resolved archive binding); (b) "Identifies blockers": `isSkippable`/`bypassFlag` only from the resolved binding for the evaluated candidate; `IMPLEMENTATION_STATE` only `impl.linksInScope` skippable, `impl.filesResolved` not; label/checkId; (c) OVERLAP_CONFLICT nextAction stays `/specd-archive` targetStep `archivable`, reason is not `Ready to archive` and "MUST name live overlap and the projected bypass flag". Remaining requirements pre-existing.

### Implementation Status

| Requirement                                                      | Status                                   | Evidence                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Archive predicates use effective bindings, empty skipChecks      | Implemented                              | get-status.ts ~L646-670: `resolveEffectiveBindings({ baseBindings: this._archiveBindings, schema, operation: 'archive', registry? })` only when `archivable`; evaluated via `executeMatchingPredicates` with the effective set |
| Disabled check not evaluated                                     | Implemented via resolveEffectiveBindings | test 'produces no overlap blocker when the schema disables spec.overlap'                                                                                                                                                       |
| Archive blockers judged by archive binding only                  | Implemented                              | `_mergeBlockers` separates `transitionSkippable` / `archiveSkippable` maps by source; the verdict-precomputed bypass for review blockers is overridden by archive result first, then transition result                         |
| bypassFlag only when skippable; format `--skip-checks <checkId>` | Implemented                              | `_mergeBlockers`                                                                                                                                                                                                               |
| impl.filesResolved vs impl.linksInScope                          | Implemented                              | per-check id lookup (pre-existing tests L730-893)                                                                                                                                                                              |
| nextAction after OVERLAP                                         | Implemented                              | `_nextActionAfterArchiveOverlap`: only appends `Use <flag> to archive anyway.` when `bypassFlag` defined and message lacks it; never invents `--skip-checks spec.overlap`                                                      |
| Other requirements                                               | Not changed; not re-audited in depth     |                                                                                                                                                                                                                                |

### Discrepancies

1. MEDIUM, spec internal inconsistency (spec-wrong): core:get-status states `nextAction.reason` "MUST name live overlap and the projected bypass flag (`--skip-checks spec.overlap`)" unconditionally, while cli:change-status and the implementation correctly omit the flag when `spec.overlap` is not skippable (test 'shows the overlap blocker without a flag or hint when the schema makes it non-skippable' asserts no `--skip-checks` in the reason). Recommend editing the core spec to say "and, when the resolved binding is skippable, the projected bypass flag". Code is right.
2. MEDIUM, spec gap: the verify.md scenario "Archivable live overlap does not advertise Ready to archive" requires the reason to name `--skip-checks spec.overlap` (skippable case only is covered; the non-skippable case is in "Schema-hardened overlap carries no bypass flag" scenario which does not assert the reason). Add `AND nextAction.reason does not suggest a bypass` to that scenario. Implementation and test already do.
3. LOW, spec-wrong: the "Constructor dependencies" / `resolveGetStatusDeps` requirement does not mention the optional `checkRegistry` that `GetStatus` now uses (`this._checkRegistry` passed to `resolveEffectiveBindings`). Confirm the registry is resolved by `resolveGetStatusDeps` and that spec lists it (code branch `registry` is optional; if absent, schema-embedded/plugin checks in `archiveChecks` would not resolve in status, causing a status/archive mismatch). Not verified in the composition layer within this batch; flagged for cross-check with composition tests (workflow-check-registry.spec.ts is modified in the working tree).
4. LOW, code risk: `_mergeBlockers` default parameter `archiveBindings = this._archiveBindings` means any caller omitting the param silently reverts to base (non-effective) bindings. Only one call site in this file passes it; acceptable but fragile.
5. LOW: transition-source and archive-source `isSkippable` merging uses `OR` across targets for transition candidates (`(prev ?? false) || skippable`): a check failing on several candidate targets is advertised as skippable if any target allows it, though the bypass applies per transition. Pre-existing semantics; spec says "resolved binding of that check for the evaluated candidate". Possible code-wrong for multi-target cases (blocker dedup key is code+message, so one blocker covers several targets). Low.
6. INFO: `review` blockers' pre-computed `bypassFlag` from the lifecycle verdict is retained when no check match exists (`resolved === undefined`). Spec says resolved bindings are authoritative; fallback is only for blockers without checkId. Fine.

### Test Coverage (get-status.spec.ts)

Covered: live overlap on archivable with skippable flag and nextAction (L1390); no OVERLAP when not archivable; skippable overlap flag + reason contains it; disabled spec.overlap -> no blocker; schema-hardened -> blocker without flag and no hint in reason; locked readOnly no flag; plugin archive check skippable / hardened; archive judged by archive binding even if skippable on transition; each skippable archive check has its own flag; registry-embedded schema check without flag; impl.filesResolved / impl.linksInScope flags; schema-declared skippability; INCOMPLETE_TASKS, deps etc. (pre-existing).

### Missing / Weak Tests

- MISSING: scenario "Archive predicates run without user bypass" (`skipChecks` empty): no test passes a skip set or inspects the execution context; only implied since GetStatus has no skipChecks input. Weak but trivially true by construction (grep: zero `skipChecks` occurrences in get-status.spec.ts).
- WEAK: scenario "Plugin archive check follows its resolved skippability" is covered at the blocker level; verify that the plugin binding path includes registry-resolved `@plugin.check` (embedded test uses registry; label expectations only).
- MISSING: negative test that a blocker's skippability from a transition binding does not leak to archive when the same check id fails on both (reverse of 'judges an archive failure by the archive binding': archive skippable but transition hardened). Minor.
- WEAK: nextAction reason for non-skippable case asserted with `not.toContain('anyway')`, fine.

### Spec Dependency Chain

- core:change, core:kernel, core:transition-change, core:schema-format, core:config, core:lifecycle-engine, core:refresh-implementation-tracking, core:composition-resolver, core:count-tasks, core:transition-checks, core:resolve-change-schema. Delta depends on core:transition-checks for `resolveEffectiveBindings` and bypass semantics (other batch) and on core:schema-format for `archiveChecks` (other batch); consistent with the code. Project-wide: architecture (application use case imports pure domain function `resolveEffectiveBindings`; no infra: complies), error-handling (no new error paths here), testing (spec-first scenarios present).

### Summary counts

Change-relevant requirements 3; implemented 3; discrepancies 0 high, 2 medium (both spec wording, code right), 3 low, 1 info; weak/missing tests 4 (all low).

---

## Overall batch C

- No code-vs-spec failures that require code fixes. The latest changes (neutral SpecOverlapError message + `skippable`, CLI-composed hint, status `bypass:` line, docs example) are consistent with the specs and tested.
- Spec edits recommended: (1) core:get-status "Identifies blockers" OVERLAP paragraph: make the flag in `nextAction.reason` conditional on skippability; and extend the verify scenario for the hardened case; (2) cli:change-status: optionally document the `bypass:` text line shape and clarify that bypass flags also appear on non-archive blockers (flag is accepted by `changes transition` for those); (3) core:get-status: list the check registry in constructor deps / `resolveGetStatusDeps` if it is indeed injected.
- Test follow-ups (low): explicit empty-skipChecks assertion in GetStatus archive evaluation; "ends with" assertion for the overlap hint; hook-progress scenario location check.

# Partial audit batch D: core:change, core:kernel, core:lifecycle-engine, skills:skill-templates-source

Change: `archive-schema-checks-and-skip-flag` (working tree = implementation). Read-only audit. Graph index known stale; used file reads.
Note: spec-preview IDs are `core:change`, `core:kernel`, `core:lifecycle-engine`, `skills:skill-templates-source` (the `core/` path prefix is not part of the id).

---

## 1. core:change

### Requirements Summary

Delta modifies only "History and event sourcing" prose and the "Overlap conflict invalidation" scenario (from a prior-audit baseline: wording `spec.overlap` bypassed instead of `allowOverlap`). Notably the `spec-overlap-conflict` cause now reads "archived with `spec.overlap` bypassed". Verify delta is a no-op.

### Implementation Status

| Facet                                                                                                                     | Status                                                    | Evidence                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidated.cause = spec-overlap-conflict` recorded for overlapping peers when archive runs with `spec.overlap` bypassed | Conformant                                                | `packages/core/src/application/use-cases/archive-change.ts` L338-340 (`overlapBypassed`), L377-382, `_invalidateOverlappingChanges` L1219-1252 builds one reconcile intent per peer; message names the archived change and overlapping spec IDs |
| One focused event naming archiving change `alpha` + overlap spec IDs                                                      | Conformant                                                | message `Invalidated because change '<archived>' was archived with overlapping specs: <ids>` (L1240)                                                                                                                                            |
| Artifact reopening follows the peer's policy / lifecycle recovery follows workflow policy                                 | Conformant (delegated)                                    | via `ReconcileChangeValidity` intent `spec-overlap-conflict` (`reconcile-change-validity.ts` L415, 470-471, 655, 706-723)                                                                                                                       |
| No duplicate events on repeated observation                                                                               | Conformant by design, not tested for this cause           | reconcile dedupes generally (test `reopens drifted artifacts once and repeats without a second event` covers drift only)                                                                                                                        |
| Event table incl. `artifact-skipped`                                                                                      | Not audited here (pre-existing; unchanged by this change) | -                                                                                                                                                                                                                                               |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Spec wrong | Code wrong |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| C-1 | Info | The spec prose says "A broad later event MUST NOT make unrelated evidence disappear" and "active scope reconciliation SHALL record ... `approval-invalidated`", while the table still lists the legacy `invalidated` cause `spec-overlap-conflict`. The code reconciles overlap through `spec-overlap-conflict` intent (`reconcile-change-validity.ts` L470 `pushStaleGate(... 'spec-overlap-conflict')`) and in the tested path asserts `invalidated` cause via `change.spec`. Consistent; no contradiction found. | n/a        | n/a        |
| C-2 | Low  | In `archive-change.spec.ts` L4079-4160 the "reconciles overlapping peers with a spec-overlap-conflict intent" test mocks `ReconcileChangeValidity` and asserts only the intent shape (and that `mutate` is not called). The scenario's "one focused event", "artifact reopening follows policy", "repeated observation does not append duplicates" are not asserted end-to-end for the overlap cause. L3395-3420 asserts only `cause === 'spec-overlap-conflict'` and `state === 'drafting'`.                       | -          | Weak test  |

### Test Coverage

- `test/application/use-cases/archive-change.spec.ts` L3395-3420 (cause recorded), L4079-4160 (intent shape).
- `test/domain/entities/change.spec.ts` L597-613 (entity accepts `spec-overlap-conflict`).
- `test/application/use-cases/reconcile-change-validity.spec.ts` L190 (idempotence for drift only).

### Missing Tests

- Scenario "Overlap conflict invalidation" last bullet: repeated archive-observation for the same overlap produces no second `invalidated`/recovery event (reconcile spec has no overlap-specific idempotence case).
- No assertion that the event message names the archived change and all overlap spec IDs through the real reconcile path (only intent reason string).

### Spec Dependency Chain

`core:change` -> `core:change-manifest`, `core:lifecycle-engine`, `core:archive-change` (producer of the intent), `core:spec-overlap`. The archive-change delta consistently uses `spec.overlap` bypass wording. Project specs (`_global/architecture`, `error-handling-conventions`, `testing`): no conflict; the application layer drives the domain through a use case port, no domain->infra import.

### Summary counts

Requirements/facets: 4 changed. Conformant 4. Discrepancies: 0 High/Med, 1 Low (weak test), 1 Info. Scenarios: 1 in delta, partially covered. Missing tests 2.

---

## 2. core:kernel

### Requirements Summary

"Allowed runtime override inputs" table: `TransitionChange` = `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore`; `ArchiveChange` = `skipHookPhases`, `skipChecks`. New scenarios "CompileContext permits documented override fields only" and "Archive and transition accept uniform check bypasses only" (no `allowOverlap`/`allowOutOfScope`).

### Implementation Status

| Requirement / table row                                                                                                                                                                           | Status     | Evidence                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ArchiveChangeInput`: `name`, `skipHookPhases`, `skipChecks` only                                                                                                                                 | Conformant | `use-cases/archive-change.ts` (`ArchiveChangeInput`: `name`, `skipHookPhases?`, `skipChecks?: readonly string[]`)                                                                                                |
| `TransitionChangeInput`: `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore`                                                                                                    | Conformant | `use-cases/transition-change.ts` L53-81 (+ `name`, `to`)                                                                                                                                                         |
| No `allowOverlap`/`allowOutOfScope` on either input                                                                                                                                               | Conformant | no hits in `packages/core/src/application`; `transition-change.ts` L288 comment: "Core accepts only the uniform skipChecks contract. Legacy flags are adapter concerns."                                         |
| `CompileContextInput` fields                                                                                                                                                                      | Conformant | `name`, `step`, `contextMode`, `llmOptimizedContext`, `includeChangeSpecs`, `followDeps`, `depth`, `sections`, `fingerprint`; no `config`                                                                        |
| `GetProjectContextInput`, `GetSpecContextInput`, `RunStepHooks(only)`, `GetStatus(refreshImplementationTracking)`, `CreateChange(includeOverlapCheck)`, `ValidateArtifacts(specPath, artifactId)` | Conformant | confirmed by reading each `*Input` interface (`GetSpecContextInput` also has required `workspace`, `specPath`; `GetStatusInput` has extra `ifModifiedSince`; `RunStepHooksInput` has required `name/step/phase`) |

### Discrepancies

| #   | Sev | Detail                                                                                                                                                                                                                                                                                                                             | Spec wrong       | Code wrong                 |
| --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------- |
| K-1 | Low | `GetStatusInput.ifModifiedSince` is not in the kernel override table (table lists only `refreshImplementationTracking` for `GetStatus`). It is a conditional-read optimization, not config re-read, but the spec says "Fields not listed remain subject to the construction-time rule". Pre-existing, outside this change's delta. | Table incomplete | Possible extra input field |
| K-2 | Low | The "table" is also silent on `GetSpecContext.workspace/specPath` required identifiers (the CompileContext scenario explicitly notes required per-call identifiers; no equivalent for other use cases). Pre-existing doc gap.                                                                                                      | Wording gap      | -                          |

### Test Coverage

- New: `test/application/use-cases/archive-change-input.spec.ts` (untracked file) uses `expectTypeOf(...).toHaveProperty/not.toHaveProperty` for `skipChecks`, `skipHookPhases`, `allowOverlap`, `allowOutOfScope` on both inputs. Enforced by `tsc --noEmit` because `packages/core/tsconfig.json` includes `test`; vitest runs only add `expect(true)` placeholders (vitest typecheck is NOT enabled, so enforcement is via `pnpm typecheck`, not `pnpm test`).
- `test/application/use-cases/kernel-input-boundary.spec.ts` guards "no `config` key" for CompileContext/GetProjectContext only.

### Missing Tests

- Scenario "CompileContext permits documented override fields only" has no test asserting the optional field set equals the documented set (only absence of `config`). Weak/partial.
- `archive-change-input.spec.ts` is untracked: must be added to the commit, otherwise the scenario has zero coverage.
- No dedicated runtime check of the other table rows (GetStatus, CreateChange, ValidateArtifacts, RunStepHooks).

### Spec Dependency Chain

`core:kernel` -> `core:archive-change`, `core:transition-checks` (skipChecks contract), `default:_global/architecture` (application ports; inputs carry no config re-read). Consistent: archive-change delta defines `skipChecks`, kernel lists it. Error handling: `UnknownCheckError`/`CheckNotSkippableError` documented on both use cases (`@throws`), consistent with `error-handling-conventions`.

### Summary counts

Facets: 9 table rows + 2 scenarios. Conformant 11/11. Discrepancies: 0 High/Med, 2 Low (pre-existing spec gaps). Missing/weak tests: 3.

---

## 3. core:lifecycle-engine

### Requirements Summary

Spec delta is a no-op (CLI aliases accepted, projected bypass flags canonical `--skip-checks <id>`). Verify delta modifies requirement "Available steps and domain next hop" with ~17 scenarios (skip bypass, overlap review hop, incomplete/complete tasks, step-skip shortcut scenarios, disabled verifying, hop matrix, availableSteps ordering). Only the first scenario ("Skip bypass allows transition despite blocker") relates directly to this change; the rest are step-skip/hop-matrix scenarios from the earlier optional-step work and are restated in the same section.

### Implementation Status

| Requirement                                                                                                             | Status                         | Evidence                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bypassed skippable `OVERLAP_CONFLICT` is omitted from `blockers`, no warnings channel                                   | Conformant                     | `lifecycle-verdict.ts` `blockersFromFailedChecks` L843-868 returns `[]` when `isBypassFlagActive` (L19-40 accepts `--skip-checks spec.overlap`, bare id `spec.overlap`, and legacy `allow-overlap`/`--allow-overlap`); no `warnings` field                                                                                     |
| `isPermitted` true for target after bypass                                                                              | Conformant (indirect)          | blockers drive `isPermitted`; not directly asserted                                                                                                                                                                                                                                                                            |
| `review.reason spec-overlap-conflict` -> `nextHop.targetStep designing`, `command /specd-design`, no `OVERLAP_CONFLICT` | Conformant                     | test `lifecycle-verdict.spec.ts` L469-510; `get-status.spec.ts` L1368-1383                                                                                                                                                                                                                                                     |
| `isSkippable` / `bypassFlag` "SHALL come from the resolved binding of the failing check"                                | Discrepancy                    | see L-1                                                                                                                                                                                                                                                                                                                        |
| Projected bypass flags canonical form                                                                                   | Conformant                     | `lifecycle-verdict.ts` L860-861 emits `--skip-checks spec.overlap` / `--skip-checks impl.linksInScope`                                                                                                                                                                                                                         |
| Step-skip / shortcut / hop-matrix scenarios                                                                             | Conformant (pre-existing code) | tests `lifecycle-engine.spec.ts` L65-99 (shortcut, fallback, empty set, furthest), `lifecycle-verdict.spec.ts` L703-823 (tasks, designing->ready, verifying->done, archivable), L898 (done backward hops), L1160 (checksByTarget evidence), L1193 (explicit alternative), `lifecycle-engine.spec.ts` L310 (noncanonical order) |

### Discrepancies

| #   | Sev                                                            | Detail                                                                                                                                                                                                                                                                     | Spec wrong  | Code wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ----------------------------------------- |
| L-1 | Low (Medium if a schema can mark `spec.overlap` non-skippable) | `blockersFromFailedChecks` still hardcodes `skippable = code === 'OVERLAP_CONFLICT'                                                                                                                                                                                        |             | impl.linksInScope`and fixed`bypassFlag` strings (L853-861) instead of the resolved binding, contradicting spec "`isSkippable`and`bypassFlag`SHALL come from the resolved binding of the failing check". Because schemas can now configure`spec.overlap`skippability (check-bindings L179 default true), a non-skippable schema binding would still be reported skippable at the verdict level (GetStatus overrides the public`Blocker`, per prior audit D-GS-2). Unchanged since baseline. | Spec arguably right | Code incomplete (verdict ignores binding) |
| L-2 | Low                                                            | `isBypassFlagActive` retains legacy `allow-overlap`/`allow-out-of-scope` tokens (L25-38) and the doc comment at L77, although Core inputs no longer carry them. Harmless leniency; spec says aliases are accepted inputs at the adapter level. Dead surface in the domain. | Spec silent | Could be dropped                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| L-3 | Low                                                            | Test names stale: `lifecycle-verdict.spec.ts` L870 "bypassFlag is --allow-out-of-scope" asserts `--skip-checks impl.linksInScope`; L512 "bypassFlags include allow-overlap" keeps the legacy token.                                                                        | -           | Misleading test titles                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| L-4 | Info                                                           | Verify delta for lifecycle-engine rewrites the whole "Available steps" scenario block while the spec delta is a no-op, so the change's real effect on this spec is one scenario wording. The extra ~16 scenarios inflate the audit surface; consider limiting the delta.   | Process     | -                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### Test Coverage

- Scenario "Skip bypass allows transition despite blocker": `lifecycle-verdict.spec.ts` L512 (legacy token) and new L544 (canonical `spec.overlap`) assert only `blockers` has no `OVERLAP_CONFLICT`. Neither asserts the "no warning object" clause nor `isPermitted === true` for the target.
- "Overlap review hop is designing": covered L469.
- Others: covered as listed above.

### Missing Tests

- Direct assertion of `isPermitted === true` after the overlap bypass (scenario THEN clause) and absence of any warning object.
- Test that a non-skippable `spec.overlap` binding yields `isSkippable: false` at verdict level (would expose L-1).
- Bypass with the exact `--skip-checks spec.overlap` string form (the test uses the bare id only).

### Spec Dependency Chain

`core:lifecycle-engine` -> `core:transition-checks` (shared candidate evaluator, `checksByTarget`), `core:workflow-model` (pipeline, `step-skip`), `core:check-registry`/`core:schema-format` (binding skippability). The "resolved binding" sentence ties directly to `core:check-registry`; implementation lags (L-1). Architecture: verdict is pure domain, no I/O, consistent with `_global/architecture`.

### Summary counts

Scenarios in delta: 17. Conformant 17 (1 only indirectly asserted). Discrepancies: 0 High, 0 Medium (1 latent), 3 Low, 1 Info. Missing tests 3.

---

## 4. skills:skill-templates-source

### Requirements Summary

Revised "Overlap invalidation vs live archive overlap in templates": `OVERLAP_CONFLICT` is live archive blocker (`spec.overlap`, skippable with `--skip-checks spec.overlap`); design/implement/verify/new templates must not list it as a typical blocker and must not teach `--skip-checks spec.overlap`/`--allow-overlap` as response to `spec-overlap-conflict` review; `specd-archive` may list it and must say the status-shown `--skip-checks <id>` bypass applies only to live blockers; no bypass offered where status shows none. Four scenarios (2 reworded, 2 new: canonical bypass, no-flag blocker).

### Implementation Status

| Requirement                                                                                                                                                                              | Status     | Evidence                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| design/implement/verify/new: no `OVERLAP_CONFLICT` as typical blocker; review overlap routes to `/specd-design`, "never bypassed with `--skip-checks spec.overlap` or `--allow-overlap`" | Conformant | `specd-design/SKILL.md.tpl` L44-47, `specd-implement` L24-26, `specd-verify` L25-27, `specd-new` L135-138 |
| Archive may list `OVERLAP_CONFLICT`; bypass only for live overlap, `spec-overlap-conflict` -> `/specd-design`, never bypass                                                              | Conformant | `specd-archive/SKILL.md.tpl` L25-31                                                                       |
| Archive teaches `--skip-checks <checkId>` canonical, id from status                                                                                                                      | Conformant | L216-224                                                                                                  |
| Aliases `--allow-overlap`/`--allow-out-of-scope` only as aliases                                                                                                                         | Conformant | L229-231                                                                                                  |
| Blocker with no bypass flag cannot be skipped; names `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` never bypassable                                                      | Conformant | L28-29 and L225-229                                                                                       |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Spec wrong         | Code wrong                                                 |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| S-1 | Low  | `specd-design/SKILL.md.tpl` L44-45 names `--skip-checks spec.overlap` positively ("bypassed with ...") for live archive overlap inside the design skill; spec forbids listing `OVERLAP_CONFLICT` as a typical blocker and teaching the flag for review. Mention is an exclusion note, scenario wording allows it, but it is the one template that positively names the bypass outside archive.                                                                                                     | Scenario ambiguous | Could drop positive mention (implement/verify/new omit it) |
| S-2 | Info | Archive template adds `verification.current`, schema, archivable and task-completion checks to the "never bypassable on archive" list, beyond the spec's three. Core: archive locked set is `schema.nameMatch`, `archive.archivable`, `workspace.readOnly`, `deps.consistent`, `impl.filesResolved` (`check-bindings.ts` L150-200) plus `verification.current` (skippable false); "task-completion" is a transition predicate, not an archive row. Slightly over-specific but not wrong in effect. | Spec incomplete    | Minor over-claim                                           |
| S-3 | Low  | Skill text advises "Ask the user whether to proceed" then re-run with bypass shown by status, while `SpecOverlapError` no longer carries a bypass hint in the message (core change); the skill depends on `specd changes status` to name the bypass. Consistent with the spec, but CLI adapter must suppress the hint when `skippable` is false (verify in cli batch).                                                                                                                             | -                  | Cross-batch dependency                                     |

### Test Coverage (`packages/skills/test/template-workflow.spec.ts`, modified)

- L220-237: hop skills do not list `OVERLAP_CONFLICT` in the first `(e.g. ...)`, contain `spec-overlap-conflict`, `/specd-design`, and the "never bypassed with ..." phrase; archive lists `OVERLAP_CONFLICT`, `--skip-checks spec.overlap`, `spec-overlap-conflict`, "never bypass it".
- L239-248: canonical `--skip-checks <checkId>`, `--skip-checks impl.linksInScope`, aliases sentence, no "with `--allow-overlap`" on archive.
- L250-257: names three never-bypassable checks and `shows no \`bypass:\` flag`.
  All four scenarios covered; assertions are substring-based (wording-sensitive) but adequate.

### Missing Tests

- No negative assertion that design/implement/verify/new do not teach `--skip-checks spec.overlap` as the review response beyond the phrase presence check (substring "never bypassed with" proves intent only).
- Rendered/installed skill output (plugin-agent-\* frontmatter packaging) not tested for the new text; templates only.

### Spec Dependency Chain

`skills:skill-templates-source` -> `core:lifecycle-engine` (review reason routing, projected bypass flag), `core:archive-change` (skipChecks, locked checks), `cli:change-archive`/`cli:change-status` (flags and `bypass:` line in status output). Consistent with those deltas. `_global/testing`: tests are colocated and deterministic; fine.

### Summary counts

Scenarios: 4 (2 reworded, 2 new). Conformant 4/4. Discrepancies: 0 High/Med, 2 Low, 1 Info. Missing tests: 2 minor.

---

## Overall batch D

- Specs: 4. Facets conformant: all behavior-affecting facets. No High, no confirmed Medium.
- Notable: L-1 (verdict `isSkippable`/`bypassFlag` hardcoded rather than from resolved binding; latent Medium), untracked new test `archive-change-input.spec.ts` (must be committed), weak overlap-conflict scenario assertions (C-2, lifecycle skip-bypass `isPermitted`/no-warning clauses), stale test titles (L-3).
- Spec-wrong vs code-wrong: L-1 could alternatively be resolved by weakening the spec sentence to "default bypass" if the verdict deliberately stays schema-agnostic; K-1 resolved by listing `ifModifiedSince` in the kernel table.
