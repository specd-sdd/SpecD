# Specs compliance — change plugin-architecture (delegated, attempt verification-attempt-2)

## Summary

| Batch          | Critical | Major | Minor |
| -------------- | -------- | ----- | ----- |
| core           | 0        | 0     | 16    |
| plugin-manager | 0        | 2     | ~45   |
| cli            | 0        | 1     | ~40   |
| agents         | 0        | 8     | 26    |

Static audit; build, typecheck, lint and full test suite pass.

## Detailed Findings

---

# Partial audit (core batch): core:config, core:config-loader, core:config-writer-port, core:check-registry

Change: plugin-architecture. Static read-only review; tests not run. Paths relative to `packages/core` unless noted.
Method: `changes spec-preview` merged content, then code and test inspection. Focus on plugin-related requirements; the rest was sampled.
Note: an earlier `_partial-core.md` covered core + cli specs; this report replaces it for the core batch only. Its tmp-gitignore finding is re-verified below.

---

## core:config

### Requirements Summary (plugin-relevant)

- Cascade identity and removal model: `plugins[]` keyed by `name`. Same-name layer entry replaces in place; new name appends.
- Plugin declarations: flat `plugins: [{ name, config?, contributions? }]`. Zod-validated at load, name unique, no type grouping, no exclude/disable. No plugin loading.
- Config version: optional `configVersion`; `init` writes 2. A newer version raises `UnsupportedConfigVersionError`. A legacy `plugins.agents` raises `LegacyConfigFormatError` before strict validation. A different `configVersion` in an extending layer fails. Both errors extend `ConfigValidationError`.
- Config writer port (summary requirement): `initProject/addPlugin/removePlugin/listPlugins`.
- Sampled: schema plugins, schemaOverrides, llmOptimizedContext, approvals.

### Implementation Status

| Requirement                                                                                                      | Status      | Evidence                                                                               |
| ---------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| Plugin declarations (shape, scoped-name regex, duplicate rejection, `.strict()` entries, `contributions.min(1)`) | implemented | `src/application/ports/config-schema.ts:205-225`, `:292`                               |
| Merge by name (replace in place, append new)                                                                     | implemented | `config-schema.ts:338-370` (`deepMergeRawConfig`, `mergePluginLists`)                  |
| `remove.plugins: [{name}]`                                                                                       | implemented | `src/infrastructure/fs/config-cascade.ts:32`, `:495-506`                               |
| Config version: newer version                                                                                    | implemented | `config-loader.ts:705-708`                                                             |
| Config version: legacy detection runs per layer before strict schema                                             | implemented | `config-loader.ts:700-712`; the snippet contains `configVersion: 2` and the flat list  |
| Config version: root-layer version wins, mismatched extending layer fails                                        | implemented | `config-cascade.ts:518-541`                                                            |
| Error classes extend `ConfigValidationError` with the right codes                                                | implemented | `src/domain/errors/legacy-config-format-error.ts`; exported in `errors/index.ts:17-19` |
| `init` writes `configVersion: 2`                                                                                 | implemented | `src/infrastructure/fs/config-writer.ts:52`                                            |
| Config validation does not load plugins                                                                          | implemented | the loader only maps entries, `config-loader.ts:666-675`                               |

### Discrepancies

- **[MINOR] Scenario "Plugin entry removed by name identity" is under-specified.**
  - The spec says "a later layer removes that inherited plugin entry" without naming the `remove.plugins: [{ name }]` syntax. That syntax appears only in core:config-loader. The code supports it; the config spec text just lacks the syntax.
  - Fix: spec wording, not code.
- **[MINOR] `remove.plugins` on a name absent from the inherited list throws `ConfigValidationError`.**
  - Code: `config-cascade.ts:503`. Test: `config-loader.spec.ts:2303`.
  - The same strict behaviour exists for workspaces, storage and context. Neither config nor config-loader states "not found is an error" for plugins.
  - Option A: the spec should document it. Option B: the code should be lenient.
- **[MINOR] `configVersion` schema accepts any positive int; the "greater than supported" check is in a separate function (`assertCurrentConfigFormat`).**
  - `configVersion: 0` or negative gives a generic schema error. Acceptable and unspecified.
- **[MINOR] Legacy detection only fires when `plugins` is an object with an `agents` key.**
  - Other legacy-object shapes (for example `plugins: { skills: [] }`) fall through to a generic schema error.
  - This matches the spec text exactly. No action beyond awareness.
- **[MINOR] The config spec says `configPath` defaults to `<specdPath>/config`.**
  - The init writer's `.specd/tmp` location conflicts with that (see config-writer-port, discrepancy 1).
- **[MINOR] Duplicate-plugin check is "per layer" for strict validation, but `remove.plugins` accepts duplicates in the removal list.**
  - Unspecified.

### Test Coverage

Covered in `test/infrastructure/fs/config-loader.spec.ts`:

- flat list parse (`:1194`)
- missing name (`:1220`)
- unscoped name (`:1233`)
- duplicate name (`:1245`)
- legacy `plugins.agents` with code, snippet and message (`:1258`)
- newer `configVersion` (`:1283`)
- absent `configVersion` (`:1294`)
- `remove.plugins` strips by name (`:2234`)
- same-name replace in place plus append (`:2259`)
- mismatched `configVersion` in an extending layer (`:2289`)
- `remove.plugins` with an absent name (`:2303`)

### Missing Tests

- "Contributions allowlist accepted" (`contributions: ['audit']`), though `:1194` covers `contributions` in the happy path.
- "Legacy detection precedes schema errors" is implicitly covered by `:1258`; there is no separate assertion that the error is not a generic schema error beyond the `instanceOf` check.
- An extending layer that declares the legacy format (per-layer legacy detection).
- `init writes configVersion` is covered in `config-writer.spec.ts:52`.

---

## core:config-loader

### Requirements Summary (plugin-relevant)

- Before strict validation, check `configVersion` and detect the legacy plugins format per layer.
- Map `plugins` as a flat list, validating the scoped name and rejecting duplicates. `name` is the identity key. Layers replace or append. `remove.plugins` removes. Never load plugins or validate `config`.
- Sampled: YAML parse, default workspace required, path resolution, approvals defaults, env vars, error wrapping.

### Implementation Status

| Requirement                                                                                                                                                                     | Status                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Legacy and version checks before strict schema                                                                                                                                  | implemented (`config-loader.ts:700-712`, called per layer) |
| Flat plugin mapping with config and contributions passthrough                                                                                                                   | implemented (`:666-675`)                                   |
| Name validation and duplicates                                                                                                                                                  | implemented (schema `superRefine`)                         |
| Replace in place, append, `remove.plugins`                                                                                                                                      | implemented (`config-schema.ts`, `config-cascade.ts`)      |
| No plugin loading                                                                                                                                                               | implemented                                                |
| Scenarios "Newer configVersion", "Absent configVersion with current shape", "Unscoped plugin name", "Duplicate plugin name", "Legacy plugins object produces migration message" | implemented and tested (`config-loader.spec.ts:1220-1300`) |

### Discrepancies

- **[MINOR] `plugins` mapping is duplicated in three places.**
  - Locations: `config-schema.ts:mergePluginLists`, `config-cascade.ts:applyRemovals`, and the writer's own `pluginSchema`.
  - The writer's `pluginSchema` is looser than the loader's (see config-writer-port).
- **[MINOR] The `legacyPluginsSnippet` function carries two stacked JSDoc blocks (`config-loader.ts:715-726`).**
  - Doc hygiene only.
  - The test asserts `legacy.suggestedSnippet` contains `instructionsDir`. That means the legacy `config` is carried through verbatim into the snippet; the spec only requires "equivalent plugins list". OK.
- **[MINOR] The loader spec names `remove.plugins: [{ name }]`, but core:config's Cascade section does not.** See core:config, discrepancy 1.

### Test Coverage

Good for all plugin scenarios in the verify file (7 of 7 have a matching test). Sampled non-plugin scenarios (invalid adapter, validation precedes path resolution) have tests (`config-loader.spec.ts` is ~2300+ lines).

### Missing Tests

