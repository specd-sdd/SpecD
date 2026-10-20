# Partial Compliance Report — Batch B (checks)

Change: `schema-workflow-skippable-states`
Specs: `core:check-registry`, `core:transition-checks`
Mode: read-only audit (no code, spec, or workflow state modified)

Key source files:

- `packages/core/src/domain/services/transition-checks.ts` (TT)
- `packages/core/src/domain/services/check-registry.ts` (CR)
- `packages/core/src/domain/services/check-bindings.ts` (CB)
- `packages/core/src/application/services/execute-matching-predicates.ts` (EMP)
- `packages/core/src/application/services/evaluate-transition-candidate.ts` (ETC)
- `packages/core/src/application/checks/workflow-check-registry.ts` (app WCR)
- `packages/core/src/composition/use-cases/workflow-check-registry.ts` (comp WCR)
- `packages/core/src/composition/composition-registries.ts` (COMP)
- `packages/core/src/domain/services/build-schema.ts` (BS)
- `packages/core/src/domain/services/merge-schema-layers.ts` (MSL)

---

## Spec: core:check-registry

### Requirements Summary

1. Open check registry (get/has/list/bindings)
2. Immutability of built-in checks (16 built-ins injected; `@<plugin>.<id>` namespace; `InvalidPluginNameError` only on grammar violation)
3. Canonical namespacing and plugin registration (`register(pluginName, check, defaultBindings?, options?)`, `DuplicateCheckError`)
4. Adapt `CustomCheckDefinition` to internal `Check` (`kind: 'predicate'`, `InvalidCheckKindError`)
5. Binding coordinate identity and duplicate prevention (transition/archive/step-skip; `DuplicateCheckBindingError`)
6. Two-tier governance and confinement locks (check-level confinement, binding-level policy lock, config lock, disable lock, monotonic rule, built-in categories A/B/C, composition fidelity incl. plugin step-skip defaults)
7. Cascading configuration hierarchy (check default -> binding config -> step config, into `ctx.config`)

### Implementation Status

| Requirement                          | Status                           | Evidence                                                                                                                         |
| ------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Open check registry                  | Implemented                      | CR:124-164 (`get`, `has`, `list`, `bindings`, plus `getBindings`, `getGovernance`)                                               |
| Immutability of built-ins            | Implemented                      | CR:75-116 constructor injects `DOMAIN_CHECKS`; no unregister/replace API; namespace forced at CR:207                             |
| Canonical namespacing / registration | Implemented                      | CR:188-211, regex CR:18 `^[a-zA-Z0-9_-]+$`                                                                                       |
| CustomCheckDefinition adaptation     | Implemented                      | CR:213-231                                                                                                                       |
| Coordinate identity / duplicates     | Implemented                      | CR:47-58 `coordinateKey`, CR:283-301                                                                                             |
| Two-tier governance                  | Partial                          | See D-CR-1, D-CR-2, D-CR-3, D-CR-4                                                                                               |
| Category A/B/C init                  | Implemented (governance)         | CR:79-104; CB:29-227 explicit binding locks                                                                                      |
| Composition fidelity                 | Implemented                      | COMP:220-236 forwards all four governance fields; comp WCR:74-82 forwards plugin `step-skip` bindings into transition base table |
| Cascading config                     | Implemented, with duplicate site | TT:603-611 single-pass cascade; second merge site at EMP:282-285 (see D-TC-2)                                                    |

### Discrepancies

**D-CR-1 (MEDIUM) — Synthesized/embedded Category C built-ins run domain stubs, so they always pass.**
`createCompositionRegistryView` builds the `CheckRegistry` from `DOMAIN_CHECKS` (COMP:220-223). Domain built-ins such as `deps.consistent`, `workspace.readOnly`, `impl.linksInScope`, `spec.overlap` have stub `execute` bodies that always pass ("Domain stub execute. Application `create*` owns I/O": `packages/core/src/domain/checks/deps-consistent.ts` ~L98-107, `workspace-read-only.ts`, `impl-links-in-scope.ts`, `spec-overlap.ts:76-82`). When a schema embeds a Category C check at a coordinate not covered by a base binding (allowed by governance, for example `deps.consistent` on `verifying.checks` or `workspace.readOnly` on `implementing.skipChecks`), `resolveEffectiveBindings` synthesizes a binding with `registry.get(chk.id)` (TT:647, TT:695), and the EMP fallback does the same (EMP:266). Both return the domain stub, not the composed `create*` instance from app WCR:75-112. The embedded check then passes silently.

