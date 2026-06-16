# Proposal: llm-optimized-metadata

## Motivation

Agents currently consume raw metadata sections which can be token-expensive. Introducing ultra-terse, high-density LLM-optimized fields and specialized optimizer agents will reduce token usage and improve agent efficiency when compiling project context. Furthermore, the current agent plugin implementation contains redundant boilerplate (like `buildCapabilities`) that should be simplified during this refactoring. Finally, the `specs context`, `project context`, `specs list`, and `project status` commands need to reflect what agents actually "see" by preferring optimized content when available. Additionally, the `change context` command (`changes context`) must be corrected because it currently ignores section flags when `llmOptimizedContext` is active, and it needs consistency with the other context commands.

## Current behaviour

Today, `GetProjectContext` and `CompileContext` already support `optimizedDescription` and `optimizedContext` (added in commit `f5b2cda7`). However, the actual generation of these fields is not yet implemented in the `specd-metadata` skill or via specialized agents. The `skills` package lacks a clear separation between standard skills and specialized agents. Additionally, agent plugins use a redundant `buildCapabilities` helper function. Lastly, several CLI commands do not respect the `llmOptimizedContext` configuration nor do they display the optimized content even if present; in particular, the `changes context` command does not disable `llmOptimizedContext` when section flags are passed, nor does it define or handle the `--no-optimized` option. Warnings for missing optimization currently refer to old skill names (`specd-spec-metadata`, `specd-project-metadata`) instead of the new specialized agents. `project status --context` currently truncates project context in text mode.

## Proposed solution

1.  **Specialized Agents**: Create two new specialized agents in the `skills` package:
    - `specd-project-context-optimizer`: For optimizing project-level context.
    - `specd-spec-context-optimizer`: For optimizing spec-level context.
    - The existing `spec-metadata` skill will remain as-is for now (legacy).
2.  **Skills Refactoring**: Restructure `packages/skills/templates` to physically separate skills from agents:
    - `templates/skills/`: Move all current skills here.
    - `templates/agents/`: New folder for specialized subagents.
    - `templates/shared/`: Remains where it is.
3.  **Custom Agent Convention**: Adopt a custom internal naming convention for agent templates to distinguish them from standard skills:
    - Agent template file: `SPECD-AGENT.md.tpl`.
    - Agent metadata file: `specd-agent.meta.json`.
4.  **Core & Plugin Logic**:
    - Update `SkillRepository` and related infrastructure to support categorized discovery from the new folder structure and handle the new naming convention for agents.
    - Implement a way to retrieve agents within the `ResolveBundle` process.
    - Update agent plugins (Claude, etc.) to install agents into their respective platform-specific directories and filenames (e.g., `.claude/agents/name.md`).
5.  **Capability-based Installation & Fallback**:
    - If the target coding agent supports subagents, install them in the corresponding `agents/` folder.
    - If subagent support is missing, the agent template must be copied to the same directory as the shared context file (`shared.md`).
6.  **Boilerplate Cleanup**:
    - Remove the redundant `buildCapabilities` helper function from all agent plugins.
    - Pass the supported capability array literal directly in the `InstallSkills` use case.
7.  **CLI & Core Warning Updates**:
    - Update `specs context`, `project context`, and `changes context` (i.e., `change context`) to prefer optimized content by default when `llmOptimizedContext` is enabled.
    - Add `--no-optimized` flag to all three commands to force raw representation display.
    - Update all three commands to disable `llmOptimizedContext` internally when section flags are passed (so that section filtering actually works).
    - Update core warning messages in `CompileContext`, `GetProjectContext`, and `GetSpecContext` to mention the new specialized optimizer agents instead of legacy skill names.
    - Emit optimization warnings only when appropriate (e.g., suppressed when raw sections or `--no-optimized` are requested).
8.  **Context in List and Status Commands**:
    - Update `specs list` to use `optimizedDescription` if it exists and is not empty (no warning if missing).
    - Update `project status --context` to display the full project context in text mode (avoiding truncation).
    - Update `project status --context` to prefer `optimizedContext` if it exists and is not empty, and emit a warning if `llmOptimizedContext` is enabled but it's missing or stale.
