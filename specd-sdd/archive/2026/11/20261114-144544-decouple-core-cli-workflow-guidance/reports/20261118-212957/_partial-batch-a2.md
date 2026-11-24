# Partial batch A2 — full audit (round 8, verification-attempt-10)

Specs: core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec, core:approve-signoff.
Method: merged spec+verify via `changes spec-preview`; implementation read line by line for topology, edit-change, cli edit, approve-spec, approve-signoff; build-schema/resolve-schema/validate-schema/transition-checks read at the relevant lines for workflow-model. Test titles mapped by reading/grep (not every workflow-model test body was opened; where only title-level or file-level evidence exists it is marked "(title-level)").

Test runs (read-only, vitest JSON reporter):

- core (27 files: workflow-topology*, edit-change, approve*, archive-change, get-status, domain/checks, composition approve-spec, build-schema\*, value-objects): 642 passed / 0 failed / 642.
- cli (change-edit.spec.ts, change/approve.spec.ts): 43 passed / 0 failed / 43.

Severity totals for this batch: HIGH 0, MEDIUM 0, LOW 5, INFO 6.

---

## 1. core:workflow-topology

### Requirements Summary / Implementation Status

File: packages/core/src/domain/services/workflow-topology.ts

| Requirement                               | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module of pure workflow functions         | PASS    | Exports exactly the 8 named functions (resolveWorkflowPipeline L170, isWorkflowStepEnabled L184, listWorkflowTransitions L203, isWorkflowTransitionLegal L248, listBypassedWorkflowSteps L269, nextWorkflowStep L292, drainAnchorOf L70, isDrainState L80); helpers buildActivePipeline L92/forwardTargets L133 are not exported. No class. Test pins the export key list (workflow-topology.spec.ts:431-442). (Interfaces ApprovalGates/PipelineStep/DrainAnchor are type-only exports, not runtime.)                                                                                                                                                                                                          |
| Ordered pipeline construction (1-8)       | PASS    | CANONICAL_PIPELINE L32; rows only supply flags via `declared` map L93-121 (order irrelevant, no throw); omitted default enabled L119-120; disabled filtered L121; optional kept L119; bedrock disabled/optional throw L102-107; ready+spec gate throw L108-113; `done` never conditional on signoff (no approvals.signoff read); drain states absent from CANONICAL_PIPELINE.                                                                                                                                                                                                                                                                                                                                   |
| Forward connectivity by construction      | PASS    | No reachability guard exists; forwardTargets L133-157 always yields next active step. Test: all delivery steps disabled -> pipeline drafting,designing,done,archivable,archiving and designing->done (spec:135-154).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Dynamic legal transitions (1-7)           | PASS    | forward + optional shortcuts L133-157 (stops after first non-optional L152); backward admitted only when move in VALID_TRANSITIONS AND (redesign OR archiving->archivable recovery OR pipeline index earlier) L223-234 — never invents edges, never admits table edge as forward bypass; archivable only from done / archiving only from archivable L145-150; drain states return table exits filtered by enablement, no pipeline normalisation L214-216 (table lists no drain->drain exits for pending-spec-approval/pending-signoff; verified change-state.ts:36,41); disabled destination filtered L224; disabled source -> [] L208-210. isWorkflowTransitionLegal = includes(listWorkflowTransitions) L254. |
| Bypassed step detection                   | PASS    | L275-281: adjacent/backward/self -> []; slice between indices over active pipeline only (disabled absent).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Topological forward progression           | PASS    | L297-313: archivable/archiving -> null; all four drain states handled uniformly via first non-designing legal exit L300-306 (no per-state special case, no anchor mapping); otherwise next active pipeline step incl. optional; disabled skipped; result always in list (property test spec:379-405).                                                                                                                                                                                                                                                                                                                                                                                                           |
| Step enablement and verification boundary | PASS    | L184-193 bedrock always true. Consumers of the verification boundary: approve-signoff.ts `isWorkflowStepEnabled('verifying', schema)` (verified); archive/reconciler/verdict paths exercised by tests below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### Scenarios (covering test)

Tests in packages/core/test/domain/services/workflow-topology.spec.ts (WT) and workflow-topology-audit.spec.ts (WTA).