- Combined legacy plus newer-version layer ordering.
- Env-var override interacting with `plugins` (probably not applicable).

---

## core:config-writer-port

### Requirements Summary

- Interface with four methods. It must be an `interface`, not an abstract class.
- `initProject` creates `specd.yaml` with `configVersion: 2`, creates the tmp `.gitignore` at `{specdPath}/tmp/.gitignore`, the metadata dir, and `.gitignore` entries.
- `addPlugin(configPath, name, {config?, contributions?})`: add to the flat list, never duplicate.
- `removePlugin`: remove by name; an absent name is a no-op.
- `listPlugins`: returns every entry; returns `[]` if the file or key is absent.
- Delivery uses `createConfigWriter()` and must not import `FsConfigWriter`. Optional plugin config stays absent unless the plugin requires it.

### Implementation Status

| Requirement                                    | Status                            | Evidence                                                                              |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| Interface shape and signatures                 | implemented                       | `src/application/ports/config-writer.ts` (`AddPluginOptions`, `ConfigDeclaredPlugin`) |
| `initProject` with `configVersion`             | implemented                       | `config-writer.ts:52`                                                                 |
| Tmp gitignore                                  | implemented at `.specd/tmp`       | `config-writer.ts:72`                                                                 |
| `addPlugin` replace or merge, no duplicate     | implemented                       | `:106-117`, `mergePluginEntry`                                                        |
| `removePlugin`                                 | partial                           | see below                                                                             |
| `listPlugins`                                  | implemented                       | `:139-157`; returns `[]` on missing file or invalid YAML or invalid list              |
| Legacy and invalid `plugins` are not rewritten | implemented, beyond spec          | `requireMutablePlugins`, `assertCurrentConfigFormat`                                  |
| `createConfigWriter` factory                   | not verified here (cli/sdk batch) |                                                                                       |

### Discrepancies

1. **[MINOR, spec/code coherence] Tmp gitignore path.**
   - Spec: init creates `{specdPath}/tmp/.gitignore`, and says repositories create `{configPath}/tmp` lazily.
   - Code: `ensureTmpGitignore(<root>/.specd)`, which matches `{specdPath}` when specdPath is `.specd`. So code matches the spec text.
   - Residual contradiction with core:config and core:config-loader: `configPath` defaults to `<specdPath>/config`, so runtime tmp lives at `.specd/config/tmp`.
   - Option A: spec is right and intentional. Then add a clarifying note. Option B: init should create `{configPath}/tmp`. Impact is low because runtime creates the file lazily.
2. **[MINOR] `removePlugin` when `plugins` is absent writes `plugins: []` into the file.**
   - Code: `doc.set('plugins', plugins)` after the filter (`:128-129`).
   - Spec: "plugins is unchanged" for an absent plugin. Behaviourally the list is equal, but the YAML gains a key and the file is rewritten.
   - Option A: code should skip the write when nothing changed. Option B: spec is satisfied loosely.
3. **[MINOR] `addPlugin` does not validate the plugin name against the scoped-name grammar or the duplicates already in the file.**
   - The writer's `pluginSchema` is `name: z.string()`, while the loader enforces the regex.
   - A bad name can be written, and the loader then rejects it at the next load.
   - Spec does not require validation: "MUST validate only the configuration they require". Awareness only.
4. **[MINOR] Verify scenario "Duplicate plugin updates existing" vs spec requirement "MUST NOT duplicate".**
   - Code merges: a field not given in the second call is preserved.
   - Spec is silent on whether omitted fields are preserved or cleared. Test `config-writer.spec.ts:160` covers the merge.
   - Option A: spec should state "preserve". Option B: code should replace the entry.
   - The doc comment in code says "adds or replaces", which is misleading.
5. **[MINOR] `listPlugins` swallows invalid lists and legacy format by returning `[]`.**
   - Spec: "every entry"; the port's own doc says "or an empty list when the file is missing or invalid". A legacy file lists as empty while `addPlugin` throws.
   - Inconsistent, but spec-compatible.
6. **[MINOR] Spec says `listPlugins` must not be used by delivery when a `SpecdConfig` snapshot exists.**
   - Out of scope for core; check in the cli batch.

### Test Coverage

`test/infrastructure/fs/config-writer.spec.ts` covers:

- add (`:151`)
- update without duplication (`:160`)
- remove (`:181`)
- absent-name no-op (`:192`)
- list on a missing file (`:204`)
- list with the key absent (`:209`)
- preservation of unrelated YAML (`:215`)
- legacy refusal (`:234`)
- empty contributions refusal (`:251`)
- `configVersion` written (`:52`)
- `AlreadyInitialisedError` and force (`:123`, `:129`)
- tmp gitignore under `.specd` (`:264`)
- gitignore entries and metadata (`:84-117`)

### Missing Tests

- `addPlugin` with config plus contributions in one call, verified on disk.
- `listPlugins` returning entries that carry `config` and `contributions`. It is exercised partly through `:160`.
- No test that `removePlugin` on a file with no `plugins` key leaves the file unchanged.
- `createConfigWriter` and the "does not construct `FsConfigWriter`" scenarios (CLI or composition tests).

---

## core:check-registry

### Requirements Summary

- Registry API: `get`, `has`, `list`, `bindings`.
- Built-ins are injected in the constructor and are immutable. No public mutator exists.
- External plugin checks are registered as `${pluginName}.${check.id}`. `pluginName` must match `^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$`. Otherwise `InvalidPluginNameError`.
- Duplicate canonical id gives `DuplicateCheckError`. A non-predicate `kind` gives `InvalidCheckKindError`.
- Binding coordinate uniqueness (transition, archive, step-skip) gives `DuplicateCheckBindingError`.
- Two-tier governance and confinement locks. Cascading config hierarchy.

### Implementation Status

| Requirement                                      | Status                       | Evidence                                                                                     |
| ------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------- |
| Open registry API                                | implemented                  | `check-registry.ts:161-199` (extra `getBindings`, `getGovernance`, `withExecutableBuiltins`) |
| Name grammar through shared `PLUGIN_NAME_REGEX`  | implemented                  | `src/domain/plugin-name.ts`                                                                  |
| Canonical id single leading `@`, spoof isolation | implemented                  | `check-registry.ts:225-248`                                                                  |
| Duplicate and kind checks                        | implemented                  | `:244`, `:249-258`                                                                           |
| Binding duplicates, governance, cascade          | sampled, not deeply verified | tests exist (26 `it`)                                                                        |

### Discrepancies

- **[MINOR] Signature naming.**
  - Spec: `register(pluginName, check, defaultBindings?, options?: PluginCheckRegistration)`.
  - Code: `options?: PluginCheckRegistrationOptions`.
  - In `composition-registries.ts:66` the name `PluginCheckRegistration` is a different interface (a composition-level entry). So the spec's type name collides with a different symbol.
  - Option A: fix the spec to `PluginCheckRegistrationOptions`. Option B: rename the code.
- **[MINOR] The spec does not list `getBindings(canonicalId)`, `getGovernance`, or `withExecutableBuiltins` in the interface.**
  - The "interface MUST expose" list is a minimum, so the code is a superset, but the spec is incomplete.
- **[MINOR] Previous audit flagged stale JSDoc on `register` ("^[a-z][a-z0-9-]\*$").**
  - In the current code the JSDoc reads "(`@scope/name`): lowercase, no dot" and is now fine.

### Test Coverage

`test/domain/services/check-registry.spec.ts`:

- invalid names including empty, `@acme/plugin@invalid`, and leading underscore (`:49-67`)
- valid scoped names (`:70`)
- duplicates (`:119`)
- invalid kind (`:100`)
- governance (`:184`)
- spoof isolation (`:212`)
- symbols, whitespace, uppercase, traversal (`:229`)
- `@` prefix isolation (`:261`)

### Missing Tests

- Explicit "unscoped name" and "dot in name" cases are only partly covered (the dot case is inferred from the `:229` family).
- Step-skip binding duplicates and `archiveChecks` one-per-check-id: not verified, sampled only.
- Cascade scenarios: not verified.

---

## Cross-spec contradictions