- Possibility A (implementation bug): synthesis should take the check instance from the composed base bindings (same id) and fall back to `registry.get` only for plugin checks. This is the likely reading, because the spec permits "project schemas to declare them on workflow steps" (Category C) and that only makes sense if the check is real.
- Possibility B (spec drift): the spec would have to say that Category C embedding only re-configures existing coordinates. That contradicts check-registry req 6.6 and transition-checks "Registry bindings… Category C … permitting project schemas to bind them to workflow steps".
- No test covers embedding a Category C built-in at a new coordinate and checking that its real failure surfaces.

**D-CR-2 (LOW) — `applyBindingSpecs` defaults `allowConfigOverride` to `true` and does not inherit it from governance.**
TT:526 sets `allowConfigOverride: spec.allowConfigOverride ?? true`, while `allowBindingOverride` and `allowDisable` inherit from `governanceOf` (TT:524-527). transition-checks says: "When a binding (built-in or plugin) omits a governance field, it SHALL inherit the check-level governance value; binding construction MUST NOT substitute a permissive default". check-registry req 6.5 lists `allowConfigOverride` as a governance lock. Two things limit the impact today. First, `buildSchema` checks the check-level lock independently before the binding lock (BS:871, BS:938). Second, synthesized bindings inherit correctly (TT:664, TT:705). The effective `CheckBinding.allowConfigOverride` is still wrong for plugin default bindings when `allowConfigOverride: false` is set at check level and omitted on the binding, and built-in Category A/B bindings report `allowConfigOverride: true`.

- Possibility A (bug): use `spec.allowConfigOverride ?? governanceOf?.(spec.id)?.allowConfigOverride ?? false` (or `true` only when no governance exists).
- Possibility B (spec drift): the requirement names only `allowBindingOverride` in its example; the spec could say explicitly that config lock inheritance is enforced at validation time only. The current wording ("a governance field") covers all three locks.
- Test gap: `check-bindings.spec.ts:59` asserts inheritance only for `allowBindingOverride` and `allowDisable`.

**D-CR-3 (LOW) — Schema layer merge identity is per check id, while validation identity is per coordinate.**
MSL:185-205 `addToArray` rejects a second `checks` entry with the same `id`, but BS:810-818 treats `(id, to, along)` as the coordinate, so one step can declare the same check for different `along` values in a single file. A child layer cannot add an `along: 'backward'` declaration for a check its parent already declares on that step. This is safe under the monotonic rule (it never relaxes anything), but it is inconsistent with req 5 coordinate identity.

- Possibility A: key `addToArray` on `id+along` (and `from`) for `checks`.
- Possibility B: the spec should state that merge identity is the check id.

**D-CR-4 (LOW) — `buildSchema` picks the first matching binding by `to`/`along` and ignores `from`.**
BS:821-835 (`.find`, without `from`) and BS:892-902. With several bindings for one check id (for example `impl.filesResolved` with rows `{from: implementing, to: '*'}` and `{to: verifying}`), the lock checked may belong to a different coordinate than the one being redeclared. All built-in Category C rows share the same lock values, so this is latent and only reachable with plugin bindings whose locks differ per coordinate.

**D-CR-5 (LOW, spec drift in verify.md) — "15 built-ins" scenario.**
verify.md "List all registered checks" expects 15 built-ins plus 2 plugins = 17. The spec enumerates 16 built-ins (incl. `workflow.tasksEmpty`), and the code registers 16 (CB:230-247). The scenario count is stale; it should be 18.

**D-CR-6 (LOW, cosmetic) — Naming and doc drift.**
The spec names the options type `PluginCheckRegistration`; the code uses `PluginCheckRegistrationOptions` (CR:30). The `register` JSDoc still documents the old grammar `^[a-z][a-z0-9-]*$` (CR:179). The test title at `check-registry.spec.ts:223` says it rejects "uppercase", but uppercase is valid and the list contains no uppercase case. Check-local ids are not validated (`@myplugin.@protocol.edge` is accepted, test L249). The spec is silent on check-id grammar.

### Test Coverage (check-registry scenarios)