- Topology consumed as named function imports — WT:431 (export-key pin; also asserts no class/internal helper).
- Pipeline excludes disabled and annotates optional — WT:39 + WT:49.
- Noncanonical row order normalized silently — WT:91.
- Reordered rows cannot skip required steps/spec approval — WT:117 (asserts designing -> [ready, designing], no verifying/done). Note: scenario text says "approvals.spec: true"; WT uses `approvals` const (spec false) — LOW test-fidelity gap, behaviour identical.
- Explicit noncanonical bedrock declarations normalized — WT:65.
- Disabling bedrock throws — WT:156.
- Done mandatory when signoff disabled (optional/disabled throw) — WT:177, WT:186.
- Disabled signoff skips its check rather than done — WTA:14 (+ domain/checks/approval-signoff.spec.ts).
- Disabling active approval anchor throws — WT:170.
- Drain states never pipeline steps — WT:468.
- Every configurable delivery step disabled stays connected — WT:135.
- Disabling implementing+verifying routes ready to done — WT:419 covers `done` in transitions and nextWorkflowStep; **the AND clause `listBypassedWorkflowSteps('ready','done')` returns [] is not asserted** (LOW missing assertion; behaviour correct by L278).
- Shortcut across optional — WT:237.
- Shortcut stops at first non-optional — WT:445.
- Transitions to disabled steps prohibited — WT:247.
- Pipeline order does not invent backward edges — WT:226 (`not.toContain('drafting')` from implementing). Adequate.
- Redesign re-entry legal from designing — WT:414.
- Backward VALID_TRANSITIONS edges remain legal — WT:458.
- Drain states gain no forward shortcuts — WTA:44-66 (both gate configs; exact sorted exits, no drain->drain, pending-spec-approval->verifying false) + WT:349-364.
- Disabled source has no transitions — WT:257.
- Legal-transition functions honor supplied approval snapshot — partially: WT:263 and WT:332 assert all four query functions throw with spec:true and `ready` disabled; the converse (same schema with spec:false yields a valid pipeline in every function) is not asserted (LOW partial).
- Detection of intermediate optional steps — WT:289.
- Immediate step -> [] — WT:277.
- Backward -> [] — WT:283.
- Next forward step skips disabled — WT:321.
- Next forward step enters optional step — WT:373.
- Drain states only return legal next steps — WT:358-370, WT:408 (implementing disabled -> null for spec-approved; pending-spec-approval -> null not asserted separately, shared code path) (INFO).
- Next step is always a legal transition — WT:379 (4 schemas x 2 gates x all states).
- Terminal states return null — WT:326.
- Disabled verifying relaxes verification boundary — WT:213.
- Disabled verifying never requires verification evidence end to end — archive-change.spec.ts:366 ("verification with the real validity reconciler") and get-status.spec.ts:1665 ("GetStatus with verifying disabled and the real reconciler"), approve-signoff.spec.ts:196. Title-level; passing.
- Bedrock always enabled — WT:204.

### Discrepancies

- INFO: listWorkflowTransitions on a drain state does not call buildActivePipeline, so an invalid approval-anchor schema does not throw for drain sources (spec only requires table-driven exits). No action.
- LOW: two assertion gaps noted above (bypassed [] for ready->done; approval-snapshot converse).

---

## 2. core:workflow-model

### Requirements Summary / Implementation Status

| Requirement                                                                                                                               | Verdict                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step names reference domain lifecycle states                                                                                              | PASS                                                                            | build-schema.ts:831-846 rejects non-state names and drain-only names with SchemaValidationError; schema.workflowStep(state) returns null when no row (value-objects/schema.ts:193); archiveChecks/extras attach at build-schema.ts:814-820.                                                                                                                                                                                                                                                              |
| Step semantics                                                                                                                            | PASS (spec-only prose; routing implemented in lifecycle/verification use cases) | not re-traced here; covered by other batches.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Optional and disabled declarations (rules 1-6)                                                                                            | PASS                                                                            | R1 bedrock disabled/optional throw: build-schema.ts:847-858 AND topology L102-107. R2 approval anchor at build/resolve time (not deferred): ResolveSchema.\_assertTopology (resolve-schema.ts:124) and ValidateSchema.\_assertTopology (validate-schema.ts:83) call resolveWorkflowPipeline(schema, approvals) when approvals supplied. R3 done mandatory (topology). R4 connectivity (topology). R5 omission default (topology L119-120). R6 authority boundary (projection through lifecycle-verdict). |
| Workflow step checks and skip-checks declarations                                                                                         | PASS                                                                            | Validation of unknown id/duplicate coordinate/locks/skipChecks on disabled (build-schema.ts:859-861)/archiveChecks only on archiving (L862-867)/archive locks (L1007+)/archive shape (L646-700).                                                                                                                                                                                                                                                                                                         |
| Sovereign change schema authority                                                                                                         | PASS                                                                            | ResolveChangeSchema used by edit/approve use cases (verified).                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Requires-based gating / Task completion gating                                                                                            | PASS                                                                            | workflow.requires check; createWorkflowTaskCompletion({countTasks}) at application/checks/workflow-task-completion.ts:122 wired in workflow-check-registry.ts:76; requires subset/hasTasks validation build-schema.ts:1041-1056.                                                                                                                                                                                                                                                                         |
| Step check declarations / availability evaluation / step-to-state mapping / hooks / two execution modes / requires reference artifact ids | PASS                                                                            | build-schema.ts:926 (from validation), :1041 (unknown artifact in requires); remaining are behaviour owned by transition-change/lifecycle-verdict (other batches).                                                                                                                                                                                                                                                                                                                                       |
| Workflow array order is not significant                                                                                                   | PASS                                                                            | transition-checks.ts:234 classifyAlong axis = resolveWorkflowPipeline order; designing target -> redesign L222-224; archiving->archivable recovery L220; omitted step falls back via canonical pipeline.                                                                                                                                                                                                                                                                                                 |

