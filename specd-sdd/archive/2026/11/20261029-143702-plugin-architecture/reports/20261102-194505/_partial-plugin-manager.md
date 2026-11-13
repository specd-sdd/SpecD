# Partial compliance report: batch plugin-manager (change plugin-architecture)

Scope: plugin-manager:{specd-plugin-type, plugin-loader, register-plugins-use-case, install-plugin-use-case, uninstall-plugin-use-case, update-plugin-use-case, list-plugins-use-case, agent-plugin-type, load-plugin-use-case, plugin-errors, plugin-repository-port}, sdk:composition (plugin-related parts), sdk:host-context.
Method: merged spec previews vs code in packages/plugin-manager and packages/sdk; plugin-manager test suite run (14 files, 71 tests, all pass). Test coverage judged from test titles and spot reads, not exhaustive reads of every assertion.

Severity: CRITICAL = behaviour contradicts a MUST with user-visible impact; MAJOR = spec/code contract mismatch needing a decision; MINOR = drift, naming, wording, small gaps.

---

## 1. plugin-manager:specd-plugin-type

### Requirements Summary

SpecdPlugin interface (no type/configSchema); PluginContext (config + pluginConfig only); isSpecdPlugin guard; manifest schemaVersion 2 (no pluginType); plugin name regex; contribution id/address; configSchema subset; ContributionKindHandler open registry; lifecycles (install never calls init).

### Implementation Status

- SpecdPlugin interface: implemented (domain/types/specd-plugin.ts). No `type`/`configSchema`.
- PluginContext: implemented, config only.
- isSpecdPlugin: implemented (name regex via core `isPluginName`, hooks optional-function checks).
- Manifest: implemented in loader `manifestSchema` (.strict(), literal 2, rejects pluginType). `contributes` map-of-maps via `z.record(z.record(z.unknown()))`.
- Plugin name / contribution id regex: implemented (core PLUGIN_NAME_REGEX; CONTRIBUTION_ID_REGEX).
- Address build/parse: implemented (`buildContributionAddress`, `parseContributionAddress`).
- configSchema subset: partial (see D3).
- Kind handler: implemented (`ContributionKindHandler`, `activate?` optional; unknown kind -> UnknownContributionKindError in loader).
- Lifecycles: implemented (loader/install/list/load never call init; register calls init in order).

### Discrepancies

- D1 [MINOR] `PluginInstallContext` in the spec has only `config` and `contributions`; code adds `options?: object`, and install-plugin-use-case spec says the context carries `options`. Spec-internal inconsistency; spec specd-plugin-type is the one to fix (code is right per install spec).
- D2 [MINOR] Spec says install "receives the selected contribution ids"; code (`installContextContributions`) filters to agents-kind ids only when manifest declares `agents`. A mixed plugin (agents + other kind) never sees its non-agent ids in `install`. Spec for install-plugin-use-case describes this only for agents plugins. Either spec should state the filtering generally, or code should not filter for mixed plugins.
- D3 [MINOR] `configSchema` is parsed as `z.unknown()` and checked by a hand-written walker (`assertSupportedConfigSchema`). The walker rejects unsupported keywords and non-object root, but does not validate node shape: unknown `type` values (e.g. `"null"`), non-array `required`, non-boolean `additionalProperties`, `items` arrays are accepted silently and degrade to `z.unknown()`. Spec (plugin-loader) shows a Zod `PluginConfigSchemaSubset`. Code wrong (weaker validation) or spec wrong (shape not mandated).
- D4 [MINOR] `parseContributionAddress` throws `PluginValidationError(['address'])` when the plugin part is valid but the id is bad, and `InvalidContributionAddressError` otherwise. Inconsistent typed errors; `InvalidContributionAddressError` is not documented in plugin-errors spec (spec silent).
- D5 [MINOR] `buildContributionAddress` performs no validation of name or id.

### Test Coverage

