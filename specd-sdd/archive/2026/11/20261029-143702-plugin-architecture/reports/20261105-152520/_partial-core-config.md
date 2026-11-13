# Partial audit: core config batch (attempt 5)

Specs: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show.
Method: read the change deltas (spec + verify) in `deltas/`, compared against implementation, mapped scenarios to tests.
Ran `npx vitest run test/infrastructure/fs test/domain/services/check-registry.spec.ts` in packages/core: PASS (582), FAIL (0).
No code or specs modified.

Totals: critical 0, major 1, minor 8. Requirements: all OK or PARTIAL (see below); none MISSING.

## Verification of fixes since attempt 4

| Fix                             | Status   | Evidence                                                                                                                                                                                                                                                                      |
| ------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mergePluginLists returns copies | VERIFIED | `packages/core/src/application/ports/config-schema.ts:356-374` uses `Array.from` on every array path. Tests: `packages/core/test/infrastructure/fs/config-cascade-plugins.spec.ts:22` and `:41` (assert root/overlay arrays are not mutated, result `not.toBe(rootPlugins)`). |
| initProject uses named defaults | VERIFIED | `packages/core/src/infrastructure/fs/config-writer.ts:22-26` (`DEFAULT_SPECD_DIR`, `DEFAULT_METADATA_CACHE_PATH`), used at `:80-83`, `:99`.                                                                                                                                   |
| Orphan JSDoc removed            | PARTIAL  | No orphan block remains, but a stale reference remains: `config-writer.ts:285` says `{@link pluginSchema}`; the symbol no longer exists (now `PluginsZodSchema`). Minor.                                                                                                      |
| New tests added                 | VERIFIED | config-cascade-plugins.spec.ts (new), config-writer.spec.ts `:259-358` guarantees block, config-loader.spec.ts `:1193-1395`, `:2325-2440`, check-registry.spec.ts `:437-516`, `:519-607`. All green.                                                                          |
| No regressions                  | OK       | Full infra/fs + check-registry suites pass.                                                                                                                                                                                                                                   |

## core:config (Cascade identity and removal model; Plugin declarations; Config writer port; Config version)

| Requirement                                                                                                                                                            | Status      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Cascade identity and removal model (plugins by `name`; absent name fails; duplicate removal fails; replace in place / append)                                          | OK          |
| Plugin declarations (flat list, scoped name regex, no dup, optional config/contributions, no plugin loading)                                                           | OK (see M2) |
| Config writer port (4 methods, no dup, no type)                                                                                                                        | OK          |
| Config version (positive int, absent ok, > supported -> Unsupported, legacy -> Legacy w/ snippet, precedence, root-layer version, subclasses of ConfigValidationError) | OK (see m4) |

Implementation refs: `config-cascade.ts:495-507` (remove.plugins; each removal consumes the match so a repeated name fails with "not found"), `:518-542` (configVersion taken from root; mismatch -> ConfigValidationError), `config-schema.ts:205-225,291-292` (Zod), `config-loader.ts:261-266,691-700` (per-layer assertCurrentConfigFormat, version check first, then legacy), `legacy-config-format-error.ts`, `unsupported-config-version-error.ts` (both extend ConfigValidationError, codes correct), `plugin-name.ts` (regex identical to spec and to plugin-manager grammar).

Scenario -> test map (verify delta):