### Scenarios (covering test)

- Invalid step name rejected — build-schema.spec.ts:41.
- Drain-state row rejected — build-schema.spec.ts:1867.
- Omitted workflow row does not delete protocol state — resolve-schema.spec.ts workflowStep('implementing') null cases (L270/313/573, title-level) + WT:219 (not declared -> enabled).
- A workflow row may attach archiveChecks — build-schema-archive-checks.spec.ts.
- Step semantics (3 scenarios: implementation-failure, artifact-review-required, drifted file forces redesign) — behavioural, covered in verification/lifecycle tests (title-level: get-status.spec.ts, reconcile-change-validity.spec.ts); not individually traced (INFO).
- Schema parses optional/disabled — resolve-schema.spec.ts / build-schema.spec.ts (title-level).
- Bedrock cannot be disabled/optional — build-schema.spec.ts:59 + WT:156/163.
- Done remains mandatory when signoff disabled — WT:177/186, WTA:14.
- Active approval anchors cannot be disabled, at build/resolve not deferred — resolve-schema.spec.ts:1670 ("ResolveSchema approval anchor validation") and validate-schema-approval-anchor.spec.ts.
- Disabling every configurable delivery step valid — WT:135.
- Optional step with no effective skip checks unconditional — lifecycle-verdict.spec.ts:84/101 (title-level).
- Skills cannot redefine optionality — consumer-side (skills package; not in scope of core tests) — untested here (INFO; skills projection covered by other batch).
- Step checks/skipChecks build — build-schema.spec.ts (title-level).
- Unknown check id UnknownCheckError — build-schema.spec.ts / archive-change tests.
- Duplicate coordinate — build-schema.spec.ts, build-schema-archive-checks.spec.ts.
- Unknown checks `from` rejected — schema-yaml-parser.spec.ts:894 + build-schema.ts:926.
- Embedding/Policy/Config/Disable lock scenarios — build-schema.spec.ts, build-schema-archive-checks.spec.ts, merge-schema-layers.spec.ts.
- Later schema layer may change declaration — merge-schema-layers.spec.ts.
- skipChecks on disabled step — build-schema.spec.ts:1697.
- archiveChecks scenarios (archiving step, other step rejected, unregistered id, duplicate, locks, placement lock, same id in checks+archiveChecks, disabling one coordinate, redundant locked declaration, empty array, non-archive unaffected) — build-schema-archive-checks.spec.ts (10.3K, title-level).
- Sovereign authority: recorded schema preserved / SCHEMA_VERSION_DRIFT / LazySchemaProvider caching — resolve-change-schema.spec.ts, get-status.spec.ts (drift). LazySchemaProvider cache scenario: not individually located (INFO).
- Requires gating (5 scenarios) — transition-change.spec.ts, transition-change-audit.spec.ts, evaluate-transition-candidate.spec.ts, lifecycle-guidance.spec.ts (title-level).
- Task completion gating (7 scenarios) — transition-change.spec.ts, transition-checks-audit.spec.ts, count-tasks.spec.ts, workflow-check-factories.spec.ts (title-level).
- Step check declaration defaults/along/disabled — build-schema.spec.ts / transition-checks.spec.ts (title-level).
- Step availability evaluation (2) — get-status.spec.ts / lifecycle-verdict.spec.ts (title-level).
- Step-to-state mapping — transition-change.spec.ts.
- Hooks (pre, post before persist, post only along forward) — transition-change.spec.ts (skipHookPhases/hooks), title-level.
- Requires contains artifact IDs / circular impossible — build-schema.spec.ts ("requires unknown artifact").
- Workflow array order scenarios (noncanonical order / later step available earlier / axis classification / designing is redesign / omitted step fallback / omitted implementing keeps retry backward / disabled excluded from axis) — transition-checks.spec.ts:39-65 (classifyAlong), WT:91, WT:49 (+ ready->done forward via WT:247 pipeline). The status "display order" half of the first scenario was not located (LOW, title-level).
- Two execution modes (3) — transition-change.spec.ts, archive-change.spec.ts (skipHookPhases).

### Discrepancies

- INFO: spec text for "Workflow array order is not significant" requires status display order == canonical axis; lifecycle-verdict.ts:205 maps resolveWorkflowPipeline (conforms).
- INFO: spec says cycle error from `buildSchema` for step names in `requires` — implemented at build-schema.ts:1041 with message "requires unknown artifact".
- No implementation discrepancy found.

