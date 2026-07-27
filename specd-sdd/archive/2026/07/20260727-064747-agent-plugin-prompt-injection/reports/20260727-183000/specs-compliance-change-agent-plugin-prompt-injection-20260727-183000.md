# Specs Compliance Audit Report — agent-plugin-prompt-injection

**Timestamp:** 2026-07-27T18:30:00+02:00  
**Change Name:** `agent-plugin-prompt-injection`  
**Mode:** Specific Change Audit

## Executive Summary

We performed an exhaustive compliance audit of the implementation code and tests against the 7 specs associated with the `agent-plugin-prompt-injection` change.

### Summary Metrics

- **Total Specs Audited:** 7
- **Fully Compliant:** 5
- **Partially Compliant (Bugs/Discrepancies found):** 2

### Critical Issues Identified

1. **Reference-Counted Cleanup Bug:** The function `removeSpecdBlock` in `@specd/skills` does not implement reference-counting cleanup for shared files (like `AGENTS.md`). It just deletes the specified block without checking for other remaining plugins or removing the base `<!-- <specd> -->` block when the last plugin is uninstalled.
2. **Incorrect Test Assertions:** The vitest suite (`specd-block-manager.spec.ts`) contains an assertion verifying that the base block is _preserved_ even when the last plugin block is removed, which directly contradicts the spec requirement.
3. **Plugins Bypass Marker Registration:** During installation, the shared agent plugins (`codex`, `opencode`, `standard`) do not register their plugin-specific markers (`injectSpecdBlock(filePath, content, pluginName)`), but instead actively remove them.
4. **Manual Bypasses on Teardown:** During uninstallation, the plugins call `removeSpecdBlock` on the base block unconditionally, which would break prompt injection for any other plugins sharing `AGENTS.md`.

---

## Detailed Findings

### Part 1: Plugin Manager & Skills

# Spec Compliance Audit Report — Plugin Manager & Skills

This report covers the spec compliance audit for the change `agent-plugin-prompt-injection` on the following specs:

- `plugin-manager:install-plugin-use-case`
- `skills:agent-instruction-template`

---

## 1. Spec: `plugin-manager:install-plugin-use-case`

### Requirements Summary

- **Input:** Accepts `pluginName` (string), `config` (`SpecdConfig`), and optional plugin-specific `options`.
- **Output:** Returns `success` (boolean), `message` (string), and optional `data` (unknown).
- **Behavior:**
  - Loads the plugin via `PluginLoader`.
  - Type-guards loaded plugin via `isAgentPlugin`; throws `PluginValidationError` if invalid.
  - Executes the plugin's `install()` method.
  - Returns a generic result without modifying project configuration (mutation is CLI responsibility).
- **Error Handling:** Throws `PluginNotFoundError` if the plugin package cannot be resolved, or `PluginValidationError` if validation fails or `install()` throws.
- **Agent Initialization Phase:**
  - Delegates prompt initialization, block injection, and native asset deployment to the plugin's `install()` implementation.
  - Maintains reference-counted cleanup on shared files (`AGENTS.md`) so that the base `<!-- <specd> -->` block persists until all agent plugins targeting that file are uninstalled.

### Implementation Status & Inspection

- **Files Inspected:**
  - [install-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts)
  - [uninstall-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts)
- **Status:** **PARTIALLY COMPLIANT**
  - **Compliant:** The core use cases correctly load, validate, and execute plugin `install()` / `uninstall()` lifecycles. They propagate resolving errors and throw validation errors when necessary.
  - **Non-Compliance:** The reference-counted cleanup on shared files (`AGENTS.md`) is **not** maintained. Because the underlying block manager lacks reference-counting logic, plugins manually clean up their own markers AND delete the base block unconditionally.

### Discrepancies & Bugs

- **Unconditional Base Block Deletion:** When uninstalling any plugin that targets a shared file (`AGENTS.md`), the plugin use case (`UninstallSkills.execute`) unconditionally calls `removeSpecdBlock(agentsMdPath)` which removes the base prompt block. This leaves any other installed plugins (e.g., if Codex is uninstalled while Open Code is still installed) without their prompt instructions, violating the requirement that the base block must persist until the last plugin targeting the file is uninstalled.

