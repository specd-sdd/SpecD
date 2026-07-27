# Audit Report: Agent Plugins Prompt Injection

**Change ID**: `agent-plugin-prompt-injection`  
**Report File**: `_partial-agent-plugins.md`  
**Audit Date**: 2026-07-27

## Scope of Audit

This partial report covers the audit of 5 agent plugin specifications and their implementation:

1. `plugin-agent-claude:plugin-agent` (`packages/plugin-agent-claude`)
2. `plugin-agent-opencode:plugin-agent` (`packages/plugin-agent-opencode`)
3. `plugin-agent-copilot:plugin-agent` (`packages/plugin-agent-copilot`)
4. `plugin-agent-codex:plugin-agent` (`packages/plugin-agent-codex`)
5. `plugin-agent-standard:plugin-agent` (`packages/plugin-agent-standard`)

---

## 1. Requirements Summary

Each agent plugin specification defines prompt injection and cleanup requirements during `install()` and `uninstall()`:

| Plugin Package                   | Target File                       | Spec Prompt Injection Requirement                                                                        | Block ID     |
| :------------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------- | :----------- |
| `packages/plugin-agent-claude`   | `CLAUDE.md`                       | Injects prompt block with `<!-- <specd> -->` into `CLAUDE.md`. Removals on `uninstall()`.                | `'claude'`   |
| `packages/plugin-agent-opencode` | `AGENTS.md`                       | Injects base agent instructions block into `AGENTS.md`. Removals on `uninstall()`.                       | `'opencode'` |
| `packages/plugin-agent-copilot`  | `.github/copilot-instructions.md` | Injects base agent instruction prompt into `.github/copilot-instructions.md`. Removals on `uninstall()`. | `'copilot'`  |
| `packages/plugin-agent-codex`    | `AGENTS.md`                       | Injects base agent instructions block into `AGENTS.md`. Removals on `uninstall()`.                       | `'codex'`    |
| `packages/plugin-agent-standard` | `AGENTS.md`                       | Injects base agent instructions block into `AGENTS.md`. Removals on `uninstall()`.                       | `'standard'` |

---

## 2. Implementation Status

### Implementation Verification: `blockId` Passing

All 5 agent plugins pass their respective `blockId` to both `injectSpecdBlock` and `removeSpecdBlock` from `@specd/skills`.

