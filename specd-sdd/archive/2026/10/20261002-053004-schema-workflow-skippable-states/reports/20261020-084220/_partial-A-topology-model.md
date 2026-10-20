# Batch A audit — topology and model (attempt 17, change-lite)

Read-only audit. Specs covered: core:workflow-topology, core:workflow-model, schema-std:standard-schema.

## core:workflow-topology

### Requirements Summary

Pure function module (six named exports): resolveWorkflowPipeline, isWorkflowStepEnabled, listWorkflowTransitions, isWorkflowTransitionLegal, listBypassedWorkflowSteps, nextWorkflowStep. Canonical pipeline order; forward connectivity; dynamic legal transitions (forward, shortcut across optional steps only, backward via VALID_TRANSITIONS, redesign, drain exits exact); bypassed steps; next step; step enablement and verification boundary.

### Implementation Status

- ✅ Six plain-function exports, no class; internal helpers not exported: packages/core/src/domain/services/workflow-topology.ts:147,161,180,225,246,269.
- ✅ Canonical order, disabled excluded, optional annotated, bedrock/ready-anchor throw SchemaValidationError: :32-99.
- ✅ Shortcut stops at first non-optional step: forwardTargets :110-134.
- ✅ Backward/redesign/recovery admitted only via VALID_TRANSITIONS; drain states return only filtered VALID_TRANSITIONS: :189-211; :191-193.
- ✅ Disabled source returns []: :185-187. Bypassed steps: :246-259. nextWorkflowStep drain handling and null for terminals: :274-295.
- ✅ isWorkflowStepEnabled: :161-170; bedrock always true.

### Discrepancies

- None HIGH/MEDIUM.

### Test Coverage

- packages/core/test/domain/services/workflow-topology.spec.ts (41 tests pass): pipeline excludes disabled/optional flags; noncanonical order normalized; bedrock disabled throws; done mandatory; ready anchor throws; shortcut across optional; disabled targets illegal; drain states never in pipeline; bypassed detection; next step terminal null; disabled verifying relaxes boundary; bedrock always enabled.
- Cross-file composite evidence: get-status.spec.ts, archive-change.spec.ts, reconcile-change-validity.spec.ts, approval-signoff.spec.ts.

### Missing Tests

- LOW: no single end-to-end test walking implementing -> done -> archivable -> archive; split across four files. Not a behavior gap.

### Summary

Requirements compliant; 0 HIGH, 0 MEDIUM, 1 LOW.

## core:workflow-model

### Requirements Summary

Step names reference lifecycle states; optional/disabled declarations with bedrock, ready-anchor, done-mandatory rules; checks/skipChecks declarations and governance locks; sovereign schema authority; requires/task-completion gating; availability via lifecycle verdict; canonical axis; hooks.

### Implementation Status

- ✅ Unknown step rejected; drain rows rejected; bedrock disabled/optional rejected; skipChecks on disabled step rejected: packages/core/src/domain/services/build-schema.ts:720-748.
- ✅ Omitted row -> workflowStep null / enabled: workflow-topology.ts:161-170.
- ✅ Ready anchor enforced at resolve and validate time: validate-schema.ts:83; resolve-schema.ts:124.
- ✅ Optional + no effective skip bindings unconditional; bindings via step-skip predicates (evaluate-transition-candidate).
- ✅ Sovereign schema through ResolveChangeSchema: application/services/resolve-change-schema.ts.
- ✅ Check governance errors (Unknown/Duplicate/Embedding/Override/Config/Disable): build-schema.ts ~860-980.

### Discrepancies

- None HIGH/MEDIUM.

### Summary

0 HIGH, 0 MEDIUM; LOW: no direct unit test that a skill consumes only availableTransitions.

## schema-std:standard-schema

### Requirements Summary

Delta: "Lifecycle Steps and State Transitions" rows designing/ready/implementing/verifying/archiving; no drain rows; optional/disabled flags; bedrock; done mandatory; signoff off skips check; hooks skipped when bypassed.

### Implementation Status

- ✅ packages/schema-std/schema.yaml:643-725 declares exactly five rows with explicit optional:false, disabled:false; no pending-\*/signed-off rows.
- ✅ done/archivable/drafting not rows (protocol-owned).
- ✅ Signoff-off behavior: approval-signoff check skips; done retained.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW. Weak: schema-std has no test dir; coverage lives in core (schema-std-load.spec.ts).