9.  **shared.md Update**:
    - Update the shared instructions to guide agents on context optimization. The instructions will provide a prose-based policy:
      - If the agent supports subagents: Launch the corresponding optimizer agent.
      - If subagents are NOT supported: Read the agent's file content and execute the optimization prompt inline.
      - The choice is left to the LLM's own awareness of its runtime capabilities.

## Specs affected

### New specs

- `skills:agents`: Define the specialized context optimizer agents, their prompts, the `SPECD-AGENT.md` convention, and the "smart caveman" style policy.
  - Depends on: `skills:skill`, `skills:workflow-automation`

### Modified specs

- `skills:skill`: Add `kind` property (`skill` | `agent`) and define the naming convention for both types.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-repository`: Update the contract to support categorized discovery from `skills/` and `agents/` folders using the new naming convention.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-repository-infra`: Update `FsSkillRepository` implementation for the refactored `templates/` layout and custom filenames.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-templates-source`: Document the new physical folder layout and the `SPECD-AGENT.md` vs `SKILL.md` distinction.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:agent-plugin-type`: Update `AgentPlugin` and `AgentInstallOptions` to handle categorized installation and fallback to the shared directory.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:workflow-automation`: Define the policy for choosing between subagent delegation and inline execution for context optimization.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-agent-claude:plugin-agent`: Update Claude plugin to handle categorized installation and custom agent filenames. Remove redundant `buildCapabilities` helper.
  - Depends on (added): `skills:agents`
  - Depends on (removed): none
- `plugin-agent-copilot:plugin-agent`: Update Copilot plugin to handle categorized installation and custom agent filenames. Remove redundant `buildCapabilities` helper.
  - Depends on (added): `skills:agents`
  - Depends on (removed): none
- `plugin-agent-codex:plugin-agent`: Update Codex plugin to handle categorized installation and custom agent filenames. Remove redundant `buildCapabilities` helper.
  - Depends on (added): `skills:agents`
  - Depends on (removed): none
- `plugin-agent-opencode:plugin-agent`: Update Open Code plugin to handle categorized installation and custom agent filenames. Remove redundant `buildCapabilities` helper.
  - Depends on (added): `skills:agents`
  - Depends on (removed): none
- `plugin-agent-standard:plugin-agent`: Update Standard plugin to handle categorized installation and custom agent filenames. Remove redundant `buildCapabilities` helper.
  - Depends on (added): `skills:agents`
  - Depends on (removed): none
- `cli:spec-context`: Update requirements for `specs context` command to prefer optimized content and handle the new flags and warnings.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-context`: Update requirements for `project context` command to prefer optimized content and handle the new flags and warnings.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:change-context`: Update requirements for `change context` command to prefer optimized content, add `--no-optimized` flag, disable optimization when section flags are passed, and handle warnings accordingly.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:spec-list`: Update requirements for `specs list` to prefer `optimizedDescription` when available.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-status`: Update requirements for `project status --context` to display full project context, prefer `optimizedContext`, and emit warnings.
  - Depends on (added): none
  - Depends on (removed): none
