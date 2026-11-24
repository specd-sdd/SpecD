# Partial batch A2 (round 9, verification-attempt-11)

Specs: core:workflow-topology, core:workflow-model, core:edit-change, cli:change-edit, core:approve-spec, core:approve-signoff.
Method: merged spec+verify previews read in full (workflow-model read fully, every requirement traced to code), code read, tests run. Read-only.

## Round-8 items re-verified

- Policy naming: `grep -i "invalidationPolicy|invalidation-policy"` over the merged previews of all six specs (spec.md + verify.md): ZERO hits. edit-change uses `invalidation: { artifacts?, workflow? }`; cli:change-edit uses `--artifact-policy` / `--workflow-policy`. Code agrees (`EditChangeInput.invalidation`, `_invalidation-flags.ts`, `edit.ts`). The only `invalidationPolicy` occurrences in code are the `Change.invalidationPolicy` entity property (not spec-visible) and `_validity-present.ts` reading it. OK.
- EditChange dead-code removal (`git diff HEAD`): `_isNoOp` had NO callers at HEAD (only its definition matched `_isNoOp`), and the post-mutate `persisted.invalidated` branch (unscaffold/scaffold/refresh) was unreachable because the description/policy-only mutate always returned `invalidated: false`. Removal is behavior-neutral; the scope path (`_executeScopeEdit`) owns unscaffold/scaffold/refresh and is untouched. Also the `command` -> `intent` change in `editNextAction` is consistent with CLI `projectCliNextAction`. OK.
- New tests present and passing: workflow-topology `honors the supplied approval snapshot ...` (converse snapshot: ready disabled + spec gate off, all four functions derive same pipeline; gated snapshot throws), `identifies intermediate active steps...` / `excludes disabled intermediate steps` (listBypassedWorkflowSteps), edit-change `existing specDependsOn snapshot` (non-overwrite), lifecycle-verdict `workflow rows declared out of canonical order` (availableSteps canonical order). All assert what the spec says.

## core:workflow-topology

Requirements Summary: 7 requirements (pure function module; ordered pipeline; forward connectivity; dynamic legal transitions; bypassed steps; forward progression; step enablement + verification boundary).
Implementation Status: all implemented in packages/core/src/domain/services/workflow-topology.ts. Verified: exports are exactly the 8 functions (test asserts via Object.keys); canonical order independent of row order; bedrock/anchor throws; drain states via VALID_TRANSITIONS only (no anchor mapping for exits; `nextWorkflowStep` uses first non-designing legal exit for all four drain states, no per-state special-casing); `designing -> designing` admitted as redesign; backward requires table edge AND earlier pipeline position; forward targets stop at first non-optional step; archivable only from done / archiving only from archivable. Verification-boundary consumers all call `isWorkflowStepEnabled('verifying')`: reconcile-change-validity:293, invalidate-verification:144, approve-signoff:111, lifecycle-guidance:89, lifecycle-verdict:912; archive/verification.current verified via archive-change.spec "archives without any verification evidence when verifying is disabled" and get-status "real reconciler" spec.
Discrepancies: none.
Test coverage: every verify scenario has a test (workflow-topology.spec.ts, workflow-topology-audit.spec.ts, get-status.spec.ts:1665 for the end-to-end disabled-verifying scenario, archive-change.spec.ts:393).
Missing tests: none material.

## core:workflow-model (full independent pass)

Requirements Summary: 13 requirements (step names -> states; step semantics; optional/disabled; checks/skipChecks/archiveChecks; sovereign schema; requires gating; task-completion gating; step check declarations; step availability; array order; step-to-state; hooks; two execution modes; requires = artifact ids).
Implementation Status (traced):

- Unknown step / drain-state row -> SchemaValidationError: build-schema.ts:836-846 (valid states from VALID_TRANSITIONS keys + `isDrainState`). OK.
- Omitted row -> `workflowStep(state)` null, state stays enabled: topology defaults + lifecycle-verdict `workflowStep===null` skip. OK.
- Bedrock optional/disabled, skipChecks on disabled, archiveChecks only on `archiving`, unknown check, duplicate coordinate, governance locks: build-schema.ts:840-930+. OK.
- Approval anchor at build/resolve time incl. `schema validate`: validate-schema.ts:83 and resolve-schema.ts:124 call `resolveWorkflowPipeline(schema, approvals)`; test validate-schema-approval-anchor.spec.ts covers three modes. OK.
- `requires`/`requiresTaskCompletion` must be declared artifact ids and subset: build-schema.ts:1033-1060. OK.
- workflow.requires (domain/checks/workflow-requires.ts): pass only for complete/skipped; blocking codes per status; shared by status and TransitionChange via the same check. OK.
- workflow.taskCompletion composes CountTasks (`createWorkflowTaskCompletion`); missing file / invalid regex => non-matching (CountTasks `safeRegex`, `loaded===null` skip); details carry incomplete/complete/total. OK.
- Along classification from canonical pipeline (`classifyAlong`, transition-checks.ts:~215-262): redesign/recovery/forward/backward, disabled steps excluded. OK.
- Hooks: bindings hook.pre (`to=step`, along `*`, before-persist), hook.post (forward only, before-persist), archive hooks pre before-persist / post after-persist; skipHookPhases honoured. OK.
  Discrepancies (all LOW, no behavior bug):