---

## 3. core:edit-change

File: packages/core/src/application/use-cases/edit-change.ts (483 lines)

### Requirements Summary / Implementation Status

| Requirement                                                                 | Verdict                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input contract                                                              | PASS with spec inconsistency                                                                                                     | Input uses structured `invalidation?: InvalidationPolicyOverride` (L64), not the `invalidationPolicy` string field named in the Input-contract bullet; the "Invalidation policy edits" requirement in the same spec mandates the structured shape, so the spec contradicts itself (LOW spec-text drift). |
| Spec ID validation                                                          | PASS                                                                                                                             | parseSpecId on adds L155-158 (throws before mutation); removals normalized-or-raw and de-duplicated L176-187; absent -> SpecNotInChangeError inside mutation L300.                                                                                                                                       |
| ReadOnly workspace rejection                                                | PASS                                                                                                                             | L160-173 exact message format; removals unchecked.                                                                                                                                                                                                                                                       |
| Invalidation policy edits                                                   | PASS                                                                                                                             | assertInvalidationPolicyOverride L135 (before any mutation; InvalidInputError); policy-only persists via mutate L244-246; no state movement.                                                                                                                                                             |
| Change lookup                                                               | PASS                                                                                                                             | L130-133; effective updates via `_changes.mutate` / `_reconcile.mutate`.                                                                                                                                                                                                                                 |
| No-op when no spec changes                                                  | PASS                                                                                                                             | L148-150 returns without resolving actor; description-only path L229-250 -> scopeChanged/validity false.                                                                                                                                                                                                 |
| Description update does not invalidate                                      | PASS                                                                                                                             | L240-242; editResult false flags L270.                                                                                                                                                                                                                                                                   |
| Removal precedes addition                                                   | PASS                                                                                                                             | L297-308.                                                                                                                                                                                                                                                                                                |
| Removal of absent spec throws                                               | PASS                                                                                                                             | L298-300.                                                                                                                                                                                                                                                                                                |
| Host-neutral SpecNotInChangeError                                           | PASS                                                                                                                             | SpecNotInChangeError(id, name) used; (error class owned by other batch).                                                                                                                                                                                                                                 |
| Addition idempotent                                                         | PASS                                                                                                                             | L306, L209 no actor for idempotent add (test edit-change.spec.ts:1011).                                                                                                                                                                                                                                  |
| Seed specDependsOn                                                          | PASS                                                                                                                             | L317-321 only for newly added, never overwrites existing entry L318.                                                                                                                                                                                                                                     |
| No-op when specIds unchanged after processing                               | PASS                                                                                                                             | L309-314 returns scopeChanged false; reconcile.mutate persists nothing material (test 517 asserts no invented events).                                                                                                                                                                                   |
| Approval invalidation on effective change                                   | PASS                                                                                                                             | scope update + `ctx.reconcileAfter` in one `_reconcile.mutate` L292-324; no independent recovery/appends.                                                                                                                                                                                                |
| Directory cleanup on removal                                                | PASS                                                                                                                             | unscaffold after persist L327-329 (scaffold L330-333).                                                                                                                                                                                                                                                   |
| Implementation tracking refresh                                             | PASS                                                                                                                             | L330-339 gated on `scopeChanged` only (not on validityChanged).                                                                                                                                                                                                                                          |
| Output contract                                                             | PASS                                                                                                                             | L340-353 returns reconciled change, scopeChanged, validityChanged, effectivePolicy, projectionChanges, affectedArtifacts, nextAction, blockers, automaticReturn; `invalidated` = validityChanged.                                                                                                        |
| Dependencies / Config-based factory delegates through resolveEditChangeDeps | PASS (not re-traced in composition; composition/use-cases/mandatory-validity-reconciler.spec.ts, barrel-kernel-coverage.spec.ts) | constructor L95-114 requires reconcile.                                                                                                                                                                                                                                                                  |
| Schema compatibility guardrail                                              | PASS                                                                                                                             | L196-206 uses persisted schema else change schema; default schema never consulted.                                                                                                                                                                                                                       |
| Sovereign schema resolution                                                 | PASS                                                                                                                             | ResolveChangeSchema once before mutation L190-194; replaceSpecIds + ctx.reconcileAfter L316/322; no updateSpecIds.                                                                                                                                                                                       |

### Scenarios (edit-change.spec.ts = EC)

