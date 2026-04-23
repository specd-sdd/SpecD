---
    "@specd/cli": patch
    "@specd/skills": patch
---
20260423 - project-status-command: Add specd project status command consolidating workspace info, spec/change counts, graph freshness, and context references into one output. Enhance change status with schema-derived artifactDag and approval gates. Update skill templates to use the new command.

Specs affected:
- `cli:cli/project-status`
- `cli:cli/change-status`

