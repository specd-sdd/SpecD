# Tasks: remove-legacy-metadata-skill

## 1. Canonical skill sources

- [x] 1.1 Remove the obsolete standard skill template
      `packages/skills/templates/skills/specd-metadata/`: template directory — delete `SKILL.md.tpl` and `skill.meta.json` so template discovery cannot resolve `specd-metadata`
      Approach: remove the whole canonical directory; retain both specialized agent template directories unchanged.
      (Req: Template migration, Optimizer agents)
- [x] 1.2 Replace archive workflow guidance
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: post-archive optimization guidance — replace `/specd-spec-metadata` with `specd-spec-context-optimizer`
      Approach: preserve the existing optimization-enabled condition and direct the optimizer once per affected spec.
      (Req: Optimizer agents)
- [x] 1.3 Remove the legacy development skill
      `dev/ai-agents/skills/specd-spec-metadata/SKILL.md`: legacy skill definition — delete the obsolete orchestration workflow
      Approach: remove rather than rename; specialized agents are the exclusive optimization interface.
      (Req: Optimizer agents)
- [x] 1.4 Update legacy development archive guidance
      `dev/ai-agents/skills/specd-archive/SKILL.md`: metadata optimization recommendation — name `specd-spec-context-optimizer`
      Approach: match the canonical archive template wording so source and generated instructions agree.
      (Req: Optimizer agents)

## 2. Plugin bundle registrations

- [x] 2.1 Remove the Claude standard-skill registration
      `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: leave `agentFrontmatter` and all remaining standard skill records unchanged.
      (Req: Optimizer agents)
- [x] 2.2 Remove the Codex standard-skill registration
      `packages/plugin-agent-codex/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: leave `agentFrontmatter` and all remaining standard skill records unchanged.
      (Req: Optimizer agents)
- [x] 2.3 Remove the Copilot standard-skill registration
      `packages/plugin-agent-copilot/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: leave `agentFrontmatter` and all remaining standard skill records unchanged.
      (Req: Optimizer agents)
- [x] 2.4 Remove the OpenCode standard-skill registration
      `packages/plugin-agent-opencode/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: leave `agentFrontmatter` and all remaining standard skill records unchanged.
      (Req: Optimizer agents)
- [x] 2.5 Remove the Standard plugin standard-skill registration
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: retain the existing agent fallback metadata; do not change the plugin capability model.
      (Req: Optimizer agents)

## 3. Specification and verification contracts

- [x] 3.1 Update the template-source specification
      `specs/skills/skill-templates-source/spec.md`: `Requirement: Template migration` — remove `specd-metadata` from the canonical skills inventory and prohibit its template directory
      Approach: state that metadata optimization is exposed through specialized agent templates while preserving the skills/agents/shared tree contract.
      (Req: Template migration)
- [x] 3.2 Update template-source verification scenarios
      `specs/skills/skill-templates-source/verify.md`: `Requirement: Template migration` — add discovery coverage for the absence of `specd-metadata`
      Approach: retain current tree and shared-index scenarios, adding an explicit specialized-agent availability assertion.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 3.3 Update the optimizer-agent specification
      `specs/skills/agents/spec.md`: `Requirement: Optimizer agents` — establish that no standard `specd-metadata` skill is published
      Approach: preserve the two agent names, prompt policy, and fallback behavior; only remove the parallel standard interface.
      (Req: Optimizer agents)
- [x] 3.4 Update optimizer-agent verification
      `specs/skills/agents/verify.md`: `Scenario: Agent availability` — assert the two agents exist and the standard skill does not
      Approach: extend the existing scenario rather than creating a duplicate requirement path.
      (Req: Optimizer agents, scenario: Agent availability)

## 4. Rendered copies and regression coverage

- [x] 4.1 Regenerate installed skill copies
      `.agents/skills/` and `.codex/skills/`: rendered skill directories — run the repository skills synchronization workflow
      Approach: regenerate from canonical templates, then confirm `specd-metadata` directories are absent and archive/commit guidance has no legacy invocation. Note: `.agents/skills/specd-metadata/` is already absent (cleaned by a previous sync); only `.codex/skills/specd-metadata/` requires directory removal.
      (Req: Template migration, Optimizer agents)
- [x] 4.2 Update Claude installation expectations
      `packages/plugin-agent-claude/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: assert the standard skill is absent while agent availability follows the plugin's capabilities.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.3 Update Codex installation expectations
      `packages/plugin-agent-codex/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: assert the standard skill is absent while agent availability follows the plugin's capabilities.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.4 Update Copilot installation expectations
      `packages/plugin-agent-copilot/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: assert the standard skill is absent while agent availability follows the plugin's capabilities.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.5 Update OpenCode installation expectations
      `packages/plugin-agent-opencode/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: assert the standard skill is absent while agent availability follows the plugin's capabilities.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.6 Update Standard plugin installation expectations
      `packages/plugin-agent-standard/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: assert the standard skill is absent and preserve file-based agent fallback behavior.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.7 Run focused validation and active-reference checks
      `packages/skills`, all five plugin test suites, `.agents/skills/`, `.codex/skills/`, and `dev/ai-agents/skills/`: test and rendered outputs — prove the removed identifiers are absent
      Approach: run affected package tests and search active source/rendered skill instructions for `specd-metadata` and `specd-spec-metadata`. Exclude: `.specd/changes/*/` and `specd-sdd/changes/*/` (historical archives and this change's own artifacts), files named `.specd-metadata.yaml` (metadata sidecar mechanism), and `node_modules/`.
      (Req: Template migration, Optimizer agents)
