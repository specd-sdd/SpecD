# plugin-manager:plugin-loader

## Purpose

Infrastructure component for dynamically loading plugins. Handles package resolution, manifest validation, and plugin instantiation.

## Requirements

### Requirement: Load workflow

The loader MUST:

1. **Package availability**: The package must be in node_modules (installed via npm/pnpm or linked as workspace)
2. **Resolve path**: Resolve the package with Node module resolution (`createRequire`), first from the project root and then from the loader package's own location; failure is a `PluginNotFoundError`
3. **Read manifest**: Read `specd-plugin.json` from the package root
4. **Validate manifest**: Validate with the Zod manifest schema (name rule, `contributes`, contribution id uniqueness across the plugin, `configSchema` subset, `defaultConfig` against `configSchema`) **before** importing any plugin code
5. **Validate contribution blocks**: For every kind in `contributes`, require a registered kind handler and validate the block with the handler's `blockSchema`; an unregistered kind is an `UnknownContributionKindError`
6. **Dynamic import**: `import(name)` as ESM module
7. **Factory call**: Resolve the factory (a named `create` export, a default export that is itself the function, or a default export object with a `create` member), await `create({ config })` (it MAY return a promise); a module with no resolvable factory is a `PluginValidationError` naming the field `create`
8. **Validate interface**: Use `isSpecdPlugin` from the domain layer to validate the returned object, then require that `contribution(kind, id)` exists when any declared kind has a handler with `activate`
9. **Cross-check**: The returned plugin's `name` and `version` MUST equal the manifest values, and the manifest `name` MUST equal the plugin name that was requested (the `name` of the `plugins` entry); a manifest published under a different name is a `PluginValidationError` naming the requested plugin

The loader does not run `init`; lifecycle is owned by the register-plugins use case.

`createPluginLoader(options: PluginLoaderOptions)` takes `PluginLoaderOptions { config: SpecdConfig; handlers?: readonly ContributionKindHandler[] }`. This is the loader-construction option bag and is distinct from the object handed to a plugin's `create()` (see Factory function), which carries `config` only. The loader always registers the built-in `agents` handler first; a host-supplied handler for the kind `agents` (or any other duplicate kind) is a host wiring error: `createPluginLoader` MUST throw `DuplicateHandlerKindError` when it is created, before any plugin is loaded. A `ContributionKindHandler` MAY implement `validatePlugin(plugin, pluginName)`, run after the base contract check; the `agents` handler uses it to require `install` and `uninstall` on the loaded plugin (`PluginValidationError` naming the plugin otherwise).

### Requirement: Manifest schema

```typescript
const SpecdPluginManifestSchema = z.object({
  schemaVersion: z.literal(2),
  name: z.string().regex(PLUGIN_NAME_REGEX),
  version: z.string().min(1),
  description: z.string().optional(),
  minCoreVersion: z.string().default('*'),
  contributes: z.record(z.record(z.unknown())).default({}),
  configSchema: z.unknown().optional(), // shape checked by the schema-subset walker

  defaultConfig: z.record(z.unknown()).optional(),
})
```

The schema is strict: any unknown top-level field, including `pluginType`, MUST be rejected with a `PluginValidationError` whose `fields` name each offending key. The loader additionally enforces contribution id uniqueness across all kinds and validates `defaultConfig` against `configSchema`. The `configSchema` value is checked by a dedicated walker (see `plugin-manager:specd-plugin-type`, Plugin configuration schema) and accepts only `type`, `properties`, `required`, `items`, `enum`, `default` and `additionalProperties`; any other keyword raises `UnsupportedSchemaKeywordError`.

### Requirement: Error handling

Validation failures MUST throw typed errors that name the plugin:

- Invalid manifest, invalid plugin name, or base contract violation (missing `name`, `version`, `init`, `destroy`) — `PluginValidationError`; for a base contract violation its `fields` MUST list exactly the fields that failed the check, not a fixed list
- Manifest file missing or unreadable, or not valid JSON — `PluginValidationError` with `fields: ['specd-plugin.json']` and `cause` set to the underlying read or parse error
- Plugin entry module that fails to import — `PluginValidationError` with `fields: ['entry']` and `cause` set to the import error
- `create()` factory that throws a non-`SpecdError`, or a module export (`create`, `default.create`) whose getter throws — `PluginValidationError` with `fields: ['create']` and `cause` set to the thrown value; a `SpecdError` thrown by the factory propagates unchanged
- A contribution-kind handler whose `validatePlugin` or block-schema parsing throws something other than a `SpecdError`, or a loaded plugin whose base-contract accessors throw — `PluginValidationError` naming the plugin (`fields: ['contributes.<kind>']` for a handler, `['plugin']` for a throwing accessor) with the thrown value as `cause`; a `SpecdError` propagates unchanged
- Non-string, empty or relative `config.projectRoot` when loading — `PluginValidationError` (`fields: ['projectRoot']`)
- A contribution-kind handler whose `validatePlugin` is asynchronous: it MUST be awaited, and a rejection is wrapped like a synchronous throw; a handler whose block-schema parse returns something that is not a parse result is wrapped the same way
- A manifest key named `__proto__` under `contributes` is a kind like any other and raises `UnknownContributionKindError`; it is never silently dropped
- Duplicate contribution id — `DuplicateContributionError`
- Kind without a registered handler — `UnknownContributionKindError`
- Unsupported config schema keyword — `UnsupportedSchemaKeywordError`
- `defaultConfig` not satisfying `configSchema` — `InvalidPluginConfigError`
- Duplicate contribution kind handler (host wiring) — `DuplicateHandlerKindError`, which carries the kind and, being raised before any plugin is loaded, does not name a plugin

### Requirement: Factory function

The npm package MUST export a factory `create(options): SpecdPlugin | Promise<SpecdPlugin>` as a named `create` export, as a default export that is itself the function (`export default create`), or as a default export object with a `create` member. The loader awaits the result.

The `options` object passed to the factory SHALL contain the fully-resolved `SpecdConfig` only (it does not carry handlers):

```typescript
{ readonly config: SpecdConfig }
```

## Constraints

- All I/O happens here in the infrastructure layer.
- Zod validation happens at the boundary before reaching domain.
- Manifest and config schema validation MUST NOT execute plugin code.
- The loader MUST NOT call `init`, `install` or `destroy`.

## Spec Dependencies

- [`core:config`](../../core/core/config/spec.md) — defines SpecdConfig type
- [`plugin-manager:specd-plugin-type`](../specd-plugin-type/spec.md) — manifest model, name rule, kind handlers
- [`plugin-manager:plugin-errors`](../plugin-errors/spec.md) — error classes
