# Proposal: plugin-architecture

## Motivation

The plugin system only supports one plugin type (`agent`), one type per plugin, and nothing ever calls `init`/`destroy`. Everything with a registry in the kernel (checks, hook runners, parsers, storage, VCS/actor providers) and other subsystems (code-graph adapters/stores, skills) is a natural plugin target, and what we fix now defines how every future plugin works. Nothing on this branch has been released, so breaking changes are acceptable.

## Current behaviour

- `PLUGIN_TYPES = ['agent']` (`plugin-manager/src/domain/types/specd-plugin.ts`); the manifest schema is `pluginType: z.enum(['agent'])` (`infrastructure/loader/plugin-loader.ts`).
- Manifest fields: `schemaVersion`, `name`, `version`, `description`, `pluginType`, `minCoreVersion`. `configSchema` lives in plugin code with `ConfigSchemaEntry.type` a flat `'string' | 'boolean' | 'number'`; `PluginContext` only carries `config: SpecdConfig`.
- `init`/`destroy` exist on `SpecdPlugin` but no code calls them. The five `plugin-agent-*` declare an empty `configSchema`.
- `specd.yaml` `plugins` is a strict `{ agents?: [{ name, config? }] }` (`PluginsZodSchema` in `core/src/application/ports/config-schema.ts`), with cascade in `config-cascade.ts`. `ConfigWriter.addPlugin(configPath, type, name, config?)` / `removePlugin` take a bucket type.
- `InstallPlugin` throws `PluginValidationError` unless the plugin is an agent plugin; `cli plugins uninstall` hardcodes the `agents` bucket; "already installed" uses `getDeclaredPlugins(config, 'agents')`.
- Plugin check ids use `@${pluginName}.${check.id}` (`core/src/domain/services/check-registry.ts`), but `PLUGIN_NAME_REGEX = /^[a-zA-Z0-9_-]+$/` contradicts its own JSDoc (`^[a-z][a-z0-9-]*$`) and does not allow `@`/`/`.
- No path loads plugins into the kernel: `createSdkContext` calls `createKernel` directly.

## Proposed solution

**A plugin is a feature**: one scoped package that owns identity, namespace, config, lifecycle and a single code entry, and declares N **contributions** statically in `specd-plugin.json` under `contributes` (a map keyed by contribution kind, each entry with a local id, no `.`, unique across the plugin). A contribution is addressed as `@scope/name.id`. `pluginType` disappears.

- **Kinds are extension points** owned by the consuming subsystem and supplied as handlers to an **open registry** in `@specd/plugin-manager`. A handler defines its kind's manifest block schema, code contract, and how it registers. plugin-manager is the generic engine: discovery, manifest, config validation, lifecycle, addressing, uniqueness.
- **Naming**: plugin name is the npm `name` and MUST be scoped (`@scope/name`). `.` is the reserved separator. Validated in manifest schema, loader, `isSpecdPlugin`, `cli plugins install` and defensively in the check registry (regex/JSDoc mismatch fixed).
- **Config**: one config per plugin, declared in the manifest (`configSchema`) as a bounded JSON Schema subset (`type`, `properties`, `required`, `items`, `enum`, `default`, `additionalProperties`; other keywords rejected with a typed error), converted to Zod internally by plugin-manager, so config and `defaultConfig` are validated without executing plugin code. Empty/absent schema = no config. Optional manifest `defaultConfig` written to `specd.yaml` on install when the entry has no config.
- **`specd.yaml`**: flat list `plugins: [{ name, config?, contributions? }]`. `contributions` is an allowlist (absent = all); no `exclude`. `PluginsZodSchema` becomes an array; `ConfigWriter.addPlugin/removePlugin` drop `type` and gain selection; this repo's `specd.yaml`, cascade, `project init` and `cli plugins *` migrate.
- **Config versioning and migration**: `specd.yaml` gains an optional top-level `configVersion` (integer; this change introduces version `2`). The loader detects the legacy format by shape (`plugins` as an object with `agents`) and fails with a typed `LEGACY_CONFIG_FORMAT` error that prints the exact replacement snippet including `configVersion: 2`. An unsupported (greater) `configVersion` is a typed error asking to upgrade specd. An absent `configVersion` is accepted when the shape is current, so hand-written configs keep working; `project init` and the printed snippet write it. No automatic file rewrite (YAML comments), no `migrate` command in this change.
- **Lifecycles** (explicit methods): runtime `init`/`destroy` once per process that loads plugins, for every configured plugin, config only. Order: `init` all (list order) → kind handlers register on the builder → `build()` → `destroy` in reverse through one named disposer registered by plugin-manager (error-isolated; partial-init failure destroys the initialized ones). Install `install`/`uninstall` receive selected contribution ids and do not call `init`. Any load/validation/`init` failure fails startup with a typed error naming the plugin.
- **SDK**: new `registerPlugins(builder, config)` (new use case `plugin-manager:register-plugins-use-case`) called by `createSdkContext`, which moves from `createKernel` to `createKernelBuilder` + `registerPlugins` + `build()`. `sdk` depends on `@specd/plugin-manager`. Option `plugins: false` (default `true`) skips everything; used by the graph-index worker and `cli plugins *` so a broken plugin can still be repaired.
- **Migration**: agent plugins become the `agents` contribution kind via an `agent` handler; install/uninstall/update/list use cases and `cli plugins *` become kind-agnostic.