Covered: has required props / optional hooks accepted / non-function install rejected / unscoped name (is-specd-plugin.spec, specd-plugin.spec); address format and 0/2 dots (specd-plugin.spec); config schema keywords/defaults/no-schema config (plugin-config-schema.spec); unknown kind and duplicate id and unsupported keyword (plugin-loader.spec); install-time-only kind (agents-handler.spec: no activate; register spec "agents-only init still runs").

### Missing Tests

- "Name and version sourced from manifest" (factory-level; only loader cross-check exists).
- "pluginType rejected" and "schemaVersion 1 rejected" at manifest level: loader test "bad manifest shape" is a bundled test, per-scenario assertions not confirmed.
- "contributes.checks is an array rejected".
- "Dot in scope or package rejected", "Uppercase rejected" name scenarios (not seen explicitly).
- "Id containing a dot rejected" unit test.
- "Install does not call init" for install is partially covered (install-plugin.spec).

---

## 2. plugin-manager:plugin-loader

### Requirements Summary

Load workflow (resolve, read manifest, validate before import, validate blocks with handlers, import, create(), isSpecdPlugin, name/version cross-check); strict manifest schema; typed errors naming plugin; factory `create(options)`; loader never calls lifecycle; `handlers` option, built-in agents handler, duplicate kind is PluginValidationError, `validatePlugin(plugin, manifest)`.

### Implementation Status

- Workflow steps 1-9: implemented in `RuntimePluginLoader.load` (manifest validated before dynamic import; verified in code order and by test "package is not imported").
- Manifest schema: implemented, `.strict()`, minCoreVersion default `*`.
- Error mapping: implemented (PluginValidationError / Duplicate / UnknownKind / UnsupportedKeyword / InvalidPluginConfig).
- Factory: partial (see D3 below).
- Options/handlers: partial (D1, D2).
- No lifecycle calls: implemented.

### Discrepancies

- D1 [MAJOR] Duplicate handler kind (including host handler for `agents`): spec says `PluginValidationError`; code throws `DuplicateHandlerKindError` (new class, extends SpecdError, no pluginName; not defined in plugin-errors spec). Code wrong (use PluginValidationError) or spec wrong (add the class to plugin-errors). Note it is thrown at `createPluginLoader` / `registerPlugins` time, not at load.
- D2 [MINOR] `validatePlugin` signature: spec `(plugin, manifest)`; code `(plugin, pluginName)`. Spec wrong or code wrong; code form is less capable (handler cannot inspect manifest).
- D3 [MINOR] `create` export resolution: spec "default or named export". Code finds named `create` or `default.create` (object). A module that does `export default create` (default is the function itself) is rejected with PluginValidationError(['create']). Likely code gap.
- D4 [MINOR] Spec is internally inconsistent: Load workflow says `PluginLoaderOptions` carries `config` and optional `handlers`; "Factory function" shows `PluginLoaderOptions { config }` only and says the factory is passed it. Code: factory receives only `{ config }` (not handlers) which matches the Factory requirement; `PluginLoaderOptions` (loader factory options) has handlers. Spec conflates the loader-factory options with the plugin `create()` options.
- D5 [MINOR] Spec says resolve via `import.meta.resolve()` or `require.resolve()`; code uses `createRequire` resolvers (project root then loader package). Acceptable; spec wording only.
- D6 [MINOR] Base-contract failure always reports fields `['name','version','init','destroy']` regardless of what actually failed.

### Test Coverage

Covered: package not found; missing version; loads with version; invalid manifest not imported; unscoped name; duplicate id; unknown kind / invalid block / bad schema / bad default (bundled test); runtime mismatch / missing contribution accessor (bundled); init not called; default-exported create; base contract break.

### Missing Tests

- pluginType rejected (explicit).
- DuplicateHandlerKindError / host `agents` handler override (only tested in register-plugins.spec for two handlers of one kind).
- `validatePlugin` hook (agents handler requiring install/uninstall) at loader level.
- Version-mismatch vs name-mismatch individually (bundled, not confirmed).
- `export default create` function form.