| Scenario                                                    | Test                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retrieve registered check by canonical ID                   | `packages/core/test/domain/services/check-registry.spec.ts:13` (get; `has` not asserted for plugin)                                                                        |
| Query unregistered returns undefined                        | `check-registry.spec.ts:159` (get only; `has` false not asserted)                                                                                                          |
| List all registered checks                                  | Missing (only `>10` at L149)                                                                                                                                               |
| Built-in checks injected at construction                    | `check-registry.spec.ts:149` (no `workflow.requires` / `workflow.tasksEmpty` assertion)                                                                                    |
| External registrations never shadow built-ins               | `check-registry.spec.ts:188`, `:249`                                                                                                                                       |
| Invalid plugin name rejected                                | `check-registry.spec.ts:48`, `:223`                                                                                                                                        |
| Plugin namespace accepts grammar                            | `check-registry.spec.ts:66` (it.each MyPlugin/123plugin/my_plugin)                                                                                                         |
| Valid registration canonical id                             | `check-registry.spec.ts:13`                                                                                                                                                |
| Reject `@invalid.name` / ''                                 | `check-registry.spec.ts:62-63`, `:223`                                                                                                                                     |
| Duplicate check                                             | `check-registry.spec.ts:99`                                                                                                                                                |
| Adapted to predicate kind                                   | `check-registry.spec.ts:13` (kind asserted)                                                                                                                                |
| Reject effect kind                                          | `check-registry.spec.ts:79`, `:264`                                                                                                                                        |
| Register valid binding coordinates (transition + step-skip) | Partial: `:13` (transition), `:396` (step-skip); no single combined test                                                                                                   |
| Duplicate transition coordinate                             | `check-registry.spec.ts:117`                                                                                                                                               |
| Duplicate step-skip coordinate                              | `check-registry.spec.ts:357`                                                                                                                                               |
| Check-level confinement -> CheckEmbeddingForbiddenError     | `build-schema.spec.ts:1845`                                                                                                                                                |
| Confinement does not lock policy at own coordinates         | `build-schema.spec.ts:1815`                                                                                                                                                |
| Coordinate allowBindingOverride false locks policy          | `build-schema.spec.ts:1011`, `:1400`, `:1438`                                                                                                                              |
| Locked config rejects override                              | `build-schema.spec.ts:1100`, `:1529`                                                                                                                                       |
| Check-level allowDisable false                              | `build-schema.spec.ts:1184`                                                                                                                                                |
| Binding-level allowDisable false                            | `build-schema.spec.ts:1217`, `:1566`                                                                                                                                       |
| Schema cannot relax binding allowDisable                    | `build-schema.spec.ts:1256`                                                                                                                                                |
| Layer mergers preserve checks/skipChecks                    | `merge-schema-layers.spec.ts:363`, `:418`                                                                                                                                  |
| Permitted disablement omits check from execution            | `build-schema.spec.ts:1303` (validation) + `execute-matching-predicates.spec.ts:366` (execution; "no bypass warning" not asserted)                                         |
| Category A init locked                                      | `check-registry.spec.ts:286` (allowDisable mostly; `allowBindingOverride` only for protocol.edge; skippable via `check-bindings.spec.ts:51`/`:10`)                         |
| Category B workflow.tasksEmpty                              | `transition-checks.spec.ts:494`, `check-bindings.spec.ts:51` (governance on tasksEmpty in registry not asserted at `check-registry.spec.ts:286`)                           |
| Composition forwards plugin allowDisable                    | `packages/core/test/composition/composition-registries.spec.ts:42` (governance only; end-to-end schema rejection missing)                                                  |
| Plugin step-skip default bindings evaluated                 | Partial: `composition/use-cases/workflow-check-registry.spec.ts:296` (table inclusion only); no end-to-end test that a failing plugin step-skip check rejects the shortcut |
| Cascade merges check/binding/step                           | `execute-matching-predicates.spec.ts:235`, `:437`; `transition-checks.spec.ts:918`                                                                                         |

### Missing Tests

- `list()` exact count (16 built-ins + N plugins), and `has()` true/false assertions.
- Category A/B `allowBindingOverride: false` for every id (only a subset is asserted), `workflow.tasksEmpty` governance in the registry.
- End-to-end: a plugin step-skip default binding fails, so `evaluateTransitionCandidate` returns `allowed: false`.
- End-to-end: plugin `allowDisable: false` registered through composition makes `buildSchema` throw `CheckDisableForbiddenError`.
- Binding inherits check-level `allowConfigOverride: false` (D-CR-2).
- Category C built-in embedded at a new coordinate executes the composed instance (D-CR-1).

