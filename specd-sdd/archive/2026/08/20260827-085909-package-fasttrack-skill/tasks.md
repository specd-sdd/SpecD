# Tasks: package-fasttrack-skill

## 1. Canonical fast-track template

- [x] 1.1 Create the fast-track metadata contract
      `packages/skills/templates/skills/specd-fasttrack/skill.meta.json`: template metadata — declare the standard-skill kind, supported capabilities, no required runtime capability, and `shared.md` dependency.
      Approach: match the existing workflow-skill metadata shape exactly; do not add static frontmatter or a registry entry.
      (Req: Fast-track workflow template)
- [x] 1.2 Port and optimise the fast-track workflow template
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: `specd-fasttrack` workflow — preserve code-first change creation, contract checks, implementation tracking, audit, and explicit hand-off stop.
      Approach: reference `@{{sharedFolder}}/shared.md`, retain only fast-track-specific instructions, and guard MCP/delegated-agent guidance with capabilities.
      (Req: Fast-track workflow template)
- [x] 1.3 Make journal updates resumable and immediate
      `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl`: live-journal instructions — require an entry before proceeding after every decision, scope finding, edit, implementation link, test/debug result, and audit finding.
      Approach: prescribe changed action, rationale, and affected files/symbols; state that final consolidation cannot replace incremental entries.
      (Req: Fast-track workflow template)
- [x] 1.4 Retire the independently maintained local source
      `.agents/skills/specd-fasttrack/SKILL.md`: local development copy — remove it as a hand-maintained authority or regenerate it using the repository-owned skill synchronization path.
      Approach: use the existing sync mechanism only; verify the resulting copy is derived from the package template.
      (Req: Fast-track skill discovery)

## 2. Generic package discovery and rendering

- [x] 2.1 Verify repository discovery needs no special case
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `FsSkillRepository.list`, `get`, and `getBundle` — confirm the new directory is discovered and rendered without production-code branching.
      Approach: make no source edit unless discovery tests reveal a generic defect; preserve directory scan, metadata validation, and shared-file routing.
      (Req: Fast-track skill discovery)
- [x] 2.2 Verify generic bundle resolution for each capability profile
      `packages/skills/src/application/use-cases/resolve-bundle.ts`: `ResolveBundle.execute` — confirm fast-track receives safe project-relative built-ins and supplied render context.
      Approach: do not add a name-specific branch; test full capabilities and `['frontmatter']` so unsupported conditional content is omitted.
      (Req: Fast-track bundle resolution)
- [x] 2.3 Add template and bundle contract coverage
      `packages/skills/test/template-workflow.spec.ts` and relevant repository/resolver tests: fast-track cases — assert metadata, `SKILL.md` output, shared routing, absent source frontmatter, relative shared reference, and incremental journal rule.
      Approach: extend existing parameterized or inventory tests rather than duplicate renderer setup.
      (Req: Fast-track workflow template, Fast-track skill discovery, Fast-track bundle resolution)

## 3. Runtime frontmatter maps

- [x] 3.1 Add Claude fast-track metadata
      `packages/plugin-agent-claude/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — add Claude-supported name and description.
      Approach: mirror the existing workflow-skill entry shape; leave `InstallSkills` unchanged.
      (Req: Fast-track skill installation)
- [x] 3.2 Add Copilot fast-track metadata
      `packages/plugin-agent-copilot/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — add only values supported by the existing Copilot frontmatter model.
      Approach: preserve map type and runtime filtering; do not serialize YAML in the plugin.
      (Req: Fast-track skill installation)
- [x] 3.3 Add Codex fast-track metadata
      `packages/plugin-agent-codex/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — add name and description only.
      Approach: rely on `ResolveBundle` for frontmatter insertion and assert the map contains no unsupported keys.
      (Req: Fast-track skill installation)
- [x] 3.4 Add Open Code fast-track metadata
      `packages/plugin-agent-opencode/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — add supported Open Code values.
      Approach: retain the current MCP/agents/frontmatter capability list and generic installer flow.
      (Req: Fast-track skill installation)
- [x] 3.5 Add Agent Skills Standard fast-track metadata
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`: `skillFrontmatter['specd-fasttrack']` — add name, description, and `allowed-tools`.
      Approach: express the complete file-operation and Node/SpecD/PNPM tool set in the standard's space-separated syntax; include Agent while the template capability branch prevents unsupported execution.
      (Req: Fast-track skill installation)

## 4. Installation and regression coverage

- [x] 4.1 Test Claude default, filtered, and uninstall flows
      `packages/plugin-agent-claude/test/install-skills.spec.ts`: `InstallSkills` cases — assert default rendering, journal content, selected install, and selected removal for fast-track.
      Approach: use the existing temporary project fixture and inspect `.claude/skills/specd-fasttrack/SKILL.md`.
      (Req: Fast-track skill installation)
- [x] 4.2 Test Copilot capability-limited rendering
      `packages/plugin-agent-copilot/test/install-skills.spec.ts`: `InstallSkills` cases — assert fast-track is installed with supported frontmatter only and absent unsupported instructions.
      Approach: inspect the generated `.github/skills/specd-fasttrack/SKILL.md` from the existing fixture.
      (Req: Fast-track skill installation)
- [x] 4.3 Test Codex frontmatter boundary
      `packages/plugin-agent-codex/test/install-skills.spec.ts`: `InstallSkills` cases — assert `.codex/skills/specd-fasttrack/SKILL.md`, `name`/`description` only, and journal-resumability content.
      Approach: use the existing install test fixture and parse/assert its rendered frontmatter.
      (Req: Fast-track skill installation)
- [x] 4.4 Test Open Code capability-aware rendering
      `packages/plugin-agent-opencode/test/install-skills.spec.ts`: `InstallSkills` cases — assert default fast-track output preserves supplied branches and runtime-valid frontmatter.
      Approach: extend existing bundle-install assertions without changing installer code.
      (Req: Fast-track skill installation)
- [x] 4.5 Test Agent Skills Standard tools and fallback rendering
      `packages/plugin-agent-standard/test/install-skills.spec.ts`: `InstallSkills` cases — assert `.agents/skills/specd-fasttrack/SKILL.md`, `allowed-tools`, and omission of unavailable capability branches.
      Approach: verify the exact standard frontmatter key and use its current temporary-project fixture.
      (Req: Fast-track skill installation)

## 5. Validation and release readiness

- [x] 5.1 Run focused package tests and lint/typecheck
      `packages/skills`, `packages/plugin-agent-*`: package scripts — execute all focused tests plus the repository-prescribed lint/typecheck commands.
      Approach: preserve failures from unrelated dirty-worktree changes; report exact command output for any regression.
      (Req: Fast-track workflow template, Fast-track skill discovery, Fast-track bundle resolution, Fast-track skill installation)
- [x] 5.2 Perform five-runtime end-to-end inspection
      temporary project fixture: generated skill files — install every plugin unfiltered, inspect paths/frontmatter/capability content, then filtered-uninstall fast-track.
      Approach: confirm shared context survives selected removal while other installed skills remain and no local source is used as input.
      (Req: Fast-track skill installation)