Reserved but not implemented here: host contributions (`host:cli`, `host:mcp`), data extensions (namespaced change-manifest sections), per-contribution config/`init`/entry, `exclude`/`enabled`, and the `skills`/`skillInjections` contributions.

## Specs affected

### New specs

- `plugin-manager:register-plugins-use-case`: `registerPlugins(builder, config)`: load configured plugins, validate config, run `init`, dispatch contributions to kind handlers, register the `destroy` disposer; `plugins: false` bypass.
  - Depends on: `plugin-manager:specd-plugin-type`, `plugin-manager:plugin-loader`, `plugin-manager:plugin-errors`, `core:kernel-builder`, `core:config`
- `skills:shared-folder-owners`: owners marker (`.owners.json`) in the shared folder plus `addSharedOwner` / `removeSharedOwner` / `removeSharedFolderIfEmpty` helpers in `@specd/skills`, so that an agent plugin's full uninstall deletes the shared files only when it is the last owner and the folder only when it is empty. Added after verification-attempt-2 found that every agent uninstall deleted `shared.md` and the `*.agent.md` files that other installed agents still reference.
  - Depends on: `skills:skill-bundle`, `skills:skill-repository`

### Modified specs

- `core:config`: `plugins` becomes a flat list `{ name, config?, contributions? }`; scoped-name rule; optional top-level `configVersion`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-loader`: parse/cascade the flat plugins list; legacy `agents` bucket detected by shape and rejected with `LEGACY_CONFIG_FORMAT` and a migration snippet; `configVersion` check across the cascade.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-writer-port`: `addPlugin`/`removePlugin` drop `type`, gain contribution selection.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:specd-plugin-type`: `contributes`-based manifest, `defaultConfig`, JSON Schema subset config, `install`/`uninstall` with selected ids, open kind registry, scoped names; remove `PLUGIN_TYPES`/`pluginType`.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:plugin-loader`: manifest validation (contributes, scoped name, id uniqueness, config schema subset), handler-based block validation.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:agent-plugin-type`: agent plugin becomes the `agents` contribution kind; defines the `agent` kind handler (manifest block, code contract, registration) and drops the whole-plugin subtype guard.
  - Depends on (added): `plugin-manager:specd-plugin-type`
  - Depends on (removed): none
- `plugin-manager:install-plugin-use-case`: kind-agnostic install, selection, `defaultConfig`.
  - Depends on (added): none
  - Depends on (removed): `plugin-manager:agent-plugin-type`
- `plugin-manager:uninstall-plugin-use-case`: kind-agnostic, no hardcoded `agents`.
  - Depends on (added): none
  - Depends on (removed): `plugin-manager:agent-plugin-type`
- `plugin-manager:update-plugin-use-case`: kind-agnostic reinstall honoring selection.
  - Depends on (added): none
  - Depends on (removed): `plugin-manager:agent-plugin-type`
- `plugin-manager:list-plugins-use-case`: list from flat list with contributions.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:plugins-install`, `cli:plugins-uninstall`, `cli:plugins-update`, `cli:plugins-list`, `cli:plugins-show`: flat list, contribution selection, scoped names, run with `plugins: false`.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:composition`: `createSdkContext` builds via builder + `registerPlugins`; `plugins` option; `sdk` → `plugin-manager` edge.
  - Depends on (added): `plugin-manager:register-plugins-use-case`
  - Depends on (removed): none
- `sdk:host-context`: pass-through of `plugins` option; dispose runs plugin `destroy`.
  - Depends on (added): `plugin-manager:register-plugins-use-case`
  - Depends on (removed): none

- `core:check-registry`: plugin name rule aligned to scoped `@scope/name` (fix regex/JSDoc mismatch); canonical id `@scope/name.id` unchanged. Minimal change: the file has 141 direct dependents (CRITICAL).
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:load-plugin-use-case`: loads/validates a plugin with the `contributes` manifest and scoped name.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:plugin-errors`: new typed errors (invalid plugin config, duplicate or unknown contribution id, unsupported config-schema keyword, invalid plugin name).
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-manager:plugin-repository-port`: repository port reflects the flat plugin list and contributions instead of per-type buckets.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:project-init`, `cli:project-update`: write/read the flat `plugins` list instead of the `agents` bucket; `project init` writes `configVersion: 2`.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:config-show`: shows the flat `plugins` list.
  - Depends on (added): none
  - Depends on (removed): none