---

## 3. plugin-manager:register-plugins-use-case

### Requirements Summary

`registerPlugins(builder, config, {handlers, loader?})` returns `{dispose}`; validate all before any init; init in list order with `{config, pluginConfig}`; dispatch selected contributions to kind handlers with `activate`; exactly one named disposer; allowlist/config validation errors; destroy in reverse with error isolation and aggregation, idempotent; failure policy with rollback not masking the original error; bypass for empty list.

### Implementation Status

- Signature / return / no-op for empty: implemented (application/use-cases/register-plugins.ts, infrastructure/loader/register-plugins.ts supplies default loader).
- Order (validate all, then init in order, then activate, then one disposer `specd-plugins`): implemented.
- Selection & config validation: implemented (`resolveContributions`, `resolvePluginConfig`, duplicate name -> PluginValidationError before loading).
- Destroy / isolation / idempotent / AggregateError: implemented.
- Failure policy: implemented; rollback errors attached as `rollbackErrors` property, original error propagates; no disposer kept.
- Bypass (`plugins:false`): implemented in SDK, not in this function (as spec says).

### Discrepancies

- D1 [MINOR] A `SpecdError` thrown by `init` is rethrown as-is instead of being wrapped in `PluginInitError` (spec: `PluginInitError` for a throwing `init`; PluginInitError doc comment in code says "not already a SpecdError"). Spec wrong (add exception, consistent with install/uninstall) or code wrong. Same for `activate` failures: wrapped in PluginInitError though spec is silent on activation failures.
- D2 [MINOR] Exported option types diverge: application `RegisterPluginsOptions` has `loader` required and `handlers` optional; spec has `handlers` required and `loader?` optional. The public `registerPlugins` accepts `RegisterPluginsInput` (both optional, default `{}`), but that interface is not re-exported by name from the package index; `RegisterPluginsOptions` (the exported name) does not describe the actual public function signature.
- D3 [MINOR] `mergeHandlers` is duplicated in loader and register use case (duplicate-kind detection happens twice; handler list is built twice).
- D4 [MINOR] Rollback mid-flow: `rollback` marks `disposed = true`; if `builder.registerDisposer` throws, plugins are destroyed and the error propagates (good). But `dispose()` after a failed registration is a silent no-op; acceptable.
- D5 [MINOR] With `entries.length === 0` returns before validating anything; consistent with spec.
- D6 [MINOR] Spec says "Load and validate every plugin before running any `init`": `loader.load()` imports plugin code and runs `create()` for plugin N before plugin N+1's manifest is validated. Plugin code of earlier plugins therefore executes (factory only, no init) before a later invalid plugin fails. Matches "no init", but spec Constraint wording ("plugin code is imported only after its manifest is validated") only covers per-plugin ordering.

### Test Coverage

Covered: empty list; init order + one disposer + reverse destroy; failing init rollback; invalid allowlist; config without schema; defaults applied; handler gets only selected; duplicate declaration; load failure; destroy aggregation + idempotency; agents-only plugin init; later-plugin invalid config prevents all inits; rollback destroy failure does not mask init error; duplicate handler kinds; schema violation.

### Missing Tests

- "Called before build" ordering against a real KernelBuilder (only SDK mock-level check).
- "Registration handle disposes plugins before any kernel exists" explicit (dispose handle used? partially in destroy tests).
- "Plugins disabled" bypass (SDK-level only).
- `SpecdError` thrown by init (undocumented behaviour).
- activate-failure rollback.

---

## 4. plugin-manager:install-plugin-use-case

### Requirements Summary

Input/Output shapes; behaviour 1-5 (load via loader, resolve ids, isAgentPlugin check when manifest declares agents, call install hook with context, return selected ids + defaultConfig; no init/destroy); error mapping incl. wrapping non-SpecdError with `cause`; Agent Initialization Phase delegated to agent plugins (skills prompt, ref-counted AGENTS.md block).

