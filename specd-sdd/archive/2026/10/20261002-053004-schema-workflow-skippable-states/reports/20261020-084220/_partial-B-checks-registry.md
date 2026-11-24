# Batch B audit — checks and registry (attempt 17, change-lite)

Read-only audit. Specs covered: core:transition-checks, core:check-registry, core:workflow-tasks-empty.

## core:transition-checks

### Requirements Summary

Check identity (open string CheckId, no `@` prefix for built-ins, `@plugin.id` for plugins), label, kind predicate/effect, CheckResult {id,label,kind,outcome,code,message,command,details}. `skip` outcome from exactly two sources: check self-discard, or orchestrator bypass (`--skip-checks` on skippable binding). Workflow hooks MUST NOT appear as user-defined checks. Public CustomCheckDefinition contract (no `kind`, no skippable). One implementation file per check. Applicability from/to/along (forward/backward/redesign).

### Implementation Status

- ✅ Check ABI interface implemented; kind set to 'predicate' on registration; skippability on bindings.
- ✅ scope: 'step-skip' added to CheckApplicability and CheckAttempt; checkMatches matches on step.
- ✅ classifyAlong derives progress axis from WorkflowTopology.orderedPipeline (resolveWorkflowPipeline); disabled steps excluded from axis.
- ✅ step-skip check bindings bound per step.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.

## core:check-registry

### Requirements Summary

Binding coordinate identity and duplicate prevention; coordinateKey serializes `${checkId}::step-skip::${step ?? '*'}` for scope step-skip; governance locks (placement, policy, parameter, disablement).

### Implementation Status

- ✅ coordinateKey handles step-skip coordinate uniqueness; duplicate prevention enforced.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.

## core:workflow-tasks-empty (new check)

### Requirements Summary

workflowTasksEmpty validates that tasks are complete or empty before skipping `implementing`; declared as a step-skip scope check on the `implementing` step.

### Implementation Status

- ✅ packages/core/src/domain/checks/workflow-tasks-empty.ts implements workflowTasksEmpty; exported via domain services barrel; bound as step-skip check on implementing.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 0 LOW.
