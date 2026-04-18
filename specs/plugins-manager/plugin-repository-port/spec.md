# plugin-manager:plugin-repository-port

## Purpose

Abstract interface for plugin storage. The CLI implements this via ConfigWriter, but we define the port here for clarity.

## Requirements

### Requirement: PluginRepositoryPort interface

```typescript
interface PluginRepositoryPort {
  addPlugin(type: string, name: string, config?: Record<string, unknown>): Promise<void>
  removePlugin(type: string, name: string): Promise<void>
  listPlugins(type?: string): Promise<Array<{ name: string; config?: Record<string, unknown> }>>
}
```

### Requirement: Implementation note

In the CLI, this port is implemented via `ConfigWriter.addPlugin()`, `ConfigWriter.removePlugin()`, and `ConfigWriter.listPlugins()`.

## Constraints

- The port is an abstraction — implementations handle the actual storage.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — plugin types