- `plugin-agent-claude:plugin-agent`, `plugin-agent-copilot:plugin-agent`, `plugin-agent-codex:plugin-agent`, `plugin-agent-opencode:plugin-agent`, `plugin-agent-standard:plugin-agent`: manifest moves from `pluginType: agent` to `contributes.agents`.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Graph impact (dependents) over the full set of files this change touches: riskLevel **CRITICAL**, ~233 non-test files affected, dominated by `check-registry.ts` (141 direct dependents) and `config-loader.ts` (149 affected files). Per file: `specd-plugin.ts` CRITICAL (24), `agent-plugin.ts` CRITICAL (19), `config-cascade.ts` HIGH (16), `cli/commands/config/show.ts` CRITICAL (15 direct dependents), `get-declared-plugins.ts` HIGH (14), `project/init.ts` HIGH (11), `project/update.ts` HIGH (9), install/uninstall/update/list use cases MEDIUM.

Code areas touched:

- `plugin-manager`: `domain/types/{specd-plugin,agent-plugin}.ts`, `infrastructure/loader/plugin-loader.ts`, `application/ports/plugin-repository.ts`, the install/uninstall/update/list/load use cases, errors, and the new register-plugins use case.
- `core`: `application/ports/{config-schema,config-writer}.ts`, `infrastructure/fs/{config-cascade,config-loader,config-writer}.ts`, `composition/{config-loader,config-writer}.ts`, `domain/services/check-registry.ts` (name regex only).
- `cli`: `commands/plugins/{install,uninstall,update,list,show,get-declared-plugins}.ts`, `commands/project/{init,update}.ts`, `commands/config/show.ts`.
- `sdk`: `composition/host-context.ts` (`createSdkContext`) and a new dependency on `@specd/plugin-manager` in its `package.json`.
- The five `plugin-agent-*` `specd-plugin.json` manifests.
- This repo's `specd.yaml` (`plugins.agents` at the end of the file) must migrate to the flat list.
- Docs mentioning `agents:`: `docs/guide/{configuration,configuration-examples,installation}.md` and `docs/core/config.md` (`default:_global/docs` requires keeping guides in parity).

Dependency graph stays acyclic (`sdk → plugin-manager → core`). A broken configured plugin now blocks every host-based command (mitigated by `plugins: false`). Spec overlap: `core:check-registry` is also targeted by `check-plugins-runtime`; the two changes touch different parts (name rule here, registration there) and must be reconciled at archive.

## Technical context