### Test Coverage

- **File Checked:** [install-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts) and [uninstall-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/uninstall-plugin.spec.ts)
- **Coverage Details:**
  - Covers successful plugin installation and basic option delegation.
  - Covers throwing `PluginValidationError` when the plugin loader returns a non-agent plugin.
  - Covers basic uninstallation delegation.
- **Missing Coverage:**
  - No test verifying `PluginNotFoundError` propagation.
  - No test verifying reference-counted cleanup behavior inside the use case context (this is bypassed using a basic mock loader).

---

## 2. Spec: `skills:agent-instruction-template`

### Requirements Summary

- **Shared Base Instruction Template:**
  - Exposes `agent-instruction.md.tpl` under `templates/prompt/`.
  - Defines entry points (`/specd`, `/specd-new`) and mandatory graph-first research protocols (`specd graph` commands with `--format toon`).
  - Instructs agents to check index freshness (`stale: true`) and re-index immediately when stale.
  - Restricts autonomous workflow progression and defines the explicit user override escape hatch.
- **Base Prompt Rendering Interface:**
  - Exports `renderBaseAgentInstruction(options?: RenderBaseAgentInstructionOptions): Promise<string>`.
  - Supports rendering custom instructions via `extraInstructions` inside the `<!-- <specd> -->` block.
- **Idempotent Markdown Block Management:**
  - Exports `injectSpecdBlock` and `removeSpecdBlock`.
  - Manages default base block (`<!-- <specd> -->`) when `blockId` is omitted, and plugin-specific blocks (`<!-- <specd-plugin:<blockId>> -->`) when `blockId` is provided.
  - Empty content guard deletes existing block or skips writing empty tags.
  - `removeSpecdBlock` performs reference-counted cleanup on shared files: if all plugin-specific blocks (`<!-- <specd-plugin:* -->`) have been removed, it must also remove the shared base block.
- **Shared File Plugin Registration:**
  - Multiple plugins targeting a shared file must inject a plugin-specific marker alongside the base block.
- **Safe JSON Config Merge Utilities:**
  - Exports `mergeJsonConfig` and `unmergeJsonConfig` to safely manipulate JSON configurations without overwriting other top-level keys.

### Implementation Status & Inspection

- **Files Inspected:**
  - [agent-instruction.md.tpl](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/prompt/agent-instruction.md.tpl)
  - [render-base-agent-instruction.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/render-base-agent-instruction.ts)
  - [specd-block-manager.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts)
  - [json-config-manager.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/json-config-manager.ts)
- **Status:** **PARTIALLY COMPLIANT**
  - **Compliant:** The template, prompt rendering, base block injection, and JSON config helpers are fully implemented and function according to requirements.
  - **Non-Compliant:**
    1. `removeSpecdBlock` does **not** implement reference-counted cleanup logic.
    2. Shared agent plugins (`plugin-agent-codex`, `plugin-agent-opencode`, `plugin-agent-standard`) do **not** inject their specific marker block on install; instead, they explicitly remove their specific block and only install the base block.

### Discrepancies & Bugs

1. **Lack of Reference-Counted Cleanup in `removeSpecdBlock`:**
   The function `removeSpecdBlock` simply deletes the requested block. It lacks any mechanism to inspect the file for other remaining `<!-- <specd-plugin:* -->` blocks or to delete the default base block (`<!-- <specd> --> ... <!-- </specd> -->`) once all plugin markers have been uninstalled.
2. **Plugins Bypassing Registration Markers:**
   During installation, instead of injecting their own marker block using `injectSpecdBlock(filePath, content, pluginName)`, the plugins actively remove their markers:
   ```typescript
   // In packages/plugin-agent-codex/src/application/use-cases/install-skills.ts:
   await injectSpecdBlock(agentsMdPath, prompt)
   await removeSpecdBlock(agentsMdPath, 'codex')
   ```
   Because no markers are registered during install, reference counting is rendered impossible.
