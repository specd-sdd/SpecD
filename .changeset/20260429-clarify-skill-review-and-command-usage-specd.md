---
'@specd/specd': patch
---

20260429 - clarify-skill-review-and-command-usage: Align workflow-skill guidance and CLI-facing contracts with the current canonical commands and artifact-focused flags so agents can avoid redundant reads while preserving deterministic safety checks. Clarify that changes validate is structural/state validation only and must not be used as semantic content approval, with explicit review expectations in skills and docs. Reinforce overlap/drift protection by requiring merged-content review patterns (including artifact-filtered preview when targeted) before archiving or accepting spec deltas.

Modified packages:

- @specd/skills
- @specd/cli

Specs affected:

- `skills:workflow-automation`
- `cli:change-validate`
- `cli:change-spec-preview`
- `cli:command-resource-naming`