- Rejected: one plugin per kind (breaks shared namespace/config/state, e.g. a CLI command writing a manifest section plus a check validating it); a separate `namespace` field or `<npm-name>:<id>` ids; closed `PLUGIN_TYPES` enum; per-kind `specd.yaml` buckets; `exclude`/`disable` in v1; Zod or a flat custom type as config schema format.
- zod is `^3.25.76` (no JSON Schema converter) and `ajv` is only transitive, so plugin-manager writes its own converter for the supported subset.
- Allowlist-only selection so an update never activates a new contribution unnoticed; selection lives in YAML because uninstall/update/list need to know what was installed.
- `createSdkContext`, not `openSpecdHost`, owns plugin registration. `host-lifecycle-dispose` already provides `registerDisposer`/`Kernel.dispose()`.
- Related: `check-plugins-runtime` is narrowed to the `check` kind and builds on this change; `check-plugins-example` depends on both. Their already-registered specs must be re-split.

### Examples (illustrative)

These show the agreed model end to end. They are preliminary: exact field names and block shapes are fixed in the specs and design. Only the `agents` kind is implemented in this change; `checks` and `cliCommands` appear to show how a multi-contribution plugin looks and are reserved.

**1. Manifest `specd-plugin.json` (agent plugin, migrated)**

```jsonc
{
  "schemaVersion": 2,
  "name": "@specd/plugin-agent-claude", // scoped npm name, mandatory
  "version": "0.2.0",
  "description": "Claude agent plugin for specd skills installation",
  "minCoreVersion": "*",
  "contributes": {
    "agents": { "claude": {} }, // local id "claude" -> @specd/plugin-agent-claude.claude
  },
}
```

**2. Manifest of a multi-contribution plugin with config (reserved kinds)**

```jsonc
{
  "schemaVersion": 2,
  "name": "@acme/specd-compliance",
  "version": "1.0.0",
  "minCoreVersion": "*",
  "configSchema": {
    "type": "object",
    "properties": {
      "severity": { "type": "string", "enum": ["warn", "error"], "default": "error" },
      "allowedLicenses": { "type": "array", "items": { "type": "string" } },
    },
    "required": ["severity"],
    "additionalProperties": false,
  }, // bounded JSON Schema subset; unsupported keywords ($ref, oneOf, ...) -> typed error at load
  "defaultConfig": { "severity": "error" }, // validated against configSchema; written to specd.yaml on install if the entry has no config
  "contributes": {
    "checks": { "license-header": { "label": "License header present" } },
    "cliCommands": { "audit": {} },
  },
}
```

Addresses: `@acme/specd-compliance.license-header`, `@acme/specd-compliance.audit`. Local ids may not contain `.` and are unique across the whole plugin.

**3. Config schema (in the manifest, see example 2)**

`configSchema` and `defaultConfig` are static manifest data, so `plugins install/list/show` and config validation never need to execute plugin code. A plugin without `configSchema` accepts no `config`; a `config` present in `specd.yaml` for it is a typed startup error.

**4. `specd.yaml`**

```yaml
# before (breaking change)
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'

# after: flat list
configVersion: 2 # optional; written by `project init`
plugins:
  - name: '@specd/plugin-agent-claude'
  - name: '@acme/specd-compliance'
    config:
      severity: warn
    contributions: ['license-header'] # allowlist; absent = all contributions
```

An unknown id in `contributions`, a `config` on a plugin with empty schema, or a config that fails the schema is a typed startup error naming the plugin.
Loading the legacy shape fails with a migration message (not a generic schema error):

```text
LEGACY_CONFIG_FORMAT  specd.yaml: 'plugins.agents' is no longer supported.
Replace the 'plugins' section with:

  configVersion: 2
  plugins:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-copilot'
```

A `configVersion` greater than the supported one fails with `UNSUPPORTED_CONFIG_VERSION` asking to upgrade specd.

**5. Plugin code entry (one entry per plugin)**

