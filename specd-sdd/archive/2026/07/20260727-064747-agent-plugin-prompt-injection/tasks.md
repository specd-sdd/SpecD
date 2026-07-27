# Tasks: agent-plugin-prompt-injection

## 1. Core Instruction Template & Helpers (@specd/skills)

- [x] 1.1 Add shared base instruction Handlebars template
      `packages/skills/templates/prompt/agent-instruction.md.tpl`: template file — add canonical specd agent prompt template with entry points, graph rules, and escape hatch
      Approach: Create `.tpl` file using Handlebars syntax with conditional `{{#if extraInstructions}}` block
      (Req: Shared Base Instruction Template)

- [x] 1.2 Export template path and compilation helper in skills domain
      `packages/skills/src/domain/templates/index.ts`: export template loader
      Approach: Expose template path resolver for `agent-instruction.md.tpl`
      (Req: Shared Base Instruction Template)

- [x] 1.3 Implement `renderBaseAgentInstruction` function
      `packages/skills/src/application/render-base-agent-instruction.ts`: `renderBaseAgentInstruction` — render prompt template
      Approach: Compile Handlebars template with `extraInstructions` options; returns `Promise<string>` (async file I/O); omit empty trailing sections when options are absent
      (Req: Base Prompt Rendering Interface)

- [x] 1.4 Implement `injectSpecdBlock` and `removeSpecdBlock` utilities
      `packages/skills/src/application/specd-block-manager.ts`: `injectSpecdBlock`, `removeSpecdBlock` — manage Markdown comment blocks
      Approach: Parse file for `<!-- <specd> -->` or `<!-- <specd-plugin:id> -->`. Perform non-empty content guard (skip/remove if empty). On `removeSpecdBlock` with `blockId`, only remove that plugin block — do not remove base block.
      (Req: Idempotent Markdown Block Management)

- [x] 1.5 Barrel export prompt and block utilities in `@specd/skills`
      `packages/skills/src/index.ts`: public exports — export `renderBaseAgentInstruction`, `RenderBaseAgentInstructionOptions`, `injectSpecdBlock`, `removeSpecdBlock`
      Approach: Re-export new application functions from package entry point
      (Req: Base Prompt Rendering Interface)

- [x] 1.6 Add unit tests for template rendering
      `packages/skills/test/application/render-base-agent-instruction.spec.ts`: unit tests — verify `renderBaseAgentInstruction` with and without `extraInstructions`
      Approach: Verify output contains specd tags, entry points, graph protocol; verify `extraInstructions` renders inline when supplied
      (Req: Shared Base Instruction Template, Base Prompt Rendering Interface)

- [x] 1.7 Add unit tests for block management
      `packages/skills/test/application/specd-block-manager.spec.ts`: unit tests — verify `injectSpecdBlock`/`removeSpecdBlock` base blocks, plugin blocks, non-empty guard, legacy marker cleanup
      Approach: Test against temporary files using Vitest — inject/update/remove base and plugin blocks; verify that removing a plugin blockId does not remove the base block
      (Req: Idempotent Markdown Block Management)

## 2. Plugin Manager Integration (@specd/plugin-manager)

