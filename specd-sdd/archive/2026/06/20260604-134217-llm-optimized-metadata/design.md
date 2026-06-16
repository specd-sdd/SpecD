# Design: llm-optimized-metadata

## Motivation

Agents currently consume raw metadata sections (rules, constraints, scenarios) which can be token-expensive. We are introducing ultra-terse, high-density LLM-optimized fields (`optimizedDescription` and `optimizedContext`) and specialized optimizer subagents to improve agent efficiency. This design also covers a structural refactor of the `skills` package to explicitly categorize "skills" vs "agents", adopts a custom naming convention for agent templates, cleans up boilerplate in agent plugins, and ensures CLI commands prefer optimized content.

## Non-goals

- Migrating all existing spec metadata in a single step (handled by opportunistic or batch updates).
- Changing the `spec-metadata` skill behavior (kept as legacy for now).

## Affected areas

### 1. Skills Domain & Infrastructure

- `Skill` in `packages/skills/src/domain/skill.ts`
  - Add `kind: 'skill' | 'agent'`.
- `SkillRepository` in `packages/skills/src/application/ports/skill-repository.ts`
  - `list()`: must scan `templates/skills/` (using `SKILL.md` convention) and `templates/agents/` (using `SPECD-AGENT.md` convention) and set the `kind` property.
- `FsSkillRepository` in `packages/skills/src/infrastructure/repository/skill-repository.ts`
  - Update discovery logic to handle different filenames based on the target folder.
  - Add null guard for regex match group when parsing template files.
- `ResolveBundle` in `packages/skills/src/application/use-cases/resolve-bundle.ts`
  - Ensure it correctly delegates to the updated repository for both skills and agents.

### 1. TemplateRenderer Purity

- Remove `preserveMissingSimpleVariables` and `restorePreservedPlaceholders` logic from `packages/skills/src/infrastructure/repository/template-renderer.ts`.
- `TemplateRenderer` MUST rely solely on Handlebars for variable resolution and let it drop any missing variables natively.

### 2. Agent Plugins

- `InstallSkills` in all `packages/plugin-agent-*` packages:
  - Remove redundant `buildCapabilities` helper function.
  - Declare supported capabilities as literal arrays.
  - **Frontmatter Mapping**: Export an `agentFrontmatter` mapping in `domain/frontmatter/index.ts` (matching the exact structure of `skillFrontmatter`).
    - Standard plugin's `agentFrontmatter` does NOT support `allowed-tools` since it lacks `agents` capability.
    - Copilot plugin's `allowed-tools` type supports both `string` and `string[]` to generate a YAML list.
  - **Agent Formatting (Conditional Variables)**: Agent templates (`SPECD-AGENT.md.tpl`) contain the `{{{frontmatter}}}` tag. Plugins control the output format during `ResolveBundle`:
    - **Claude/OpenCode/Copilot**: Pass the `frontmatter` variable (built from `agentFrontmatter`). The motor injects the YAML header.
    - **Codex**: Do NOT pass the `frontmatter` variable for agents. The motor returns a clean prompt, which the plugin then embeds into the `developer_instructions` TOML key. The generated Codex TOML contains only `name`, `description`, and `developer_instructions` keys (no `sandbox_mode`).
  - Update installation paths and filenames:
    - `kind: 'skill'` -> platform folder (e.g., `.claude/skills/name/SKILL.md`).
    - `kind: 'agent'` + `agents` capability -> platform agents folder and platform-specific filename/extension (e.g., `.claude/agents/name.md`, `.codex/agents/name.toml`, `.github/agents/name.agent.md`).
    - `kind: 'agent'` without `agents` capability -> same directory as `shared.md` (fallback) using `${name}.agent.md` convention.
  - **Uninstall behavior**: Update the plugins' `UninstallSkills` logic to also clean up agent files/directories under the platform agents folder (e.g., `.claude/agents/`, `.github/agents/`, `.codex/agents/`, etc.) when no filters are provided or when `options.agents` matches. Ensure it does not remove unrelated user agents or non-matching agents.

### 3. CLI & Core UX

