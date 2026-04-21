---
'@specd/specd': patch
---

Add `Bash(specd *)` to frontmatter allowed-tools and add specd graph support.

- Add `Bash(specd *)` to all .opencode/skills SKILL.md frontmatter
- Use specd CLI commands for code analysis:
  - `specd spec list` and `specd spec show` for reading specs
  - `specd graph search`, `specd graph impact`, `specd graph stats` for code analysis
- Add guardrails to specd and specd-new skills preventing code writes
- Update single spec mode to use `workspace:path` format instead of `specs/` paths
