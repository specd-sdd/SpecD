# Tasks: shared-skill-bundle-targets

## 1. Skills bundle contract

- [x] 1.1 Add shared marker and install target shape in domain contract
      `packages/skills/src/domain/skill-bundle.ts`: `ResolvedFile`, `SkillBundle` — extend resolved file metadata with `shared?: boolean` and add `SkillBundleInstallTarget` plus dual-signature install/uninstall contract.
      Approach: keep backwards compatibility by accepting `string | SkillBundleInstallTarget` and defining string as shorthand for `{ targetDir }`.
      (Req: skills:skill-bundle/ResolvedFile interface, skills:skill-bundle/SkillBundle interface)
- [x] 1.2 Route shared and non-shared files in bundle install/uninstall implementation
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `ResolvedSkillBundle.install`, `ResolvedSkillBundle.uninstall` — compute normal/shared directories and route by `file.shared`.
      Approach: derive `sharedDir = sharedTargetDir ?? targetDir`, lazily create shared dir when needed, and keep uninstall idempotent for missing files.
      (Req: skills:skill-bundle/Install behavior, skills:skill-bundle/Uninstall behavior; scenario: shared target routing + missing-file uninstall)

## 2. Skills repository and resolver propagation

- [x] 2.1 Mark shared-origin files when building bundles
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `FsSkillRepository.getBundle` — set `shared: true` for entries sourced from `templates/shared/*.meta.json`.
      Approach: keep skill-local template entries unmarked and preserve existing `included` dedupe behavior.
      (Req: skills:skill-repository-port/SkillRepositoryPort interface, skills:skill-repository-infra/Shared file scanning)
- [x] 2.2 Preserve shared marker through resolve-bundle variable substitution
      `packages/skills/src/application/use-cases/resolve-bundle.ts`: `ResolveBundle.execute` — ensure metadata survives content substitution.
      Approach: transform only `content` while keeping non-content fields (`filename`, `shared`) unchanged in output bundle entries.
      (Req: skills:resolve-bundle/Behavior; scenario: shared marker preserved)
- [x] 2.3 Align port typing/comments with shared marker behavior
      `packages/skills/src/application/ports/skill-repository.ts`: `SkillRepository` contract notes — capture that shared-origin metadata is preserved in resolved bundles.
      Approach: update interface docs/types only, no new port methods.
      (Req: skills:skill-repository-port/SkillRepositoryPort interface)

## 3. Agent plugin install/uninstall routing

