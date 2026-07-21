---
    "@specd/cli": minor
    "@specd/core": minor
    "@specd/skills": patch
---

20260715 - show-spec-diff-during-validate: This change makes successful single-artifact spec validation show the merged inline diff directly when the target is an existing delta-backed scope: spec artifact, so reviewers can inspect risky removals or contract breakage without leaving changes validate. It also introduces a dedicated DiffGenerationError path in core preview/diff generation, keeps --all unchanged, and updates skill guidance so agents treat the inline diff as the immediate review surface while preserving spec-preview as the fallback and broader merged-review tool.

Specs affected:

- `cli:change-validate`
- `cli:change-spec-preview`
- `core:preview-spec`
- `core:validate-artifacts`
- `skills:workflow-automation`
- `core:diff-generator`