### Spec Dependency Chain Consistency

- `core:transition-checks`: consistent on interfaces. The inheritance clause on the transition-checks side is violated for `allowConfigOverride` (D-CR-2).
- `default:_global/architecture`: CR is a pure domain service (no I/O); OK. However, the composition registry exposes domain stub instances as executable checks (D-CR-1), which blurs the domain-vs-application boundary the architecture spec draws (application `create*` owns I/O).

---

## Spec: core:transition-checks

### Requirements Summary

Check identity/result; Check ABI; CustomCheckDefinition; one file per check; applicability from/to/along (axis from `resolveWorkflowPipeline`); step-skip scope; dynamic runtime binding composition (target overlay, bypassed overlay, single-pass cascade, coordinate isolation, applicability of step checks); archive operation; effect phase/onFailure; predicate vs effect; evaluation of a transition attempt; shared candidate evaluator; validity verdict and reconciliation owner; registry bindings (categories, explicit governance, inheritance); actionable diagnostics; progress bus; projections; no snapshot bag; approval precedence and production composition.

### Implementation Status

| Requirement                                            | Status                                              | Evidence                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Check identity and result                              | Implemented                                         | TT:23-98, open `CheckId` TT:24; synthetic skip EMP:218-232                                                    |
| Check ABI / context                                    | Implemented (context has extra fields)              | TT:351-379; EMP:67-87 adds `skipChecks`, `checkRegistry` (see D-TC-8)                                         |
| CustomCheckDefinition                                  | Implemented                                         | TT:385-394                                                                                                    |
| One file per check                                     | Implemented                                         | `packages/core/src/application/checks/*.ts`, `domain/checks/*.ts`                                             |
| Applicability from/to/along                            | Implemented                                         | `classifyAlong` TT:150-188 uses `resolveWorkflowPipeline` TT:169                                              |
| Step-skip scope                                        | Implemented                                         | TT:110-113, TT:200-205, `checkMatches` TT:221-226                                                             |
| Dynamic binding composition                            | Partial                                             | TT:594-754, but see D-TC-1..D-TC-5                                                                            |
| Archive is an operation                                | Implemented                                         | CB:147-227 (no `approval.signoff`)                                                                            |
| Effect phase / onFailure                               | Implemented                                         | CB:125-141, CB:211-226                                                                                        |
| Predicate vs effect                                    | Implemented                                         | `matchingPredicates` EMP:157-159                                                                              |
| Evaluation of transition attempt                       | Implemented                                         | ETC:66-163                                                                                                    |
| Shared candidate evaluator                             | Implemented                                         | ETC; GetStatus via `executeChecksByLegalTargets` EMP:351-384; TransitionChange `transition-change.ts:313-327` |
| Validity / reconciliation                              | Not re-audited in this batch (outside change focus) | —                                                                                                             |
| Registry bindings categories                           | Implemented                                         | CB:29-227 explicit locks/skippable                                                                            |
| Omitted governance inherits                            | Partial                                             | TT:524-527 OK for two locks; TT:526 not (D-CR-2)                                                              |
| Diagnostics / progress / projections / no snapshot bag | Implemented (spot-checked)                          | `executeCheckWithProgress` EMP:96-125; labels TT:51-68                                                        |

### Discrepancies

**D-TC-1 (MEDIUM) — `resolveEffectiveBindings` is not the single binding cascade: EMP re-applies schema filtering and runs a second, load-bearing fallback path.**

