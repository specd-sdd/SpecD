# Tasks: plugin-architecture

## 1. Core: shared plugin name and config errors

- [x] 1.1 Add the shared plugin name rule
      `packages/core/src/domain/plugin-name.ts`: `PLUGIN_NAME_REGEX`, `isPluginName` — new file
      Approach: `/^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$/`; `isPluginName(v) => PLUGIN_NAME_REGEX.test(v)`; JSDoc on both
      (Req: Plugin name)
- [x] 1.2 Export the rule from the core barrel
      `packages/core/src/index.ts`, `packages/core/src/domain/index.ts`: export `PLUGIN_NAME_REGEX`, `isPluginName`
      Approach: explicit named exports; the SDK re-export list is handled in group 6
      (Req: Plugin name)
- [x] 1.3 Add `LegacyConfigFormatError`
      `packages/core/src/domain/errors/legacy-config-format-error.ts`: new class extending `ConfigValidationError`
      Approach: `code = 'LEGACY_CONFIG_FORMAT'`, readonly `suggestedSnippet`; message = path + "'plugins.agents' is no longer supported" + the snippet
      (Req: Config version)
- [x] 1.4 Add `UnsupportedConfigVersionError` and `CURRENT_CONFIG_VERSION`
      `packages/core/src/domain/errors/unsupported-config-version-error.ts`: new class; constant `CURRENT_CONFIG_VERSION = 2`
      Approach: `code = 'UNSUPPORTED_CONFIG_VERSION'`, readonly `found`, `supported`; message asks to upgrade specd
      (Req: Config version)
- [x] 1.5 Export the new errors and constant
      `packages/core/src/domain/errors/index.ts`, `packages/core/src/index.ts`
      Approach: named exports next to `ConfigValidationError`
      (Req: Config version)

## 2. Core: configuration schema, loader, cascade, writer

- [x] 2.1 Make `plugins` a flat list in the Zod schema
      `packages/core/src/application/ports/config-schema.ts`: `PluginEntryZodSchema`, `PluginsZodSchema`
      Approach: entry `{ name: z.string().regex(PLUGIN_NAME_REGEX), config: z.record(z.unknown()).optional(), contributions: z.array(z.string()).min(1).optional() }`; list `z.array(entry)` with a refine rejecting duplicate names
      (Req: Plugin declarations)
- [x] 2.2 Add optional `configVersion` to the top-level schema
      `packages/core/src/application/ports/config-schema.ts`: top-level object — add `configVersion: z.number().int().positive().optional()`
      Approach: keep `.strict()`; no default
      (Req: Config version)
- [x] 2.3 Update the `SpecdConfig.plugins` type
      `packages/core/src/application/specd-config.ts`: `plugins` (line ~265)
      Approach: `readonly plugins?: readonly { name; config?; contributions? }[] | undefined`; update JSDoc
      (Req: Plugin declarations)
- [x] 2.4 Add legacy and version detection before strict parsing
      `packages/core/src/infrastructure/fs/config-loader.ts`: new `assertCurrentConfigFormat(raw, layerPath)` called per layer before the Zod parse
      Approach: order = `configVersion > CURRENT_CONFIG_VERSION` → `UnsupportedConfigVersionError`; then `plugins` non-array object with `agents` → `LegacyConfigFormatError` with a snippet generated from `plugins.agents` (preserve `config`); otherwise fall through
      (Req: Config version, YAML parsing and structural validation)
- [x] 2.5 Map the flat plugin list into `SpecdConfig`
      `packages/core/src/infrastructure/fs/config-loader.ts`: plugin mapping (line ~656)
      Approach: `plugins: data.plugins.map(p => ({ name, ...(config), ...(contributions) }))`; never load plugins
      (Req: Schema plugins, schema overrides, and context entry mapping)
- [x] 2.6 Change the removal schema to a name list
      `packages/core/src/infrastructure/fs/config-cascade.ts`: `LayerRemovalZodSchema.plugins`
      Approach: `z.array(z.object({ name: z.string() })).optional()`
      (Req: Cascade identity and removal model)
- [x] 2.7 Apply plugin removals on the flat list
      `packages/core/src/infrastructure/fs/config-cascade.ts`: `applyRemovals`
      Approach: filter `accumulated.plugins` by name; `ConfigValidationError` for "no plugins in inherited config" and "'<name>' not found"
      (Req: Cascade identity and removal model)
- [x] 2.8 Merge plugin lists by name across layers
      `packages/core/src/infrastructure/fs/config-cascade.ts`: `deepMergeRawConfig`
      Approach: for key `plugins` replace same-name entries in place, append new names in layer order; other arrays unchanged
      (Req: Cascade identity and removal model)
- [x] 2.9 Enforce `configVersion` from the root layer only
      `packages/core/src/infrastructure/fs/config-cascade.ts`: `mergeActiveLayers`
      Approach: after merging, if an extending layer's `configVersion` differs from the root's, throw `ConfigValidationError`; keep the root value
      (Req: Config version)
- [x] 2.10 Change the `ConfigWriter` port signatures
      `packages/core/src/application/ports/config-writer.ts`: `addPlugin`, `removePlugin`, `listPlugins`, `AddPluginOptions`
      Approach: `addPlugin(configPath, name, options?)`, `removePlugin(configPath, name)`, `listPlugins(configPath)`; update JSDoc
      (Req: AddPlugin, RemovePlugin, ListPlugins)
- [x] 2.11 Rewrite the filesystem writer for the flat list
      `packages/core/src/infrastructure/fs/config-writer.ts`: `addPlugin`, `removePlugin`, `listPlugins`, `parsePlugins`, `pluginSchema`
      Approach: parse `plugins` as an array (invalid → `[]`); add replaces by name preserving order and never duplicates; write `contributions` only when given; remove filters by name; keep YAML comments by using the existing `Document` API
      (Req: AddPlugin, RemovePlugin, ListPlugins)
- [x] 2.12 Write `configVersion: 2` in `initProject`
      `packages/core/src/infrastructure/fs/config-writer.ts`: `initProject`
      Approach: emit `configVersion: 2` as the first key of the generated document
      (Req: InitProject behaviour, Config version)
- [x] 2.13 Align composition wrappers
      `packages/core/src/composition/config-writer.ts`, `packages/core/src/composition/config-loader.ts`
      Approach: signatures follow the port; no logic changes
      (Req: Interface shape)
- [x] 2.14 Use the shared regex and drop the extra `@` in the check registry
      `packages/core/src/domain/services/check-registry.ts`: `PLUGIN_NAME_REGEX` (line 19), `register()` (lines ~241-247)
      Approach: import `PLUGIN_NAME_REGEX` from `plugin-name.ts`; ``canonicalId = `${pluginName}.${check.id}` ``; fix the JSDoc grammar text; keep `InvalidPluginNameError`
      (Req: Canonical namespacing and plugin registration, Immutability of built-in checks)
- [x] 2.15 Check that nothing assumed the old `@${plugin}` form
      `packages/core/src/composition/use-cases/workflow-check-registry.ts` and callers of `CheckRegistry.register`
      Approach: confirm `id.startsWith('@')` discrimination still holds and update call sites passing unscoped names
      (Req: Canonical namespacing and plugin registration)

## 3. Core tests

- [x] 3.1 Cover the flat plugin list and legacy detection in the loader
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`
      Approach: scenarios for flat list with `contributions`, unscoped and duplicate names, `plugins.agents` → `LegacyConfigFormatError` containing the snippet and `configVersion: 2`, legacy detection before the strict parse, `configVersion: 3`, absent version, plugins not loaded
      (Req: Config version, Plugin declarations, YAML parsing and structural validation)
- [x] 3.2 Cover cascade semantics for plugins and version
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` (or the existing cascade spec)
      Approach: replace-in-place, append, `remove.plugins` by name, missing-name and empty-list errors, version mismatch in an extending layer
      (Req: Cascade identity and removal model)
- [x] 3.3 Update root-containment tests for the new shapes
      `packages/core/test/infrastructure/fs/config-loader-root-containment.spec.ts`
      Approach: replace any `plugins.agents` fixture with the flat list
      (Req: All errors are ConfigValidationError)
- [x] 3.4 Cover the writer on the flat list
      `packages/core/test/infrastructure/fs/config-writer.spec.ts`, `packages/core/test/composition/config-writer.spec.ts`
      Approach: add, add with config and contributions, no duplicate, remove, remove absent no-op, list flat and empty, `initProject` writes `configVersion: 2`
      (Req: AddPlugin, RemovePlugin, ListPlugins, InitProject behaviour)
- [x] 3.5 Cover the check registry name rule and canonical id
      `packages/core/test/domain/services/check-registry.spec.ts` (and dependent tests)
      Approach: scoped names accepted; unscoped, dotted, uppercase → `InvalidPluginNameError`; ids have a single leading `@`; duplicates; built-ins never shadowed
      (Req: Immutability of built-in checks, Canonical namespacing and plugin registration)

## 4. Plugin-manager: domain

- [x] 4.1 Remove `PLUGIN_TYPES`, `PluginType`, `ConfigSchemaEntry`
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`, `packages/plugin-manager/src/domain/types/index.ts`
      Approach: delete and fix barrels; compile errors enumerate remaining users
      (Req: SpecdPlugin interface)
- [x] 4.2 Redefine `SpecdPlugin` and the contexts
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`: `SpecdPlugin`, `PluginContext`, `PluginInstallContext`
      Approach: as in design (optional `install`, `uninstall`, `contribution`; `PluginContext.pluginConfig`)
      (Req: SpecdPlugin interface, PluginContext, Plugin lifecycles)
