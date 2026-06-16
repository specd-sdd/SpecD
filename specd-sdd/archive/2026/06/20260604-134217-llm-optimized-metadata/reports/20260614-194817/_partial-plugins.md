# Spec-Compliance Audit Report: Agent Plugins

This report contains the compliance audit for the 5 agent plugins of the **specd** platform under the `llm-optimized-metadata` change:

1. `@specd/plugin-agent-standard`
2. `@specd/plugin-agent-claude`
3. `@specd/plugin-agent-copilot`
4. `@specd/plugin-agent-codex`
5. `@specd/plugin-agent-opencode`

---

## Summary Counts

| Metric                                | Count   |
| :------------------------------------ | :------ |
| **Specs Audited**                     | 5       |
| **Requirements Verified (Scenarios)** | 66      |
| **Discrepancies Found**               | 5       |
| **Missing Tests**                     | 1       |
| **Overall Implementation Readiness**  | **94%** |

---

## 1. `@specd/plugin-agent-standard`

### Requirements Summary

- **Factory Export**: Named `create()` export reading manifest for name/version, hardcoded type `'agent'`.
- **Domain Layer**: Runtime contract satisfying `AgentPlugin`, defines standard frontmatter fields (enforces supported set including `allowed-tools` with hyphen).
- **Install Location**: Skills target `.agents/skills/<skill-name>/` (non-shared) and `sharedFolder` (shared).
- **Uninstall Behavior**: Removes selected/all skill directories and `sharedFolder` when filter is omitted.
- **Integrations**: Interactive `specd project init` wizard option and `@specd/specd` meta package workspace dependency.

### Implementation Status

- **create() factory & manifest reader**: Implemented in [index.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/index.ts).
- **Plugin runtime**: Implemented in [agent-standard-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/agent-standard-plugin.ts).
- **Frontmatter type & index**: Implemented in [frontmatter.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/frontmatter.ts) and [frontmatter/index.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts).
- **Install/Uninstall use cases**: Implemented in [install-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts) and [uninstall-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts).
- **Integrations**: Properly declared in CLI wizard and meta package.

### Discrepancies

> [!WARNING]
> **Fallback Location Discrepancy**:
> The specification (`verify.md`) requires that standard agent installation should fallback to copying agent files to the same directory as `shared.md` since the standard plugin does not declare the `agents` capability.
> However, the implementation writes agent files to `.agents/agents/` using the `${name}.agent.md` suffix, and the test suite verifies this directory layout rather than the shared fallback location.

### Test Coverage

- Verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts). Covers skill routing, shared file preservation, uninstall filter, and agent metadata mapping.

### Missing Tests

- **Domain Types Test**: The standard plugin is missing constructor/metadata unit tests (e.g., `agent-standard-plugin.spec.ts`), unlike the other four plugins which have dedicated tests under `test/domain/types/`.

---

## 2. `@specd/plugin-agent-claude`

### Requirements Summary

- **Factory Export**: Named `create()` export, hardcoded type `'agent'`, reads name/version from manifest.
- **Frontmatter Injection**: Provides Claude-specific metadata (including `tools` as a comma-separated string, and `model`).
- **Install Location**: Skills target `.claude/skills/` (non-shared), agents target `.claude/agents/` (non-shared), and shared files target `sharedFolder`.
- **Uninstall Behavior**: Removes selected/all skill directories and `sharedFolder`.

### Implementation Status

- **create() factory & manifest reader**: Implemented in `src/index.ts`.
- **Plugin runtime**: Implemented in [claude-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/claude-plugin.ts).
- **Frontmatter definitions**: Implemented in [frontmatter.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/frontmatter.ts).
- **Install/Uninstall use cases**: Implemented in [install-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts) and [uninstall-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts).

### Discrepancies

> [!WARNING]
> **Capability Fallback Discrepancy**:
> The spec specifies that when the `agents` capability is missing/unsupported, the agent files must be copied to the same directory as `shared.md`.
> The implementation hardcodes `capabilities = ['mcp', 'agents', 'frontmatter']` and does not implement any dynamic check or fallback path for copying agent files to the shared directory if the capability is unavailable.

### Test Coverage

- Constructor metadata verified in [claude-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/domain/types/claude-plugin.spec.ts).
- Skill/Agent install and uninstall routing verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts).

### Missing Tests

- None.

---

## 3. `@specd/plugin-agent-copilot`

### Requirements Summary

- **Factory Export**: Named `create()` export, manifest reading, hardcoded type `'agent'`.
- **Skill Installation**: Formats Copilot-supported frontmatter fields (including hyphenated keys: `allowed-tools`, `user-invocable`, `disable-model-invocation`).
- **Install Location**: Skills target `.github/skills/` (non-shared), agents target `.github/agents/` (as `.agent.md` suffix with `tools` as a YAML list of strings), and shared files target `sharedFolder`.
- **Uninstall Behavior**: Removes selected/all skill directories and `sharedFolder`.

### Implementation Status

- **create() factory & manifest reader**: Implemented in `src/index.ts`.
- **Plugin runtime**: Implemented in [copilot-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts).
- **Frontmatter definitions**: Implemented in [frontmatter.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/frontmatter.ts).
- **Install/Uninstall use cases**: Implemented in [install-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts) and [uninstall-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts).

