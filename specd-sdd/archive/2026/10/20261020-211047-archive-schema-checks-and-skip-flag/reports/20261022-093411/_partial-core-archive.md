# Partial audit: core:archive-change, core:transition-checks, core:check-registry

Change: `archive-schema-checks-and-skip-flag` (working tree vs HEAD). Method: merged specs and diffs via `changes spec-preview --diff`, code read directly (not executed; tests were not run, only inspected).

Key files: `packages/core/src/application/use-cases/archive-change.ts` (execute 288-520, throwMappedArchiveFailure ~1485-1597), `application/services/validate-skip-checks.ts`, `domain/services/transition-checks.ts` (resolveEffectiveBindings 540-823, operation 'archive' overlay 2b ~758), `domain/services/check-bindings.ts` (ARCHIVE_BINDING_SPECS 158-245), `domain/services/check-registry.ts:17,81`, `domain/services/build-schema.ts` (assertArchiveCheckShape 645-680, archiveChecks loop ~1005-1030, assertDeclarationGovernance 724-759), `domain/services/merge-schema-layers.ts:656`, `domain/errors/spec-overlap-error.ts`, `composition/use-cases/archive-change.ts:118-210`, `application/use-cases/get-status.ts` (~646-720, 951-1040).

---

## 1. core:archive-change

### Requirements Summary (changed/added)

- Ports: optional `CheckRegistry` as last ctor param; `archiveBindings` are base bindings only.
- Input: `skipChecks` replaces `allowOverlap`/`allowOutOfScope`; no ad-hoc booleans.
- New Requirement "Effective archive bindings and skip validation": resolve via `resolveEffectiveBindings` every execute; validate skip ids after the state guard and before any predicate/hook/write (Unknown / hook / non-skippable errors; registered-but-unbound accepted; case-sensitive; dedupe); governance (only `spec.overlap`, `impl.linksInScope`, plugin checks tunable); bypass result `outcome: 'skip'`.
- Overlap guard keyed on `spec.overlap` in skipChecks; schema may disable (no scan, no invalidation) or make non-skippable.
- `workspace.readOnly` and `impl.filesResolved` fully locked on archive; `impl.linksInScope` bypass via skipChecks, schema may disable/harden.
- New errors: `UnknownCheckError`, `CheckNotSkippableError`, `CheckPredicateFailedError` (plugin/schema-embedded failures, with resolved `skippable`).
- Composition: `resolveArchiveChangeDeps` includes executable `checkRegistry`.

### Implementation Status

