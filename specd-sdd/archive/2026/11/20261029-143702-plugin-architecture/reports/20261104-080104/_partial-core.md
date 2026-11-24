# Partial audit: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show

Change: plugin-architecture. Scope: requirements/scenarios touched by the change deltas (plus a pass over untouched parts only where they interact). Typecheck/tests are green; findings below are spec-vs-code gaps. Neither side is declared source of truth.

Severity legend: H high, M medium, L low, I informational.

## Summary counts

| spec                    | delta reqs                                                          | impl OK | discrepancies                           | missing tests |
| ----------------------- | ------------------------------------------------------------------- | ------- | --------------------------------------- | ------------- |
| core:config             | 4 (cascade identity, plugin decl., config version, writer-port req) | 4       | 1 L (ordering edge cases)               | 2 L           |
| core:config-loader      | 4                                                                   | 4       | 1 L (shared w/ config)                  | 1 L           |
| core:config-writer-port | 5 (addPlugin, removePlugin, listPlugins, initProject, constraints)  | 4       | 1 M (tmp .gitignore location), 2 L      | 2 L           |
| core:check-registry     | 4 (+3 added scenarios)                                              | 4       | 0                                       | 3 L           |
| cli:config-show         | 4                                                                   | 4       | 1 L (spec self-inconsistency), 1 L help | 1 L           |

No High findings.

---

## core:config

Requirements (changed): Cascade identity and removal model (plugins[] by `name`, removal by `{name}`, absent/duplicate removal -> ConfigValidationError, explicit-base layer inactive until base active); Plugin declarations (flat list `{name, config?, contributions?}`, scoped name, unique, no plugin loading); Config version (`configVersion` positive int, 2 written by init, newer -> UnsupportedConfigVersionError, legacy `plugins.agents` -> LegacyConfigFormatError before strict schema, root-layer version wins, mismatching extending layer fails, errors extend ConfigValidationError); Config writer port requirement (flat list API).

Implementation status: implemented.

- `packages/core/src/application/ports/config-schema.ts`: `PluginEntryZodSchema` (name regex `PLUGIN_NAME_REGEX`, strict, `contributions` min(1)), `PluginsZodSchema` (duplicate names rejected), `configVersion: z.number().int().positive().optional()`, `mergePluginLists` (same name replaced in place, new names appended).
- `infrastructure/fs/config-cascade.ts`: `LayerRemovalZodSchema.plugins`, `applyRemovals` plugin branch (absent name -> ConfigValidationError; duplicate name fails because each removal consumes the entry), `mergeActiveLayers` root `configVersion` taken from root, mismatching layer -> ConfigValidationError.
- `domain/errors/legacy-config-format-error.ts` / `unsupported-config-version-error.ts` extend `ConfigValidationError`, codes `LEGACY_CONFIG_FORMAT` / `UNSUPPORTED_CONFIG_VERSION`, `CURRENT_CONFIG_VERSION = 2`.
- `infrastructure/fs/config-loader.ts`: `assertCurrentConfigFormat` (version check before legacy check, legacy only when `plugins` is an object with `agents` key) run on every active layer before `SpecdYamlZodSchema.safeParse`. Plugins are not loaded.
- `application/specd-config.ts`: `SpecdConfig.plugins` flat list.

Discrepancies:

1. [L] Ordering of checks vs. merge. In `FsConfigLoader.load()` (config-loader.ts ~262-286) `mergeActiveLayers()` runs BEFORE `assertCurrentConfigFormat()` per layer. Consequences vs. spec ("detection runs on every cascade layer"; "`configVersion` check runs before the legacy check within a layer"):
   - Root v2 + extending layer `configVersion: 3`: `mergeActiveLayers` raises the generic mismatch `ConfigValidationError` before `UnsupportedConfigVersionError` can be raised for that layer.
   - Base layer with legacy `plugins: {agents: ...}` plus a later layer with `remove.plugins`: raises "remove.plugins: no plugins in inherited config" (generic) instead of `LegacyConfigFormatError`.
     Spec scenarios as written (legacy in an extending layer; newer version vs legacy in one layer) are satisfied; only these cross-layer combinations differ. Spec silent on them. Suggest either validating each layer's format before merging or stating the precedence in the spec.
