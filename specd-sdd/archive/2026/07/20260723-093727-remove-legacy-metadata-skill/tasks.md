# Tasks: remove-legacy-metadata-skill

## 1. Canonical skill sources

- [x] 1.1 Remove the obsolete standard skill template
      `packages/skills/templates/skills/specd-metadata/`: template directory — delete `SKILL.md.tpl` and `skill.meta.json` so template discovery cannot resolve `specd-metadata`
      Approach: already landed (`16b89b9d`); directory absent — confirm during final sweep.
      (Req: Template migration, Optimizer agents)
- [x] 1.2 Replace archive workflow guidance
      `packages/skills/templates/skills/specd-archive/SKILL.md.tpl`: post-archive optimization guidance — replace `/specd-spec-metadata` with `specd-spec-context-optimizer`
      Approach: already landed; template already recommends `specd-spec-context-optimizer` when optimization is enabled.
      (Req: Optimizer agents)
- [x] 1.3 Remove the legacy development skill
      `dev/ai-agents/skills/specd-spec-metadata/SKILL.md`: legacy skill definition — delete the obsolete orchestration workflow
      Approach: already absent; confirm during final sweep.
      (Req: Optimizer agents)
- [x] 1.4 Update legacy development archive guidance
      `dev/ai-agents/skills/specd-archive/SKILL.md`: metadata optimization recommendation — name `specd-spec-context-optimizer`
      Approach: already landed; verify no residual `specd-spec-metadata` string.
      (Req: Optimizer agents)

## 2. Plugin bundle registrations

- [x] 2.1 Remove the Claude standard-skill registration
      `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: already landed (`0c35b2b5`); confirm map still omits it.
      (Req: Optimizer agents)
- [x] 2.2 Remove the Codex standard-skill registration
      `packages/plugin-agent-codex/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: already landed; confirm map still omits it.
      (Req: Optimizer agents)
- [x] 2.3 Remove the Copilot standard-skill registration
      `packages/plugin-agent-copilot/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: already landed; confirm map still omits it.
      (Req: Optimizer agents)
- [x] 2.4 Remove the OpenCode standard-skill registration
      `packages/plugin-agent-opencode/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: already landed; confirm map still omits it.
      (Req: Optimizer agents)
- [x] 2.5 Remove the Standard plugin standard-skill registration
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`: `skillFrontmatter` — remove the `specd-metadata` record only
      Approach: already landed; confirm map still omits it and agent fallback metadata remains.
      (Req: Optimizer agents)

## 3. Specification and verification contracts

- [x] 3.1 Update the template-source specification
      `specs/skills/skill-templates-source/spec.md`: `Requirement: Template migration` — remove `specd-metadata` from the canonical skills inventory and prohibit its template directory
      Approach: already in live base; change delta is `no-op`.
      (Req: Template migration)
- [x] 3.2 Update template-source verification scenarios
      `specs/skills/skill-templates-source/verify.md`: `Requirement: Template migration` — add discovery coverage for the absence of `specd-metadata`
      Approach: already in live base; change delta is `no-op`.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 3.3 Update the optimizer-agent specification
      `specs/skills/agents/spec.md`: `Requirement: Optimizer agents` — establish that no standard `specd-metadata` skill is published
      Approach: already in live base; change delta is `no-op`.
      (Req: Optimizer agents)
- [x] 3.4 Update optimizer-agent verification
      `specs/skills/agents/verify.md`: `Scenario: Agent availability` — assert the two agents exist and the standard skill does not
      Approach: already in live base; change delta is `no-op`.
      (Req: Optimizer agents, scenario: Agent availability)

## 4. Rendered copies and regression coverage

- [x] 4.1 Regenerate installed skill copies
      `.agents/skills/` and `.codex/skills/`: rendered skill directories — run the repository skills synchronization workflow
      Approach: `specd-metadata` directories already absent; archive guidance already updated. Remaining commit-skill edits are tracked in §5.
      (Req: Template migration, Optimizer agents)
- [x] 4.2 Update Claude installation expectations
      `packages/plugin-agent-claude/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: already landed; smoke-run suite in §5.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.3 Update Codex installation expectations
      `packages/plugin-agent-codex/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: already landed; smoke-run suite in §5.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.4 Update Copilot installation expectations
      `packages/plugin-agent-copilot/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: already landed; smoke-run suite in §5.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.5 Update OpenCode installation expectations
      `packages/plugin-agent-opencode/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: already landed; smoke-run suite in §5.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.6 Update Standard plugin installation expectations
      `packages/plugin-agent-standard/test/install-skills.spec.ts`: installed bundle inventory assertions — remove `specd-metadata` expectations
      Approach: already landed; smoke-run suite in §5.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
- [x] 4.7 Run focused validation and active-reference checks
      `packages/skills`, all five plugin test suites, `.agents/skills/`, `.codex/skills/`, `.claude/skills/`, and `dev/ai-agents/skills/`: test and rendered outputs — prove the removed identifiers are absent
      Approach: run after §5 commit-skill edits; search for `specd-metadata` and `specd-spec-metadata`. Exclude: `.specd/changes/*/`, `specd-sdd/changes/*/`, incidental metadata-mechanism docs, and `node_modules/`.
      (Req: Template migration, Optimizer agents)

## 5. Review follow-up — commit skill cleanup

- [x] 5.1 Rewrite Claude commit skill metadata guidance
      `.claude/skills/commit/SKILL.md`: description, Step 4, and Notes — remove `specd-spec-metadata` invocations and `.specd-metadata.yaml` staging
      Approach: keep Conventional Commits flow; drop gitignored sidecar staging; optional `specs generate-metadata` only when user asks for forced rebuild; for LLM optimization name `specd-spec-context-optimizer` gated on `llmOptimizedContext === true`.
      (Req: Optimizer agents)
- [x] 5.2 Mirror commit skill rewrite to agents runtime copy
      `.agents/skills/commit/SKILL.md`: full file — match `.claude/skills/commit/SKILL.md` exactly
      Approach: copy the rewritten Claude commit skill content; these are hand-maintained triples, not template-rendered.
      (Req: Optimizer agents)
- [x] 5.3 Mirror commit skill rewrite to Codex runtime copy
      `.codex/skills/commit/SKILL.md`: full file — match `.claude/skills/commit/SKILL.md` exactly
      Approach: copy the rewritten Claude commit skill content; diff all three afterward and require identity.
      (Req: Optimizer agents)
- [x] 5.4 Smoke-test skills package discovery
      `packages/skills`: test suite — confirm `specd-metadata` remains undiscoverable and both optimizer agents remain present
      Approach: run the package test suite; fail if either agent is missing or the obsolete skill reappears.
      (Req: Template migration, Optimizer agents, scenario: Obsolete metadata skill is absent)
- [x] 5.5 Smoke-test plugin install inventories
      `packages/plugin-agent-{claude,codex,copilot,opencode,standard}/test/install-skills.spec.ts`: suites — confirm installed inventories exclude `specd-metadata`
      Approach: run all five suites after commit-skill edits; no inventory expectation changes unless a suite fails.
      (Req: Template migration, scenario: Obsolete metadata skill is absent)
