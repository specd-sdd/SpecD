# Proposal: plugin-manifest-version

## Motivation

Plugin versions and identity are hardcoded as string literals in each of the 4 agent plugin classes. Every version bump or name change requires editing identical strings across multiple packages with no automation to keep them in sync. The `specd-plugin.json` manifest lacks a version field entirely, and the fields it already has (`name`, `pluginType`) are duplicated as hardcoded values in plugin classes rather than read from the manifest.

## Current behaviour

Each agent plugin class (`ClaudeAgentPlugin`, `CopilotAgentPlugin`, `CodexAgentPlugin`, `OpenCodeAgentPlugin`) hardcodes `name`, `type`, and `version` as string literals. The manifest file (`specd-plugin.json`) already contains `name` and `pluginType`, but these are not read at runtime — they exist only for loader validation. The manifest lacks a `version` field entirely. The `create()` factory function takes no arguments and does not read any external files.

## Proposed solution

Add a `version` field to `specd-plugin.json` sourced from `package.json` via a sync script. Each plugin's `create()` factory reads its own manifest and passes `name` and `version` to the plugin constructor — these manifest-derived fields come from the manifest, eliminating hardcoded values. The `type` field remains hardcoded in plugin classes since `AgentPlugin` can only be `'agent'` — reading it from the manifest would allow invalid types at runtime. `PluginLoader` only needs its manifest schema updated to validate the new `version` field. Add a `dev/scripts/sync-plugin-manifests.ts` script wired into the build pipeline.

## Specs affected

### New specs

_none_

### Modified specs

- `plugin-manager:plugin-loader`: Add `version` to the manifest Zod schema so the loader validates it. No changes to the load workflow or version passing.
  - Depends on (added): none

- `plugin-manager:specd-plugin-type`: Add a constraint that `name` and `version` MUST be sourced from the manifest at runtime, not hardcoded in plugin classes. `type` remains hardcoded for type safety.
  - Depends on (added): none

- `plugin-agent-claude:plugin-agent`: Update `create()` factory to read manifest and pass `name` and `version` to constructor. Plugin class receives these via constructor instead of hardcoding them. `type` stays hardcoded as `'agent'`.
  - Depends on (added): none

- `plugin-agent-copilot:plugin-agent`: Same as claude — factory reads manifest, constructor receives `name` and `version`.
  - Depends on (added): none

- `plugin-agent-codex:plugin-agent`: Same as claude — factory reads manifest, constructor receives `name` and `version`.
  - Depends on (added): none

- `plugin-agent-opencode:plugin-agent`: Same as claude — factory reads manifest, constructor receives `name` and `version`.
  - Depends on (added): none

## Impact

- **`@specd/plugin-manager`**: Manifest Zod schema gains a `version` field for validation. No changes to `PluginLoader.load()`, the port interface, or how versions reach plugins.
- **`@specd/plugin-agent-*`** (4 packages): Each plugin's `create()` factory in `index.ts` reads `specd-plugin.json` by searching the same directory as the module first, then the parent directory as fallback. Passes `name` and `version` to the plugin constructor. `type` remains hardcoded as `'agent'` for type safety. Plugin classes no longer hardcode `name` or `version`. The `create()` signature remains `create(): AgentPlugin`. The `files` field in each `package.json` gains `"specd-plugin.json"` so npm publishes it alongside `dist/`.
- **`dev/scripts/`**: New `sync-plugin-manifests.ts` script. Reads each plugin package's `package.json#version` and writes it into the corresponding `specd-plugin.json#version`.
- **Build pipeline**: The sync script runs as part of each plugin package's `build` script, chained before `tsup`. At runtime, both the `PluginLoader` and each plugin's `create()` read the single `specd-plugin.json` from the package root — no duplication.

## Technical context

### Version flow chain

`package.json#version` → (sync script at build time) → `specd-plugin.json#version` → (each plugin's `create()` reads manifest: own directory first, parent as fallback) → (passes to constructor) → (plugin stores and exposes via `get version()`)

Each plugin owns reading its own manifest. The `PluginLoader` validates the manifest but does not extract or forward version — version reading is the plugin's responsibility, not the loader's. The `create()` factory resolves `specd-plugin.json` by checking its own directory first, then `..` as fallback — works both in dev (source tree) and after publish (`dist/` with manifest at package root). Single file, no duplication.

### Why each plugin reads its own manifest

- The `create()` factory is the package's infrastructure boundary (`index.ts` → `dist/index.js`) — reading a JSON file here does not violate hexagonal architecture.
- No changes needed to `PluginLoader` internals, the `PluginLoader` port, or any use case.
- Each plugin is self-contained: it searches for `specd-plugin.json` in its own directory first, then the parent — works in dev (source) and production (`dist/`).
- Adding `"specd-plugin.json"` to `files` in `package.json` ensures npm publishes the manifest. Both the `PluginLoader` and the plugin's `create()` read the same single file — no duplication.

### Rejected alternatives

- **PluginLoader passes version to factory** — adds coupling between loader internals and the factory contract. The loader's job is validation and instantiation, not providing runtime data to plugins.
- **Read `package.json` at runtime from domain classes** — I/O in the domain layer, violating hexagonal architecture.

### Scope decision

`name` and `version` come from the manifest at runtime. `type` stays hardcoded as `'agent'` — reading it from the manifest would allow invalid types at runtime, and `AgentPlugin` can only be `'agent'`.

### Impact analysis

Risk is reduced compared to the loader-passing approach: `plugin-loader.ts` only gets a minor schema update. The bulk of changes are in each plugin's `index.ts` and domain class, which are self-contained per package.

## Open questions

_none_