| Requirement                                                                                                                               | Status                   | Evidence                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional `CheckRegistry` last ctor param                                                                                                  | Conformant               | archive-change.ts:210,248,268-269; composition/use-cases/archive-change.ts:195,210                                                                                                                                                             |
| Base bindings never executed directly; effective bindings resolved every run                                                              | Conformant               | archive-change.ts:327-332 (local per-execute, nothing cached on instance); executeMatchingPredicates/effects all use `effectiveBindings` (338-345, 400, 437)                                                                                   |
| `resolveArchiveChangeDeps` includes `checkRegistry`, no `runStepHooks`                                                                    | Conformant               | composition/use-cases/archive-change.ts:118-153                                                                                                                                                                                                |
| `skipChecks` input; no `allowOverlap`/`allowOutOfScope`                                                                                   | Conformant               | archive-change.ts:89-96; grep of `allowOverlap`/`allowOutOfScope` in core/src: 0 hits; deprecated fields removed from execute-matching-predicates.ts                                                                                           |
| Skip validation after state guard, before predicates/hooks/writes                                                                         | Conformant (see note D3) | archive-change.ts:333-337 after guard at 303-320; validate-skip-checks.ts:44-59                                                                                                                                                                |
| Unknown / hook / non-skippable / registered-unbound / dedupe / case-sensitive                                                             | Conformant               | validate-skip-checks.ts:44-59 (Set dedupe, exact match, hook message points to skipHookPhases)                                                                                                                                                 |
| Governance defaults: only spec.overlap + impl.linksInScope skippable; others locked                                                       | Conformant               | check-bindings.ts:158-245                                                                                                                                                                                                                      |
| Locks on workspace.readOnly / impl.filesResolved (+deps.consistent) on archive                                                            | Conformant               | check-bindings.ts:187-215; build-schema.ts:745-758 rejects disable/override/config; validate-skip-checks rejects skip                                                                                                                          |
| Overlap guard keyed on `spec.overlap` bypass; schema-disabled -> no scan                                                                  | Conformant               | archive-change.ts:338-341, 355-365 (needsOverlapScan false when binding absent), 372-380                                                                                                                                                       |
| Peer loading only after predicates return                                                                                                 | Conformant               | `_loadArchiveOverlap` called only after executeMatchingPredicates (archive-change.ts:355-362)                                                                                                                                                  |
| Non-skippable `spec.overlap` -> `CheckNotSkippableError`                                                                                  | Conformant               | validate-skip-checks.ts:57-58; resolver overlays `skippable` (transition-checks.ts ~785)                                                                                                                                                       |
| `SpecOverlapError` thrown unless bypassed; carries skippable                                                                              | Conformant               | archive-change.ts:1503-1506; spec-overlap-error.ts                                                                                                                                                                                             |
| `SpecOverlapError` "naming each overlapping spec and peer change"                                                                         | **Discrepancy**          | spec-overlap-error.ts:32-33 builds message from `e.specId` only; peers (`OverlapEntry.changes[].name`) are not in message. Verify scenario "error message includes core:config and beta" is unmet (pre-existing, text retained by this change) |
| Peer invalidation via reconciler `spec-overlap-conflict`                                                                                  | Conformant               | archive-change.ts:372-380, `_invalidateOverlappingChanges` (~1246)                                                                                                                                                                             |
| `impl.linksInScope` bypass -> `skipChecks`; does not bypass `impl.filesResolved`                                                          | Conformant               | throwMappedArchiveFailure cases 1550-1563; locked binding                                                                                                                                                                                      |
| Plugin/schema-embedded failure -> `CheckPredicateFailedError` w/ id,label,code (`CHECK_FAILED` default),message,command,details,skippable | Conformant               | archive-change.ts:1586-1596                                                                                                                                                                                                                    |
| Built-in failures keep dedicated errors                                                                                                   | Conformant               | switch cases 1503-1585                                                                                                                                                                                                                         |
| Evaluation order: base, plugin, synthesized                                                                                               | Conformant               | transition-checks.ts:~818 (`result.push(...synthesizedBindings)` after base loop); plugin bindings come via `archiveBindings` from registry (check-registry.ts:81)                                                                             |
| Bypass result `outcome: 'skip'` same audit marker as transitions                                                                          | Conformant (indirect)    | skipChecks passed into `executeMatchingPredicates` and `buildCheckExecutionContext` (archive-change.ts:338-349), same path as TransitionChange                                                                                                 |
| Spec.md "Spec Dependencies" lists `core:transition-checks`/`core:check-registry`                                                          | **Discrepancy (doc)**    | New requirement links `../transition-checks/spec.md` and `core:schema-format`; deps list (spec.md:524-538) has schema-format but not transition-checks / check-registry                                                                        |

### Discrepancies

- **D1 (Medium, pre-existing, spec-and-code)**: `SpecOverlapError` message omits peer change names though spec requires "naming each overlapping spec and peer change" and verify scenario asserts message contains `beta`.
  - Code wrong: requirement is explicit; message is the only text a CLI user sees; `OverlapEntry.changes` has names available (value-objects/overlap-entry.ts).
  - Spec wrong: the entries are exposed via `error.entries`, so delivery layers (CLI) can render peers; spec could say "carry" rather than "name in message". Recommendation: fix code (cheap) - append `(spec: change1, change2)`; no test currently asserts it (spec-overlap-error.spec.ts only checks `core:config`).
- **D2 (Low)**: Core error messages hardcode a CLI flag (`Use --skip-checks spec.overlap to proceed.`, spec-overlap-error.ts:33; `CheckPredicateFailedError` doc mentions `--skip-checks`). The archive spec says the use case is delivery-agnostic ("delivery mechanisms translate their own aliases"), and `default:_global/architecture` keeps core free of delivery concerns.
  - Code wrong: delivery detail leaks into domain error text.
  - Spec wrong/acceptable: transition-checks spec defines `bypassFlag` as literally `--skip-checks <id>` and the error-handling-conventions spec requires actionable messages ("tell the user how to fix"), so a flag hint is defensible. Pre-existing pattern (old text said `--allow-overlap`).
