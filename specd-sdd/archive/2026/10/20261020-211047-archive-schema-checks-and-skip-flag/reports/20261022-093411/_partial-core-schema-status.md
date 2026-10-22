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