### Implementation Status

- Input/Output: implemented (InstallPluginOutput has contributions, defaultConfig, data).
- Behaviour: implemented. Context contributions filtered to agents ids when agents declared; options forwarded only when defined.
- Errors: implemented (PluginNotFoundError from loader, PluginValidationError with cause, SpecdError propagates).
- Agent Initialization Phase: delegated to plugin-agent-_ packages; not in plugin-manager. Not audited here (plugin-agent-_ tests install-skills.spec exist in codex/opencode/standard and others).

### Discrepancies

- D1 [MINOR] Output `contributions` returns the unfiltered selection while the hook receives the agents-only subset (see specd-plugin-type D2).
- D2 [MINOR] Agent Initialization Phase requirement and its verify scenarios (CLAUDE.md block, hook asset write, AGENTS.md reference counting) are plugin-agent behaviours placed inside the plugin-manager spec; plugin-manager unit tests cannot cover them. Spec placement issue.
- D3 [MINOR] Spec Dependencies omit `plugin-manager:agent-plugin-type` and `plugin-errors`, though behaviour 3 and errors depend on them.

### Test Coverage

Covered: agent install selected contributions; agents without hooks throws; plugin without hooks (no init); defaultConfig returned; unknown contribution; mixed kinds -> only agent ids; wrapped error with cause; SpecdError rethrown.

### Missing Tests

- Plugin not found (PluginNotFoundError) in install use case.
- "All contributions selected by default" / "Allowlist respected" explicit (may be inside first test).
- Agent init-phase scenarios (belong to plugin-agent tests; not verified in this batch).

---

## 5. plugin-manager:uninstall-plugin-use-case

### Requirements Summary

Same resolution and agents check as install; calls `uninstall` hook with PluginInstallContext; returns void; wrapping of hook errors; never init/destroy.

### Implementation Status

Implemented (uninstall-plugin.ts), mirrors install.

### Discrepancies

- D1 [MINOR] Spec Dependencies omit plugin-errors/agent-plugin-type (same as install).
- No other discrepancies.

### Test Coverage

Covered: successful uninstall with selected ids; wrapped plain error; SpecdError rethrown.

### Missing Tests

- Unknown contribution id (UnknownContributionError).
- Agents declaration without uninstall -> PluginValidationError.
- Plugin without `uninstall` hook completes.
- Non-agent plugin calls uninstall with selected ids ("Not tied to agents bucket").
- `init` not called.
- PluginNotFoundError.

---

## 6. plugin-manager:update-plugin-use-case

### Requirements Summary

Idempotent reinstall; no config mutation; selection preserved; id no longer declared throws UnknownContributionError; agents check; error wrapping.

### Implementation Status

Implemented (update-plugin.ts). Output has no `defaultConfig` as spec states.

### Discrepancies

- D1 [MINOR] Spec text "when `contributions` is omitted for a plugin with an allowlist in specd.yaml, the CLI passes that allowlist": enforced only in CLI, not in the use case (omitted -> all declared). Verify in CLI audit (outside this batch); use case behaviour matches the stated contract.
- D2 [MINOR] Idempotency is not enforced by the use case beyond delegating to plugin install (by design).

### Test Coverage

Covered: reinstall selected without writing config; no-longer-declared id throws; wrapped error.

### Missing Tests

- Agents declaration without install/uninstall rejected.
- SpecdError propagates unchanged.
- Idempotency scenario (execute twice -> same result).
- Output-shape scenario.

---

## 7. plugin-manager:list-plugins-use-case

### Requirements Summary

Per-name load attempt; `loaded` with manifest and declared ids, `not_found`, `error` with message; no lifecycle calls; continues past failures.

### Implementation Status

Implemented (list-plugins.ts). `not_found` iff `PluginNotFoundError`; other errors -> `error`.

### Discrepancies