- packages/cli/src/commands/spec/context.ts, packages/cli/src/commands/project/context.ts, and packages/cli/src/commands/change/context.ts
  - Prefer `optimizedDescription` and `optimizedContext` by default when `llmOptimizedContext` is on.
  - Add `--no-optimized` and `--optimized` flags to control optimization preference.
  - Automatically override `llmOptimizedContext` to `false` internally inside the commands when section flags are passed, unless the combination of requested sections includes both rules and constraints.
  - Suppress "missing optimization" warnings if `--no-optimized` or section flags that disable optimization are present.
- `packages/cli/src/commands/spec/list.ts`
  - Prefer `optimizedDescription` when available for summary display.
- `packages/cli/src/commands/project/status.ts`
  - Update `--context` to display full project context in text mode (disable truncation).
  - Prefer `optimizedContext` when available; emit warning if missing/stale and `llmOptimizedContext` is enabled.
- `packages/core/src/application/use-cases/compile-context.ts` and `get-project-context.ts`
  - Update warning messages to: "Launch specd-spec-context-optimizer agent to refresh" or "Launch specd-project-context-optimizer agent to generate it".
  - **Strict Bypass**: Implement a `shouldUseOptimizedContext` flag that forces optimization to `false` if specific `sections` are requested that do not include both `rules` and `constraints`. This ensures that monolithic optimized content is not delivered when surgical data is requested, and suppresses irrelevant warnings. Even when optimization is active, `scenarios` MUST still be appended if requested.

## New constructs

### 1. Optimizer Agents (Templates)

- **`specd-project-context-optimizer`** in `packages/skills/templates/agents/specd-project-context-optimizer/`
  - `SPECD-AGENT.md.tpl`: Prompt for optimizing project instructions and global context.
  - `specd-agent.meta.json`: Standard metadata with `kind: 'agent'`.
- **`specd-spec-context-optimizer`** in `packages/skills/templates/agents/specd-spec-context-optimizer/`
  - `SPECD-AGENT.md.tpl`: Prompt for optimizing spec metadata into "smart caveman" style.
  - `specd-agent.meta.json`: Standard metadata with `kind: 'agent'`.

### 2. Physical Layout Refactor

```
packages/skills/templates/
├── skills/             <-- convention: SKILL.md.tpl
│   ├── specd/
│   └── ...
├── agents/             <-- convention: SPECD-AGENT.md.tpl
│   ├── specd-project-context-optimizer/
│   └── specd-spec-context-optimizer/
└── shared/             <-- Remains unchanged
    └── shared.md.tpl
```

## Approach

### Phase 1: Infrastructure & Domain

1.  Update `Skill` and `SkillTemplateMetadata` interfaces to include `kind`.
2.  Physically move files in `packages/skills/templates/` to the new `skills/` and `agents/` subfolders.
3.  Implement the `SPECD-AGENT.md` discovery logic in `FsSkillRepository`.

### Phase 2: Plugin Refactoring

1.  Iterate through all agent plugins.
2.  Delete `buildCapabilities` helper.
3.  Update `InstallSkills` to use the new installation paths and custom filenames for agents.

### Phase 3: CLI & Policies

1.  Update `specs context`, `project context`, and `change context` command logic for optimized preference, section override logic, and warning suppression.
2.  Update `specs list` to prefer optimized descriptions.
3.  Update `project status` to display full context and prefer optimized version.
4.  Update `shared.md.tpl` to include orchestration logic using prose instructions.
5.  Update core warning strings.

## Key decisions

- **Decision** → Custom naming convention (`SPECD-AGENT.md`). Rationale: Distinguishes specialized agents from standard skills within the internal template repository.
- **Decision** → Fallback to shared directory. Rationale: Ensures the optimization prompt is available to the orchestrator agent even if the platform doesn't support subagents natively.
- **Decision** → Prose-based orchestration in `shared.md`. Rationale: Leverages the LLM's own awareness of its environment and avoids template complexity.
- **Decision** → Suppression of warnings for surgical flags. Rationale: Improves UX by not nagging the user when they intentionally want to see raw data.

## Trade-offs

- **Breaking change**: The folder restructuring and naming convention change require all plugins to be updated simultaneously.

## Migration / Rollback

- Revert template layout and repository logic. No persistent state affected.

## Testing

- **Unit**: `FsSkillRepository` tests verifying categorized discovery and `kind` assignment.
- **Integration**: Plugin tests verifying correct installation paths and filenames for both skills and agents.
- **E2E**: Running `specd specs context` and `specd project status --context` with `llmOptimizedContext: true` and verifying the output and warnings.

## Open questions

- none
