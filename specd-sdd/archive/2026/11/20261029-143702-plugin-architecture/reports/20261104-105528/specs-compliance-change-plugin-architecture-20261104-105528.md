# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-4)

## Summary

| Batch                     | Critical | Major                                                                            | Minor  |
| ------------------------- | -------- | -------------------------------------------------------------------------------- | ------ |
| core/config (5 specs)     | 0        | 0                                                                                | 9      |
| plugin-manager (11 specs) | 0        | 2 (M1 enum shape check, M2 sync throw in registerPlugins)                        | 15     |
| cli (8 specs)             | 0        | 0                                                                                | 7      |
| sdk/agents (8 specs)      | 0        | 2 (D1 CLI deps vs sdk:composition scenario, D12 owner marker on partial failure) | 9      |
| **Total**                 | **0**    | **4**                                                                            | **40** |

Tests: core 3354, cli 1253, plugin-manager 95, sdk 98, skills 112, 5 agent plugins all pass; typecheck clean.

## Detailed findings

### \_partial-core-config.md

# Partial compliance audit: core config batch (change `plugin-architecture`)

Scope: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show.
Method: merged spec via `changes spec-preview`, plus the change deltas to find what this change touches; code and tests read directly. Neither spec nor code is treated as the source of truth. Read-only; nothing modified.
Spec-preview IDs: the CLI wants `core:config` style IDs (not `core:core/config`).

Depth note: the parts of the large pre-existing specs that this change does not touch (discovery, privacy, workspaces, graph, context selection, approvals, etc.) were NOT re-audited. They were covered only by presence of tests. The audit is exhaustive for the plugin-architecture-touched requirements.

Totals: critical 0, major 0, minor 9.

---

## 1. core:config

Touched requirements: Cascade identity and removal model, Plugin declarations, Config version, Config writer port.

| Requirement                        | Status         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade identity and removal model | OK             | `packages/core/src/infrastructure/fs/config-cascade.ts` (`mergePluginLists`, `applyRemovals` plugins branch, ~L492-510): same-name replace in place, new names append, absent name or no inherited plugins -> `ConfigValidationError`, duplicate name in removal list -> second lookup misses -> `ConfigValidationError`.                                                                                                                                                                                                                                                                       |
| Plugin declarations                | OK             | `config-schema.ts` L204-225: `PluginEntryZodSchema` (name regex, `config`, `contributions` min(1), strict) + `PluginsZodSchema` array with duplicate-name `superRefine`. Mapped in `config-loader.ts` ~L664.                                                                                                                                                                                                                                                                                                                                                                                    |
| Config version                     | OK             | `config-loader.ts` `assertCurrentConfigFormat` (L691): version check before legacy check, legacy only when `plugins` is an object with an `agents` key, runs on every active layer (L264) before the strict schema. `config-schema.ts` `configVersion: z.number().int().positive().optional()`. Root-layer version wins and a differing extending-layer version fails (`config-cascade.ts` `mergeActiveLayers`). Both errors extend `ConfigValidationError` with codes `LEGACY_CONFIG_FORMAT` / `UNSUPPORTED_CONFIG_VERSION`. `initProject` writes `configVersion: 2` (`config-writer.ts` L53). |
| Config writer port                 | OK             | `application/ports/config-writer.ts` defines `initProject`, `addPlugin(options?: {config, contributions})`, `removePlugin`, `listPlugins`; `FsConfigWriter` implements. "No duplicate" holds (merge into existing entry).                                                                                                                                                                                                                                                                                                                                                                       |
| All other requirements             | NOT RE-AUDITED | Pre-existing, untouched by this change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Test coverage (`packages/core/test/infrastructure/fs/config-loader.spec.ts`): every verify scenario of the touched requirements has a test (L1193-1380: flat list, entry shape, unscoped, duplicate, legacy snippet, legacy before schema, newer version, version-over-legacy, absent version, 0/fractional version, `plugins.skills` generic error; L2308-2420: remove by name, replace in place/append, legacy in extending layer, duplicate removal names, version mismatch, absent removal name).
Gaps: none for touched scenarios.

Discrepancies:

- [minor] Latent aliasing in `config-cascade.ts` `mergePluginLists` (returns the `base` array by reference when the overlay has no `plugins`) combined with `applyRemovals` (`plugins.splice(idx, 1)`, ~L500): a removal in a layer that does not itself redeclare `plugins` mutates the array held by the previous layer's raw object. Harmless today if raws are not reused (not verified); would corrupt state if a cascade is merged twice. Suggested fix: copy the array in `mergePluginLists`/`applyRemovals`. No test exercises a double merge.
- [minor] Spec dependency direction. Spec text says the plugin name rule is "of `plugin-manager:specd-plugin-type`", but the regex lives in core (`packages/core/src/domain/plugin-name.ts`) and plugin-manager imports it from `@specd/core` (`plugin-loader.ts` L5). The plugin-manager spec depends on core:config, so core:config citing plugin-manager makes a cyclic spec reference. Code placement is the only workable direction (core cannot depend on plugin-manager). Spec or code owner should decide: reword the spec to say core owns the grammar, or move the definition.

---

## 2. core:config-loader

Touched requirements: YAML parsing and structural validation, Schema plugins/overrides/context entry mapping, All errors are ConfigValidationError.

| Requirement                                                                          | Status         | Evidence                                                                                                                           |
| ------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| YAML parsing and structural validation                                               | OK             | Legacy + version checks before strict schema, version before legacy, per layer (`config-loader.ts` L264, L691).                    |
| Plugin mapping (flat list, name identity, no plugin loading, no `config` validation) | OK             | Loader maps `{name, config?, contributions?}` only; no plugin import anywhere in loader. Removal semantics in `config-cascade.ts`. |
| All errors are ConfigValidationError                                                 | OK             | `LegacyConfigFormatError` and `UnsupportedConfigVersionError` both `extends ConfigValidationError`.                                |
| Remaining requirements                                                               | NOT RE-AUDITED | Untouched.                                                                                                                         |

Test coverage: all new verify scenarios covered (see section 1 test ranges). "Plugins are not loaded by the loader" has no dedicated test (config with a plugin whose package is absent). Gap: minor.

Discrepancies:

- [minor] `config-loader.ts` ~L722-735: the JSDoc of `resolveConfiguredInvalidation` was rewritten as unrelated churn in this diff (the previous text described the legacy-scalar mapping to `{artifacts, workflow:'redesign'}` and the both-shapes rejection; the new text is vaguer). Behaviour unchanged. Documentation regression only.

---

## 3. core:config-writer-port