- Change does not exist — EC:63.
- Description with no spec changes (scopeChanged/validityChanged/invalidated false) — EC:289.
- Both add/remove absent / empty arrays — EC:75 (absent); empty-arrays variant not distinct (LOW, same code path L144-146).
- Description + addSpecIds together without evidence — EC:326 ("applies all requested changes"; asserts scopeChanged true, invalidated false only partly) (title-level).
- addSpecIds no effective change — EC:176 / EC:1011.
- Description-only doesn't invalidate — EC:289.
- Remove and add same call — EC:326.
- Remove absent spec throws — EC:274, EC:148.
- Adding already present — EC:176.
- Seeding (4 scenarios) — EC:190, EC:223; "Legacy metadata seeds when persisted state absent" EC:223 variant; "Existing snapshot not overwritten" — **not located** (LOW untested; code L318).
- Remove and re-add same spec — EC:517 and EC:131.
- Scope change reconciles fingerprints atomically — EC:446 (+EC:552 atomic rollback).
- Scope change affects spec consent not unrelated evidence — EC:446 (spec-added difference); "unaffected verification/sign-off unchanged with history retained" — asserts spec-approved event retained only; verification/sign-off non-change not asserted (LOW partial).
- Scope reordering not semantic — EC:517.
- **Scope change in ready keeps the change in ready (the `ready` scenario)** — EC:490 asserts scopeChanged, validityChanged, projection specApproval valid->stale, `specApproval.status === 'stale'`, automaticReturn null, state ready. PASS, full coverage of all THEN clauses. Implementation relies on reconciler (select-automatic-recovery) — outside this file; test uses the real ReconcileChangeValidity.
- Directory cleanup (3) — EC:1050 (remove + add no-unscaffold), EC:258/257 (multi-remove title-level).
- Impl tracking refresh (2) — EC:369 (removal), ungated preserve refresh w/o validity change — covered implicitly by EC:517/EC:160 only if refresh passed; **not explicitly asserted** (LOW partial).
- Input contract accepts EditChangeInput — type-level / all tests.
- Policy-only edit — EC:305; repeat same policy no-op — EC:131; unknown policy — EC:88; invalid policy with valid edits — EC:104. (Scenario text uses `invalidationPolicy: 'sugical'`; tests use structured `invalidation.artifacts` — see Discrepancies.)
- Output contract (2) — EC:446 (committed recovery), EC:305/289 (no invented invalidation).
- Dependencies (3) — EC:61 setup, EC:685 (actor resolved once, shared) (title-level).
- Config-based factory — composition/use-cases/mandatory-validity-reconciler.spec.ts, barrel-kernel-coverage.spec.ts (title-level).
- Schema compatibility (4) — EC:731, 763, 797, 662 (uninitialized -> compatible, no global schema).
- Sovereign resolution (3) — EC:603, EC:640, EC:662.
- Spec ID validation (9) — EC:830, 951, 841, 851, 861, 870, 881, 960, 1002, 972.
- ReadOnly (4) — EC:893, 981, 931; "SDK callers are covered" — same use-case tests.
- Host-neutral SpecNotInChangeError — EC:960 (value quoted); message-has-no-CLI-syntax asserted in errors tests (title-level).

### Discrepancies

- LOW (spec drift, pre-existing text): Input contract bullet `invalidationPolicy` (string) and verify scenarios "Unknown invalidation policy rejected"/"Invalid invalidation policy..." use `invalidationPolicy: 'sugical'`, while the same spec's "Invalidation policy edits" and the implementation use structured `invalidation: { artifacts, workflow }`. Fix the spec text (spec-only; code and tests are consistent with the structured form).
- LOW (dead code): `EditChange._isNoOp` (edit-change.ts:370-395) is unused; `_schemaProvider` retained only for the default ResolveChangeSchema. No behavioural impact.
- INFO: in the non-scope path (L237-270) `persisted.invalidated` is always false so the unscaffold/scaffold/refresh branch L253-268 is unreachable.
- INFO: scope edit resolves the actor (L213) before the reconciler decides the remove-then-re-add case is a no-op; the constraint only forbids resolving when nothing is requested, so conformant (EC:1011 covers idempotent add).

---

## 4. cli:change-edit

File: packages/cli/src/commands/change/edit.ts; tests packages/cli/test/commands/change-edit.spec.ts (CE).

### Requirements Summary / Implementation Status

| Requirement                  | Verdict       | Evidence                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature            | PASS          | edit.ts:26-43 options incl. --artifact-policy/--workflow-policy; usage check L74-86 occurs before resolveCliContext L88 (config not masked); only supplied dimensions forwarded L93,99 via resolveInvalidationOverride; spec IDs forwarded raw L90-91.                                                         |
| Workspace derivation         | PASS          | prints change.workspaces L161; no workspace logic in command (test CE:452).                                                                                                                                                                                                                                    |
| ReadOnly workspace rejection | PASS          | no ownership logic; error flows through handleError (CE:359).                                                                                                                                                                                                                                                  |
| Approval invalidation        | PASS          | Warning on stderr only when projectionChanges.length>0 or automaticReturn L122-133; no warning for scope-only (CE:101); text prints blockers + Core next action L165, L201-224; JSON/TOON include scopeChanged/validityChanged/blockers/nextAction/effectivePolicy/projectionChanges/automaticReturn L168-184. |
| Output on success            | PASS          | text lines L158-166 ("updated change", "specs:", "workspaces:"); JSON `{result,name,specIds,workspaces,invalidated,state,...}`.                                                                                                                                                                                |
| Error cases                  | PASS with LOW | all handled by handleError; policy flags rejected locally (see Discrepancies).                                                                                                                                                                                                                                 |

