# plugin-manager:agent-plugin-type

## Purpose

Defines the agent plugin interface that extends `SpecdPlugin` for agent integrations (Claude, Copilot, Codex, etc.).

## Requirements

### Requirement: AgentPlugin extends SpecdPlugin

`AgentPlugin` MUST extend `SpecdPlugin` with `type: 'agent'` and add:

- `install(projectRoot: string, options?: InstallOptions): Promise<InstallResult>`
- `uninstall(projectRoot: string, options?: InstallOptions): Promise<void>`

### Requirement: InstallOptions

```typescript
interface InstallOptions {
  skills?: string[] // specific skill names; omit = all
  variables?: Record<string, string> // variable substitution
}
```

### Requirement: InstallResult

```typescript
interface InstallResult {
  installed: Array<{ skill: string; path: string }>
  skipped: Array<{ skill: string; reason: string }>
}
```

## Constraints

- Agent plugins specialize the base plugin type for agent integrations.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — base plugin interface