- Context entry removed by id -> config-loader.spec.ts:2273 (OK)
- Plugin entry removed by name -> config-loader.spec.ts:2325 (OK)
- Removing an absent plugin name fails -> config-loader.spec.ts:2427 (OK)
- Duplicate names in removal list rejected -> config-loader.spec.ts:2392 (OK)
- Layer plugin replaces same name in place / appended -> config-loader.spec.ts:2350 (one test covers both) (OK)
- Workspace removed by name -> config-loader.spec.ts:2222 (OK)
- Explicit-base local variant skipped -> config-loader.spec.ts:2043 (OK)
- Flat plugins list / Plugin entry shape -> config-loader.spec.ts:1194 (OK)
- Invalid plugin structure (missing name) -> config-loader.spec.ts:1237 (OK)
- Unscoped plugin name -> config-loader.spec.ts:1250 (OK)
- Duplicate plugin name -> config-loader.spec.ts:1262 (OK)
- Contributions allowlist accepted without loading -> config-loader.spec.ts:1194, :1220 (OK)
- ConfigWriter port defines initProject/addPlugin/removePlugin/listPlugins (4 interface-inspection scenarios) -> no runtime test; enforced by TypeScript (`implements ConfigWriter` in config-writer.ts:34). Accepted as compile-time; minor note only.
- addPlugin adds to flat list -> config-writer.spec.ts:151 (OK)
- addPlugin with config and contributions -> config-writer.spec.ts:283 (OK)
- addPlugin does not duplicate -> config-writer.spec.ts:160 (OK)
- removePlugin removes -> config-writer.spec.ts:181 (OK)
- Absent configVersion accepted -> config-loader.spec.ts:1311 (OK)
- Newer configVersion rejected (code UNSUPPORTED_CONFIG_VERSION) -> config-loader.spec.ts:1300 (asserts class only, not the code; minor)
- Legacy plugins shows migration (code, snippet, `configVersion: 2`) -> config-loader.spec.ts:1275 (OK)
- Legacy detection precedes schema errors -> config-loader.spec.ts:1275 (OK)
- Invalid configVersion value rejected -> config-loader.spec.ts:1318, :1383 (OK)
- Other legacy-looking plugins object is generic error -> config-loader.spec.ts:1324 (OK)
- Legacy format in an extending layer "naming the extending layer path" -> config-loader.spec.ts:2377 asserts only the class, not that the message names the extending layer path (GAP, minor, see m3)
- init writes configVersion -> config-writer.spec.ts:42-53 (OK)
- Mismatching version in extending layer -> config-loader.spec.ts:2413 (OK)

## core:config-loader

| Requirement                                                                                            | Status |
| ------------------------------------------------------------------------------------------------------ | ------ |
| YAML parsing and structural validation (version/legacy check before strict schema, version first)      | OK     |
| Schema plugins, schema overrides, context entry mapping (plugins flat list, name identity, not loaded) | OK     |
| All errors are ConfigValidationError (Legacy/Unsupported subclasses)                                   | OK     |

Refs: `config-loader.ts:261-297` (assert per active layer, before Zod), `:665-675` (plugins mapping), `:691-700`.

Scenario -> test map:

- Context entry with id preserved -> NO TEST FOUND (GAP, minor, m1). Code preserves id via spread at `config-loader.ts:620` and the type allows it (`specd-config.ts:23`), but no loader test asserts `{id, file}` survives `load()`.
- Plugin identity is name (preserves name/config/contributions; removal by name) -> config-loader.spec.ts:1194 + :2325 (OK)
- Plugins not loaded by loader -> config-loader.spec.ts:1220 (OK)
- Invalid YAML / Missing required field / Invalid adapter / Validation precedes path resolution -> pre-existing tests (not re-audited; unchanged by this change)
- Legacy plugins object produces migration message -> :1275 (OK)
- Newer configVersion -> :1300 (OK)
- Newer version takes precedence over legacy -> :1336 (OK)
- Legacy format in extending layer -> :2377 (OK; same path assertion gap as above)
- Legacy detection not a generic schema error -> :1275 (OK)
- remove.plugins absent name fails -> :2427 (OK)
- Absent configVersion with current shape -> :1311 (OK)
- Unscoped plugin name -> :1250 (OK)
- Duplicate plugin name -> :1262 (OK)
- All validation errors use ConfigValidationError (subclass instanceof) -> :1275/:1300 (instanceof checks of subclasses only; no direct `instanceof ConfigValidationError` assertion on the Legacy/Unsupported errors; minor, m5)
- Invalid cascade chain still ConfigValidationError -> pre-existing (unchanged)

## core:config-writer-port

| Requirement                                                                                                                                                  | Status      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| AddPlugin (3 params, merge preserving omitted fields, name validated before write, invalid YAML/legacy/absent file -> ConfigValidationError without rewrite) | OK (see m6) |
| RemovePlugin (no-op byte-identical when absent / no key; legacy/invalid/absent -> error)                                                                     | OK          |
| ListPlugins (all entries; absent file/key -> []; legacy/invalid -> throws)                                                                                   | OK          |
| InitProject behaviour (configVersion: 2, dirs, metadata dir, `/.specd/metadata/` gitignore, tmp/.gitignore, both local patterns)                             | OK          |
| Constraints (no type/bucket)                                                                                                                                 | OK          |