- `core:compile-context`: Update remediation messages in optimization warnings to reference the new specialized agents.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-context`: Update remediation messages in project-level optimization warnings to reference the new specialized agents.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- Physical layout of `packages/skills/templates`.
- Custom filenames: `SPECD-AGENT.md.tpl` and `specd-agent.meta.json`.
- Discovery and installation logic in `skills` and `plugin-agent-*` packages.
- Orchestration logic described in `shared.md`.
- Removal of boilerplate code in agent plugins.
- `specs context`, `project context`, `specs list`, and `project status` command behavior and flags.
- Warning message content in core use cases.

## Agent Platform Specifications

Each agent plugin MUST transform the raw agent template (instructions) into the platform's native format. The metadata defined in the plugin's internal `agentFrontmatter` mapping MUST be mapped according to the following exhaustive rules:

| Platform     | Target Directory    | File Pattern       | Data Format | Exhaustive Metadata Mapping                                                                                                                | Instructions Location          |
| :----------- | :------------------ | :----------------- | :---------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------- |
| **Claude**   | `.claude/agents/`   | `${name}.md`       | YAML + MD   | `name`: string<br>`description`: string<br>`tools`: comma-separated string<br>`model`: string (optional)                                   | Markdown Body                  |
| **Codex**    | `.codex/agents/`    | `${name}.toml`     | TOML        | `name`: string<br>`description`: string<br>`developer_instructions`: multi-line string<br>`sandbox_mode`: string (e.g., "workspace-write") | `developer_instructions` field |
| **OpenCode** | `.opencode/agents/` | `${name}.md`       | YAML + MD   | `name`: string<br>`description`: string<br>`mode`: "subagent"<br>`permissions`: list of objects (e.g., `- bash: allow`)                    | Markdown Body                  |
| **Copilot**  | `.github/agents/`   | `${name}.agent.md` | YAML + MD   | `name`: string<br>`description`: string<br>`tools`: YAML list of strings                                                                   | Markdown Body                  |

### Exhaustive Plugin Requirements:

1.  **Agent Templates (Internal)**:
    - `SPECD-AGENT.md.tpl` files MUST start with the `{{{frontmatter}}}` tag, maintaining symmetry with standard skills.
    - They MUST NOT contain hardcoded YAML frontmatter.
    - Metadata MUST be stored exclusively in an `agentFrontmatter` map exported from each plugin's `domain/frontmatter/index.ts`.
2.  **Format Control via Variables**:
    - Plugins control the output format by deciding whether to pass the `frontmatter` variable to `ResolveBundle`.
    - YAML-based platforms (Claude, OpenCode, Copilot) MUST pass the `frontmatter` variable built from their `agentFrontmatter` map. The bundle will resolve to a Markdown file with a YAML header.
    - TOML-based platforms (Codex) MUST NOT pass the `frontmatter` variable for agents. The bundle will resolve to a clean Markdown prompt, which the plugin then embeds into its `.toml` wrapper.
3.  **Template Engine Purity**:
    - The `TemplateRenderer` MUST NOT use sentinel placeholders to preserve missing variables.
    - Handlebars MUST be the sole engine responsible for variable resolution and dropping unresolved tags.
    - MUST map `allowedTools` list into a single comma-separated string for the `tools` YAML key.
    - If the agent defines a preferred model, it MUST be set in the `model` key.
4.  **Codex Plugin**:
    - MUST escape the rendered instructions (Markdown) to be valid inside a TOML multi-line string (`"""`).
    - MUST NOT emit Markdown outside the TOML structure.
5.  **OpenCode Plugin**:
    - MUST set `mode: subagent` to ensure the agent is available for delegation.
    - MUST transform `allowedTools` (e.g., `Bash`, `Read`) into a permissions map (e.g., `bash: allow`, `read: allow`).
6.  **Copilot Plugin**:
    - MUST use the `.agent.md` suffix.
    - MUST emit tools as a standard YAML list.

### Fallback Mechanism:

If the `agents` capability is missing in the project configuration or the plugin does not support sub-agents, the raw template MUST be written to `{{sharedFolder}}/${name}.agent.md` as plain Markdown, allowing agents to read and execute the prompt inline.

## Technical context

- `optimizedDescription`: < 150 characters, high-density summary.
- `optimizedContext`: "Smart Caveman" style (drop articles, fragments, keep technical symbols).
- Internal Files: `SKILL.md` (skills), `SPECD-AGENT.md` (agents).
- Installation fallback: Agents installed alongside `shared.md` if `agents` capability is absent.
- Execution policy: Launch agent if possible, else read prompt from file and run inline.
- Capabilities: Pass `['mcp', 'agents', 'frontmatter']` (or subset) directly without helper functions.
- `specs context` and `project context` warnings: Emit `missing-optimized-context` warning when appropriate.
- Remediation text: "Launch specd-spec-context-optimizer agent to refresh" or "Launch specd-project-context-optimizer agent to generate it".

## Open questions

- none