2. [L] Extending layer that declares `configVersion` while the root omits it fails (`undefined !== value`). Spec says "a different `configVersion` in an extending layer MUST fail" - consistent, but a root without the key is not stated; worth a one-line clarification.

Test coverage (`packages/core/test/infrastructure/fs/config-loader.spec.ts`): flat list with config+contributions (1194), missing name (1220), unscoped (1233), duplicate (1245), legacy snippet (1258), newer version (1283), absent version (1294), version 0 (1307), `plugins.skills` generic (1307/1319 region), newer-before-legacy (1319), remove.plugins by name (2265), replace-in-place/append (2290), legacy in extending layer (2320), duplicate removal (2335), version mismatch (2356), absent name removal (2370), remove.context by id (2213), explicit-base skipped (1983), remove.workspaces (2162). Writer-side: init writes `configVersion: 2` (config-writer.spec 42).

Missing tests (all L):

- Scenario "Plugin entry shape / Contributions allowlist accepted without loading the plugin" - partly covered by 1194; no test with a plugin package that is not installed (loader-does-not-load-plugins) exists explicitly.
- Negative/fractional `configVersion` (only `0` tested).
- Scenario "Layer plugin with new name is appended" is merged into the 2290 test; ok.

---

## core:config-loader

Requirements (changed): YAML parsing/structural validation (pre-strict `configVersion` + legacy detection), Schema plugins / overrides / context mapping (plugins mapped as flat list; name is identity; loader never loads plugins), All errors are ConfigValidationError (Legacy/Unsupported extend it).

Implementation: implemented as above (`config-loader.ts` `_buildConfig` maps `plugins` preserving name/config/contributions; `assertCurrentConfigFormat`). Env overrides applied before validation (unchanged).

Discrepancies: same ordering note as core:config (L). Additionally:

- [L] `assertCurrentConfigFormat` is exported from `config-loader.ts` and imported by `config-writer.ts` (infrastructure to infrastructure) - fine for the architecture spec, just noting the reuse; no violation.

Test coverage: loader tests listed above cover scenarios Invalid YAML (3137), Missing required field, Invalid adapter, Validation precedes path resolution, Legacy (all 4 scenarios), Newer version precedence, Duplicate/Unscoped, Absent version. "All validation errors use ConfigValidationError ... LegacyConfigFormatError and UnsupportedConfigVersionError are instances of it" is asserted only implicitly (class hierarchy), no explicit `instanceof ConfigValidationError` assertion on them found.

Missing tests (L): explicit instanceof-ConfigValidationError for the two new errors; "Context entry with id is preserved" mapped context `id` has coverage only via remove.context (2213), not a direct mapping assertion.

---

## core:config-writer-port

Requirements (changed): AddPlugin (merge semantics, name validated by `PLUGIN_NAME_REGEX` before any write, legacy/invalid shapes throw without rewrite), RemovePlugin (no-op, byte-identical when absent / no key; throw on legacy), ListPlugins (flat entries; `[]` when no file or no key; throw on legacy/invalid), InitProject (`configVersion: 2`, specs dir + storage dirs, metadata dir, `.gitignore` entries, tmp gitignore at `<configPath>/tmp/.gitignore`), Constraints.

Implementation: `packages/core/src/infrastructure/fs/config-writer.ts` (`FsConfigWriter`), port `application/ports/config-writer.ts`.

- addPlugin: validates with `isPluginName` before reading; merge into existing entry via `mergePluginEntry` (omitted fields preserved); `requireMutablePlugins` -> `assertCurrentConfigFormat` + `PluginsZodSchema` so legacy/invalid shape throws before write. OK.
- removePlugin: returns without writing when `plugins` key absent or name absent. OK.
- listPlugins: `[]` on ENOENT / no key; legacy/invalid throws. OK.
- initProject: writes `configVersion: 2` first key, specs dir, `changes/drafts/discarded/archive/metadata` dirs, `.gitignore` entries `specd.local.yaml`, `specd.local.*.yaml`, `/.specd/metadata/` idempotently. OK.

Discrepancies:

1. [M] Tmp gitignore location. Spec (InitProject step 5 + scenario "initProject creates tmp gitignore for fs-cache and locks"): `<config directory>/tmp/.gitignore`, default `.specd/config/tmp/.gitignore`, same `{configPath}/tmp` used by repositories. Code (`config-writer.ts:73-74`): `ensureTmpGitignore(storageBase)` with `storageBase = <projectRoot>/.specd`, so the file lands at `.specd/tmp/.gitignore`. The loader default `configPath` is `<specdPath>/config` (`config-loader.ts:387`) and repositories call `ensureTmpGitignore(this.configPath())`, so runtime tmp data lives in `.specd/config/tmp/` and the file init creates is in a different directory. The existing test (`config-writer.spec.ts:290`, "writes the tmp gitignore under .specd") asserts the `.specd/tmp` path, i.e. the test encodes the code, not the spec. Repositories ensure the file lazily so runtime is safe, but init does not satisfy the spec. Fix either side: code -> `path.join(storageBase, 'config')`; or spec -> `.specd/tmp`.
2. [L] `readConfigDocument`/`listPlugins` wrap `parseDocument` in try/catch expecting a `ConfigValidationError("invalid YAML")`, but `yaml.parseDocument` does not throw on syntax errors (it records `doc.errors`). For malformed YAML: `listPlugins` silently parses partial content (may return `[]`), and `addPlugin`/`removePlugin` fail later with a plain `Error: Document with errors cannot be stringified` (verified with yaml 2.8.2) instead of `ConfigValidationError`. File is not corrupted. Spec is silent on malformed YAML for the writer; consider checking `doc.errors.length`.
3. [L] `addPlugin`/`removePlugin` on a non-existent `specd.yaml` propagate a raw ENOENT (`readConfigDocument` does not map it). Spec only defines `listPlugins` for an absent file (returns `[]`); behaviour of add/remove on absent file unspecified.
4. [L] `initProject` creates the metadata dir at fixed `.specd/metadata` while the spec says "resolved metadata cache directory (default `.specd/metadata/`)"; no config is available to the writer so only the default is possible. Consistent for default layout; spec sentence about non-default layouts matches (not rewritten).

Test coverage (`config-writer.spec.ts`): init structure + `configVersion` (42), storage dirs (65), specs dir (76), gitignore entries (84, 93, 104), force/AlreadyInitialised (123/129), addPlugin flat list (151), update preserves/doesn't duplicate (160), removePlugin removal / no-op / byte-identical (181-204), listPlugins empty/absent/legacy (213-231), unscoped name rejected (218), legacy and empty-contributions not rewritten (260-277).

Missing tests (L): "Invalid plugin name is rejected AND specd.yaml not modified" (only asserts the throw); "Config and contributions persisted and listed" round trip via listPlugins in one call (160 partially); no test for malformed YAML; metadata directory creation is not asserted explicitly.

---

## core:check-registry

Requirements (changed): Immutability of built-in checks (scoped names, no double `@`, `InvalidPluginNameError` only for grammar violations), Canonical namespacing and plugin registration (`register(pluginName, check, defaultBindings?, options?)`, `${pluginName}.${check.id}`), Open check registry (get/has/list/bindings/getBindings/getGovernance/withExecutableBuiltins), Two-tier governance (items 1-9 re-stated: placement lock, code-defined policy lock, config lock, disable lock, monotonic rule, Category A/B/C, archive exception, registration fidelity, executable instances, archive declarations).

Implementation: `packages/core/src/domain/services/check-registry.ts` and `check-bindings.ts`.

- `register` validates `PLUGIN_NAME_REGEX` (shared with plugin-manager spec via `domain/plugin-name.ts`, same regex as spec), builds `${pluginName}.${check.id}` (single `@`), throws `DuplicateCheckError`, defaults `allowSchemaEmbedding`/`allowBindingOverride` from presence of default bindings (false if bindings, true if none), `allowConfigOverride`/`allowDisable` default true. OK.
- Category A/B built-ins fully locked, Category C open (constructor set `nonEmbeddableBuiltins`); archive exception encoded in `ARCHIVE_BINDING_SPECS` (workspace.readOnly, deps.consistent, impl.filesResolved: all four flags false); spec.overlap / impl.linksInScope remain tunable on archive. Matches spec.
- `withExecutableBuiltins` copies catalog/bindings/governance/bound coordinates, replaces only built-ins of identical kind, else `InvalidInputError`. The public surface matches the "complete public surface" list.

Discrepancies: none found against the changed text. Observations (I):