- D1 [MINOR] Spec input `pluginNames: string[]` vs code `readonly string[]` (compatible).
- D2 [MINOR] Output items declared as `Array<...>` in spec, `readonly PluginListStatus[]` in code (compatible).

### Test Coverage

Covered: valid + invalid plugin both reported; missing -> not_found and listing continues.

### Missing Tests

- Loaded entry `contributions` equals `['a','b']`.
- Load failure (non-manifest) -> `error` with message (partly the invalid case).

---

## 8. plugin-manager:agent-plugin-type

### Requirements Summary

AgentPlugin requires install/uninstall; AgentInstallContext; `agents` kind handler (blockSchema map id -> strict object, no activate); AgentInstallOptions (skills, agents, variables, capabilities); AgentInstallResult; install fallback to shared dir (plugin behaviour); `isAgentPlugin` guard.

### Implementation Status

- AgentPlugin / AgentInstallContext / Options / Result / TemplateVariable: implemented (domain/types/agent-plugin.ts).
- Handler: implemented (`agentsContributionHandler`, strict `{}` blocks, no activate, `validatePlugin` enforces isAgentPlugin).
- isAgentPlugin: implemented.
- Agent installation and fallback / capabilities: plugin-agent-\* concern; not in plugin-manager.

### Discrepancies

- D1 [MINOR] Spec says "The handler is registered by hosts"; code registers it automatically in loader and `registerPlugins` (always first). Spec wording vs code; code behaviour matches plugin-loader spec ("loader always registers the built-in agents handler").
- D2 [MINOR] `blockSchema` requires id keys to match CONTRIBUTION_ID_REGEX; spec says "map from contribution id to an object" (consistent). Invalid id produces PluginValidationError via Zod issue path.
- D3 [MINOR] Spec options use mutable `string[]`/`Record`; code uses readonly (compatible).
- D4 [MINOR] The type guard `isAgentPlugin(value: SpecdPlugin)` matches spec.

### Test Coverage

Covered: agents block `{}` accepted, unknown field rejected, no activate (agents-handler.spec); isAgentPlugin true/false cases; recursive variables typing.

### Missing Tests

- "Selected contributions are passed" (`context.contributions === ['claude']`) at use-case level (install-plugin covers mixed-kind filter).
- "No runtime activation": registerPlugins for agents plugin does not call builder (partially in register spec).
- Capability/frontmatter/sharedFolder/fallback scenarios: not testable in plugin-manager; belong to plugin-agent-\* tests (not audited here).

---

## 9. plugin-manager:load-plugin-use-case

### Requirements Summary

Input `{pluginName}`; output `{plugin, manifest}`; loader errors thrown; validate base contract; no lifecycle calls.

### Implementation Status

Implemented (load-plugin.ts): thin delegation. Base-contract validation happens inside the loader (isSpecdPlugin).

### Discrepancies

- D1 [MINOR] Spec section says "Discriminated union" but defines a single object type; wording stale.
- D2 [MINOR] Behaviour step 2 ("validate base contract") is not performed in the use case itself; relies on loader. Equivalent outcome.

### Test Coverage

Covered: returns plugin+manifest; PluginNotFoundError propagates.

### Missing Tests

- "No lifecycle calls".
- Loads via PluginLoader (implicit).

---

## 10. plugin-manager:plugin-errors

### Requirements Summary

PluginNotFoundError(pluginName), PluginValidationError(pluginName, fields), Duplicate/UnknownContribution/UnknownContributionKind/InvalidPluginConfig/UnsupportedSchemaKeyword/PluginInitError with codes, plugin name in message, `cause` on init error.

### Implementation Status

All classes implemented with codes DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD, PLUGIN_INIT_FAILED; PluginValidationError code PLUGIN_VALIDATION_ERROR; PluginNotFoundError PLUGIN_NOT_FOUND.

### Discrepancies

