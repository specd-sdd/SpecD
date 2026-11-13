# plugin-manager:plugin-errors

## Purpose

Defines error classes for plugin operations. All errors extend the base `SpecdError` from the domain.

## Requirements

### Requirement: PluginNotFoundError

```typescript
class PluginNotFoundError extends SpecdError {
  readonly pluginName: string
}
```

The error MUST include the plugin name that was not found.

### Requirement: PluginValidationError

```typescript
class PluginValidationError extends SpecdError {
  readonly pluginName: string
  readonly fields: readonly string[]
  readonly cause?: unknown
}
```

The error MUST include:

- The plugin name that failed validation
- Array of fields that failed validation
- The underlying `cause` when the failure comes from reading or parsing a file (for example an unreadable or non-JSON `specd-plugin.json`), so a missing manifest can be told apart from invalid JSON

Every error class defined in this spec MUST carry a message that names the plugin (or the kind, for host wiring errors) and states what is expected or how to fix it.

### Requirement: Contribution and configuration errors

Each class MUST extend `SpecdError`, carry the `pluginName` it concerns (`PluginDestroyError` carries `pluginNames`, since one disposal can concern several plugins), expose a stable `code` in UPPER_SNAKE_CASE and an actionable message:

```typescript
class DuplicateContributionError extends SpecdError {
  // code: DUPLICATE_CONTRIBUTION_ID
  readonly pluginName: string
  readonly contributionId: string
}
class UnknownContributionError extends SpecdError {
  // code: UNKNOWN_CONTRIBUTION
  readonly pluginName: string
  readonly contributionId: string // id in the `contributions` allowlist not declared by the manifest
}
class UnknownContributionKindError extends SpecdError {
  // code: UNKNOWN_CONTRIBUTION_KIND
  readonly pluginName: string
  readonly kind: string // kind with no registered handler
}
class InvalidPluginConfigError extends SpecdError {
  // code: INVALID_PLUGIN_CONFIG
  readonly pluginName: string
  readonly issues: readonly string[] // includes "config given but no configSchema declared"
}
class UnsupportedSchemaKeywordError extends SpecdError {
  // code: UNSUPPORTED_SCHEMA_KEYWORD
  readonly pluginName: string
  readonly keyword: string
}
class PluginInitError extends SpecdError {
  // code: PLUGIN_INIT_FAILED
  readonly pluginName: string
  readonly cause: unknown
}
class PluginDestroyError extends SpecdError {
  // code: PLUGIN_DESTROY_FAILED
  readonly errors: readonly unknown[] // every failure raised by `destroy`, in destroy order
  readonly pluginNames: readonly string[] // the plugin behind each entry of `errors`, same order; the message names them
}
```

Invalid plugin names, invalid manifests and base-contract violations continue to use `PluginValidationError`; it exposes `fields: readonly string[]` (the failing fields) and an optional `cause`, used when an install hook failure is wrapped. `PluginNotFoundError` (code `PLUGIN_NOT_FOUND`) carries `pluginName`; `PluginValidationError` has code `PLUGIN_VALIDATION_ERROR`.

**Specd compatibility.** Every error that plugin-manager lets escape MUST be an instance of `SpecdError` (with a stable `code`), so hosts recognize it as a specd error and map it to the standard exit code and structured output. No plugin-manager API MAY surface a plain `Error`, `AggregateError` or any other non-`SpecdError` thrown by plugin code: such a failure is wrapped in the typed error of the phase that failed (`PluginValidationError` while loading, `PluginInitError` during `init` or `activate`, `PluginDestroyError` during `destroy`) with the original preserved as `cause` (or in `errors`). This includes failures raised by a contribution-kind handler and by a caller-supplied `PluginLoader`, and it holds for hostile inputs too: throwing getters on the plugin or on the module exports, a loader that resolves to something that is not `{ plugin, manifest }`, a handler schema that transforms to a non-object, a non-string, empty or relative project root, an agent-hook accessor (`install`/`uninstall`) that throws (`PluginValidationError` with `fields: ['install', 'uninstall']` and the thrown value as `cause`), and a `throw undefined` (whose `cause` is still recorded). When the original error cannot carry extra properties (frozen or non-extensible), it still propagates unchanged. The same holds for the manifest walk of `InstallPlugin`, `UpdatePlugin` and `UninstallPlugin` (contribution ids, `defaultConfig`): a non-`SpecdError` raised while walking the manifest is wrapped in `PluginValidationError` (`fields: ['load']`) with the original as `cause`, and a manifest with more than 100,000 contribution ids is handled without stack growth. A `SpecdError` thrown by plugin code propagates unchanged. A `PluginValidationError` that wraps a `cause` MUST include the cause's message in its own message, so a host that prints only `message` is not misled into blaming `specd-plugin.json`.

`UnsupportedSchemaKeywordError` is also raised for a `configSchema` node that is not an object; in that case `keyword` is `type` (nested node) or `configSchema` (root value).

`PluginInitError` wraps only errors that are not already a `SpecdError`; a `SpecdError` thrown by `init` propagates unchanged (see `plugin-manager:register-plugins-use-case`).

### Requirement: Host wiring and address errors

Two further classes extend `SpecdError`:

```typescript
class DuplicateHandlerKindError extends SpecdError {
  // code: DUPLICATE_HANDLER_KIND
  readonly kind: string // kind registered twice, including a host handler for `agents`
}
class InvalidContributionAddressError extends SpecdError {
  // code: INVALID_CONTRIBUTION_ADDRESS
  readonly address: string // the offending address (or name/id parts for builds)
}
```

`DuplicateHandlerKindError` is a host wiring error raised when the loader or `registerPlugins` is set up; it carries the `kind` and no plugin name. `InvalidContributionAddressError` is raised by `buildContributionAddress` and `parseContributionAddress` for every invalid address, name or id.

## Constraints

- Errors MUST extend `SpecdError` from `@specd/core`.
- Errors SHOULD be catchable by type for error handling.
- Every error raised while loading, validating or initializing a plugin MUST name the plugin, except `DuplicateHandlerKindError` (host wiring error, raised before any plugin is loaded) and `InvalidContributionAddressError`, which do not concern a single plugin.
- `LEGACY_CONFIG_FORMAT` and `UNSUPPORTED_CONFIG_VERSION` are configuration errors owned by `@specd/core`, not by this package.

## Spec Dependencies

- [`default:_global/architecture`](../default/_global/architecture/spec.md) — SpecdError base class