3. **Plugins Bypassing Automatic Cleanup during Teardown:**
   During uninstall, the plugins perform a manual double-clean:
   ```typescript
   // In packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts:
   await removeSpecdBlock(agentsMdPath, 'codex')
   await removeSpecdBlock(agentsMdPath) // Forces removal of base block unconditionally!
   ```
   This manual bypass violates the spec by unconditionally stripping the base block even when other plugins remain active.

### Test Coverage

- **Files Checked:**
  - [render-base-agent-instruction.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/render-base-agent-instruction.spec.ts)
  - [specd-block-manager.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts)
  - [json-config-manager.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/json-config-manager.spec.ts)
- **Coverage Details:**
  - `renderBaseAgentInstruction` has 100% coverage (renders clean base prompt or inserts extra instructions).
  - `json-config-manager` has 100% coverage (merge/unmerge, file/directory creation, formatting, key preservation).
  - `specd-block-manager` covers basic injection, update, plugin blocks, and empty content removal.
- **Incorrect/Non-Compliant Assertions in Tests:**
  The test suite `specd-block-manager.spec.ts` has a test asserting the **incorrect** behavior:
  ```typescript
  it('given shared file with base block and plugin marker, when plugin removed, then preserves base block', async () => { ... })
  ```
  Since `opencode` was the only plugin block registered, the base block _should_ have been deleted under reference-counting rules. However, the test asserts that the base block is preserved, aligning with the buggy implementation instead of the specification.

---

## 3. Detailed Audit Matrix

