# Spec Compliance & Test Coverage Audit Report: `plugin-manager` & `skills`

**Change Set:** `agent-plugin-prompt-injection`  
**Target Specs Audited:**

1. [`plugin-manager:install-plugin-use-case`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts)
2. [`skills:agent-instruction-template`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts)

**Report File:** `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260727-064747-agent-plugin-prompt-injection/reports/20260727-193200/_partial-plugin-manager-and-skills.md`  
**Audit Timestamp:** 2026-07-27T19:35:45+02:00

---

## 1. Executive Summary

This audit evaluates the compliance and test coverage of the implementation in `packages/plugin-manager` and `packages/skills` against the merged specs for change `agent-plugin-prompt-injection`.

### Overall Compliance Status

- **`plugin-manager:install-plugin-use-case`**: **Fully Compliant (100%)**. Test suite passing: 17/17 tests.
- **`skills:agent-instruction-template`**: **Partially Compliant / Has Implementation Bug & Spec Drift**. Test suite: 40/41 tests passing (1 test failing due to regex typo in legacy block purging).

### Critical Findings Summary

1. **Implementation Bug in `specd-block-manager.ts`**:
   - Lines 55, 76, and 146 of `packages/skills/src/application/specd-block-manager.ts` contain regexes for legacy block purging using `<!-- /specd-plugin:... -->` instead of valid HTML comment syntax `<!-- </specd-plugin:...> -->` (missing the `<` character before `/`).
   - This causes legacy block purging to fail when encountering legacy blocks written as `<!-- </specd-plugin:...> -->`, resulting in 1 unit test failure in `packages/skills/test/application/specd-block-manager.spec.ts`.
2. **Spec-Code Drift in `skills:agent-instruction-template`**:
   - The merged spec preview for `skills:agent-instruction-template` under _Idempotent Markdown Block Management_ and _Shared File Plugin Registration_ specifies that each plugin injects a separate `<!-- <specd-plugin:<blockId>> -->` comment block into shared files like `AGENTS.md`.
   - The implementation was updated in `agent-plugin-prompt-injection` to use the **Tag Attribute Registration Strategy** (`<!-- <specd agents="opencode,codex"> -->`), consolidating all agent registrations into a single `<specd>` block. The spec text in `skills:agent-instruction-template` was not updated to reflect this consolidated tag attribute design.

---

## 2. Audit: `plugin-manager:install-plugin-use-case`

### 2.1 Specification Overview

The `plugin-manager:install-plugin-use-case` defines the orchestrator use case for loading and installing agent plugins via `PluginLoader`.

### 2.2 Requirements Compliance Matrix