1. Tmp gitignore location: core:config-writer-port (`{specdPath}/tmp`) vs the repositories' `{configPath}/tmp` with `configPath = <specdPath>/config` (core:config). The spec acknowledges the split. Code follows the spec, so this is not a defect. It is a documentation or design smell. [minor]
2. Type name `PluginCheckRegistration` in the check-registry spec vs the code's `PluginCheckRegistrationOptions`; the code's `PluginCheckRegistration` is a different symbol (composition). [minor]
3. config-writer-port says `addPlugin` "MUST NOT duplicate" while its verify says "updates existing" (merge semantics in code). Spec and verify are consistent in intent but silent on field preservation. [minor]
4. No contradiction found between the change specs and `plugin-manager:specd-plugin-type`: the name regex is shared, so the scoped-name rule is consistent across config, loader, writer-validation (loader only) and registry.

## Summary counts

- Requirements reviewed: about 14 plugin-relevant (plus about 15 sampled).
- Implemented: all plugin-relevant requirements. Partial: `removePlugin` no-op fidelity (spec-compatible in effect).
- Critical: 0
- Major: 0
- Minor: 16 (core:config 6, config-loader 3, config-writer-port 5, check-registry 2). Mostly doc and wording drift, plus minor writer leniency.

---

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

---

# Partial compliance report: batch "cli" (change plugin-architecture)

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, config-show, host-context.
Code: packages/cli/src (commands/plugins/\*, commands/project/{init,update}.ts, commands/config/show.ts, helpers/{cli-context,cli-host,cli-cleanup}.ts, graph-index-task.ts, run.ts). Tests: packages/cli/test.
Method: read-only; spec-preview merged content vs source and tests. Tests were not executed.

Severity legend: CRITICAL (spec requirement unmet / behaviour wrong), MAJOR (notable gap or spec/code contradiction), MINOR (cosmetic, wording, test gap).

---

## cli:plugins-install

### Requirements Summary

Command signature (scoped names, `--contributions` single plugin only); declaration source = `config.plugins` (flat); header `Installed plugins:`; already-installed warning ("already installed" then "update", no reinstall); workflow (InstallPlugin with contributions, `addPlugin(configPath, name, {config?, contributions?})`, continue on error, no `kernel.project.addPlugin`, no `init`); host bootstrap `plugins:false`; exit 1 on any failure; JSON output.

### Implementation Status

- Command signature: IMPLEMENTED. `install <plugin...>`, `--contributions <ids>` split on commas; `pluginNames.length !== 1` -> `cliError('--contributions requires exactly one plugin')`. Name validated by `isPluginName` from SDK before any load (install.ts `isValidPluginName`).
- Declaration source: IMPLEMENTED via `getDeclaredPlugins(config)` (reads `config.plugins`), no kernel/ConfigWriter.listPlugins.
- Display name: IMPLEMENTED (`Installed plugins:` in text mode).
- Already-installed: IMPLEMENTED. stderr `warning: <name> already installed; use 'specd plugins update'`, status `skipped`, no writer call. Also `declaredSet` is updated after install so duplicates in one invocation are skipped.
- Installation workflow: IMPLEMENTED. `addPlugin` options built conditionally (`config` only when `defaultConfig !== undefined`, `contributions` only when flag given). Errors caught per plugin, loop continues.
- Host bootstrap: IMPLEMENTED (`resolveCliContext({configPath, plugins:false})`).
- Exit code: IMPLEMENTED (`CliExitError(1)` after render when `hasErrors`).
- Output format: IMPLEMENTED. JSON/TOON emits the whole batch result.

### Discrepancies

- MINOR: JSON/TOON output leaks internal `hasErrors` (renderInstallOutput does `output(result, format)` with `PluginInstallBatchResult`; test plugins-update.spec asserts `parsed.hasErrors` for update, same shape). Spec only lists name/status/details. `project update` JSON emits only `{plugins}` so the surfaces are inconsistent. Either spec should bless `hasErrors` or code should emit `{plugins}` only.
- MINOR: spec "Display name" says header `Installed plugins` "with a trailing colon" while the verify scenario says `Installed plugins:`; consistent with code. No issue, only noting header is also printed when all entries are errors/skipped (fine).
- MINOR: invalid-name rejection does not use the CLI usage-error path, it is a per-name `error` entry and exit 1. Verify scenario "command fails for that name" matches; "Contributions with several plugins rejected -> usage error" is implemented through `cliError` (exit code per entrypoint rules, not verified here).
- MINOR (spec wording): `Spec Dependencies` lists `plugin-manager:load-plugin-use-case` "validates plugin before installation"; the CLI never calls LoadPlugin, it relies on `InstallPlugin` (which loads internally). Spec might be wrong (wording) or code could be wrong if a separate pre-validation was intended. Likely spec wording.
- No contradiction found with `plugin-manager:specd-plugin-type` name rule (code reuses SDK `isPluginName`).

### Test Coverage (test/commands/plugins.spec.ts)

Covered: install + persist declaration (no `config` key in options; `plugins:false` asserted); unscoped name rejected; `--contributions` with several plugins rejected; contributions + defaultConfig persisted and passed to InstallPlugin; already-installed warning (stderr contains "already installed" and "update"); JSON output; exit 1 on failure.

### Missing Tests

- Already-installed: no assertion that InstallPlugin/addPlugin were NOT called (only warning text).
- Unscoped name: no assertion that no load/install was attempted (`mockInstall` not checked).
- "Continues with remaining plugins after a failure" (multi-plugin with first failing) not tested.
- `kernel.project.addPlugin` / `listPlugins` / `ConfigWriter.listPlugins` not-called scenarios not asserted.
- "Init is not run" scenario not asserted (plugin-manager mock has no init).
- Header `Installed plugins:` text output not asserted.
- "Install works with a broken configured plugin" only indirectly covered via `plugins:false` call assertion.

---

## cli:plugins-uninstall

### Requirements Summary

Positional `<plugin>...`; per-plugin: load, resolve selected contributions from `config.plugins` entry, call UninstallPlugin, `removePlugin(configPath,name)`; undeclared name -> per-name error without calling the plugin; no `kernel.project.removePlugin`, no type bucket, no `init`; `plugins:false`; exit 1 on any failure but continue; output `uninstalled` or error, JSON parseable. Constraint: uninstall hook before config removal.

### Implementation Status

- Signature: IMPLEMENTED.
- Workflow: IMPLEMENTED. `findDeclaredPlugin` -> throws `plugin '<n>' is not declared in specd.yaml` before calling UninstallPlugin; passes `contributions` only when present (UninstallPlugin defaults to all declared ids when omitted, verified in plugin-manager `uninstall-plugin.ts`); `removePlugin` only after `uninstall.execute` succeeded (ordering constraint met; if the hook throws, the declaration is retained).
- Host bootstrap `plugins:false`: IMPLEMENTED.
- Exit code: IMPLEMENTED.
- Output: IMPLEMENTED (`{ plugins }` for json/toon).

### Discrepancies

- MINOR (spec vs code wording): step 1 says "MUST load the plugin via `LoadPlugin` use case"; code builds `UninstallPlugin(loader)` which calls `loader.load` itself. Behaviourally equivalent; spec wording is more specific than code. Spec Dependencies also list `load-plugin-use-case`. Spec probably over-specified; alternatively code deviates.
- MINOR: undeclared error is detected before plugin load, matching the spec ("without calling the plugin").

### Test Coverage

Covered: uninstall removes declaration (`removePlugin` args asserted); JSON output with `uninstalled` status.

### Missing Tests

- Allowlist honoured (`uninstall` receives `['audit']`): `UninstallPlugin.execute` mock args never asserted.
- Plugin not declared -> error entry, plugin not called, exit 1.
- Exit 1 on failure and continuation over remaining plugins.
- Multiple plugins scenario.
- Plugin that contributes only `checks` (no `uninstall` hook) scenario.
- Ordering (hook before removePlugin) and `removePlugin` NOT called when hook fails.
- `plugins:false` not asserted for uninstall (only install/show/project-update assert it).
- `kernel.project.removePlugin` not-called not asserted.

---

## cli:plugins-update

### Requirements Summary

