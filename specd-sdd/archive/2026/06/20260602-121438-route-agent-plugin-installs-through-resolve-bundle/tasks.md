# Tasks: route-agent-plugin-installs-through-resolve-bundle

## 1. Skills resolution boundary

- [x] 1.1 Confirm `ResolveBundle` remains the canonical built-in injection boundary
      [packages/skills/src/application/use-cases/resolve-bundle.ts](/Users/monki/Documents/Proyectos/specd/packages/skills/src/application/use-cases/resolve-bundle.ts:40): `ResolveBundle` — keep built-in `configPath`, `schemaRef`, and `sharedFolder` preparation as the single install-time path used by plugins
      Approach: preserve the existing thin use-case shape; do not move plugin-specific frontmatter or filesystem targeting into `@specd/skills`
      (Req: Behavior)

- [x] 1.2 Keep `ResolveBundle` tests aligned with canonical usage
      [packages/skills/test/resolve-bundle.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/skills/test/resolve-bundle.spec.ts:1): `ResolveBundle` tests — retain coverage for default `sharedFolder`, override handling, and privacy-safe variable exposure
      Approach: extend the current mocked-repository tests rather than adding a second helper path; assert the merged context still carries built-ins after plugin refactoring
      (Req: Behavior, Input)

## 2. Plugin install refactor

- [x] 2.1 Route Claude installs through `ResolveBundle`
      [packages/plugin-agent-claude/src/application/use-cases/install-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts:17): `InstallSkills.execute()` — stop calling `repository.getBundle(...)` directly and resolve bundles through `ResolveBundle`
      Approach: keep `createSkillRepository()` plus `repository.list()` / `repository.get()` for discovery and frontmatter fallback, instantiate `new ResolveBundle(repository)`, and omit default `sharedFolder` from `context.variables` unless the caller passed an override
      (Req: Application layer)

- [x] 2.2 Route Copilot installs through `ResolveBundle`
      [packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts:17): `InstallSkills.execute()` — replace direct repository bundle resolution with `ResolveBundle`
      Approach: preserve Copilot-specific capability and frontmatter preparation, but hand bundle resolution to `ResolveBundle` so built-ins come from `config`
      (Req: Skill installation and frontmatter injection)

- [x] 2.3 Route Codex installs through `ResolveBundle`
      [packages/plugin-agent-codex/src/application/use-cases/install-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts:17): `InstallSkills.execute()` — replace direct repository bundle resolution with `ResolveBundle`
      Approach: keep the current `.codex/skills` target and structured frontmatter conversion unchanged; only move the bundle-resolution boundary
      (Req: Skill installation and frontmatter injection)

- [x] 2.4 Route Open Code installs through `ResolveBundle`
      [packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts:17): `InstallSkills.execute()` — replace direct repository bundle resolution with `ResolveBundle`
      Approach: preserve Open Code frontmatter and capability selection; resolve bundles through the use case and keep shared file placement logic adapter-local
      (Req: Application layer)

- [x] 2.5 Route standard-agent installs through `ResolveBundle`
      [packages/plugin-agent-standard/src/application/use-cases/install-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts:17): `InstallSkills.execute()` — replace direct repository bundle resolution with `ResolveBundle`
      Approach: keep agentskills.io frontmatter preparation in the plugin package and move only bundle resolution behind the canonical use case
      (Req: Application layer)

## 3. Shared-folder path handling

- [x] 3.1 Preserve plugin-local filesystem shared-folder helpers for install targets
      [packages/plugin-agent-claude/src/application/use-cases/shared-folder.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/shared-folder.ts:1) and sibling files in the other four plugin packages: `resolveSharedFolder` — keep absolute-path computation for writing and uninstalling shared files
      Approach: continue using plugin-local helpers for filesystem destinations while removing the need to inject the default `sharedFolder` manually into template context
      (Req: Install location)

- [x] 3.2 Keep uninstall flows aligned with the existing shared-folder contract
      [packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts:11) and sibling files in the other four plugin packages: `UninstallSkills.execute()` — verify uninstall still uses the helper-driven shared directory and does not need `ResolveBundle`
      Approach: do not expand `ResolveBundle` into uninstall orchestration; keep removal logic adapter-local and unchanged unless the refactor forces a consistency fix
      (Req: Uninstall behavior)

## 4. Regression coverage

- [x] 4.1 Update Claude and Open Code style plugin tests
      [packages/plugin-agent-claude/test/install-skills.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts:1) and [packages/plugin-agent-opencode/test/install-skills.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts:1): install tests — assert bundle resolution still yields resolved shared references without direct repository semantics
      Approach: drive install through the real use case shape, then assert generated output no longer depends on manually injecting the default `sharedFolder`
      (Req: Frontmatter injection, Application layer)

- [x] 4.2 Update Copilot and Codex plugin tests
      [packages/plugin-agent-copilot/test/install-skills.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts:1) and [packages/plugin-agent-codex/test/install-skills.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts:1): install tests — assert shared files still land in the resolved directory while bundle resolution runs through `ResolveBundle`
      Approach: keep the current runtime-specific install-path assertions and add checks that fail if the implementation regresses to direct `repository.getBundle(...)` behavior
      (Req: Skill installation and frontmatter injection)

- [x] 4.3 Update standard-agent tests
      [packages/plugin-agent-standard/test/install-skills.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts:1): install tests — verify agentskills.io frontmatter behavior remains intact when bundle resolution moves behind `ResolveBundle`
      Approach: preserve existing assertions for `allowed-tools` and shared-file routing while checking that default `sharedFolder` rendering still succeeds without plugin-side default injection
      (Req: Application layer, allowed-tools configuration)

## 5. Verification and docs check

- [x] 5.1 Run targeted automated verification for skills and plugin packages
      `packages/skills/test/resolve-bundle.spec.ts`, `packages/plugin-agent-*/test/install-skills.spec.ts` — execute the package tests that cover built-in render defaults and install flows
      Approach: run targeted tests for `@specd/skills` plus the five plugin packages so every changed requirement and verification scenario is exercised
      (Req: all modified specs)

- [x] 5.2 Perform one manual reinstall check on generated markdown
      Installed runtime skill output under `.claude/skills/`, `.codex/skills/`, `.github/skills/`, `.opencode/skills/`, or `.agents/skills/` — confirm generated `SKILL.md` no longer contains unresolved `@{{sharedFolder}}/shared.md`
      Approach: reinstall a representative skill after the code change, inspect both the skill-local markdown and the shared file destination, and confirm explicit overrides still work
      (Req: Install location, Behavior)

- [x] 5.3 Review whether contributor-facing docs need wording updates
      [packages/skills/README.md](/Users/monki/Documents/Proyectos/specd/packages/skills/README.md:1) and [docs/guide/skills-template-rendering.md](/Users/monki/Documents/Proyectos/specd/docs/guide/skills-template-rendering.md:1) — check whether any text incorrectly implies plugins prepare built-in render defaults directly
      Approach: only update docs if the current wording describes plugin internal wiring; otherwise record no doc change needed
      (Req: Documentation follow-through from design)
