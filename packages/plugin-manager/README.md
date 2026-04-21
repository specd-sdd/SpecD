# @specd/plugin-manager

Plugin infrastructure for specd. Defines the base plugin contracts (`SpecdPlugin`, `AgentPlugin`) and provides loading and validation utilities consumed by the CLI and agent plugins.

## Exports

### Domain types

- **`SpecdPlugin`** — base plugin interface (`name`, `type`, `version`, `configSchema`, `init`, `destroy`).
- **`AgentPlugin`** — extends `SpecdPlugin` with `install` and `uninstall` for AI-agent integrations.
- **`InstallOptions`** / **`InstallResult`** — input and output types for skill install operations.
- **`isSpecdPlugin()`** / **`isAgentPlugin()`** — type guards for runtime validation.

### Infrastructure

- **Plugin loader** — discovers and instantiates plugins from package manifests.

## Usage

Agent plugins implement the `AgentPlugin` interface and export a `create()` factory:

```typescript
import type { AgentPlugin } from '@specd/plugin-manager'

export function create(): AgentPlugin {
  // return your plugin instance
}
```

## License

MIT