- **D3 (Low, spec ambiguity)**: Spec says validation happens "before any hook runs or any file is written", but `_reconcile.execute` (archive-change.ts:303) runs before validation and can persist reconciliation. It precedes the state guard by spec design ("after the archivable/state guard"), so only a wording issue. Scenario "leaves the change archivable" holds as reconcile is a no-op for archivable changes.
- **D4 (Low, doc)**: Spec Dependencies missing `core:transition-checks` / `core:check-registry` (see table).

### Test Coverage

Tests: `application/use-cases/archive-change.spec.ts` (last describe 4389-4860, overlap guard 3338-3520, impl guards 3557-3680), `application/services/validate-skip-checks.spec.ts`, `application/use-cases/archive-change-input.spec.ts`, `domain/errors/spec-overlap-error.spec.ts`, `composition/use-cases/archive-change.spec.ts`, `composition/use-cases/workflow-check-registry.spec.ts`.

| Requirement / scenario group                                                                                                        | Coverage                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ctor receives CheckRegistry / composition deps                                                                                      | Covered (composition specs)                                                                                                                               |
| Base bindings never executed directly / not mutated                                                                                 | Partial (test 4821 only checks isolation between two instances, not array identity/frozen)                                                                |
| skipChecks default empty; no allowOverlap/allowOutOfScope                                                                           | Covered (archive-change-input.spec.ts)                                                                                                                    |
| Skip validation: unknown, case, hook, locked, registered-unbound, disabled, dup/empty, mixed, state-before-skip, schema-before-skip | Covered (4496-4603, validate-skip-checks.spec.ts)                                                                                                         |
| Bypass records `outcome: 'skip'`                                                                                                    | Covered (4601)                                                                                                                                            |
| Bypass spec.overlap + peer invalidation; no overlap -> empty; other failing checks not bypassed; retry from archiving               | Covered (3376-3500, 4665, 4686)                                                                                                                           |
| Schema-disabled / non-skippable spec.overlap                                                                                        | Covered (4611-4655)                                                                                                                                       |
| Peers listed only after predicates return                                                                                           | Missing (no assertion on list ordering relative to predicates)                                                                                            |
| linksInScope bypass; filesResolved not bypassed; schema hardens/disables linksInScope                                               | Partial (bypass and filesResolved covered 3579-3642, 4830; schema-hardened and schema-disabled linksInScope archive scenarios not seen at use-case level) |
| workspace.readOnly skip -> CheckNotSkippableError and no hook/file                                                                  | Partial (error asserted 4519; "no hook runs / no file written" not asserted)                                                                              |
| Plugin check order, failure error, skippable carried, embedded synthesized, declaration order                                       | Covered (4706-4818)                                                                                                                                       |
| Plugin failure without code -> `CHECK_FAILED`                                                                                       | Missing (no archive-level test; only execute-matching-predicates.spec uses the literal)                                                                   |
| Built-in failures keep dedicated errors                                                                                             | Covered by pre-existing per-check tests                                                                                                                   |
| Resolution per run with two different sovereign schemas                                                                             | Missing (only a two-instance test)                                                                                                                        |
| Redeclared locked check accepted                                                                                                    | Covered at build level (build-schema-archive-checks.spec.ts:187)                                                                                          |
| Bypassing one check does not bypass another                                                                                         | Partial (spec.overlap vs readOnly covered; spec.overlap vs impl.linksInScope pair not seen)                                                               |

### Missing Tests

1. Plugin check failing without a code -> `CheckPredicateFailedError.code === 'CHECK_FAILED'` at ArchiveChange level.
2. Same `ArchiveChange` instance, two changes with different schemas -> each uses its own resolved bindings.
3. Peer `list()`/`get()` called only after predicate evaluation (ordering assertion).
4. Schema-hardened (`skippable:false`) and schema-disabled `impl.linksInScope` through `execute`.
5. `workspace.readOnly` skip rejection asserts no hook ran and nothing written.
6. `SpecOverlapError` message contains the peer change name (blocked on D1).
7. Both `spec.overlap` and `impl.linksInScope` failing with only `spec.overlap` skipped.