Optional names; enumerate from `config.plugins`; no args = all; named but undeclared = error for that name; each plugin updated with recorded `contributions` allowlist; idempotent; does not mutate config; no `init`; `plugins:false`; exit 1 on any failure; output `updated|skipped|error`; JSON.

### Implementation Status

- All IMPLEMENTED in `updatePluginsWithKernel` (update.ts): declared map from `config.plugins`; undeclared -> `error` entry; `UpdatePlugin.execute({pluginName, config, contributions?})`; no writer usage, so config is never mutated; `plugins:false`; exit 1 via `CliExitError`.
- Output status `skipped` is part of the type but is never produced by this command (no code path yields `skipped`).

### Discrepancies

- MINOR: `skipped` status is declared in spec/type but unreachable. Spec could drop it or code could emit it (e.g. nothing to update). Low impact.
- MINOR: JSON output includes `hasErrors` (same as install). Test in plugins-update.spec asserts it, so it is de facto contract.
- MINOR: text output when `plugins` is empty prints `no plugins to update` (not specified); `project update` prints `project is up to date` instead. Harmless.
- MINOR: undeclared-name case: `hasErrors=true` -> exit 1 (spec says exit 1 on any failure; consistent).

### Test Coverage (test/commands/plugins-update.spec.ts)

Covered: update-all, update specific names, undeclared name reports error + exit.

### Missing Tests

- "Recorded selection preserved": `UpdatePlugin.execute` called with `contributions` from the declaration (mock args not asserted); `extra` not activated.
- `plugins:false` host bootstrap not asserted.
- Idempotency / `specd.yaml` unchanged (no writer call) not asserted.
- Exit code 1 when UpdatePlugin throws, with continuation over remaining plugins.
- `kernel.project.listPlugins` / `ConfigWriter.listPlugins` not-called.
- Text output mode not tested; JSON test for `skipped` n/a.

---

## cli:plugins-list

### Requirements Summary

No `--type` flag; enumerate `config.plugins` (flat); `plugins:false`; status `installed|not_found|error`; output name, contributions (declared + selected), version, status; JSON; read-only.

### Implementation Status

- Signature (no `--type`): IMPLEMENTED.
- Declaration source / host `plugins:false`: IMPLEMENTED.
- Status detection: IMPLEMENTED via `ListPlugins` use case from plugin-manager: `loaded -> installed`, `not_found`, else `error`, with `detail` from `item.error`.
- Output: IMPLEMENTED. Text: `<name>  <version|->  <status>  selected: [a, b]  available: c  <detail>`; JSON `{plugins:[{name, contributions:{declared, selected}, status, version?, detail?}]}`.
- Read-only: IMPLEMENTED.

### Discrepancies

- MINOR: when no plugins are declared the text output is `no plugins declared` without header; JSON `{plugins: []}`. Not specified; fine.
- MINOR: for `not_found`/`error`, `contributions.declared` is empty (manifest unavailable) and `selected` falls back to `[]` when the allowlist is absent. Spec says "all when absent", which cannot be computed without a manifest. Acceptable; spec could state this explicitly.
- MINOR: all three status branches (`installed`, `not_found`, `error`) duplicate near-identical code; no spec impact.

### Test Coverage

Covered: JSON list with `installed` status; text output `selected: [claude]`; empty list JSON.

### Missing Tests

- `not_found` and `error` status scenarios (mock only returns `loaded`).
- "Allowlist shown" with `a` selected and `b` available (the `available:` text branch is untested).
- `plugins:false` not asserted for list; "lists with a broken configured plugin" not tested.
- "All declared plugins listed regardless of kind" (agents + checks) not tested.
- `kernel.project.listPlugins` / `ConfigWriter.listPlugins` not-called.
- Version column and `-` fallback not asserted.

---

## cli:plugins-show

### Requirements Summary

Single positional; display name, version, contributions (kind, id, address `<name>.<id>`), configSchema and `defaultConfig` if any, capabilities (when plugin contributes agents); JSON; `plugins:false`, never `init`; load failure -> error + exit 1; read-only.

### Implementation Status

- IMPLEMENTED: `LoadPlugin.execute({pluginName})`, contributions flattened from `manifest.contributes` with `buildContributionAddress`, configSchema/defaultConfig conditional, JSON/text output, `plugins:false`. Errors go through `handleError` (exit code 1 assumed per entrypoint mapping).

### Discrepancies

- MINOR: spec says capabilities are shown "when the plugin contributes agents"; code always prints `capabilities: ...` (possibly an empty string in text, `[]` in JSON) and derives `install`/`uninstall` from the plugin implementing the hooks OR declaring the `agents` kind. Spec says agents-only; code is broader. Likely spec should say "install/uninstall hooks implemented". Verify scenario for JSON requires `capabilities` present, which supports the code.
- MINOR: text output with zero capabilities prints `capabilities: ` (trailing empty value).
- MINOR (spec defect): `Spec Dependencies` link path `../plugin-manager/load-plugin-use-case/spec.md` lacks the extra `../` used by sibling plugin specs (`../../plugin-manager/...`), so the link is broken. Also does not list `cli:host-context` although it requires `plugins:false`.

### Test Coverage

Covered: JSON show (name, capabilities, contributions with address, `plugins:false`); text output with contribution address and capabilities without `init`.

### Missing Tests

- Load failure -> error message and exit code 1 ("Plugin not found" scenario).
- configSchema / `defaultConfig` display.
- Plugin without `agents` contributions (e.g. checks only) capability output.
- Not-calling `init`.

---

## cli:project-init

### Requirements Summary

Signature with `--plugin` repeatable, `--force`, alias `specd init`; interactive mode (TTY, text format, no config flags) with banner, prompts and plugin multiselect; known plugin options (claude, copilot, codex, opencode, standard); non-interactive text/json output (`initialized specd in ...`, `metadata cache: ...`, per-plugin lines; JSON with `plugins`); config placement at git root else cwd; delegation to `createConfigWriter().initProject` only; plugins installed after init via plugin install logic recorded in flat `plugins` list with `configVersion: 2`; already-initialised handling.

### Implementation Status

- Signature/alias: IMPLEMENTED (alias registration is in program; init tests use `specd init`).
- Interactive: IMPLEMENTED with `@clack/prompts`; plugin multiselect uses `AVAILABLE_AGENT_PLUGINS` = exactly the 5 spec'd names. Overwrite confirmation implemented.
- Non-interactive outputs: IMPLEMENTED (text lines; JSON `result, configPath, schema, workspaces, metadataCachePath, plugins`).
- Root placement: IMPLEMENTED (`createVcsAdapter().rootDir()` fallback `process.cwd()`).
- Delegation: IMPLEMENTED (`createConfigWriter().initProject`); CLI never writes YAML.
- Plugin install after init: IMPLEMENTED by `installSelectedPlugins` -> `resolveCliContext({configPath, plugins:false})` + `installPluginsWithKernel`. `configVersion: 2` and flat list are produced by core ConfigWriter (outside this audit; not verified in the CLI).
- Already initialised: delegated to `initProject` (non-interactive error path relies on writer throwing; exit 1 + `error:` via `handleError`).

### Discrepancies

- MINOR: the ASCII banner is printed in every text-format invocation (including non-interactive with flags), while the spec scopes the "Welcome header" to interactive mode. In non-interactive text mode the spec output starts with `initialized specd in ...`. Either spec is wrong (banner always shown) or code should print the banner only in the wizard.
- MINOR: interactive detection compares `opts.workspace !== 'default'` and `opts.workspacePath !== 'specs/'` against defaults, so explicitly passing the default values (`--workspace default`) still enters the wizard on a TTY; spec says "no configuration flags provided". Edge case (code wrong or spec ambiguity).
- MINOR: exit code after a plugin install failure (`hasErrors`) is 1 even though init succeeded; spec silent. Reasonable, but undocumented partial-failure behaviour.
- MINOR: `--plugin` accepts names with no early validation; invalid names produce `error` entries from install logic and exit 1 after init has already created files.
- MINOR: `Spec Dependencies` lacks `cli:host-context` (init uses `resolveCliContext({plugins:false})`) and the spec says "standard config discovery is not invoked", which is only true for the init step, not for the plugin step (loads the freshly written config with an explicit `configPath`). Spec wording gap.
- MINOR: spec text mentions "skills installation" heading while content is plugin install (stale naming, harmless).
- Consistency with cli:plugins-install: init relies on the same install function, so `configVersion: 2` list recording stays consistent. No contradiction.

