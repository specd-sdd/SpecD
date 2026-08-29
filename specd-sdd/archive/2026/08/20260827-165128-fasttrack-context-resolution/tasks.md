# Tasks: fasttrack-context-resolution

## 1. Fast-track contract discovery

- [x] 1.1 Add graph-backed governing-spec discovery
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: governing contract discovery section — run file impact first, evaluate `coveringSpecs`, then merge applicable configured candidates.
      Approach: use TOON output, permit an empty coverage set, and load contracts only with `specs context --follow-deps`.
      (Req: Fast-track governing context and activation)
- [x] 1.2 Declare the manual-only workflow boundary
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: activation boundary — require explicit `/specd-fasttrack` invocation and direct normal work to `/specd`.
      Approach: place the rule before workflow bootstrap so it is visible in the rendered skill.
      (Req: Fast-track governing context and activation)

## 2. Agent routing metadata

- [x] 2.1 Mark all agent routing descriptions manual-only
      `packages/plugin-agent-{claude,codex,copilot,opencode,standard}/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — prefix descriptions with the explicit-invocation restriction.
      Approach: keep the same portable sentence in every adapter and do not add unsupported frontmatter keys.
      (Req: Manual-only fast-track routing)
- [x] 2.2 Emit Claude native model-invocation disablement
      `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — set `disable_model_invocation: true`.
      Approach: use the existing Claude frontmatter type and preserve all other skill fields.
      (Req: Manual-only fast-track routing)
- [x] 2.3 Emit Copilot native model-invocation disablement
      `packages/plugin-agent-copilot/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — set `disable-model-invocation: true`.
      Approach: use the existing quoted Copilot frontmatter key and preserve supported-field filtering.
      (Req: Manual-only fast-track routing)

## 3. Verification

- [x] 3.1 Extend the fast-track template contract test
      `packages/skills/test/template-workflow.spec.ts`: fast-track template assertions — cover graph-first discovery, empty coverage handling, compiled context, forbidden raw reads, and manual-only wording.
      Approach: assert exact command fragments and the absence of `specd specs show`.
      (Req: Fast-track governing context and activation)
- [x] 3.2 Extend all agent installation tests
      `packages/plugin-agent-*/test/install-skills.spec.ts`: fast-track frontmatter expectations — assert the portable manual-only description; assert native disable fields for Claude and Copilot.
      Approach: verify the structured frontmatter passed to bundle rendering for each plugin.
      (Req: Manual-only fast-track routing)
- [x] 3.3 Run targeted automated and installation verification
      `packages/skills/test/template-workflow.spec.ts` and `packages/plugin-agent-*/test/install-skills.spec.ts`: execute the specified filtered Vitest suites.
      Approach: run each package filter independently and require all suites plus `git diff --check` to pass.
      (Req: Fast-track governing context and activation, Manual-only fast-track routing)
- [x] 3.4 Perform generated-skill manual verification
      Agent plugin install targets: inspect generated fast-track `SKILL.md` files in temporary projects.
      Approach: confirm every description is manual-only and native disable fields occur only for Claude and Copilot.
      (Req: Manual-only fast-track routing)
