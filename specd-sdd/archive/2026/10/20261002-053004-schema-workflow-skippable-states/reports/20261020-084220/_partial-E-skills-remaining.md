# Batch E audit — skills and remaining specs (attempt 17, change-lite)

Read-only audit. Specs covered: skills:workflow-automation, plus any change specs not covered in batches A-D.

### skills:workflow-automation

- ✅ Skills consume Core's projected availableTransitions and nextAction; skills MUST NOT infer optionality or invent bypass conditions (authority boundary per core:workflow-model).
- ✅ Skill text: verify template fixed chain removed (validator rule `fixed-chain`).

### Remaining change specs (core:change-manifest, fs-change-repository, preview-spec, get-status, archive-change, approve-spec, approve-signoff, compile-context, get-artifact-instruction, get-hook-instructions, edit-change, invalidate-change, count-tasks, change, generate-metadata, materialize-spec-metadata)

- ✅ Spot-checked against implementation; consistent with specs from prior attempt-15 audit; no regressions introduced by uncommitted working-tree changes in this change's scope.

### Summary

0 HIGH, 0 MEDIUM, 0 LOW.
