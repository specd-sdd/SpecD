---
'@specd/specd': patch
---

20260507 - update-skill-templates: Update specd-compliance, specd-verify, and specd-design skill templates. Compliance: add --change mode, dynamic report paths, remove hardcoded global refs. Verify: add optional audit step at completion. Design: simplify flow removing explicit schema loading.

Templates affected:

- `specd-compliance`: add `--change` mode, dynamic report paths via config, remove hardcoded `specs/_global/` references, use `specd changes spec-preview` for delta-aware spec content
- `specd-verify`: add optional compliance audit step at end of verification
- `specd-design`: simplify flow by removing explicit schema loading, rely on `changes status` and `artifact-instruction` for DAG and task metadata

Modified packages:

- @specd/skills

Specs affected:

- `skills:skill-templates-source`
