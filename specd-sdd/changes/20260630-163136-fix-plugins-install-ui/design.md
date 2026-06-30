# Design: fix-plugins-install-ui

## Overview

Wire `specd plugins install` to the plugin-manager split already specified for UI vs agent plugins.

## Components

### `installPluginsWithKernel` (`packages/cli/src/commands/plugins/install.ts`)

1. Create `InstallPlugin`, `InstallUiPlugin`, and `LoadPlugin` from one `PluginLoader`.
2. Track declared names per bucket (`agents`, `ui`) from `getDeclaredPlugins`.
3. For each requested package name:
   - Validate npm-like name syntax.
   - `LoadPlugin.execute` → `plugin.type`.
   - Skip with warning if name already in that bucket.
   - Branch install use case by type.
   - `ConfigWriter.addPlugin(configPath, bucket, name)`.

### Bucket mapping

| `PluginType` | Config key |
| ------------ | ---------- |
| `agent`      | `agents`   |
| `ui`         | `ui`       |

## Tests

- Extend `packages/cli/test/commands/plugins.spec.ts`:
  - Agent path unchanged (`InstallPlugin`, bucket `agents`).
  - UI path: `InstallUiPlugin`, bucket `ui`, agent install not called.

## Out of scope

- `plugins uninstall` / `plugins update` UI routing
- Changing `InstallUiPlugin` or bundle plugin behaviour

## Blast radius

Low — CLI install command only. No kernel or API changes.
