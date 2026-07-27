# Spec Compliance Audit Report — `agent-plugin-prompt-injection`

**Change Name:** `agent-plugin-prompt-injection`
**Audit Mode:** Specific Change (`--change agent-plugin-prompt-injection`)
**Timestamp:** 2026-07-27T15:47:46Z
**Scope:** 9 Specs (Deltas & New Specs)

---

## Executive Summary

- **Total Specs Audited:** 9
- **Total Requirements Audited:** 28
- **Total Scenarios Audited:** 39
- **Conformant Scenarios:** 39 (100%)
- **Implementation Discrepancies:** 0
- **Spec Discrepancies:** 0
- **Test Coverage:** 100% (All scenarios covered by dedicated vitest unit and integration suites)

---

## Audited Specs & Implementation Conformance

### 1. `plugin-manager:install-plugin-use-case`

- **Spec Path:** `deltas/plugin-manager/install-plugin-use-case/spec.md.delta.yaml`
- **Implementation Files:**
  - `packages/plugin-manager/src/application/use-cases/install-plugin.ts`
  - `packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts`
  - `packages/plugin-manager/test/use-cases/install-plugin.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** Implementation correctly delegates to `AgentPlugin.install()` and `AgentPlugin.uninstall()`, supporting prompt block injection, asset deployment, and reference-counted cleanup.

### 2. `skills:agent-instruction-template`

- **Spec Path:** `deltas/skills/agent-instruction-template/spec.md.delta.yaml`
- **Implementation Files:**
  - `packages/skills/templates/prompt/agent-instruction.md.tpl`
  - `packages/skills/src/domain/templates/index.ts`
  - `packages/skills/src/application/render-base-agent-instruction.ts`
  - `packages/skills/src/application/specd-block-manager.ts`
  - `packages/skills/src/application/json-config-manager.ts`
  - `packages/skills/test/application/render-base-agent-instruction.spec.ts`
  - `packages/skills/test/application/specd-block-manager.spec.ts`
  - `packages/skills/test/application/json-config-manager.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** Handlebars template compiles entry point notice & graph-first directives. `injectSpecdBlock` handles outer tag stripping and marker creation. `removeSpecdBlock` implements reference-counted cleanup. `mergeJsonConfig`/`unmergeJsonConfig` safely manipulate JSON settings preserving user keys.

### 3. `plugin-agent-claude:plugin-agent` & `plugin-agent-claude:native-hook`

- **Spec Path:** `deltas/plugin-agent-claude/plugin-agent/spec.md.delta.yaml` & `specs/plugin-agent-claude/native-hook/spec.md`
- **Implementation Files:**
  - `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts`
  - `packages/plugin-agent-claude/test/install-skills.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** `CLAUDE.md` receives prompt block. Hook `.claude/hooks/specd-agent-init.sh` is deployed with `0o755` permissions. `.claude/settings.json` is merged using namespace-filtered updates on `specd-*`. Teardown cleans hook file, unmerges settings, and removes prompt block.

### 4. `plugin-agent-opencode:plugin-agent` & `plugin-agent-opencode:native-hook`

- **Spec Path:** `deltas/plugin-agent-opencode/plugin-agent/spec.md.delta.yaml` & `specs/plugin-agent-opencode/native-hook/spec.md`
- **Implementation Files:**
  - `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts`
  - `packages/plugin-agent-opencode/test/install-skills.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** `AGENTS.md` receives base prompt and `opencode` marker. Plugin script `.opencode/plugins/specd-agent-init.ts` is deployed. `opencode.json` is merged with namespace-filtered updates. Teardown removes plugin script, unmerges config, and performs reference-counted cleanup on `AGENTS.md`.

### 5. `plugin-agent-copilot:plugin-agent`

- **Spec Path:** `deltas/plugin-agent-copilot/plugin-agent/spec.md.delta.yaml`
- **Implementation Files:**
  - `packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts`
  - `packages/plugin-agent-copilot/test/install-skills.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** Prompt block injected into `.github/copilot-instructions.md` and cleaned up on uninstall.

### 6. `plugin-agent-codex:plugin-agent`

- **Spec Path:** `deltas/plugin-agent-codex/plugin-agent/spec.md.delta.yaml`
- **Implementation Files:**
  - `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts`
  - `packages/plugin-agent-codex/test/install-skills.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** Prompt block + `codex` marker injected into `AGENTS.md`. Teardown performs reference-counted cleanup.

### 7. `plugin-agent-standard:plugin-agent`

- **Spec Path:** `deltas/plugin-agent-standard/plugin-agent/spec.md.delta.yaml`
- **Implementation Files:**
  - `packages/plugin-agent-standard/src/application/use-cases/install-skills.ts`
  - `packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts`
  - `packages/plugin-agent-standard/test/install-skills.spec.ts`
- **Status:** **CONFORMANT (100%)**
- **Findings:** Prompt block + `standard` marker injected into `AGENTS.md`. Teardown performs reference-counted cleanup.

---

## Test Coverage Summary

- `@specd/skills`: 39 unit tests covering template rendering, block management, reference counting, and JSON config helpers.
- `@specd/plugin-manager`: 17 unit tests covering agent plugin delegation and error handling.
- `@specd/plugin-agent-claude`: 4 unit tests covering prompt injection, hook deployment, settings merge, namespace filtering, and uninstall.
- `@specd/plugin-agent-opencode`: 4 unit tests covering prompt injection, plugin script deployment, config merge, namespace filtering, and uninstall.
- `@specd/plugin-agent-copilot`: 4 unit tests covering copilot-instructions prompt injection and uninstall.
- `@specd/plugin-agent-codex`: 4 unit tests covering AGENTS.md prompt injection, marker registration, and uninstall.
- `@specd/plugin-agent-standard`: 4 unit tests covering AGENTS.md prompt injection, marker registration, and uninstall.

---

## Conclusion

The implementation fully satisfies all requirements and scenarios across all 9 change specs without any drift or discrepancies.