- `withExecutableBuiltins` keeps `_bindings` whose `binding.check` still references the domain instance; the spec says ids, bindings and governance are kept, so this matches the letter. Whether use cases resolve executables through `registry.get(id)` rather than `binding.check` was not audited here (belongs to core:transition-checks / composition).
- Check-level `allowConfigOverride` for built-ins equals `isEmbeddable` (Category A/B false), consistent with "A code-defined binding that omits allowConfigOverride SHALL inherit the check-level value".

Test coverage (`core/test/domain/services/check-registry.spec.ts`): namespacing (14), invalid names (52, 232), duplicate (108), duplicate coordinate (126), built-ins preserved (158), governance (173, 301, 334, 351, 455, 465, 476), 16 built-ins listed + `has()` (435), `withExecutableBuiltins` (494), archive bindings & exception (515-560); composition-level: `composition/composition-registries.spec.ts`, `use-cases/archive-change.spec.ts`.

Missing tests (L):

- Scenario "Plugin namespace accepts the documented grammar" (leading digit, hyphen, underscore accepted): only rejections are tested.
- Scenario "Canonical identifier has a single leading at-sign" (no `@@`): not asserted directly.
- Scenario "getBindings ... unknown id returns empty array" and "getGovernance unknown id returns undefined": no unknown-id assertions found (also no "exactly two default bindings" case for getBindings, only a 1-binding case at line 46).
- `withExecutableBuiltins` "keeps the same ids, bindings and governance" assertion is not explicit (test focuses on replacement and rejection).

---

## cli:config-show

Requirements (changed): Output format (plugins section: `<name>  (present)` plus single-space `[contributions: ...]` suffix only for entries with an allowlist; JSON/TOON serialize `SpecdConfig` directly), Help text (current SpecdConfig fields; no `specsPath`/`isExternal`/`changesPath`), Error cases (loads via config loader only; no host bootstrap or plugin loading), Examples.

Implementation: `packages/cli/src/commands/config/show.ts` - `renderText` prints plugins with `(present)` and optional ` [contributions: a, b]`; json/toon call `output(config, fmt)` with the unmodified config; `loadConfig` (`packages/cli/src/load-config.ts`) uses `createDefaultConfigLoader(...).load()` only, no kernel/host, warnings printed from the loader result. Help text lists current fields (`specsAdapter`, `changesAdapter`... `plugins?`) and the plugin-name grammar. OK.

Discrepancies:

1. [L] Spec internal inconsistency: the layout block shows `<name>  (present)  [contributions: ...]` (two spaces) while the prose says "separated ... by a single space". Code follows the prose (single space) and the test asserts it (`'(present) [contributions: codex]'`). Fix the layout block in the spec.
2. [L] Help text is a hand-maintained subset of `SpecdConfig` (omits `schemasAdapter`, `contextIncludeSpecs`, `graph`, `warnings`, etc.). Spec allows "generated from, or kept in sync with" but the omission means the sync is partial. Not a violation of the prohibition list; no automated sync test beyond the three retired names.
3. [I] The loader-warning clause ("Config warnings are emitted by the loader itself") is implemented in the CLI helper `loadConfig` (prints `warning: ...`) rather than inside the loader; behaviourally equivalent for users.

Test coverage (`packages/cli/test/commands/config-show.spec.ts`): text output, approvals, JSON full SpecdConfig, optional fields omitted, workspace fields, multiple workspaces, plugins shown (including contributions suffix at 182), no suffix without allowlist (203), TOON (219), help text (228), error case (246).

Missing tests (L): "Broken plugin does not prevent config show" (tests mock `loadConfig`, so the no-plugin-loading guarantee is not exercised; could assert `loadConfig` is the only collaborator or run against a config naming an uninstalled plugin); TOON test does not assert the `plugins` list appears.

---

## Cross-spec / dependency consistency

- core:transition-checks / default:\_global/architecture: check-registry grammar (`PLUGIN_NAME_REGEX`) is shared from `domain/plugin-name.ts`, used by config schema, writer and registry - consistent with plugin-manager:specd-plugin-type. Architecture layering ok: port in `application/ports`, fs impl in `infrastructure/fs`, domain service has no I/O.
- core:config says the default `configPath` is `<specdPath>/config`; core:config-writer-port init tmp-gitignore requirement relies on it - only the writer implementation diverges (see config-writer-port #1).