| Requirement                   | Spec Definition                                                                                                           | Implementation Symbol / Location                                                                                                                         | Compliance Status |
| :---------------------------- | :------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- |
| **Input Interface**           | `InstallPluginInput` with `pluginName: string`, `config: SpecdConfig`, `options?: Record<string, unknown>`                | [`InstallPluginInput`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L9-L24)         | **Compliant**     |
| **Output Interface**          | `InstallPluginOutput` with `success: boolean`, `message: string`, `data?: unknown`                                        | [`InstallPluginOutput`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L29-L44)       | **Compliant**     |
| **Behavior: Load Plugin**     | Loads plugin dynamically via `loader.load(input.pluginName)`                                                              | [`InstallPlugin.execute`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L65)         | **Compliant**     |
| **Behavior: Validation**      | Validates plugin with `isAgentPlugin` guard; throws `PluginValidationError` if invalid                                    | [`InstallPlugin.execute`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L66-L68)     | **Compliant**     |
| **Behavior: Delegation**      | Calls `plugin.install(input.config, input.options)`                                                                       | [`InstallPlugin.execute`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L69)         | **Compliant**     |
| **Behavior: Config Mutation** | Does NOT mutate `SpecdConfig` (returns execution data to CLI)                                                             | [`InstallPlugin.execute`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/install-plugin.ts#L70-L74)     | **Compliant**     |
| **Error Handling**            | Throws `PluginNotFoundError` when plugin missing, `PluginValidationError` when not an `AgentPlugin` or when install fails | [`PluginValidationError`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/errors/plugin-validation.ts#L7-L20)           | **Compliant**     |
| **Lifecycle Teardown**        | `UninstallPlugin` delegates lifecycle teardown to `plugin.uninstall(input.config, input.options)`                         | [`UninstallPlugin.execute`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts#L44-L50) | **Compliant**     |

### 2.3 Verification Scenarios & Test Coverage Analysis

- **Test Suite**: `pnpm --filter @specd/plugin-manager test`
- **Result**: **17 / 17 tests passed** (100% pass rate).

| Verification Scenario                                     | Test Location                                                                                                                                         | Status       |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :----------- |
| **Input includes pluginName and config**                  | [`install-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L10-L38)     | **Verified** |
| **Output indicates success or failure**                   | [`install-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L35)         | **Verified** |
| **Plugin not found**                                      | [`plugin-loader.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/infrastructure/plugin-loader.spec.ts)            | **Verified** |
| **Successful install**                                    | [`install-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L10-L38)     | **Verified** |
| **Loads plugin via PluginLoader & validates AgentPlugin** | [`install-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L37)         | **Verified** |
| **Non-agent plugin rejected with PluginValidationError**  | [`install-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/install-plugin.spec.ts#L40-L59)     | **Verified** |
| **Uninstall delegates to plugin.uninstall()**             | [`uninstall-plugin.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/application/uninstall-plugin.spec.ts#L10-L33) | **Verified** |

---

## 3. Audit: `skills:agent-instruction-template`

### 3.1 Specification Overview

The `skills:agent-instruction-template` spec defines standard prompt templates (`renderBaseAgentInstruction`), block management (`injectSpecdBlock`, `removeSpecdBlock`), and JSON config utilities (`mergeJsonConfig`, `unmergeJsonConfig`).

### 3.2 Requirements Compliance Matrix

| Requirement                              | Spec Definition                                                                                                                 | Implementation Symbol / Location                                                                                                                                                                                                                                           | Compliance Status                                                |
| :--------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| **Shared Base Prompt Template**          | Handlebars template with `/specd`, `/specd-new`, graph search, rules, and optional `extraInstructions`                          | [`agent-instruction.md.tpl`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/templates/prompt/agent-instruction.md.tpl#L1-L70)                                                                                                                               | **Compliant**                                                    |
| **Base Prompt Renderer Interface**       | `renderBaseAgentInstruction(options?: RenderBaseAgentInstructionOptions): Promise<string>`                                      | [`renderBaseAgentInstruction`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/render-base-agent-instruction.ts#L21-L31)                                                                                                                     | **Compliant**                                                    |
| **Idempotent Markdown Block Management** | `injectSpecdBlock` and `removeSpecdBlock` insert, update, or remove `<specd>` comment blocks without touching user content      | [`specd-block-manager.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L38-L213)                                                                                                                                  | **Compliant (Functionality)**                                    |
| **Reference-Counting Strategy**          | Multi-agent registration on shared instruction files (e.g. `AGENTS.md`) using tag attribute `<!-- <specd agents="id1,id2"> -->` | [`injectSpecdBlock`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L83-L101) & [`removeSpecdBlock`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L177-L212) | **Compliant in Code / Spec Drift**                               |
| **Legacy Block Purging**                 | Automatically purges legacy `<!-- <specd-plugin:* -->` blocks during block operations                                           | [`specd-block-manager.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L54,L75,L145)                                                                                                                              | **BUG FOUND** (Regex typo: missing `<` in `<!-- /specd-plugin:`) |
| **JSON Config Utilities**                | `mergeJsonConfig<T>` & `unmergeJsonConfig<T>` for safe JSON updating with formatting and fallback handling                      | [`json-config-manager.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/json-config-manager.ts#L11-L48)                                                                                                                                   | **Compliant**                                                    |

### 3.3 Reference-Counting Tag Attribute Strategy Audit

The prompt injection architecture uses the **Tag Attribute Registration Strategy** for shared instruction files (such as `AGENTS.md`):

1. **Tag Format**:
   - Single agent registered: `<!-- <specd agents="opencode"> -->`
   - Multiple agents registered: `<!-- <specd agents="opencode,codex"> -->`
   - Default / no agent ID provided: `<!-- <specd> -->`
2. **Injection Algorithm** (`injectSpecdBlock`):
   - Scans existing file content for `<!-- <specd agents="..."> -->` tags.
   - Extracts current agent IDs into a `Set<string>`.
   - Adds the new `blockId` (e.g. `'codex'`).
   - Renders a single consolidated base prompt wrapped in `<!-- <specd agents="opencode,codex"> -->` ... `<!-- </specd> -->`.
3. **Removal Algorithm** (`removeSpecdBlock`):
   - Removes `blockId` from the set of active agents.
   - If `updatedAgents.length > 0`, updates tag to `<!-- <specd agents="..."> -->` and preserves the prompt block.
   - If `updatedAgents.length === 0` (last agent uninstalled), removes the `<!-- <specd> -->` block entirely (and deletes the file if no user content remains).

### 3.4 Verification Scenarios & Test Coverage Analysis

- **Test Suite**: `pnpm --filter @specd/skills test`
- **Result**: **40 / 41 tests passed** (1 test failed due to regex bug).

| Verification Scenario                                                | Test Location                                                                                                                                                           | Status                    |
| :------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------ |
| **Renders standard specd entry points and rules**                    | [`render-base-agent-instruction.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/render-base-agent-instruction.spec.ts#L5-L15)  | **Verified**              |
| **Renders inline extraInstructions when supplied**                   | [`render-base-agent-instruction.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/render-base-agent-instruction.spec.ts#L17-L25) | **Verified**              |
| **Injects base block into new or existing file**                     | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L20-L42)                     | **Verified**              |
| **Updates existing base block idempotently**                         | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L44-L53)                     | **Verified**              |
| **Plugin blockId registers agent in tag attribute**                  | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L55-L64)                     | **Verified**              |
| **Multiple plugins append agents to tag attribute**                  | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L66-L74)                     | **Verified**              |
| **Reference-counted cleanup updates tag attribute**                  | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L88-L98)                     | **Verified**              |
| **Reference-counted cleanup deletes block when last plugin removed** | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L100-L108)                   | **Verified**              |
| **Purges legacy plugin marker comment block**                        | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L110-L123)                   | **FAILED** (Bug in regex) |
| **Exclusive-file plugin removes base block**                         | [`specd-block-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/specd-block-manager.spec.ts#L125-L133)                   | **Verified**              |
| **mergeJsonConfig creates file & preserves existing keys**           | [`json-config-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/json-config-manager.spec.ts#L19-L47)                     | **Verified**              |
| **unmergeJsonConfig no-op when missing & removes keys when present** | [`json-config-manager.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/test/application/json-config-manager.spec.ts#L49-L73)                     | **Verified**              |

---

## 4. Detailed Discrepancies, Bugs, & Spec Drift

### 4.1 Bug: Regex Syntax Error in Legacy Block Purging ([`specd-block-manager.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L54-L61))

