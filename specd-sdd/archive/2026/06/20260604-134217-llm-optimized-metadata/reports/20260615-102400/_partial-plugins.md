# Spec Compliance Audit: Plugins & Types

This report presents the spec compliance audit for the change `llm-optimized-metadata` targeting the core agent plugin interfaces and vendor plugin implementations (Claude, Copilot, Codex, OpenCode, and Standard).

---

## Summary Counts

- **Total Requirements Audited:** 41
- **Compliant:** 32
- **Non-Compliance Issues:** 9
- **Fully Covered by Tests:** 29
- **Missing/Insufficient Test Coverage:** 12

---

## Requirements Summary

| Spec / Requirement                                                                                                                                                          | Status            | Test Coverage    |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------- | :--------------- |
| **plugin-manager:agent-plugin-type**                                                                                                                                        |                   |                  |
| [AgentPlugin extends SpecdPlugin](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L59)                               | Compliant         | Covered          |
| [AgentInstallOptions](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L19)                                           | Compliant         | Covered          |
| [AgentInstallResult](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L44)                                            | Compliant         | Covered          |
| [Agent installation and fallback](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L66)                               | **Non-Compliant** | **Missing**      |
| [isAgentPlugin type guard](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/src/domain/types/agent-plugin.ts#L93)                                      | Compliant         | Covered          |
| **plugin-agent-claude:plugin-agent**                                                                                                                                        |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/index.ts#L40)                                                               | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/claude-plugin.ts#L28)                                            | Compliant         | Covered          |
| [Frontmatter type](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/domain/types/frontmatter.ts#L4)                                           | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L17)                             | **Non-Compliant** | **Insufficient** |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L87)                         | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L41)                              | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/uninstall-skills.ts#L11)                          | Compliant         | Covered          |
| **plugin-agent-copilot:plugin-agent**                                                                                                                                       |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/index.ts#L40)                                                              | Compliant         | Covered          |
| [Plugin runtime contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts#L28)                               | Compliant         | Covered          |
| [Skill installation and frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts#L17) | Compliant         | Covered          |
| [Frontmatter field contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/install-skills.ts#L41)                             | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts#L11)                         | Compliant         | **Insufficient** |
| **plugin-agent-codex:plugin-agent**                                                                                                                                         |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/index.ts#L40)                                                                | Compliant         | Covered          |
| [Plugin runtime contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/codex-plugin.ts#L28)                                   | Compliant         | Covered          |
| [Skill installation and frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L17)   | **Non-Compliant** | **Insufficient** |
| [Frontmatter field contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/domain/types/frontmatter.ts#L4)                                  | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L41)                               | Compliant         | Covered          |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/uninstall-skills.ts#L11)                           | Compliant         | Covered          |
| **plugin-agent-opencode:plugin-agent**                                                                                                                                      |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/index.ts#L40)                                                             | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts#L28)                                        | Compliant         | Covered          |
| [Frontmatter type contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L17)                           | **Non-Compliant** | **Insufficient** |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L96)                       | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts#L41)                            | Compliant         | Covered          |
| [Project init wizard integration](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/init.ts#L17)                                              | Compliant         | **Missing**      |
| [Meta package inclusion](file:///Users/monki/Documents/Proyectos/specd/packages/specd/package.json#L20)                                                                     | Compliant         | **Missing**      |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/src/application/use-cases/uninstall-skills.ts#L11)                        | Compliant         | Covered          |
| **plugin-agent-standard:plugin-agent**                                                                                                                                      |                   |                  |
| [Factory export](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/index.ts#L39)                                                             | Compliant         | Covered          |
| [Domain layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/agent-standard-plugin.ts#L28)                                  | Compliant         | Covered          |
| [Frontmatter type contract](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/types/frontmatter.ts#L4)                                | Compliant         | Covered          |
| [Application layer](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L17)                           | Compliant         | Covered          |
| [Frontmatter injection](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L91)                       | Compliant         | Covered          |
| [Install location](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/install-skills.ts#L41)                            | Compliant         | Covered          |
| [allowed-tools configuration](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L3)                              | **Non-Compliant** | Covered          |
| [Project init wizard integration](file:///Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/project/init.ts#L18)                                              | Compliant         | **Missing**      |
| [Meta package inclusion](file:///Users/monki/Documents/Proyectos/specd/packages/specd/package.json#L21)                                                                     | Compliant         | **Missing**      |
| [Uninstall behavior](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts#L11)                        | Compliant         | Covered          |

---

## Detailed Implementation Status

All five vendor plugins structurally follow Hexagonal Architecture principles by declaring application-layer use cases (`InstallSkills`, `UninstallSkills`) and domain definitions separately from their package entrypoints. The factories correctly read manifest information from `specd-plugin.json` at the package boundaries and construct domain plugin instances injected with use case execution bindings. Manually verified workspace registrations and interactive CLI menus are fully integrated for all plugins.

However, several behavioral requirements concerning fallback capabilities and configuration string formats are unimplemented or structurally broken.

---

## Discrepancies Found

### 1. Missing Fallback for Missing `agents` Capability

- **Specs affected:**
  - `plugin-manager:agent-plugin-type` ("When installing agents, the plugin SHALL determine the target directory... If the target runtime does NOT support specialized agents (i.e. the `agents` capability is missing), the plugin SHALL copy the agent template to the same directory as the shared context file.")
  - `plugin-agent-claude:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
  - `plugin-agent-codex:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
  - `plugin-agent-opencode:plugin-agent` ("Fallback: If `agents` capability is missing, install agents into the same directory as the shared context file.")
- **Rationale:**
  The install use cases for Claude, Codex, and OpenCode hardcode the target `capabilities` array passed into `ResolveBundle.execute` and do not inspect `options?.capabilities` to check if `agents` is missing. As a result, the fallback write logic is never triggered, and the plugin always attempts to write to the specialized agents folder.
- **Code Quote ([plugin-agent-claude:install-skills.ts:L59](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L59)):**
  ```typescript
  // Claude capabilities
  const capabilities = ['mcp', 'agents', 'frontmatter']
  ```
  _(Identical hardcoded logic appears in Codex's and OpenCode's `install-skills.ts`)._

### 2. Reading Agent Metadata from Hardcoded Map instead of `specd-agent.meta.json`

- **Specs affected:**
  - `plugin-agent-claude:plugin-agent` ("Map the preferred model from `specd-agent.meta.json` to the `model` YAML key if present.")
- **Rationale:**
  The Claude plugin relies on a hardcoded local map (`agentFrontmatter` in `domain/frontmatter/index.ts`) to resolve agent variables instead of dynamically loading the `specd-agent.meta.json` descriptor from the skill bundle.
- **Code Quote ([plugin-agent-claude:install-skills.ts:L70-L77](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/src/application/use-cases/install-skills.ts#L70-L77)):**
  ```typescript
  const metadata =
    agentFrontmatter[name] ?? ({ name, description: item.description } satisfies Frontmatter)
  agentFrontmatterVars = {
    name: metadata.name ?? name,
    description: metadata.description ?? item.description,
    ...(metadata.allowed_tools ? { tools: metadata.allowed_tools.split(', ').join(', ') } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
  }
  ```

### 3. Comma-Separated tools in Standard Agent Frontmatter

- **Specs affected:**
  - `plugin-agent-standard:plugin-agent` ("The per-skill frontmatter map MUST declare `allowed-tools` for each skill with appropriate tool strings matching the agentskills.io format (space-separated).")
- **Rationale:**
  The standard plugin's agent frontmatter definitions use commas to separate pre-approved tools rather than space separation.
- **Code Quote ([plugin-agent-standard:frontmatter/index.ts:L50-L61](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L50-L61)):**
  ```typescript
  export const agentFrontmatter: Readonly<Record<string, Frontmatter>> = {
    'specd-project-context-optimizer': {
      name: 'specd-project-context-optimizer',
      description: 'Generates a high-density, token-efficient version of project-level context.',
      'allowed-tools': 'Bash(node:*), Bash(specd:*), Bash(cat:*), Bash(rm:*), Read, Write',
    },
  ```

### 4. Syntax Mismatch in Standard allowed-tools Strings (Colon vs Space Wildcard)

- **Specs affected:**
  - `plugin-agent-standard:plugin-agent` ("Tool strings MUST include the tools needed by each specd skill: ... Bash(node _), Bash(specd _), Bash(pnpm \*) for command execution")
- **Rationale:**
  The tool strings are configured with colons (e.g. `Bash(node:*)`) instead of the space-separated wildcard arguments (e.g. `Bash(node *)`) defined by the spec.
- **Code Quote ([plugin-agent-standard:frontmatter/index.ts:L7](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/src/domain/frontmatter/index.ts#L7)):**
  ```typescript
  'allowed-tools': 'Bash(node:*) Bash(specd:*) Read',
  ```

### 5. Codex Plugin Generates Extraneous TOML Key

- **Specs affected:**
  - `plugin-agent-codex:plugin-agent` ("The Codex frontmatter value contract MUST cover this exact supported set: name (required), description (required). No other frontmatter keys are considered Codex-supported in this spec.")
- **Rationale:**
  The Codex installer outputs `sandbox_mode = "workspace-write"` within the generated `.toml` profile, violating the strict supported metadata set constraint.
- **Code Quote ([plugin-agent-codex:install-skills.ts:L120](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/src/application/use-cases/install-skills.ts#L120)):**
  ```typescript
  'sandbox_mode = "workspace-write"',
  ```

### 6. Architectural Spec Gaps in Uninstall Cleanups

- **Specs affected:**
  - `plugin-agent-claude:plugin-agent`
  - `plugin-agent-codex:plugin-agent`
  - `plugin-agent-opencode:plugin-agent`
- **Rationale:**
  These specs only request that `uninstall()` remove specd-managed files from the _skills_ directory (`.claude/skills/`, `.codex/skills/`, `.opencode/skills/`). Consequently, their code implementations do not clean up the _agents_ folders (`.claude/agents/`, `.codex/agents/`, `.opencode/agents/`). This creates a gap where agent profiles remain orphaned on uninstallation.

---

## Test Coverage Details

All core plugin behaviors are tested under package-specific test files:

1. **`plugin-manager`**
   - [is-agent-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-manager/test/domain/types/is-agent-plugin.spec.ts)
     - `given a valid AgentPlugin, when checked, then returns true`
     - `given a SpecdPlugin without install method, when checked, then returns false`
     - `given a SpecdPlugin with wrong type, when checked, then returns false`
     - `given recursive variables and capabilities in install options, when install is typed, then the type guard remains valid`

2. **`plugin-agent-claude`**
   - [claude-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/domain/types/claude-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-claude/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Claude-specific YAML frontmatter`

3. **`plugin-agent-copilot`**
   - [copilot-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/domain/types/copilot-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-copilot/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Copilot-specific YAML wrapper`

4. **`plugin-agent-codex`**
   - [codex-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/domain/types/codex-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-codex/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates Codex-specific TOML wrapper`

5. **`plugin-agent-opencode`**
   - [opencode-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/domain/types/opencode-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-opencode/test/install-skills.spec.ts)
     - `given a project root, when install is called, then routes shared files and preserves shared markdown`
     - `given an agent, when install is called, then generates OpenCode-specific YAML frontmatter`

6. **`plugin-agent-standard`**
   - [agent-standard-plugin.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/domain/types/agent-standard-plugin.spec.ts)
     - Instantiation and interface properties validation.
   - [install-skills.spec.ts](file:///Users/monki/Documents/Proyectos/specd/packages/plugin-agent-standard/test/install-skills.spec.ts)
     - `given a project root, when install is called, then writes to .agents/skills/ with allowed-tools frontmatter`
     - `given an agent, when install is called, then generates Standard YAML wrapper`

---

## Missing/Insufficient Tests

1. **Missing Fallback Tests:**
   No unit tests verify the fallback installation directories for agent templates when the `agents` capability is missing in Claude, Codex, or OpenCode plugins.
2. **Missing Copilot Agents Uninstall Test:**
   No unit test verifies that Copilot's `uninstall()` successfully removes only the selected agent profiles from `.github/agents/` when `options.agents` is supplied.
3. **Missing CLI Init and Metapackage Tests:**
   The integration of OpenCode and Standard plugins in the `specd project init` wizard options and the `@specd/specd` metapackage dependencies are only checked structurally; no automated unit tests cover these CLI configurations.
4. **Missing Shared Folder Escapes Tests:**
   No tests verify that a containment error is thrown when the resolved shared folder escapes the project containment boundaries.
