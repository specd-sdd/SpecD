# Design: plugin-manifest-version

## Problem

Plugin classes hardcode `name` and `version` as string literals. Every version bump requires editing 4 identical strings across 4 plugin packages. The `specd-plugin.json` manifest lacks a `version` field and the `name` field is not read at runtime.

## Approach

Each plugin's `create()` factory reads `specd-plugin.json` at the infrastructure boundary and passes `name` and `version` to the plugin constructor. The `PluginLoader` only needs its Zod schema updated to validate the new `version` field. A sync script (`dev/scripts/sync-plugin-manifests.ts`) writes `package.json#version` into `specd-plugin.json` as a `prebuild` step.

## Affected areas

### `@specd/plugin-manager`

- `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts` — add `version: z.string().min(1)` to `manifestSchema`
- No changes to `PluginLoader.load()`, the port interface, or any use case

### `@specd/plugin-agent-claude`

- `packages/plugin-agent-claude/src/index.ts` — read `specd-plugin.json`, pass `name` and `version` to constructor
- `packages/plugin-agent-claude/src/domain/types/claude-plugin.ts` — constructor accepts `name` and `version`, remove hardcoded getters
- `packages/plugin-agent-claude/specd-plugin.json` — add `version` field
- `packages/plugin-agent-claude/package.json` — add `"specd-plugin.json"` to `files`, add `prebuild` script

### `@specd/plugin-agent-copilot`

- `packages/plugin-agent-copilot/src/index.ts` — same pattern as claude
- `packages/plugin-agent-copilot/src/domain/types/copilot-plugin.ts` — same pattern as claude
- `packages/plugin-agent-copilot/specd-plugin.json` — add `version` field
- `packages/plugin-agent-copilot/package.json` — same pattern as claude

### `@specd/plugin-agent-codex`

- `packages/plugin-agent-codex/src/index.ts` — same pattern as claude
- `packages/plugin-agent-codex/src/domain/types/codex-plugin.ts` — same pattern as claude
- `packages/plugin-agent-codex/specd-plugin.json` — add `version` field
- `packages/plugin-agent-codex/package.json` — same pattern as claude

### `@specd/plugin-agent-opencode`

- `packages/plugin-agent-opencode/src/index.ts` — same pattern as claude
- `packages/plugin-agent-opencode/src/domain/types/opencode-plugin.ts` — same pattern as claude
- `packages/plugin-agent-opencode/specd-plugin.json` — add `version` field
- `packages/plugin-agent-opencode/package.json` — same pattern as claude

### `dev/scripts/`

- `dev/scripts/sync-plugin-manifests.ts` — new script

## New constructs

### Manifest reader utility (per plugin `index.ts`)

Each plugin factory needs a function to find and read `specd-plugin.json`:

```typescript
import { PluginValidationError } from '@specd/plugin-manager'

async function readManifest(): Promise<{ name: string; version: string }> {
  const candidates = [
    path.join(dirname(fileURLToPath(import.meta.url)), 'specd-plugin.json'),
    path.join(dirname(fileURLToPath(import.meta.url)), '..', 'specd-plugin.json'),
  ]
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, 'utf8')
      const manifest = JSON.parse(raw) as { name: string; version: string }
      return { name: manifest.name, version: manifest.version }
    } catch {
      continue
    }
  }
  throw new PluginValidationError('<package-name>', ['specd-plugin.json'])
}
```

This searches own directory first (works if manifest is copied alongside `dist/`), then parent (works when manifest is at package root, `dist/` is one level down). Throws `PluginValidationError` (extends `SpecdError` from `@specd/core`) for consistency with the rest of the plugin system.

### Manifest sync script (`dev/scripts/sync-plugin-manifests.ts`)

```typescript
const PLUGIN_PACKAGES = [
  'packages/plugin-agent-claude',
  'packages/plugin-agent-copilot',
  'packages/plugin-agent-codex',
  'packages/plugin-agent-opencode',
]
```

For each package:

1. Read `package.json#version`
2. Read `specd-plugin.json`
3. Set `version` field in manifest
4. Write back `specd-plugin.json`

### Plugin constructor change

Current:

```typescript
constructor(
  private readonly runInstall: InstallOperation,
  private readonly runUninstall: UninstallOperation,
) {}
```

New:

```typescript
constructor(
  private readonly pluginName: string,
  private readonly pluginVersion: string,
  private readonly runInstall: InstallOperation,
  private readonly runUninstall: UninstallOperation,
) {}
```

Getters change:

```typescript
get name(): string { return this.pluginName }
get version(): string { return this.pluginVersion }
get type(): 'agent' { return 'agent' }  // stays hardcoded
```

### Manifest schema update

Current in `plugin-loader.ts`:

```typescript
const manifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  name: z.string().min(1),
  pluginType: z.enum(['agent']),
  minCoreVersion: z.string().default('*'),
  description: z.string().optional(),
})
```

New:

```typescript
const manifestSchema = z.object({
  schemaVersion: z.number().int().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  pluginType: z.enum(['agent']),
  minCoreVersion: z.string().default('*'),
  description: z.string().optional(),
})
```

### Package.json changes (all 4 plugin packages)

Add to `files`:

```json
"files": ["dist/", "specd-plugin.json"]
```

Update `build` script to run sync before tsup:

```json
"scripts": {
  "build": "node --import tsx ../../dev/scripts/sync-plugin-manifests.ts && tsup src/index.ts --format esm --dts --clean",
  ...
}
```

`prebuild` is not a recognized npm lifecycle script, so the sync must be chained directly in the `build` script.

## Testing

- **Unit tests** for each plugin class: verify `name`, `version` come from constructor, `type` is hardcoded `'agent'`
- **Unit test** for `PluginLoader`: verify manifest without `version` fails validation
- **Integration test** for sync script: verify it writes correct version from `package.json` to `specd-plugin.json`
- **Unit test** for manifest reader utility: verify it finds manifest in own dir first, then parent fallback

## Open questions

_none_