- D1 [MINOR] Undocumented additional errors: `DuplicateHandlerKindError` (DUPLICATE_HANDLER_KIND) and `InvalidContributionAddressError` (INVALID_CONTRIBUTION_ADDRESS) exist and are exported; neither is in plugin-errors (see plugin-loader D1, specd-plugin-type D4).
- D2 [MINOR] `UnsupportedSchemaKeywordError` is thrown with keyword `'configSchema'` or `'type'` for a non-object schema node/root, which does not name a real keyword.
- D3 [MINOR] `PluginValidationError.fields` is `readonly string[]` (spec `string[]`); `PluginValidationError` accepts optional `cause` (spec silent; needed by install/uninstall wrapping).
- D4 [MINOR] Spec says "Every error ... MUST name the plugin" in message; `DuplicateHandlerKindError` has no plugin (host wiring error, justified).

### Test Coverage

Covered: single bundled test for codes and pluginName (errors.spec).

### Missing Tests

- Message contains plugin name per class (bundled; not confirmed).
- PluginInitError keeps `cause` (exercised indirectly via register spec).

---

## 11. plugin-manager:plugin-repository-port

### Requirements Summary

Port `PluginRepositoryPort` with `addPlugin(name, options?)`, `removePlugin(name)`, `listPlugins()`; `DeclaredPlugin`; "CLI implements via ConfigWriter, satisfying the port structurally".

### Implementation Status

Partial. Port exists as `PluginRepository` (application/ports/plugin-repository.ts, exported). Not used by any code in the workspace (no importer found outside plugin-manager).

### Discrepancies

- D1 [MAJOR] Contradiction with `core:config-writer` (code in packages/core/src/application/ports/config-writer.ts): `ConfigWriter.addPlugin(configPath, name, options?)`, `removePlugin(configPath, name)`, `listPlugins(configPath)` all take `configPath` first. The spec claims ConfigWriter "satisfies the port structurally" and that the CLI "does not implement this port with a separate adapter"; with those signatures it does not. Either the spec is wrong (port should carry configPath or be bound to a path) or the port should be removed as dead code. The verify scenario "CLI implementation uses ConfigWriter ... delegate" cannot hold as written.
- D2 [MINOR] Name drift: spec `PluginRepositoryPort`, code `PluginRepository`; `AddPluginOptions` exists in code though spec inlines the options type; `listPlugins` returns `readonly DeclaredPlugin[]`.
- D3 [MINOR] `DeclaredPlugin` duplicates `ConfigDeclaredPlugin` from core (different readonly modifiers).

### Test Coverage

None (type-only port; no tests).

### Missing Tests

- Type-level conformance test of ConfigWriter against the port (would have exposed D1).

---

## 12. sdk:composition (plugin-related parts)

### Requirements Summary

Package dependencies limited to core, code-graph, plugin-manager (no cli/mcp/plugin-agent-\*); acyclic edge; barrel exports `ContributionKindHandler` and `ContributionActivationContext`; `SdkContextOptions`; `./ports`, `./extensions` subpaths. (Other composition requirements - graph exports, implementation review - are outside this batch.)

### Implementation Status

- Dependencies: implemented (sdk/package.json: core, code-graph, plugin-manager). plugin-manager depends on core and zod only: acyclic.
- Handler types re-exported from `@specd/plugin-manager` as types (src/index.ts). `SdkContextOptions` exported.
- `./ports` and `./extensions` subpaths: implemented (`export * from '@specd/core/...'`), exports in package.json point to dist builds.

### Discrepancies

- D1 [MINOR] Spec dependency list mentions `plugin-manager:register-plugins-use-case` only; SDK also relies on plugin-manager error exports for hosts (PluginInitError etc. are not re-exported by SDK). Hosts (CLI) importing plugin errors need `@specd/plugin-manager` or SDK re-export; spec silent. Spec gap.
- D2 [MINOR] `src/index.ts` uses `export * from './core-reexports.js'` (explicit list inside that file); spec forbids only `export * from '@specd/core'`. Compliant.

### Test Coverage

barrel.spec.ts, composition.spec.ts (type-level `SdkContextOptions` with plugins/pluginHandlers), package-boundary.spec.ts.

