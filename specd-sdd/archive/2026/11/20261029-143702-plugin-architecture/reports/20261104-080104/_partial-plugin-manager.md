# Partial compliance audit: plugin-manager specs (change plugin-architecture)

Scope: packages/plugin-manager (src + test). Specs read via `changes spec-preview` (merged). Read-only audit; unit tests reported green by caller.
Severity scale: HIGH / MEDIUM / LOW / INFO. Neither spec nor code is treated as source of truth.

## Summary table

| Spec                      | Reqs | Reqs implemented | Scenarios | Covered by tests | Partial | Missing tests                                             | Discrepancies |
| ------------------------- | ---- | ---------------- | --------- | ---------------- | ------- | --------------------------------------------------------- | ------------- |
| specd-plugin-type         | 8    | 8                | 36        | 22               | 5       | 9                                                         | 2 LOW, 1 INFO |
| plugin-loader             | 4    | 4                | 31        | 20               | 3       | 8                                                         | 1 LOW, 1 INFO |
| register-plugins-use-case | 6    | 6                | 28        | 18               | 3       | 7                                                         | 1 LOW         |
| install-plugin-use-case   | 5    | 5                | 19        | 10               | 1       | 8 (3 are informative/out of scope)                        | 0             |
| uninstall-plugin-use-case | 4    | 4                | 13        | 9                | 1       | 3                                                         | 0             |
| update-plugin-use-case    | 5    | 5                | 14        | 9                | 1       | 4                                                         | 0             |
| list-plugins-use-case     | 3    | 3                | 7         | 5                | 0       | 2                                                         | 0             |
| agent-plugin-type         | 7    | 7                | 18        | 10               | 2       | 6 (type/contract scenarios, mostly agent-plugin packages) | 0             |
| load-plugin-use-case      | 3    | 3                | 6         | 4                | 0       | 2                                                         | 0             |
| plugin-errors             | 4    | 4                | 10        | 8                | 0       | 2                                                         | 0             |
| plugin-repository-port    | 3    | 3                | 9         | 4                | 1       | 4 (interface-inspection scenarios)                        | 0             |

No HIGH or MEDIUM discrepancies found. All requirements have an implementation. Findings are LOW or INFO plus test-coverage gaps.

Implementation map:

- Domain: packages/plugin-manager/src/domain/types/{specd-plugin,plugin-manifest,agent-plugin,contribution-kind-handler}.ts, services/{plugin-config-schema,merge-handlers,resolve-contributions}.ts, handlers/agents-handler.ts, errors/\*.ts
- Application: src/application/use-cases/{register-plugins,install-plugin,uninstall-plugin,update-plugin,list-plugins,load-plugin}.ts, ports/{plugin-loader,plugin-repository}.ts
- Infrastructure: src/infrastructure/loader/{plugin-loader,register-plugins}.ts
- Public surface: src/index.ts re-exports domain, application, infrastructure. `registerPlugins`, `RegisterPluginsInput`, `createPluginLoader`, `PluginLoaderOptions`, `PluginRegistration` are exported by name. Application-level `registerPlugins` (requires loader) is intentionally not exported; the infra wrapper (loader optional) is the public one. Matches spec.

---

## 1. plugin-manager:specd-plugin-type

Requirements: SpecdPlugin interface; PluginContext; isSpecdPlugin; Plugin manifest; Plugin name; Contribution identity/address; Plugin configuration schema; Contribution kind handler; Plugin lifecycles.

Implementation status: all implemented.