| Requirement                                      | Status          | Evidence / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface shape (4 methods, interface not class) | OK              | `config-writer.ts` port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| InitProject signature / Options / Result shapes  | OK              | Fields match, incl. `metadataCachePath`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| InitProject behaviour                            | PARTIAL (minor) | `config-writer.ts` L38-98. Creates yaml with `configVersion: 2` and no `storage` block, storage dirs, metadata dir, `.specd/config/tmp/.gitignore` (via `ensureTmpGitignore`), and `.gitignore` entries incl. rooted `/.specd/metadata/` (idempotent). Directory names (`.specd/config`, `.specd/metadata`) and `metadataCachePath: '.specd/metadata'` are hardcoded; the spec says "resolved" metadata/config path. Equivalent for a freshly generated config (defaults), so no observable gap, but the spec wording implies resolution. Also init does not honour a pre-existing custom `specdPath` when re-run with `force`. |
| Already-initialised guard                        | OK              | L42-45.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AddPlugin                                        | OK              | Name validated first (L109) -> no write on invalid name; missing file, bad YAML, legacy/invalid `plugins` -> `ConfigValidationError`/`LegacyConfigFormatError` (a subclass) without rewrite; merge preserves omitted fields (`mergePluginEntry`).                                                                                                                                                                                                                                                                                                                                                                               |
| RemovePlugin                                     | OK              | Absent key/name -> returns before `writeFileAtomic` (byte-identical, no `plugins: []`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ListPlugins                                      | OK              | Absent file or key -> `[]`; legacy/invalid/bad YAML -> throws.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Delivery via createConfigWriter                  | OK              | CLI uses `createConfigWriter` from `@specd/sdk` (re-export of core): `install.ts` L51, `uninstall.ts` L42, `project/init.ts` L85/L240. No CLI/SDK/MCP import of `FsConfigWriter`. No CLI use of `listPlugins`.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Optional initialization/plugin config            | OK              | init writes no `plugins` key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Test coverage (`packages/core/test/infrastructure/fs/config-writer.spec.ts`, `packages/core/test/composition/config-writer.spec.ts`): most scenarios covered.
Gaps (minor):

- No test for "Invalid plugin name leaves the file unmodified" (L218 only asserts the error type, not byte-identity).
- No test for "Plugin mutation on an absent config ... no file is created" asserting the file does not get created (L299 asserts the error only; not verified whether it checks non-creation).
- No test for "Non-default / custom `metadataPath` not relocated" and "non-filesystem repository" scenarios (the writer cannot express them, so these scenarios are untestable against the current API; the spec scenarios describe behaviour the code cannot differentiate).
- No test for "Config and contributions persisted and listed" round trip through `listPlugins` in one call (L160 covers update only). Not verified exhaustively.
- Composition spec `createConfigWriter` test title omits `listPlugins` (L7); cosmetic.

Discrepancies:

- [minor] `config-writer.ts` L243-249: orphan JSDoc block ("Parses a raw `plugins` value ... returning `[]` if invalid") sits above the real JSDoc for `requireMutablePlugins`, describing a function that no longer exists. Likely to trip the jsdoc lint rule or mislead. Remove it.
- [minor] Spec cross-reference: the port spec cites `PLUGIN_NAME_REGEX` of `plugin-manager:specd-plugin-type` but does not list it in `Spec Dependencies` (only `default:_global/architecture` and `core:config`). Same inversion as in section 1.

---

## 4. core:check-registry

Touched requirements: Immutability of built-in checks, Canonical namespacing and plugin registration, Open check registry, Two-tier governance (text only).

| Requirement                                           | Status         | Evidence                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutability of built-in checks / scoped plugin names | OK             | `check-registry.ts` L18, L240-244: imports `PLUGIN_NAME_REGEX` from `domain/plugin-name.ts` (`^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$`, matches spec exactly); `InvalidPluginNameError` on mismatch. Canonical id `${pluginName}.${check.id}` (single leading `@`). |
| Canonical namespacing and plugin registration         | OK             | `register(pluginName, check, defaultBindings?, options?)` L225; `DuplicateCheckError` on collision.                                                                                                                                                                     |
| Open check registry (public surface)                  | OK             | `get/has/list/bindings/getBindings/getGovernance/withExecutableBuiltins/register` all present (L131-225).                                                                                                                                                               |
| Two-tier governance, other requirements               | NOT RE-AUDITED | Untouched except wording; spot-checked via test names (Category A/B/C, archive exception, `allowSchemaEmbedding` defaults).                                                                                                                                             |

Test coverage (`packages/core/test/domain/services/check-registry.spec.ts`): scoped-name grammar (L52, L232, L558 `@@`, L574 hyphen/underscore), duplicate (L108), has/list (L435), getBindings/getGovernance unknown (L591), `withExecutableBuiltins` (L494), `getGovernance` (L173). All new scenarios covered.

Discrepancies:

- [minor] Stale test titles: L14 "registers custom predicate checks under the @<plugin>.<id> namespace" and L264 "enforces @ prefix namespace isolation..." still describe the old `@${plugin}` scheme. Behaviour is right (verified by assertions on `@acme/...` ids); titles are misleading.
- Cross-check, no issue: `composition/use-cases/workflow-check-registry.ts` L86 selects plugin bindings via `b.check.id.startsWith('@')`, still valid with scoped ids and with the "built-ins never start with `@`" invariant.

---

## 5. cli:config-show

| Requirement                                                                  | Status    | Evidence                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature                                                            | OK (note) | `packages/cli/src/commands/config/show.ts` L84-92. Command also accepts `--config <path>`, which the spec signature `specd config show [--format ...]` does not list (global `--config` is covered by cli:entrypoint; [minor] spec silent). |
| Output format (flat plugins section, `(present)` + ` [contributions: a, b]`) | OK        | L61-70, exactly matches spec format; suffix only with non-empty allowlist. json/toon serialize the `SpecdConfig` directly (L130).                                                                                                           |
| Help text                                                                    | OK        | L93-121 lists current fields, no `specsPath`/`isExternal`/`changesPath`; adds the plugin name grammar.                                                                                                                                      |
| Sensitive fields / Error cases                                               | OK        | Uses `loadConfig` (config loader only; `packages/cli/src/load-config.ts`), no host bootstrap, no plugin loading.                                                                                                                            |

Discrepancy:

- [minor] Spec says "Config warnings are emitted by the loader itself"; in code the warnings are emitted by the CLI helper `load-config.ts` (`console.warn` after `loader.load()`), not by the loader (which only attaches `config.warnings`). Observable behaviour is the same; wording differs.

Test coverage (`packages/cli/test/commands/config-show.spec.ts`): plugins section (L182, asserts `(present) [contributions: codex]`, which also covers "contributions allowlist shown"), no-suffix (L203), TOON (L219), help (L236), config-not-found (L254), JSON (L66).
Gaps (minor): "Broken plugin does not prevent config show" has no test (the suite mocks `loadConfig`, so it cannot detect plugin loading); "JSON output ... with plugins as the flat list" asserted only through the generic JSON test, not specifically on `plugins`.

---

## Contradictions with dependency/global specs

None blocking. `default:_global/architecture` layering respected: port in `application/ports`, no `node:fs`/`yaml` in the port, delivery goes through `createConfigWriter`. Only issue is the spec-level circular reference noted in sections 1 and 3.

## Summary

- Critical: 0
- Major: 0
- Minor: 9 (cascade array aliasing; spec dependency inversion on `PLUGIN_NAME_REGEX`; loader JSDoc churn; writer hardcoded `.specd` paths vs "resolved" wording; orphan JSDoc in writer; stale check-registry test titles; config-show warnings-emitter wording; writer/config-show test gaps; config-show `--config` flag unlisted in spec)

### \_partial-plugin-manager.md

# Compliance audit (partial): plugin-manager specs, change `plugin-architecture`

Scope: 11 specs of `plugin-manager`. Read-only. Package: `packages/plugin-manager`.
Package test run (`pnpm vitest run`): 15 files, 95 tests, all pass. `tsconfig` includes `test/`, so `pnpm typecheck` covers type-level tests.
Neither spec nor code is treated as the source of truth; both sides are shown on each discrepancy.

Totals: critical 0, major 2, minor 15 (unique findings M1-M2, m1-m15), plus test-coverage gaps listed per spec.

Paths below are relative to `packages/plugin-manager/` unless prefixed.

---

## 1. plugin-manager:specd-plugin-type

| Requirement                       | Status                                                                     |
| --------------------------------- | -------------------------------------------------------------------------- |
| SpecdPlugin interface             | PARTIAL (m1)                                                               |
| PluginContext                     | OK (`src/domain/types/specd-plugin.ts:7-15`)                               |
| isSpecdPlugin type guard          | OK (`specd-plugin.ts:118-142`, via `baseContractFields`)                   |
| Plugin manifest                   | OK (strict zod, `src/infrastructure/loader/plugin-loader.ts:35-46`)        |
| Plugin name                       | OK (`PLUGIN_NAME_REGEX` from core, identical regex)                        |
| Contribution identity and address | OK (`specd-plugin.ts:71-110`; id uniqueness in `plugin-loader.ts:305-311`) |
| Plugin configuration schema       | PARTIAL (M1, m2)                                                           |
| Contribution kind handler         | OK                                                                         |
| Plugin lifecycles                 | OK                                                                         |

Discrepancies:

- **m1 (minor)** `uninstall` return type.
  - Spec: `uninstall(context): Promise<unknown>`.
  - Code: `src/domain/types/specd-plugin.ts:58` declares `Promise<void>`.
  - A plugin returning a value from `uninstall` does not type-check against the base contract. `AgentPlugin.uninstall` also uses `Promise<void>`, which matches the agent-plugin-type spec.
- **M1 (major)** `configSchema` node shape is only partly validated.
  - Spec: "The shape of every node MUST be validated ... a node violating its shape MUST be rejected with a typed error naming the plugin, never silently degraded". It lists `type`, `required`, `additionalProperties` and `items`.
  - Code: `src/domain/services/plugin-config-schema.ts:78-117` (`walkSchema`) does not validate `enum` (nor whether it is an array of primitives). I probed with a throwaway spec file (removed afterwards):
    - `{type:'object', properties:{a:{type:'string', enum:'xy'}}}` passes `assertSupportedConfigSchema`, then `resolvePluginConfig` throws an untyped `TypeError: values.map is not a function` (`plugin-config-schema.ts:188-189`). This happens at `registerPlugins` time (and for `defaultConfig` at load time), not as a typed error naming the plugin.
    - `enum: []` is silently ignored at `plugin-config-schema.ts:127`, so any value is accepted.
  - `enum` is not in the spec's list of validated shapes, but the "never silently degraded" principle covers it. This is also a spec gap: it should list the `enum` shape rule.
- **m2 (minor)** Keyword name reported for shape violations.
  - Spec: shape violations are rejected "with a typed error naming the plugin". The spec is not explicit about which error class.
  - Code: they all use `UnsupportedSchemaKeywordError` with the offending keyword (`required`, `additionalProperties`, `items`, `type`). The class name is misleading for a shape error (for example a valid keyword with a bad value). This is consistent with plugin-errors' "also raised for non-object node", but the spec does not state it for shape violations.

Test coverage gaps:

- Scenarios "Install does not call init", "Mixed-kind agents ids only" and "Context carries options" are covered in the use-case specs.
- No test for "Handler validatePlugin receives plugin and name" with a custom (non-agents) handler. Only the agents handler's `validatePlugin` is exercised (`test/infrastructure/plugin-loader.spec.ts:463`). The `(plugin, pluginName)` argument contract is untested.
- No test for "Install-time-only kind ... no error at runtime" with a custom handler without `activate`. Only the agents-only case (`test/application/register-plugins.spec.ts:275`).
- No test for "Duplicate handler kind" of a non-`agents` kind in the loader (only the host `agents` case, `plugin-loader.spec.ts:454`; `registerPlugins` has a non-agents duplicate test at `register-plugins.spec.ts:376`).
- "Name and version sourced from manifest" is a factory-side behaviour. It is not testable in plugin-manager and is covered in the plugin-agent-\* packages (out of this batch).
- No test of `defaultConfig` plus `enum` malformed. No test of `required` with non-string entries or `type: "null"` through the loader. The unit test covers `type: 'date'`, `required: 'mode'`, `additionalProperties: {}` and `items` array (`test/domain/plugin-config-schema.spec.ts`).
- No test for the non-object root giving keyword `configSchema` (covered only by my probe, which confirmed the behaviour is correct).

Severity: 1 major (M1), 2 minor.

---

## 2. plugin-manager:plugin-loader

| Requirement      | Status                      |
| ---------------- | --------------------------- |
| Load workflow    | OK                          |
| Manifest schema  | OK                          |
| Error handling   | OK                          |
| Factory function | PARTIAL (m3, spec-internal) |

Verified:

- Resolution: project root first, then loader location (`plugin-loader.ts:232-237`). Manifest validated before `import()` (`:80-84`).
- Factory resolution: named `create`, default function, or default `{create}` (`:323-343`). Missing factory gives `PluginValidationError(['create'])` (`:86-88`).
- Cross-checks: requested name, manifest name, plugin name and version (`:133`, `:173-178`).
- `fields` lists exactly the failing base fields (`baseContractFields`).
- `createPluginLoader` merges handlers synchronously (`:270-272`), so `DuplicateHandlerKindError` is thrown before any load.
- `validatePlugin` is run per declared kind after the base check, then the `contribution` accessor check (`:179-188`).

Discrepancies:

- **m3 (minor, spec-internal)** Conflicting wording about the factory options object.
  - The requirement text says `create({ config })` receives `config` only and is "distinct from `PluginLoaderOptions`".
  - Verify scenario "Plugin exports create factory" says it "calls `create(options: PluginLoaderOptions)`".
  - Code (`plugin-loader.ts:89`) passes `{ config }` only, matching the requirement text. The scenario wording needs a fix in the spec.
- **m4 (minor)** Unreadable or non-JSON manifest.
  - Spec: error handling lists `PluginValidationError` for an invalid manifest. It does not distinguish the cause.
  - Code: `readManifest` (`:102-114`) maps both a read failure and a JSON parse failure to `PluginValidationError(['specd-plugin.json'])`, dropping the underlying cause. This is conformant but gives poor diagnostics (a missing file looks the same as bad JSON). There is also no test for a missing `specd-plugin.json` file.
- **m5 (minor)** `minCoreVersion` is parsed and defaulted (`:41`) but never enforced against the running core version. The spec only requires the field, so this is not a violation. Flagged as a possible gap in intent.

Test coverage gaps (`test/infrastructure/plugin-loader.spec.ts`, 20 tests):

- Missing: "Async factory awaited". Missing: "Factory receives config only" with a loader created with extra handlers. These are listed verify scenarios.
- Missing: "Two host handlers of one kind (`widgets`) rejected" at loader creation. Only the `agents` case exists.
- Missing: "Invalid block for kind" is in the multi-case test at `:174`, and the others are folded into the same big tests. Per-scenario traceability is weak but coverage is likely present. I did not verify every sub-case of `:174`.
- No test of "Loader does not run lifecycle" for `install` and `destroy`; only `init` (`:283`).

Severity: 3 minor, plus test gaps.

---

## 3. plugin-manager:register-plugins-use-case

| Requirement                     | Status                          |
| ------------------------------- | ------------------------------- |
| Signature                       | PARTIAL (M2)                    |
| Registration order              | OK                              |
| Selection and config validation | OK                              |
| Destroy and error isolation     | OK                              |
| Failure policy                  | OK                              |
| Bypass                          | OK (SDK part out of this batch) |

Verified:

- `src/application/use-cases/register-plugins.ts`:
  - Dedupe, then load, validate config and selection for all plugins (`:66-84`).
  - `init` in list order (`:116-124`), then activate (`:126-152`), then a single `specd-plugins` disposer (`:159`).
  - Rollback destroys only successfully initialized plugins in reverse order (`:88-98`, `:107-113`).
  - `rollbackErrors` is attached without replacing the original (`:191-199`).
  - A `SpecdError` from `init` or `activate` propagates unchanged, anything else becomes `PluginInitError` (`:120`, `:148`).
  - The handler merge runs before the empty-list short-circuit (`:59-64`).
- `src/infrastructure/loader/register-plugins.ts:14-40` exports `RegisterPluginsInput` (also re-exported by name from the package root). The public `registerPlugins` supplies the default loader.

Discrepancies:

- **M2 (major)** Duplicate-handler error is delivered inconsistently (sync throw vs rejected promise).
  - Spec (Signature): `registerPlugins(...)` returns `Promise<PluginRegistration>`, and duplicate handlers "MUST throw `DuplicateHandlerKindError` ... before loading any plugin". Verify scenario: "`DuplicateHandlerKindError` is thrown".
  - Code: the public wrapper `src/infrastructure/loader/register-plugins.ts:29-40` is a non-async function. When no `loader` is passed, `createPluginLoader` runs `mergeHandlers` synchronously (`:37`), so the error is thrown synchronously. I probed this and confirmed it: a sync throw, not a rejected promise. When a `loader` is passed, the error comes from the async inner function (`register-plugins.ts:59`) and is a rejection.
  - Impact: `registerPlugins(...).catch(...)` misses the first case. Callers using `await` inside `try` are fine. Fix by making the wrapper `async`, or by documenting it in the spec.
  - Tests only use the `loader`-supplied path (`test/application/register-plugins.spec.ts:376`, `:386`), so the sync-throw path is untested.
- **m6 (minor)** Handler merge happens twice when no loader is given (`createPluginLoader` and the application `registerPlugins`). The spec constraint says the merge "once per registration", sharing one routine. They do share `mergeHandlers`, but it runs twice. No functional effect.
- **m7 (minor)** Spec says `RegisterPluginsInput` `loader` defaults to "the standard plugin loader" and the "input argument defaults to `{}`". Code satisfies both. The application-level `registerPlugins` (not exported from the package root; only `PluginRegistration` is) has a different required-`loader` signature. This is fine, but note two functions share the name.

Test coverage gaps (`test/application/register-plugins.spec.ts`, 19 tests; uses a hand-rolled fake builder `:36-44`):

- Missing: "Called before build" using a real `KernelBuilder` (the spec explicitly says real). The test builder implements only `registerDisposer`.
- Missing: "Input defaults" (call without `input`, standard loader plus built-in `agents` handler).
- Missing: "Registration handle disposes plugins before any kernel exists" is partly covered (`:66`, `:246`), but I found no explicit check that a second `dispose()` is a no-op after a first successful dispose. `:246` covers idempotence with failures.
- Missing: "One named disposer" with three plugins checks `size` only, never the name `specd-plugins`.
- Missing: dedicated test that activation is skipped for handlers without `activate` while `init` runs, for a non-agents kind.
- Missing: the sync-throw path (M2).
- Bypass `plugins: false` is SDK-level (out of scope).

Severity: 1 major (M2), 2 minor.

---

## 4. plugin-manager:install-plugin-use-case

| Requirement                | Status                      |
| -------------------------- | --------------------------- |
| Input                      | OK                          |
| Output                     | OK                          |
| Behavior                   | OK                          |
| Error handling             | OK                          |
| Agent Initialization Phase | OK (delegated, informative) |

Code: `src/application/use-cases/install-plugin.ts:61-87`. Order: load, `resolveContributions` (throws `UnknownContributionError`), `installContextContributions` (agents-only filter), `isAgentPlugin` check, hook call, wrap non-`SpecdError`. No `init` call. `defaultConfig` returned only when declared.

Discrepancies:

- **m8 (minor)** Mixed plugin with only non-agent ids selected.
  - Spec: the spec says `contributions` carries only agents ids when `agents` is declared.
  - Code: for a manifest declaring `agents` and `checks` where only `audit` is selected, `install()` is called with `contributions: []` and `data` may be undefined. The spec does not say whether the hook should be skipped in that case. This is an edge case worth a decision.
- **m9 (minor)** The `AgentInstallContext` required by spec step 4 is not constructed separately. The code uses a plain `PluginInstallContext` typed as the base (`:68-72`). Structurally equivalent, as `options` is `Record<string, unknown>` and is not narrowed to `AgentInstallOptions`. No behavioural gap.

Test coverage gaps (`test/application/install-plugin.spec.ts`, 9 tests):

- Missing: "Contributions input is optional / all contributions selected by default" with two ids `a,b` (the tests use `claude`). The "Allowlist respected" case with a non-selected sibling is also unclear.
- Missing: "Options forwarded only when provided" as a pair (the second call must have `options` absent). The test at `:58` covers the present case only.
- The "Agent Initialization Phase" scenarios are integration-level and belong to the plugin-agent-\* packages and the skills package. They are not testable here, as the spec states.

Severity: 2 minor.

---

## 5. plugin-manager:uninstall-plugin-use-case

| Requirement    | Status |
| -------------- | ------ |
| Input / Output | OK     |
| Behavior       | OK     |
| Error handling | OK     |

Code: `src/application/use-cases/uninstall-plugin.ts:43-60`. Behaviour matches (`options` forwarded only when defined; agents-only filter; wrapping).

Discrepancies: none beyond m8 (same edge as install, empty `contributions` for non-agent selection).

Test coverage gaps (`test/application/uninstall-plugin.spec.ts`, 8 tests):

- Missing: "Mixed kinds pass only agents ids to the hook" (no `checks` contribution in any test).
- Missing: "Not tied to the agents bucket" (plugin without `agents`, `uninstall` receives selected ids).
- The "Output is void" check is implicit.

Severity: minor (coverage).

---

## 6. plugin-manager:update-plugin-use-case

| Requirement    | Status |
| -------------- | ------ |
| Input / Output | OK     |
| Behavior       | OK     |
| Idempotency    | OK     |
| Error handling | OK     |

Code: `src/application/use-cases/update-plugin.ts:58-83`. Identical flow to install, with no `defaultConfig` in the output.

Discrepancies: none beyond m8.

Test coverage gaps (`test/application/update-plugin.spec.ts`, 7 tests):

- Missing: "Mixed kinds pass only agents ids to the hook" and output `contributions` `['claude']`.
- Missing: "Selection is preserved" with a non-selected sibling `b` (tests use a single `claude` id).
- Missing: an explicit assertion that the output has no `defaultConfig`.

Severity: minor (coverage).

---

## 7. plugin-manager:list-plugins-use-case

| Requirement    | Status        |
| -------------- | ------------- |
| Input / Output | PARTIAL (m10) |
| Behavior       | OK            |

Code: `src/application/use-cases/list-plugins.ts:60-80`. Per-plugin try/catch, `PluginNotFoundError` gives `not_found`, other errors give `error` with the message. Order is preserved. `contributions` come from `declaredContributionIds`.

Discrepancies:

- **m10 (minor)** Input type.
  - Spec: output example uses `pluginNames: string[]`, while the text says `readonly string[]`.
  - Code: `readonly string[]` (`list-plugins.ts:12`). The spec is internally inconsistent; the code matches the text.
- **m11 (minor)** `status: 'loaded'` entries also include the `plugin` instance (a loaded, factory-created plugin). Spec lists `plugin?` in the shape, so conformant. The `error` message is `error.message` only (no plugin name guaranteed for non-typed errors).

Test coverage gaps (`test/application/list-plugin.spec.ts`, 2 tests):

- Missing: "Output preserves input order" with names `b,a` (the existing test at `:38` checks statuses for a mixed list, but not reverse-lexicographic order).
- Missing: "Loaded plugin reports contributions" with two ids `a,b` (the test uses `['claude']` only).
- Missing: "Invalid manifest is an error entry" for an unscoped manifest name (the first test uses an invalid plugin, not verified for unscoped-name case).

Severity: minor.

---

## 8. plugin-manager:agent-plugin-type

| Requirement                      | Status                               |
| -------------------------------- | ------------------------------------ |
| AgentPlugin extends SpecdPlugin  | OK                                   |
| Agents contribution kind handler | OK                                   |
| AgentInstallOptions              | OK (types only)                      |
| AgentInstallResult               | OK                                   |
| Agent installation and fallback  | N/A here (plugin-agent-\* behaviour) |
| isAgentPlugin type guard         | OK                                   |

Code: `src/domain/types/agent-plugin.ts`, `src/domain/handlers/agents-handler.ts`.

- `blockSchema` is a `z.record(idRegexKey, z.object({}).strict())`. It has no `activate`. `validatePlugin` requires `isAgentPlugin`. Merge is built in (`merge-handlers.ts`).

Discrepancies:

- **m12 (minor)** `AgentInstallContext` is defined as `extends Omit<PluginInstallContext, 'options'>` with its own `options?: AgentInstallOptions` (`agent-plugin.ts:42-45`). The spec says `extends PluginInstallContext` with `options?: AgentInstallOptions`. Equivalent in practice (the narrowing needs the `Omit` because `options` there is `Record<string, unknown>`). It also means an `AgentPlugin` is not assignable where a plain `SpecdPlugin.install(context: PluginInstallContext)` parameter is expected under strict function types. Tests cover this only via the recursive-variables typing test.
- The `Bad.Id` rejection comes from zod's record key regex, giving a `PluginValidationError` listing a path like `contributes.agents.Bad.Id`; this works but the path is ambiguous because ids with dots look like nested paths. Cosmetic.

Test coverage gaps:

- Missing: "Rejects plugin without uninstall method" (`isAgentPlugin` with `install` only; the tests have "without install" only, `test/domain/types/is-agent-plugin.spec.ts:26`).
- Missing: "Built-in handler needs no host wiring" as an explicit scenario for `registerPlugins`.
- Missing: "No runtime activation: nothing registered on the builder for `agents`" (the `registerPlugins` test at `:275` checks `init` only, not that the builder received nothing).
- Capability and fallback scenarios (frontmatter, shared folder, `capabilities` gating) are not testable in plugin-manager; they belong to plugin-agent-\* and skills specs.

Severity: minor.

---

## 9. plugin-manager:load-plugin-use-case

| Requirement    | Status |
| -------------- | ------ |
| Input / Output | OK     |
| Behavior       | OK     |

Code: `src/application/use-cases/load-plugin.ts:33-35` is a pure delegation. The base-contract check is the loader's job, as the spec says.

Discrepancies: none.

Test coverage gaps (`test/application/load-plugin.spec.ts`, 2 tests):

- Missing: "No lifecycle calls" (`init`, `install`, `destroy` not called). The use case trivially cannot call them, but the scenario is untested.

Severity: none (trivial).

---

## 10. plugin-manager:plugin-errors

| Requirement                           | Status                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| PluginNotFoundError                   | OK (`src/domain/errors/plugin-not-found.ts`, code `PLUGIN_NOT_FOUND`) |
| PluginValidationError                 | OK (code `PLUGIN_VALIDATION_ERROR`, `fields`, `cause`)                |
| Contribution and configuration errors | OK                                                                    |
| Host wiring and address errors        | OK                                                                    |

All codes match the spec. `DuplicateHandlerKindError` has `kind` and no `pluginName`. `PluginInitError` carries `cause`. Every message contains the plugin name.

Discrepancies:

- **m13 (minor)** `fields` type: spec says `string[]`, code is `readonly string[]` (`plugin-validation.ts:27`). The spec text elsewhere says `readonly string[]`, so the first block is stale.
- **m14 (minor)** Error-handling conventions (global spec `specs/_global/error-handling-conventions`): the "SHOULD define a package-level base error class" is not followed. All errors extend `SpecdError` directly. Messages describe the problem but do not suggest a fix ("MUST ... tell the user how to fix the problem whenever possible"; the plugin-errors spec says "actionable message"). For example `Plugin 'x' failed validation: init, destroy` does not say what is expected. Low severity because the global text says "whenever possible".

Test coverage gaps (`test/domain/errors.spec.ts`, 1 test):

- Missing: `PluginNotFoundError` code and `pluginName` assertions.
- Missing: `UnsupportedSchemaKeywordError.keyword` for the non-object root vs nested case (the loader and domain tests only check the class).
- Missing: per-class "message contains plugin name" is asserted only for `PluginInitError`, `PluginValidationError` and `DuplicateHandlerKindError`. The spec requires it "asserted per class". `DuplicateContributionError`, `UnknownContributionError`, `UnknownContributionKindError`, `InvalidPluginConfigError` and `UnsupportedSchemaKeywordError` messages are not asserted.
- "Has no `pluginName`" for `DuplicateHandlerKindError` is not asserted.

Severity: minor.

---

## 11. plugin-manager:plugin-repository-port

| Requirement                    | Status                                      |
| ------------------------------ | ------------------------------------------- |
| PluginRepositoryPort interface | PARTIAL (m15)                               |
| ConfigWriter conformance       | OK                                          |
| Implementation note            | OK (CLI is out of this batch; not verified) |

Code: `src/application/ports/plugin-repository.ts`. `DeclaredPlugin = ConfigDeclaredPlugin`, and the method signatures are `configPath`-first. The only exported name is `PluginRepositoryPort` (the old `PluginRepository` is gone).

Discrepancies:

- **m15 (minor)** `listPlugins` return type.
  - Spec: signatures "MUST match `ConfigWriter` exactly".
  - Port: `Promise<readonly DeclaredPlugin[]>` (`plugin-repository.ts:35`).
  - Core: `Promise<ConfigDeclaredPlugin[]>` (`packages/core/src/application/ports/config-writer.ts:93`).
  - Assignability holds (covariant), but it is not an exact match. The spec's interface block also redeclares `AddPluginOptions` locally, while the code re-imports it from core.

Test coverage gaps (`test/application/plugin-repository-port.spec.ts`, 1 test):

- The conformance test is a type-level assertion (`ConfigWriter extends PluginRepositoryPort`). It is sound because tests are included in `tsc`, but it only fails under `pnpm typecheck`, not `vitest`. Fine, but there is no guard that CI runs typecheck on `test/`.
- Missing: assertion that `DeclaredPlugin` is the same type as `ConfigDeclaredPlugin` (for example a mutual-extends check).
- Missing: a check that a drifting method signature fails (the "Signature drift" scenario is by nature a compile-time property and is not demonstrated).

Severity: minor.

---

## Cross-spec and dependency / global-spec checks

- `core:config` (flat plugins list): code consumes `config.plugins` as `{name, config?, contributions?}` (core `specd-config.ts:270-276`). Core validates duplicate names at load; plugin-manager also rejects duplicates with `PluginValidationError` (`register-plugins.ts:66-72`), a harmless defence. No contradiction.
- `core:kernel-builder`: `registerDisposer(name, dispose: () => void | Promise<void>)` (`packages/core/src/composition/kernel-builder.ts:203`) matches usage. `registerDisposer` failure triggers rollback (`register-plugins.ts:158-162`), which is a good extra.
- `default:_global/architecture`: the domain layer imports only core types and zod (`@specd/core/extensions` type in `contribution-kind-handler.ts`), with no I/O. All `node:fs` use is in `infrastructure/`. No violation. The global spec text says "currently `@specd/core` is the only such package"; plugin-manager has the three-layer layout anyway. This is a stale sentence in the global spec, not a code issue.
- Spec-internal inconsistencies to fix in the specs: m3 (`PluginLoaderOptions` vs config-only factory options), m10 (`string[]` vs `readonly string[]`), m13 (`fields: string[]`).
- The `plugin-agent-*` and `@specd/skills` behaviours referenced by the "Agent Initialization Phase" and "Agent installation and fallback" requirements are out of this batch. Only the plugin-manager side was audited.

## Summary table

| Spec                      | Critical | Major  | Minor             |
| ------------------------- | -------- | ------ | ----------------- |
| specd-plugin-type         | 0        | 1 (M1) | 2 (m1, m2)        |
| plugin-loader             | 0        | 0      | 3 (m3, m4, m5)    |
| register-plugins-use-case | 0        | 1 (M2) | 2 (m6, m7)        |
| install-plugin-use-case   | 0        | 0      | 2 (m8, m9)        |
| uninstall-plugin-use-case | 0        | 0      | 0 (coverage only) |
| update-plugin-use-case    | 0        | 0      | 0 (coverage only) |
| list-plugins-use-case     | 0        | 0      | 2 (m10, m11)      |
| agent-plugin-type         | 0        | 0      | 1 (m12)           |
| load-plugin-use-case      | 0        | 0      | 0                 |
| plugin-errors             | 0        | 0      | 2 (m13, m14)      |
| plugin-repository-port    | 0        | 0      | 1 (m15)           |
| Total                     | 0        | 2      | 15                |

Note: m8 applies to install, uninstall and update but is counted once (under install).

### \_partial-cli.md

# Partial compliance report: batch cli (change plugin-architecture)

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: merged spec previews (spec + verify) compared against `packages/cli/src` and `packages/cli/test`; plugin-manager checked for `init` calls. Read-only; no code or spec modified.

Totals: critical 0, major 0, minor 7 (all minor are test-coverage gaps or spec-silent edge behaviors). No requirement is MISSING or PARTIAL.

Paths below are relative to `packages/cli` unless stated.

---

## cli:plugins-install (src/commands/plugins/install.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `install <plugin...>` + `--contributions` (l.115-118). Name check via `isPluginName` from sdk before any load (l.58, l.176). `--contributions` with !=1 plugin -> `cliError` exit 1 (l.128-130).                                                                                                          |
| Declaration source             | OK     | `getDeclaredPlugins(config)` reads `config.plugins` (l.52); no `kernel.project.listPlugins` / `ConfigWriter.listPlugins`.                                                                                                                                                                                 |
| Display name                   | OK     | `Installed plugins:` printed in text mode (l.161).                                                                                                                                                                                                                                                        |
| Already-installed              | OK     | warning `<name> already installed; use 'specd plugins update'` (l.69) contains "already installed" then "update"; InstallPlugin/addPlugin skipped. Duplicate in one invocation handled by `declaredSet.add` (l.89).                                                                                       |
| Installation workflow          | OK     | `InstallPlugin.execute` with contributions (l.80-84); `addPlugin(configPath, name, {config?, contributions?})` with config only when `defaultConfig !== undefined` and contributions only when flag given (l.85-88); per-plugin try/catch continues (l.95-101). No `kernel.project.addPlugin`, no `init`. |
| Host bootstrap without plugins | OK     | `resolveCliContext({ configPath, plugins: false })` (l.131-134).                                                                                                                                                                                                                                          |
| Exit code                      | OK     | `CliExitError(1)` after rendering when `hasErrors` (l.144-146).                                                                                                                                                                                                                                           |
| Output format                  | OK     | `{ plugins:[{name,status,detail}], hasErrors }` (l.26-31, l.167).                                                                                                                                                                                                                                         |

Discrepancies / notes:

- Minor (spec-silent edge): `--contributions ""` or `","` yields `[]` (install.ts:124-127) which is then passed through as an explicit empty selection rather than a usage error. Spec does not define it.
- `detail` is always a string in code (`PluginInstallEntry.detail: string`) whereas spec says "optional `detail`". Compatible.

Test coverage gaps (test/commands/plugins.spec.ts):

- Minor: scenario "Duplicate name in one invocation" (`@acme/x @acme/x` installed once, second reported already installed) has no test.
- Minor: scenarios "does not call `kernel.project.listPlugins` / `ConfigWriter.listPlugins`" are not asserted (mock declares `listPlugins: vi.fn()` at l.51 but never `expect(...).not.toHaveBeenCalled()`).
- Minor: "Init is not called" not asserted for install.
- Covered: valid name, unscoped rejection, contributions restriction + multi-plugin rejection (l.135), defaultConfig persisted / no empty config (l.161), already installed (l.189), failure continuation (l.204), header (l.238), JSON shape (l.246), exit 1 (l.272), `plugins:false` (l.132).

---

## cli:plugins-uninstall (src/commands/plugins/uninstall.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `uninstall <plugin...>` (l.29).                                                                                                                                                                                                                                                                                                                                             |
| Uninstall workflow             | OK     | `findDeclaredPlugin` (l.51) -> error when undeclared without calling plugin (l.52-54); `UninstallPlugin.execute` with `contributions` from the entry when present (l.55-61, absent -> use case default "all"); `removePlugin` only after a successful hook (l.62), so a throwing hook retains the declaration. No `kernel.project.removePlugin`, no type bucket, no `init`. |
| Host bootstrap without plugins | OK     | l.37-40.                                                                                                                                                                                                                                                                                                                                                                    |
| Exit code                      | OK     | l.79-81; loop continues on error.                                                                                                                                                                                                                                                                                                                                           |
| Output                         | OK     | text lines; structured `{ plugins }` only (l.101) - matches spec (no `hasErrors` required here).                                                                                                                                                                                                                                                                            |

Discrepancies: none.
Test coverage: plugins.spec.ts l.354, 372, 398 (allowlist + plugins:false), 409 (hook failure keeps declaration, next plugin processed), 440 (undeclared). Minor: the "non-agent plugin with no uninstall hook" scenario is a plugin-manager concern and is not exercised at CLI level (mocked use case); acceptable.

---

## cli:plugins-update (src/commands/plugins/update.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                              |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `update [plugin...]` (l.102).                                                                                                                                                         |
| Declaration source             | OK     | `getDeclaredPlugins(config)` (l.44).                                                                                                                                                  |
| Update behavior                | OK     | no args -> all declared (l.47-50); undeclared name -> error entry without calling `UpdatePlugin` (l.58-67); recorded allowlist forwarded (l.73-75); no ConfigWriter usage, no `init`. |
| Host bootstrap without plugins | OK     | l.110-113.                                                                                                                                                                            |
| Exit code                      | OK     | l.120-122.                                                                                                                                                                            |
| Output                         | OK     | statuses `updated`/`error` only; `{plugins, hasErrors}`; text `no plugins to update` (l.137-139).                                                                                     |

Discrepancies: none.
Test coverage (test/commands/plugins-update.spec.ts): all, named, undeclared, allowlist + no config write + plugins:false (l.134-144), failure continuation, empty message. Minor: JSON-shape and "idempotent twice" scenarios not explicitly asserted (project-update spec covers JSON shape on the shared function).

---

## cli:plugins-list (src/commands/plugins/list.ts)

| Requirement             | Status | Evidence                                                                                                                                                                                                                             |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature       | OK     | no `--type` option.                                                                                                                                                                                                                  |
| Declaration source      | OK     | `getDeclaredPlugins(config)` (l.46); `plugins:false` (l.42-45).                                                                                                                                                                      |
| Plugin status detection | OK     | `ListPlugins` loader status mapped `loaded -> installed`, `not_found`, `error` with `detail` (l.88-99). Non-loaded: `declared=[]`, `selected = allowlist ?? []` (l.90-91).                                                           |
| Output format           | OK     | JSON `{plugins:[{name, contributions:{declared,selected}, status, version?, detail?}]}`; text shows version or `-`, selected, available; `no plugins declared` when empty (l.109-112); JSON `{plugins: []}` (l.128 with empty rows). |

Discrepancies: none. Notes (minor, non-blocking): text mode prints an extra `Installed plugins:` header (l.113) for list; spec does not define it (the header is mandated only for install). The header is misleading for rows with `not_found`/`error` status.
Test coverage (plugins.spec.ts l.286, 299, 310, 451, 480): good. Minor: "Lists with a broken configured plugin" is only verified by `plugins:false` argument, which is what the spec requires.

---

## cli:plugins-show (src/commands/plugins/show.ts)

| Requirement       | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature | OK     | `show <plugin>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Output            | OK     | name, version, contributions `{kind,id,address}` via `buildContributionAddress` (returns `<name>.<id>`, plugin-manager specd-plugin.ts:81), `configSchema`/`defaultConfig` when present, `capabilities` only when `install`/`uninstall` hook exists or `agents` kind declared (l.91-97); omitted otherwise in text and JSON (l.50, l.70). `plugins:false` (l.28-31); `init` never called (LoadPlugin does not init; the only `.init(` in plugin-manager is `register-plugins.ts:118`). |
| Error handling    | OK     | load failure -> `handleError` -> CliExitError exit code (test l.488).                                                                                                                                                                                                                                                                                                                                                                                                                  |

Discrepancies: none. (Capability derivation lists `install` and `uninstall` independently; spec text is consistent.)
Test coverage (plugins.spec.ts l.320, 343, 488, 498): good. Minor: no assertion that `init` is not called on the loaded plugin in show (test at l.343 title mentions init omission from text only).

---

## cli:project-init (src/commands/project/init.ts)

| Requirement                    | Status        | Evidence                                                                                                                                                                                                                                         |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature              | OK            | flags l.47-52; `specd init` alias registered in program.ts (covered by tests l.338-452). `--schema` has no commander default but falls back to `@specd/schema-std` (l.84).                                                                       |
| Interactive mode               | OK            | TTY && fmt text && no flag with source `cli` (l.71-77). Banner only in wizard (l.171-178); prompts schema/workspace/path/multiselect `required:false` (l.197-234); cancel -> exit before `initProject` (l.202-238).                              |
| Known plugin options           | OK            | exactly claude, copilot, codex, opencode, standard (l.14-20).                                                                                                                                                                                    |
| Non-interactive mode           | OK            | text output l.100-107; JSON l.109-119 including `metadataCachePath` from `initResult`.                                                                                                                                                           |
| Config file placement          | OK            | `resolveProjectRoot` uses VCS root else cwd (l.28-35).                                                                                                                                                                                           |
| Delegation to ConfigWriter     | OK            | `createConfigWriter().initProject(...)`, no InitProject/kernel.project.init; `metadataCachePath` taken from the result (l.102, 115). tmp/.gitignore, metadata dir, .gitignore handled in core (not in CLI scope of this batch; batch core owns). |
| Plugin installation after init | OK            | names validated before `initProject` (l.67-70, exit 1); post-init `resolveCliContext({configPath, plugins:false})` (l.147-150) then shared `installPluginsWithKernel`; failure keeps init output, reports per plugin, exit 1 (l.122-124).        |
| Already initialised            | OK (see note) | Non-interactive: `initProject` throws -> `handleError` -> exit 1 with `error:`; interactive: confirm overwrite/cancel (l.184-195).                                                                                                               |

Discrepancies:

- Minor: interactive overwrite path only asks a confirm question with the path in the message; spec says the wizard "informs the user and asks" - effectively equal.
- Minor (spec-silent): interactive cancel exits with code 0 (`CliExitError(0)`, l.192, 204...). Spec says only "aborts the command without writing anything".
- Minor: interactive wizard does not re-validate plugin names, but the options come from a fixed known list so this is safe.
- Note: the existing-config conflict in non-interactive mode relies on core's `initProject` error (not tested here with a real filesystem; the CLI test l.408 uses a mock).

Test coverage (test/commands/project-init.spec.ts): `--plugin` flow (l.95, with `plugins:false` l.120), opencode, JSON with plugins, unscoped rejection before write (l.181), install failure exit 1 (l.200), explicit default flag stays non-interactive (l.222), wizard + banner (l.245), cancel/overwrite (l.265, 291), no banner non-interactive (l.320), alias (l.339-452). Minor gaps: no CLI-level test that exactly the five known options are offered; "metadataCachePath not recomputed" not asserted; filesystem scenarios (standard dirs, tmp gitignore, metadata gitignore, `configVersion: 2`) are core ConfigWriter responsibilities and are not verifiable in CLI tests (mocked writer).

---

## cli:project-update (src/commands/project/update.ts)

| Requirement        | Status | Evidence                                                                                                                                                                                         |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature  | OK     | `--format` (and extra `--config`).                                                                                                                                                               |
| Plugin update step | OK     | shares `updatePluginsWithKernel` (l.39), `plugins:false` (l.35-38), no config write.                                                                                                             |
| Output on success  | OK     | `plugins: updated <name>` / `plugins: error <name> (<detail>)` (l.52-56); empty -> `project is up to date` / `{plugins:[],hasErrors:false}` (l.41-47); structured `{plugins, hasErrors}` (l.59). |
| Partial failure    | OK     | all plugins processed, exit 1 via `CliExitError` (l.62-64). Missing specd.yaml surfaces from `resolveCliContext` and `handleError`.                                                              |

Discrepancies: none. Note: when plugins empty and `hasErrors` cannot be true, so early `return` is safe.
Test coverage (project-update.spec.ts l.41-116): text prefix + plugins:false, up-to-date, JSON, exit 1, hasErrors, load failure. Minor: the allowlist scenario and `specd.yaml` untouched are not asserted in project-update tests (covered in plugins-update tests for the shared function).

---

## cli:host-context (src/helpers/cli-context.ts, cli-host.ts, cli-cleanup.ts, cli-signals.ts, run.ts, graph-index-task.ts)

| Requirement                                    | Status | Evidence                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| resolveCliContext delegates to openSpecdHost   | OK     | `openCliHost({configPath?, options:{kernel: buildCliKernelOptions(), plugins?}})` (cli-context.ts:91-97); plugins omitted -> SDK default `true`; warnings read from `host.config.warnings`, emitted once (l.99-103). All five plugin commands and project update pass `plugins:false`. |
| CLI kernel options preservation                | OK     | `buildCliKernelOptions` (l.44-71) verbosity, TTY format, optional callback.                                                                                                                                                                                                            |
| Host bootstrap entry point                     | OK     | Grep: `openSpecdHost`/`createSdkContext` appear only in `helpers/cli-host.ts` and `graph-index-task.ts` (worker, exempted). `resolveSdkHostContext` is gone; `withProvider` uses `openCliHost` (with-provider.ts:28-29).                                                               |
| CLI host-opening helper                        | OK     | `openCliHost` overloads for both forms, forwards input unchanged, registers `host.dispose()` after successful open only (cli-host.ts:40-50).                                                                                                                                           |
| CliContext exposes dispose                     | OK     | Result is the SDK host plus config/configFilePath; cleanup registry guarantees release.                                                                                                                                                                                                |
| CLI cleanup registry                           | OK     | reverse order, memoized promise, per-cleanup try/catch, AggregateError flattened, `warning: cleanup failed: <msg>`; late registrations run immediately (cli-cleanup.ts:47-92).                                                                                                         |
| Entrypoint triggers cleanup on every exit path | OK     | `run.ts` awaits `runCliCleanup()` after success and error paths before `process.exit`; signal handlers run cleanup then exit 130/143 (cli-signals.ts). Only `run.ts` and `cli-signals.ts` call `process.exit`.                                                                         |
| Graph index worker                             | OK     | `plugins:false` in both branches, `host.dispose()` in `finally` (graph-index-task.ts:62-72, 76-79).                                                                                                                                                                                    |
| CLI package runtime dependencies               | OK     | package.json depends on `@specd/sdk` and no `@specd/core` / `@specd/code-graph`; no source imports from them. (`@specd/guide`, `@specd/plugin-*`, `@specd/schema-std` are outside the stated platform trio.)                                                                           |

Discrepancies: none.
Test coverage: cli-context.spec.ts (verbosity, plugins default/false, warnings once, dispose via cleanup, source scan for direct SDK bootstrap), cli-host.spec.ts (both forms, forwarding, failed open), cli-cleanup.spec.ts, cli-signals*.spec.ts, run*.spec.ts, graph-index-task.spec.ts.

- Minor: scenario "Worker opens its host without plugins ... from a bootstrap context" - `plugins:false` is asserted only for the configured branch (graph-index-task.spec.ts:39); the bootstrap-mode test (l.80-110) does not assert the `createSdkContext` second argument contains `plugins: false`.
- Minor: scenario "Optional onLog callback wired / log entry reaches the callback" is not clearly covered in cli-context.spec.ts beyond kernel options mapping (not verified in depth).

---

## Cross-spec / dependency contradictions

- None found against direct dependencies (`plugin-manager:*` use cases, `core:config-writer-port` add/removePlugin, `core:get-config`), all of which are consistent with the CLI usage. `cli:project-init` references `core:composition` `createConfigWriter()`; the CLI imports it from `@specd/sdk` re-exports, consistent with `cli:host-context` dependency rule.
- The mock-heavy CLI tests cannot confirm that the real `InstallPlugin` returns `defaultConfig` / `message` as the install command assumes (`InstallPluginOutput` is typed, so a type-level contract exists).

## Severity summary

- Critical: 0
- Major: 0
- Minor: 7
  1. install: duplicate-name-in-one-invocation untested.
  2. install: "no listPlugins calls" and "init not called" not asserted.
  3. install: `--contributions ""` yields empty selection (spec-silent).
  4. list: extra "Installed plugins:" header in list text (spec-silent).
  5. project-init: cancel exit code 0 / overwrite wording (spec-silent); no CLI test for the five known options.
  6. project-update: allowlist / untouched config scenarios not asserted at project-update level.
  7. host-context: bootstrap-mode worker `plugins:false` assertion missing.

### \_partial-sdk-agents.md

# Compliance audit (partial): batch sdk-agents — change `plugin-architecture`

Read-only audit. Specs read via `changes spec-preview`; code/tests read directly. Totals: critical 0, major 2, minor 9.

---

## sdk:composition — requirements: 6 of 7 OK, 1 PARTIAL

| Requirement                                | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identity and dependencies          | OK. `packages/sdk/package.json:15-19` lists only core, code-graph, plugin-manager. plugin-manager depends only on core (`packages/plugin-manager/package.json:32-35`). Tested in `sdk/test/composition/package-boundary.spec.ts`.                                                                                                                                                                                                                                                                                                   |
| Layer structure                            | OK. `src/` has composition, orchestration, presentation, shared, domain; no `infrastructure/`. `src/domain/errors` holds only `InvalidProviderLifecycleError`. `exports["."]` points to `dist/index.js` and `dist/index.d.ts` (`package.json:20-23`). `./ports` and `./extensions` subpaths exist.                                                                                                                                                                                                                                  |
| Public barrel exports                      | OK. Checked in `src/index.ts` and `src/core-reexports.ts`: no `export * from '@specd/core'` (the `export *` is from the local `core-reexports.js`). The plugin error classes, `ContributionKindHandler`, `ContributionActivationContext`, `isPluginName`, `PLUGIN_NAME_REGEX` (`core-reexports.ts:526-527`) and `createConfigWriter` (`core-reexports.ts:4`) are exported. The Materialize/Get/Regenerate/InitializePersisted use cases and factories are present. No Save/Update/Invalidate/Persist SpecMetadata symbols in `src`. |
| Public barrel exports for host adapters    | OK. Verified against `src/index.ts:60-140`: `runIsolatedGraphIndex`, the worker error classes, `createGetGraphHealth`, fingerprint helpers, `createBootstrapGraphConfig`, `GraphSpecNotFoundError` alias, `DEFAULT_HOTSPOT_KINDS` and `CODE_GRAPH_VERSION` are all there. No lock helpers are exported.                                                                                                                                                                                                                             |
| Import policy for integrators              | PARTIAL. See discrepancy D1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Version constant                           | OK (`index.ts:end`, `SDK_VERSION` read from package.json).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Implementation review public orchestration | OK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Discrepancies

**D1 (major) — CLI depends on more specd packages than the verify scenario allows.**

- Spec side: scenario "CLI has no direct core dependency" says "only `@specd/sdk` is listed among specd platform packages". The requirement itself says hosts MUST depend on `@specd/sdk` only, not on core and code-graph as parallel dependencies. The error-class requirement says hosts catch plugin errors "without depending on plugin-manager directly".
- Code side: `packages/cli/package.json:30-38` lists `@specd/sdk` plus `@specd/guide`, `@specd/plugin-agent-claude`, `-codex`, `-copilot`, `-opencode`, `-standard`, `@specd/plugin-manager` and `@specd/schema-std`.
- Code imports `InstallPlugin`, `UninstallPlugin`, `UpdatePlugin`, `ListPlugins`, `createPluginLoader` directly from `@specd/plugin-manager` (`cli/src/commands/plugins/{install,uninstall,list,show,update}.ts`). The SDK does not re-export these.
- There is no direct core or code-graph dependency in the CLI, so the requirement text is met. The scenario text is stricter than the code. The plugin-manager use cases and loader are not on the SDK surface.
- Resolution: either loosen the scenario to "no direct core or code-graph dependency", or add SDK re-exports. The requirement and the SDK public-barrel list do not mention the plugin-manager use cases.

**D2 (minor) — scenario "Plugin may depend on core directly" is weakly tested.** It is only half covered by `package-boundary.spec.ts` (it checks that plugin-manager does not depend on the SDK).

### Test coverage gaps

- No test for "CLI has no direct core dependency" (it would fail as written, see D1).
- No test asserting that `src/` has no `infrastructure/` directory, or that `domain/` holds no entities or ports.
- No test that `exports` contains no `shared` subpath. `barrel.spec.ts:180` covers part of it.
- No test for "Dependency graph stays acyclic" beyond plugin-manager's own package.json.

---

## sdk:host-context — requirements: 4 of 4 OK

| Requirement              | Status                                                                                                                                                                                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SdkHostContext shape     | OK. `host-context.ts:31-41`: `kernel`, `createGraphProvider`, `dispose`, plus `AsyncDisposable`. No stored config.                                                                                                                                                                                                                             |
| createSdkContext         | OK. `host-context.ts:96-123`. The builder is created from `config` and `options.kernel`. `registerPlugins` runs unless `plugins === false`. On build failure the registration is disposed. Dispose failures are attached as `rollbackErrors` and the build error propagates (`:134-165`). `createGraphProvider` closes over the same `config`. |
| openSpecdHost            | OK. `:136-172`. Mixed `configPath` and `startDir` are rejected. The bootstrap fallback is gated on `allowBootstrapFallback`, no `configPath`, and `ConfigNotFoundError`. It resolves the VCS root through `createVcsAdapter`. The result spreads the context.                                                                                  |
| Host disposal            | OK. `dispose` delegates to `kernel.dispose()`. `Symbol.asyncDispose` is the same function. Graph providers are not closed. No API wraps a foreign kernel.                                                                                                                                                                                      |
| Config mutation boundary | OK.                                                                                                                                                                                                                                                                                                                                            |

### Discrepancies

- **D3 (minor)** — `attachRollbackErrors` (`host-context.ts:165` area) silently drops rollback errors when the build error is a primitive or `null`. This is a corner case not covered by the spec ("attached to it as `rollbackErrors`"). The rollback errors are lost in that case.
- **D4 (minor)** — `openSpecdHost` always calls `createDefaultConfigLoader({ startDir })` in discovery mode, and passes `process.cwd()` when `startDir` is absent. This matches the spec. When the fallback fires, `createSdkContext` is run with `plugins` according to `input.options`. The bootstrap config has no plugins, so this is harmless.

### Test coverage

- All listed scenarios have tests in `host-context.spec.ts` and `host-context-e2e.spec.ts`: plugins before build, plugins false, empty plugin list, broken plugin, build failure, rollbackErrors, e2e init and destroy order, extra handlers, fallback, explicit-config no-fallback, await using, no foreign-kernel wrap.
- Gap: no test for a non-object build error with a dispose failure (see D3).

---

## skills:shared-folder-owners — requirements: 5 of 5 OK

Implementation: `packages/skills/src/application/shared-folder-owners.ts`. Exports are in `skills/src/index.ts:23-26`.

- **Owners marker file**: OK. `serializeMarker` writes sorted, deduplicated, pretty JSON. Invalid, unreadable or missing files are treated as absent. Reads do not repair.
- **Registering an owner**: OK. Creates the folder with `mkdir -p`. Re-registering is a byte-identical no-op. An invalid marker is replaced by `[agentId]`.
- **Releasing an owner**: OK. Returns `{remaining, hadMarker}`. The marker is deleted when none remain. Non-owner release returns `hadMarker: true` with the owners unchanged. No marker means nothing is created or modified.
- **Removing the folder only when empty**: OK. Uses `rmdir`, swallows `ENOTEMPTY` and `ENOENT`, rethrows the rest.
- **Uninstall protocol for agent plugins**: implemented in each plugin (see below). OK in all five.

### Discrepancies

- **D5 (minor)** — Constraint "helpers use only `node:fs/promises`": the file also imports `node:path`. This is harmless, but the constraint wording is slightly off.
- **D6 (minor)** — `readMarkerFile` treats a missing file as `undefined`. In `removeSharedOwner` it is equivalent to "no marker". Behavior is correct.

### Tests

Tests are in `skills/test/application/shared-folder-owners.spec.ts` (12 tests) plus `shared-folder-owners-eacces.spec.ts` (EACCES rethrow). All spec scenarios for the helpers are covered. Gap: the "Uninstall protocol" scenarios exist per plugin only (see the table below).

---

## Agent plugins (claude, copilot, codex, opencode, standard)

All five share the same structure, so the common findings come first.

Common checks, all OK in all five:

- `create()` is an async factory that reads the manifest from its own directory, then from the parent. No `type` property. The class takes `name` and `version` in its constructor.
- Manifest: `schemaVersion: 2`, `contributes.agents.<id>`, no `pluginType`. Verified in the five `specd-plugin.json` files.
- `install` and `uninstall` take `AgentInstallContext` and forward `context.config` and `context.options`.
- Bundles go through `ResolveBundle`. Capability arrays are literals. There is no `buildCapabilities` helper and no direct `getBundle` call.
- `addSharedOwner` is called after writes when `wroteShared`, for filtered and unfiltered installs.
- A filtered uninstall returns before touching the prompt block, the marker or shared files.
- The full uninstall follows the owners protocol: `removeSharedOwner`, then delete `shared.md` plus `<agent>.agent.md` plus the marker only if `hadMarker && remaining.length === 0`, then `removeSharedFolderIfEmpty`.
- Prompt injection and removal use `injectSpecdBlock` and `removeSpecdBlock(path, id)`.

### plugin-agent-claude:plugin-agent — all requirements OK

- Install dir `.claude/skills`, agents `.claude/agents/<n>.md`. The `agents` capability falls back to the shared dir as `<n>.agent.md` (`install-skills.ts:58-60,142`). The default capabilities are `['mcp','agents','frontmatter']`.
- Agent frontmatter: `tools` is a comma-separated string. `model` comes from `item.metadata.model` only when set.
- Frontmatter type covers all 14 fields (`domain/types/frontmatter.ts`). `specd-fasttrack` has `disable_model_invocation: true` and a manual-only description (`domain/frontmatter/index.ts:19-24`).
- **Minor (D7)**: `metadata.allowed_tools.split(', ').join(', ')` (`install-skills.ts:86`) is a no-op that normalizes nothing. The spec says "map into a single comma-separated string". It works, but the code is dead.
- Tests: `test/install-skills.spec.ts` covers shared routing, agent frontmatter, model, owners (filtered, other owner, last owner, foreign file, legacy, skills filter), no-agents-capability fallback, and the CLAUDE.md block. Gap: no explicit test of a filtered `agents` uninstall that keeps the marker. The "tools comma-separated" assertion is indirect.

### plugin-agent-copilot:plugin-agent — all requirements OK, one spec/code mismatch

- Dirs `.github/skills`, `.github/agents/<n>.agent.md`. `tools` is emitted as a list (`install-skills.ts:82-93`). Default capabilities `['frontmatter','agents']`. The frontmatter field set matches. `specd-fasttrack` has `'disable-model-invocation': true`. Prompt goes to `.github/copilot-instructions.md`.
- **D8 (minor, spec text vs code)**: the spec's dependency line says the copilot plugin "reads its skills through the templates source rather than the skill repository used by the other agent plugins" (`skills:skill-templates-source`). The code uses `createSkillRepository()` like the others (`install-skills.ts:32`, `uninstall-skills.ts:56`). Either the spec dependency note is stale or the code should use the templates source. The codex spec also lists `skill-templates-source` while its code also uses the repository.
- **D9 (minor)**: the agent `allowed-tools` split is on `,` only, so any tool string containing a comma inside a pattern would split wrongly. Unlikely in practice.
- Tests (7 install tests plus 3 class tests): no test for last-owner removal, foreign file, legacy marker-less folder, a filtered uninstall leaving the marker, or fast-track install/frontmatter. Coverage gap: moderate.

### plugin-agent-codex:plugin-agent — all requirements OK

- Dirs `.codex/skills`, `.codex/agents/<n>.toml`. TOML has `name`, `description` and `developer_instructions = """..."""` with `escapeTomlBasicMultiline`. The `.agent.md` fallback without the `agents` capability is in `install-skills.ts:134-136`. The frontmatter is only `name` and `description`. The fast-track description is manual-only.
- **D10 (minor)**: `name`/`description` TOML values are quoted with `JSON.stringify`. That is valid TOML basic-string escaping for ordinary text, but not guaranteed for all JSON escapes (for example ` ` is not a TOML escape). Edge case.
- Tests: the escaping test is good. Gaps: no last-owner, foreign-file, legacy or filtered-uninstall marker tests, and no fast-track test.

### plugin-agent-opencode:plugin-agent — all requirements OK

- Dirs `.opencode/skills`, `.opencode/agents/<n>.md`. `mode: "subagent"` is set. `toOpenCodePermission` (`install-skills.ts:187-222`) lowercases tool names, nests patterns, maps a bare tool plus patterns to `"*": allow`, and uses a Map so there are no duplicate keys. `install()` calls `removeSpecdBlock('opencode')` before `injectSpecdBlock`, as the spec requires (`:166-168`). The frontmatter type matches (`allowed_tools` only for agents).
- Project-init wizard includes opencode (`cli/src/commands/project/init.ts:18`). The `@specd/specd` meta package lists it (`specd/package.json`).
- Tests: a permission test exists (`install-skills.spec.ts` near line 326). Gaps: no last-owner, foreign-file or filtered-marker tests.

### plugin-agent-standard:plugin-agent — all requirements OK

- Dirs `.agents/skills`; agents always go to the shared dir as `<n>.agent.md`. Capabilities are `['frontmatter']`. `allowed-tools` is a space-separated string for every skill, with no colon style. `specd-compliance` includes `Bash(node *)` and `Bash(pnpm *)`. The fast-track entry has `allowed-tools` and a manual-only description. A filtered agent uninstall removes only `<shared>/<agent>.agent.md` (`uninstall-skills.ts:42-46`). Init-wizard and meta-package inclusion are OK.
- **D11 (minor)**: `agentFrontmatter` entries have no `allowed-tools`, so the `metadata['allowed-tools']` branch in install (`:80-82`) is dead code. It would also emit an array where the type says a space-separated string.
- Tests: standard has the most coverage (selected agent uninstall, legacy marker-less folder, two tagged blocks). Gap: no last-owner or foreign-file test.

### Cross-spec check

- The plugin specs depend on `plugin-manager:agent-plugin-type`, `skills:shared-folder-owners`, `skills:resolve-bundle` and `skills:agent-instruction-template`. No contradictions were found with these.
- Manifest versions differ between plugins (opencode 0.0.3, standard 0.1.0, others 0.2.0). The spec does not constrain this.

### Findings: **D12 (major)** — owner registration is skipped when install throws midway.

- Spec: "After writing any file into the shared folder, `install()` MUST call `addSharedOwner`".
- Code (all five plugins): `addSharedOwner` runs once at the end of `install` (for example `claude/install-skills.ts:167-169`, `standard/install-skills.ts:163-165`). If a later skill or agent fails after earlier shared files were written, the marker is never created. The shared files then look like a "legacy install" and are never cleaned up on uninstall.
- This is a robustness gap rather than a literal violation. The "after writing any file" wording is arguably satisfied only on the success path.
- Severity: major, shared by all five plugins (one finding, not five).

---

## Summary counts

- Critical: 0
- Major: 2 (D1 CLI dependency scenario vs code; D12 deferred `addSharedOwner` on partial failure)
- Minor: 9 (D2, D3, D5, D7, D8, D9, D10, D11, plus the plugin test-coverage gaps for the owners last-owner/foreign/legacy scenarios in copilot, codex and opencode)

Per-spec status: sdk:composition PARTIAL (D1); sdk:host-context OK; skills:shared-folder-owners OK; plugin-agent-claude OK; plugin-agent-copilot OK; plugin-agent-codex OK; plugin-agent-opencode OK; plugin-agent-standard OK.