---

## 2. core:transition-checks

### Requirements Summary (changed/added)

- Req 4 coordinate isolation extended to `archiveChecks` / `scope: 'archive'`.
- Req 7 resolver single owner now includes `archiveChecks`; Req 9 derived policy also for archive skip validation.
- New Req 10 "Archive operation bindings": `operation: 'archive'` overlays `archiveChecks` of `archiving`; disabled excludes; unserved declarations synthesize non-skippable bindings (default failure policy); skippable/config overlay subject to locks; no `onFailure` on archiveChecks (base kept); synthesized appended in declaration order; mutually exclusive with `targetStep`/`bypassedSteps` -> `InvalidInputError`; one parameterized overlay.
- Archive resolves through the same resolver; attempt `{ scope: 'archive' }`.
- Archive blockers carry `bypassFlag` only when the resolved archive binding is skippable.

### Implementation Status

| Requirement                                                                                                        | Status                                                | Evidence                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coordinate isolation incl. archive                                                                                 | Conformant                                            | transition-checks.ts overlay plans use distinct `rowsOf`/`concrete` per scope (≈700-770); residual rows keep other coordinates (≈795-815)                    |
| Resolver single owner for archiveChecks                                                                            | Conformant                                            | only place `archiveChecks` read in resolver: transition-checks.ts:761-766; get-status.ts & archive-change.ts call it                                         |
| Derived policy from resolved bindings (skip validation, failure mapping)                                           | Conformant                                            | archive-change.ts:333, 1505, 1596; get-status.ts:646-660, \_mergeBlockers                                                                                    |
| Disabled excludes check from archive only                                                                          | Conformant                                            | transition-checks.ts: `edit.decl.disabled === true -> continue` in assembly                                                                                  |
| Synthesize binding for unserved declaration (skippable default false, registry governance, default policy `abort`) | Conformant                                            | transition-checks.ts overlay synthesis block (`skippable: chk.skippable ?? false`, `onFailure ?? 'abort'`)                                                   |
| skippable/config overlay subject to governance locks                                                               | Conformant (locks live in build-schema, not resolver) | build-schema.ts:724-759, ~1005-1030; resolver itself does not re-check locks (by design: build rejects)                                                      |
| `archiveChecks` has no `onFailure`, base policy kept                                                               | Conformant                                            | OverlayDeclaration `onFailure` undefined for archive decls; `edit.decl.onFailure ?? b.onFailure`; build rejects key (ARCHIVE_CHECK_KEYS build-schema.ts:646) |
| Synthesized appended after base in declaration order                                                               | Conformant                                            | `result.push(...synthesizedBindings)`                                                                                                                        |
| `operation:'archive'` + targetStep/bypassedSteps -> InvalidInputError                                              | Conformant                                            | transition-checks.ts:649-653                                                                                                                                 |
| Single parameterized overlay for 3 overlays                                                                        | Conformant                                            | `overlay()` generic helper                                                                                                                                   |
| Archive attempt `{ scope: 'archive' }`                                                                             | Conformant                                            | archive-change.ts:316                                                                                                                                        |
| Archive blocker `bypassFlag` only if resolved binding skippable                                                    | Conformant                                            | get-status.ts:646-720, 951-1040 (no invented bypass; overlap hint only when flag exists)                                                                     |

### Discrepancies

- **D5 (Low, doc)**: Requirement 4 merged text is grammatically broken ("... step-skip coordinate, and `disabled: true` in `archiveChecks` ...") - run-on clause; spec wording only.
- **D6 (Low, spec precision)**: Spec says synthesized binding takes "the check's governance from the registry"; when no registry is passed, nothing is synthesized (silent drop). Spec states this only in archive-change ("without it, schema-embedded checks cannot be synthesized"); transition-checks does not. Spec-side clarification suggested; code behavior consistent across transition and archive.
- No code defects found.

### Test Coverage

Tests: `domain/services/transition-checks.spec.ts` 1113-1330 (archive operation describe), `application/use-cases/get-status.spec.ts` (new describe "archive hints from the effective archive bindings").