Refs: `config-writer.ts:44-108` (init), `:118-135` (add; name check at :119 precedes read; absent file -> `readConfigDocument` :196-207 throws ConfigValidationError; merge at :239-251), `:143-154` (remove; returns before any write when key missing or name absent), `:164-186` (list; ENOENT -> []), `:265-280` (legacy/invalid shape guard).

Scenario -> test map:

- Adds plugin to the list -> config-writer.spec.ts:151 (OK)
- Adds plugin with config and contributions -> :283 (OK)
- Duplicate plugin updates existing -> :160 (OK; but starts from a bare entry)
- Update preserves omitted fields (`{config:{a:2}}` keeps `contributions:['audit']`) -> NO TEST (GAP, minor-to-major per spec emphasis, m2). Code correct at config-writer.ts:244-245.
- Invalid plugin name rejected, file unmodified -> :260 (OK)
- Legacy format not rewritten (add/remove) -> :300 (OK)
- Config and contributions persisted and listed -> :283 (OK)
- Malformed YAML rejected without rewriting (add/remove/list) -> :331 (OK)
- Invalid plugin name leaves file unmodified -> :260 (OK)
- Plugin mutation on absent config (no file created) -> :271, :349 (OK)
- Removes plugin from the list -> :181 (OK)
- Removing an absent plugin is a no-op, file not rewritten -> :192 (OK)
- Removing from file without plugins key byte-identical -> :204 (OK)
- ListPlugins returns all declared plugins -> :283 (single entry with config+contributions; no multi-entry mix, acceptable)
- ListPlugins on file without plugins key -> :225 (OK)
- ListPlugins on legacy format throws -> :231 (OK)
- ListPlugins on absent config -> :213 (OK)
- Fresh project is initialised -> :42-91 (OK)
- initProject creates tmp gitignore -> :360 (OK)

## core:check-registry

| Requirement                                                                                                                                       | Status                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Immutability of built-in checks (scoped names, no leading `@` added, grammar)                                                                     | OK                                                                                                    |
| Canonical namespacing and plugin registration (single `@`, InvalidPluginNameError, DuplicateCheckError, `PluginCheckRegistrationOptions` 4th arg) | OK (see M1)                                                                                           |
| Open check registry (get/has/list/bindings/getBindings/getGovernance/withExecutableBuiltins)                                                      | OK                                                                                                    |
| Two-tier governance (text carried in delta)                                                                                                       | OK: Category A/B/C defaults at check-registry.ts:82-109; archive exception verified through test :537 |

Refs: `check-registry.ts:18` imports `PLUGIN_NAME_REGEX` from `domain/plugin-name.ts` (single source of truth), `:240-244` validation and `${pluginName}.${check.id}`, `:131-153` withExecutableBuiltins (same ids, bindings, governance; rejects non-builtins and kind mismatch), `composition-registries.ts:226-240` forwards all governance fields.

Scenario -> test map:

- Built-in checks injected at construction -> check-registry.spec.ts:160 (OK)
- External registrations namespaced, never shadow built-ins -> :199 (OK)
- Invalid plugin name rejected -> :52, :234 (OK)
- Plugin namespace accepts documented grammar -> :70, :75, :578 (OK)
- Valid registration produces canonical id -> :14, :75 (OK)
- Canonical id has single leading at-sign -> :75 (asserts `slice(1)` has no `@`), :562 (OK)
- Reject unscoped plugin name -> :37 (OK)
- Reject invalid name with special chars / empty -> :38, :66 (OK)
- Reject duplicate canonical id -> :110 (OK)
- getBindings returns default bindings of one check (two bindings; unknown -> []) -> :46 (one binding), :434 (two), :595 (unknown) (OK, spread across tests)
- getGovernance returns record (`allowSchemaEmbedding: true`; unknown -> undefined) -> :478-494, :595 (OK)
- withExecutableBuiltins keeps ids, bindings, governance -> :496 (OK; compares counts and one governance record, not full id/binding equality; acceptable)

