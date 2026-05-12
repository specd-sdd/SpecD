# Tasks: complete-agent-plugins-codex-copilot-open-code

## 1. Codex plugin implementation

- [x] 1.1 Define Codex frontmatter model and per-skill metadata map
      `packages/plugin-agent-codex/src/domain/types/frontmatter.ts`: `Frontmatter` — model Codex-supported keys (`name`, `description`) and exclude unsupported fields.
      Approach: mirror Claude package structure but keep only the Codex allowlist in the interface and emitted map values.
      (Req: Frontmatter field contract; Agent frontmatter matrix; Frontmatter injection)
- [x] 1.2 Implement Codex install use case with frontmatter prepend and target path
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`: `InstallSkills.execute()` — load skills from `@specd/skills`, resolve requested/all skills, prepend YAML to markdown files, write under `.codex/skills/<skill>/`, and return installed/skipped entries.
      Approach: copy Claude `InstallSkills` flow, then specialize renderer to emit only Codex keys and path `.codex/skills`.
      (Req: Skill installation and frontmatter injection; Install location; Template source location; Why no frontmatter in skills package)
- [x] 1.3 Implement Codex runtime adapter and uninstall behavior
      `packages/plugin-agent-codex/src/domain/types/codex-plugin.ts`: `CodexAgentPlugin` — expose `type: 'agent'`, name/version, install delegation, and uninstall selected/all skill directories.
      Approach: use injected `InstallOperation` pattern from Claude and keep uninstall semantics in runtime class.
      (Req: Plugin runtime contract)
- [x] 1.4 Wire Codex composition entrypoint
      `packages/plugin-agent-codex/src/index.ts`: `create()` — compose `InstallSkills` with `CodexAgentPlugin`.
      Approach: replace stub object literal with composition-only factory returning runtime class instance.
      (Req: Factory export)
- [x] 1.5 Update Codex plugin manifest wording to real implementation state
      `packages/plugin-agent-codex/specd-plugin.json`: `description` — remove stub wording and align manifest metadata with concrete behavior.
      Approach: keep manifest schema unchanged; update descriptive fields only.
      (Req: Plugin runtime contract)

## 2. Copilot plugin implementation

- [x] 2.1 Define Copilot frontmatter model and per-skill metadata map
      `packages/plugin-agent-copilot/src/domain/types/frontmatter.ts`: `Frontmatter` — include required `name`, `description`, optional `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`.
      Approach: model the full supported set with optional keys and keep emission controlled by explicit allowlist.
      (Req: Frontmatter field contract; Agent frontmatter matrix; Frontmatter source)
- [x] 2.2 Implement Copilot install use case with `.github/skills` output
      `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`: `InstallSkills.execute()` — same workflow as Codex but targeting `.github/skills/<skill>/`.
      Approach: reuse Codex/Claude algorithm, swap target directory and field rendering rules for Copilot key set.
      (Req: Skill installation and frontmatter injection; Install location; Frontmatter injection)
- [x] 2.3 Implement Copilot runtime adapter and uninstall behavior
      `packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts`: `CopilotAgentPlugin` — contract-valid runtime with install delegation and filtered/full uninstall.
      Approach: apply same runtime class contract as Codex/Claude with Copilot package metadata.
      (Req: Plugin runtime contract)
- [x] 2.4 Wire Copilot composition entrypoint
      `packages/plugin-agent-copilot/src/index.ts`: `create()` — replace stub with composition factory.
      Approach: instantiate `InstallSkills` and inject into runtime class.
      (Req: Factory export)
- [x] 2.5 Update Copilot plugin manifest wording to real implementation state
      `packages/plugin-agent-copilot/specd-plugin.json`: `description` — remove stub wording and align with implemented install/uninstall behavior.
      Approach: metadata-only update, no contract changes.
      (Req: Plugin runtime contract)

## 3. Open Code package creation

- [x] 3.1 Scaffold Open Code package manifests and compiler config
      `packages/plugin-agent-opencode/package.json`, `packages/plugin-agent-opencode/tsconfig.json`, `packages/plugin-agent-opencode/specd-plugin.json`: package metadata and plugin manifest.
      Approach: clone shape from other agent packages, set package name `@specd/plugin-agent-opencode`, ESM exports, and dependencies on `@specd/plugin-manager` + `@specd/skills`.
      (Req: Meta package identity; Open Code inclusion)
- [x] 3.2 Implement Open Code domain frontmatter types and map
      `packages/plugin-agent-opencode/src/domain/types/frontmatter.ts`, `packages/plugin-agent-opencode/src/domain/frontmatter/index.ts`: Open Code frontmatter contract and per-skill map.
      Approach: model required `name`/`description` plus optional `license`, `compatibility`, `metadata`, with no unknown keys in emitter path.
      (Req: Domain layer; Frontmatter type contract; Agent frontmatter matrix)
- [x] 3.3 Implement Open Code install use case
      `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`: `InstallSkills.execute()` — read skills repo, resolve bundle/frontmatter, prepend YAML, write `.opencode/skills/<skill>/`.
      Approach: same install pipeline pattern as Codex/Copilot with Open Code field filtering and installed/skipped result handling.
      (Req: Application layer; Frontmatter injection; Install location; Template source location)
- [x] 3.4 Implement Open Code runtime adapter
      `packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts`: `OpenCodeAgentPlugin` — `AgentPlugin` runtime class with install delegation and uninstall selected/all logic.
      Approach: use injected install operation and reuse uninstall pattern from sibling plugins with `.opencode/skills` root.
      (Req: Uninstall behavior; Plugin runtime contract)
- [x] 3.5 Wire Open Code entrypoint export
      `packages/plugin-agent-opencode/src/index.ts`: named `create(): AgentPlugin`.
      Approach: instantiate `InstallSkills`, return `OpenCodeAgentPlugin`, and export as named function.
      (Req: Factory export)

## 4. CLI wizard and metapackage updates

- [x] 4.1 Add Open Code to known project-init plugin options
      `packages/cli/src/commands/project/init.ts`: `AVAILABLE_AGENT_PLUGINS` — include `@specd/plugin-agent-opencode`.
      Approach: append Open Code package name to static known options list while preserving existing wizard/install flow and non-interactive behavior.
      (Req: Known plugin options; Project init wizard integration)
- [x] 4.2 Add metapackage dependency for Open Code plugin
      `packages/specd/package.json`: `dependencies` — include `@specd/plugin-agent-opencode: workspace:*`.
      Approach: keep existing dependency set and add only missing Open Code entry with `workspace:*`.
      (Req: Agent plugin dependency coverage; Open Code inclusion; Meta package inclusion)

## 5. Skills-source contract alignment

- [x] 5.1 Verify templates remain frontmatter-free and migration tree complete
      `packages/skills/templates/**`: template files and directory set — ensure no YAML frontmatter blocks and required skill directories + `shared.md` exist.
      Approach: inspect current template tree, patch only files/directories that violate template-source constraints.
      (Req: Template source location; Template migration; Why no frontmatter in skills package)
- [x] 5.2 Enforce runtime-specific field emission in each plugin renderer
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`, `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`: frontmatter render helpers.
      Approach: keep explicit allowlist rendering per runtime and avoid generic object serialization that could leak unsupported keys.
      (Req: Frontmatter injection; Frontmatter source; Agent frontmatter matrix)

## 6. Automated tests

- [x] 6.1 Add Codex install/runtime tests
      `packages/plugin-agent-codex/test/install-skills.spec.ts`: install path, emitted keys, create() contract, uninstall selected/all.
      Approach: follow Claude test style with temp project roots and file assertions for `.codex/skills`.
      (Req: Factory export; Plugin runtime contract; Skill installation and frontmatter injection; Frontmatter field contract; Install location)
- [x] 6.2 Add Copilot install/runtime tests
      `packages/plugin-agent-copilot/test/install-skills.spec.ts`: install path, supported optional keys emission, uninstall behavior, create() contract.
      Approach: mirror Codex tests, assert `.github/skills` target and optional key handling.
      (Req: Factory export; Plugin runtime contract; Skill installation and frontmatter injection; Frontmatter field contract; Install location)
- [x] 6.3 Add Open Code install/runtime tests
      `packages/plugin-agent-opencode/test/install-skills.spec.ts`: named create export, install workflow, supported-key filtering, uninstall selected/all.
      Approach: mirror sibling plugin tests with assertions for `.opencode/skills`.
      (Req: Factory export; Domain layer; Frontmatter type contract; Application layer; Frontmatter injection; Install location; Uninstall behavior)
- [x] 6.4 Add CLI project-init regression test for known plugin options
      `packages/cli/test/commands/project-init.spec.ts`: interactive plugin options include Open Code and existing plugin install flow remains intact.
      Approach: mock prompt multiselect input/options and assert `AVAILABLE_AGENT_PLUGINS`-derived choices include `@specd/plugin-agent-opencode`.
      (Req: Known plugin options; Project init wizard integration)
- [x] 6.5 Add metapackage manifest assertion
      `packages/specd/package.json` (validated via test or release check): ensure Open Code dependency remains declared as `workspace:*`.
      Approach: add a lightweight assertion in existing test harness where possible; if no harness exists, add release-time check script task in CI notes for this change.
      (Req: Agent plugin dependency coverage; Open Code inclusion; Meta package inclusion)

## 7. Documentation and validation

- [x] 7.1 Update CLI project-init docs to current plugin workflow
      `docs/cli/project-init.md`, `docs/cli/cli-reference.md`: `project init` options/examples — replace stale `--agent` references with `--plugin`, and include `@specd/plugin-agent-opencode` in known plugin examples.
      Approach: align wording and command examples with `packages/cli/src/commands/project/init.ts` contract and the new known plugin option set.
      (Req: Documentation alignment from design post-rule)
- [x] 7.2 Update getting-started guide commands
      `docs/guide/_sections/getting-started/usage.md`, `docs/guide/_sections/getting-started/setting-up.md`: onboarding examples — remove outdated `--agent` setup commands and replace with plugin-based init commands.
      Approach: keep onboarding narrative intact while swapping only command/API surface to current CLI behavior.
      (Req: Documentation alignment from design post-rule)
- [x] 7.3 Update config docs for current plugin package naming
      `docs/core/config.md`, `docs/config/examples/approvals-and-workflow-hooks.md`: plugin declarations — migrate old plugin names (e.g. `@specd/plugin-claude`) to current `@specd/plugin-agent-*` naming and include Open Code where relevant.
      Approach: perform minimal text/config-snippet edits so examples remain valid against current package topology.
      (Req: Documentation alignment from design post-rule)
- [x] 7.4 Update package-level README plugin matrix
      `packages/specd/README.md`: package table entries — use current package names and include `@specd/plugin-agent-opencode`.
      Approach: update only affected table rows/status labels; keep the rest of README unchanged.
      (Req: Documentation alignment from design post-rule)
- [x] 7.5 Execute targeted and monorepo validation commands
      `pnpm test --filter @specd/plugin-agent-codex`, `pnpm test --filter @specd/plugin-agent-copilot`, `pnpm test --filter @specd/plugin-agent-opencode`, `pnpm test`, `pnpm lint`.
      Approach: run targeted package tests first for fast feedback, then full test/lint gates before moving lifecycle to implementing/verifying.
      (Req: Verification scenarios across all affected specs)
