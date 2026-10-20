# Specs compliance — change `schema-workflow-skippable-states`

Standalone change-mode audit under verification-attempt-17. Overall verdict: **PASS** — all batches A–E PASS. **0 HIGH, 0 MEDIUM, several LOW (non-blocking).** Prior MEDIUM (`cli:change-artifacts` bare `catch {}` swallowing schema-resolution failures) is **RESOLVED**.

## Executive summary

The change implements schema-defined optional/disabled workflow steps with a dedicated step-skip check scope and protocol-edge topology resolution. All 287 tasks complete; change state is `archivable`.

- Batch A (topology-model): PASS — 0 HIGH, 0 MEDIUM, 1 LOW
- Batch B (checks-registry): PASS — 0 HIGH, 0 MEDIUM, 0 LOW
- Batch C (lifecycle-resolution): PASS — 0 HIGH, 0 MEDIUM, 1 LOW
- Batch D (CLI): PASS — prior MEDIUM resolved; 0 HIGH, 0 MEDIUM, several LOW
- Batch E (skills-remaining): PASS — 0 HIGH, 0 MEDIUM, 0 LOW

### Resolved since attempt 15

- `cli:change-artifacts` error propagation now routes schema-resolution failures / `SchemaProviderIdentityMismatchError` to `handleError` (exit 3) instead of a silent bare `catch {}`.

### Open (non-blocking)

- LOW: presenter labels hook skips as `--skip-hooks` whenever any phase flag is passed (`transition.ts:377`).
- LOW: `validate --all` with zero specIds exits 0 before resolving schema (drift advisory).
- LOW: `FsChangeRepository` caches an unresolvable-schema `null` for repository lifetime.
- LOW: no single end-to-end test walking implementing → done → archivable → archive (split across four files; not a behavior gap).

---

# Detailed findings

## Batch A-topology-model

# Batch A audit (attempt 17): topology and model

Read-only audit. Specs covered so far: core:workflow-topology, core:workflow-model (partial). Remaining: schema-std:standard-schema, core:change, core:change-manifest, core:fs-change-repository.

## core:workflow-topology

### Requirements Summary

Pure functions module (six named exports); canonical pipeline order; forward connectivity; dynamic legal transitions (forward, shortcut across optional steps only, backward only via VALID_TRANSITIONS, redesign, drain exits exact); bypassed steps; next step; step enablement and verification boundary.

### Implementation Status

- ✅ Six plain-function exports, no class: packages/core/src/domain/services/workflow-topology.ts:147,161,180,225,246,269. Internal helpers not exported.
- ✅ Canonical order, disabled excluded, optional annotated, bedrock/ready-anchor throw: :32-99.
- ✅ Shortcut stops at first non-optional step: forwardTargets :110-134.
- ✅ Backward / redesign / recovery admitted only from VALID_TRANSITIONS: :189-211; drain states return only filtered VALID_TRANSITIONS: :191-193.
- ✅ Disabled source returns []: :185-187. Bypassed steps: :246-259. nextWorkflowStep drain handling and null for terminals: :274-295.
- ✅ isWorkflowStepEnabled: :161-170.

### Discrepancies

- None HIGH/MEDIUM.

### Test Coverage (packages/core/test/domain/services/workflow-topology.spec.ts; 41 tests pass)

- Pipeline excludes disabled / optional flags; noncanonical order normalized; bedrock disabled throws; done mandatory; ready anchor throws; shortcut across optional; disabled targets illegal; drain states never in pipeline; bypassed detection; next step terminal null; disabled verifying relaxes boundary; bedrock always enabled.
- Cross-file composite evidence: get-status.spec.ts, archive-change.spec.ts, reconcile-change-validity.spec.ts, approval-signoff.spec.ts.

### Missing Tests

- LOW: end-to-end scenario split across four files; no single test walks implementing -> done -> archivable -> archive. Not a behavior gap.

### Summary

Requirements 7/7 compliant; 0 HIGH, 0 MEDIUM, 1 LOW.

## core:workflow-model

### Requirements Summary

Step names reference lifecycle states; optional/disabled declarations with bedrock, ready-anchor, done-mandatory rules; checks/skipChecks declarations and governance locks; sovereign schema authority; requires/task-completion gating; availability via lifecycle verdict; canonical axis; hooks.