## cli:config-show

| Requirement                                                                                                                  | Status                |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Output format (text plugins section, `(present)`, single-space `[contributions: ...]` suffix, JSON/TOON = SpecdConfig as-is) | OK                    |
| Help text (document current SpecdConfig fields, in sync)                                                                     | PARTIAL: see M1       |
| Error cases (config loader only, no host, warnings to stderr)                                                                | OK in code; test gaps |

Refs: `packages/cli/src/commands/config/show.ts:61-70` (plugins rendering), `:123-136` (action calls `loadConfig` only), `packages/cli/src/load-config.ts:21-26` (warnings via `console.warn` = stderr, `warning: ` prefix, printed before command output).

Scenario -> test map:

- plugins shown in text output -> config-show.spec.ts:182 (OK)
- contributions allowlist shown -> :182 (OK)
- No contributions suffix without allowlist -> :203 (OK)
- TOON output -> :219 (OK)
- JSON output serializes SpecdConfig directly, `plugins` flat -> :66 ("JSON output is full SpecdConfig") does not assert `plugins`; no JSON+plugins assertion (GAP, minor, m7)
- Broken plugin does not prevent config show -> NO TEST (GAP, minor, m8). Structurally satisfied (command never bootstraps a host), but unasserted.
- Help documents current SpecdConfig fields -> :236 only asserts absence of 3 names plus presence of `schemaRef`/`plugins`; it does not check the documented shape against `SpecdConfig`, so it hides drift M1 (weak test).
- Config warnings printed to stderr by helper -> no test for `load-config.ts` (no `load-config.spec`); minor gap folded into m8.

## Discrepancies (both sides shown)

### M1 (major) cli:config-show Help text drifts from SpecdConfig, and spec premise is itself wrong

- Spec: "The `--help` text MUST document the JSON/TOON output shape from the current `SpecdConfig` fields (generated from, or kept in sync with, the type). It MUST NOT describe fields that no longer exist (such as `specsPath`, `isExternal`, `changesPath`)."
- Code `packages/cli/src/commands/config/show.ts:103`: workspace shape is `{ name, ownership, specsAdapter, context?, contextIncludeSpecs?, contextExcludeSpecs?, contextMode?, llmOptimizedContext?, actorProvider?, privacy?, graph?, logging? }`.
- Actual `SpecdWorkspaceConfig` (`packages/core/src/application/specd-config.ts:112-161`): `name, prefix?, specsPath, specsAdapter, schemasPath, schemasAdapter, codeRoot, ownership, isExternal, contextIncludeSpecs?, contextExcludeSpecs?, graph?`.
  - Help lists workspace fields that do not exist: `context?`, `contextMode?`, `llmOptimizedContext?`, `actorProvider?`, `privacy?`, `logging?` (those are project-level; core:config says `contextMode` is invalid inside a workspace).
  - Help omits real fields: `prefix`, `schemasAdapter`, `schemasPath`, `codeRoot`, `specsPath`, `isExternal`.
  - `show.ts:104` storage omits `changesPath/draftsPath/discardedPath/archivePath`, which exist at `specd-config.ts:166-179`.
  - `show.ts:108` context entry omits optional `id` (`specd-config.ts:23`).
- Contradiction inside the spec itself: `specsPath`, `isExternal` and `changesPath` are NOT "fields that no longer exist"; they are present in `SpecdConfig` (they are the legacy-compat fs paths and the inferred flag) and appear in the JSON output (config-show.spec.ts:92,115,121 use them). The spec's forbidden list and its "in sync with current SpecdConfig" rule cannot both hold. Recommend: either amend the spec to forbid only truly removed fields, or remove those three fields from SpecdConfig; and generate the help from the type, or add a test comparing the documented key list to SpecdConfig keys.

### M2 (minor) Spec silent: `contributions: []` handling

