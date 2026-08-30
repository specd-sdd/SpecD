# Tasks: refine-fasttrack-skill-template

## 1. Skill Template Enhancement

- [x] 1.1 Add literal exploration scaffolding and verbatim directives to fast-track template
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: `specd-fasttrack` Step 2 — add interactive question and exact `.specd-exploration.md` markdown template
      Approach: embed the complete 9 numbered directives block and explicit critical rule requiring verbatim copy
      (Req: Fast-track workflow template, scenario: Template renders literal scaffolding and verbatim design directives)

- [x] 1.2 Add codebase-wide adoption and task transfer instructions to fast-track template
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: `specd-fasttrack` Step 2 & 5 — add adoption MUST directive and task transfer rules
      Approach: declare Directive 8 (Codebase-Wide Adoption MUST) and Directive 6 (generating completed work directly as `- [x]`), plus Consolidation markdown template
      (Req: Fast-track workflow template, scenario: Fast-track mandates codebase-wide adoption search and regression checks)

- [x] 1.3 Add structured consolidation and hand-off stop gates to fast-track template
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: `specd-fasttrack` Step 5 & 6 — add structured audit summary template and confirmation block
      Approach: enforce mandatory stop rules and format confirmation summary block before stopping
      (Req: Fast-track workflow template, scenario: Fast-track enforces explicit stop gates and task transfer rules)

## 2. Sync and Verification

- [x] 2.1 Sync rendered fast-track skill to workspace development location
      `.agents/skills/specd-fasttrack/SKILL.md`: entire file — update with rendered template output
      Approach: render template with standard frontmatter and relative shared folder reference `@.specd/config/skills/shared/shared.md`
      (Req: Fast-track workflow template, scenario: Template renders literal scaffolding and verbatim design directives)

- [x] 2.2 Execute skills package test suite
      `packages/skills/test/`: all test files — verify template discovery and bundle resolution pass
      Approach: run `pnpm --filter @specd/skills test` and ensure all test suites pass with 0 errors
      (Req: Fast-track workflow template)