1. Spec wording "compile incompletePattern using safeRegex with the 'm' flag"; CountTasks uses `'gm'` (g needed for counting). Wording only.
2. Spec: each `requiresTaskCompletion` artifact "MUST declare taskCompletionCheck"; buildSchema enforces `hasTasks: true` (taskCompletionCheck is defaulted for hasTasks types, build-schema.ts:526-542). Equivalent in practice; wording only.
3. Spec: pre-hook matches `along = any`; binding has `exceptAlong: ['recovery']` (check-bindings.ts:157). Defined by core:transition-checks; no conflict, but workflow-model wording is looser.
4. `workflow.taskCompletion` also runs at `scope: 'archive'` iterating every step with requiresTaskCompletion (application/checks/workflow-task-completion.ts:60-80). Not mentioned in workflow-model (belongs to archive-change/transition-checks); flagged only for awareness.
5. Nit (unverified impact): build-schema.ts `chk.from in VALID_TRANSITIONS` uses `in` (prototype keys like `constructor` pass). Likely pre-filtered by schema-format parsing; not reproduced.
   Test coverage: all verify scenarios mapped to existing tests (build-schema specs, transition-checks specs, lifecycle-verdict.spec, validate-schema-approval-anchor.spec, transition-change specs for hooks).
   Missing tests: none identified.

## core:edit-change

Requirements Summary: 21 requirements (input contract with `invalidation`; spec-id validation; readOnly rejection; invalidation policy edits; lookup; no-ops; description; removal-before-add; absent removal; host-neutral error; idempotent add; specDependsOn seeding; scope reconciliation; unscaffold; refresh; output contract; dependencies; factory; schema compat; sovereign schema).
Implementation Status: implemented in application/use-cases/edit-change.ts + composition/use-cases/edit-change.ts. Flow verified: policy validated before any mutation (`assertInvalidationPolicyOverride`), IDs parsed/normalized then readOnly check, removals normalized + de-duplicated and unvalidated, `SpecNotInChangeError` inside the serialized mutate, `replaceSpecIds` + `ctx.reconcileAfter`, unscaffold after persist, refresh keyed on `scopeChanged` only, actor resolved only when an edit is applicable, non-overwrite of existing `specDependsOn` (`freshChange.specDependsOn.get(id) !== undefined -> continue`).
Discrepancies:

1. MEDIUM (pre-existing, spec/impl drift, not introduced this round): spec "Seed specDependsOn" says seeding uses `readPersistedDependsOn(spec)` then falls back to canonical `metadata.json.dependsOn` (even stale), then `[]`. Code (`_shared/load-persisted-spec-depends-on.ts`) uses only `repo.readPersistedState` (spec-lock.json) then `[]`; there is NO metadata.json fallback and `readPersistedDependsOn` no longer exists (core:spec-repository-port verify.md line 44 says it is removed). Verify scenarios "Legacy metadata seeds when persisted semantic state is absent" and "Stale metadata still seeds as legacy fallback" are therefore unsatisfied/untestable as written. The same text sits in core:create-change. Recommend fixing spec text (or restoring fallback) in this change or a follow-up.
2. LOW: test `seeds newly added specs from stale metadata when persisted dependencies are absent` (edit-change.spec.ts:223) is mislabeled; its fixture contains only `spec-lock.json` with dependsOn (persisted state PRESENT), no metadata.json. It does not exercise a metadata fallback.
3. LOW: spec "Config-based factory ... resolveEditChangeDeps MUST resolve" lists 5 deps; code also resolves `resolveChangeSchema` and `reconcile` (required by spec's Dependencies section, so spec list is just incomplete). No direct test for `resolveEditChangeDeps` / deps-vs-config equivalence for EditChange (ApproveSpec has one in composition/use-cases/invalidate-change.spec.ts; EditChange only has mandatory-validity-reconciler.spec.ts).
4. LOW: `reconcile` is optional in the constructor signature but throws `InvalidCompositionFactoryArgumentsError` when absent (type/runtime mismatch, harmless).
5. NIT: `--description ""` on a change with `description === undefined` is treated as a change (`'' !== undefined`) and persists a description-updated event; spec silent.
   Test coverage: edit-change.spec.ts covers lookup, no-ops, policy validation (before mutation, with valid edits), idempotent add, seeding (persisted-first, non-overwrite), removal order/absent/duplicate/bare-id, readOnly (one line per offender, atomic), reconciled scope edit (designing return, ready keeps ready, reorder not stale, atomic on reconcile failure), schema compat/sovereign resolution, actor once, unscaffold.
   Missing tests: metadata.json legacy fallback (see 1); resolveEditChangeDeps equivalence.

## cli:change-edit

Requirements Summary: 6 requirements (command signature with `--artifact-policy`/`--workflow-policy`; workspace derivation; readOnly; approval invalidation reporting; output on success; error cases).
Implementation Status: commands/change/edit.ts. Usage error (no edit flag) before config resolution; raw values forwarded; partial policy maps only supplied dimension (`resolveInvalidationOverride`); warning only when projectionChanges or automaticReturn present; text renders blockers, Core next action (command projected from `intent` via guidance-presenter), effective policy, projection changes, automatic return; json/toon include `scopeChanged`, `validityChanged`, `invalidated`, `state`, blockers, nextAction, policy, projections, automaticReturn.
Discrepancies:

1. LOW: spec says invalid policy flag "prints the InvalidInputError message"; CLI rejects locally with its own message `invalid --artifact-policy 'x'. valid values: ...` (still exit 1, prints value + allowed values, matches the scenario text). Core-level InvalidInputError is not reachable via the CLI path.
2. LOW: `--help` JSON schema block lists only `{result,name,specIds,workspaces,invalidated,state}`; real output adds scopeChanged/validityChanged/blockers/nextAction/etc. (spec's own base shape, so not a violation).
3. NIT: policy flag parsing happens before the try/catch block; fine because cliError exits.
   Test coverage: change-edit.spec.ts (58 CLI tests in the set, all pass) covers unknown policy, no flags, raw forwarding, comma ID, usage-before-config, source-purity, readOnly/unknown ws mapping, no-warning-on-scope-only, blockers/next-action text, ready-with-stale-approval in text+json, projection/automatic-return json, toon, partial workflow dimension.
   Missing tests: none material (scenarios are covered with mocked core; no CLI-through-real-core test for the gated recovery).

## core:approve-spec

Requirements Summary: 9 requirements (gate guard; lookup; fingerprint; recording w/ binding-derived eligible states, never transitions; canonical reconciliation; persistence; input contract; baked gates; factory).
Implementation Status: application/use-cases/approve-spec.ts. Gate check first, then get, ResolveChangeSchema (provider mismatch propagates before actor), actor once, single `reconcile.mutate`; eligibility via `boundFromStates('approval.spec')`; `InvalidStateTransitionError(state, 'ready')` (+ `incomplete-artifact` reason) thrown after the mutation so reconciliation persists; task artifacts excluded from blocking; `recordSpecApproval` with scope-aware fingerprint, no transition.
Discrepancies: none.
Test coverage: approve-spec.spec.ts, approve-audit-2.spec.ts, approve-consent-audit.spec.ts (bindings-derived states, parking-state consent without transition, stale parking recovery), privacy-decorated-identity.spec.ts + composition/use-cases/invalidate-change.spec.ts (factory forms).
Missing tests: none.

## core:approve-signoff

Requirements Summary: 9 requirements (same shape plus verification eligibility errors and whole-file implementation fingerprint).
Implementation Status: application/use-cases/approve-signoff.ts. Verified: verifying-disabled path ignores evidence; distinct NotFound / InProgress / Stale (legacy-unknown => stale) / FingerprintMismatch; `VerificationStaleError` message is host-neutral (`renew verification before sign-off`, no `specd`/`--`//specd-) and exposes `changeName`; refresh before mutation; stale sign-off beyond done recovered to `done` by reconciler; parking states never transitioned.
Discrepancies: none.
Test coverage: approve-signoff.spec.ts (incl. disabled verifying, error taxonomy, message regex + changeName), approve-consent-audit.spec.ts (whole-file hash, empty map, unreadable file, parking states), approve-audit-2.spec.ts (renewal only in done, reconciliation blocks).
Missing tests: none.

## Test runs

- Targeted core (domain/services, domain/checks, edit-change, approve-spec, approve-signoff, approve-audit-2, approve-consent-audit, validate-schema-approval-anchor): 218 suites, 838 tests, 838 passed, 0 failed.
- Targeted cli (change-edit.spec, change/approve.spec, change/approve-failure.spec): 12 suites, 58 tests, 58 passed, 0 failed.
- Full core run: see addendum below.

## Counts

New problems introduced in round 9: 0 (no regression found in the dead-code removal, topology changes, or new tests).
Discrepancies: 1 MEDIUM (pre-existing: edit-change metadata.json fallback), 11 LOW/NIT (wording drift, mislabeled test, missing factory test, CLI message source).
Specs with zero discrepancies: workflow-topology, approve-spec, approve-signoff.

## Addendum: full core run

Full @specd/core vitest: 1272 suites, 4053 tests, 4051 passed, 0 failed (2 skipped/todo).
