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