### Scenarios

- Partial policy edit preserves unspecified dimension — CE:499.
- At least one edit required (fails before core) — CE:62, CE:487 (names structured flags).
- Values forwarded unchanged — CE:324.
- Comma value is one ID — CE:341, CE:404.
- Usage error precedes configuration resolution — CE:437.
- Remove values forwarded unchanged — CE:419.
- Command resolves no workspace itself — CE:452, CE:378.
- Workspace derivation (3 scenarios) — CE:288 (prints specIds/workspaces/state from the mock change); derivation itself is Core's (EditChange), tests with a mock kernel do not exercise add/remove workspace arithmetic — LOW, core-owned; core derivation covered by Change entity tests.
- ReadOnly (3) — CE:359 (mapped error); stderr per-spec line is Core message (EC:893); "removing not subject to ownership" and "no edits applied when readOnly fails" at the CLI level are core-owned (EC:931, EC:981) — CLI untested directly (INFO).
- Output reflects canonical gate recovery (incl. post-`ready` and `ready` cases) — CE:529 (designing recovery, stderr warning) and **CE:591 `it.each(['text','json'])` "reports ready with stale approval and no automatic return"** (asserts parsed.state 'ready', automatic return none). PASS for the `ready` scenario in both formats. "policy-only edits don't claim invalidation" — CE:499/CE:101 (no warning without projection changes).
- Ungated preserve reports blocker without invented return — CE:128 (text) PASS.
- Scope change does not imply validity warning — CE:101.
- Structured output includes recovery guidance (text/JSON/TOON) — CE:128 (text), CE:529 (JSON), CE:461 (TOON, basic) PASS.
- Text output renders blocker codes and next command — CE:128.
- Text output shows updated specs and workspaces — CE:73.
- JSON output reflects required-gate scope recovery — CE:219 only asserts `result` and `invalidated`; CE:529 asserts state/automaticReturn/projectionChanges but with --artifact-policy and no add-spec; the combined assertion (`scopeChanged: true`, `validityChanged: true`, compat invalidated true, state designing, with `--add-spec`) is spread across CE:219/288/529 (LOW partial).
- Error cases: change not found CE:245; remove not in specIds — **no CLI-level test** (core EC:274) (LOW); unknown workspace CE:324; ReadOnly CE:359; Invalid spec ID CE:388; Unknown workspace CE:324; Invalid invalidation policy CE:48.

### Discrepancies

- LOW: spec "Error cases" and verify scenario say an invalid policy yields `InvalidInputError` message from `EditChange` and "no changes made"; the CLI rejects unknown `--artifact-policy`/`--workflow-policy` locally (`_invalidation-flags.ts` parseArtifactPolicyFlag/parseWorkflowPolicyFlag via cliError) before calling Core (test CE:48 asserts execute not called). Exit code 1 and the offending value are printed; message text differs ("invalid --artifact-policy 'x'. valid values: ..."). Acceptable but not literally per spec; either adjust spec or let Core validate.
- LOW (spec text): verify scenario uses a flag `--invalidation-policy sugical` that does not exist in the command signature (`--artifact-policy`/`--workflow-policy`). Spec-only fix.
- INFO: edit.ts L102-120 defensive `'x' in result` guards are unnecessary given EditChangeResult always carries these fields.
- INFO: constraint "A discarded change cannot be edited" has no CLI/core test located.

---

## 5. core:approve-spec

File: packages/core/src/application/use-cases/approve-spec.ts

### Requirements Summary / Implementation Status

