# Tasks: llm-optimized-metadata

## 1. Skills Infrastructure

- [x] 1.1 Add `kind` to `Skill` interface
      `packages/skills/src/domain/skill.ts`: `Skill` — add `kind: 'skill' | 'agent'` property
      Approach: update interface definition to include the discriminator field
      (Req: Skill interface)
- [x] 1.2 Refactor `packages/skills/templates` directory
      `packages/skills/templates/`: move existing skills to `skills/` subfolder, create `agents/` subfolder
      Approach: physical restructuring of the templates directory
      (Req: Template migration)
- [x] 1.3 Update `FsSkillRepository` implementation
      `packages/skills/src/infrastructure/repository/skill-repository.ts`: `list()` and `get()` — scan `templates/skills/` (using `SKILL.md` convention) and `templates/agents/` (using `SPECD-AGENT.md` convention)
      Approach: update `readdirSync` and path resolution logic to account for subfolders and different filenames; set `kind` correctly
      (Req: list() method, File reading)
- [x] 1.4 Refactor Agent Templates to pure instructions
      Remove YAML frontmatter from all `SPECD-AGENT.md.tpl` files.
      Ensure all metadata is moved to `specd-agent.meta.json`.

## 2. Agent Plugins Cleanup & Categorization

- [x] 2.1 Update `AgentInstallOptions`
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `AgentInstallOptions` — add `agents?: string[]`
      Approach: update the shared options interface
      (Req: AgentInstallOptions)
- [x] 2.2 Remove `buildCapabilities` boilerplate
      Remove the helper function from all `packages/plugin-agent-*/src/application/use-cases/install-skills.ts` files.
      Approach: pass capability array literals directly in the use case call
- [x] 2.3 Implement Agent Formatting Wrappers in Plugins
      Implement platform-specific wrapping logic in `InstallSkills` use cases: - **Claude**: Generate YAML frontmatter with comma-separated tools and optional model. - **Codex**: Generate TOML with instructions in `developer_instructions` multi-line string. - **OpenCode**: Generate YAML frontmatter with `mode: subagent` and permissions mapping. - **Copilot**: Generate YAML frontmatter with YAML list for tools and `.agent.md` suffix.
- [x] 2.5 Extract Agent Metadata to plugin Frontmatter mappings
      `packages/plugin-agent-*/src/domain/frontmatter/index.ts`: create `agentFrontmatter` map.
      `packages/skills/src/domain/skill-template-metadata.ts`: remove `name`, `description`, `allowedTools`, `model`.
      Approach: Align agent architecture with standard skill architecture.
- [x] 2.6 Implement Variable-Driven Format Wrappers
      `packages/skills/templates/agents/*/SPECD-AGENT.md.tpl`: Restore `{{{frontmatter}}}` tag.
      `packages/plugin-agent-*/src/application/use-cases/install-skills.ts`: Use `ResolveBundle` variables to inject frontmatter dynamically (or withhold it for Codex). Remove manual string concatenation.
- [x] 2.7 Simplify TemplateRenderer
      `packages/skills/src/infrastructure/repository/template-renderer.ts`: Remove sentinel placeholder logic and let Handlebars resolve all variables natively.
- [x] 2.4 Update installation paths for all plugins
      `packages/plugin-agent-*/src/application/use-cases/install-skills.ts`: handle categorized target directories (skills vs agents), custom agent filenames (including `.toml` and `.agent.md`), and fallback to shared context folder
      Approach: check `skill.kind` and install to platform-specific `agents/` folder using platform naming.

## 3. Core & CLI Updates

- [x] 3.1 Update `specs context` and `project context` commands
      `packages/cli/src/commands/spec/context.ts` and `packages/cli/src/commands/project/context.ts`: prefer optimized content; add `--no-optimized` flag; suppress warnings for explicit sections/flags
      Approach: update command logic to respect `llmOptimizedContext` and handle new flags
      (Req: cli:spec-context, cli:project-context)
- [x] 3.2 Update core remediation warnings
      `packages/core/src/application/use-cases/compile-context.ts` and `get-project-context.ts`: update warning strings to mention new agents
      Approach: replace legacy skill names with `specd-spec-context-optimizer` and `specd-project-context-optimizer`
      (Req: core:compile-context, core:get-project-context)
- [x] 3.3 Update `specs list` command
      `packages/cli/src/commands/spec/list.ts`: use `optimizedDescription` if it exists and is not empty
      Approach: update summary rendering to check for optimized description field in metadata
      (Req: cli:spec-list)
- [x] 3.4 Update `project status` command
      `packages/cli/src/commands/project/status.ts`: display full project context in text mode; prefer `optimizedContext`; emit warnings
      Approach: update `--context` logic to avoid truncation, respect `llmOptimizedContext`, and show proper remediation
      (Req: cli:project-status)
- [x] 3.5 Update `changes context` command
      `packages/cli/src/commands/change/context.ts`: prefer optimized content; add `--optimized` and `--no-optimized` flags; disable optimization when section flags are passed; suppress warnings for explicit sections/flags
      Approach: update command logic to respect `llmOptimizedContext`, handle new flags, and disable optimization when section filters are present
      (Req: cli:change-context)
- [x] 3.6 Implement strict optimization bypass in core
      `packages/core/src/application/use-cases/compile-context.ts`: introduce `shouldUseOptimizedContext` logic.
      Approach: Force optimization to `false` if `sections` is passed but does not include both `rules` and `constraints`. Use this flag for warnings and rendering.
      (Req: core:compile-context)

## 4. Agents & Policies

- [x] 4.1 Update `specd-project-context-optimizer` agent
      `packages/skills/templates/agents/specd-project-context-optimizer/`: remove YAML frontmatter from `SPECD-AGENT.md.tpl`
      Approach: instructions-only prompt
      (Req: skills:agents)
- [x] 4.2 Update `specd-spec-context-optimizer` agent
      `packages/skills/templates/agents/specd-spec-context-optimizer/`: remove YAML frontmatter from `SPECD-AGENT.md.tpl`
      Approach: instructions-only prompt
      (Req: skills:agents)
- [x] 4.3 Update `shared.md.tpl`
      `packages/skills/templates/shared/shared.md.tpl`: add context optimization section using prose instructions
      Approach: provide clear policy for subagent delegation vs inline execution based on LLM awareness
      (Req: skills:workflow-automation)

## 5. Testing & Verification

- [x] 5.1 Update skills repository tests
      `packages/skills/test/infrastructure/skill-repository.spec.ts`: update for new folder layout, custom filenames, and `kind` detection
- [x] 5.2 Implement Plugin-specific Wrapper Tests
      Add tests to each plugin verifying that agents are correctly wrapped in YAML/TOML as required by the platform.
- [x] 5.3 Update CLI context tests
      `packages/cli/test/commands/spec-context.spec.ts` and `packages/cli/test/commands/change-context.spec.ts`: test new flags, warning suppression, and override logic
- [x] 5.4 Update project status tests
      `packages/cli/test/commands/project-status.spec.ts`: verify full context display and optimization preference
- [x] 5.5 E2E verification
      Manual check: run `specd specs list`, `specd project status --context`, and `specd changes context <name> <step> --rules --constraints` and verify optimized representation, overrides, and warnings.
- [x] 5.6 Unit tests for strict optimization bypass
      `packages/core/test/application/use-cases/compile-context.spec.ts`: add tests for bypass and scenario appending.