### Test Coverage (test/commands/project-init.spec.ts)

Covered: `--plugin` install after init; opencode plugin; JSON with plugin results; `specd init` alias with `initProject`; JSON output; metadata cache line in text; exit 1 when exists without `--force`; `--force` overwrite; excess positional args rejected.

### Missing Tests

- Interactive wizard (plugin multiselect options, includes opencode/standard, overwrite confirm, cancel) has no tests.
- `metadataCachePath` JSON field assertion and "surfaced from result, not re-derived".
- Root placement (git root vs cwd).
- `plugins:false` used by the post-init install context; failure of plugin install -> exit 1.
- `standard` plugin option scenario; tmp `.gitignore` / directory / `.gitignore` scenarios are core-level (not CLI testable here).

---

## cli:project-update

### Requirements Summary

`project update [--format]`; runs plugin update logic for all declared plugins honouring allowlist, host with `plugins:false`; text lines prefixed `plugins: updated <name>`; `project is up to date` when nothing to update; per-plugin result lines to stdout, skills warnings to stderr (no exit change), all plugins processed then exit 1 on any error; requires specd.yaml.

### Implementation Status

- IMPLEMENTED: delegates to `updatePluginsWithKernel({config})` (shared with `plugins update`), `plugins:false`, `plugins: updated <name>` for updated; others `plugins: <status> <name> (<detail>)`; empty -> `project is up to date` (text) or `{plugins: []}`; JSON `{plugins}`; exit 1 on errors after processing all.
- Missing specd.yaml: `resolveCliContext` throws -> handled -> exit 1 with `error:`.

### Discrepancies

- MAJOR (spec staleness / contradiction with dependencies): the spec still describes "skills update" (Purpose, Requirement titles `Skills update step`, Partial failure "warnings (skill no longer in bundle) ... to stderr as in `specd skills update`", Constraint "In v1 the only update step is skills", dependency on `cli:skills-update` and "skills manifest" in `core:config`). There is no `cli:skills-update` spec in specs/cli (directory has no such entry) so the dependency link is dangling, and the code has no concept of skill warnings. Spec wrong (should be rewritten around plugins) is far more likely than code wrong.
- MINOR: Verify scenario "Warnings from skills update do not change exit code" cannot be satisfied or tested; stale.
- MINOR: Verify scenario "Declared plugins are updated: each plugin's `install()` method is called" - code calls `UpdatePlugin`, not `install()` directly; behaviour is mediated by plugin-manager (update-plugin-use-case). Wording of the scenario may be stale.
- MINOR: `Nothing to update` also applies when plugins are declared but all `skipped`; code only prints the up-to-date message when no plugins at all (skipped is never produced anyway).
- MINOR: JSON for the error case: `{plugins}` only; unlike `plugins update`, there is no `hasErrors` field (inconsistent but spec-compliant).

### Test Coverage (test/commands/project-update.spec.ts)

Covered: step-prefixed text; up-to-date message; grouped JSON; exit 1 on plugin error. `plugins:false` asserted. (updatePluginsWithKernel is mocked.)

### Missing Tests

- Missing `specd.yaml` -> exit 1 + `error:`.
- Continue-and-aggregate: second plugin still updated after first fails (mocked at a level that hides this; covered only transitively by plugins-update tests, which also do not test it).
- Allowlist honoured through project update (mocked away).
- Stale skills warning scenario (no test, and not implementable).

---

## cli:config-show

### Requirements Summary

`config show [--format]`; text summary incl. `plugins:` section listing flat list with `(present)` and `[contributions: ...]` only when an allowlist exists; json/toon serialize `SpecdConfig` directly; no sensitive fields; errors via entrypoint exit rules; read-only.

### Implementation Status

- IMPLEMENTED. `renderText` emits `projectRoot`, `specdPath`, `schemaRef`, `approvals`, workspaces (name, ownership, adapter), storage (+ `pattern:`), `context`, `contextIncludeSpecs`/`contextExcludeSpecs`, `llmOptimizedContext`, `schemaPlugins`, `plugins`, `schemaOverrides`. JSON/TOON `output(config, fmt)` directly.
- Command uses `loadConfig` (config loader only, no host/plugin bootstrap), so it never loads plugins; compatible with the "broken plugin" goal.

### Discrepancies

- MINOR: `--help` text (`addHelpText`) documents a stale JSON schema (`specsPath`, `isExternal`, `changesPath`, ...) that no longer matches `SpecdConfig` and the spec's "serialize SpecdConfig directly"; code (help text) wrong.
- MINOR: text `contributions` suffix has two leading spaces (`  [contributions: ...]`); spec example shows single bracket suffix without precise spacing. Cosmetic.
- MINOR: spec text template shows `[type: <adapter>]  config: ...` for workspaces; code prints `[type: <adapter>]  config: ...` with ownership first. Consistent with the example.
- MINOR: `schemaPlugins` printed with a preceding blank line, spec lists it inline with the group (cosmetic).
- Spec example output omits `contextExcludeSpecs`/`schemaPlugins`; fine since optional.
- Spec dependency on `core:config` fine; no contradiction with `core:config` plugins shape (flat list of `{name, config?, contributions?}` matches `DeclaredPluginEntry`).

### Test Coverage (test/commands/config-show.spec.ts)

Covered: text sections, approvals, JSON full config, optional fields omitted, workspaces, multiple workspaces, plugins in text with `[contributions: codex]`, `artifactRules` not shown, config not found.

### Missing Tests

- `plugins` shown without contributions suffix when no allowlist (negative case).
- TOON output.
- Sensitive-fields scenario trivially covered by absence of redaction.

---

## cli:host-context

### Requirements Summary

`resolveCliContext` delegates (via CLI host-opening helper) to `openSpecdHost` with `configPath`, `options.kernel`, `options.plugins` (default true); `plugins?: boolean` option; returns `CliContext` (SdkHostContext + `config`, `configFilePath`); warnings from `config.warnings` once; kernel options kept in CLI; only `resolveCliContext`/helper call SDK bootstrap; helper `openCliHost` wraps `openSpecdHost`/`createSdkContext`, registers `dispose` in cleanup registry, forwards input unchanged, failed open registers nothing; `resolveSdkHostContext` and hand-built host removed; `CliContext` exposes `dispose`; cleanup registry semantics (reverse order, idempotent, failure warnings, late registration invoked immediately); entrypoint triggers registry; graph index worker uses `plugins:false` and disposes in `finally`; package.json: `@specd/sdk` sole platform dependency.

### Implementation Status