- [x] 4.3 Add contribution identity helpers
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`: `CONTRIBUTION_ID_REGEX`, `buildContributionAddress`, `parseContributionAddress`
      Approach: id regex `^[a-z0-9][a-z0-9_-]*$`; parse splits at the single `.` and throws `PluginValidationError` for zero or several dots
      (Req: Contribution identity and address)
- [x] 4.4 Rewrite `isSpecdPlugin`
      `packages/plugin-manager/src/domain/types/specd-plugin.ts`: `isSpecdPlugin`
      Approach: name/version strings, `isPluginName(name)` from `@specd/core`, `init`/`destroy` functions, `install`/`uninstall`/`contribution` absent or functions
      (Req: isSpecdPlugin type guard, Plugin name)
- [x] 4.5 Add the manifest types
      `packages/plugin-manager/src/domain/types/plugin-manifest.ts`: `SpecdPluginManifest`, `PluginConfigSchema`, `ConfigSchemaNode`, `ContributionBlocks`
      Approach: as in design Data models
      (Req: Plugin manifest)
- [x] 4.6 Add the kind handler contract
      `packages/plugin-manager/src/domain/types/contribution-kind-handler.ts`: `ContributionKindHandler`, `ContributionActivationContext`
      Approach: `import type { KernelBuilder } from '@specd/core/extensions'`; `validatePlugin?` and `activate?` optional
      (Req: Contribution kind handler)
- [x] 4.7 Add the new error classes
      `packages/plugin-manager/src/domain/errors/`: `DuplicateContributionError`, `UnknownContributionError`, `UnknownContributionKindError`, `InvalidPluginConfigError`, `UnsupportedSchemaKeywordError`, `PluginInitError`
      Approach: extend `SpecdError`; codes `DUPLICATE_CONTRIBUTION_ID`, `UNKNOWN_CONTRIBUTION`, `UNKNOWN_CONTRIBUTION_KIND`, `INVALID_PLUGIN_CONFIG`, `UNSUPPORTED_SCHEMA_KEYWORD`, `PLUGIN_INIT_FAILED`; every message names the plugin
      (Req: Contribution and configuration errors)
- [x] 4.8 Export the new domain symbols
      `packages/plugin-manager/src/domain/index.ts`, `packages/plugin-manager/src/domain/errors/index.ts`
      Approach: named exports
      (Req: Contribution and configuration errors)
- [x] 4.9 Implement `assertSupportedConfigSchema`
      `packages/plugin-manager/src/domain/services/plugin-config-schema.ts`: `SUPPORTED_SCHEMA_KEYWORDS`, `assertSupportedConfigSchema`
      Approach: recursive walk over `properties`/`items`; root `type` must be `object`; any other keyword → `UnsupportedSchemaKeywordError(pluginName, keyword)`
      (Req: Plugin configuration schema)
- [x] 4.10 Implement `configSchemaToZod`
      `packages/plugin-manager/src/domain/services/plugin-config-schema.ts`: `configSchemaToZod`
      Approach: object → `z.object` (strict when `additionalProperties === false`, passthrough otherwise); `required` → non-optional; `default` → `.default()`; `enum` → union of literals; `integer` → `z.number().int()`
      (Req: Plugin configuration schema)
- [x] 4.11 Implement `resolvePluginConfig`
      `packages/plugin-manager/src/domain/services/plugin-config-schema.ts`: `resolvePluginConfig`
      Approach: no schema + undefined config → `{}`; no schema + config → `InvalidPluginConfigError`; otherwise `safeParse`, issues formatted `path: message`
      (Req: Plugin configuration schema, Selection and config validation)
- [x] 4.12 Implement contribution selection helpers
      `packages/plugin-manager/src/domain/services/resolve-contributions.ts`: `declaredContributionIds`, `resolveContributions`
      Approach: declared order = manifest kind order then id order; unknown allowlist id → `UnknownContributionError`
      (Req: Selection and config validation)
- [x] 4.13 Add the `agents` kind handler
      `packages/plugin-manager/src/domain/handlers/agents-handler.ts`: `agentsContributionHandler`
      Approach: `kind: 'agents'`; `blockSchema = z.record(idRegexString, z.object({}).strict())`; `validatePlugin` requires `isAgentPlugin`; no `activate`
      (Req: Agents contribution kind handler)
- [x] 4.14 Redefine the agent plugin types
      `packages/plugin-manager/src/domain/types/agent-plugin.ts`: `AgentPlugin`, `AgentInstallContext`, `isAgentPlugin`
      Approach: drop `type`; `install(context)`/`uninstall(context)`; guard checks only the two functions
      (Req: AgentPlugin extends SpecdPlugin, isAgentPlugin type guard)

## 5. Plugin-manager: ports, loader, use cases

- [x] 5.1 Change the loader port to return the manifest
      `packages/plugin-manager/src/application/ports/plugin-loader.ts`: `PluginLoader.load`, `LoadedPlugin`
      Approach: `load(name): Promise<LoadedPlugin>`
      (Req: Load workflow)
- [x] 5.2 Change the repository port
      `packages/plugin-manager/src/application/ports/plugin-repository.ts`: `PluginRepository`, `DeclaredPlugin`
      Approach: no `type` parameter; `addPlugin(name, options?)`; `listPlugins()`; `contributions?` on `DeclaredPlugin`
      (Req: PluginRepositoryPort interface)
- [x] 5.3 Replace the manifest schema in the loader
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `manifestSchema`
      Approach: strict v2 schema from design Data models (`schemaVersion` literal 2, name regex, `contributes`, `configSchema`, `defaultConfig`); reject `pluginType`
      (Req: Manifest schema, Plugin manifest)
- [x] 5.4 Add manifest-level validations
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `validateManifest`
      Approach: ids match `CONTRIBUTION_ID_REGEX`, unique across kinds (`DuplicateContributionError`), `assertSupportedConfigSchema`, `defaultConfig` through `resolvePluginConfig`
      (Req: Manifest schema, Error handling)
- [x] 5.5 Add handler-based block validation
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `createPluginLoader(options)` gains `handlers`; `load()`
      Approach: merge `options.handlers` with `agentsContributionHandler`; unknown kind → `UnknownContributionKindError`; parse each block with `blockSchema`
      (Req: Load workflow, Contribution kind handler)
- [x] 5.6 Validate before import and cross-check after
      `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`: `load()`, `validateRuntimePlugin`
      Approach: order = manifest → blocks → `import()` → `create()` → `isSpecdPlugin` → name/version equal manifest → `handler.validatePlugin` → require `contribution()` when a kind has `activate`; return `{ plugin, manifest }`; never call lifecycle methods
      (Req: Load workflow, Error handling, Factory function)
- [x] 5.7 Make `LoadPlugin` return the manifest
      `packages/plugin-manager/src/application/use-cases/load-plugin.ts`: `LoadPluginOutput`
      Approach: `{ plugin, manifest }`
      (Req: Output, Behavior)
- [x] 5.8 Rewrite `InstallPlugin`
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts`: input/output/`execute`
      Approach: `resolveContributions`; assert `isAgentPlugin` only when the manifest declares `agents`; `plugin.install?.({ config, contributions, options })`; return selected ids and manifest `defaultConfig`; wrap hook errors in `PluginValidationError`
      (Req: Behavior, Error handling, Agent Initialization Phase)
- [x] 5.9 Rewrite `UninstallPlugin`
      `packages/plugin-manager/src/application/use-cases/uninstall-plugin.ts`
      Approach: same selection logic; `plugin.uninstall?.(...)`; no bucket assumptions
      (Req: Behavior, Error handling)
- [x] 5.10 Rewrite `UpdatePlugin`
      `packages/plugin-manager/src/application/use-cases/update-plugin.ts`
      Approach: selected ids from input; an id no longer declared → `UnknownContributionError`; no config mutation
      (Req: Behavior, Idempotency, Error handling)
- [x] 5.11 Extend `ListPlugins`
      `packages/plugin-manager/src/application/use-cases/list-plugins.ts`
      Approach: loaded entries carry `manifest` and declared `contributions`; invalid manifests become `error` entries and do not stop the others
      (Req: Output, Behavior)
- [x] 5.12 Implement `registerPlugins`
      `packages/plugin-manager/src/application/use-cases/register-plugins.ts`: `registerPlugins`, `RegisterPluginsOptions`, `PluginRegistration`
      Approach: design Approach B — validate all (phase 1), `init` in order (phase 2), `activate` handlers (phase 3), one disposer `specd-plugins`; `destroyReverse` with error aggregation and a `disposed` guard; returns `{ dispose }`
      (Req: Registration order, Selection and config validation, Destroy and error isolation, Failure policy, Bypass)
- [x] 5.13 Export from the package barrels
      `packages/plugin-manager/src/application/index.ts`, `packages/plugin-manager/src/index.ts`
      Approach: export `registerPlugins`, handler types, manifest types, new errors
      (Req: Signature)

## 6. SDK

- [x] 6.1 Add the dependency on plugin-manager
      `packages/sdk/package.json`, `packages/sdk/tsconfig.json`
      Approach: `"@specd/plugin-manager": "workspace:*"`; add a project reference if used; run `pnpm install`
      (Req: Package identity and dependencies)
- [x] 6.2 Extend `SdkContextOptions`
      `packages/sdk/src/composition/host-context.ts`: `SdkContextOptions`
      Approach: add `plugins?: boolean` (default true) and `pluginHandlers?: readonly ContributionKindHandler[]`
      (Req: createSdkContext)
- [x] 6.3 Build the kernel through the builder and register plugins
      `packages/sdk/src/composition/host-context.ts`: `createSdkContext`
      Approach: `createKernelBuilder` from `@specd/core/extensions`; if `plugins !== false` `registration = await registerPlugins(builder, config, { handlers })`; `try { kernel = await builder.build() } catch (e) { await registration?.dispose(); throw e }`
      (Req: createSdkContext, Host disposal)
- [x] 6.4 Export the plugin contracts from the SDK barrel
      `packages/sdk/src/index.ts`, `packages/sdk/src/composition/index.ts`
      Approach: export `SdkContextOptions`, `ContributionKindHandler`, `ContributionActivationContext`; re-export `LegacyConfigFormatError`, `UnsupportedConfigVersionError`, `PLUGIN_NAME_REGEX`, `isPluginName` in the explicit core list
      (Req: Public barrel exports)

## 7. Agent plugins

- [x] 7.1 Migrate `plugin-agent-claude`
      `packages/plugin-agent-claude/specd-plugin.json`, `src/index.ts`, `src/domain/types/claude-plugin.ts`
      Approach: manifest `schemaVersion: 2`, no `pluginType`, `contributes.agents.claude = {}`; remove `type`; `install(context)`/`uninstall(context)` delegate to the existing use cases with `context.config`/`context.options`
      (Req: Manifest and install context, Factory export)
- [x] 7.2 Migrate `plugin-agent-copilot`
      same files under `packages/plugin-agent-copilot`; id `copilot`
      Approach: as 7.1
      (Req: Manifest and install context, Factory export)
- [x] 7.3 Migrate `plugin-agent-codex`
      same files under `packages/plugin-agent-codex`; id `codex`
      Approach: as 7.1
      (Req: Manifest and install context, Factory export)
- [x] 7.4 Migrate `plugin-agent-opencode`
      same files under `packages/plugin-agent-opencode`; id `opencode`
      Approach: as 7.1
      (Req: Manifest and install context, Factory export)
- [x] 7.5 Migrate `plugin-agent-standard`
      same files under `packages/plugin-agent-standard`; id `standard`
      Approach: as 7.1
      (Req: Manifest and install context, Factory export)

## 8. CLI

- [x] 8.1 Add the `plugins` option to `resolveCliContext`
      `packages/cli/src/helpers/cli-context.ts`: `resolveCliContext`
      Approach: `plugins?: boolean` option forwarded as `options.plugins` alongside `kernel`
      (Req: resolveCliContext delegates to openSpecdHost)
- [x] 8.2 Open the graph-index worker host without plugins
      `packages/cli/src/graph-index-task.ts`: `runGraphIndexTask`
      Approach: pass `{ kernel, plugins: false }` to both `openSpecdHost` and `createSdkContext`
      (Req: Graph index worker releases its host)
- [x] 8.3 Rewrite declared-plugin helpers
      `packages/cli/src/commands/plugins/get-declared-plugins.ts`
      Approach: `getDeclaredPlugins(config)` and `findDeclaredPlugin(config, name)`; `DeclaredPluginEntry.contributions?`
      (Req: Declaration source)
- [x] 8.4 Update `plugins install`
      `packages/cli/src/commands/plugins/install.ts`
      Approach: design Approach D — name validation with `isPluginName`, `--contributions`, flat already-installed check, `addPlugin(configPath, name, options)`, `plugins: false`
      (Req: Command signature, Declaration source, Already-installed handling, Installation workflow, Host bootstrap without plugins)