1. **`plugin-agent-claude`**:
   - `install-skills.ts` ([L156-L158](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L156-L158)):
     ```typescript
     const claudeMdPath = path.join(config.projectRoot, 'CLAUDE.md')
     const prompt = await renderBaseAgentInstruction()
     await injectSpecdBlock(claudeMdPath, prompt, 'claude')
     ```
   - `uninstall-skills.ts` ([L66-L67](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts#L66-L67)):
     ```typescript
     const claudeMdPath = path.join(config.projectRoot, 'CLAUDE.md')
     await removeSpecdBlock(claudeMdPath, 'claude')
     ```
   - **Status**: ✅ Compliant

2. **`plugin-agent-opencode`**:
   - `install-skills.ts` ([L161-L163](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L161-L163)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     const prompt = await renderBaseAgentInstruction()
     await injectSpecdBlock(agentsMdPath, prompt, 'opencode')
     ```
   - `uninstall-skills.ts` ([L66-L67](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts#L66-L67)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     await removeSpecdBlock(agentsMdPath, 'opencode')
     ```
   - **Status**: ✅ Compliant

3. **`plugin-agent-copilot`**:
   - `install-skills.ts` ([L160-L162](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts#L160-L162)):
     ```typescript
     const copilotMdPath = path.join(config.projectRoot, '.github', 'copilot-instructions.md')
     const prompt = await renderBaseAgentInstruction()
     await injectSpecdBlock(copilotMdPath, prompt, 'copilot')
     ```
   - `uninstall-skills.ts` ([L59-L60](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts#L59-L60)):
     ```typescript
     const copilotMdPath = path.join(config.projectRoot, '.github', 'copilot-instructions.md')
     await removeSpecdBlock(copilotMdPath, 'copilot')
     ```
   - **Status**: ✅ Compliant

4. **`plugin-agent-codex`**:
   - `install-skills.ts` ([L148-L150](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L148-L150)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     const prompt = await renderBaseAgentInstruction()
     await injectSpecdBlock(agentsMdPath, prompt, 'codex')
     ```
   - `uninstall-skills.ts` ([L66-L67](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts#L66-L67)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     await removeSpecdBlock(agentsMdPath, 'codex')
     ```
   - **Status**: ✅ Compliant

5. **`plugin-agent-standard`**:
   - `install-skills.ts` ([L154-L156](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L154-L156)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     const prompt = await renderBaseAgentInstruction()
     await injectSpecdBlock(agentsMdPath, prompt, 'standard')
     ```
   - `uninstall-skills.ts` ([L58-L59](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts#L58-L59)):
     ```typescript
     const agentsMdPath = path.join(config.projectRoot, 'AGENTS.md')
     await removeSpecdBlock(agentsMdPath, 'standard')
     ```
   - **Status**: ✅ Compliant

---

## 3. Discrepancies

### Tag Formatting Discrepancy (Block Manager vs Test Assertions)

- **Spec Requirement / Verification Text**: Verification scenarios state that `CLAUDE.md`, `AGENTS.md`, or `copilot-instructions.md` contain the `<!-- <specd> -->` block.
- **Block Manager Behavior (`@specd/skills/src/application/specd-block-manager.ts`)**:
  When `injectSpecdBlock(filePath, prompt, blockId)` is called with a `blockId` (e.g. `'claude'`), it formats the tag opening with registered agent attributes:
  ```html
  <!-- <specd agents="claude"> -->
  ```
- **Test Assertion Issue**:
  All 5 test files (`packages/plugin-agent-*/test/install-skills.spec.ts`) assert exact string inclusion of `<!-- <specd> -->`:

  ```typescript
  expect(content).toContain('<!-- <specd> -->')
  ```

  Since the injected content contains `<!-- <specd agents="<blockId>"> -->`, the assertion `expect(...).toContain('<!-- <specd> -->')` fails in unit tests for all 5 plugin packages.

- **Resolution Required**:
  Update unit test assertions across all 5 plugins from `expect(content).toContain('<!-- <specd> -->')` to `expect(content).toContain('<!-- <specd')` or `expect(content).toContain('<!-- <specd agents=')`.

---

## 4. Test Coverage & Test Execution Results

| Package                 | Test Spec File                                                                                                                       | Total Tests | Passed | Failed | Failing Test Case                                                                             | Root Cause                                                                         |
| :---------------------- | :----------------------------------------------------------------------------------------------------------------------------------- | :---------: | :----: | :----: | :-------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `plugin-agent-claude`   | [`install-skills.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts)   |      4      |   3    |   1    | `given project root, when install runs, then injects CLAUDE.md prompt block...`               | Expected `'<!-- <specd> -->'` but received `'<!-- <specd agents="claude"> -->'`.   |
| `plugin-agent-opencode` | [`install-skills.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts) |      3      |   2    |   1    | `given project root, when install runs, then injects AGENTS.md prompt block...`               | Expected `'<!-- <specd> -->'` but received `'<!-- <specd agents="opencode"> -->'`. |
| `plugin-agent-copilot`  | [`install-skills.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts)  |      3      |   2    |   1    | `given project root, when install runs, then injects copilot-instructions.md prompt block...` | Expected `'<!-- <specd> -->'` but received `'<!-- <specd agents="copilot"> -->'`.  |
| `plugin-agent-codex`    | [`install-skills.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts)    |      3      |   2    |   1    | `given project root, when install runs, then injects AGENTS.md prompt block...`               | Expected `'<!-- <specd> -->'` but received `'<!-- <specd agents="codex"> -->'`.    |
| `plugin-agent-standard` | [`install-skills.spec.ts`](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts) |      3      |   2    |   1    | `given project root, when install runs, then injects AGENTS.md prompt block...`               | Expected `'<!-- <specd> -->'` but received `'<!-- <specd agents="standard"> -->'`. |

### Summary Matrix

- **Implementation Compliance**: 100% of use cases correctly pass `blockId` ('claude', 'opencode', 'copilot', 'codex', 'standard') to `injectSpecdBlock` and `removeSpecdBlock`.
- **Test Execution**: 16 out of 21 tests pass; 5 tests fail solely due to stale assertions checking for `<!-- <specd> -->` instead of `<!-- <specd agents="..."> -->`.
