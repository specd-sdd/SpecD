# Spec compliance report — archive-schema-checks-and-skip-flag

Mode: delegated change audit (attempt owned by `/specd-verify`, `verification-attempt-2`).
Scope: 12 change specs (`core:archive-change`, `core:check-registry`, `core:schema-format`, `core:transition-checks`, `core:workflow-model`, `core:change`, `core:kernel`, `core:get-status`, `core:lifecycle-engine`, `cli:change-archive`, `cli:change-status`, `skills:skill-templates-source`) plus the global constraints `default:_global/*`.
Graph: pre-existing `CONTENT_KNOWN_STALE` (index blocked by an unrelated `DependsOnOverwriteError` on an existing spec); audit used code reading, tests and the real built CLI.

## Aggregate

| Batch                                                                             | Result                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| core: archive-change, transition-checks, check-registry                           | all changed requirements conformant; 1 medium (pre-existing) + 6 low |
| core: schema-format, workflow-model, get-status, lifecycle-engine, change, kernel | ~28 facets conformant; 1 medium (latent) + 5 low                     |
| cli: change-archive, change-status; skills: skill-templates-source; globals       | no high/medium; 3 low + 2 low; no global-constraint violations       |

## Disposition of findings

| Finding                                                                                                                                                                         | Severity             | Disposition                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `SpecOverlapError` message did not name peer changes (D1)                                                                                                                       | medium, pre-existing | FIXED: message now lists each spec with its peer changes; test added              |
| `_mergeBlockers` OR-ed skippability across transition and archive bindings for the same check id                                                                                | medium, latent       | FIXED: archive failures are judged only by the archive bindings; test added       |
| CLI test for `--skip-checks hook.pre` pointing to `--skip-hooks`                                                                                                                | low                  | FIXED: test added                                                                 |
| Missing tests: CHECK_FAILED default at use-case level, schema-hardened/disabled `impl.linksInScope` through `execute`, `workspace.readOnly` skip rejected before any check/hook | low                  | FIXED: tests added                                                                |
| `SpecOverlapError` carries CLI wording `--skip-checks spec.overlap`                                                                                                             | low                  | ACCEPTED: canonical bypass form per `core:transition-checks`; documented decision |
| Spec Dependencies lists / wording (D3, D4, D5, D6, D8)                                                                                                                          | low                  | ACCEPTED: wording only, no behavioural impact                                     |
| `lifecycle-verdict` still hardcodes legacy alias tokens                                                                                                                         | low                  | ACCEPTED: spec states CLI aliases are accepted inputs                             |
| Docs: status example in `docs/cli/cli-reference.md` lacks the `bypass:` line                                                                                                    | low                  | ACCEPTED: follow-up                                                               |

After remediation: `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 3276, cli 1154, code-graph 799 tests).

## Detailed Findings

<!-- begin _partial-core-archive.md -->

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

<!-- end _partial-core-archive.md -->

<!-- begin _partial-core-schema-status.md -->

# Partial compliance report: core schema/status batch

Change: `archive-schema-checks-and-skip-flag`. Specs: core:schema-format, core:workflow-model, core:get-status, core:lifecycle-engine, core:change, core:kernel.
Paths are relative to `packages/core/` unless prefixed.

Architecture check (`default:_global/architecture`): CONFORMANT. `domain/services/build-schema.ts`, `merge-schema-layers.ts`, `transition-checks.ts`, `check-bindings.ts` import only domain modules. Zod and the strict archive schema live in `infrastructure/schema-yaml-parser.ts`, which imports domain types (allowed direction).

## 1. core:schema-format

### Requirements Summary

Changed: Workflow requirement. It now documents `optional`, `disabled`, `checks`, `skipChecks` and the new `archiveChecks`.

- `archiveChecks` is valid only on the `archiving` entry, otherwise `SchemaValidationError` naming the step.
- Declarations accept only `id`, `skippable`, `disabled`, `config`. `onFailure` and unknown keys are rejected, never stripped.
- Entries are keyed by `id` for layering, and an id introduced by two layers is rejected.
- An empty array is equivalent to omitting it.
- schema-std declares none.

### Implementation Status

| Requirement                                                                     | Status     | Evidence                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveChecks` attribute and type                                              | Conformant | `src/domain/value-objects/workflow-step.ts` (`WorkflowStepArchiveCheckDeclaration`, `WorkflowStep.archiveChecks`), exported in `value-objects/index.ts`                                 |
| Strict parse: no `onFailure`, no unknown keys, typed fields, array, id required | Conformant | `infrastructure/schema-yaml-parser.ts` ~L287-295 (`.strict()`, `z.array`, `z.boolean`, `z.record`); `build-schema.ts` `assertArchiveCheckShape` re-validates for plugin/override layers |
| Only on `archiving`, error names step                                           | Conformant | `build-schema.ts` L867-872 (message contains the step name)                                                                                                                             |
| Layer identity by `id`, duplicate across layers rejected                        | Conformant | `merge-schema-layers.ts` L656-667 (`addToArray(..., 'id', ...)`)                                                                                                                        |
| Empty array equals omitted                                                      | Conformant | Zod accepts `[]`; the build loop is a no-op on `[]`. The raw step still carries `archiveChecks: []` (not normalized). Behaviourally equivalent.                                         |
| `checks` on `archiving` not converted to `archiveChecks`                        | Conformant | Separate field and separate loop                                                                                                                                                        |
| schema-std has no archiveChecks                                                 | Conformant | Verified by test; schema-std not changed                                                                                                                                                |
| `optional`, `disabled`, `checks`, `skipChecks` accepted                         | Conformant | Pre-existing Zod fields                                                                                                                                                                 |