- **Location**: [`packages/skills/src/application/specd-block-manager.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/skills/src/application/specd-block-manager.ts#L55) Lines 55, 76, and 146.
- **Problem**:
  ```ts
  // Lines 54-56 (and similar in L75-79, L145-149)
  const pluginOuterRegex = new RegExp(
    `^<!-- <specd-plugin:${escapeRegExp(blockId)}> -->\\s*([\\s\\S]*?)\\s*<!-- /specd-plugin:${escapeRegExp(blockId)}> -->$`,
  )
  ```
  Notice the closing tag in the regex: `<!-- /specd-plugin:... -->`.
  The opening tag uses `<specd-plugin:...>`, so standard closing tag syntax is `<!-- </specd-plugin:...> -->` (with `</`).
  Because `<` was omitted before `/`, the regex fails to match standard legacy closing tags like `<!-- </specd-plugin:opencode> -->`.
- **Impact**:
  When `removeSpecdBlock` or `injectSpecdBlock` encounters a file with legacy `<!-- <specd-plugin:opencode> --> ... <!-- </specd-plugin:opencode> -->` tags, it fails to strip them.
  This causes the unit test `given existing file with legacy plugin marker and base block, when plugin marker removed, then purges legacy marker` in `specd-block-manager.spec.ts` to fail:
  ```
  AssertionError: expected '# Existing Project Instructions\n\n<!…' not to contain '<!-- <specd-plugin:opencode> -->'
  ```
- **Recommended Code Fix**:
  Change `<!-- /specd-plugin:` to `<!-- </specd-plugin:` on lines 55, 76, and 146 of `packages/skills/src/application/specd-block-manager.ts`.

---

### 4.2 Spec Drift: Outdated Block Management Requirement in `skills:agent-instruction-template`

- **Location**: Spec file `packages/skills/src/domain/templates/agent-instruction-template/spec.md` (or merged preview).
- **Problem**:
  The spec text under _Requirement: Idempotent Markdown Block Management_ states:

  > `injectSpecdBlock` MUST manage blocks delimited by `<!-- <specd-plugin:<blockId>> -->` ... `<!-- </specd-plugin:<blockId>> -->` when `blockId` is provided.

  And under _Requirement: Shared File Plugin Registration_:

  > Scenario: Shared-file plugin injects both base block and plugin marker  
  > THEN `AGENTS.md` contains both `<!-- <specd> -->` base block and `<!-- <specd-plugin:codex> -->` marker block.

  However, in change `agent-plugin-prompt-injection`, the architecture evolved to the **Tag Attribute Registration Strategy** (`<!-- <specd agents="id1,id2"> -->`).

- **Impact**:
  The code correctly implements tag attribute registration (`<!-- <specd agents="..."> -->`), but the spec description has drifted and still describes separate marker blocks (`<!-- <specd-plugin:...> -->`).
- **Recommended Spec Fix**:
  Update the spec text in `skills:agent-instruction-template` to document `<!-- <specd agents="id1,id2"> -->` as the standard reference-counting mechanism for shared instruction files.

---

## 5. Conclusion & Action Items

1. **`plugin-manager:install-plugin-use-case`**: No code or spec changes required. Fully compliant with passing tests.
2. **`skills:agent-instruction-template` Code Fix**: Update `specd-block-manager.ts` lines 55, 76, and 146 to fix the legacy tag regex typo (`<!-- </specd-plugin:`).
3. **`skills:agent-instruction-template` Spec Fix**: Update the requirement text in `skills:agent-instruction-template` to reflect `<!-- <specd agents="..."> -->` tag attribute reference counting.