| Requirement                                                           | Coverage                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Disabled removes archive only                                         | Covered (1153)                                                            |
| skippable/config overlay                                              | Covered (1170)                                                            |
| Synthesized non-skippable / skippable true / declaration order        | Covered (1188, 1204)                                                      |
| Base failure policy kept                                              | Covered (1180)                                                            |
| Config cascade once                                                   | Covered (1227)                                                            |
| Operation + transition mutual exclusion                               | Covered (1276)                                                            |
| No archiveChecks -> base unchanged                                    | Covered (1145)                                                            |
| Inert disable for unserved check                                      | Covered (1217)                                                            |
| Independent `checks` vs `archiveChecks`                               | Covered (1260)                                                            |
| Redundant declaration of locked check                                 | Covered (1250)                                                            |
| Transition/step-skip unaffected without operation                     | Covered (1297)                                                            |
| Archive uses same resolver with registry, attempt `{scope:'archive'}` | Partial (verified indirectly via archive-change.spec; no direct spy test) |
| Blocker `bypassFlag` skippable vs locked / hardened                   | Covered (get-status.spec)                                                 |

### Missing Tests

1. Direct assertion that `ArchiveChange` calls `resolveEffectiveBindings` with `operation: 'archive'` and the registry.
2. Resolver with `operation:'archive'` and no registry: embedded declarations are dropped (documented behavior unspecified in this spec).

---

## 3. core:check-registry

### Requirements Summary (changed/added)

- Coordinate `{ checkId, scope: 'archive' }`; at most one `archiveChecks` declaration per check id (`DuplicateCheckBindingError`).
- `merge-schema-layers` preserves `archiveChecks` collision-safely.
- Archive exception: `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` archive bindings fully locked (`allowBindingOverride/allowConfigOverride/allowDisable: false`, `skippable: false`); transition and step-skip bindings stay Category C.
- Req 9 "Archive declarations": same four locks apply to `archiveChecks`; unserved declaration = embedding governed by `allowSchemaEmbedding`; plugin with default `{scope:'archive'}` binding tunable without embedding.

### Implementation Status

| Requirement                                                                             | Status                                           | Evidence                                                                               |
| --------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Archive coordinate; duplicate declaration rejected                                      | Conformant                                       | build-schema.ts:1012-1016 (`DuplicateCheckBindingError(chk.id,'scope: archive')`)      |
| `archiveChecks` independent of `checks` coordinates                                     | Conformant                                       | coordKey `${id}::archive` distinct from transition keys                                |
| Layer merge preserves `archiveChecks`                                                   | Conformant                                       | merge-schema-layers.ts:656-665 (uses `addToArray`, rejects duplicate id across layers) |
| Archive exception locks on 3 checks                                                     | Conformant                                       | check-bindings.ts:187-215; transition rows untouched                                   |
| Category A archive bindings reject disable/skippable                                    | Conformant                                       | check-bindings.ts:160-245 (`allowBindingOverride:false`, `allowDisable:false`)         |
| `spec.overlap`, `impl.linksInScope` tunable                                             | Conformant                                       | check-bindings.ts:172-180,216-224                                                      |
| Governance applied to archiveChecks via shared function                                 | Conformant                                       | build-schema.ts:1019-1030 -> `assertDeclarationGovernance`                             |
| Embedding rule for unserved archive declaration; plugin default archive binding tunable | Conformant                                       | build-schema.ts:729-731 (ownBinding lookup 1019-1021 requires `scope==='archive'`)     |
| Registry default bindings include archive bindings                                      | Conformant                                       | check-registry.ts:17,81                                                                |
| Shape validation (keys id/skippable/disabled/config; only on `archiving`)               | Conformant (extra, matches schema-format intent) | build-schema.ts:645-680, 867-871                                                       |
| Redeclare locked check with identical value accepted                                    | Conformant                                       | build-schema.ts:737-742 compares against binding value                                 |

### Discrepancies

- **D7 (Low)**: Placement/lock rule in `assertDeclarationGovernance` evaluates `disabled:true` against check-level `governance.allowDisable` OR binding-level. For `spec.overlap` this is true both ways, fine; but an archive declaration `skippable:false` on an `allowBindingOverride:false` binding whose value differs only when `chk.skippable` equals base is accepted. Consistent with the spec scenario; no issue. (Noted only for completeness; no action.)
- **D8 (Low, doc)**: Spec Dependencies of check-registry (`core:transition-checks`, `default:_global/architecture`) omit `core:schema-format` although the spec now governs `archiveChecks` shape declared there; transition-checks lists it.
- No code defects found.