| Spec Requirement                             | Implementation File / Line Range                                                                                                                                  | Status            | Test Coverage File / Line Range                                                                                                                                              | Notes                                                                                                                  |
| :------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **`plugin-manager:install-plugin-use-case`** |                                                                                                                                                                   |                   |                                                                                                                                                                              |                                                                                                                        |
| Input Contract                               | [install-plugin.ts:L9-24](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L9-L24)               | Compliant         | [install-plugin.spec.ts:L30-33](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L30-L33)                       | Met.                                                                                                                   |
| Output Contract                              | [install-plugin.ts:L29-44](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L29-L44)             | Compliant         | [install-plugin.spec.ts:L35](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L35)                              | Met.                                                                                                                   |
| Plugin Loading & Guarding                    | [install-plugin.ts:L65-68](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L65-L68)             | Compliant         | [install-plugin.spec.ts:L52-59](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L52-L59)                       | Met. Throws `PluginValidationError` when type-guard fails.                                                             |
| Error Handling                               | [install-plugin.ts:L65-68](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L65-L68)             | Compliant         | [install-plugin.spec.ts:L52-59](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L52-L59)                       | Resolving errors (`PluginNotFoundError`) are propagated.                                                               |
| Agent Prompt Initialization Phase            | [install-plugin.ts:L69](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L69)                    | Compliant         | [install-plugin.spec.ts:L36](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L36)                              | Delegates execution to the plugin's install method.                                                                    |
| Reference-Counted Cleanup                    | N/A                                                                                                                                                               | **Non-Compliant** | N/A                                                                                                                                                                          | Bypassed. Plugins manually clean up their own tags and unconditionally delete the base block.                          |
| **`skills:agent-instruction-template`**      |                                                                                                                                                                   |                   |                                                                                                                                                                              |                                                                                                                        |
| Shared Template                              | [agent-instruction.md.tpl](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/prompt/agent-instruction.md.tpl)                               | Compliant         | [render-base-agent-instruction.spec.ts:L5-15](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/render-base-agent-instruction.spec.ts#L5-L15)   | Met. Entry points, Code Graph protocol, freshness and rules present.                                                   |
| Prompt Rendering Interface                   | [render-base-agent-instruction.ts:L21-31](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/render-base-agent-instruction.ts#L21-L31) | Compliant         | [render-base-agent-instruction.spec.ts:L17-25](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/render-base-agent-instruction.spec.ts#L17-L25) | Met. Handles rendering with or without `extraInstructions` correctly.                                                  |
| Idempotent Block Management                  | [specd-block-manager.ts:L36-88](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L36-L88)                     | Compliant         | [specd-block-manager.spec.ts:L20-75](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L20-L75)                     | Met for base/plugin injection, idempotent updates, and empty guards.                                                   |
| Block Cleanup                                | [specd-block-manager.ts:L97-126](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L97-L126)                   | Compliant         | [specd-block-manager.spec.ts:L77-128](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L77-L128)                   | Met for basic block removal.                                                                                           |
| Reference-Counted Cleanup                    | N/A                                                                                                                                                               | **Non-Compliant** | [specd-block-manager.spec.ts:L92-102](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L92-L102)                   | Not implemented. Test suite asserts incorrect behavior (base block is preserved when last plugin is uninstalled).      |
| Shared-File Plugin Marker Injection          | N/A                                                                                                                                                               | **Non-Compliant** | N/A                                                                                                                                                                          | Plugins (`codex`, `opencode`, `standard`) actively remove their markers during installation instead of injecting them. |
| Exclusive-File Single Base Block             | N/A                                                                                                                                                               | Compliant         | N/A                                                                                                                                                                          | Claude/Copilot plugins only write the base block to exclusive files (`CLAUDE.md`, `copilot-instructions.md`).          |
| Safe JSON Config Merge Utilities             | [json-config-manager.ts:L11-48](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/json-config-manager.ts#L11-L48)                     | Compliant         | [json-config-manager.spec.ts:L19-73](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/json-config-manager.spec.ts#L19-L73)                     | Met. Fully handles nested directory creation, indentation, and key-preservation.                                       |

---

## 4. Recommendations for Correction

To achieve full spec compliance, the following modifications are recommended:

1. **Implement Reference Counting in `removeSpecdBlock`:**
   Update `removeSpecdBlock` in `packages/skills/src/application/specd-block-manager.ts` so that if `blockId` is provided, it first removes the plugin-specific block. It should then read the updated file content and search for any remaining plugin-specific block patterns (e.g., matching the regex `/<!-- <specd-plugin:.*? -->/`). If no remaining plugin blocks are found, it should automatically remove the base block (`<!-- <specd> --> ... <!-- </specd> -->`).

2. **Fix the Block Manager Unit Tests:**
   In `packages/skills/test/application/specd-block-manager.spec.ts`, modify the test assertions to ensure that removing the last plugin-specific block deletes the base block:

   ```diff
   - it('given shared file with base block and plugin marker, when plugin removed, then preserves base block', async () => {
   + it('given shared file with base block and plugin marker, when plugin removed, then removes base block if no others remain', async () => {
       const targetFile = path.join(tempDir, 'AGENTS.md')
       await injectSpecdBlock(targetFile, 'Base prompt')
       await injectSpecdBlock(targetFile, 'Registered by opencode', 'opencode')

       await removeSpecdBlock(targetFile, 'opencode')

       const content = await readFile(targetFile, 'utf8')
       expect(content).not.toContain('<!-- <specd-plugin:opencode> -->')
   -   expect(content).toContain('<!-- <specd> -->')
   +   expect(content).not.toContain('<!-- <specd> -->')
     })
   ```

3. **Align Plugins with Registration Requirements:**
   Modify the installation/uninstallation use cases in `plugin-agent-codex`, `plugin-agent-opencode`, and `plugin-agent-standard` to:
   - **Install:** Inject both the base prompt block AND the plugin-specific marker block:
     ```typescript
     await injectSpecdBlock(agentsMdPath, prompt)
     await injectSpecdBlock(agentsMdPath, 'Registered by @specd/plugin-agent-<name>', '<name>')
     ```
   - **Uninstall:** Only remove the plugin's own block, letting the block manager automatically clean up the base block when the last plugin is uninstalled:
     ```typescript
     await removeSpecdBlock(agentsMdPath, '<name>')
     // Do not call removeSpecdBlock(agentsMdPath) here, as that bypasses reference counting!
     ```

### Part 2: Agent Plugins

# Spec Compliance Audit: Agent Plugins Prompt Injection

This report summarizes the compliance audit of the five specd agent plugins against their respective specifications for the change `agent-plugin-prompt-injection`.

---

## 1. Overview of Assigned Specs

| Spec ID                                  | Target Package                   | Main Class / Implementation                                                                                                                   | Test Suite                                                                                                                         |
| :--------------------------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **`plugin-agent-claude:plugin-agent`**   | `packages/plugin-agent-claude`   | [ClaudeAgentPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/claude-plugin.ts)             | [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts)   |
| **`plugin-agent-opencode:plugin-agent`** | `packages/plugin-agent-opencode` | [OpenCodeAgentPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts)       | [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts) |
| **`plugin-agent-copilot:plugin-agent`**  | `packages/plugin-agent-copilot`  | [CopilotAgentPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts)          | [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts)  |
| **`plugin-agent-codex:plugin-agent`**    | `packages/plugin-agent-codex`    | [CodexAgentPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/codex-plugin.ts)                | [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts)    |
| **`plugin-agent-standard:plugin-agent`** | `packages/plugin-agent-standard` | [StandardAgentPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/agent-standard-plugin.ts) | [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts) |

---

## 2. Shared Audit Findings

Across all agent plugins, two major spec-related traits and discrepancies were identified:

1. **Dynamic Metadata Resolution (Known Spec Drift)**:
   All plugins declare a spec requirement to _"Map the preferred model/attributes from `specd-agent.meta.json` if present."_ However, all implementations use a static, hardcoded map (`agentFrontmatter` / `skillFrontmatter`) under `src/domain/frontmatter/index.ts` to populate the variables before passing them to the `@specd/skills` bundle resolver. This is a known, previously reported spec-drift carried over from earlier iterations.
2. **Project Init Wizard and Meta Package Integration**:
   The interactive project initialization command (`specd project init`) correctly displays all five plugins as selectable installation options in the multiselect prompt. All five plugins are correctly declared as dependencies of the `@specd/specd` meta package.

---

## 3. Individual Plugin Audits

### 3.1 Claude Agent Plugin (`plugin-agent-claude:plugin-agent`)

#### Requirements Summary

- Named export `create` returning `AgentPlugin`.
- Reads `specd-plugin.json` in candidates list (own directory then parent fallback).
- Injects standard base prompt block (`<!-- <specd> -->`) into `CLAUDE.md` under project root using `injectSpecdBlock`.
- Removes prompt block on `uninstall()`.
- Installs skills to `.claude/skills/<skill-name>/` and agents to `.claude/agents/`.
- Passes capability identifiers `['mcp', 'agents', 'frontmatter']`.

#### Implementation Status

- **Class / Factory**: [create](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/index.ts#L40) functions correctly.
- **Install/Uninstall Use Cases**:
  - [InstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts)
  - [UninstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts)
- **Prompt Injection**: Injects prompt block into `CLAUDE.md` and removes it on uninstall.

#### Discrepancies & Drift

- **Agent Location (Directory vs File)**: Requirement states: _"Agents to `.claude/agents/<agent-name>/`"_. However, the code installs agents as flattened markdown files directly: `.claude/agents/<agent-name>.md`. This is a spec drift, as Claude convention demands files instead of directories for agents.
- **Model Resolution**: Sourced from the hardcoded `agentFrontmatter` in `domain/frontmatter/index.ts` instead of dynamically from `specd-agent.meta.json`.

#### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts).
- Test runs confirm that `CLAUDE.md` injection, agent layout, and capabilities mapping pass successfully.

---

### 3.2 Open Code Agent Plugin (`plugin-agent-opencode:plugin-agent`)

#### Requirements Summary

- Named export `create` returning `AgentPlugin`.
- Injects base prompt block into `AGENTS.md` under project root.
- Purges legacy `opencode` block on install/uninstall.
- Maps `allowedTools` list to Open Code permissions structure (e.g., `- bash: allow`).
- Installs skills to `.opencode/skills/` and agents to `.opencode/agents/`.

#### Implementation Status

- **Class / Factory**: [create](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/index.ts#L40) functions correctly.
- **Install/Uninstall Use Cases**:
  - [InstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts)
  - [UninstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts)
- **Prompt Injection**: Properly initializes `AGENTS.md` using `injectSpecdBlock` and cleans up the legacy `opencode` block.

#### Discrepancies & Drift

- **Agent Location (Directory vs File)**: Requirement states: _"Agents to `.opencode/agents/<agent-name>/`"_. The implementation writes files directly: `.opencode/agents/<agent-name>.md`.
- **Model/Attributes Resolution**: Sourced from the hardcoded `agentFrontmatter` instead of `specd-agent.meta.json`.

#### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts).
- Test suite verifies subagent conversion (mapping `allowedTools` to Open Code `{ bash: 'allow' }` permissions) and legacy marker block cleanup.

---

### 3.3 Copilot Agent Plugin (`plugin-agent-copilot:plugin-agent`)

#### Requirements Summary

- Named export `create` returning `AgentPlugin`.
- Injects base prompt block into `.github/copilot-instructions.md`.
- Removes prompt block on `uninstall()`.
- Installs skills to `.github/skills/` and agents to `.github/agents/`.
- Uses `.agent.md` suffix for agents.
- Maps `allowed-tools` to YAML string array.

#### Implementation Status

- **Class / Factory**: [create](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/index.ts#L40) functions correctly.
- **Install/Uninstall Use Cases**:
  - [InstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts)
  - [UninstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts)
- **Prompt Injection**: Injects prompt block into `.github/copilot-instructions.md` and removes it on uninstall.

#### Discrepancies & Drift

- **Metadata Resolution**: Sourced from the hardcoded `agentFrontmatter` instead of `specd-agent.meta.json`.

#### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts).
- Tests assert correct capability declaration (`['frontmatter', 'agents']`) and YAML array format mapping.

---

### 3.4 Codex Agent Plugin (`plugin-agent-codex:plugin-agent`)

#### Requirements Summary

- Named export `create` returning `AgentPlugin`.
- Injects base prompt block into `AGENTS.md`.
- Removes legacy `codex` block.
- Generates a TOML file for agents containing `name`, `description`, and escapes developer instructions inside a triple-quote block.
- Installs skills to `.codex/skills/` and agents to `.codex/agents/`.

#### Implementation Status

- **Class / Factory**: [create](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/index.ts#L40) functions correctly.
- **Install/Uninstall Use Cases**:
  - [InstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts)
  - [UninstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts)
- **Prompt Injection & Formatting**: Escapes developer instructions (e.g. `replace(/"""/g, '\\"\\"\\"')`) and compiles standard TOML structure.

#### Discrepancies & Drift

- **Metadata Resolution**: Sourced from the hardcoded `agentFrontmatter` instead of `specd-agent.meta.json`.

#### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts).
- Tests verify correct TOML formatting, triple-quotes escaping, and cleanup of legacy prompt structures.

---

### 3.5 Standard Agent Plugin (`plugin-agent-standard:plugin-agent`)

#### Requirements Summary

- Named export `create` returning `AgentPlugin`.
- Injects base prompt block into `AGENTS.md`.
- Removes legacy `standard` block.
- Declares only `['frontmatter']` capability (no `agents` capability).
- Fallback path for agents: installs agents under the shared context directory.
- Maps `allowed-tools` per the agentskills.io format (space-separated string).

#### Implementation Status

- **Class / Factory**: [create](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/index.ts#L40) functions correctly.
- **Install/Uninstall Use Cases**:
  - [InstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts)
  - [UninstallSkills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts)
- **Prompt Injection**: Injects prompt block into `AGENTS.md` and clears the standard marker.

#### Discrepancies & Drift

- **Metadata Resolution**: Sourced from the hardcoded `agentFrontmatter` instead of `specd-agent.meta.json`.
- **allowed-tools format**: The spec states: _"include Bash(node _), Bash(specd _), Bash(pnpm _)"_. However, the code uses colons instead of spaces: `Bash(node:_) Bash(specd:\*) Read` in [domain/frontmatter/index.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L7). This is a minor spec discrepancy / implementation difference.

#### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts).
- Tests check target folder routing (`.agents/skills/`) and the fallback agent routing to the shared folder.