### Discrepancies

- D-SF-1 (Low, info): `onFailure` is rejected by the Zod `.strict()` message (generic unrecognized key), while `buildSchema` gives a specific message. Both throw `SchemaValidationError`, so there is no contradiction.
- No other discrepancies.

### Test Coverage

| Scenario                                | Coverage                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted on archiving                   | covered: `build-schema-archive-checks.spec.ts` L61; parser spec "parses archiveChecks with all supported attributes"                                  |
| Rejected on other step                  | covered: `build-schema-archive-checks.spec.ts` L73                                                                                                    |
| `onFailure` rejected                    | covered: parser "rejects onFailure instead of stripping it"; build-schema L94                                                                         |
| Unknown keys rejected                   | covered: parser spec; build-schema L94                                                                                                                |
| Identified by id when layering          | covered: `merge-schema-layers.spec.ts` "combines distinct ids from two layers"                                                                        |
| `checks` on archiving not archiveChecks | partial: `build-schema-archive-checks.spec.ts` L127 asserts the two fields are independent. No parser-level assertion that `archiveChecks` is absent. |
| Standard schema none                    | covered: `schema-std-load.spec.ts` L53                                                                                                                |
| Options accepted                        | covered: parser "still accepts checks, skipChecks, optional and disabled"                                                                             |
| archiveChecks must be an array          | partial: build-schema L82 tests non-object entries, not a non-array `archiveChecks` value. The parser spec has no `archiveChecks: {id: ...}` case.    |
| Declaration without id                  | covered: parser spec; build-schema L88                                                                                                                |
| Wrongly typed fields                    | covered: parser spec; build-schema L103                                                                                                               |
| Empty equals omitted                    | covered: build-schema L68; parser "accepts an empty archiveChecks array"                                                                              |
| Same id from two layers                 | covered: merge-schema-layers "rejects an id that a later layer introduces..."                                                                         |
| Override adds to entry without it       | covered: merge-schema-layers "adds archiveChecks to an archiving entry that has none"                                                                 |
| Plugin layer can declare                | partial: merge-schema-layers "creates the archiving entry..." exercises the layer mechanism but no schema-plugin loader test                          |

### Missing Tests

- Non-array `archiveChecks` value at parser and build level.
- Plugin-sourced layer via the real plugin path.
- Parser-level "checks on archiving does not populate archiveChecks".

### Summary

8 requirement facets: 8 conformant, 0 missing. Scenarios: 15, covered 12, partial 3.

## 2. core:workflow-model

### Requirements Summary

- `workflow[]` rows may attach `archiveChecks`.
- Step check declarations gain `archiveChecks` (`scope: 'archive'`, no `onFailure`).
- Validation rules 1 (existence), 2 (coordinate uniqueness) and 3 (placement and binding-level locks) are extended to archive. New rule 5 (archive step only) and rule 6 (archive locks: `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` fully locked).

### Implementation Status