- SpecdPlugin (src/domain/types/specd-plugin.ts): name/version/init/destroy required; install/uninstall/contribution optional; no `type`, no `configSchema`. OK.
- PluginContext {config, pluginConfig} only. OK.
- isSpecdPlugin delegates to `baseContractFields` (name via core `isPluginName`, version string, init/destroy functions, optional hooks functions). OK.
- Manifest (loader.ts `manifestSchema`): `.strict()` with `schemaVersion: z.literal(2)`, so `pluginType` and other schemaVersions are rejected with PluginValidationError. `contributes` is record-of-records so an array under `checks` fails. OK.
- Plugin name: regex lives in core (`PLUGIN_NAME_REGEX`, `isPluginName`), used in manifest, loader, isSpecdPlugin. Not re-verified in core here.
- Address: `buildContributionAddress` / `parseContributionAddress` both throw only InvalidContributionAddressError; CONTRIBUTION_ID_REGEX applied. OK.
- Config schema: `assertSupportedConfigSchema` walks nodes, enforces keyword whitelist, root object, type enum, required array of strings, additionalProperties boolean, items single object; non-object nodes yield `configSchema` (root) / `type` (nested). `resolvePluginConfig` rejects config with no schema. OK.
- Kind handler: `ContributionKindHandler` matches (activate/validatePlugin optional). `mergeHandlers` raises DuplicateHandlerKindError, used by both loader and registerPlugins (shared routine, as required). Unknown kind -> UnknownContributionKindError. OK.
- Lifecycles: install/uninstall use cases never call init; register-plugins calls init in list order. `installContextContributions` implements agents-only filtering. OK.

Discrepancies:

1. LOW: `PluginInstallContext.options` is typed `object` (code) vs `Readonly<Record<string, unknown>>` (spec). The code type is wider; consumers cannot index it without casts. Spec side: arguably should say `object` if agent options (`AgentInstallOptions`, an interface without index signature) must be assignable; `AgentInstallContext.options?: AgentInstallOptions` is only a valid narrowing of `object`, not of `Record<string, unknown>` (interfaces lack implicit index signatures). So code likely deviates deliberately; the spec snippet is probably what needs aligning.
2. LOW: `SpecdPlugin.install?` returns `Promise<unknown>` (code) vs `Promise<void>` (spec). Needed so `AgentPlugin.install` can return `AgentInstallResult` and `InstallPluginOutput.data` can carry it. Spec text for specd-plugin-type should say `Promise<unknown>` (the agent-plugin-type spec already says AgentInstallResult).
3. INFO: Spec states root `type` MUST be object; code additionally requires a `type` on every nested node (a node without `type` is rejected with keyword `type`). Spec lists `type` among keywords but never says it is mandatory per node. Stricter than spec; consistent with the Zod conversion. Consider documenting.

Test coverage (test/domain/{specd-plugin,types/is-specd-plugin,plugin-config-schema,resolve-contributions,errors,agents-handler}.spec.ts, test/infrastructure/plugin-loader.spec.ts, test/application/\*):

- Covered: scoped/unscoped name guard, non-function install, address build/parse failures, supported keywords + defaults, nested non-object/ bad type / bad required / bad additionalProperties / items array (plugin-config-schema.spec), config without schema, unknown kind (loader), pluginType rejected, duplicate handler, duplicate id across kinds, install does not call init, mixed-kind agents-only ids (install), init order.
  Missing tests:
- "Has required properties ... no `type`, no `configSchema` property" (no assertion on absence).
- "Name and version sourced from manifest" (factory-level; belongs to plugin packages, not asserted here).
- "Valid scoped names / Dot in scope or package / Uppercase rejected" for the name regex directly (regex is core; only `my-plugin` unscoped is tested here).
- "contributes must be a map of maps" (array under `checks`), and explicit `schemaVersion: 1` without `pluginType` (existing tests send `schemaVersion: 1` together with `pluginType`, so each cause is not isolated).
- "Non-object schema node rejected" for non-object ROOT with keyword `configSchema` (only nested cases asserted).
- "Handler validatePlugin receives plugin and name" with a custom (non-agents) handler (only agents handler path tested).
- "Install-time-only kind" with a non-agents handler lacking `activate` at registerPlugins.
- "Install context carries options" (no test in install/uninstall/update specs passes `options`; see below).
- "Duplicate id: cross-kind validation" asserts error class in loader test but not that it names the plugin.
  Counts: 36 scenarios; ~22 covered, ~5 partially, ~9 missing.

---

## 2. plugin-manager:plugin-loader

Requirements: Load workflow; Manifest schema; Error handling; Factory function.