- [x] 8.5 Update `plugins uninstall`
      `packages/cli/src/commands/plugins/uninstall.ts`
      Approach: find entry, pass its allowlist, call the plugin hook, then `removePlugin(configPath, name)`; error per undeclared name; `plugins: false`
      (Req: Uninstall workflow, Host bootstrap without plugins)
- [x] 8.6 Update `plugins update`
      `packages/cli/src/commands/plugins/update.ts`
      Approach: iterate `config.plugins` or named subset with each allowlist; never write config; `plugins: false`
      (Req: Declaration source, Update behavior, Host bootstrap without plugins)
- [x] 8.7 Update `plugins list`
      `packages/cli/src/commands/plugins/list.ts`
      Approach: remove `--type`; rows `{ name, contributions: { declared, selected }, version, status, detail }`; `plugins: false`
      (Req: Command signature, Declaration source, Output format)
- [x] 8.8 Update `plugins show`
      `packages/cli/src/commands/plugins/show.ts`
      Approach: print name, version, contributions with addresses, `configSchema`, `defaultConfig`, capabilities; JSON shape from design; `plugins: false`
      (Req: Output)
- [x] 8.9 Update `project init`
      `packages/cli/src/commands/project/init.ts`
      Approach: rely on `initProject` for `configVersion: 2`; install selected plugins through the install flow
      (Req: Skills installation after init)
- [x] 8.10 Update `project update`
      `packages/cli/src/commands/project/update.ts`
      Approach: same logic as `plugins update` with no filter, host opened with `plugins: false`
      (Req: Skills update step)
- [x] 8.11 Update `config show`
      `packages/cli/src/commands/config/show.ts`
      Approach: print `<name>  (present)  [contributions: a, b]` per flat entry
      (Req: Output format)

## 9. CLI, SDK and plugin-manager tests

- [x] 9.1 Test the name, schema and selection domain code
      `packages/plugin-manager/test/domain/{specd-plugin,plugin-config-schema,resolve-contributions,agents-handler}.spec.ts`
      Approach: scenarios listed in design Testing (valid/invalid names, address parsing, supported/unsupported keywords, defaults, strict objects, selection)
      (Req: Plugin name, Contribution identity and address, Plugin configuration schema, Agents contribution kind handler)
- [x] 9.2 Test the loader
      `packages/plugin-manager/test/infrastructure/plugin-loader.spec.ts`
      Approach: manifest validated before import, `pluginType`, `schemaVersion`, unscoped name, duplicate id, unknown kind, invalid block, unsupported keyword, bad `defaultConfig`, name/version mismatch, missing `contribution`, no lifecycle calls
      (Req: Load workflow, Manifest schema, Error handling)
- [x] 9.3 Test `registerPlugins`
      `packages/plugin-manager/test/application/register-plugins.spec.ts`
      Approach: every scenario of the register spec: order, validation first, selection, one disposer, reverse destroy, error isolation, idempotence, partial init failure, load failure, defaults, empty list, registration handle
      (Req: Signature, Registration order, Selection and config validation, Destroy and error isolation, Failure policy, Bypass)
- [x] 9.4 Update the use case tests
      `packages/plugin-manager/test/application/{install,uninstall,update,list,load}-plugin.spec.ts`
      Approach: selection, `defaultConfig`, hook-less plugins, `init` never called, agents contract, update preserving selection, list with invalid manifests
      (Req: Behavior, Error handling, Output)
- [x] 9.5 Test the new errors
      `packages/plugin-manager/test/domain/errors.spec.ts`
      Approach: names, codes, `pluginName`, `PluginInitError.cause`
      (Req: Contribution and configuration errors)
- [x] 9.6 Test SDK context creation
      `packages/sdk/test/composition/host-context.spec.ts`, `packages/sdk/test/composition/composition.spec.ts`
      Approach: registration before build, `plugins: false`, default enabled, option forwarding through `openSpecdHost`, broken plugin, build failure triggers `registration.dispose()`, `pluginHandlers`, dispose order, dependencies exactly core/code-graph/plugin-manager, barrel exports
      (Req: createSdkContext, Host disposal, Package identity and dependencies, Public barrel exports)
- [x] 9.7 Test the CLI plugins commands
      `packages/cli/test/commands/plugins/{install,uninstall,update,list,show}.spec.ts`
      Approach: scenarios from design Testing, including `plugins: false` bootstrap with a broken configured plugin
      (Req: all cli plugins requirements)
- [x] 9.8 Test project and config commands and context helper
      `packages/cli/test/commands/project/{init,update}.spec.ts`, `packages/cli/test/commands/config/show.spec.ts`, `packages/cli/test/helpers/cli-context.spec.ts`, `packages/cli/test/graph-index-task.spec.ts`
      Approach: `configVersion: 2`, flat list, allowlist suffix, `plugins` option forwarded, worker passes `plugins: false`
      (Req: Skills installation after init, Skills update step, Output format, resolveCliContext delegates to openSpecdHost, Graph index worker releases its host)
- [x] 9.9 Test the agent plugins
      `packages/plugin-agent-*/test/`
      Approach: manifest v2 with `contributes.agents.<id>`, no `type`, `install`/`uninstall` receive the context
      (Req: Manifest and install context, Factory export)

## 10. Repository migration and documentation

- [x] 10.1 Migrate this repository's config
      `specd.yaml`
      Approach: add `configVersion: 2` after `schema:` and replace `plugins.agents` with the flat list of the five plugins
      (Req: Plugin declarations, Config version)
- [x] 10.2 Update configuration docs
      `docs/guide/configuration.md`, `docs/guide/configuration-examples.md`, `docs/guide/installation.md`, `docs/core/config.md`
      Approach: replace `plugins.agents` examples with the flat list; document `configVersion`, `contributions`, scoped names and the legacy error; follow `default:_global/docs`
      (Req: Plugin declarations, Config version)
- [x] 10.3 Write the plugins guide
      `docs/guide/plugins.md` — new
      Approach: manifest v2, addressing, config schema subset, lifecycles, `plugins: false`, CLI commands, kind handlers; add Docusaurus frontmatter
      (Req: Plugin manifest, Plugin lifecycles, Contribution kind handler)
- [x] 10.4 Regenerate guide bundle
      `packages/guide`: run the guide build so `generated/guides.ts` reflects the docs (expected formatting churn)
      Approach: `pnpm --filter @specd/guide build`
      (Req: documentation parity)
- [x] 10.5 Update package READMEs and CHANGELOG notes
      `packages/plugin-manager/README.md`, `packages/plugin-agent-*/README.md`
      Approach: new manifest example and flat config snippet
      (Req: documentation parity)

## 11. Verification

- [x] 11.1 Build and test everything
      repository root
      Approach: `pnpm build && pnpm test`; fix failures
      (Req: all)
- [x] 11.2 Lint and typecheck
      repository root
      Approach: `pnpm lint && pnpm -r typecheck`; confirm no workspace dependency cycle (`sdk → plugin-manager → core`)
      (Req: Package identity and dependencies)
- [x] 11.3 Manual: legacy config message
      temp project
      Approach: design Testing step 2 — expect `LEGACY_CONFIG_FORMAT` with snippet
      (Req: Config version)
- [x] 11.4 Manual: plugin commands round trip
      temp project
      Approach: design Testing steps 3-4 — list, show, uninstall, install, name rule error
      (Req: Command signature, Uninstall workflow)
- [x] 11.5 Manual: broken plugin tolerance
      fixture plugin with throwing `init`
      Approach: design Testing steps 5-7 — host commands fail naming the plugin; `plugins list/uninstall` and `graph index` still work; unknown kind fails with `UNKNOWN_CONTRIBUTION_KIND`
      (Req: Failure policy, Host bootstrap without plugins)
- [x] 11.6 Manual: docs sweep
      repository root
      Approach: design Testing step 8 — no `plugins.agents` remains in docs or `specd.yaml`
      (Req: documentation parity)

## 12. Audit follow-up (verification-attempt-1)

- [x] 12.1 Do not let rollback failures mask the startup error
      `packages/plugin-manager/src/application/use-cases/register-plugins.ts`: destroy-on-failure paths
      Approach: when `destroyReverse` throws during rollback, still throw the original `PluginInitError`/validation error; attach the rollback failures as secondary info (e.g. a `rollbackErrors` field or cause chain); keep attempting every destroy
      (Req: Failure policy)
- [x] 12.2 Make `PluginInitError` actionable and make every plugin error name the plugin
      `packages/plugin-manager/src/domain/errors/plugin-init-error.ts`, `plugin-validation.ts`, `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts` (`mergeHandlers`), `packages/plugin-manager/src/domain/services/resolve-contributions.ts` (`parseContributionAddress`)
      Approach: include the cause message in `PluginInitError`; replace the `'<handlers>'` and address-in-name-slot placeholders with the real plugin name (or a dedicated error that carries no fake plugin name)
      (Req: Error classes name the plugin)
- [x] 12.3 Validate plugin config and allowlist before any `init`
      `packages/plugin-manager/src/application/use-cases/register-plugins.ts`
      Approach: keep the manifest validated before import (already true); confirm `resolvePluginConfig` and `resolveContributions` run for every plugin before the first `init`, and cover it with the "Validation before any init" test (no change to import order is required)
      (Req: Failure policy, Validation before init)
