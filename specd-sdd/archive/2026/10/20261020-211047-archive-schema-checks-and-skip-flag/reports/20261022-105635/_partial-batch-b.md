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