- EMP:201-216 reloads `workflowStep(to).checks` / `workflowStep(step).skipChecks` and drops any matching binding whose id is declared `disabled: true`. This duplicates TT:729. The EMP filter matches on id only and ignores the declaration's `from`/`along`, so a disable meant for one coordinate (for example `{ id, disabled: true, along: 'backward' }`) also suppresses the check on other `along` values of the same target step.
- EMP:261-300 (fallback) runs any step-declared check id not already in `seen`, using its own config merge `deepMergeConfig(default, stepDecl.config)` (EMP:282-285) and its own applicability test `stepDeclMatches` (EMP:135-149). This path is **reachable after resolution**. Example: `done.checks: [{ id: 'impl.filesResolved' }]` with attempt `verifying -> done` (forward). The overlay at TT:629-638 claims the base row `{from: implementing, to: '*', along: forward}` (to `'*'`, along matches), so `matchedAny = true` and nothing is synthesized. The clone does not match at runtime (`from` ≠ verifying), so the id is not `seen`, and the EMP fallback then executes it with default+step config and without the binding config. Results now depend on two different composition algorithms.
- The fallback also skips the binding `config` layer. Single-pass cascade (req 3: "computed exactly once … check default → binding default → step declaration, and carried on the resolved binding … MUST NOT merge any layer a second time") and "Synthesized bindings preserve restrictive governance" both assume all bindings come out of `resolveEffectiveBindings`. Bindings produced by the fallback carry no governance at all.
- The fallback's user-bypass branch (EMP:271-279) does not emit the `check-done` progress event that the main loop emits (EMP:219-224). This is an inconsistency on the progress bus.
- Possibility A (implementation bug / leftover): delete the EMP filter and fallback. Make `resolveEffectiveBindings` synthesize whenever no base row _can match the attempt_, applying `decl.from`/`decl.along`, rather than whenever any row shares the id and target.
- Possibility B (spec drift): document EMP as a second resolution layer. That contradicts the single-pass wording and the "resolved binding" contract.
- Test evidence that the duplication is load-bearing: the from/along tests `execute-matching-predicates.spec.ts:534-592` pass `[]` bindings and exercise only the fallback. The disabled test `execute-matching-predicates.spec.ts:366` exercises only the EMP filter, not the resolver.

**D-TC-2 (MEDIUM) — Step-check applicability (req 5) is not enforced on overlays of base bindings.**
When a step declares a check that already has a base row for that target, the overlay clone keeps the **base** applicability rows (TT:733-734). The declaration's `from` / `along` defaults (`'*'` / `'forward'`) are never applied. Example: `verifying.checks: [{ id: 'impl.linksInScope', config: {...} }]`. The base row `{from: '*', to: 'verifying', along: '*'}` is claimed, and the clone runs on backward `done -> verifying` with the step config. Req 5 says step-declared checks "MUST NOT run on backward, redesign, or recovery entries unless their declaration explicitly selects that along". The verify scenario "Step checks ignore non-matching along and from" (done→verifying / ready→verifying / implementing→verifying) is only tested through the EMP fallback with a plugin check that has no base binding (`execute-matching-predicates.spec.ts:572-592`).

- Possibility A (bug): restrict overlay clones to `decl.from`/`decl.along` and leave the base rows as residual for other directions.
- Possibility B (spec clarification): req 5 applies only to synthesized coordinates, and a declaration that overlays an existing coordinate only re-configures it. The spec currently does not say this.

**D-TC-3 (LOW-MEDIUM) — Dedup by check id in EMP selects the wrong per-coordinate clone for wildcard step-skip rows.**
EMP:189/210 keeps only the first matching binding per check id. When a base binding has a wildcard row `{scope: 'step-skip', step: '*'}`, which `register()` produces when a plugin step-skip binding omits `step` (CR:255-258), and two bypassed steps A and B both configure it in `skipChecks`, TT:684-692 records an edit for each step. Each clone receives `applicability: ['*']` (TT:734). At step B's attempt, clone A (emitted first) matches first, so B runs with **A's config**. If A disables and B configures, the EMP disabled filter (EMP:213-216) happens to compensate at step A. That is another sign the two layers are coupled. Coordinate isolation (req 4) requires per-step results.

- Fix direction: when splitting, narrow a wildcard row to the concrete coordinate (`{scope: 'step-skip', step: bypassedStep}`, and likewise `to: targetStep` for transitions).
- No test covers multi-step bypass with a wildcard plugin step-skip binding.

**D-TC-4 (LOW) — Permissive transition overlay filter when `along` is undefined, and the `chk.along` widening clause.**
TT:633-637 claims every `to`-matching transition row when `along === undefined`. Both production callers pass `along` (ETC:80-87, `transition-change.ts:272-279`), so this is latent, but the exported domain function's default semantics are permissive. The `chk.along` clause only _widens_ claims and never narrows `'*'` rows (see D-TC-2), so a `disabled: true` declaration with `along: 'backward'` removes `along: '*'` rows for all directions.

- Possibility A: make `along` required, or treat undefined as "no overlay".
- Possibility B: document undefined as "all directions".