- [x] 12.4 Wrap install/uninstall/update failures with `cause`
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts`, `uninstall-plugin.ts`, `update-plugin.ts`
      Approach: pass through `SpecdError`; wrap any other error in `PluginValidationError` naming the plugin and keep the original as `cause`
      (Req: Error handling)
- [x] 12.5 Filter `AgentInstallContext.contributions` to agents ids
      `packages/plugin-manager/src/application/use-cases/install-plugin.ts` (and uninstall/update call sites)
      Approach: when the manifest declares `agents`, pass only the selected ids of the `agents` kind in the agent install context; leave other kinds out
      (Req: Behavior, Agent plugin install context)
- [x] 12.6 `FsConfigWriter` must not overwrite an invalid `plugins` value
      `packages/core/src/infrastructure/fs/config-writer.ts`: `addPlugin`, `removePlugin`
      Approach: if the existing `plugins` value is not a valid flat list (legacy `plugins.agents` object, entry with empty `contributions`), throw `ConfigValidationError` (or `LegacyConfigFormatError` for the legacy shape) instead of replacing it with `[]`
      (Req: AddPlugin, RemovePlugin)
- [x] 12.7 `plugins update`: undeclared plugin is an error
      `packages/cli/src/commands/plugins/update.ts`
      Approach: report an `error` entry and exit 1 for a named plugin not declared in `plugins` (as `plugins uninstall` does); remove the unused `configPath` variable
      (Req: Undeclared plugin, Exit codes)
- [x] 12.8 `plugins list` text output shows unselected contributions
      `packages/cli/src/commands/plugins/list.ts`
      Approach: print selected contributions and the remaining available ones (matching the JSON output)
      (Req: Allowlist shown)
- [x] 12.9 `plugins show` text output and capabilities
      `packages/cli/src/commands/plugins/show.ts`
      Approach: print contribution kind/id addresses, `configSchema` and `defaultConfig` in text; derive capabilities from the plugin (install/uninstall only when the plugin implements them or contributes agents) instead of always listing `init`/`destroy` and `install`/`uninstall`
      (Req: Contributions shown with addresses, Capabilities)
- [x] 12.10 Codex: escape backslashes in TOML output
      `packages/plugin-agent-codex/src/application/use-cases/install-skills.ts`
      Approach: escape `\` before `"""` when writing multi-line TOML strings so prompts containing backslashes round-trip
      (Req: Agent installation)
- [x] 12.11 Copilot: non-recursive shared folder removal
      `packages/plugin-agent-copilot/src/application/use-cases/uninstall-skills.ts`
      Approach: remove only specd-managed files in the shared folder and the folder itself only if empty (as the other plugins do); do not delete user files
      (Req: Uninstall behavior)
- [x] 12.12 Standard: uninstall removes the agent files it wrote
      `packages/plugin-agent-standard/src/application/use-cases/uninstall-skills.ts`
      Approach: remove the `<name>.agent.md` files written next to the shared context file before removing the folder; keep user files
      (Req: Uninstall behavior)
- [x] 12.13 Standard: `allowed-tools` uses the spec syntax
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`
      Approach: change `Bash(node:*)`-style entries to `Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)`
      (Req: allowed-tools configuration)
- [x] 12.14 Housekeeping: stale comments and help text
      `packages/cli/src/commands/plugins/install.ts` (orphan JSDoc ~lines 170-175), `packages/cli/src/commands/config/show.ts` (`--help` schema text), `packages/core/src/domain/services/check-registry.ts` (`register` JSDoc name regex)
      Approach: delete the orphan JSDoc; update the help text and JSDoc to the scoped plugin-name rule
      (Req: config show output, Check registry names)
- [x] 12.15 Tests: plugin-manager gaps
      `packages/plugin-manager/test/application/*.spec.ts`, `test/infrastructure/plugin-loader.spec.ts`, `test/domain/*.spec.ts`
      Approach: add tests for `LoadPlugin` throwing `PluginNotFoundError`, `ListPlugins` `not_found`, wrapped vs passed-through hook errors, `schemaVersion`-only rejection, `contributes` as array, name/id rules, destroy isolation (every destroy attempted), multi-plugin rollback order, `InvalidPluginConfigError`, default-exported `create`, base-contract violation, rollback not masking the startup error, agents-only `contributions` filtering
      (Req: all plugin-manager verify scenarios)
- [x] 12.16 Tests: CLI plugin commands
      `packages/cli/test/commands/plugins.spec.ts`, `plugins-update.spec.ts`, `project-update.spec.ts`, `project-init.spec.ts`, `config-show.spec.ts`
      Approach: cover uninstall (allowlist, undeclared, non-agent, multiple), update (selection preserved, undeclared exit 1, idempotency, continue after failure), list (`not_found`, `error`, allowlist display), show (not-found exit 1, schema output, checks-only plugin), install (no `listPlugins`, header), project-update error exit, `contributions` line in config show
      (Req: cli:plugins-\*, cli:project-update, cli:config-show)
- [x] 12.17 Tests: agent plugins
      `packages/plugin-agent-*/test/**`
      Approach: add `agents`-filter uninstall tests and user-file preservation for all five plugins; assert written YAML/TOML frontmatter without mocking `getBundle`; assert manifest-derived name/version through `create()`; codex backslash TOML case; standard real `allowed-tools`; copilot shared-folder user-file preservation; tagged-block reference counting with two plugins on one `AGENTS.md`
      (Req: plugin-agent specs)
- [x] 12.18 Tests: core config
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `config-writer.spec.ts`, `packages/core/test/domain/services/check-registry.spec.ts`
      Approach: invalid YAML, missing `schema`, `adapter: s3`, no-config-found, init tmp `.gitignore` content at `{specdPath}/tmp`, `addPlugin`/`removePlugin` refusing invalid `plugins`, registry names with a leading digit or underscore
      (Req: core:config-loader, core:config-writer-port, core:check-registry)
- [x] 12.19 Re-run full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`; then `/specd-verify` in full mode with a new attempt
      (Req: all)

## 13. Audit follow-up (verification-attempt-2)

- [x] 13.1 Shared-folder owners helper in `@specd/skills`
      `packages/skills/src/` (new module, export from the package index), `packages/skills/test/`
      Global specs: named exports, explicit return types, kebab-case file, test mirrors `src/` and lives in `test/`. Helpers touch the real fs, so tests are integration tests on `os.tmpdir()` with cleanup, paths via `node:path`. The `EACCES` scenario mocks `node:fs/promises` `rmdir` (never `chmod 0o000`, not Windows-safe). Port mocks fully typed (no `as unknown as`).
      Approach: implement `addSharedOwner`, `removeSharedOwner` (`{ remaining, hadMarker }`), `removeSharedFolderIfEmpty` (`fs.rmdir`, swallow only `ENOTEMPTY`/`ENOENT`); marker `.owners.json` = `{ owners: [sorted unique] }`; invalid marker = "no marker"; tests for every scenario of `skills:shared-folder-owners` (sorted/dedup, corrupt marker, idempotent register, release remaining/last/no-marker/non-owner, rmdir empty/foreign file/missing/EACCES)
      (Req: skills:shared-folder-owners)
- [x] 13.2 Install registers the owner in all five agent plugins
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/application/use-cases/install-skills.ts`
      Approach: after writing any shared file (filtered or not) call `addSharedOwner(sharedDir, '<agentId>')`; tests: owner registered, filtered install also registers
      (Req: plugin-agent-\* Shared folder ownership and agent placement)
- [x] 13.3 Uninstall protocol in all five agent plugins
      `packages/plugin-agent-*/src/application/use-cases/uninstall-skills.ts`
      Approach: replace `rm(sharedDir)` and the unconditional shared deletions with the protocol: remove own skills (incl. legacy flat `<skill>.md`) and agent files, drop only this plugin's prompt-block reference, `removeSharedOwner`; delete `shared.md`, managed `*.agent.md` and `removeSharedFolderIfEmpty` only when `hadMarker && remaining.length === 0`; filtered uninstall keeps block, marker and shared files (standard removes only the selected `<shared>/<n>.agent.md`); do not swallow errors other than `ENOTEMPTY`/`ENOENT`
      (Req: plugin-agent-\* Uninstall, skills:shared-folder-owners)
- [x] 13.4 Tests: shared folder behaviour per agent plugin
      `packages/plugin-agent-*/test/install-skills.spec.ts`
      Global specs: real fs only in `os.tmpdir()` temp dirs cleaned after each test; paths built with `node:path`; titles follow "given <state>, when <action>, then <outcome>"; no snapshots.
      Approach: two agents installed, uninstall one keeps shared files and marker; last agent removes shared files and the empty folder; foreign file keeps the folder; legacy install without marker deletes nothing shared; filtered uninstall keeps marker/block; codex and opencode two-plugin reference count on `AGENTS.md`; legacy marker purge
      (Req: plugin-agent-\* verify scenarios)
- [x] 13.5 Capability-gated agents directory
      `packages/plugin-agent-{claude,copilot,codex,opencode}/src/application/use-cases/install-skills.ts`
      Approach: choose the agents target directory from `capabilities.includes('agents')`, falling back next to `shared.md`; standard unchanged; tests with capabilities lacking `agents`; async `create()` documented/tested (loader awaits)
      (Req: plugin-agent-\* Shared folder ownership and agent placement, Factory export)
- [x] 13.6 Stale verify scenarios and text in copilot/codex
      `packages/plugin-agent-{copilot,codex}/test/*plugin.spec.ts`
      Approach: assert `not.toHaveProperty('type')` and `install(context)` contract (code already follows); no code change expected
      (Req: copilot/codex Plugin runtime contract)
- [x] 13.7 Claude: agent `model` from `specd-agent.meta.json`
      `packages/plugin-agent-claude/src/application/use-cases/install-skills.ts`, `domain/frontmatter/index.ts`
      Approach: read the meta file when present and emit `model`; omit when none; tests for both; prompt block is the reference-counted `agents="claude"` block (verify copilot too)
      (Req: plugin-agent-claude Application layer, Prompt Injection)
- [x] 13.8 Standard: unified `allowed-tools` style and cleanup
      `packages/plugin-agent-standard/src/domain/frontmatter/index.ts`, `install-skills.ts`
      Approach: space style `Bash(x *)` everywhere, `specd-compliance` includes the node/pnpm/git/gh entries the spec lists; remove the dead comment on `agentFrontmatter`; test selected-agent removal from the shared folder
      (Req: plugin-agent-standard allowed-tools configuration, Uninstall)
- [x] 13.9 OpenCode: `permission` map
      `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts`, tests
      Approach: FIRST confirm the agent frontmatter format against the OpenCode documentation (singular `permission`, map of tool to allow/ask/deny, nested pattern map for Bash); then emit `permission: { bash: { "node *": allow } }`, no duplicate keys, bare tool plus patterns -> `"*": allow` only if the docs confirm it; fix the stale test title "deploys plugin script, merges opencode.json"; if the docs contradict the spec, stop and update the spec first
      (Req: plugin-agent-opencode Application layer)
- [x] 13.10 plugin-manager: errors and loader
      `packages/plugin-manager/src/domain/errors/`, `infrastructure/loader/plugin-loader.ts`, `domain/services/resolve-contributions.ts`, `domain/services/plugin-config-schema.ts`
      Global specs (`error-handling-conventions`): every new error (`DuplicateHandlerKindError`, `InvalidContributionAddressError`) extends `SpecdError`, `specd: true`, UPPER_SNAKE `code`, actionable message, JSDoc with the code and metadata (`kind`, address); use cases document thrown errors with `@throws`. The default-export acceptance is loader leniency for third-party packages only: our own code keeps named exports (`conventions`).
      Approach: document-driven changes: `export default create` accepted; `parseContributionAddress` and `buildContributionAddress` throw `InvalidContributionAddressError` (build validates); base-contract `fields` list the real failing fields; `configSchema` node-shape validation (type list, `required` string array, boolean `additionalProperties`, single `items`); `validatePlugin(plugin, pluginName)`; `DuplicateHandlerKindError` raised at loader/`registerPlugins` set-up and listed in plugin-errors; single shared `mergeHandlers`
      (Req: plugin-loader, specd-plugin-type, plugin-errors, agent-plugin-type)
- [x] 13.11 plugin-manager: `registerPlugins` and use cases
      `packages/plugin-manager/src/application/use-cases/{register-plugins,install-plugin,uninstall-plugin,update-plugin}.ts`, package index
      Approach: `SpecdError` from `init` propagates, other errors -> `PluginInitError`; activate failure wrapped and rolled back; export `RegisterPluginsInput` (remove `RegisterPluginsOptions`); `InstallPluginOutput.contributions` equals the ids passed to the hook; rename `PluginRepository` -> `PluginRepositoryPort` with `configPath`-first methods and `DeclaredPlugin` = core `ConfigDeclaredPlugin`
      (Req: register-plugins-use-case, install/uninstall/update-plugin-use-case, plugin-repository-port)
- [x] 13.12 plugin-manager tests
      `packages/plugin-manager/test/**`
      Approach: add the missing tests: uninstall (unknown id, agents contract check, no hook, init not called, not found), update (agents contract, SpecdError passthrough, idempotency, output shape), install not found, list contributions content, load no lifecycle calls, loader (`pluginType` rejection, `validatePlugin`, host `agents` handler override, name/version mismatch separately, `export default create`, async factory), register (init SpecdError, activate rollback, real `KernelBuilder` ordering), errors per-class message and `cause`, type-level `ConfigWriter` conformance test for the port
      (Req: plugin-manager verify scenarios)
- [x] 13.13 SDK
      `packages/sdk/src/index.ts`, `composition/host-context.ts`, `packages/sdk/test/**`
      Approach: re-export plugin error classes; when `build()` rejects, rethrow the build error and attach dispose failures as `rollbackErrors`; end-to-end test with the real plugin-manager and kernel builder (PluginInitError, reverse destroy on dispose, no kernel on plugin failure, default plugins enabled, `plugins: false`); barrel test for `ContributionKindHandler`/`ContributionActivationContext`; dependency test plugin-manager does not depend on sdk
      (Req: sdk:composition, sdk:host-context)
- [x] 13.14 Core: config writer and docs-in-spec parity
      `packages/core/src/infrastructure/fs/config-writer.ts`, `application/ports/config-writer.ts`
      Approach: `addPlugin` validates the scoped name (`ConfigValidationError`); `removePlugin` of an absent name or missing key does not rewrite the file; `listPlugins` throws on legacy/invalid shapes, `[]` for missing file/key; init creates `<configPath>/tmp/.gitignore`; fix the "adds or replaces" comment to "merges"; fix duplicated JSDoc on `legacyPluginsSnippet`; dedupe the `plugins` mapping (writer reuses the loader schema)
      (Req: core:config-writer-port, core:config-loader)
- [x] 13.15 Core: check-registry
      `packages/core/src/domain/services/check-registry.ts`, `composition-registries.ts`
      Approach: confirm the options type name `PluginCheckRegistrationOptions` is the one in the spec; tests for unscoped/dot names, step-skip duplicates, `archiveChecks`, cascade
      (Req: core:check-registry)
- [x] 13.16 Core tests
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `config-writer.spec.ts`
      Approach: `contributions` allowlist accepted, legacy in an extending layer, newer version precedence over legacy, `remove.plugins` absent name / duplicate names, `configVersion: 0`, `plugins: { skills: [] }` generic error, `addPlugin` config+contributions on disk, `listPlugins` entries, `removePlugin` leaves the file byte-identical, `createConfigWriter` does not construct `FsConfigWriter`
      (Req: core:config, core:config-loader, core:config-writer-port)
- [x] 13.17 CLI: command behaviour fixes
      `packages/cli/src/commands/plugins/{install,update,show,list}.ts`, `commands/project/{init,update}.ts`, `commands/config/show.ts`
      Approach: `project update` JSON adds `hasErrors`; remove the `skipped` status from `plugins update` (type and output); `plugins show` omits capabilities unless install/uninstall hooks or `agents`; `project init`: banner only in the wizard, interactivity from provided flags (commander option source), validate `--plugin` names before writing; `config show --help` JSON schema matches `SpecdConfig`; single space contributions suffix; shared per-status rendering in `plugins list`
      (Req: cli:plugins-install/update/list/show, cli:project-init, cli:project-update, cli:config-show)
- [x] 13.18 CLI tests
      `packages/cli/test/commands/*.spec.ts`, `test/helpers/*.spec.ts`
      Approach: install (no install/addPlugin on already-installed or unscoped, continue after failure, header, JSON `hasErrors`), uninstall (allowlist, undeclared, hook-before-removal order and declaration kept on hook failure, exit 1 + continue, `plugins:false`, checks-only), update (allowlist passed, no writer call, exit 1 + continue, `plugins:false`, text/empty), list (`not_found`, `error`, `available:`, version `-`, nothing declared), show (load failure exit 1, schema/defaultConfig, capabilities omitted, init never called), project-init wizard (multiselect, overwrite confirm, cancel, banner only there, explicit default flag stays non-interactive, root placement, `metadataCachePath`, post-init install failure exit 1), project-update (missing `specd.yaml`, aggregate errors, allowlist), config-show (no suffix without allowlist, TOON), host-context (plugins enabled by default, `onLog`, `Symbol.asyncDispose`, cleanup on error/signal, graph worker bootstrap)
      (Req: cli verify scenarios)
- [x] 13.19 Documentation parity
      `docs/cli/*.md`, `docs/guide/*.md`, `docs/core/config.md`
      Approach: document `.owners.json`, `plugins update` statuses (`updated|error`), JSON `hasErrors`, `remove.plugins`, `configVersion`; keep guides in parity (`default:_global/docs`)
      (Req: documentation parity)
- [x] 13.20 Re-run full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`; then `/specd-verify` in full mode with a new attempt (the specs/verify of this change now include the new scenarios)
      (Req: all)

## 14. Audit follow-up (verification-attempt-3)

- [x] 14.1 Write the tmp `.gitignore` under the resolved config path
      `packages/core/src/infrastructure/fs/config-writer.ts`, `packages/core/test/infrastructure/fs/config-writer.spec.ts`
      Approach: `initProject` creates `<configPath>/tmp/.gitignore` (default `.specd/config/tmp/.gitignore`), not `.specd/tmp/.gitignore`; update the test assertion to the spec path
      (Req: core:config-writer-port — InitProject behaviour)
- [x] 14.2 Typed errors in the config writer
      `packages/core/src/infrastructure/fs/config-writer.ts`, tests
      Approach: check `doc.errors` after `parseDocument` and throw `ConfigValidationError` (no rewrite) in `addPlugin`/`removePlugin`/`listPlugins`; absent file on `addPlugin`/`removePlugin` throws `ConfigValidationError`; tests: malformed YAML, invalid name leaves file byte-identical, absent file
      (Req: core:config-writer-port — AddPlugin/RemovePlugin/ListPlugins)
- [x] 14.3 Per-layer config version and legacy checks before the cascade merge
      `packages/core/src/infrastructure/fs/config-loader.ts`, `config-cascade.ts`, tests
      Approach: run `assertCurrentConfigFormat` on every layer before `mergeActiveLayers`, so a v3 extending layer reports `UnsupportedConfigVersionError` and a legacy base with `remove.plugins` reports `LegacyConfigFormatError`; tests assert `instanceof` for both errors and reject negative/fractional `configVersion`
      (Req: core:config, core:config-loader)
- [x] 14.4 `PluginInstallContext.options` typing
      `packages/plugin-manager/src/**/plugin-install-context*`/`specd-plugin*` types
      Approach: type `options` as `Readonly<Record<string, unknown>>` per spec; tests pass `options` through install, uninstall and update
      (Req: plugin-manager:specd-plugin-type, install/uninstall/update use cases)
- [x] 14.5 `registerPlugins` merges handlers before the empty-list return
      `packages/plugin-manager/src/application/use-cases/register-plugins.ts`, tests
      Approach: move the handler merge above the empty-list short-circuit; tests: duplicate kind with empty list, real `KernelBuilder`, input defaults
      (Req: plugin-manager:register-plugins-use-case)
- [x] 14.6 Loader checks manifest name against the requested name
      `packages/plugin-manager/src/infrastructure/loader/**`, tests
      Approach: `PluginValidationError` naming the requested plugin when manifest `name` differs; tests also cover no-factory export (`create`), async factory awaited, factory receives config only, name-regex edge cases, non-object `configSchema` root, `contributes` as array, `schemaVersion: 1` without `pluginType`
      (Req: plugin-manager:plugin-loader)
- [x] 14.7 `project init` asks overwrite at wizard start
      `packages/cli/src/commands/project/init.ts`, tests
      Approach: move the "specd.yaml exists, overwrite?" prompt before settings and plugin prompts
      (Req: cli:project-init)
- [x] 14.8 `config show --help` documents all `SpecdConfig` fields; tests
      `packages/cli/src/commands/config/show.ts`, `packages/cli/test/commands/config-show.spec.ts`
      Approach: generate/extend the help schema from the full `SpecdConfig` field set; add broken-plugin scenario (loader not mocked) and a TOON assertion that `plugins` appears
      (Req: cli:config-show)
- [x] 14.9 CLI/SDK test gaps
      `packages/cli/test/**`, `packages/sdk/test/**`
      Approach: project-update (UpdatePlugin not install, allowlist, second plugin still updated, without mocking the whole use case), no empty `config` key without `defaultConfig`, init not called on install, duplicate names in one install, wizard offers the five known plugins and accepts empty selection, stderr `warning: cleanup failed: boom`, worker passes `plugins: false`; SDK barrel asserts plugin error classes are identical to plugin-manager's and that all removed metadata APIs (and `PersistSpecMetadata`) are absent; assert new barrel exports `isPluginName`, `PLUGIN_NAME_REGEX`, `createConfigWriter`
      (Req: cli verify scenarios, sdk:composition)
- [x] 14.10 `.owners.json` tests in agent plugins
      `packages/plugin-agent-{codex,opencode,copilot,standard}/test/**`
      Approach: cover install registration, filtered install, last-owner cleanup, foreign file kept, legacy install without marker, filtered uninstall keeping the marker (claude is the reference); add manifest/factory scenarios (manifest content, name/version from manifest, no `type`, async factory awaited)
      (Req: plugin-agent-\*:plugin-agent, skills:shared-folder-owners)
- [x] 14.11 Deduplicate `shared-folder.ts`
      `packages/plugin-agent-*/src/shared-folder.ts`
      Approach: move the shared-folder owner helpers to one shared module in `@specd/skills` (it already owns `skills:shared-folder-owners`), import it from the five plugins, delete the copies
      (Req: skills:shared-folder-owners)
- [x] 14.12 Check-registry grammar tests
      `packages/core/test/domain/services/check-registry.spec.ts`
      Approach: accepted grammar (leading digit, hyphen, underscore), no `@@`, `getBindings`/`getGovernance` on unknown id
      (Req: core:check-registry)
- [x] 14.13 Re-run full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test && pnpm lint`; then `/specd-verify` in full mode with a new attempt
      (Req: all)

## 15. Audit follow-up (verification-attempt-4)

- [x] 15.1 Validate `enum` shape in the config schema walker
      `packages/plugin-manager/src/domain/services/plugin-config-schema.ts`, `packages/plugin-manager/test/domain/services/plugin-config-schema.spec.ts`
      Approach: in `walkSchema` reject a non-array or empty `enum` with the same typed error as the other shape violations; add tests for non-array and empty `enum`, and assert `resolvePluginConfig` never throws an untyped `TypeError`
      (Req: plugin-manager:specd-plugin-type — Plugin configuration schema)
- [x] 15.2 Make `registerPlugins` always report failures as rejections
      `packages/plugin-manager/src/infrastructure/loader/register-plugins.ts`, `packages/plugin-manager/test/**`
      Approach: declare `registerPlugins` `async` (or wrap the handler merge in the promise) so `DuplicateHandlerKindError` rejects with and without `input.loader`; add a test for both paths using `.rejects`
      (Req: plugin-manager:register-plugins-use-case — Signature, Duplicate handler kind)
- [x] 15.3 Register the shared owner before the first shared write
      `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/application/use-cases/install-skills.ts`, tests
      Approach: call `addSharedOwner` before writing the first shared file (filtered and unfiltered installs); add a test per plugin where install fails after one shared write and `.owners.json` still lists the agent, and a later uninstall cleans up
      (Req: skills:shared-folder-owners — Registering an owner)
- [x] 15.4 Verify the CLI dependency policy
      `packages/cli/package.json`, `packages/sdk/test/**`
      Approach: no code change; assert (or confirm by inspection) that the CLI lists `@specd/sdk` and neither `@specd/core` nor `@specd/code-graph`
      (Req: sdk:composition — Import policy for integrators)
- [x] 15.5 Plugin-manager code minors
      `packages/plugin-manager/src/**`, tests
      Approach: `readManifest` keeps the underlying read/parse error as `cause` of `PluginValidationError(['specd-plugin.json'])` and a test per cause (missing file, invalid JSON); shape violations in `walkSchema` use `UnsupportedSchemaKeywordError` with the offending keyword; error messages of the plugin-errors classes state what is expected or how to fix it; `uninstall` stays `Promise<void>`; `listPlugins` in `PluginRepositoryPort` stays `readonly DeclaredPlugin[]` (assignable from core's mutable array)
      (Req: plugin-manager:plugin-loader, plugin-errors, specd-plugin-type, plugin-repository-port)
- [x] 15.6 Install/uninstall/update with no selected `agents` id
      `packages/plugin-manager/src/application/use-cases/{install,uninstall,update}-plugin.ts`, tests
      Approach: keep calling the hook with `contributions: []` when the manifest declares `agents` and none is selected; add tests for install, uninstall and update, plus mixed-kind tests (only agents ids reach the hook), selection preserved with a non-selected sibling, no `defaultConfig` in the update output
      (Req: install/uninstall/update-plugin-use-case)
- [x] 15.7 Plugin-manager test gaps
      `packages/plugin-manager/test/**`
      Approach: register-plugins with a real `KernelBuilder` and without `input`, disposer named `specd-plugins`, second `dispose()` no-op, non-agents handler without `activate`, nothing registered for `agents`; plugin-loader async factory, factory receives `config` only, two `widgets` handlers rejected, `validatePlugin(plugin, name)` for a custom handler, install/destroy not called by the loader; `isAgentPlugin` with `install` but no `uninstall`; list-plugins input order and two contribution ids; `PluginNotFoundError`, per-class message with plugin name and `DuplicateHandlerKindError` without `pluginName`; `DeclaredPlugin` equals `ConfigDeclaredPlugin`
      (Req: plugin-manager specs)
- [x] 15.8 Core code minors and tests
      `packages/core/src/infrastructure/fs/{config-cascade,config-loader,config-writer}.ts`, `packages/core/test/**`
      Approach: `mergePluginLists` returns a copy so `applyRemovals` never mutates the previous layer (test merging a cascade twice); restore the `resolveConfiguredInvalidation` JSDoc; remove the orphan JSDoc above `requireMutablePlugins`; `initProject` derives the config and metadata directories from the resolved paths instead of hardcoding `.specd/config` and `.specd/metadata`; tests: loader does not load plugins (absent package), invalid plugin name leaves the file byte-identical, plugin mutation on an absent config creates no file, `addPlugin` then `listPlugins` round trip; fix the stale `@plugin` titles in `check-registry.spec.ts`
      (Req: core:config, core:config-loader, core:config-writer-port, core:check-registry)
- [x] 15.9 CLI minors and tests
      `packages/cli/src/commands/**`, `packages/cli/test/**`
      Approach: decide and document `--contributions ""` (reject as invalid input) and the extra `Installed plugins:` header of `plugins list` (keep, it is output-only); cancelling the wizard keeps exit code 0 (documented in the command help) and the overwrite prompt tells the user what will be overwritten; tests: duplicate plugin name in one install, `listPlugins`/`init` not called, wizard offers exactly the five known plugins, project-update allowlist and untouched `specd.yaml`, broken plugin does not block `config show` (loader not mocked), JSON `plugins` flat list, bootstrap-mode graph-index worker passes `plugins: false`
      (Req: cli:plugins-install, plugins-list, project-init, project-update, config-show, host-context)
- [x] 15.10 SDK and agent-plugin minors and tests
      `packages/sdk/src/**`, `packages/plugin-agent-*/src/**`, tests
      Approach: `attachRollbackErrors` keeps rollback errors when the build error is a primitive or `null`; remove the no-op `split(', ').join(', ')` in the Claude tools mapping; Copilot tools split handles commas inside patterns; Codex TOML `name`/`description` use a TOML-valid string escape; remove the dead `allowed-tools` branch in the standard plugin; tests: owners (last owner, foreign file, legacy install, filtered uninstall keeps marker, fast-track install) in copilot, codex, opencode and standard; the other half of "plugin may depend on core directly"; structural tests for the SDK layer rules
      (Req: sdk:composition, sdk:host-context, plugin-agent-\*:plugin-agent, skills:shared-folder-owners)
- [x] 15.11 Every plugin-manager error is a `SpecdError`
      `packages/plugin-manager/src/domain/errors/plugin-destroy-error.ts`, `packages/plugin-manager/src/domain/errors/index.ts`, `packages/plugin-manager/src/application/use-cases/register-plugins.ts`, `packages/plugin-manager/src/infrastructure/loader/plugin-loader.ts`, `packages/sdk/src/**`, tests
      Approach: add `PluginDestroyError extends SpecdError` (code `PLUGIN_DESTROY_FAILED`, `errors: readonly unknown[]`) and throw it instead of `AggregateError` in the disposer; in `PluginLoader.load` wrap a failing `import()` in `PluginValidationError(['entry'], cause)` and a non-`SpecdError` thrown by the `create()` factory in `PluginValidationError(['create'], cause)` (a `SpecdError` propagates unchanged); export `PluginDestroyError` from the plugin-manager root and re-export it from `@specd/sdk` (barrel test: same class); tests: destroy failure yields `PluginDestroyError instanceof SpecdError` with the thrown values in `errors`, import failure, throwing factory, `SpecdError` factory unchanged, and a test that walks every error class exported by the package asserting `instanceof SpecdError` and a `code`; check the CLI error handler prints them with the standard specd exit code
      (Req: plugin-manager:plugin-errors, plugin-loader, register-plugins-use-case, sdk:composition)
- [x] 15.12 Re-run full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test`; then `/specd-verify` in full mode with a new attempt
      (Req: all)
- [x] 15.13 SDK propagates the build error unchanged
      `packages/sdk/src/composition/host-context.ts`, `packages/sdk/test/composition/host-context.spec.ts`
      Approach: `sdk:host-context` requires that the build error is the error that propagates. `attachRollbackErrors` MUST NOT wrap: an object build error gets `rollbackErrors` attached and is rethrown (same identity); a primitive or `null` build error is rethrown unchanged and its rollback errors are reported through the kernel logger at `warn` (they cannot be attached to a non-object); update the `it.each` test accordingly (thrown value `===` the original primitive, rollback errors logged)
      (Req: sdk:host-context)

## 16. Audit follow-up (verification-attempt-5)

Source of truth for every item below: `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261105-152520/_partial-<batch>.md` (batches `core-config`, `plugin-manager`, `cli`, `sdk-agents`). Each task covers ALL findings of its batch (discrepancies, minors and every listed scenario without a test or with a weak test), not only the ones named here.

- [x] 16.1 Core: findings of `_partial-core-config.md`
      `packages/core/src/**`, `packages/core/test/**`
      Approach: `addPlugin` rejects an empty `contributions` list with `ConfigValidationError` before writing and a non-mapping YAML root with `ConfigValidationError` (not a raw `yaml` error); `InvalidPluginNameError` message and the stale JSDoc in `check-registry-errors.ts`, `composition-registries.ts` and `kernel-builder.ts` describe the scoped `@scope/name` grammar; fix `{@link pluginSchema}` in `config-writer.ts` (use `PluginsZodSchema`); move the mid-file imports in `config-schema.ts` to the top; add every missing or weak test of the report (context entry with `id` preserved, update preserves omitted fields, extending-layer legacy message names the layer path, error code asserted for the newer version, fractional versions, `instanceof ConfigValidationError` for the subclasses, empty contributions in config and writer, invalid-name error message)
      (Req: core:config, core:config-loader, core:config-writer-port, core:check-registry)
- [x] 16.2 CLI: findings of `_partial-cli.md` and the `cli:config-show` help (M1)
      `packages/cli/src/**`, `packages/cli/test/**`
      Approach: generate the `config show --help` shape from one typed key table so the workspace, storage and context-entry shapes match `SpecdConfig` (project-level fields only at project level); add a test comparing the documented keys with the keys of `SpecdConfig`; add every missing test of the report (config-show JSON `plugins`, broken plugin, warnings to stderr in `load-config.ts`; plugins-install init never called, `resolveCliContext` not called on empty contributions, comma-only and blank variants; uninstall without hook and two plugins; update no `listPlugins`, idempotency, mixed text; list `plugins:false`, no `listPlugins`, mixed kinds, version in text, JSON rows for not_found/error; show checks-only text and `nonexistent-plugin`; project-init prompt-cancel exit 0, post-init `configPath`, git-root vs cwd, already-exists `error:` text and unchanged file; project-update `plugins: error` line and missing-config `error:`; host-context `onLog` and the sole-workspace-dependency `package.json` check)
      (Req: cli:config-show, plugins-\*, project-init, project-update, host-context)
- [x] 16.3 Plugin-manager: findings of `_partial-plugin-manager.md`
      `packages/plugin-manager/src/**`, `packages/plugin-manager/test/**`
      Approach: E1 wrap non-`SpecdError` failures of a handler `validatePlugin`, block-schema parsing and base-contract accessors in `PluginValidationError` (`fields: ['contributes.<kind>']`, `cause`); E2 wrap non-`SpecdError` rejections of a caller-supplied loader in `registerPlugins` (`fields: ['load']`) and update `register-plugins.spec` that expected a plain `Error`; E3 `resolvePluginConfig` validates the schema itself (typed error, never `TypeError`); D2 require `type` on every node and validate `enum` entry types; D3 name the offending keys of a strict-manifest violation in `fields`; M5 `PluginValidationError` message includes the cause message; M-T1 strengthen the three loader tests so they fail if the package is imported before the manifest is validated (assert `fields` is not `['entry']` or use a side-effect marker); add every missing or weak test of the report (name rules, address parsing, non-object schema root/property, schemaVersion 1 alone, `contributes.checks` as array, throwing custom handler, package without `create`, input defaults with a real loader, rollback with three plugins, typed load failure, non-agent plugin install/uninstall selection, update `PluginNotFoundError`, invalid-id error class, non-object schema keyword and `PLUGIN_VALIDATION_ERROR` code)
      (Req: plugin-manager specs)
- [x] 16.4 SDK and agent plugins: findings of `_partial-sdk-agents.md`
      `packages/sdk/**`, `packages/plugin-agent-*/**`, `packages/skills/**` if needed
      Approach: strengthen the owner-before-write test in all five plugins so it fails when registration happens after the first shared write (make the FIRST shared write fail and assert the marker); add every gap G1-G13 of the report (uninstall with `options.agents` in claude, copilot, codex, opencode; filtered install registers the owner in codex, opencode, standard; sdk empty plugin list; broken-plugin e2e with several plugins asserting rollback; type-level handler-contract assertion with `expectTypeOf`; domain-layer, frontmatter-type and field-contract scenarios per plugin; opencode bare `"*": allow` merge; meta-package inclusion for opencode and standard; standard Bash patterns for all skills); the filtered-uninstall-in-shared-folder behaviour covered by the new scenario in claude, copilot, codex, opencode
      (Req: sdk:composition, sdk:host-context, plugin-agent-\*:plugin-agent, skills:shared-folder-owners)
- [x] 16.5 Full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test`, lint, then `/specd-verify` in full mode with a new attempt
      (Req: all)
- [x] 16.6 Pre-audit fixes for known gaps
      `packages/core/test/**`, `packages/sdk/test/**`, any package where the review below finds a divergence
      Approach: runtime type test with `expectTypeOf` for the four `ConfigWriter` interface scenarios; sdk test that a failing plugin `init` never calls `builder.build()` ("no kernel built"); a plugin-manager test that an accessor which throws yields `PluginValidationError` with `fields: ['plugin']`; tests for the clarified wording (fractional `configVersion` above the supported version reports `UnsupportedConfigVersionError`, `addPlugin` argument errors win over a missing file, uninstall evaluates `capabilities` like install); then an independent review of every change made since attempt 5 against the merged specs, fixing any divergence found
      (Req: core:config-writer-port, core:config, sdk:host-context, plugin-manager:plugin-loader, plugin-agent-\*:plugin-agent)
- [x] 16.7 Divergences found by the independent review before attempt 6
      `packages/plugin-manager/src/**`, `packages/core/src/infrastructure/fs/config-writer.ts`, `packages/sdk/src/composition/host-context.ts`, tests, `docs/guide/plugins.md`
      Approach: install/uninstall/update/load wrap a non-`SpecdError` loader rejection like `registerPlugins` (shared `loadPluginSafely`); the config-schema issue text is the spec literal "config given but no configSchema declared"; `UnsupportedSchemaKeywordError` takes an optional reason so shape violations are not reported as "unsupported keyword"; `readRollbackFailures` unpacks `PluginDestroyError.errors`; `removePlugin` and `listPlugins` reject a non-mapping YAML root like `addPlugin`; the CLI states that it registers only the built-in `agents` handler
      (Req: plugin-manager:plugin-errors, plugin-manager:specd-plugin-type, sdk:host-context, core:config-writer-port, cli:plugins-install)

## 17. Audit follow-up (verification-attempt-6)

Source of truth for every item: `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261106-095411/_partial-<batch>.md` (batches `core-config`, `plugin-manager`, `cli`, `sdk-agents`). Each task covers ALL findings of its batch: the major, every minor, and every scenario listed as untested or weakly tested.

- [x] 17.1 Core: findings of `_partial-core-config.md`
      `packages/core/src/**`, `packages/core/test/**`
      Approach: reject a duplicate plugin name inside one layer (including an extending layer) with `ConfigValidationError` before merging (M1); a layer cannot remove a plugin it declares itself (only inherited entries); `CheckEmbeddingForbiddenError` blames `allowSchemaEmbedding`; new `InvalidCheckIdError` (exported) when a plugin check id does not match `^[a-z0-9][a-z0-9_-]*$`; `addPlugin` rejects an empty or comment-only document with `ConfigValidationError` while `removePlugin`/`listPlugins` treat it as no plugins; `listPlugins` on a directory path throws `ConfigValidationError`; explicit `undefined` options treated as omitted (documented); tests for every gap of the report (duplicate in extending layer, add+remove same layer, remove with no inherited plugins, empty document, directory path, check id with dot, re-init idempotency of the metadata directory, other `.gitignore` content undisturbed, the vacuous writer scenarios made explicit)
      (Req: core:config, core:config-loader, core:config-writer-port, core:check-registry)
- [x] 17.2 Plugin-manager: findings of `_partial-plugin-manager.md`
      `packages/plugin-manager/src/**`, `packages/plugin-manager/test/**`
      Approach: E1 frozen original error keeps its identity when `attachRollbackErrors` cannot attach (log at `warn`); E2/E3 guard throwing getters on module exports and plugin accessors; E4 a handler schema that transforms to a non-object is a `PluginValidationError`; E5 reject schemas nested deeper than 32 levels with `UnsupportedSchemaKeywordError` (no `RangeError`); E6 a loader result that is not `{ plugin, manifest }` is a load failure (`fields: ['load']`) in `registerPlugins` and in install/uninstall/update/load; E7 non-string `projectRoot` is a typed error; E8 the outer catch of `registerPlugins` normalises any non-`SpecdError`; `throw undefined` keeps `cause`; `PluginDestroyError` gains `pluginNames` and names the plugins in its message; `properties` must be an object (spec lists it); `ListPlugins` renders non-Error rejections with their message; export `UninstallPluginOutput`; strengthen the 7 weak scenarios of the report (name and version from manifest, default loader on an unresolvable package, duplicate-id names the plugin, `registerPlugins` before `build` ordering, dispose before any kernel, install-wrap cause text, `SpecdError` thrown by `activate`)
      (Req: plugin-manager specs)
- [x] 17.3 Agent plugins and skills: findings of `_partial-sdk-agents.md` (plugin and skills parts)
      `packages/plugin-agent-*/**`, `packages/skills/**`
      Approach: T4 test (and fix if needed) owner registration for fallback agent files written into the shared folder when `agents` is not a capability, in all five plugins (a mutation removing `|| baseDir === sharedDir` must fail the suite); C3 opencode `toOpenCodePermission` splits only on top-level commas; C4 empty `skills`/`agents` arrays count as not provided (tests); C6 marker duplicates are read and rewritten without duplicates; C7 codex TOML escapes every control character; C8 `create()` validates manifest `name`/`version` and T2 tests it; C9 standard ignores `options.capabilities` (test); T1 filtered uninstall with `options.skills` keeps the prompt block; T5/T6 last-owner uninstall removes `<agent>.agent.md` and other-owner cases check the marker in every plugin; T7 legacy marker purged on uninstall (codex, standard); T13 `rmdir` EACCES rethrown (skills); T8 render real YAML/TOML without mocking `getBundle` in one test per plugin; remaining gaps T1-T16 of the report
      (Req: plugin-agent-\*:plugin-agent, skills:shared-folder-owners)
- [x] 17.4 SDK: findings of `_partial-sdk-agents.md` (sdk part)
      `packages/sdk/**`
      Approach: C1 a frozen or non-extensible build error is rethrown unchanged and the rollback failures are logged at `warn`; C2 documented limit (no extra code); T12 use the real `PluginDestroyError` class in the unpacking test; remaining sdk gaps of the report
      (Req: sdk:host-context, sdk:composition)
- [x] 17.5 CLI: findings of `_partial-cli.md` and the config-show items of `_partial-core-config.md`
      `packages/cli/src/**`, `packages/cli/test/**`
      Approach: `CONTEXT_ENTRY_KEYS` drives the help renderer (not only the test); tests for M1 (detail is the `UnknownContributionKindError` message naming plugin and kind), M2 (only the built-in agents handler is registered: assert `createPluginLoader` is called without extra handlers), M3 (uninstall hook-before-removal ordering with the right plugin), M4 (exit code values, not only `ExitSentinel`), M5 (`kernel.project.listPlugins`/`addPlugin`/`removePlugin`/`init` not called), M6 (`UpdatePlugin` not called for an undeclared plugin), M7 (`plugins list` text header and detail on `not_found`, `specd init` alias equals `project init`), M8 (dispose twice releases once; plugins enabled by default), and config-show: no positional arguments, config-not-found through the real loader, TOON structure, a meaningful `artifactRules` assertion
      (Req: cli specs)
- [x] 17.6 Full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test`, lint, then `/specd-verify` in full mode with a new attempt
      (Req: all)

## 18. Audit follow-up (verification-attempt-7)

Source of truth for every item: `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261106-105845/_partial-<batch>.md` (batches `core-config`, `plugin-manager`, `cli`, `sdk-agents`). Each task covers ALL findings of its batch: the major, every minor, every informational item that can be acted on, and every scenario listed as untested or weakly tested (reason about mutants: a test that passes when the behaviour is wrong is a gap).

- [x] 18.1 Core: findings of `_partial-core-config.md`
      `packages/core/src/**`, `packages/core/test/**`
      Approach: the loader wraps non-ENOENT read errors (EISDIR, EACCES) in `ConfigValidationError` (M1); `addPlugin` on an explicit `null`/`~` root throws `ConfigValidationError` (M2); duplicate plugin names are rejected in EVERY layer including the root before any layer is merged, so `remove.plugins` cannot erase them (M3); a name removed and re-declared in one layer is appended at the end, documented and tested (M7); an absent root `configVersion` means the current version, so an extending layer stating it is accepted (M8); writer error messages state the real cause (duplicate names, bad names, unknown keys, empty contributions) instead of always "contributions cannot be empty" (M6); harden M5 tests (replace in place vs delete-then-append, duplicate removal names message) and add the runtime `listPlugins` assertion (M9); every informational item that can be acted on
      (Req: core:config, core:config-loader, core:config-writer-port, core:check-registry)
- [x] 18.2 Plugin-manager: findings of `_partial-plugin-manager.md`
      `packages/plugin-manager/src/**`, `packages/plugin-manager/test/**`
      Approach: guard every `instanceof SpecdError` check against hostile objects (a Proxy whose `getPrototypeOf` throws) through one shared helper, keeping the ORIGINAL thrown value as `cause` (E1, E1b); run `isAgentPlugin` inside the try of install/update/uninstall (E2); `loadPluginSafely` also validates that `manifest.contributes` is an object so a malformed manifest is a load failure in every use case (E3); a relative, empty or non-string `projectRoot` is `PluginValidationError(['projectRoot'])` (E4); a handler `safeParse` that returns garbage is wrapped (E5); an async `validatePlugin` is awaited and its rejection wrapped, no `unhandledRejection` (E6); `contributes` kind `__proto__` raises `UnknownContributionKindError` (D1); `ListPlugins` uses `loadPluginSafely` so a result without `plugin` is `error` (D5); strengthen every weak test of the report (unknown-kind names, `fields: ['projectRoot']`, absent vs `undefined` options, `@ac.me/plugin`, vacuous `is-agent-plugin` test, factory receives config value, depth 33 boundary, `LoadPlugin` no lifecycle calls) and add tests for E1-E6 and D1/D5
      (Req: plugin-manager specs)
- [x] 18.3 Agent plugins and skills: findings of `_partial-sdk-agents.md` (plugin and skills parts)
      `packages/plugin-agent-*/**`, `packages/skills/**`
      Approach: C1 (safety) a filtered uninstall only touches specd-managed names validated against the managed skill/agent list; an unknown name or one with a path separator or `..` is skipped and reported, never deleted, in all five plugins; C2 a full uninstall removes managed agent files from both the runtime agents directory and the shared folder whatever `capabilities` says; C3 the Claude plugin renders hyphenated skill keys (`allowed-tools`, `argument-hint`, `disable-model-invocation`, `user-invocable`; `when_to_use` and `model` as written) and never snake_case, with the fast-track skill carrying `disable-model-invocation: true`; keep agent files on `tools`/`model`; C4 Copilot agent key is `allowed-tools` consistently (code, tests, spec); C6 opencode: the spec no longer asks for an observable `removeSpecdBlock` before inject, test that injection leaves no legacy marker; T2 `variables.sharedFolder` override in install and uninstall (five plugins); T3 `InstallResult.skipped` entries; T4 legacy flat `<skill>.md` removal in install and full uninstall (codex, copilot, opencode, standard); T5 Copilot tools splitting through the install path; T11 skills `addSharedOwner` rewrites an unsorted-but-unique marker when the id is present; the smaller gaps of the report
      (Req: plugin-agent-\*:plugin-agent, skills:shared-folder-owners)
- [x] 18.4 SDK: findings of `_partial-sdk-agents.md` (sdk part)
      `packages/sdk/**`
      Approach: re-export `InvalidCheckIdError` from the SDK barrel with an identity test; `barrel.spec.ts` must not run `pnpm build` inside vitest (check `dist` only when it exists); T1 `openSpecdHost` fallback: tests for the flag omitted, false and an error that must not trigger the fallback (a mutant removing the guard or falling back on any error must fail); the remaining sdk gaps; decide and document the type-only export of the `MaterializeSpecMetadata` family
      (Req: sdk:composition, sdk:host-context)
- [x] 18.5 CLI: findings of `_partial-cli.md`
      `packages/cli/src/**`, `packages/cli/test/**`
      Approach: m1 `plugins list` text column order is name, version, status (spec updated; test it); m2 `uninstall X X` processes once and reports the repeat as `skipped` with `already processed`; m3 uninstalling a declared plugin whose package is missing removes the declaration and reports `uninstalled` with `package not found; only the declaration was removed`; m5 `metadataCachePath` test with a non-default value; m6 the install-failure-after-init test asserts the failure appears in the output; m7 at least one test per command with a REAL plugin whose `init` would throw, proving `plugins: false` bootstrap (no init); m8 `show` text rendering of `configSchema`/`defaultConfig`, list `-` for a loaded plugin without version, install `hasErrors: false`; m9 banner asserts the ASCII art; m10 harden the host-context source-scan, the dispose-twice test (do not let the mock memoise) and restore `argv` in `finally`; m11 project-update missing config through real discovery, empty JSON output and success-path `hasErrors: false`; m4 init delegation scenarios keep core-level coverage and the path is `.specd/config/tmp/.gitignore`
      (Req: cli specs)
- [x] 18.6 Full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test`, lint, then `/specd-verify` in full mode with a new attempt
      (Req: all)

## 19. Audit follow-up (verification-attempt-8) — bounded round

Scope is deliberately limited to real behaviour and safety defects plus targeted tests; the remaining minors of `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261106-182751/` are accepted as known and listed in `design.md`. Details per item are in `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261106-182751/_partial-<batch>.md`.

- [x] 19.1 Plugin-manager: `_partial-plugin-manager.md` m1, m3, m4, m5, m6
      `packages/plugin-manager/src/**`, `packages/plugin-manager/test/**`
      Approach: install/update/uninstall walk `manifest.contributes` and `defaultConfig` inside the same guarded path that wraps other failures, and `resolve-contributions.ts` uses a loop instead of `ids.push(...Object.keys(blocks))` so 130,000+ ids neither overflow the stack nor escape raw (m1); a `__proto__` property in a `configSchema` is rejected with `UnsupportedSchemaKeywordError` (m3); when `registerDisposer` throws, the error names the configured plugins instead of an empty name (m4); a concurrent second `dispose()` shares the first promise and sees the same `PluginDestroyError` (m5); tests for each, including a real 130,000-id manifest through `InstallPlugin` and a throwing 2nd read of a `contributes` getter (m6)
      (Req: plugin-manager:plugin-errors, specd-plugin-type, register-plugins-use-case)
- [x] 19.2 Skills and agent plugins: `_partial-sdk-agents.md` findings 1-4 and T1-T3
      `packages/skills/**`, `packages/plugin-agent-*/**`
      Approach: `resolveSharedFolder` rejects an empty path, `.`, `./`, `\` and anything resolving to the project root with `InvalidSharedFolderError`, accepts `..foo` as a name, and returns a relative path for an absolute path inside the root; a `.owners.json` that is a symlink is treated as an invalid marker and replaced by a regular file without following the link (unlink then write); `removeSharedFolderIfEmpty` also swallows `ENOTDIR`; tests for all of them (T6) plus T1 `skipped: []` on agents-only filtered uninstall in claude, copilot and codex, T2 legacy flat `<skill>.md` removal in a filtered uninstall, T3 `__proto__`, `constructor` and non-string names in `selectManagedNames` (non-string names are skipped as invalid, never thrown)
      (Req: skills:shared-folder-owners, plugin-agent-\*:plugin-agent)
- [x] 19.3 CLI: `_partial-cli.md` M1, M2, M9, M10, M13 and the init tests of M4
      `packages/cli/src/**`, `packages/cli/test/**`
      Approach: `plugins uninstall` of a declared plugin that fails to load for ANY reason (use `LoadPlugin` first; a hook failure is separate) removes the declaration and reports `uninstalled` with `plugin failed to load (<reason>); only the declaration was removed` (the missing-package detail stays `package not found; only the declaration was removed`), with a real-plugin test using an invalid `specd-plugin.json`; `plugins update X X` updates once and reports the repeat `skipped`/`already processed`; the host-context test accepts `plugins` undefined or `true` and rejects `false`; `plugins list` text prints the header whenever a plugin is declared (test with every row `not_found`); init tests assert the `.specd/config/tmp/.gitignore` contents, the changes/drafts/discarded/archive and metadata directories and a real `--force` re-run
      (Req: cli:plugins-uninstall, plugins-update, plugins-list, project-init, host-context)
- [x] 19.4 Core and docs: `_partial-core-config.md` T1-T4, D1
      `packages/core/test/**`, `docs/**`
      Approach: T1 the mismatching-version test uses `configVersion: 1` over an absent root; T2 duplicate in an extending layer with nothing inherited asserts the message; T3 `removePlugin` no-rewrite proven by mtime or a write spy, not only bytes; T4 `withExecutableBuiltins` keeps the bound-coordinate set and built-in id set; D1 `docs/guide/plugins.md` and `docs/guide/configuration.md` say `configVersion` may be absent and accept any positive integer up to the current version (2)
      (Req: core:config, core:config-loader, core:config-writer-port, core:check-registry)
- [x] 19.5 Full verification
      repository root
      Approach: `pnpm build && pnpm typecheck && pnpm test`, lint, then complete the verification
      (Req: all)

## 20. Closing round (verification-attempt-9)

- [x] 20.1 Reinforcing tests for the scoped audit minors
      `packages/plugin-manager/test/**`, `packages/skills/test/**`, `packages/cli/test/**`
      Approach: the 130,000-id manifest also through `UpdatePlugin` and `UninstallPlugin`; a throwing `defaultConfig` getter through `InstallPlugin` (typed `PluginValidationError`, `['load']`); the `registerDisposer` failure test also asserts the rollback destroyed the already initialized plugins; a dangling (broken) symlink `.owners.json` is replaced on add; the `project init --force` re-run test re-asserts `.specd/config/tmp/.gitignore` and that the metadata `.gitignore` entry is not duplicated; the missing-package uninstall path runs once with the REAL loader against a declared plugin whose package does not exist
      (Req: plugin-manager:plugin-errors, register-plugins-use-case, skills:shared-folder-owners, cli:project-init, cli:plugins-uninstall)
- [x] 20.2 Close the change
      repository root
      Approach: full build, typecheck and tests, then complete the verification
      (Req: all)

## 21. Known minors of attempt 8 (fixed at the user's request)

Source: `specd-sdd/changes/20261029-143702-plugin-architecture/reports/20261106-182751/_partial-<batch>.md`. Items left out on purpose: the `operation` default-binding scope of `check-registry` (pre-existing), hooks without timeout, and inputs that violate the TypeScript contract.

- [x] 21.1 Core, SDK, plugin-manager and copilot minors
      `packages/core/**`, `packages/sdk/**`, `packages/plugin-manager/test/**`, `packages/plugin-agent-copilot/src/**`
      Approach: export `AddPluginOptions`, `ConfigDeclaredPlugin` and `ConfigWriter` types from core `public.ts` and re-export them from the SDK with a test (O2); the `config show --help` test also checks documented types and optionality against `SpecdConfig` (T5, cli test); `removePlugin`/`listPlugins` tolerate a file with an unsupported `configVersion` and no `plugins` key while `addPlugin` rejects it, tested (O1, spec now says so); a runtime-level negative drift test for the plugin-repository-port conformance (m7); split the multi-scenario `it` blocks of `plugin-loader.spec.ts` (m8); remove the conditional with identical branches in copilot `uninstall-skills.ts`
      (Req: core:config-writer-port, sdk:composition, plugin-manager:plugin-repository-port)
- [x] 21.2 CLI minors
      `packages/cli/src/**`, `packages/cli/test/**`
      Approach: harden M5 (a failed open registers nothing; the `onLog` test is not a tautology; dispose-twice releases once through the CLI, not only the sdk), M7 (`plugins show` capabilities for a hook-only and an install-only plugin), M8 (the uninstall non-agent and missing-package tests use the real use case and loader instead of a mocked `PluginNotFoundError`), M11 (project-update with no plugins and missing config through discovery from the working directory in a temp dir), M12 (the cleanup registry flattens nested `AggregateError`s recursively, tested)
      (Req: cli:host-context, plugins-show, plugins-uninstall, project-update)
- [x] 21.3 Agent plugin minors
      `packages/plugin-agent-*/test/**`, `packages/skills/test/**`
      Approach: T4 Claude type-level scenarios get a runtime assertion (supported keys of the value collection, unsupported metadata stays out); T5 the journal-resumability check uses the real fast-track template through the real pipeline, not a mocked bundle string; opencode test that injection leaves no legacy marker without relying on an observable `removeSpecdBlock` order
      (Req: plugin-agent-claude, plugin-agent-opencode)
- [x] 21.4 Close the change
      repository root
      Approach: full build, typecheck, tests and hooks
      (Req: all)

## 22. Minors of attempt 10 (fixed at the user's request)

- [x] 22.1 Spec: `sdk:host-context` (+ verify) states that the builder preserves `additionalDestinations`; `sdk:composition` barrel lists `ConfigWriter`, `AddPluginOptions`, `ConfigDeclaredPlugin`, `LegacyConfigFormatError`, `UnsupportedConfigVersionError`
- [x] 22.2 Tests: core kernel-builder test disposes its kernel; CLI real-host test disposes a real kernel twice
- [x] 22.3 `describeFailure` reports the message of an empty `AggregateError`, with a test