| Requirement                                                                                    | Status                 | Evidence                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row attaches archiveChecks                                                                     | Conformant             | `build-schema.ts` L825 copies the field into `WorkflowStep`                                                                                                                            |
| Rule 1 existence, `UnknownCheckError`                                                          | Conformant             | `build-schema.ts` ~L1008 `activeRegistry.has`                                                                                                                                          |
| Rule 2 coordinate `{id, scope:'archive'}`, `DuplicateCheckBindingError`                        | Conformant             | `${id}::archive` key in `checkCoordinateSet`, separate from the transition and step-skip keys                                                                                          |
| Rule 3 governance via shared `assertDeclarationGovernance`                                     | Conformant             | Placement, policy, disable, config locks. Refactor preserves the transition and skip behaviour. Coordinate matching for archive finds the registry binding with `scope === 'archive'`. |
| Rule 5 archive step only                                                                       | Conformant             | `build-schema.ts` L867                                                                                                                                                                 |
| Rule 6 archive locks                                                                           | Conformant             | `check-bindings.ts` `ARCHIVE_BINDING_SPECS` for the 3 checks: `allowBindingOverride/ConfigOverride/Disable=false`, `skippable=false`. Transition rows keep their policy.               |
| Redundant declaration accepted                                                                 | Conformant             | Policy lock compares against `ownBinding.skippable`; an equal value is allowed                                                                                                         |
| Fallback registry knows archive bindings                                                       | Conformant             | `build-schema.ts` ~L916 and `check-registry.ts` default bindings = TRANSITION + ARCHIVE                                                                                                |
| `resolveEffectiveBindings` archive operation overlays and disables the archive coordinate only | Conformant             | `transition-checks.ts` `operation: 'archive'`, shared `overlay()` helper. Throws `InvalidInputError` if combined with `targetStep` or `bypassedSteps`.                                 |
| Rule 4 (skipChecks on disabled step)                                                           | Conformant (unchanged) | Not touched                                                                                                                                                                            |

### Discrepancies