- [x] 2.1 Integrate Agent Initialization phase into `InstallPlugin`
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts`: `InstallPlugin.execute()` — orchestrate agent prompt injection during install
      Approach: Delegate to `plugin.install()` which handles prompt injection internally
      (Req: Agent Initialization Phase)

- [x] 2.2 Integrate cleanup into `UninstallPlugin`
      `packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts`: `UninstallPlugin.execute()` — orchestrate block removal during uninstall
      Approach: Delegate to `plugin.uninstall()` which calls `removeSpecdBlock` for cleanup
      (Req: Agent Initialization Phase)

- [x] 2.3 Add unit tests for `InstallPlugin` and `UninstallPlugin` prompt coordination
      `packages/plugin-manager/test/application/install-plugin.spec.ts`: unit tests — verify agent initialization and cleanup
      Approach: Mock `AgentPlugin` and verify `CLAUDE.md` / `AGENTS.md` block updates during `InstallPlugin` and `UninstallPlugin`
      (Req: Agent Initialization Phase)

## 3. Agent Plugins — Prompt Injection

- [x] 3.1 Implement prompt injection in `plugin-agent-claude` (exclusive file)
      `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`: `install()` — inject prompt to `CLAUDE.md`
      Approach: Call `renderBaseAgentInstruction()` and `injectSpecdBlock(claudeMdPath, prompt)`. No plugin marker (exclusive file)
      (Req: Prompt Injection)

- [x] 3.2 Implement uninstall prompt cleanup in `plugin-agent-claude`
      `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`: `uninstall()` — remove prompt from `CLAUDE.md`
      Approach: Call `removeSpecdBlock(claudeMdPath)`
      (Req: Prompt Injection)

- [x] 3.3 Implement prompt injection in `plugin-agent-opencode` (shared file, no marker)
      `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`: `install()` — inject prompt to `AGENTS.md`, purge legacy markers
      Approach: Call `injectSpecdBlock(agentsMdPath, prompt)` then `removeSpecdBlock(agentsMdPath, 'opencode')` to remove any legacy marker blocks
      (Req: Prompt Injection)

- [x] 3.4 Implement uninstall prompt cleanup in `plugin-agent-opencode`
      `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`: `uninstall()` — remove legacy marker and base block from `AGENTS.md`
      Approach: Call `removeSpecdBlock(agentsMdPath, 'opencode')` (no-op if not present), then `removeSpecdBlock(agentsMdPath)`
      (Req: Prompt Injection)

- [x] 3.5 Implement prompt injection in `plugin-agent-copilot` (exclusive file)
      `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`: `install()` — inject prompt to `.github/copilot-instructions.md`
      Approach: Call `renderBaseAgentInstruction()` and `injectSpecdBlock(copilotInstructionsPath, prompt)`
      (Req: Prompt Injection)

- [x] 3.6 Implement uninstall prompt cleanup in `plugin-agent-copilot`
      `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`: `uninstall()` — remove prompt
      Approach: Call `removeSpecdBlock(copilotInstructionsPath)`
      (Req: Prompt Injection)

- [x] 3.7 Implement prompt injection in `plugin-agent-codex` (shared file, no marker)
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`: `install()` — inject prompt to `AGENTS.md`, purge legacy markers
      Approach: Call `injectSpecdBlock(agentsMdPath, prompt)` then `removeSpecdBlock(agentsMdPath, 'codex')` to remove any legacy marker blocks
      (Req: Prompt Injection)

- [x] 3.8 Implement uninstall prompt cleanup in `plugin-agent-codex`
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`: `uninstall()` — remove base block from `AGENTS.md`
      Approach: Call `removeSpecdBlock(agentsMdPath, 'codex')` (no-op if not present), then `removeSpecdBlock(agentsMdPath)`
      (Req: Prompt Injection)

- [x] 3.9 Implement prompt injection in `plugin-agent-standard` (shared file, no marker)
      `packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`: `install()` — inject prompt to `AGENTS.md`, purge legacy markers
      Approach: Call `injectSpecdBlock(agentsMdPath, prompt)` then `removeSpecdBlock(agentsMdPath, 'standard')` to remove any legacy marker blocks
      (Req: Prompt Injection)

- [x] 3.10 Implement uninstall prompt cleanup in `plugin-agent-standard`
      `packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`: `uninstall()` — remove base block from `AGENTS.md`
      Approach: Call `removeSpecdBlock(agentsMdPath, 'standard')` (no-op if not present), then `removeSpecdBlock(agentsMdPath)`
      (Req: Prompt Injection)

## 4. Agent Plugin Integration Tests (Prompt Injection)

- [x] 4.1 Add integration tests for plugin-agent-claude prompt injection and uninstall
      `packages/plugin-agent-claude/test/install-skills.spec.ts`: integration tests — verify `CLAUDE.md` block injection and removal
      Approach: Run `install()` and `uninstall()` on temp project directory; assert base block presence (exclusive file)
      (Req: Prompt Injection)

- [x] 4.2 Add integration tests for plugin-agent-opencode prompt injection and uninstall
      `packages/plugin-agent-opencode/test/install-skills.spec.ts`: integration tests — verify `AGENTS.md` base block injection, legacy marker removal, and uninstall teardown
      Approach: Run `install()` and `uninstall()` on temp project directory; assert no plugin marker block; assert legacy marker removed on install
      (Req: Prompt Injection)

- [x] 4.3 Add integration tests for plugin-agent-copilot, plugin-agent-codex, plugin-agent-standard
      `packages/plugin-agent-copilot/test/install-skills.spec.ts`, `packages/plugin-agent-codex/test/install-skills.spec.ts`, `packages/plugin-agent-standard/test/install-skills.spec.ts`: integration tests
      Approach: Run `install()` and `uninstall()` on temp project directories; assert base block injection and safe teardown
      (Req: Prompt Injection)

## 5. Documentation

- [x] 5.1 Update SDK and core documentation for agent plugin installation
      `docs/sdk/` & `docs/core/`: documentation — document agent prompt initialization and block management during `specd plugin install`
      Approach: Update markdown documentation detailing `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md` block injection and reference-counted cleanup
      (Req: Agent Initialization Phase)
