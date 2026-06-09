# plugin-manager:agent-plugin-type

## Purpose

Defines the agent plugin interface that extends `SpecdPlugin` for agent integrations (Claude, Copilot, Codex, etc.).

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

`AgentPlugin` MUST extend `SpecdPlugin` with `type: 'agent'` and add:

- `install(config: SpecdConfig, options?: AgentInstallOptions): Promise<AgentInstallResult>`
- `uninstall(config: SpecdConfig, options?: AgentInstallOptions): Promise<void>`

The `AgentPlugin` SHALL receive the full `SpecdConfig` object to ensure it has access to the project root and any necessary workspace or storage configuration.

### Requirement: AgentInstallOptions

```typescript
type TemplateVariable =
  | string
  | number
  | boolean
  | readonly TemplateVariable[]
  | { readonly [key: string]: TemplateVariable }

interface AgentInstallOptions {
  skills?: string[] // specific skill names; omit = all
  variables?: Record<string, TemplateVariable> // recursive template variables, including variables.frontmatter and variables.sharedFolder
  capabilities?: string[] // capability identifiers supported by the target runtime
}
```

`capabilities` MUST be supplied as a simple collection of capability identifiers by the agent plugin at install time. The initial required capability identifiers are `mcp`, `agents`, and `frontmatter`.

Their initial required meanings are:

- `mcp`: the target runtime supports MCP-oriented template branches
- `agents`: the target runtime supports delegated-agent-oriented template branches
- `frontmatter`: the target runtime expects frontmatter to be composed and inserted from `variables.frontmatter`

Frontmatter data MUST be passed through `variables.frontmatter`. Plugins MUST NOT pass a prebuilt YAML frontmatter document through `AgentInstallOptions`.

`variables.sharedFolder`, when provided, MUST be relative to the project root and is subject to normalization and validation by `@specd/skills`.

### Requirement: AgentInstallResult

```typescript
interface AgentInstallResult {
  installed: Array<{ skill: string; path: string }>
  skipped: Array<{ skill: string; reason: string }>
}
```

### Requirement: isAgentPlugin type guard

The spec MUST export a pure function `isAgentPlugin(value: SpecdPlugin): value is AgentPlugin` that validates:

1. `value.type` is `'agent'`
2. `value.install` is a function
3. `value.uninstall` is a function

This type guard lives in the domain layer so that application use cases and infrastructure adapters can import it without creating layer violations.

## Constraints

- Agent plugins specialize the base plugin type for agent integrations.
- Install-time capability data MUST be passed separately from template variables.
- The initial required capability identifiers are `mcp`, `agents`, and `frontmatter`.
- Agent plugins MUST NOT pass pre-normalized capability objects into `@specd/skills`.
- Install-time frontmatter data MUST be passed through `variables.frontmatter`, not as a prebuilt YAML document.
- Agent plugins MAY pass `variables.sharedFolder`, but `@specd/skills` owns its normalization and safety validation.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — base plugin interface