### Discrepancies

> [!WARNING]
> **Fallback Location Discrepancy**:
> The spec indicates that standard agents should fallback to copying agent files to the same directory as `shared.md` (since Copilot does not support the `agents` capability).
> The implementation ignores this fallback and directly installs agent files to `.github/agents/` using the `.agent.md` extension, which is also what the test suite verifies.

### Test Coverage

- Constructor metadata verified in [copilot-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/domain/types/copilot-plugin.spec.ts).
- Skill/Agent install and uninstall routing verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts).

### Missing Tests

- None.

---

## 4. `@specd/plugin-agent-codex`

### Requirements Summary

- **Factory Export**: Named `create()` export, manifest reading, hardcoded type `'agent'`.
- **Skill Installation**: Formats Codex-supported frontmatter fields (only `name` and `description`).
- **Install Location**: Skills target `.codex/skills/` (non-shared), agents target `.codex/agents/` (as `.toml` format with `developer_instructions` wrapping the escaped prompt inside a triple-quote multi-line string `"""`), and shared files target `sharedFolder`.
- **Uninstall Behavior**: Removes selected/all skill directories and `sharedFolder`.

### Implementation Status

- **create() factory & manifest reader**: Implemented in `src/index.ts`.
- **Plugin runtime**: Implemented in [codex-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/codex-plugin.ts).
- **Frontmatter definitions**: Implemented in [frontmatter.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/frontmatter.ts).
- **Install/Uninstall use cases**: Implemented in [install-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts) and [uninstall-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts).

### Discrepancies

> [!WARNING]
> **Capability Fallback Discrepancy**:
> Similar to Claude, the spec states that if `agents` capability is missing, agent files should copy to the same directory as `shared.md`.
> The implementation hardcodes `capabilities = ['mcp', 'agents', 'frontmatter']` and does not include any runtime check or fallback logic in `install-skills.ts`.

### Test Coverage

- Constructor metadata verified in [codex-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/domain/types/codex-plugin.spec.ts).
- Skill/Agent install and uninstall routing verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts).

### Missing Tests

- None.

---

## 5. `@specd/plugin-agent-opencode`

### Requirements Summary

- **Factory Export**: Named `create()` export, manifest reading, hardcoded type `'agent'`.
- **Domain Layer**: Runtime contract satisfying `AgentPlugin`, defines Open Code standard frontmatter fields (enforces supported set including `allowed_tools`).
- **Install Location**: Skills target `.opencode/skills/` (non-shared), agents target `.opencode/agents/` (as `.md` format with `mode: subagent` and permissions mapped from `allowedTools`), and shared files target `sharedFolder`.
- **Uninstall Behavior**: Removes selected/all skill directories and `sharedFolder`.
- **Integrations**: Wizard project init option and meta package dependency inclusion.

### Implementation Status

- **create() factory & manifest reader**: Implemented in `src/index.ts`.
- **Plugin runtime**: Implemented in [opencode-plugin.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts).
- **Frontmatter definitions**: Implemented in [frontmatter.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/frontmatter.ts).
- **Install/Uninstall use cases**: Implemented in [install-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts) and [uninstall-skills.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts).
- **Integrations**: Properly declared in CLI wizard and meta package.

### Discrepancies

> [!WARNING]
> **Capability Fallback Discrepancy**:
> Similar to Claude, the spec states that if `agents` capability is missing, agent files should copy to the same directory as `shared.md`.
> The implementation hardcodes `capabilities = ['mcp', 'agents', 'frontmatter']` and does not include any runtime check or fallback logic in `install-skills.ts`.

### Test Coverage

- Constructor metadata verified in [opencode-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/domain/types/opencode-plugin.spec.ts).
- Skill/Agent install and uninstall routing verified in [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts).

### Missing Tests

- None.

---

## Spec Dependency Chain

All 5 agent plugin specifications consistently declare the following dependencies:

- [`core:config`](file:///Users/monki/Documents/Proyectos/specd/specs/core/core/config/spec.md) — Defines the SpecdConfig configuration structure.
- [`plugin-manager:agent-plugin-type`](file:///Users/monki/Documents/Proyectos/specd/specs/plugin-manager/agent-plugin-type/spec.md) — Defines the `AgentPlugin` interface.
- [`skills:skill-bundle`](file:///Users/monki/Documents/Proyectos/specd/specs/skills/skill-bundle/spec.md) — Shared bundle file routing contract.
- [`skills:resolve-bundle`](file:///Users/monki/Documents/Proyectos/specd/specs/skills/resolve-bundle/spec.md) — Canonical install-time bundle resolution.
- [`skills:agents`](file:///Users/monki/Documents/Proyectos/specd/specs/skills/agents/spec.md) — Defines specialized optimizer agents.

Standard, Claude, and OpenCode additionally depend on:

- [`skills:skill-repository`](file:///Users/monki/Documents/Proyectos/specd/specs/skills/skill-repository/spec.md) — Skill access.

Copilot and Codex additionally depend on:

- [`skills:skill-templates-source`](file:///Users/monki/Documents/Proyectos/specd/specs/skills/skill-templates-source/spec.md) — Template source contract.