Implementation status: all implemented (src/infrastructure/loader/plugin-loader.ts).

- Resolution via `createRequire` from `config.projectRoot/package.json`, then `import.meta.url`; failure -> PluginNotFoundError. OK (derivePackageRoot additionally verifies package.json name equals requested name).
- Manifest validated (strict Zod, config schema subset, contribution blocks, id uniqueness, defaultConfig vs configSchema) BEFORE `import()`. OK.
- Factory resolution: named `create`, default function, default object `{create}`; none -> PluginValidationError(['create']). `await createFunction({ config })` passes config only. OK.
- Runtime validation: base contract fields exact list, name/version cross-check, handler `validatePlugin`, `contribution` required if any kind has `activate`. OK.
- `createPluginLoader` throws DuplicateHandlerKindError at creation via `mergeHandlers`. OK.
- Loader never calls init/install/destroy. OK.

Discrepancies:

1. LOW: Loader does not verify that the manifest `name` equals the requested/resolved package name; only the runtime plugin name is compared to the manifest name. `derivePackageRoot` guarantees package.json name matches, but a package whose `specd-plugin.json` carries a different (valid) name and whose factory returns the same different name would load under the requested name. Spec step 9 only requires runtime == manifest, so strictly compliant; flagged as a gap either side could close.
2. INFO: Manifest Zod schema in code uses `configSchema: z.unknown().optional()` and validates the subset afterwards with `assertSupportedConfigSchema` (spec shows `PluginConfigSchemaSubset.optional()` inline). Behavior equivalent (UnsupportedSchemaKeywordError is thrown rather than a Zod issue, which matches the Error handling requirement).

Test coverage (test/infrastructure/plugin-loader.spec.ts, 19 tests):
Covered: not found, missing version, successful load, manifest invalid -> no import, unscoped name, duplicate id, unknown kind / invalid block / bad schema / bad default (single combined test), runtime mismatch and missing contribution accessor, no lifecycle calls (init not called), bad manifest shape, default-exported `{create}`, `export default create`, base-contract fields list (destroy only), pluginType, host `agents` handler -> DuplicateHandlerKindError, agents without install/uninstall, name mismatch, version mismatch.
Missing tests:

- "No factory export rejected" (field `create`).
- "Async factory awaited" explicitly (tests use sync factories).
- "Factory receives config only" with extra handlers.
- Named `create` export is likely covered by the main load test but not asserted by name.
- "Two host handlers of one kind (widgets) rejected" at loader level (only `agents` case; register spec covers the two-handler case at registerPlugins level).
- "Handler validatePlugin runs after base check / receives (plugin, name)" with a custom handler.
- Combined test (line 174) bundles four scenarios; failures would be hard to attribute (quality note).
- Resolution fallback to loader package location (`import.meta.url`) is untested.
  Counts: 31 scenarios; ~20 covered, ~3 partial, ~8 missing.

---

## 3. plugin-manager:register-plugins-use-case

Requirements: Signature; Registration order; Selection and config validation; Destroy and error isolation; Failure policy; Bypass.

Implementation status: all implemented (application use-case `register-plugins.ts` + infra wrapper `infrastructure/loader/register-plugins.ts`).

- Signature: infra `registerPlugins(builder, config, input = {})`, default loader `createPluginLoader({config, handlers})`; `RegisterPluginsInput` and `PluginRegistration` exported. OK.
- Load+validate (config, allowlist, duplicate names) all before first `init`; init in list order; activation per kind skipping handlers without `activate`; exactly one disposer `specd-plugins`. OK.
- Config: `resolvePluginConfig` applies defaults and rejects config without schema; `resolveContributions` throws UnknownContributionError. Duplicate entry -> PluginValidationError. OK.
- Destroy: reverse order, errors collected, AggregateError thrown after all ran, idempotent via `disposed` flag. OK.
- Failure policy: SpecdError passes unchanged, others wrapped in PluginInitError(cause); activate failures wrapped identically; rollback destroys initialized plugins in reverse, attaches `rollbackErrors` to the original, original always rethrown; no disposer registered on failure; failure of `registerDisposer` also rolls back. OK.
- Bypass/empty list: returns `{dispose: no-op}`, no disposer. OK.