- Spec (core:config Plugin declarations, config-writer-port AddPlugin): `contributions?: string[]` "allowlist of contribution ids; absent = all". No minimum length stated.
- Code `config-schema.ts:209`: `z.array(z.string()).min(1).optional()` rejects an empty list; message at `config-writer.ts:182,276` says "contributions cannot be empty". Test `config-writer.spec.ts:317` encodes it.
- Related latent inconsistency: `addPlugin(path, name, { contributions: [] })` is accepted by `mergePluginEntry` (`config-writer.ts:245-249`) and written to disk, producing a file that every later `listPlugins`/`addPlugin`/`load()` rejects. Recommend documenting `min(1)` in the specs and rejecting empty `contributions` in `addPlugin` before writing.

### M1b (minor, from check-registry) Stale grammar in error message and docs

- Spec core:check-registry: grammar is `^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$` (scoped, lowercase).
- Code `packages/core/src/domain/errors/check-registry-errors.ts:4` and `:23` still say plugin names "contain only alphanumeric characters, underscores, and hyphens (`^[a-zA-Z0-9_-]+$`)". The runtime check is correct (`check-registry.ts:240`), but the user-visible error text from `InvalidPluginNameError` describes the OLD grammar and would mislead users who pass a name like `@Acme/x`.
- Also stale JSDoc: `packages/core/src/composition/composition-registries.ts:67` and `packages/core/src/composition/kernel-builder.ts:177` ("Plugin namespace matching ^[a-zA-Z0-9_-]+$"). Not in the modified-file list from git status for check-registry-errors.ts, so this was missed by the change.
- Severity: minor (message only), but user-facing.

## Minor findings list

- m1: no loader test for "Context entry with id is preserved" (config-loader verify).
- m2: no test for "Update preserves omitted fields" (config-writer-port verify), the core merge semantic added by this change.
- m3: "Legacy format in an extending layer ... naming the extending layer path" test (config-loader.spec.ts:2377) does not assert the path in the message.
- m4: `configVersion: 3.5` (fractional > supported) yields `UnsupportedConfigVersionError` rather than a generic schema error as the spec's "fractional ... fail schema validation" implies; still a `ConfigValidationError`, so scenario satisfied. Tests use 1.5 and -1 only (config-loader.spec.ts:1383).
- m5: Test for "Legacy/Unsupported are instances of ConfigValidationError" does not assert `instanceof ConfigValidationError` on those subclasses (config-loader.spec.ts:1275-1300 use subclass checks). Note writer tests use `ConfigValidationError` instanceof on other paths.
- m6: `config-writer.ts:285` JSDoc `{@link pluginSchema}` references a nonexistent symbol (should be `PluginsZodSchema`).
- m7: no config-show test asserting JSON output contains the flat `plugins` list.
- m8: no config-show test for "Broken plugin does not prevent config show", and no test for the `load-config.ts` warnings-to-stderr behavior.
- m9 (style): `config-schema.ts:310-311` places `import` statements mid-file after `PluginEntryZodSchema` (line 207) uses `PLUGIN_NAME_REGEX`. Works due to import hoisting; reordering would be cleaner. Also `addPlugin` on a document whose root is not a mapping (e.g. a bare scalar) would throw a raw `yaml` error from `doc.set` rather than `ConfigValidationError` (`config-writer.ts:133`); edge case outside stated scenarios.

## Contradictions with dependency/global specs

- plugin-manager:specd-plugin-type grammar: identical to `PLUGIN_NAME_REGEX` (plugin-name.ts:2), no contradiction.
- core:config says `contextMode` is project-level only; cli:config-show help workspace shape contradicts it (M1).
- No contradiction found between core:config-loader / core:config-writer-port / core:config specs and their code; code follows the specs where stated.

## Summary counts

- Specs audited: 5.
- Requirements checked: 4 (core:config) + 3 (loader) + 5 (writer-port) + 4 (check-registry) + 3 (config-show) = 19; OK 18, PARTIAL 1 (cli:config-show Help text), MISSING 0.
- Verify scenarios mapped: about 83 across the 5 deltas; scenarios with no test: 4 ("Context entry with id preserved", "Update preserves omitted fields", "Broken plugin does not prevent config show", 4 interface-inspection scenarios treated as compile-time); weak-test scenarios: 5.
- Severity: critical 0, major 1 (M1), minor 8 (M1b, M2, m1-m9 consolidated).