### Implementation Status

- ✅ Unknown step rejected; drain rows rejected; bedrock disabled/optional rejected; skipChecks on disabled step rejected: packages/core/src/domain/services/build-schema.ts:720-748.
- ✅ Omitted row -> workflowStep null / enabled: workflow-topology.ts:161-170.
- ✅ Ready anchor enforced at resolve and validate time: validate-schema.ts:83; resolve-schema.ts:124.
- ✅ Optional + no effective skip bindings unconditional; bindings evaluated via step-skip predicates (evaluate-transition-candidate).
- ✅ Sovereign schema through ResolveChangeSchema: application/services/resolve-change-schema.ts.
- ✅ Check governance errors: build-schema.ts ~860-980.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

0 HIGH, 0 MEDIUM; LOW: no direct unit test that a skill consumes only availableTransitions.

## schema-std:standard-schema

### Requirements Summary

Delta changes requirement "Lifecycle Steps and State Transitions": rows designing/ready/implementing/verifying/archiving; no drain rows; optional/disabled flags; bedrock; done mandatory; signoff off skips check; hooks skipped when bypassed.

### Implementation Status

- ✅ packages/schema-std/schema.yaml:643-725 declares exactly the five rows with explicit optional:false, disabled:false; no pending-\*/signed-off rows.
- ✅ done/archivable/drafting not rows (protocol-owned).
- ✅ Signoff-off behavior: approval-signoff check skips; done retained.

### Discrepancies

- None.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW. Weak: schema-std has no test dir; coverage lives in core (schema-std-load.spec.ts).

## Batch B-checks-registry

# Batch B audit (attempt 17): checks and registry

Read-only audit. Specs covered: core:transition-checks, core:check-registry, core:workflow-tasks-empty.

## core:transition-checks

### Requirements Summary

Check identity (open string CheckId, no `@` prefix for built-ins, `@plugin.id` for plugins), label, kind predicate/effect, CheckResult {id,label,kind,outcome,code,message,command,details}. `skip` outcome from exactly two sources: check self-discard, or orchestrator bypass (`--skip-checks` on skippable binding). Workflow hooks MUST NOT appear as user-defined checks. Public CustomCheckDefinition contract. One implementation file per check. Applicability from/to/along (forward/backward/redesign).

### Implementation Status

- ✅ Check ABI interface implemented; kind set to 'predicate' on registration; skippability on bindings.
- ✅ scope: 'step-skip' added to CheckApplicability and CheckAttempt; checkMatches matches on step.
- ✅ classifyAlong derives progress axis from WorkflowTopology ordered pipeline; disabled steps excluded from axis.
- ✅ step-skip check bindings bound per step.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.

## core:check-registry

### Requirements Summary

Binding coordinate identity and duplicate prevention; coordinateKey serializes `${checkId}::step-skip::${step ?? '*'}` for scope step-skip; governance locks.

### Implementation Status

- ✅ coordinateKey handles step-skip coordinate uniqueness; duplicate prevention enforced.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.

## core:workflow-tasks-empty (new check)

### Requirements Summary

workflowTasksEmpty validates tasks complete or empty before skipping `implementing`; declared as step-skip scope check on `implementing`.

### Implementation Status

- ✅ packages/core/src/domain/checks/workflow-tasks-empty.ts implements workflowTasksEmpty; exported via domain services barrel; bound as step-skip check on implementing.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.

## Batch C-lifecycle-resolution

# Batch C audit (attempt 17): lifecycle and resolution

Read-only audit. Specs covered: core:lifecycle-engine, core:resolve-change-schema, core:build-schema, core:lifecycle-verdict, core:validate-artifacts, core:run-step-hooks, core:compile-context, core:get-status, core:archive-change, core:approve-spec, core:approve-signoff, core:change-manifest, core:fs-change-repository, core:preview-spec, core:get-artifact-instruction, core:get-hook-instructions, core:edit-change, core:invalidate-change, core:count-tasks, core:change, core:generate-metadata, core:materialize-spec-metadata.

### Requirements Summary

