# @specd/plugin-manager

Plugin infrastructure for [specd](https://github.com/specd-sdd/SpecD). For more information, visit [getspecd.dev](https://getspecd.dev). Defines the base plugin contracts (`SpecdPlugin`, `AgentPlugin`) and provides loading and validation utilities consumed by the CLI and agent plugins.

## Exports

### Domain types

- **`SpecdPlugin`** — base plugin interface (`name`, `version`, `init`, `destroy`, optional `install` / `uninstall` / `contribution`).
- **`AgentPlugin`** — agent contribution contract. `install` and `uninstall` take a context with `config`, `contributions`, and optional `options`.
- **`InstallOptions`** / **`InstallResult`** — input and output types for skill install operations.
- **`isSpecdPlugin()`** / **`isAgentPlugin()`** — type guards for runtime validation.

### Infrastructure

- **Plugin loader** — discovers and instantiates plugins from package manifests.

## Format

Manifests use `schemaVersion: 2`. Project config uses `configVersion: 2` and a flat `plugins` list. There is no changelog file in this package; this note is the migration record.

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