- resolveCliContext: IMPLEMENTED (cli-context.ts). `options.kernel = buildCliKernelOptions({onLog})`; `plugins` forwarded only when defined (so default true is the SDK's default).
- Warnings: IMPLEMENTED once per call from `config.warnings` via `console.warn('warning: ...')`.
- Host-opening helper: IMPLEMENTED (cli-host.ts): overloads for discovery and resolved-config forms; registers `host.dispose()` after successful open only. NOTE: the cleanup callback is registered after the host exists; a failed open registers nothing.
- CliContext type: IMPLEMENTED (cli-context-types.ts; host returned directly with `config`/`configFilePath`).
- Cleanup registry: IMPLEMENTED (cli-cleanup.ts): reverse order, memoized promise, `warning: cleanup failed: ...` on stderr, AggregateError flattened, late registration runs immediately (`void runOne`).
- Entrypoint triggers: IMPLEMENTED in run.ts (`await runCliCleanup()` after parse, both on success and error) and cli-signals.ts (signal path).
- Graph worker: IMPLEMENTED (graph-index-task.ts): `plugins:false` for both configured and bootstrap modes; `host.dispose()` in `finally`.
- Package deps: IMPLEMENTED (package.json has `@specd/sdk`; no `@specd/core`/`@specd/code-graph`; no src imports from those packages found).
- `resolveSdkHostContext` removed; no hand-built host in src (grep clean).
- Plugins:false usage by management commands: install, uninstall, update, list, show, project update and project init install step all pass `plugins:false`.

### Discrepancies

- MINOR: spec says "emit each warning ... at most once"; it is emitted by `resolveCliContext` via `console.warn`, but `loadConfig` (used by `config show`) emits its own warnings separately. Not a violation but two code paths for warnings. Spec only covers `resolveCliContext`.
- MINOR: `config show` and any command using `loadConfig` bypass `resolveCliContext`/helper. Spec "Host bootstrap entry point" only constrains host bootstrap (`openSpecdHost`/`createSdkContext`), not config loading, so no violation; noted for completeness.
- MINOR: spec verify scenario "Kernel options forwarded for verbosity" says `openSpecdHost` receives `kernelOptions`, whereas the requirement text and code use `options.kernel` (the test title in cli-context.spec says `options.kernel`). Spec inconsistency inside host-context (verify.md wrong).
- MINOR: spec dependency link to `core:kernel` uses `../../../../specs/core/kernel/spec.md` while siblings use `../../core/...`; likely broken link path in spec.
- MINOR: spec for the cleanup registry says a failing cleanup is reported as a `warning:` line; the actual text is `warning: cleanup failed: <msg>`. Compatible.
- MINOR: `graph-index-task.ts` calls `openSpecdHost`/`createSdkContext` directly, allowed by the spec exception for the worker (no discrepancy).
- MINOR: kernel-dispose timing: spec says commands need not call `dispose` because registry releases hosts; run.ts awaits `runCliCleanup()` before `process.exit`, satisfying the "every exit path" requirement from `cli:entrypoint` (entrypoint spec itself not audited here).

### Test Coverage

- cli-context.spec.ts: `-vv` trace destination; `plugins:false` forwarded; warnings read from config and context shape; once-per-bootstrap; no warnings when absent; `buildCliKernelOptions` paths; host released via registry without dispose; dispose once; source scan for no direct SDK bootstrap / no hand-built host / no `helpers/sdk-host.ts`.
- cli-host.spec.ts: opens via `openSpecdHost`, registers dispose; `createSdkContext` form; input forwarded unchanged; failed open registers nothing.
- cli-cleanup.spec.ts: reverse order; idempotent concurrent; failing cleanup does not stop others; AggregateError; late cleanup invoked immediately; late failure warning.
- graph-index-task.spec.ts: configured and bootstrap contexts with `plugins:false`; dispose on success and failure; SDK boundary.
- run-host-release.spec.ts: host disposed at exit without command calling dispose.
- package-deps.spec.ts: `@specd/sdk` present, core/code-graph absent.

### Missing Tests

- "Plugins enabled by default" (no `plugins` option -> SDK host opened with plugins enabled/undefined) not asserted.
- Optional `onLog` callback wiring scenario ("Optional onLog callback wired").
- `plugins:false` -> "no plugin is loaded or initialized" is SDK-level; not testable in CLI.
- `CliContext` `[Symbol.asyncDispose]` presence not asserted.
- `plugins:false` assertion in the graph worker for the bootstrap mode exists; failing configured plugin does not break indexing not tested.
- Cleanup on error exit path (`CliExitError`) and signal paths: run.spec/cli-signals specs exist (covered under `cli:entrypoint`).

---

## Cross-spec findings

1. MAJOR: `cli:project-update` is stale vs the plugin architecture (skills terminology, dangling `cli:skills-update` dependency, unimplementable verify scenario). Needs spec rewrite in this change.
2. MINOR: `hasErrors` in JSON for install/update vs spec and `project update`: undefined contract.
3. MINOR: `cli:plugins-show` capabilities rule differs from implementation; spec dependency link broken; missing `cli:host-context` dependency.
4. MINOR: verify.md of `host-context` references `kernelOptions` instead of `options.kernel`.
5. Test coverage for plugin management commands is thin on negative paths (undeclared plugin, allowlist propagation, continue-on-error, not-found/error statuses); most requirement-level behaviours are implemented but not asserted.

## Summary counts

- Critical: 0
- Major: 1 (project-update stale skills spec / dangling dependency)
- Minor: 40 approx. (spec wording/test-gap level; the notable code-side minors are: banner shown in non-interactive init, wizard entered when default flag values are passed explicitly, unreachable `skipped` status, `hasErrors` leaking into JSON, stale `config show --help` JSON schema, capabilities shown without agents condition)
- Missing-test groups: install 7, uninstall 8, update 6, list 6, show 4, project-init 5, project-update 4, config-show 3, host-context 4.

---

# Partial audit: batch "agents" (change plugin-architecture)

Specs: plugin-agent-claude / copilot / codex / opencode / standard `:plugin-agent`.
Method: merged spec-preview (spec.md + verify.md), dependency `plugin-manager:agent-plugin-type` (merged preview), code in `packages/plugin-agent-*/src`, test titles and selected assertions in `packages/plugin-agent-*/test`. I did not read every test assertion line by line, so coverage verdicts are "by test title plus spot checks".

Common structure: all five packages share an identical `src/index.ts` (async `create`, manifest read from own dir then parent) and near-identical `InstallSkills` / `UninstallSkills`. Manifests are identical in shape: `schemaVersion: 2`, no `pluginType`, `contributes.agents.<id>`. A defect in the shared pattern therefore applies to all five.

## Cross-cutting findings (apply to all five specs unless noted)

- **[MAJOR] X1. The `sharedFolder` directory is never removed on unfiltered uninstall.**
  - Code: all five `uninstall-skills.ts` do `await rm(sharedDir)` (no `recursive`) inside a try/catch that swallows errors.
  - `fs/promises.rm` on a directory without `recursive: true` always throws `ERR_FS_EISDIR`, even for an empty directory. I confirmed this with node. The catch hides it, so the (empty) folder always stays.
  - Spec text: "uninstall MUST remove ... the resolved sharedFolder location" and "the resolved sharedFolder location is removed".
  - Possibility A (code wrong): use `rm(dir, {recursive:true})` guarded by "only specd files remain", or `rmdir` for the empty-directory case.
  - Possibility B (spec wrong): the real intent is "remove the specd shared files, keep the folder if user files are present". The claude test title "preserves non-specd user files and sharedFolder" suggests the folder is intentionally kept, but an empty folder is also kept, which the spec forbids.
  - Tests only assert that the shared file is gone (claude spec line ~199). No test asserts that the directory itself is gone.

- **[MAJOR] X2. Verify scenarios in copilot and codex contradict the same spec's "No type discriminator".**
  - `plugin-agent-copilot` and `plugin-agent-codex` verify.md, scenario "Created plugin satisfies runtime contract", say "the returned plugin has `type: 'agent'`".
  - The same spec's Factory requirement and its "No type discriminator" scenario say the plugin MUST NOT carry `type`. The dependency spec `agent-plugin-type` also drops `type`.
  - The code has no `type`, and all five `*-plugin.spec.ts` assert `not.toHaveProperty('type')`. So the code is right and the scenario is stale (spec wrong).
  - The same requirement also says "implements `install(config, options)`", but the contract is now `install(context)`. This is a stale signature.

- **[MINOR] X3. The "agents capability missing -> install agent next to shared.md" fallback is not implemented as a branch.**
  - It appears as a numbered step or scenario in the claude, codex and opencode specs.
  - `capabilities` is a hardcoded literal including `'agents'`, so the fallback path never runs. There is no test.
  - Possibility A: the requirement is vacuous for a static capability set, so reword it or drop it.
  - Possibility B: code should gate the target directory on `capabilities.includes('agents')`.
  - The standard plugin does implement the fallback, unconditionally, because it declares only `['frontmatter']`.

- **[MINOR] X4. `factory create()` signature.**
  - Spec: `create(options): AgentPlugin`.
  - Code: `async create(...): Promise<AgentPlugin>`.
  - This is probably fine if the loader awaits it. I did not verify the loader contract in `plugin-manager`; the spec text should say `Promise<AgentPlugin>` or "or a promise of".
  - Scenario "Exports create function: `create(): AgentPlugin`" is imprecise for the same reason.

- **[MINOR] X5. Legacy cleanup is not in the specs.** Every uninstall also does `rm(sharedDir/<agent>.agent.md)` and `rm(<skill>.md)` (legacy flat files). The specs do not list this. Either add it to the specs or accept it as an implementation detail.

- **[MINOR] X6. Prompt block removal is skipped when a filter is given.**
  - When `options.skills` or `options.agents` is provided, uninstall returns early and does not call `removeSpecdBlock`.
  - Spec text "uninstall() MUST remove the `<!-- <specd> -->` block" is unconditional, but filtered uninstall is arguably partial, so keeping the block is sensible.
  - The spec should say "on full uninstall". Install always (re)injects the block, including for filtered installs.

- **[MINOR] X7. Prompt block literal.** Specs for claude and copilot say the file contains `<!-- <specd> -->` and "no plugin-specific marker block". Code calls `injectSpecdBlock(path, prompt, 'claude'|'copilot')`, so `skills/specd-block-manager` writes `<!-- <specd agents="claude"> -->`. There is no separate marker block, so the intent holds, but the literal scenario text ("contains the `<!-- <specd> -->` block") is not exact. The spec is likely stale compared with the codex, opencode and standard wording, which describe the `agents="..."` reference-counted block.

- **[MINOR] X8. Domain-layer file locations and shape.** For claude, the spec says `claude-plugin.ts`, `frontmatter.ts` and `frontmatter/` live in the domain layer. Code puts them in `domain/types/claude-plugin.ts`, `domain/types/frontmatter.ts` and `domain/frontmatter/index.ts`. The spec also says `frontmatter/` exports `skillFrontmatter` only, while all plugins also export `agentFrontmatter`. This is a spec path imprecision.

- **Dependency check (`plugin-manager:agent-plugin-type`, merged).** `install(context: AgentInstallContext)` and `uninstall(context)` are implemented by all five plugin classes, forwarding `context.config` and `context.options`. The no-`type` rule, `isAgentPlugin` without `type`, capability identifiers (`mcp`, `agents`, `frontmatter`), `variables.frontmatter` and the `variables.sharedFolder` pass-through are all consistent with the code. Contradictions are limited to X2 (stale scenario text) and the copilot/codex "install(config, options)" wording. Standard and opencode specs do not repeat the stale text.

---

## plugin-agent-claude:plugin-agent

### Requirements Summary

Factory export; manifest + install context; domain layer; frontmatter type (14 Claude fields); application layer (`InstallSkills`, caps `['mcp','agents','frontmatter']`, `ResolveBundle`, agents to `.claude/agents`, sub-agent `tools` string and `model`); frontmatter injection; install location; CLAUDE.md prompt injection; uninstall; fast-track install; manual-only fast-track (`disable_model_invocation: true`).

### Implementation Status

- Factory/manifest: IMPLEMENTED. `schemaVersion: 2`, `agents.claude`, no `pluginType`, no `type`.
- Frontmatter type: IMPLEMENTED. All 14 fields present in `domain/types/frontmatter.ts`.
- Application layer: IMPLEMENTED. `ResolveBundle`, literal capabilities, `variables.sharedFolder` pass-through, skills to `.claude/skills/<n>/`, agents flat to `.claude/agents/<n>.md`, shared to `sharedFolder`. No YAML is prepended after resolution.
- Agent sub-mapping: PARTIAL. `tools` comes from `allowed_tools` via `split(', ').join(', ')`, which is a no-op. `model` is mapped only if `agentFrontmatter[name].model` exists, and no agent defines one. The spec says the model comes from `specd-agent.meta.json`; the code never reads that file.
- Fast-track: IMPLEMENTED. `disable_model_invocation: true` and the manual-only description; no static frontmatter extras.
- Prompt injection: IMPLEMENTED (see X7). `extraInstructions` is not used, which the spec allows (MAY).
- Uninstall: IMPLEMENTED except X1 and X6.

### Discrepancies

- [MAJOR] X1 (sharedFolder directory kept).
- [MINOR] Model source: spec says `specd-agent.meta.json`; code uses the in-package `agentFrontmatter` map and no agent has a model. Either the spec is stale or the code should read the meta file.
- [MINOR] Spec step 6 says agents install to `.claude/agents/<agent-name>/` (directory form). Scenarios and code use the flat `<agent-name>.md`. The spec is internally inconsistent; code matches the scenarios.
- [MINOR] X3, X4, X6, X7, X8.

### Test Coverage (`test/install-skills.spec.ts`, `test/domain/types/claude-plugin.spec.ts`)

Covered: shared routing and no frontmatter in shared files; capability list `mcp/agents/frontmatter`; agent YAML (`tools` string at line ~267); uninstall with non-specd user files in shared folder; CLAUDE.md block inject and uninstall; constructor metadata; context forwarding; manifest shape; `not.toHaveProperty('type')`; fast-track mentioned in tests (18 refs).

### Missing Tests

- Agent `model` mapping.
- `agents`-capability fallback.
- Selected-agent-file uninstall (probably partly covered; not verified).
- Assertion that the shared directory itself is removed (X1).
- Unsupported-key exclusion (type-level only).
- Domain-layer structural scenarios (no executable test; acceptable).

### Summary counts

Critical 0 / Major 1 (X1) / Minor 6 (model source, agents dir wording, X3, X4/X6, X7, X8).

---

## plugin-agent-copilot:plugin-agent

### Requirements Summary

Factory; manifest; runtime contract; skill install + injection (caps `['frontmatter','agents']`, agents to `.github/agents/<n>.agent.md` with `tools` as a YAML list); frontmatter field contract (name, description, license, allowed-tools, user-invocable, disable-model-invocation); install location `.github/skills`; prompt to `.github/copilot-instructions.md`; uninstall; fast-track; manual-only with `disable-model-invocation: true`.

### Implementation Status

- All requirements IMPLEMENTED. The `tools` list is built from `allowed-tools` via split on `,` and trim.
- Frontmatter type exactly matches the contract (`name`, `description`, `license`, `allowed-tools`, `user-invocable`, `disable-model-invocation`).
- Fast-track frontmatter has `disable-model-invocation: true` and the manual-only description.
- Prompt: `injectSpecdBlock(..., 'copilot')`; uninstall calls `removeSpecdBlock(..., 'copilot')`.

### Discrepancies

- [MAJOR] X2 (scenario "has `type: 'agent'`" vs "No type discriminator"; also stale `install(config, options)` text).
- [MAJOR] X1.
- [MINOR] The runtime-contract requirement says "implements `install(config, options)`" (stale).
- [MINOR] Spec lists no Domain layer requirement, unlike claude. Not a defect.
- [MINOR] X4, X5, X6, X7.

### Test Coverage

Covered: shared routing; capabilities `['frontmatter','agents']`; Copilot agent wrapper (YAML `tools`); prompt inject and uninstall; user file in the shared folder survives uninstall; constructor and manifest; no `type`.

### Missing Tests

- The "Copilot omits unsupported fast-track branches" scenario (the fast-track mock exists, but there is no dedicated test with an assertion on omitted capability branches).
- Selected `.agent.md` removal.
- Shared directory removal (X1).
- The frontmatter field-contract scenarios are type-level only.

### Summary counts

Critical 0 / Major 2 (X1, X2) / Minor 5.

---

## plugin-agent-codex:plugin-agent

### Requirements Summary

Factory; manifest; runtime contract; install (caps `['mcp','agents','frontmatter']`; agents as TOML `.codex/agents/<n>.toml` with `developer_instructions = """..."""` and TOML escaping); frontmatter contract (name and description only); location `.codex/skills`; AGENTS.md shared and reference-counted prompt (`'codex'`); uninstall; fast-track (name and description only); manual-only description.

### Implementation Status

- IMPLEMENTED: TOML generation (`name`, `description` via `JSON.stringify`, `developer_instructions` multiline, `escapeTomlBasicMultiline`). The frontmatter type has only `name` and `description`. `inject`/`remove` use `'codex'`.
- Agent bundles are given no frontmatter variables, which matches the TOML design.
- PARTIAL: step 11 fallback (X3). Not implemented as a branch.

### Discrepancies

- [MAJOR] X2 (`type: 'agent'` scenario contradicts "No type discriminator").
- [MAJOR] X1.
- [MINOR] X3, X4, X5, X6.
- [MINOR] Codex shares `AGENTS.md` with opencode and standard. The spec scenarios "keeps shared block while another plugin references it" and "legacy marker purged" depend on `skills` block-manager behavior. Codex has a test for "marker and uninstalls cleanly" but I did not see a two-plugin scenario test in this package (the standard package has one).

### Test Coverage

Covered: shared routing; fast-track name/description-only frontmatter and journal-resumability content (asserted in the test); TOML wrapper; backslash escaping; AGENTS.md prompt inject/uninstall; constructor, manifest, no `type`.

### Missing Tests

- Multi-plugin reference-count scenario (codex plus another plugin).
- Legacy-marker purge on uninstall (title suggests partial coverage).
- Fallback (X3).
- Selected `.toml` removal.
- Shared directory removal (X1).

### Summary counts

Critical 0 / Major 2 (X1, X2) / Minor 5.

---

## plugin-agent-opencode:plugin-agent

### Requirements Summary

Factory (named export); manifest; domain types; frontmatter contract (name, description, license, compatibility, metadata; agent `allowed_tools` becomes the `permission` list); application layer (caps `['mcp','agents','frontmatter']`, agents `.opencode/agents/<n>.md`, `mode: subagent`, permissions from tools); install location; AGENTS.md shared block with `removeSpecdBlock` before `injectSpecdBlock`; wizard listing; meta-package dependency; uninstall; fast-track; manual-only.

### Implementation Status

- IMPLEMENTED: factory, manifest, frontmatter type (includes the extra `allowed_tools`, as the spec permits for agents), `mode: 'subagent'`, permissions transform, and `removeSpecdBlock` then `injectSpecdBlock`.
- Wizard: `@specd/plugin-agent-opencode` is in `packages/cli/src/commands/project/init.ts`. Meta package: `@specd/plugin-agent-opencode: workspace:*` is in `packages/specd/package.json`.
- Uninstall: IMPLEMENTED except X1 and X6.
- Fast-track: IMPLEMENTED with name and description only, and the manual-only description. The map is not dependent on a static `disable` field.

### Discrepancies

- [MAJOR] X1.
- [MAJOR, verify] Key name and shape of permissions. Spec text says "Open Code `permission` list"; the scenario says `permissions`; code emits `permissions: [{bash: 'allow'}, ...]` (a list of single-key maps, with duplicate `bash` entries when several Bash patterns exist: the test asserts 4 identical `{ bash: 'allow' }`).
  - I found no template in `packages/skills/templates` that renames the key. The rendered output depends on how the agent template serializes `variables.frontmatter`, which I did not trace.
  - Possibility A (code wrong): OpenCode's real agent frontmatter key is singular `permission` and a map, not a list. The output may not be honoured by OpenCode, and the duplicate entries are redundant.
  - Possibility B (spec wrong): both the "permission" prose and the "permissions" scenario are loose, and the plugin's key is whatever the skills template expects. This needs a check against the OpenCode docs and the skills agent template.
- [MINOR] Test title in `install-skills.spec.ts` line ~328 still claims "deploys plugin script, merges opencode.json" even though the body says no native plugin script is deployed. This is a stale title and a spec gap (no such requirement).
- [MINOR] Permissions are derived by lowercasing the base tool name (e.g. `Bash(node *)` becomes `bash`), so the pattern restriction is lost. The spec says only "transform allowedTools into permissions", so this is acceptable but lossy.
- [MINOR] X3, X4, X5, X6.

### Test Coverage

Covered: shared routing; default selection with fast-track and capabilities `['mcp','agents','frontmatter']` (line ~218); agent frontmatter (`mode: subagent`, `permissions`); AGENTS.md inject and uninstall; constructor, manifest, no `type`.

### Missing Tests

- Wizard and meta-package scenarios (these are repo-level; check the CLI tests).
- Multi-plugin shared-block scenarios.
- Legacy marker removal on install.
- Fallback (X3).
- Shared directory removal (X1).
- Selected-skill uninstall that keeps the shared location.

### Summary counts

Critical 0 / Major 2 (X1, permissions key/shape verify) / Minor 5.

---

## plugin-agent-standard:plugin-agent

### Requirements Summary

Factory (named export); manifest; domain types; frontmatter contract (name, description, license, compatibility, metadata, `allowed-tools` space-separated); application layer (caps `['frontmatter']` only; skills to `.agents/skills/<n>/`; agents to the shared folder, since `agents` is unsupported); location; AGENTS.md shared block (`'standard'`); `allowed-tools` configuration per skill; wizard and meta-package inclusion; uninstall (skills only mentioned); fast-track `allowed-tools`; manual-only description.

### Implementation Status

- IMPLEMENTED: capability list, agents written to `<sharedDir>/<n>.agent.md` (the fallback is implemented unconditionally), `allowed-tools` with a hyphen as a space-separated string, `inject`/`remove` with `'standard'`.
- The fast-track map has `allowed-tools: 'Bash(node *) Bash(specd *) Bash(pnpm *) Read Write Edit Grep Glob Agent'` and the manual-only description.
- Wizard and meta-package: `@specd/plugin-agent-standard` is present in `project/init.ts` and `packages/specd/package.json`.

### Discrepancies

- [MAJOR] X1.
- [MINOR] `specd-compliance` `allowed-tools` uses the colon style (`Bash(git:*) Bash(gh:*)`) while all other entries use the space style (`Bash(node *)`). The spec requires "matching the agentskills.io format (space-separated)" for the list but does not specify the pattern syntax. It also lacks the `Bash(node *)` / `Bash(pnpm *)` entries that the "tool strings MUST include" list mentions. This is probably fine for a skill that does not use them; the spec wording "where applicable" is loose.
- [MINOR] The spec's uninstall requirement mentions only skills, but code also handles `options.agents` (removes `<shared>/<n>.agent.md`). Add this to the spec. Agent installs for the standard plugin land inside the shared directory, so the spec's "unrelated files remain" guarantee needs a sentence for the shared folder.
- [MINOR] The comment in `agentFrontmatter` says the entries are "unused for frontmatter injection", but `install-skills.ts` does build `frontmatter` variables for agents (`allowed-tools` is split into an array). This is dead or misleading code or comment; agent entries define no tools, so no `allowed-tools` is emitted.
- [MINOR] X4, X5, X6.

### Test Coverage

Covered: writes to `.agents/skills/` with `allowed-tools`; fast-track with standard frontmatter only; agent YAML wrapper; AGENTS.md inject and clean uninstall; agent file plus user file uninstall; space after the command pattern in `allowed-tools`; two-tagged-blocks uninstall (reference counting); constructor, manifest, no `type`.

### Missing Tests

- Shared directory removal (X1).
- Wizard and meta-package scenarios.
- Selected-skill uninstall that keeps the shared directory (partly covered, unverified).

### Summary counts

Critical 0 / Major 1 (X1) / Minor 5.

---

## Batch summary

| Spec     | Critical | Major | Minor |
| -------- | -------- | ----- | ----- |
| claude   | 0        | 1     | 6     |
| copilot  | 0        | 2     | 5     |
| codex    | 0        | 2     | 5     |
| opencode | 0        | 2     | 5     |
| standard | 0        | 1     | 5     |

Distinct findings: 0 critical, 3 major (X1 sharedFolder never removed, which affects all five; X2 `type: 'agent'` scenario contradiction in copilot and codex; opencode `permissions` key/shape to verify), plus about 9 minor findings (X3 to X8 plus per-plugin items). Counting each spec's own findings as listed above gives 0 critical / 8 major / 26 minor.

Spec vs code: Everything in these specs is implemented. The main risk is X1, the swallowed `ERR_FS_EISDIR`. Next is the stale verify text in copilot and codex (X2). Tests are generally good for install routing and prompt injection, and weaker on shared-directory removal, the capability fallback and multi-plugin reference counting for codex and opencode.