### Test Coverage

Tests: `domain/services/build-schema-archive-checks.spec.ts`, `check-bindings.spec.ts` (new archive cases), `check-registry.spec.ts` ("CheckRegistry — archive bindings"), `merge-schema-layers.spec.ts` ("archiveChecks"), `composition/composition-registries.spec.ts`.

| Requirement / scenario                                                             | Coverage                                                                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate archiveChecks declaration                                                | Covered (build-schema-archive-checks.spec.ts:121)                                                                                                       |
| Archive vs transition coordinate independence                                      | Covered (127, check-bindings "keeps archive-locked checks unlocked on transition rows", build 201)                                                      |
| Locks: workspace.readOnly disable, filesResolved skippable, deps.consistent config | Covered (158-185)                                                                                                                                       |
| Transition bindings unaffected                                                     | Covered (201)                                                                                                                                           |
| spec.overlap / linksInScope tunable                                                | Covered (191)                                                                                                                                           |
| Plugin tunable without embedding; locked plugin without archive binding rejected   | Covered (209, 224)                                                                                                                                      |
| Plugin policy/config/disable locks on archive; config merge over defaults          | Covered (240); config-merge value `{minSeverity: critical}` Partial (resolver test 1227 covers cascade, not the check-registry scenario literally)      |
| Layer merging with locks intact                                                    | Covered for merge/duplicate (merge-schema-layers.spec); "later layer cannot relax a code lock" is enforced at build, not tested in merge spec - Partial |
| Category A archive checks reject disable/skippable                                 | Covered (158, 166)                                                                                                                                      |
| `approval.spec` embedding forbidden                                                | Covered (183)                                                                                                                                           |

### Missing Tests

1. End-to-end: layer-merged schema (base + `schemaOverrides`) that tries to relax a locked archive check is rejected at build.
2. Plugin archive binding config merge over `defaultConfig` asserted through `buildSchema` + registry (only resolver-level today).

---

## Cross-spec consistency (default:\_global/architecture, error-handling-conventions, direct deps)

- `default:_global/architecture`: resolver and bindings are pure domain (no I/O); `validateSkipChecks` lives in application and imports only domain; composition wires `checkRegistry` - conformant. Only concern: D2 (CLI flag text in domain error).
- `default:_global/error-handling-conventions`: new errors extend `SpecdError` (`SpecOverlapError` code `SPEC_OVERLAP`; `CheckPredicateFailedError` code is the dynamic check code - UPPER_SNAKE_CASE not enforced for plugin codes; JSDoc for `CheckPredicateFailedError` lacks `code` documentation). `UnknownCheckError`/`CheckNotSkippableError` reused from check-registry-errors. `@throws` documented on `execute` (archive-change.ts:283-285). Note: spec says "domain MUST NOT use generic Error"; `InvalidInputError` used for resolver misuse - conformant. (`default:_global/error-handling-conventions` is not in the change's specIds, so reviewed via `specs show`.)
- Direct deps: `core:schema-format` (archiveChecks shape) is not in this batch; code enforces key set `id/skippable/disabled/config`, `archiving` only, matching the spec's description in archive-change. Not audited against schema-format spec text.

## Summary counts

| Spec                   | Requirements checked | Conformant | Discrepancy                                  | Missing | Tests covered / partial / missing |
| ---------------------- | -------------------- | ---------- | -------------------------------------------- | ------- | --------------------------------- |
| core:archive-change    | 20                   | 18         | 2 (D1 SpecOverlapError message, D4 deps doc) | 0       | ~15 / 5 / 3                       |
| core:transition-checks | 12                   | 12         | 0 code (D5, D6 doc/clarity)                  | 0       | 11 / 1 / 0                        |
| core:check-registry    | 11                   | 11         | 0 code (D8 doc)                              | 0       | 8 / 2 / 0                         |

Severity tally: Medium 1 (D1), Low 7 (D2-D8; D7 is a non-issue note).
