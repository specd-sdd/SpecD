# plugin-agent-claude:plugin-agent

## Purpose

Claude agent plugin implementation. Exports `create(): AgentPlugin` that provides skill installation with Claude Code frontmatter injection.

## Requirements

### Requirement: Factory export

The package MUST export `create(options: PluginLoaderOptions): AgentPlugin` as default or named export.

The factory function MUST read `specd-plugin.json` at the infrastructure boundary to obtain `name` and `version`. It MUST search for the manifest in its own directory first, then the parent directory as fallback. The `type` field MUST remain hardcoded as `'agent'`.

### Requirement: Domain layer

The domain layer MUST contain:

- `claude-plugin.ts` — implementation of `AgentPlugin` interface, receiving `name` and `version` via constructor (not hardcoded)
- `frontmatter.ts` — Frontmatter type definitions
- `frontmatter/` — skill metadata map (`skillFrontmatter: Record<string, Frontmatter>`)

The plugin class constructor MUST accept `name` and `version` as parameters. The `type` getter MUST return `'agent'` (hardcoded).

### Requirement: Frontmatter type

```typescript
interface Frontmatter {
  name?: string // Display name (defaults to directory name)
  description: string // REQUIRED
  when_to_use?: string
  argument_hint?: string
  disable_model_invocation?: boolean
  user_invocable?: boolean
  allowed_tools?: string
  model?: string
  effort?: string
  context?: string
  agent?: string
  hooks?: Record<string, unknown>
  paths?: string
  shell?: string
}
```

### Requirement: Application layer

The application layer MUST have `InstallSkills` use case that orchestrates:

1. Get skills via `@specd/skills` repository, passing `SpecdConfig` for built-in variable resolution
2. Inject stored frontmatter to each skill template
3. Install to `.claude/skills/` relative to the `projectRoot` found in `SpecdConfig`

### Requirement: Frontmatter injection

During install, the plugin MUST prepend YAML frontmatter to each skill file:

```yaml
---
name: { { name } }
description: { { description } }
allowed_tools: { { allowed_tools } }
argument_hint: { { argument_hint } }
---
```

### Requirement: Install location

Skills MUST be installed to `.claude/skills/` in the project root.

## Constraints

- This plugin depends on `@specd/skills` for skill operations.
- `name` and `version` MUST be read from `specd-plugin.json` by the factory and passed to the plugin constructor — never hardcoded in the class.
- `type` MUST remain hardcoded as `'agent'` for type safety.

## Spec Dependencies

- [`core:core/config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:agent-plugin-type`](../plugin-manager/agent-plugin-type/spec.md) — plugin interface
- [`skills:skill-repository`](../skills/skill-repository/spec.md) — skill access