Discrepancies:

1. LOW: With an empty/absent `plugins` list the application-level function returns before `mergeHandlers`, so a duplicate-handler wiring error is not raised when a custom `loader` is supplied and no plugins are configured. Spec: "MUST throw DuplicateHandlerKindError when it is set up, before loading any plugin". Through the public infra wrapper without a custom loader the error is still raised (createPluginLoader merges handlers eagerly). Edge case only.
2. INFO: Failing plugin's own `destroy` is not called when its `init` throws (only previously initialized ones). Consistent with scenarios ("destroy on b then a" when c fails); stated here as intentional.
3. INFO: Manifest `defaultConfig` is not applied at runtime when `config` is absent (only `configSchema` defaults are). Spec assigns defaultConfig persistence to the CLI, so consistent.

Test coverage (test/application/register-plugins.spec.ts, 18 tests, uses a fake builder and fake loader):
Covered: empty list, init order + single disposer + reverse destroy + idempotent dispose, partial init failure, invalid selection before init, config without schema, schema defaults, handler receives selected contributions only, duplicate plugin entry, load failure, aggregated destroy errors, agents-only init, validation before any init, rollback failure not masking, error isolation, duplicate handler kind (agents), schema violation -> InvalidPluginConfigError, SpecdError unchanged, activate failure wraps and rolls back.
Missing tests:

- "Called before build ... using a real KernelBuilder" (only a hand-rolled stub builder; no real `KernelBuilder` integration). MEDIUM-ish test gap, as the spec explicitly asks for a real builder.
- "Input defaults" (call without `input`, default loader and built-in handler): not exercised (every test passes a `loader`).
- Two same-kind host handlers (only `agents` case tested here; loader spec covers neither).
- "rollbackErrors" attached property is not asserted (test asserts original error only, per its title).
- "Dispose before any kernel exists" is covered by dispose calls on `registration`, but not explicitly "no kernel built".
- "Plugins disabled" is SDK-level (out of scope here).
  Counts: 28 scenarios; ~18 covered, ~3 partial, ~7 missing.

---

## 4. plugin-manager:install-plugin-use-case

Implementation status: implemented (install-plugin.ts). Loads via PluginLoader; resolves selection (UnknownContributionError); agents guard via `isAgentPlugin` (PluginValidationError fields ['install','uninstall']); context {config, contributions (agents-only filtering), options only when provided}; no-hook = success; hook errors: SpecdError rethrown, others wrapped in PluginValidationError(name, ['install'], cause); output `contributions` equals hook list; `defaultConfig` from manifest; `data` from hook; init/destroy not called; no config mutation. No discrepancies.

