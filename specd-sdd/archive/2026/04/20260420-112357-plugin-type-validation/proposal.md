# Proposal: plugin-type-validation

## Motivation

The plugin-manager's install, uninstall, and update use cases hardcode a cast to `AgentPlugin` without verifying the plugin type at runtime. This works today because only agent plugins exist, but it will silently break when new plugin types arrive that lack install/uninstall methods.

## Current behaviour

All three lifecycle use cases (`InstallPlugin`, `UninstallPlugin`, `UpdatePlugin`) load a plugin via the `PluginLoader` and immediately cast it to `AgentPlugin` with `plugin as AgentPlugin`. The `isSpecdPlugin` type guard in the loader does not check whether `plugin.type` is a known type — it only checks property shapes. The `isAgentPlugin` guard is a private function in the infrastructure layer (`plugin-loader.ts`), inaccessible from domain or application code. The `validateRuntimePlugin` method only handles `'agent'` explicitly with no path for unknown types.

## Proposed solution

- Derive `PluginType` from a runtime const array `PLUGIN_TYPES` so the same source serves both compile-time types and runtime validation.
- Enhance `isSpecdPlugin` to verify that `type` is one of the known `PLUGIN_TYPES`.
- Move `isAgentPlugin` from infrastructure (`plugin-loader.ts`) to domain (`agent-plugin.ts`) so use cases can call it directly.
- Add `isAgentPlugin` checks in `InstallPlugin`, `UninstallPlugin`, and `UpdatePlugin` before calling install/uninstall — throw `PluginValidationError` if the plugin doesn't support the operation.
- Update `validateRuntimePlugin` to use the domain-level type guards and reject unknown types explicitly.

## Specs affected

### New specs

_none_

### Modified specs

- `plugin-manager:specd-plugin-type`: Add `PLUGIN_TYPES` const array, derive `PluginType` from it, add exported `isSpecdPlugin` function that checks type against known types.
  - Depends on (added): none

- `plugin-manager:agent-plugin-type`: Add exported `isAgentPlugin` type guard function to domain (moved from infrastructure).
  - Depends on (added): none

- `plugin-manager:install-plugin-use-case`: Add requirement that the use case MUST verify the loaded plugin is an `AgentPlugin` before calling install. Throw `PluginValidationError` if not.
  - Depends on (added): none

- `plugin-manager:uninstall-plugin-use-case`: Add requirement that the use case MUST verify the loaded plugin is an `AgentPlugin` before calling uninstall. Throw `PluginValidationError` if not.
  - Depends on (added): none

- `plugin-manager:update-plugin-use-case`: Add requirement that the use case MUST verify the loaded plugin is an `AgentPlugin` before calling install. Throw `PluginValidationError` if not.
  - Depends on (added): none

- `plugin-manager:plugin-loader`: Update `validateRuntimePlugin` to use domain-level type guards and reject unknown plugin types explicitly.
  - Depends on (added): none

## Impact

- **Domain types** (`specd-plugin.ts`, `agent-plugin.ts`): new const array and exported type guard functions.
- **Application use cases** (`install-plugin.ts`, `uninstall-plugin.ts`, `update-plugin.ts`): add type guard checks before method calls.
- **Infrastructure loader** (`plugin-loader.ts`): remove local type guards (now in domain), update `validateRuntimePlugin` to import from domain, reject unknown types.
- **No API breaking changes** — all changes are additive (new const, new exports) or internal safety checks.

## Technical context

All 6 specs are existing and require deltas (no new specs). The change is scoped to `@specd/plugin-manager` only.

Key decisions from exploration:

- `PLUGIN_TYPES` const array derives `PluginType` — single source of truth for known types. Currently `['agent']`.
- `isSpecdPlugin` checks `type` field is in `PLUGIN_TYPES` at runtime.
- `isAgentPlugin` moves to domain as a pure function — it checks `type === 'agent'` and presence of `install`/`uninstall` methods.
- The manifest schema (`z.enum(['agent'])`) remains unchanged — it limits what the loader accepts. `PLUGIN_TYPES` is the runtime counterpart for already-loaded plugins.
- Use cases throw `PluginValidationError` when a plugin doesn't support the requested operation (e.g. trying to install a non-agent plugin).
- Future plugin types without install/uninstall will be valid `SpecdPlugin`s but not `AgentPlugin`s.

## Open questions

_none_
