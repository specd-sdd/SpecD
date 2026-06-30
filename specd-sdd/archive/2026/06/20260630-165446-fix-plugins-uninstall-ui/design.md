# Design: fix-plugins-uninstall-ui

## Shared helpers (`plugin-bucket.ts`)

- `toPluginBucket(pluginType)` — `agent` → `agents`, `ui` → `ui`
- `listDeclaredPlugins(config)` — merge `agents` + `ui` buckets with bucket key
- `findDeclaredPlugin(config, name)` — lookup across buckets

Install imports `toPluginBucket` from here (remove local duplicate).

## Uninstall

Extract `uninstallPluginsWithKernel`:

1. `LoadPlugin` → `plugin.type`
2. `UninstallPlugin.execute`
3. `removePlugin(configPath, toPluginBucket(type), name)`

## Update

Replace `getDeclaredPlugins(config, 'agents')` with `listDeclaredPlugins(config)` for default update set and declaration lookup.

## Tests

- UI uninstall → `removePlugin` bucket `ui`
- Update all with `plugins.ui` entry included
