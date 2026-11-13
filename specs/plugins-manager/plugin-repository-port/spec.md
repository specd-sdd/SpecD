# plugin-manager:plugin-repository-port

## Purpose

Abstract interface for plugin storage. It documents the contract that `ConfigWriter` (core) already exposes (`addPlugin(configPath, name, options?)`, `removePlugin(configPath, name)`, `listPlugins(configPath)`). The CLI does not implement this port with a separate adapter: it calls `ConfigWriter` directly, and `ConfigWriter` satisfies the port structurally, which a type-level test proves.

## Requirements

### Requirement: PluginRepositoryPort interface

```typescript
/** Re-export of core `ConfigDeclaredPlugin`; not a second definition. */
type DeclaredPlugin = ConfigDeclaredPlugin

interface AddPluginOptions {
  readonly config?: Readonly<Record<string, unknown>>
  readonly contributions?: readonly string[] // allowlist; absent = all
}

interface PluginRepositoryPort {
  addPlugin(configPath: string, name: string, options?: AddPluginOptions): Promise<void>
  removePlugin(configPath: string, name: string): Promise<void>
  listPlugins(configPath: string): Promise<readonly DeclaredPlugin[]>
}
```

The signatures MUST match `ConfigWriter` of `@specd/core` exactly, including `configPath` as the first parameter of every method. The port has no notion of plugin type or bucket: plugins live in one flat list. `PluginRepositoryPort` is the only exported name for this port (the former name `PluginRepository` is removed).

### Requirement: ConfigWriter conformance

`ConfigWriter` from `@specd/core` MUST be assignable to `PluginRepositoryPort`. A type-level conformance test in the plugin-manager (or SDK) test suite MUST prove this assignment, so that signature drift in either side fails compilation.

### Requirement: Implementation note

In the CLI, no adapter implements this port: the CLI calls `ConfigWriter.addPlugin()` and `ConfigWriter.removePlugin()` directly, with the same `configPath`-first signatures, and reads declarations from the in-memory `SpecdConfig` snapshot instead of `listPlugins()`, and the conformance requirement guarantees that a `ConfigWriter` is a valid `PluginRepositoryPort`.

## Constraints

- The port is an abstraction — implementations handle the actual storage.

## Spec Dependencies

- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — plugin name rule and contribution ids
- `core:config-writer-port` — `ConfigWriter` signatures the port mirrors and `ConfigDeclaredPlugin`