| Requirement                                                   | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gate guard                                                    | PASS    | gate check L80-82 first (no I/O), load L84-87, ResolveChangeSchema L89-93 before actor L95; resolution/identity-mismatch errors propagate.                                                                                                                                                                                                                                                                   |
| Change lookup                                                 | PASS    | L85-87.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Artifact hash computation                                     | PASS    | specApprovalFingerprint (scope-aware, excludes hasTasks) L101; blockingArtifact L105 fails on missing/pending/drifted/in-progress non-task artifacts L137-163. LOW note: spec says approval uses the reconciler's fresh projection; code calls the shared ValidityFingerprintService inside the reconcile mutation callback (same fresh state; spec Dependencies allow "shared fingerprint service") — INFO. |
| Approval recording and state transition                       | PASS    | eligibility from `boundFromStates('approval.spec')` L98 (no hardcoded names); never transitions; InvalidStateTransitionError(state,'ready') L114 (`to` informational); records valid projection+event via recordSpecApproval L109 with one actor L95; stale in implementing is recovered by reconciliation then fails closed.                                                                                |
| Canonical pre-approval reconciliation                         | PASS    | uses `_reconcile.mutate`; no independent staling/recovery in this file.                                                                                                                                                                                                                                                                                                                                      |
| Persistence and return value                                  | PASS    | single serialized mutation L96-111; ineligible -> InvalidStateTransitionError from reconciled state, not ReconciledOperationBlockedError L113-124; returns mutation.change L125.                                                                                                                                                                                                                             |
| Input contract                                                | PASS    | ApproveSpecInput {name, reason} L18-23, no gate state.                                                                                                                                                                                                                                                                                                                                                       |
| Approval gate baked at construction                           | PASS    | constructor L49-65.                                                                                                                                                                                                                                                                                                                                                                                          |
| Config-based factory delegates through resolveApproveSpecDeps | PASS    | composition/use-cases/approve-spec.spec.ts; barrel-kernel-coverage.spec.ts (title-level).                                                                                                                                                                                                                                                                                                                    |

### Scenarios (approve-spec.spec.ts = AS; approve-consent-audit.spec.ts = ACA; approve-audit-2.spec.ts = AA2)

- Gate disabled (no repo access) — AS:343.
- Change does not exist — AS:428.
- Task artifacts excluded from fingerprint — AS:295 (title-level) / validity-fingerprint-service spec.
- Missing required artifact blocks approval — AA2:248, AA2:267 (pending review).
- Approval snapshots canonical scope — AS:295 / validity-fingerprint-service.spec.ts (title-level).
- Approval renewed only in ready — AA2:155 (routes through designing, no pending state), AA2:183 (renews in ready).
- Successful renewal retains prior audit history — AS:161.
- Actor decorator authoritative / one identity — AS:118 (identical object reused), EC:685 analog.
- Eligible states come from the check bindings — ACA:100 (`boundFromStates('approval.spec')` equals ready, pending-spec-approval, spec-approved) + ACA:106 (designing/implementing/verifying/done rejected).
- Consent in a parking state never transitions — ACA:121 (spec-approved: recorded, state unchanged, no `transitioned` event) + AS:246-293 (pending-spec-approval).
- **Stale consent in a parking state is recovered before it is renewed — ACA:176** ("recovers a stale spec-approved change to designing, then fails the approval"). Verified: asserts InvalidStateTransitionError, message contains `designing`, persisted state `designing`, `specApproval.status === 'stale'`. This covers the scenario's two THEN clauses ("reconciler first commits the return to designing"; "request fails with InvalidStateTransitionError"). Gap (LOW): does not assert that the committed recovery is recorded as the reconciler's `transitioned` event with cause `spec-approval`, nor the follow-up (renewal succeeds after returning to ready) — the latter is AA2:183.
- Newly detected drift prevents approval — AS:192.
- Approval and reconciliation share one snapshot — AS:325 (via mutate) / AA2 (title-level).
- Ineligible approval commits only reconciliation — ACA:176 (persisted designing, no approval event) / AA2:155.
- Input fields name and reason only — type-level.
- Factory passes config.approvals / Enabled gate allows execute in pending-spec-approval / Sovereign schema resolution in gate guard — composition/use-cases/approve-spec.spec.ts; AS:246-293; AS:389/409.
- Both factories behaviourally equivalent / factory doesn't bootstrap kernel — composition/use-cases/approve-spec.spec.ts, barrel-kernel-coverage.spec.ts (title-level).

### Discrepancies

- INFO: fingerprint collection (L101) precedes blockingArtifact (L105), so an unreadable required artifact yields FingerprintInputError rather than InvalidStateTransitionError(incomplete-artifact); spec's "Missing required artifact blocks approval" accepts "fails without recording consent".
- No implementation discrepancy.

---

## 6. core:approve-signoff

File: packages/core/src/application/use-cases/approve-signoff.ts

### Requirements Summary / Implementation Status

| Requirement                            | Verdict | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate guard                             | PASS    | gate first; load; ResolveChangeSchema before actor (execute head).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Change lookup                          | PASS    | ChangeNotFoundError.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Artifact hash computation              | PASS    | `_refresh.execute` before reconciliation; `completeFingerprint(ctx.change)` whole-file implementation fingerprint (fingerprint service); empty map valid. Tests ACA:221-300.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Signoff recording and state transition | PASS    | `boundFromStates('approval.signoff')` eligibility; no transitions; verification required only when `isWorkflowStepEnabled('verifying', schema)` — disabled verifying ignores evidence and raises no verification errors; errors distinct: missing -> VerificationNotFoundError, active -> InProgress, stale/legacy-unknown -> VerificationStaleError(name) with `changeName` and host-neutral message (verification-stale-error.ts), mismatch -> VerificationFingerprintMismatchError. Stale consent recovered by reconciliation before evaluation (parking states included). |
| Canonical pre-signoff reconciliation   | PASS    | `_reconcile.mutate`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Persistence and return value           | PASS    | one serialized mutation; InvalidStateTransitionError(state,'done') for ineligible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Input contract / Gate baked / factory  | PASS    | as approve-spec.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Scenarios (approve-signoff.spec.ts = SO)

