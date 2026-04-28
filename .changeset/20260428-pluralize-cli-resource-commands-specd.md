---
'@specd/specd': patch
---

20260428 - pluralize-cli-resource-commands: Standardize CLI countable resource command groups to canonical plural forms (changes, specs, archives, drafts) while maintaining singular aliases for backward compatibility. This change includes a new governing policy spec (cli:cli/command-resource-naming), updates to affected CLI specs, and comprehensive updates to documentation and skill examples to ensure a consistent command vocabulary across the ecosystem.

Modified packages:

- @specd/cli
- @specd/skills

Specs affected:

- `cli:cli/change-draft`
- `cli:cli/drafts-list`
- `cli:cli/drafts-show`
- `cli:cli/drafts-restore`
- `cli:cli/command-resource-naming`
- `cli:cli/change-list`
- `cli:cli/spec-list`
- `cli:cli/change-archive`
- `skills:workflow-automation`