Note: when the manifest declares `agents` and only non-agent ids are selected, `contributions` passed to the hook is `[]` (consistent with spec's filtering rule).

Test coverage (install-plugin.spec.ts, 8 tests): installs selected, agents-without-hooks rejected, no hooks succeed without init, defaultConfig returned, unknown id, mixed kinds, wrapped error with cause, SpecdError unchanged, PluginNotFound propagates.
Missing tests:

- "All contributions selected by default" with `a`,`b` (default selection with 2 ids; covered indirectly at resolve-contributions level).
- "Allowlist respected" at use-case level.
- "Options forwarded only when provided" / `context.options` equals input (no test anywhere passes `options`).
- "Default config returned, not written" (no assertion that no file is written; trivially true since no writer is injected).
- Agent Initialization Phase scenarios (CLAUDE.md block, AGENTS.md shared markers): informative, belong to plugin-agent-\* and skills packages; not testable here.
  Counts: 19 scenarios; ~10 covered, ~1 partial, ~8 missing/out of scope (3 are plugin-agent-level).

---

## 5. plugin-manager:uninstall-plugin-use-case

Implementation status: implemented (uninstall-plugin.ts), mirrors install semantics, returns void. No discrepancies.

Test coverage (uninstall-plugin.spec.ts): selected contributions (agents-only), wrapped failure with cause, SpecdError unchanged, unknown id, agents without contract, no hook resolves without init, PluginNotFound propagates.
Missing tests: options forwarding; explicit "mixed kinds pass only agents ids" (the first test passes `['claude']`, only agents manifest); "not tied to the agents bucket" with a non-agents plugin that HAS an uninstall hook (existing non-agents test has no hook).
Counts: 13 scenarios; ~9 covered, 1 partial, 3 missing.

---

## 6. plugin-manager:update-plugin-use-case

Implementation status: implemented (update-plugin.ts). Same as install minus defaultConfig; output has success/message/contributions/data. No discrepancies. Idempotency delegated to plugin install as spec says.

Test coverage (update-plugin.spec.ts): selection `['claude']`, removed id -> UnknownContributionError, wrapped error with cause, agents without contract, SpecdError unchanged, idempotent twice.
Missing tests: selection preserved with a 2-id plugin (`b` not activated), mixed kinds agents-only, options forwarding, explicit PluginNotFoundError, explicit "no config written" (first test asserts no `defaultConfig` property).
Counts: 14 scenarios; ~9 covered, 1 partial, 4 missing.

---

## 7. plugin-manager:list-plugins-use-case

Implementation status: implemented (list-plugins.ts). Sequential load in input order, `loaded`/`not_found`/`error` mapping, `contributions` from `declaredContributionIds`, one failure does not stop others. `ListPluginsInput.pluginNames` is `readonly string[]` (spec prose says `readonly string[]`; code block says `string[]`; code matches prose). No discrepancies.

Test coverage (list-plugin.spec.ts): valid + invalid listed, not_found + continues, contributions for loaded.
Missing: explicit input-order test (b, a) beyond incidental order; invalid-manifest (unscoped name) entry is simulated with a thrown PluginValidationError rather than a real loader.
Counts: 7 scenarios; 5 covered, 2 missing.

---

## 8. plugin-manager:agent-plugin-type

Implementation status: implemented. `AgentPlugin`, `AgentInstallContext`, `AgentInstallOptions`, `TemplateVariable`, `AgentInstallResult`, `isAgentPlugin` in src/domain/types/agent-plugin.ts; `agentsContributionHandler` (no activate, strict empty-object blockSchema keyed by id regex, validatePlugin via isAgentPlugin) in src/domain/handlers/agents-handler.ts; built in by `mergeHandlers`, so no host wiring. Exported publicly. No discrepancies in plugin-manager.

Observation (INFO): Requirements "Agent installation and fallback" and the capability/frontmatter/sharedFolder rules are runtime obligations of agent plugin packages (plugin-agent-\*) and `@specd/skills`, not of plugin-manager. Not verifiable here; check in those packages' audits.

Spec vs code note (INFO): spec says the agents block is "a map from contribution id to an object ... unknown fields are rejected"; code accepts only `{}` per agent (`z.object({}).strict()`). Consistent today because no per-agent fields exist.

Test coverage: is-agent-plugin.spec.ts (valid, missing install, install+uninstall, recursive options typing), agents-handler.spec.ts (empty block accepted, no activate, unknown field rejected), loader test for agents without install/uninstall, register test for agents-only init.
Missing tests: missing-uninstall variant of isAgentPlugin; "Invalid id key rejected (Bad.Id) -> PluginValidationError" through the loader (the code path exists in validateContributions/blockSchema); "Unknown field rejected" through the loader (only at schema level); "Built-in handler needs no host wiring" through `registerPlugins` with no handlers; capabilities/frontmatter/sharedFolder/agent fallback scenarios (out of package).
Counts: 18 scenarios; ~10 covered, 2 partial, ~6 missing (about 4 belong to plugin-agent-\*/skills).

---

## 9. plugin-manager:load-plugin-use-case

Implementation status: implemented (load-plugin.ts): delegates to loader, returns `{plugin, manifest}`, errors propagate, no lifecycle calls, no duplicate base-contract check. No discrepancies.

Test coverage (load-plugin.spec.ts): returns loaded object, NotFound propagates, no init/destroy on a second run (the init/destroy spies are assigned after the first execute, so the second run is the effective check).
Missing: other typed loader errors (validation errors) propagating, explicit `install` not called.
Counts: 6 scenarios; 4 covered, 2 missing/weak.

---

## 10. plugin-manager:plugin-errors

Implementation status: all classes exist in src/domain/errors with spec codes: PLUGIN_NOT_FOUND, PLUGIN_VALIDATION_ERROR, DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD, PLUGIN_INIT_FAILED, DUPLICATE_HANDLER_KIND, INVALID_CONTRIBUTION_ADDRESS. All extend core `SpecdError`; plugin-named ones carry `pluginName` and name it in the message; `DuplicateHandlerKindError` has `kind`, no pluginName; `PluginValidationError` has `fields` and optional `cause`. `PluginInitError.cause` preserved. Exported via domain index. No discrepancies.

Minor (INFO): `PluginNotFoundError` / `PluginValidationError` declare `code` as `string` getter rather than literal types (spec has no type requirement).

Test coverage (errors.spec.ts): codes, pluginName, cause, messages containing plugin name (for PluginInitError, UnknownContributionError via message assertions, and validation error), DuplicateHandlerKindError code/kind, address error code, validation fields/cause.
Missing tests: `PluginNotFoundError.pluginName`, `PluginValidationError.code`, per-class "message contains plugin name" for all six classes (only some asserted); `DuplicateHandlerKindError` has no `pluginName` property; `UnsupportedSchemaKeywordError` keyword `configSchema` for non-object root (see specd-plugin-type).
Counts: 10 scenarios; 8 covered, 2 missing.

---

## 11. plugin-manager:plugin-repository-port

Implementation status: implemented. `PluginRepositoryPort` in src/application/ports/plugin-repository.ts with `addPlugin(configPath, name, options?: AddPluginOptions)`, `removePlugin(configPath, name)`, `listPlugins(configPath)`; `DeclaredPlugin = ConfigDeclaredPlugin` (alias of core type). Core `AddPluginOptions` in packages/core/src/application/ports/config-writer.ts has `config?` and `contributions?` matching the spec. The old name `PluginRepository` has no remaining references in packages/\*/src. No discrepancies.

Test coverage: test/application/plugin-repository-port.spec.ts has the type-level conformance check `ConfigWriter extends PluginRepositoryPort` assigned to a literal `true`, which fails typecheck on drift (covers "ConfigWriter is assignable" and "Signature drift fails compilation").
Missing tests: "DeclaredPlugin is the core type" (type identity assertion); interface-inspection scenarios (methods present, configPath first, no `type` param) are covered only implicitly by conformance; "CLI implementation uses ConfigWriter" belongs to CLI audit.
Counts: 9 scenarios; 4 covered, 1 partial, 4 missing/out of scope.

---

## Cross-cutting findings (priority order)

1. TEST GAP (most notable): no test anywhere in plugin-manager passes `options` to install/uninstall/update, though three specs (specd-plugin-type "Install context carries options", install "Options forwarded only when provided", uninstall/update options forwarding) have scenarios for it. Implementation is correct (`...(input.options !== undefined ? { options } : {})`).
2. TEST GAP: registerPlugins is only tested with a hand-written builder stub and an always-supplied loader. Spec scenarios "Called before build ... real KernelBuilder" and "Input defaults" are unverified.
3. TEST GAP: loader scenarios "no factory export (field create)", "async factory awaited", "factory receives config only" are untested.
4. LOW spec/code drift: `PluginInstallContext.options` (`object` vs `Readonly<Record<string, unknown>>`) and `SpecdPlugin.install` return type (`Promise<unknown>` vs `Promise<void>`); recommend updating the spec text, since code values are needed for `AgentInstallOptions` and `InstallPluginOutput.data`.
5. LOW: duplicate-handler check is skipped by application-level `registerPlugins` when the plugin list is empty and a custom loader is given.
6. LOW: manifest `name` is not compared to the requested plugin name in the loader.
