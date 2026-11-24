# Batch C audit — lifecycle and resolution (attempt 17, change-lite)

Read-only audit. Specs covered: core:lifecycle-engine, core:resolve-change-schema, core:build-schema, core:lifecycle-verdict, core:validate-artifacts, core:run-step-hooks, core:compile-context, core:get-status, core:archive-change, core:approve-spec, core:approve-signoff, core:change-manifest, core:fs-change-repository, core:preview-spec, core:get-artifact-instruction, core:get-hook-instructions, core:edit-change, core:invalidate-change, core:count-tasks, core:change, core:generate-metadata, core:materialize-spec-metadata.

### Requirements Summary

Sovereign change schema authority (manifest.schema immutable); requires-based gating (workflow.requires check); task-completion gating (workflow.taskCompletion subset of requires); lifecycle verdict availability; archive atomic finalization (delta merge, spec sync, metadata generation, archive move); approve-spec/approve-signoff consent recording; change lifecycle states; step-skip predicates evaluated via evaluate-transition-candidate.

### Implementation Status

- ✅ resolve-change-schema: sovereign schema, SchemaProviderIdentityMismatchError propagated.
- ✅ build-schema: maps optional/disabled/requires/requiresTaskCompletion to domain WorkflowStep; validation rules enforced at build time.
- ✅ evaluate-transition-candidate: step-skip predicate evaluation for optional bypassed steps.
- ✅ lifecycle-verdict / lifecycle-evaluation / lifecycle-guidance: availability and next-action derived from check evaluation, not parallel if-ladders.
- ✅ archive-change: atomic finalization; delta merge, spec sync, metadata generation, archive move.
- ✅ approve-spec / approve-signoff: consent recording on ready/done; drain states not used as transition targets.
- ✅ transition-checks: check registry drives allowed/availableTransitions/nextAction projections.

### Discrepancies

- None HIGH/MEDIUM.

### Missing Tests

- LOW: end-to-end archive flow split across multiple files (get-status, archive-change, reconcile-change-validity, approval-signoff). Not a behavior gap.

### Summary

0 HIGH, 0 MEDIUM, 1 LOW.