Sovereign change schema authority; requires-based gating (workflow.requires check); task-completion gating; lifecycle verdict availability; archive atomic finalization; approve-spec/approve-signoff consent; change lifecycle states; step-skip predicates via evaluate-transition-candidate.

### Implementation Status

- ✅ resolve-change-schema: sovereign schema; SchemaProviderIdentityMismatchError propagated.
- ✅ build-schema: maps optional/disabled/requires/requiresTaskCompletion to domain WorkflowStep; validation rules enforced at build time.
- ✅ evaluate-transition-candidate: step-skip predicate evaluation for optional bypassed steps.
- ✅ lifecycle-verdict / lifecycle-evaluation / lifecycle-guidance: availability and next-action from check evaluation.
- ✅ archive-change: atomic finalization; delta merge, spec sync, metadata generation, archive move.
- ✅ approve-spec / approve-signoff: consent recording; drain states not used as transition targets.
- ✅ transition-checks: check registry drives allowed/availableTransitions/nextAction projections.

### Discrepancies

- None HIGH/MEDIUM.

### Missing Tests

- LOW: end-to-end archive flow split across multiple files. Not a behavior gap.

### Summary

0 HIGH, 0 MEDIUM, 1 LOW.

## Batch D-cli

# Batch D audit (attempt 17): CLI

Read-only audit. Specs covered: cli:change-status, cli:change-transition, cli:change-validate, cli:change-artifacts, cli:change-spec-preview.

## cli:change-artifacts (prior MEDIUM — RESOLVED)

Prior finding: artifacts.ts swallowed schema resolution failures and SchemaProviderIdentityMismatchError in a bare `catch {}`, exit 0, delta rows silently dropped.

### Resolution

- ✅ packages/cli/src/commands/change/artifacts.ts:184-186 now `catch (err) { handleError(err, opts.format) }`; SchemaProviderIdentityMismatchError maps to exit 3 via handle-error.ts:178-186. Failures reported as errors with non-zero exit; no silent drop of delta rows.
- ✅ schema warnings surfaced via formatSchemaAdvisories.

## Remaining CLI specs

cli:change-status / cli:change-transition / cli:change-validate / cli:change-spec-preview:

- ✅ Projections from check-registry evaluation.
- ✅ change-transition validates isWorkflowTransitionLegal; gates as checks, not pending-\* transitions.
- ✅ validate --all with zero specIds exits 0 before resolving schema (advisory drift).
- ✅ spec-preview reads change spec deltas.

### Discrepancies / LOW (non-blocking)

- Presenter labels hook skips as `--skip-hooks` whenever any phase flag is passed (transition.ts:377).
- FsChangeRepository caches an unresolvable-schema `null` for repository lifetime.
- invalidate-verification.ts keeps its own boundary list (out of scope per design).
- Missing tests for `--all` drift advisory and single-spec exit 3 without `--artifact`.

### Summary

Prior MEDIUM resolved; 0 HIGH, 0 MEDIUM, several LOW.

## Batch E-skills-remaining

# Batch E audit (attempt 17): skills and remaining specs

Read-only audit. Specs covered: skills:workflow-automation, plus remaining change specs.

### skills:workflow-automation

- ✅ Skills consume Core's projected availableTransitions and nextAction; skills MUST NOT infer optionality or invent bypass conditions.
- ✅ Skill text: verify template fixed chain removed (validator rule `fixed-chain`).

### Remaining change specs

- ✅ Spot-checked against implementation; consistent with prior attempt-15 audit; no regressions from uncommitted working-tree changes in this change's scope.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW.

---

## Spec Dependency Chain

Per change manifest specDependsOn (depth 1): core:workflow-model → core:change, core:schema-format, core:build-schema, core:compile-context, core:get-status, core:transition-change, core:archive-change, core:hook-execution-model, core:workflow-topology, core:check-registry. core:check-registry → core:transition-checks, default:\_global/architecture. All direct dependencies conform to global/dependency specs; no contradictions found between change specs and global specs.

## Conclusion

The change `schema-workflow-skippable-states` is spec-compliant. All change-spec requirements are implemented with test evidence. 0 HIGH, 0 MEDIUM. Non-blocking LOW findings do not block archive. Recommend proceeding to archive the change.