```ts
// runtime lifecycle: explicit methods, config only (no services, no phase)
export async function create(options: PluginLoaderOptions): Promise<SpecdPlugin> {
  return {
    name,
    version, // read from the manifest, never hardcoded
    async init(ctx: PluginContext) {
      /* ctx.config validated against configSchema */
    },
    async destroy() {
      /* release resources */
    },
    async install(ctx: InstallContext) {
      /* ctx.contributions = selected ids */
    },
    async uninstall(ctx: InstallContext) {
      /* ... */
    },
  }
}
```

**6. Kind handler registry (open)**

```ts
// supplied by the subsystem that owns the kind; plugin-manager is the generic engine
interface ContributionKindHandler {
  readonly kind: string // 'agents', later 'checks', ...
  readonly blockSchema: ZodType // validates contributes[kind]
  activate(ctx: {
    plugin: SpecdPlugin
    contributions: ReadonlyMap<string, unknown> // selected ids -> manifest entries
    builder: KernelBuilder
  }): void | Promise<void>
}
```

This change ships the registry contract and the `agents` handler; each other kind's handler comes from its owner (`check` with `check-plugins-runtime`).

**7. SDK and runtime flow**

```ts
// createSdkContext (not openSpecdHost)
const builder = createKernelBuilder(config)
const registration = await registerPlugins(builder, config, { handlers }) // plugin-manager
const kernel = await builder.build()
// registration.destroy is registered as ONE named disposer -> kernel.dispose()

createSdkContext(config, { plugins: false }) // graph-index worker and `cli plugins *`: no load, no init, no disposer
```

Order inside one process: load + validate all configured plugins -> `init` each (list order) -> handlers register contributions on the builder -> `build()` -> (host contributions, reserved) -> on `dispose()`, `destroy` in reverse order with error isolation. If a later `init` fails, the already-initialized plugins are destroyed and startup fails.

**8. CLI**

```bash
specd plugins install @acme/specd-compliance                              # all contributions, defaultConfig applied
specd plugins install @acme/specd-compliance --contributions license-header
specd plugins list                                                        # name, version, selected / available contributions
specd plugins show @acme/specd-compliance                                 # manifest, config schema, contributions
specd plugins update @acme/specd-compliance                               # reinstall, selection and config untouched
specd plugins uninstall @acme/specd-compliance
```

`plugins *` commands run with `plugins: false`, so a broken plugin can still be listed, updated or removed. Install does not call `init`.

**9. Typed errors (names illustrative)**

```text
INVALID_PLUGIN_NAME        '@scope/name' required, got 'foo'
DUPLICATE_CONTRIBUTION_ID  plugin '@acme/x' declares id 'audit' twice
UNKNOWN_CONTRIBUTION       plugin '@acme/x' has no contribution 'nope'
INVALID_PLUGIN_CONFIG      plugin '@acme/x': config.severity must be one of warn, error
UNSUPPORTED_SCHEMA_KEYWORD plugin '@acme/x': keyword '$ref' is not supported
PLUGIN_INIT_FAILED         plugin '@acme/x' init failed: <cause>
LEGACY_CONFIG_FORMAT       specd.yaml uses 'plugins.agents'; migration snippet attached
UNSUPPORTED_CONFIG_VERSION specd.yaml configVersion 3 is newer than supported (2)
```

## Open questions

None blocking. Resolved with the user:

- **Config migration**: detect legacy format by shape plus a new optional `configVersion` (introduced as 2); migration message only, no `migrate` command and no automatic rewrite in this change.
- **Implementation scope**: only the `agent` kind is implemented here; every other kind is a reserved extension point (`check` arrives with `check-plugins-runtime`).
- **Handler ownership**: this change defines the registry contract and owns the `agent` handler; each other kind's handler is supplied by its consuming subsystem in its own change, keeping edges acyclic.
- **Agent handler spec**: delta of `plugin-manager:agent-plugin-type` (added to scope), not a new spec.
- **`configSchema` location**: in the manifest (static data, validated with `defaultConfig` without loading plugin code); removed from `SpecdPlugin` and `ConfigSchemaEntry` goes away.

Deferred (not affecting this change's artifacts):

- Staleness of skill-derived agent files (auto-reinstall vs warn): only relevant once `skills`/`skillInjections` exist.