### Missing Tests

- Barrel test for `ContributionKindHandler` / `ContributionActivationContext` (type-only; compile-time only).
- Dependency scenario: `plugin-manager` does not depend on `sdk` (package-boundary.spec may cover; not confirmed).

---

## 13. sdk:host-context

### Requirements Summary

`createSdkContext`: create builder, `registerPlugins` unless `plugins === false` (handlers = plugin-manager owned + `pluginHandlers`), build, return context where `dispose` delegates to `kernel.dispose()`; plugin failure fails context with typed error and no kernel; `openSpecdHost` delegates; host disposal semantics; no config mutation.

### Implementation Status

- createSdkContext: implemented (sdk/src/composition/host-context.ts). Registration before build; `plugins:false` skips; handlers forwarded; `dispose` = `kernel.dispose()`; `[Symbol.asyncDispose]` same function.
- openSpecdHost: implemented; forwards `input.options` to createSdkContext.
- Config boundary: implemented (no write members).
- Registration failure: `registerPlugins` rolls back itself and rejects; no kernel created.

### Discrepancies

- D1 [MINOR] When `builder.build()` rejects, code calls `registration?.dispose()` before rethrowing; if that dispose throws (AggregateError of destroy failures) it replaces the build error. The register spec's "rollback must not mask the original error" principle is not applied here. Code wrong (wrap dispose in try/catch) or spec silent.
- D2 [MINOR] If the kernel builder itself runs registered disposers on a failed `build()`, plugins are destroyed twice (idempotent, so harmless). Not verified in core kernel-builder.
- D3 [MINOR] Spec says `dispose` "delegates to `kernel.dispose()`"; code is `() => kernel.dispose()` (new closure per call but returns the kernel's shared promise); consistent.
- D4 [MINOR] Link paths in spec (`../../../../specs/core/kernel/spec.md`) look malformed relative references (documentation only).

### Test Coverage

Covered (tests use a mocked `@specd/plugin-manager`): config sharing; plugins:false skips; handlers forwarded and dispose called when build fails; options forwarding; fresh provider each call; warnings; discovery/forced/startDir/mixed inputs; bootstrap fallback; shape and no-write members; dispose delegation, repeated-call promise, `await using`, spread in openSpecdHost, providers not closed, no foreign-kernel API.

### Missing Tests

- Scenarios "Plugins registered before build" (order assertion at L60-65 exists), "Plugins enabled by default", "Broken plugin fails context creation" (PluginInitError, rollback) and "dispose destroys plugins in reverse order" are only checked against mocks, never end-to-end with real plugin-manager + kernel builder. No integration test exists.
- Build-failure plus dispose-throws case.

---

## Summary counts (this batch)

| Severity | Count | Items                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 0     | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| MAJOR    | 2     | plugin-repository-port D1 (port vs ConfigWriter signature mismatch, port unused); plugin-loader D1 (duplicate handler kind throws undocumented DuplicateHandlerKindError instead of PluginValidationError)                                                                                                                                                                                                                                                                                      |
| MINOR    | ~45   | mostly spec wording/type drift; notable: init SpecdError not wrapped in PluginInitError (register D1); `export default create` function not supported (loader D3); validatePlugin signature (loader D2); configSchema node shape not validated (specd-plugin-type D3); mixed-kind plugins receive agents-only ids (specd-plugin-type D2); createSdkContext dispose can mask build error (host-context D1); RegisterPluginsOptions exported type differs from spec/public function (register D2) |

Implementation status overall: all requirements of the 11 plugin-manager specs and the plugin parts of the 2 SDK specs are implemented (no MISSING requirements); plugin-repository-port is PARTIAL (name/signature drift, unused). Plugin-manager test suite passes (71 tests). Test gaps concentrate in uninstall/update/load/list use cases, loader-level agents handler/duplicate-handler, and SDK end-to-end plugin lifecycle (mock-only).