- Gate disabled — SO:463.
- Change does not exist — SO:531.
- Whole linked files define implementation evidence — ACA:247 (path once, lexical, whole file); unreadable fails — ACA:268.
- Empty observed implementation map valid — ACA:286.
- Signoff requires current completed verification (VerificationStaleError, only changeName) — SO:240 (asserts code, changeName, no `specd `/`--`//specd- in message).
- Valid signoff stays in done — SO:316.
- Verification evidence errors remain distinct — SO:223, 231, 240, 260, 285.
- Stale verification error carries no command and exposes changeName — SO:240.
- Actor decorator authoritative — SO:159.
- Signoff without verification when verifying disabled — SO:199, 211; plus ACA:194 and ACA:145.
- Eligible states come from bindings — ACA:139, ACA:145 (designing/implementing/verifying rejected).
- Consent in a parking state never transitions — ACA:159 (signed-off) + SO:368-415 (pending-signoff).
- **Stale consent in a parking state is recovered before it is renewed — ACA:194** ("recovers a stale signed-off change to done and records the renewed sign-off there"): asserts state `done`, signoff status valid, reason `renewed`, persisted state done. Full coverage of both THEN clauses. (Uses disabledVerifying schema, which keeps the scenario independent of verification evidence.) Gap (INFO): does not assert the reconciler's committed recovery event/cause.
- Reconciliation blocks signing a changed snapshot — AA2:303, AA2:324.
- Signoff fingerprint atomically current / Failed eligibility never signs — AA2:303/324, SO:316 (title-level).
- Input fields — type-level.
- Factory/Enabled gate in pending-signoff/sovereign schema — SO:368, SO:509; factory scenarios in composition tests (title-level).
- Composition reuses shared tracking and reconciliation / invalid mixed factory args — composition tests (title-level).

### Discrepancies

- None in implementation.
- INFO: the same-name-version advisory is surfaced through ResolveChangeSchema (not re-checked here).

---

## Cross-spec / dependency consistency

- approve-spec/approve-signoff eligible states derive from `boundFromStates` and match check-bindings (`approval.spec`: ready, pending-spec-approval, spec-approved; `approval.signoff`: done, pending-signoff, signed-off) — asserted by ACA:100/139.
- Stale-parking recovery targets (spec-approved -> designing; signed-off -> done) line up with RECOVERY_ONLY_TRANSITIONS in change-state.ts (spec-approval: parking -> designing; signoff: pending-signoff -> done and signed-off analog) — proven end-to-end by ACA:176/194.
- Topology drain exits agree with VALID_TRANSITIONS (change-state.ts:36-42), including `pending-signoff -> done`.
- EditChange `ready` behaviour (no automatic return, stale approval) is consistent with approve-spec text "consent is renewed in ready" and with CLI change-edit output requirement; core test EC:490 and CLI test CE:591 both present.

## Counts

- Requirements audited: workflow-topology 7, workflow-model 15, edit-change 19, cli:change-edit 6, approve-spec 9, approve-signoff 8 = 64; all PASS (no requirement-level FAIL).
- Verify scenarios: workflow-topology 36, workflow-model ~75, edit-change ~54, cli:change-edit 33, approve-spec 24, approve-signoff 26.
- Findings: HIGH 0; MEDIUM 0; LOW 5 [bypassed-[] assertion missing for ready->done; edit-change spec `invalidationPolicy` text vs structured `invalidation` (spec drift); edit-change dead `_isNoOp`; CLI rejects policy flags locally rather than surfacing Core InvalidInputError (and verify scenario names nonexistent `--invalidation-policy`); several partial/missing test assertions (specDependsOn non-overwrite, CLI remove-not-in-specIds, JSON recovery composite, approval-snapshot converse)]; INFO 6.
- Missing tests (all LOW): `listBypassedWorkflowSteps('ready','done')==[]` with implementing+verifying disabled; "Existing in-change dependency snapshot is not overwritten" (EditChange); CLI "Removing spec not in specIds" and workspace-derivation arithmetic (mock-kernel only); ungated-preserve refresh-without-validity explicit assertion; approval-snapshot positive path across all four topology queries; workflow-model "status display order" half of noncanonical-order scenario.
- Tests run: core 642/642 pass (27 files), cli 43/43 pass.