- D-WM-1 (Low, spec silent): `resolveEffectiveBindings` throws `InvalidInputError` when `operation:'archive'` is combined with `targetStep` or `bypassedSteps`. This is not in the spec, which does not describe the function signature. Spec gap only.
- D-WM-2 (Low, behaviour of the spec's own wording): the spec says the archive locks make a declaration "that disables them, makes them skippable, or configures them" throw. The code allows `skippable: false` or a `config` equal to the binding. The code's `skippable` check uses value inequality, as for transition. The spec and the verify scenario "Redundant declaration ... accepted" agree. No contradiction. For `config`, any non-empty config on a locked check throws (consistent with the spec).

### Test Coverage

| Scenario                                                           | Coverage                                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Row may attach archiveChecks                                       | covered: build-schema-archive-checks L61                                                                                                           |
| archiveChecks on the archiving step (coordinate `scope:'archive'`) | covered: `transition-checks.spec.ts` L1113+ (archive operation)                                                                                    |
| On another step rejected                                           | covered: L73 (also `verifying`/`implementing`)                                                                                                     |
| Unregistered id, `UnknownCheckError`                               | covered: L117                                                                                                                                      |
| Duplicate archive coordinate                                       | covered: L121                                                                                                                                      |
| Archive locks enforced                                             | covered: L158/166/177                                                                                                                              |
| Placement lock                                                     | covered: L183/224                                                                                                                                  |
| Same id in checks and archiveChecks                                | partial: L127 uses `deps.consistent` in `checks` but `spec.overlap` in `archiveChecks`, so it does not exercise the same id as the scenario states |
| Disabling one coordinate not affecting other                       | covered: `transition-checks.spec.ts` L1153 and L1260                                                                                               |
| Redundant locked declaration accepted                              | covered: L187                                                                                                                                      |
| Empty archiveChecks valid                                          | covered: L68                                                                                                                                       |
| Non-archive declarations unaffected                                | covered implicitly by the existing suite                                                                                                           |

### Missing Tests

- Same-id (`deps.consistent`) in both `checks` and `archiveChecks` of one entry.

### Summary

10 facets: 10 conformant. 2 low spec gaps. Scenarios: 12, covered 11, partial 1.

## 3. core:get-status

### Requirements Summary

In `archivable`, GetStatus executes the archive predicates of the effective archive bindings (`resolveEffectiveBindings` with operation `archive`) with an empty `skipChecks`.

- A schema-disabled check is not evaluated and produces no blocker.
- `OVERLAP_CONFLICT` carries `bypassFlag: '--skip-checks spec.overlap'` only when the resolved archive binding is skippable.

### Implementation Status

| Requirement                                        | Status     | Evidence                                                                                                                                    |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective archive bindings used                    | Conformant | `use-cases/get-status.ts` L649-660                                                                                                          |
| Disabled check not evaluated                       | Conformant | The overlay removes the binding; `executeMatchingPredicates` receives the effective list                                                    |
| Empty `skipChecks`                                 | Conformant | `buildCheckExecutionContext` is passed no skip list, same as before                                                                         |
| Bypass flag only if resolved skippable             | Conformant | `_mergeBlockers` L957-1005 uses `archiveBindings`. `_nextActionAfterArchiveOverlap` no longer invents `--skip-checks spec.overlap` (L1037). |
| Plugin archive check follows resolved skippability | Conformant | Same path                                                                                                                                   |
| Locked check has no flag                           | Conformant | Binding `skippable:false`                                                                                                                   |

### Discrepancies

- D-GS-1 (Medium, latent): `_mergeBlockers` computes `skippableByCheckId` by OR-ing across all candidates (transition targets plus archive) keyed by check id (L989-990). `impl.linksInScope` has both transition and archive bindings, and its transition binding is skippable. If a schema made `impl.linksInScope` non-skippable on archive but a transition target's check list also fails for it, the archive blocker could still get a bypass flag. Not reachable from `archivable` today (legal targets from `archivable` do not carry it), so it is latent. Code wrong: the archive blocker should use only archive bindings. Spec wrong: the spec says "resolved archive binding", so the OR is not specified either way.
- D-GS-2 (Low): `lifecycle-verdict.ts` is unchanged (`git diff` empty). `blockersFromFailedChecks` (L848-863) still hardcodes `isSkippable = OVERLAP_CONFLICT || linksInScope` and a fixed `bypassFlag`, so `isSkippable` on `LifecycleBlocker` is not derived from the resolved binding. The public `Blocker` is overridden in `_mergeBlockers`, so GetStatus output is correct for `bypassFlag`. The hardcoded value persists in the verdict-level `isSkippable`. This conflicts with the lifecycle-engine sentence "`isSkippable` and `bypassFlag` SHALL come from the resolved binding of the failing check" (spec line 71, unchanged by this change). Pre-existing; spec arguably right, code incomplete.

### Test Coverage

`test/application/use-cases/get-status.spec.ts`, last describe (L1714+).
| Scenario | Coverage |
|---|---|
| Archive predicates from effective bindings (disabled, no blocker) | covered: "produces no overlap blocker when the schema disables spec.overlap" |
| Schema-hardened overlap no bypass flag | covered: "...non-skippable" (also checks nextAction has no hint) |
| Locked archive check no flag | covered |
| Plugin check follows resolved skippability | covered |
| Runs without user bypass | partial: no assertion that `skipChecks` is empty during evaluation (fakes always fail) |
| Embedding a registered plugin check via archiveChecks | covered (extra) |

### Missing Tests

- Explicit empty-`skipChecks` assertion.
- Mixed transition+archive same-id skippability (D-GS-1).
- Real (non-fake) binding resolution through GetStatus.

### Summary

6 facets: 6 conformant. 2 discrepancies (1 medium latent, 1 low). Scenarios: 5, covered 4, partial 1.

## 4. core:lifecycle-engine

Only a verify wording edit: the scenario "Skip bypass allows transition despite blocker" now says `spec.overlap` is bypassed through `skipChecks`.

### Implementation Status

| Item                                                                                                    | Status            | Evidence                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overlap skippable through canonical flag                                                                | Conformant        | `lifecycle-verdict.ts` L24-31 matches `spec.overlap`; test added in `lifecycle-verdict.spec.ts` ("omits skippable OVERLAP_CONFLICT when the canonical spec.overlap bypass is supplied")                                                                                                                              |
| Legacy token aliases (`allow-overlap`, `--allow-overlap`, `allow-out-of-scope`) in `isBypassFlagActive` | Discrepancy (Low) | `lifecycle-verdict.ts` L27-38 and the doc at L77 still reference `allow-overlap`. The kernel/ArchiveChange input no longer has `allowOverlap`. The spec line 71 says the CLI aliases "are accepted inputs". The code is lenient and nothing contradicts the spec. It is dead or legacy surface and could be removed. |
| `isSkippable` from resolved binding                                                                     | Discrepancy (Low) | See D-GS-2                                                                                                                                                                                                                                                                                                           |

### Test Coverage

Scenario covered by the new lifecycle-verdict test. It uses the bare id `spec.overlap`, not the `--skip-checks spec.overlap` string form.

### Summary

1 verify edit: conformant. 2 low items shared with get-status.

## 5. core:change

Only a wording edit: invalidation cause `spec-overlap-conflict` is now described as "archived with `spec.overlap` bypassed".

- Implementation: no behaviour in this batch. Cause values in `lifecycle-verdict.ts` L45/118 and `spec-overlap-error.ts` are unchanged and consistent.
- No spec/code contradiction found. Not testable beyond existing coverage.
- Summary: 1 wording facet, conformant.

## 6. core:kernel

### Requirements Summary

Per-call override table: `TransitionChange` adds `skipChecks`; `ArchiveChange` = `skipHookPhases`, `skipChecks` (no `allowOverlap` or `allowOutOfScope`). New scenario "Archive and transition accept uniform check bypasses only".

### Implementation Status

| Requirement                                                                                       | Status     | Evidence                                                                                |
| ------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| `ArchiveChangeInput` has `skipHookPhases`, `skipChecks` only                                      | Conformant | `use-cases/archive-change.ts` L79-96                                                    |
| `TransitionChangeInput` has `skipHookPhases`, `skipChecks`, `refreshImplementationTrackingBefore` | Conformant | `use-cases/transition-change.ts` L53-81                                                 |
| No `allowOverlap` or `allowOutOfScope`                                                            | Conformant | grep of `src/` finds no `allowOverlap` (only the doc mention in `lifecycle-verdict.ts`) |

### Test Coverage

Covered: `test/application/use-cases/archive-change-input.spec.ts` (type-level `expectTypeOf`, with `expect(true)` placeholders). Type-level assertions only run under vitest typecheck. If typecheck is not enabled, the property-absence assertions are not enforced at runtime (Low).

### Summary

3 facets: 3 conformant. Scenario: 1, covered 1 (type-level).

## Overall

- Facets audited: about 28. Conformant 28, Missing 0.
- Discrepancies: 0 High, 1 Medium (D-GS-1, latent), 5 Low (D-SF-1, D-WM-1, D-GS-2, lifecycle-verdict legacy `allow-overlap` aliases, kernel type-test enforcement).
- Missing or partial tests: non-array `archiveChecks`, same-id `deps.consistent` in `checks` and `archiveChecks`, empty-`skipChecks` assertion in GetStatus, mixed transition+archive skippability, plugin-loader layer.
- Architecture: no domain-to-infrastructure imports introduced.

<!-- end _partial-core-schema-status.md -->

<!-- begin _partial-cli-skills-globals.md -->

# Partial audit: cli:change-archive, cli:change-status, skills:skill-templates-source + globals

Change: archive-schema-checks-and-skip-flag. Read-only audit. Core-owned behaviours (UnknownCheckError / CheckNotSkippableError, hook-check message, bypassFlag derivation, next-action reason text) are in core and audited in other batches; they are only cross-referenced here.

## 1. cli:change-archive

### Requirements Summary (changed/added)

1. Command signature: `--skip-checks <ids>` (repeatable, comma-separated), `--allow-overlap` / `--allow-out-of-scope` as strict aliases, CLI translates to single `skipChecks`, no other bypass field, no CLI-side skippability validation, dedupe/trim/case-sensitive, missing value = usage error.
2. Output on success (extended): invalidated peers also reported with `--skip-checks spec.overlap`.
3. Errors: UnknownCheckError / CheckNotSkippableError exit 1 (incl. hook ids), CheckPredicateFailedError output (+ bypass line only when skippable), SpecOverlapError message with `Use --skip-checks spec.overlap ...` only when skippable.
4. Usage examples.

### Implementation Status

| Requirement                                                                                                                                                     | Code                                                         | Status                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Option declarations, repeatable accumulator, help text                                                                                                          | archive.ts:66-73                                             | Conformant                                           |
| Split on comma, trim, drop empties, Set dedupe, exact case                                                                                                      | archive.ts:104-112                                           | Conformant                                           |
| Alias translation to `spec.overlap` / `impl.linksInScope`, no `allowOverlap`/`allowOutOfScope` fields passed                                                    | archive.ts:113-119, 126-130                                  | Conformant                                           |
| No local skippability validation                                                                                                                                | archive.ts (none present)                                    | Conformant                                           |
| `--skip-checks` without value = usage error exit 1                                                                                                              | commander default (missing option-argument -> exit 1)        | Conformant (relies on commander)                     |
| `--skip-hooks` independent of `--skip-checks`                                                                                                                   | archive.ts:99-102 vs 104-112                                 | Conformant                                           |
| Invalidated peers section with spec.overlap bypass                                                                                                              | archive.ts:141-148 (independent of how bypass was requested) | Conformant                                           |
| SpecOverlapError: lists specs/peers, ends with `Use --skip-checks spec.overlap to proceed despite overlap.` only if `err.skippable`                             | archive.ts:166-181                                           | Conformant                                           |
| CheckPredicateFailedError text: id, label, message, command, `bypass:  Retry with --skip-checks <id> if an exception is granted` only when `skippable === true` | archive.ts:183-193                                           | Conformant                                           |
| CheckPredicateFailedError in json/toon -> structured record via handleError                                                                                     | archive.ts:194 -> handle-error.ts                            | Conformant (code not verified here)                  |
| Unknown / NotSkippable / hook messages                                                                                                                          | thrown by core `validateSkipChecks`; CLI -> handleError      | Conformant (CLI side); message content is core batch |
| Progress presenter marks bypassed ids as skipped by `--skip-checks`                                                                                             | archive.ts:48, \_check-progress-presenter.ts:71              | Conformant (extra, not in spec)                      |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                          | Spec wrong?             | Code wrong?                                 |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| A1  | Low  | Text-mode CheckPredicateFailedError branch tests `opts.format === 'text'` (archive.ts:183) rather than the parsed `fmt`; `--format` is validated by `parseFormat` earlier but an invalid/undefined value would fall to handleError. Behaviour equals spec for all valid values. | n/a                     | Cosmetic; use `fmt`.                        |
| A2  | Low  | SpecOverlapError is written as plain text to stderr for ALL formats (archive.ts:166-181), including `--format json`; spec says only "prints to stderr", no scenario demands structured output for overlap. Pre-existing behaviour.                                              | Spec silent; consistent | Could emit structured record; not required. |
| A3  | Info | Text bypass line is in an indented multi-line block (`  check:` / `  bypass:`). Spec literal `bypass:  Retry with ...` (two spaces after colon) matches code line (`  bypass:  Retry...`) modulo leading indent.                                                                | Fine                    | Fine                                        |

No High/Medium discrepancies.

### Test Coverage (packages/cli/test/commands/change/archive.spec.ts)

| Scenario                                                         | Test                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| comma list                                                       | `accepts a comma-separated --skip-checks list` (463)            |
| repeatable                                                       | `accumulates a repeated --skip-checks flag` (468)               |
| --allow-overlap translation (no other field)                     | 443, 456                                                        |
| --allow-out-of-scope translation                                 | 450                                                             |
| CLI does not validate skippability / non-skippable forwarded     | 546 (`non-skippable check id, also through an alias`)           |
| whitespace / empty                                               | 478, 483                                                        |
| duplicates collapse                                              | 488                                                             |
| singular alias                                                   | 498                                                             |
| missing value usage error                                        | 509                                                             |
| combine with --skip-hooks                                        | 503                                                             |
| help documents flags                                             | 519                                                             |
| Unknown check id                                                 | 534                                                             |
| Non-skippable check id                                           | 546                                                             |
| Hook check id (message points to --skip-hooks)                   | partially (546 generic); no explicit hook.pre test              |
| Overlap error suggests / not suggests bypass                     | 584, 600                                                        |
| Skippable / non-skippable plugin failure                         | 631, 646                                                        |
| Plugin failure json                                              | 657                                                             |
| Case-sensitive                                                   | 493 (forwarded untouched; Unknown error itself comes from core) |
| Structured error CheckNotSkippable json                          | 559                                                             |
| Invalid state with skip flags                                    | 669                                                             |
| Alias for non-skippable check fails                              | 546                                                             |
| --skip-checks spec.overlap reports invalidated peers (text+json) | 684                                                             |

### Missing Tests

- Hook check id (`--skip-checks hook.pre`) with message pointing at `--skip-hooks` (only generic NotSkippable covered).
- Explicit assertion that `--allow-overlap` with a non-skippable `spec.overlap` yields no bypass suggestion beyond 600 (covered by 600 for SpecOverlapError).

### Summary counts

Requirements/scenarios audited: 4 requirement groups, 27 scenarios. Conformant 27, discrepancies 3 (0 high, 0 med, 2 low, 1 info). Scenarios without a dedicated test: 1 (hook id).

## 2. cli:change-status

### Requirements Summary

New requirement "Archive bypass hints come from resolved bindings": CLI renders `bypassFlag` exactly as provided by GetStatus, never constructs/removes one; none for non-skippable; next-action reason suffix `Use --skip-checks spec.overlap to archive anyway.` (core-derived); JSON/TOON carry `bypassFlag` exactly when text shows one.

### Implementation Status

| Requirement                                                                                       | Code                                                          | Status     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| Render `bypass: <flag>` under blocker only when `bypassFlag !== undefined`, no local construction | status.ts:270-273                                             | Conformant |
| Structured output carries `bypassFlag`                                                            | status.ts:455 area (passes `bypassFlag` through when defined) | Conformant |
| Next-action reason text / flag derivation from bindings                                           | core get-status.ts:987-1013, 1038                             | Core batch |
| Disabled spec.overlap -> no blocker                                                               | core                                                          | Core batch |

### Discrepancies

| #   | Sev        | Detail                                                                                                                                                                                                                                                                                          |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Low (docs) | `docs/cli/cli-reference.md` documents the status `bypass:` line only for archive (line ~600); the status command section does not show the `bypass:` line in its text-output example. Spec: docs global requires CLI doc to describe output. Spec does not demand it; docs-wrong/omission only. |

### Test Coverage (status.spec.ts, describe `archive bypass hints come from resolved bindings`)

| Scenario                                                  | Test                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Skippable overlap shows canonical bypass                  | `renders the projected bypass flag under a skippable blocker in text`           |
| Several blockers own flag / hardened mixed with skippable | `gives every skippable blocker its own flag and none to a locked one`           |
| CLI never builds bypass                                   | `never builds a bypass when GetStatus supplies none`                            |
| Disabled spec.overlap                                     | `shows no overlap blocker when the schema disabled spec.overlap`                |
| Locked / schema-hardened overlap (no flag)                | indirectly via the "gives every..." and "never builds" tests (CLI only renders) |
| Shown flag accepted by archive                            | not a CLI unit test (covered by archive.spec 463/468 plus core)                 |

### Missing Tests

- No CLI test asserting JSON/TOON include `bypassFlag` exactly when text does ("Structured output includes the same hints"); only the passthrough code exists (status.ts ~455).
- No plugin-archive-check (`@security.code-scan`) status scenario at CLI level (core get-status tests cover derivation).
- No next-action reason assertion at CLI level (rendered from core).

### Summary counts

1 new requirement, 10 scenarios: Conformant 10, discrepancies 1 (low, docs). Tests: 6 of 10 covered directly in CLI; 4 core-delegated or missing (structured output, plugin check, shown-flag-accepted, locked check).

## 3. skills:skill-templates-source

### Requirements Summary

Overlap requirement revised: `--skip-checks spec.overlap` is the live-overlap bypass; design/implement/verify/new must not list OVERLAP_CONFLICT as a typical blocker and must not teach `--skip-checks spec.overlap` / `--allow-overlap` for `spec-overlap-conflict` review; `specd-archive` may list OVERLAP_CONFLICT, teaches `--skip-checks <checkId>` as canonical (id from status), aliases only as aliases, blocker without a bypass flag cannot be skipped, and names `workspace.readOnly`, `impl.filesResolved`, `deps.consistent` as never bypassable.

### Implementation Status

| Requirement                                                                                                                                                               | Code                                                                             | Status                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| design/implement/verify/new: review reason routed to /specd-design, never bypassed with `--skip-checks spec.overlap` or `--allow-overlap`                                 | specd-design:42-47, specd-implement:22-26, specd-verify:23-27, specd-new:134-139 | Conformant (these templates mention the flags only in the negative form)                               |
| Design template mentions `--skip-checks spec.overlap` as bypass of live archive overlap in a parenthetical (design:42) while also not listing OVERLAP_CONFLICT as typical | specd-design/SKILL.md.tpl:42-44                                                  | Conformant to prior text; see D1                                                                       |
| Archive teaches `--skip-checks <checkId>` using status-shown id                                                                                                           | specd-archive:25-31, ~216-222                                                    | Conformant                                                                                             |
| Aliases only as aliases                                                                                                                                                   | specd-archive ~228-231                                                           | Conformant                                                                                             |
| Blocker without `bypass:` flag cannot be skipped                                                                                                                          | specd-archive:28-29, ~224-227                                                    | Conformant                                                                                             |
| Names workspace.readOnly, impl.filesResolved, deps.consistent never bypassable                                                                                            | specd-archive ~224-226                                                           | Conformant (also lists verification.current and schema/archivable/task-completion checks, beyond spec) |
| Archive: OVERLAP_CONFLICT listed as typical blocker; `--skip-checks spec.overlap` only for live overlap, never spec-overlap-conflict                                      | specd-archive:25-31                                                              | Conformant                                                                                             |

### Discrepancies

| #   | Sev  | Detail                                                                                                                                                                                                                                                                                                                                                                                                  | Spec wrong                                     | Code wrong                                           |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| D1  | Low  | specd-design/SKILL.md.tpl:42 says OVERLAP_CONFLICT blocker is "bypassed with `--skip-checks spec.overlap`" in the design template, which teaches a live-archive bypass inside a skill that spec says must not list OVERLAP_CONFLICT as typical. It appears as an exclusion note, same as pre-change text (`--allow-overlap`), and the spec scenario only forbids teaching it as the response to review. | Spec scenario ambiguous (flag mention allowed) | Mild: could drop the positive mention                |
| D2  | Info | Archive template extra claim: verification.current and schema/archivable/task-completion checks "never bypassable on archive". Beyond spec; depends on core locks. Verify against core:archive-change/transition-checks (other batch).                                                                                                                                                                  | -                                              | Potentially over-specific if schema lock set differs |

### Test Coverage (packages/skills/test/template-workflow.spec.ts)

- Overlap vs invalidation (design/implement/verify/new): updated assertion on `never bypassed with \`--skip-checks spec.overlap\` or \`--allow-overlap\``.
- Archive: lists OVERLAP_CONFLICT, contains `--skip-checks spec.overlap`, `spec-overlap-conflict`, `never bypass it`.
- `teaches the canonical check bypass on archive, with --allow-* only as aliases`.
- `names the archive checks that can never be bypassed and the missing-flag rule`.
  All four spec scenarios covered.

### Missing Tests

None for spec scenarios. Negative assertion that design/implement/verify/new do NOT list `OVERLAP_CONFLICT` as typical is pre-existing.

### Summary counts

3 changed requirement areas, 4 scenarios (2 reworded, 2 new): Conformant 4/4; discrepancies 2 (1 low, 1 info). Missing tests 0.

## 4. Global constraints (all changed/added code, tests, docs)

Method: scanned `git diff HEAD` added lines plus untracked package files for `any`, `eslint-disable`, `@ts-`, `console.`, default exports, extensionless relative imports, node/infrastructure imports in domain/application, missing JSDoc on new exports/functions/interfaces.

| Spec                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture (layers, domain purity, application ports only)                  | No violation found. Domain files changed (build-schema, check-bindings, check-registry, merge-schema-layers, transition-checks, workflow-step, spec-overlap-error) import no node:/infrastructure modules. New `application/services/validate-skip-checks.ts` imports only domain modules. `schema-yaml-parser.ts` is infrastructure and imports a domain type: allowed.                                                                                                                                                                                                                    |
| conventions (ESM, named exports, `.js` extensions, JSDoc, no default exports) | No violation found. All new exports have JSDoc (heuristic scan; only hits were type re-exports in value-objects/index.ts:76 and a type import in schema-yaml-parser.ts:8, not declarations). `validate-skip-checks.ts` JSDoc has `@param`, `@returns`, `@throws`. CLI helper `makeArchiveProgressRenderer` JSDoc updated with new `@param skipChecks`.                                                                                                                                                                                                                                      |
| error-handling-conventions                                                    | No violation found. `SpecOverlapError` adds `skippable`, still extends `SpecdError` with a code; new errors reuse check-registry-errors. CLI error output on stderr with `error:` prefix.                                                                                                                                                                                                                                                                                                                                                                                                   |
| eslint                                                                        | No `any`, `eslint-disable`, `@ts-ignore` in added lines. (Lint/typecheck not executed.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| logging                                                                       | No `console.*` added; CLI uses process.stderr/output helpers as before.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| testing                                                                       | New tests live in `test/` mirroring `src/` (e.g. core/test/application/services/validate-skip-checks.spec.ts, core/test/domain/errors/spec-overlap-error.spec.ts) with `.spec.ts`. No snapshots. Low: packages/cli/test/commands/change/archive.spec.ts uses hardcoded POSIX-looking mock paths (`/project/.specd/archive/...`, lines ~109, 131, 165) in mocked results; pre-existing pattern, not introduced by this change, and the CLI only calls `path.relative` on them (spec requires remapping with `path.resolve` when compared with host path APIs). Not flagged as new violation. |
| docs                                                                          | docs/guide/workflow.md, schema-format.md, custom-schemas.md, cli.md, core/custom-checks.md, cli-reference.md, ADR-0030 addendum updated; ADR change is an addendum to existing ADR 0030 (acceptable under ADR numbering rules; no new ADR). Gap (low): docs/cli/cli-reference.md status section does not show the `bypass:` line in the status text output example (see S1). `docs/guide/*` frontmatter not touched. Generated `packages/guide/src/infrastructure/generated/guides.ts` regenerated (708 lines churn): derived artefact, not reviewed line by line.                          |
| Changesets                                                                    | Two changesets (`.changeset/20261022-archive-schema-checks-and-skip-flag{,-specd}.md`) with consistent spec lists; BREAKING note present. Informational: the `-specd` one lists `@specd/specd: patch` and the other lists core/cli minor and skills patch; fine.                                                                                                                                                                                                                                                                                                                            |

Global violations total: 0 high, 0 medium; 2 low observations (hardcoded POSIX mock paths pre-existing in archive.spec.ts; missing status `bypass:` doc example).

<!-- end _partial-cli-skills-globals.md -->