**D-TC-5 (MEDIUM) — Synthesized Category C built-ins use domain stub checks.** Same root cause as D-CR-1 (TT:647, TT:695, EMP:266). Embedding allowed by the "Registry bindings" Category C clause has no effect.

**D-TC-6 (LOW) — `TransitionChange` validates `--skip-checks` against the first binding with that id, not the active coordinate.**
`transition-change.ts` ~L296-306 uses `effectiveBindings.find((b) => b.check.id === checkId)`. The skip-outcome source #2 says a check may be bypassed when "its **active** binding declares `skippable: true`". If a schema sets `skippable` differently on one coordinate (for example a step-skip clone versus a transition clone of `impl.linksInScope`), the decision can come from a non-matching clone. In the executor, the bypass (EMP:218) also does not consult `binding.skippable`, so skippability depends entirely on this pre-validation.

**D-TC-7 (LOW) — Projection-mode "protocol.edge first" relies on binding order.**
In `projection` mode ETC:122 runs all bindings and relies on `protocol.edge` being first in CB:30. Plugin or base-table reordering would break req "evaluate protocol.edge first". This is acceptable today because the table is fixed. A guard or test would make it explicit; `evaluate-transition-candidate.spec.ts:402` covers collection, not ordering.

**D-TC-8 (LOW) — The execution context carries `skipChecks` and `checkRegistry`.**
EMP:67-87 spreads `skipChecks` and `checkRegistry` into the `CheckExecutionContext` passed to `check.execute` (EMP:241-244). The spec forbids "ad-hoc bypass booleans". A bypass list is not a boolean, but it leaks orchestrator bypass state into checks, which the ABI requirement aims to avoid. verify.md "Execute does not take a global snapshot bag" also still mentions "skip flags" in the context, which contradicts the ABI requirement. That is spec drift in verify.md.

### Test Coverage (transition-checks, change-relevant scenarios)