- [x] 3.1 Update Codex installer/uninstaller for `_specd-shared`
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts`: `InstallSkills`, `UninstallSkills` — split shared writes and preserve/remove shared directory based on uninstall mode.
      Approach: write shared files to `.codex/skills/_specd-shared/`, prepend frontmatter only for non-shared markdown, keep `_specd-shared` on selected uninstall, remove all on full uninstall.
      (Req: plugin-agent-codex/Skill installation and frontmatter injection, Install location, Uninstall behavior)
- [x] 3.2 Update Claude installer/uninstaller for `_specd-shared`
      `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts`: `InstallSkills`, `UninstallSkills` — same routing semantics for Claude root.
      Approach: route shared files to `.claude/skills/_specd-shared/` and skip frontmatter on shared markdown.
      (Req: plugin-agent-claude/Application layer, Frontmatter injection, Install location, Uninstall behavior)
- [x] 3.3 Update Copilot installer/uninstaller for `_specd-shared`
      `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts`: `InstallSkills`, `UninstallSkills` — same routing semantics for GitHub skills root.
      Approach: route shared files to `.github/skills/_specd-shared/` and keep/remove shared directory by uninstall mode.
      (Req: plugin-agent-copilot/Skill installation and frontmatter injection, Install location, Uninstall behavior)
- [x] 3.4 Update OpenCode installer/uninstaller for `_specd-shared`
      `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts`: `InstallSkills`, `UninstallSkills` — align shared routing and uninstall retention/removal behavior.
      Approach: route shared files to `.opencode/skills/_specd-shared/`, skip frontmatter for shared markdown, preserve shared dir on selective uninstall.
      (Req: plugin-agent-opencode/Application layer, Frontmatter injection, Install location, Uninstall behavior)
- [x] 3.5 Keep plugin-manager contract unchanged and document no-op rationale in code-level comments/tests
      `packages/plugin-manager/src/domain/types/agent-plugin.ts` and related tests if assertions are brittle — confirm no new install options/result fields are required.
      Approach: verify existing contract still supports plugin-local shared target derivation; adjust only if tests encode old assumptions.
      (Req: plugin-manager:agent-plugin-type/no-op delta)

## 4. Tests and documentation

- [x] 4.1 Update skills package tests for shared marker and routing
      `packages/skills/test/infrastructure/skill-repository.spec.ts`, `packages/skills/test/resolve-bundle.spec.ts` — assert shared file marking and metadata preservation.
      Approach: extend existing fixtures to include shared entries and assert `shared` propagation end-to-end.
      (Req: skills:\* verify scenarios for shared origin + marker preservation)
- [x] 4.2 Update agent plugin install/uninstall tests
      `packages/plugin-agent-*/test/install-skills.spec.ts` and uninstall-related specs — assert split output layout, no frontmatter on shared files, and uninstall retention/removal semantics.
      Approach: reuse temp project roots and assert filesystem tree at `<agent-root>/<skill>` and `<agent-root>/_specd-shared`.
      (Req: plugin-agent-\* verify scenarios for shared routing, shared directory invariant, uninstall behavior)
- [x] 4.3 Update skill template references to shared path
      `packages/skills/templates/specd*/SKILL.md` files that currently reference `@shared.md` — switch to relative shared location under `_specd-shared`.
      Approach: update references consistently to `@../_specd-shared/shared.md` while preserving skill instructions.
      (Req: install-location and shared-resource behavior implied by plugin specs)
- [x] 4.4 Update plugin and CLI docs for new installed layout
      `packages/plugin-agent-*/README.md`, `docs/cli/plugins-install.md` (and related docs if examples mention duplicated shared files) — document `_specd-shared` and uninstall semantics.
      Approach: keep wording runtime-specific and consistent with spec language.
      (Req: default:\_global/docs compliance + design doc documentation update rule)

## 5. Manual verification and quality gates

- [x] 5.1 Run manual install/uninstall checks per runtime
      local workspace skill roots (`.codex/skills`, `.claude/skills`, `.github/skills`, `.opencode/skills`) — verify shared file single-copy behavior and selective/full uninstall outcomes.
      Approach: install selected skills, inspect filesystem layout, uninstall one skill then all, and confirm expected shared directory behavior each step.
      (Req: plugin-agent-\* install/uninstall verify scenarios)
- [x] 5.2 Run repository quality gates before moving to verifying
      repository root CI commands (`pnpm test`, `pnpm lint`, `pnpm typecheck`) — ensure changes satisfy global testing and conventions constraints.
      Approach: execute full suite after implementation tasks complete and fix regressions before lifecycle transition.
      (Req: default:\_global/testing, default:\_global/conventions, default:\_global/eslint)

## 6. Uninstall scope hardening follow-up

- [x] 6.1 Restrict full uninstall to specd-managed skill directories
      `packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts`, `packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts`, `packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts`, `packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts`: `UninstallSkills.execute` — replace full root deletion with targeted deletion of repository-managed skill names and `_specd-shared/`.
      Approach: derive managed skill names from `createSkillRepository().list()`, remove only those `<skill-name>/` directories and legacy `<skill>.md` files, then remove `_specd-shared/`.
      (Req: plugin-agent-codex/Uninstall behavior, plugin-agent-claude/Uninstall behavior, plugin-agent-copilot/Uninstall behavior, plugin-agent-opencode/Uninstall behavior)
- [x] 6.2 Preserve unrelated user skills during full uninstall
      same uninstall use cases above — ensure full uninstall does not delete unknown directories/files under agent skill roots.
      Approach: avoid `rm(targetDir, { recursive: true })`; perform explicit per-entry removal for managed set only.
      (Req: plugin-agent-\*/Uninstall behavior)
- [x] 6.3 Extend plugin uninstall verification coverage for managed-scope deletion
      `packages/plugin-agent-*/test/install-skills.spec.ts` (or dedicated uninstall specs where added) — assert full uninstall removes specd-managed skills and `_specd-shared/` while keeping unrelated user skill content.
      Approach: seed temp roots with one synthetic non-specd skill directory before uninstall and assert it remains.
      (Req: plugin-agent-\* verify scenarios for uninstall behavior)
