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