| Scenario                                     | Test                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic skip on `--skip-checks`            | `execute-matching-predicates.spec.ts` (`bypassedByUser`, only file referencing it)                                                                                   |
| Self-discard skip                            | `execute-matching-predicates.spec.ts:328`                                                                                                                            |
| Custom check receives isolated config        | `execute-matching-predicates.spec.ts:235`                                                                                                                            |
| Recovery not backward / redesign             | `transition-checks.spec.ts:34`, `:42`                                                                                                                                |
| Disabled steps excluded from axis            | Not found in TT tests (topology covered in other batch)                                                                                                              |
| Direction delegates to topology axis         | Indirect: `transition-checks.spec.ts:68-82`                                                                                                                          |
| Omitted implementing keeps retry backward    | `transition-checks.spec.ts:74`                                                                                                                                       |
| Omitted ready forward into implementing      | `transition-checks.spec.ts:78`                                                                                                                                       |
| Step-skip match / mismatch                   | `transition-checks.spec.ts:417`, `:433`                                                                                                                              |
| Target step synthesizes with config          | `transition-checks.spec.ts:521`, `:631` (resolver only, `ctx.config` asserted e2e in `execute-matching-predicates.spec.ts:437`)                                      |
| Schema disabled check omitted                | `transition-checks.spec.ts:594`; `execute-matching-predicates.spec.ts:366`                                                                                           |
| Bypassed step skipChecks synthesized         | `transition-checks.spec.ts:743`                                                                                                                                      |
| Synthesized bindings preserve governance     | `transition-checks.spec.ts:691`                                                                                                                                      |
| Deep-merge cascade e2e, no duplication       | `execute-matching-predicates.spec.ts:437` (scenario values differ slightly; equivalent)                                                                              |
| Disabling step check leaves skip check       | `transition-checks.spec.ts:853` (resolver level only; no execution-level test)                                                                                       |
| Disabling skip check leaves step check       | `transition-checks.spec.ts:884`                                                                                                                                      |
| Step checks ignore non-matching along/from   | Partial: `execute-matching-predicates.spec.ts:572-592` (fallback path, designing→ready only; the scenario's done/ready/implementing→verifying matrix is not covered) |
| Candidate combines target and bypass         | `evaluate-transition-candidate.spec.ts:99`, `:169`                                                                                                                   |
| Failed step-skip rejects                     | `evaluate-transition-candidate.spec.ts:127`                                                                                                                          |
| Empty skip set passes                        | `evaluate-transition-candidate.spec.ts:213`                                                                                                                          |
| Pure and shared                              | `evaluate-transition-candidate.spec.ts:270`                                                                                                                          |
| Protocol fail-fast / projection collects     | `evaluate-transition-candidate.spec.ts:367`, `:385`, `:402`                                                                                                          |
| Category bindings skippable                  | `check-bindings.spec.ts:10`, `:22`; `transition-checks.spec.ts:494`                                                                                                  |
| Built-in specs declare governance explicitly | `check-bindings.spec.ts:44`, `:51`                                                                                                                                   |
| Omitted governance inherits                  | `check-bindings.spec.ts:59` (not for `allowConfigOverride`)                                                                                                          |

### Missing Tests

- End-to-end `evaluateTransitionCandidate` matrix for the "Step checks ignore non-matching along and from" scenario, using a check that **has** a base binding (D-TC-2), on `done→verifying`, `ready→verifying`, `implementing→verifying`.
- Execution-level coordinate isolation (enter `implementing` with `checks` disabled while `skipChecks` is enabled, then bypass `implementing`).
- Multi-step bypass with a wildcard plugin step-skip binding configured per step (D-TC-3).
- `resolveEffectiveBindings` alone (without the EMP fallback/filter) for from/along/disabled declarations, which would expose D-TC-1.
- Category C built-in embedded at a new coordinate surfaces the real check result (D-TC-5).
- `--skip-checks` validation against the active coordinate clone (D-TC-6).
- "Disabled steps are excluded from progress axis" (`classifyAlong` implementing→done with `verifying` disabled) in this spec's own tests.

### Spec Dependency Chain Consistency

- `core:check-registry`: consistent in shape. The governance inheritance gap (D-CR-2) and the stub-instance synthesis (D-CR-1/D-TC-5) affect both specs.
- `core:workflow-topology`: `classifyAlong` and the evaluator delegate to `resolveWorkflowPipeline` / `listBypassedWorkflowSteps` / `listWorkflowTransitions` (TT:169, ETC:77, EMP:366). Consistent.
- `core:schema-format` / `core:workflow-model`: the `checks` / `skipChecks` declaration shape (`from`, `along`, `disabled`, `skippable`, `onFailure`, `config`) matches its consumption in TT:572-577 and BS:799-945.
- `default:_global/architecture`: the domain stays pure. EMP is in the application layer; OK. D-CR-1 is an architecture-boundary smell (domain stubs used as executable checks in composition).
- `default:_global/error-handling-conventions`: typed errors are used (`InvalidPluginNameError`, `DuplicateCheckError`, `DuplicateCheckBindingError`, `InvalidCheckKindError`, `CheckEmbeddingForbiddenError`, `CheckBindingOverrideForbiddenError`, `CheckConfigOverrideForbiddenError`, `CheckDisableForbiddenError`, `UnknownCheckError`, `CheckNotSkippableError`). `applyBindingSpecs` throws `InvalidInputError` for a missing instance; acceptable.
- `default:_global/testing`: test titles are mostly behavior-oriented. The misleading "uppercase" title is noted in D-CR-6.

---

## Summary

| Severity | Count | Items                                                                                                                                                                                                                            |
| -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | 0     | —                                                                                                                                                                                                                                |
| MEDIUM   | 4     | D-CR-1/D-TC-5 (stub instances for synthesized Category C, counted once), D-TC-1 (duplicate EMP filter + load-bearing fallback), D-TC-2 (req 5 not applied to overlays), D-TC-3 (id dedup picks wrong wildcard clone; LOW-MEDIUM) |
| LOW      | 9     | D-CR-2 (allowConfigOverride default true), D-CR-3, D-CR-4, D-CR-5 (verify count 15→16), D-CR-6, D-TC-4 (`along === undefined`), D-TC-6, D-TC-7, D-TC-8                                                                           |

Requirements: check-registry has 7 requirements (6 implemented, 1 partial). transition-checks has 21 requirements; the change-relevant ones are mostly implemented, with partial status on "Dynamic runtime binding composition" and "Registry bindings (inheritance)". Validity and reconciliation requirements were not re-audited in this batch.

Lead outcomes: (a) confirmed, D-TC-1 / D-TC-3. (b) confirmed but latent, D-TC-4. (c) confirmed, D-CR-2, with impact reduced to LOW because `buildSchema` checks the check-level config lock first.
