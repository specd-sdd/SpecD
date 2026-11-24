# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-5)

## Summary

| Batch                     | Critical | Major                                            | Minor                                     |
| ------------------------- | -------- | ------------------------------------------------ | ----------------------------------------- |
| core/config (5 specs)     | 0        | 1 (M1: `config show --help` text vs SpecdConfig) | ~9                                        |
| plugin-manager (11 specs) | 0        | 0                                                | 8 (incl. E1-E3 non-SpecdError edge paths) |
| cli (8 specs)             | 0        | 0                                                | 2                                         |
| sdk/agents (8 specs)      | 0        | 0                                                | 6                                         |
| **Total**                 | **0**    | **1**                                            | **~25**                                   |

Attempt-4 majors (enum shape, registerPlugins sync throw, CLI deps vs sdk:composition, owner marker timing) are verified fixed. Test runs by the auditors: plugin-manager 132, sdk 104, five agent plugins 16/17/17/14/16, cli subset 137, core subset 582 — all passing.

## Detailed findings

### \_partial-core-config.md

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

### \_partial-plugin-manager.md

# Spec-compliance audit (attempt 5) - change `plugin-architecture`, batch plugin-manager

Scope: 11 specs `plugin-manager:*` (specd-plugin-type, plugin-loader, register-plugins-use-case, install/uninstall/update/list/load-plugin-use-case, agent-plugin-type, plugin-errors, plugin-repository-port). Read-only. Merged specs read via `changes spec-preview ... --artifact specs|verify`. `vitest run` in packages/plugin-manager: 132 pass / 0 fail; `tsc --noEmit` clean (tsconfig includes `test`, so the type-level port conformance test is really type-checked).

Paths are relative to /Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/plugin-manager.

## Verdict

- Majors: 0. The two attempt-4 majors are fixed (enum/shape validation in `walkSchema`, plugin-config-schema.ts:78-123; `registerPlugins` async, never throws synchronously - contract.spec:47,59).
- Minors: 8 (3 non-SpecdError / typed-error edge paths, 2 message/field quality, 1 spec-vs-code drift, 2 test-quality).
- Scenarios with no or weak test: 21 (listed per spec below).
- All requirements implemented. Every attempt-4 fix verified (details below).

## Verification of attempt-4 fixes

| Fix                                                                                                                                    | Evidence                                                                                                                                          | Status                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Enum/shape validation (`type` set, `required` string[], `additionalProperties` boolean, `items` single object, `enum` non-empty array) | src/domain/services/plugin-config-schema.ts:87-122; tests config-schema.spec:47-66,75-100                                                         | OK (non-object node/root keyword untested, see gaps) |
| `registerPlugins` async, rejects (never sync throw), also with supplied loader                                                         | src/application/use-cases/register-plugins.ts:55 (`async`), mergeHandlers inside; infra register-plugins.ts:30 `async`; tests contract.spec:47-66 | OK                                                   |
| `PluginDestroyError` replaces AggregateError                                                                                           | register-plugins.ts:100-107, errors/plugin-destroy-error.ts; test register.spec:248-282 (asserts SpecdError, code, errors order)                  | OK                                                   |
| Loader wraps `import()` / `create()` with cause                                                                                        | plugin-loader.ts:84-100 (`entry`, `create`; SpecdError from factory passes through); tests contract.spec:130-170                                  | OK                                                   |
| Manifest read/parse cause                                                                                                              | plugin-loader.ts:113-125; tests contract.spec:172-194 (ENOENT / SyntaxError causes)                                                               | OK                                                   |
| Actionable messages                                                                                                                    | errors/\*.ts constructors; test errors.spec:57-88                                                                                                 | OK, but see M5                                       |
| Rollback keeps original error, attaches `rollbackErrors`                                                                               | register-plugins.ts:108-114,192-200; test register.spec:314-352                                                                                   | OK                                                   |

## "Specd compatibility" audit: every throw/rejection path in src

Grep of all `throw`/`new Error`/`AggregateError`/`Promise.reject` in src: every throw site constructs a SpecdError subclass (all 11 classes extend SpecdError; test errors.spec:99-128 enforces it for every exported `*Error`). No `new Error`, no `AggregateError` anywhere. Wrapping sites:

- Loader: manifest read/parse (118,123) -> PluginValidationError(cause); import (88) -> `entry`; factory (98-99) -> `create`, SpecdError passes unchanged.
- Install/uninstall/update hook (install-plugin.ts:77-78, uninstall-plugin.ts:57-58, update-plugin.ts:74-75): wrap non-SpecdError, rethrow SpecdError.
- registerPlugins: `init` (121) and `activate` (149) wrap non-SpecdError in PluginInitError; `destroy` (105) aggregates into PluginDestroyError (SpecdError thrown by destroy is placed in `errors`, as spec says); `builder.registerDisposer` failures are core `InvalidDisposerError`/`RegistryConflictError`, both SpecdError (rolled back at 160-162).
- ListPlugins catches everything and returns it as a string, nothing escapes.

Residual non-SpecdError escape paths (all edge, none reachable with a well-behaved standard loader and spec-conformant handlers):

- **E1 (minor)** plugin-loader.ts:191 `handler.validatePlugin?.(plugin, pluginName)` is not wrapped. A host-supplied handler that throws a plain Error escapes raw from `load()`. Spec says the handler "throws PluginValidationError to reject", so a conformant handler is fine; the blanket rule ("No plugin-manager API MAY surface a plain Error ... thrown by plugin code") is not enforced here. Same for plugin-loader.ts:306 `handler.blockSchema.safeParse(block)` (a Zod schema with async refinement or throwing refine raises a plain Error), and `baseContractFields` (specd-plugin.ts:122-130) reading a throwing getter on the returned plugin object.
- **E2 (minor)** register-plugins.ts:77 `loader.load()` from a caller-supplied `PluginLoader` is not wrapped. Spec (Failure policy): "Any failure to load, validate or initialize a plugin MUST fail registerPlugins with a typed error naming the plugin". The port doc (application/ports/plugin-loader.ts) only declares PluginNotFoundError/PluginValidationError, and the standard loader complies, but register.spec:238-246 enshrines a plain `Error('missing')` surfacing from a custom loader (`rejects.toThrow('missing')`), i.e. the test contradicts the "typed error naming the plugin" wording. Code vs spec: spec stricter than code; either wrap in registerPlugins or relax the spec/port contract to "loader MUST throw SpecdError".
- **E3 (minor)** `resolvePluginConfig` is public API (domain/index.ts) but only safe after `assertSupportedConfigSchema`. With an unvalidated schema (custom loader path in register-plugins.ts:82) `enum: 'fast'` passes `length > 0` in nodeToZod (plugin-config-schema.ts:133) and `enumToZod` calls `'fast'.map` (line 195) -> raw TypeError. The standard loader always runs the gate first (plugin-loader.ts:147-149), and test config-schema.spec:91-100 documents this as "gate" behaviour, so only reachable through a non-standard loader.

## Per-spec results

### plugin-manager:specd-plugin-type - all requirements implemented

| Requirement                                                                       | Status                                                                                                 | Code                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| SpecdPlugin interface                                                             | OK (no `type`, no `configSchema`; hooks optional; install ret `Promise<unknown>`)                      | domain/types/specd-plugin.ts:32-68          |
| PluginContext (`config`,`pluginConfig` only)                                      | OK                                                                                                     | specd-plugin.ts:7-15                        |
| isSpecdPlugin                                                                     | OK (name regex via core `isPluginName`, init/destroy fns, optional install/uninstall/contribution fns) | specd-plugin.ts:118-142                     |
| Plugin manifest (schemaVersion 2, no pluginType, strict, contributes map of maps) | OK                                                                                                     | plugin-loader.ts:35-46                      |
| Plugin name regex                                                                 | OK, identical to spec (core `PLUGIN_NAME_REGEX`, core/src/domain/plugin-name.ts:2)                     |                                             |
| Contribution identity/address                                                     | OK, single error class for build+parse                                                                 | specd-plugin.ts:71-110                      |
| Config schema subset                                                              | OK incl. shape validation, non-object root -> `configSchema`, nested -> `type`                         | plugin-config-schema.ts:78-123              |
| Contribution kind handler                                                         | OK (open registry via mergeHandlers, unknown kind -> UnknownContributionKindError, activate optional)  | merge-handlers.ts, plugin-loader.ts:296-326 |
| Plugin lifecycles                                                                 | OK (loader and install paths never call `init`)                                                        |                                             |

Discrepancies (both sides shown):

- **D1 (minor, spec/code drift)** Loader spec's manifest schema listing shows `configSchema: PluginConfigSchemaSubset.optional()`; code uses `configSchema: z.unknown().optional()` (plugin-loader.ts:43) plus the hand-written walker. Behaviour is equivalent, the spec snippet is not literally what is implemented.
- **D2 (minor, ambiguity)** Spec: "`type` MUST be one of object,string,..."; code (plugin-config-schema.ts:87-92) additionally REQUIRES `type` on every node, so a node like `{ enum: [...] }` or `{ default: 1 }` is rejected as keyword `type`. Spec does not say whether `type` is mandatory on nested nodes. `enum` element types are not validated (spec types them string|number|boolean; `z.literal(obj)` would accept an object by identity).
- **D3 (minor)** Strict-manifest violation (e.g. `pluginType`) yields `fields: ['manifest']` (plugin-loader.ts:138-140) because Zod's `unrecognized_keys` issue has `path: []` (verified). The offending key is not named; spec only requires a typed error naming the plugin, so compliant but unhelpful.

Scenario -> test map (file:line under test/):

- Has required properties: no runtime test for "no `type`/no `configSchema`" (type-level only) - GAP (trivial).
- Name and version sourced from manifest: negative side application/ infrastructure/plugin-loader.spec:509,527 (mismatch); positive side is plugin-factory behaviour - n/a here.
- Optional install hooks: domain/types/is-specd-plugin.spec:15; domain/specd-plugin.spec:41.
- Initialization with SpecdConfig: application/register-plugins.spec:175 (`objectContaining({pluginConfig})`) - WEAK (does not assert `config` passed).
- Rejects unscoped: is-specd-plugin.spec:19; accepts scoped: :15; non-function install: :23.
- pluginType rejected: infrastructure/plugin-loader.spec:437. Other schemaVersion rejected: only :123 which combines schemaVersion 1 + pluginType - GAP (not isolated). contributes must be map of maps: :314 uses top-level `contributes: []`; `contributes.checks` as array not tested - PARTIAL.
- Plugin name valid / dot rejected / uppercase rejected: NO test in plugin-manager, core or cli (grep for `isPluginName|PLUGIN_NAME_REGEX|my.plugin|@Acme` in test dirs found nothing) - GAP (3 scenarios). Unscoped rejected: specd-plugin.spec:32,42; loader.spec:139.
- Address format: specd-plugin.spec:17. Id with dot rejected / build validates parts: :27-38 (uses `Bad.Id`). Parsing failures one class: only `@acme/plugin` and `@acme/plugin.id.extra` tested (:28-31); `acme.a` (invalid plugin part) and `@acme/x.A` (invalid id part) - GAP. Duplicate id across kinds: loader.spec:155 (asserts class only, not "naming the plugin"). Several dots: specd-plugin.spec:29.
- Supported keywords accepted: config-schema.spec:12. Unsupported keyword rejected: :35 (asserts class only, not plugin/keyword) and loader.spec:174 - WEAK. Non-object schema node rejected (root or property): NO test (`{type:'date'}` at :47-53 is an unknown type, not a non-object node; root-not-object never tested; keyword `configSchema`/`type` never asserted) - GAP. Node shape validated: :47-66 covers type 'date' (not 'null'), required, additionalProperties, items array; enum :75-89 asserts keyword `enum` + pluginName; others assert only the class (no keyword/plugin) - PARTIAL. Config without schema rejected: config-schema.spec:68; register.spec:156 (class only, not "naming the plugin").
- Unknown kind rejected: loader.spec:174. validatePlugin receives plugin and name: infrastructure/plugin-loader-contract.spec:94 only the non-throwing call-args half; "handler throws -> loading fails with the thrown PluginValidationError" only via the agents handler (loader.spec:463) - PARTIAL. Duplicate handler kind: contract.spec:87 (loader), application/register-plugins.spec:385 (+:395 empty list). Install-time-only kind: application/register-plugins-contract.spec:119.
- Install does not call init: install-plugin.spec:96,31; uninstall-plugin.spec:169. Options carried: install-plugin.spec:58. Mixed-kind agents only: install-plugin.spec:142; plugin-hooks-no-agents.spec:73. Runtime init for every plugin in order: register-plugins.spec:68.

### plugin-manager:plugin-loader - all requirements implemented, no discrepancy

Load workflow steps 1-9 match plugin-loader.ts:76-103 (resolve via two `createRequire` bases :243-248; manifest validated before import; requested name vs manifest name checked before import :144; factory forms :334-354; base contract fields :180-183; handler `validatePlugin` :190-192; `contribution` required when a kind has `activate` :193-199). `createPluginLoader` merges handlers synchronously so DuplicateHandlerKindError is thrown at creation (:282). Error table all matched.

Scenario -> test:

- Package available: loader.spec:86. Manifest validated before import: loader.spec:123,139,437 - **WEAK (M-T1)**: the fixture entry is `throw new Error("IMPORTED")`; since import failures are now wrapped as `PluginValidationError(['entry'])` (loader :88), these assertions (`rejects.toBeInstanceOf(PluginValidationError)`) pass even if the loader imported before validating. They must also assert `fields` is not `['entry']` (or use a side-effect marker). Real regression risk for the "before importing any plugin code" invariant.
- Version mismatch: loader.spec:527. Name mismatch: :509. Requested name differs: :488 (asserts naming requested plugin per title; class+fields).
- Named create: loader.spec:86 (named `create`). Default fn: :367. Default object: :343.
- **No factory export rejected (fields `create`): NO test** - GAP.
- Entry import wrapped (+ SpecdError instance): contract.spec:130. Throwing factory wrapped / SpecdError passthrough: contract.spec:142,154. Async factory: contract.spec:66. Factory receives config only: contract.spec:74 (loader created WITHOUT extra handlers; scenario says "loader created with extra handlers" - minor).
- Manifest: required fields :66 (missing version), unscoped :139, pluginType :437, dup id :155, unregistered kind :174, invalid block :174, unsupported keyword :174, defaultConfig :174, valid manifest :86.
- Error handling: base contract :416; names failing fields :391 (`fields` exactly `['destroy']`); host agents handler :454; two host handlers contract.spec:87; validatePlugin after base check :463; loader does not run lifecycle contract.spec:108.
- Factory function: contract.spec:74.

### plugin-manager:register-plugins-use-case - all requirements implemented

Matches register-plugins.ts: handlers merged before empty-list short-circuit (:60,63); dupe names -> PluginValidationError (:68-73); all load + config + allowlist validated before first init (:75-85); init in order (:117-125); activate per kind skipping handlers without `activate` (:127-153); exactly one `specd-plugins` disposer after success (:160); rollback destroys reverse, keeps original error, attaches `rollbackErrors` (:108-114); idempotent disposer (:100-102). `RegisterPluginsInput` exported by name (infrastructure/loader/index.ts:2, src/index.ts).

Notes: the plugin whose `init` failed is not destroyed (only fully initialized ones) - consistent with spec ("plugins already initialized"). E2 above applies.

Scenario -> test:

- Called before build with real KernelBuilder: contract.spec:74 (real `createKernelBuilder`, asserts registerDisposer called before build; never calls `build()`) - OK-ish. Registration handle disposes: register.spec:68 (mock builder, reverse order, double dispose). Input defaults (no `input`, standard loader, one plugin initialized): contract.spec:68 uses NO plugins - **GAP**. Duplicate handler kind (rejection, no sync throw, with/without loader): contract.spec:47,59; register.spec:385.
- Init in list order: register.spec:68. Validation before any init: :297,:137,:156,:404. Handlers receive selected only: :196. Init for agents-only: :284; contract.spec:94 (no builder calls except registerDisposer). One named disposer: contract.spec:74 (1 plugin) / register.spec:68 (2 plugins); spec says three - trivial.
- Unknown allowlist id: register.spec:137 (class only; "naming the plugin" not asserted). Config violates schema: :404. Defaults applied: :175. Config without schema: :156. Duplicate entry: :226.
- Destroy reverse: :68. Destroy error isolation: :248,:354 (SpecdError, PluginDestroyError.errors order). Idempotent: :248,:68; contract.spec:74.
- Partial init failure (a,b,c; c throws): register.spec:104 uses 2 plugins (reverse order b-then-a not exercised) - PARTIAL. Rollback failure doesn't mask: :314 (1 initialized plugin) - PARTIAL. SpecdError from init: :425. Activate failure: :457. Load failure fails startup: :238 asserts a plain `Error('missing')` surfaces, not "a typed error naming the plugin" - WEAK, see E2.
- Plugins disabled: SDK-level (sdk:host-context) - out of this batch. Empty list + duplicate handler: register.spec:395. Empty list: register.spec:59; contract.spec:68.

### plugin-manager:install-plugin-use-case - implemented, no discrepancy

install-plugin.ts:61-87 matches Behavior 1-5 and Error handling (agents guard :65, wrap :77-78, SpecdError passthrough, `defaultConfig` returned not written, hooks filtered via `installContextContributions`, options forwarded only when provided). Agent Initialization Phase is informative (plugin-agent-\* specs), no plugin-manager test expected.

Scenario -> test: Plugin not found install-plugin.spec:202; Successful install :31; Output/defaultConfig :115; Unknown id :129; Plugin without install hook :96; Init not called :31,:96; Mixed kinds :142 (+plugin-hooks-no-agents.spec:73); Options only when provided :58 (with-options half; absent half is implied by :31 `toHaveBeenCalledWith` exact object); Agent declaration without contract :83; wrapped :160; SpecdError passthrough :181; agents declared but none selected -> `[]`: plugin-hooks-no-agents.spec:39.
GAPS: "All contributions selected by default" and "Allowlist respected" with a NON-agents plugin declaring `a`,`b` (ids pass through unfiltered) - no test; all fixtures are agents-only or mixed. Agent Initialization Phase scenarios (CLAUDE.md block / AGENTS.md ref-count) - not testable here (live in plugin-agent-\* / skills), listed for completeness.

### plugin-manager:uninstall-plugin-use-case - implemented, no discrepancy

uninstall-plugin.ts:43-60 OK.
Scenario -> test: Successful uninstall uninstall-plugin.spec:21; Plugin not found :191; Unknown id :127; Mixed kinds plugin-hooks-no-agents.spec:79; Loads via loader (implicit, `vi.fn load`); Plugin without uninstall :169; Init not called :169; Agent declaration w/o contract :149 (fields install/uninstall); wrapped :77; SpecdError passthrough :102; options :48.
GAP: "Not tied to the agents bucket" (non-agent plugin WITH an `uninstall` hook receives the selected ids) - :169 has no hook, so the call-with-ids half is untested.

### plugin-manager:update-plugin-use-case - implemented, no discrepancy

update-plugin.ts:58-83 OK; output omits `defaultConfig` (plugin-hooks-no-agents.spec:111).
Scenario -> test: Loads via loader (implicit); Selection preserved update.spec:17 + plugin-hooks-no-agents.spec:99; Selected id removed :84; Plugin not found - **no UpdatePlugin test for PluginNotFoundError** (install:202 and uninstall:191 and load:37 have it; update-plugin.spec has none) - GAP; Output shape :17; Idempotent :184; Mixed kinds plugin-hooks-no-agents.spec:89; Config not modified :17; Agent declaration w/o contract :139; wrapped :108; SpecdError passthrough :159; Multiple updates same result :184.

### plugin-manager:list-plugins-use-case - implemented, no discrepancy

list-plugins.ts:60-80: loaded / PluginNotFoundError -> not_found / other -> error with message; failure per plugin isolated; order preserved; ids via `declaredContributionIds`.
Tests: Returns statuses list-plugin.spec:6; contributions `['a','b']` :60; not_found :38; error status :6; order :60 (checks names order; spec example b,a); invalid manifest (unscoped) entry: :6 uses a generic invalid plugin (verify it uses an unscoped-name manifest - not confirmed) - treat as PARTIAL. Non-Error rejections handled (`String(error)`).

### plugin-manager:agent-plugin-type - implemented, no discrepancy

domain/types/agent-plugin.ts (AgentPlugin, AgentInstallContext Omit<..,'options'>, `isAgentPlugin` install+uninstall functions), domain/handlers/agents-handler.ts (blockSchema `record(idRegex, strict object)`, no activate, `validatePlugin` via isAgentPlugin -> PluginValidationError naming plugin). Built in by mergeHandlers (:15). Minor type drift only: `AgentInstallOptions` uses `readonly` arrays/records where the spec shows mutable `string[]`/`Record` (assignment-compatible for callers; harmless).
Tests: Has install/uninstall (type-level) is-agent-plugin.spec:18,48; Selected contributions passed plugin-hooks-no-agents.spec:73/install-plugin.spec:31; Agents block validated agents-handler.spec:5, loader.spec:283; Unknown field rejected agents-handler.spec:11, loader.spec:174; No runtime activation contract.spec:94; Built-in needs no wiring loader.spec:283 (no handlers passed); Invalid id key loader.spec:314-337 (asserts `pluginName` only, not the `PluginValidationError` class - WEAK); agents without uninstall loader.spec:463; isAgentPlugin 3 scenarios is-agent-plugin.spec:26,33,40,18. AgentInstallOptions / capability / frontmatter / sharedFolder / fallback scenarios: contract-level or agent-plugin behaviour (plugin-agent-\* specs); only type-shape check is-agent-plugin.spec:48 - no plugin-manager-level test, acceptable.

### plugin-manager:load-plugin-use-case - implemented, no discrepancy

load-plugin.ts:33-35 delegates to the loader; errors propagate. Tests: load-plugin.spec:6 (plugin+manifest), :37 (PluginNotFoundError); "no lifecycle calls" is covered at loader level (contract.spec:108), not at LoadPlugin level - trivial; "validates base contract" is loader's duty (loader.spec:416).

### plugin-manager:plugin-errors - requirements implemented

All 11 classes extend SpecdError with the specified stable codes, `pluginName`/`kind`/`address`/`errors`/`cause` properties and messages containing the plugin (or kind) and a remedy. `PluginDestroyError` is a SpecdError with `errors` in destroy order. Spec "Specd compatibility" satisfied except the edge paths E1-E3.

- **M5 (minor, message quality)** PluginValidationError message is fixed text "failed validation (install); fix these fields in the plugin package or its specd-plugin.json to match the plugin contract" (errors/plugin-validation.ts:39) even when it wraps a runtime hook/import/create failure; the cause message (e.g. "disk full", "import boom") is not in the message. A CLI that prints only `message` would give a misleading remedy ("fix specd-plugin.json") for an `install()` crash. Spec requires only an actionable message naming the plugin, so compliant; suggest including `describe(cause)` as PluginInitError/PluginDestroyError already do.
- PluginInitError is also used for `activate` failures but its message says "failed during init" (plugin-init-error.ts:22); spec wording matches ("PluginInitError during init or activate").

Scenario -> test: Error has pluginName (errors.spec:19,57,70); Error has fields (:51); Errors name the plugin (:57); Stable codes (:19; `PLUGIN_VALIDATION_ERROR` code NOT asserted though listed in "Validation error carries fields and cause" - GAP trivial); Each class message contains plugin (:57; PluginDestroyError n/a); Init keeps cause (:19,:35); DuplicateHandlerKindError no pluginName (:74); InvalidContributionAddressError code (:46); **Non-object schema node keyword (`configSchema` for root, `type` for nested): NO test** - GAP (same as specd-plugin-type); Validation error carries fields+cause (:51, code missing).

### plugin-manager:plugin-repository-port - implemented, no discrepancy

application/ports/plugin-repository.ts matches the spec signature (configPath first, `DeclaredPlugin = ConfigDeclaredPlugin`, `AddPluginOptions` from core). Exported as `PluginRepositoryPort` only (no `PluginRepository`). Type-level tests plugin-repository-port.spec:8,13,19 (conformance, identity, readonly listPlugins), type-checked by `tsc --noEmit` (tsconfig `include: ["src","test"]`).
Scenario -> test: Has required methods / addPlugin options / remove / list: spec:19 (type shape); DeclaredPlugin is core type :13; ConfigWriter assignable :8; Signature drift fails compilation: provided by the same assertion (`tsc`), no negative test (acceptable); CLI uses ConfigWriter directly: outside this package (CLI tests).

## Contradictions with dependency/global specs

None found in this batch. Observations:

- `plugin-loader` spec text "Resolve ... first from the project root and then from the loader package's own location" is implemented exactly (plugin-loader.ts:243-248).
- `plugin-errors` constraint "Errors MUST extend SpecdError from @specd/core" holds (domain/errors/\*.ts import it from `@specd/core`).
- `register-plugins-use-case` depends on `core:kernel-builder`: `registerDisposer(name, fn)` usage matches core (core/src/composition/kernel-builder.ts:439-445 throws SpecdErrors for invalid/duplicate disposers; duplicate `specd-plugins` registration would be rolled back).

## Severity index

Minor (8): E1 (plugin-loader.ts:191,306 handler throws unwrapped), E2 (register-plugins.ts:77 / test register.spec:238 plain Error vs "typed error naming the plugin"), E3 (plugin-config-schema.ts:133,195 unguarded TypeError via custom loader), D1 (spec snippet vs `z.unknown()` configSchema), D2 (nested `type` mandatory, enum item types unvalidated - spec silent), D3 (strict-manifest violation reports field `manifest`), M5 (PluginValidationError message hides cause / misleading remedy), M-T1 (loader.spec:123,139,437 pass even if package imported before validation).

Test gaps (no or weak test), by spec:

- specd-plugin-type (11): runtime "no type/configSchema"; PluginContext config assertion (weak); schemaVersion-only rejection; `contributes.checks` array; plugin name valid/dot/uppercase (3); parse failures `acme.a`, `@acme/x.A`; non-object schema root/property; keyword/plugin assertions for unsupported keyword and node shape (weak); validatePlugin-throws via custom handler.
- plugin-loader (2): no `create` export (fields `create`); factory-args test not run with extra handlers.
- register-plugins (4): Input defaults with real standard loader and one plugin; partial-init a,b,c reverse order; rollback with several initialized plugins; load failure "typed error naming plugin".
- install (1): non-agent plugin all-contributions/allowlist ids. uninstall (1): non-agent plugin with hook receives ids. update (1): PluginNotFoundError. agent-plugin-type (1): invalid-id class assertion. plugin-errors (1): non-object schema node keyword (+ PLUGIN_VALIDATION_ERROR code assert).

### \_partial-cli.md

# Partial audit: batch cli (attempt 5) — change plugin-architecture

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: spec-preview (specs + verify) vs packages/cli/src and packages/cli/test. Ran vitest on plugins.spec, plugins-update.spec, project-init.spec, project-update(.allowlist).spec, test/helpers/\*, graph-index-task.spec, run.spec: PASS 137 / FAIL 0.
Code is read-only audited; nothing modified.

Result: 0 critical, 0 major, 0 requirement violations. 2 minor spec/code wording points, 12 minor test-coverage gaps (all low).

New items since attempt 4 — verified OK, no regression:

- plugins-install empty `--contributions`: install.ts:127-133 splits/trims/filters, empty -> `cliError(..., 1)` BEFORE `resolveCliContext` (install.ts:137). Nothing loaded/installed/written. Test plugins.spec.ts:239-257 asserts exit (ExitSentinel), message, `InstallPlugin`/`addPlugin` not called.
- project-init cancel/decline exit 0: init.ts:196-199 (decline/cancel on confirm), 208-211, 221-224, 231-234, 241-244 all `outro` + `throw new CliExitError(0)`; handleError rethrows CliExitError (handle-error.ts:172) and run.ts maps to exit code. Help text: init.ts:53-58 ("exits with code 0"). Overwrite prompt: init.ts:194 names `defaultConfigPath` and says it replaces config "including its declared plugins and workspaces". Tests: project-init.spec.ts:319-338 (message path, "declared plugins", exit(0), initProject not called), 340-348 (help), 265-289, 350-377 (overwrite asked first).

## cli:plugins-install

Requirements: all met.

- Command signature: scoped-name check via `isPluginName` (install.ts:58-66) before any load; contributions single-plugin check install.ts:134-136; empty check above.
- Declaration source: `getDeclaredPlugins(config)` (install.ts:52); no `listPlugins`.
- Header `Installed plugins:` (install.ts:167). Already-installed: warning contains "already installed" then "update" (install.ts:69-70), no InstallPlugin/addPlugin. Workflow: InstallPlugin with contributions (80-84), `addPlugin` options config only when defaultConfig defined, contributions only when flag given (85-88); no kernel.project.addPlugin; no init. `plugins:false` (137-140). Exit 1 via hasErrors (150). JSON `{plugins, hasErrors}` (173).
- Duplicate name in one invocation: `declaredSet.add` after install (89) -> second reported skipped/already installed. OK.
  Discrepancies: none.
  Scenario -> test:
- Valid names / Multiple names: plugins.spec.ts:114, 205 (install of 2 scoped names)
- Unscoped rejected / no install / exit 1: 136-143, 205-237
- Contributions restriction: 162-188
- Contributions with several plugins: 136-160
- Empty contributions: 239-257
- Declaration source (config.plugins, no listPlugins): 190-203 (config path), 284-292 (writer listPlugins not called)
- Already installed: 190-203
- Duplicate name: 259-282
- Header: 294-300
- Calls InstallPlugin + addPlugin: 114-134
- Default config persisted: 162-188
- No empty config: 114-134 (line 132)
- Init not called: only indirectly 284-292 (mockLoad not called); no test asserts plugin `init` unused (install path never loads plugin directly; weak)
- Remaining plugins after failure: 205-237
- Broken configured plugin / plugins:false: 133 (asserts resolveCliContext arg only)
- Exit code on failure: 328-338
- JSON format / hasErrors: 302-326, 205-237
  Gaps (minor): (1) no explicit test that `init` is never invoked; (2) empty-contributions test does not assert `resolveCliContext` not called (the "before any context is resolved" clause) nor the "only commas/blanks" variants (`","`, `" "`); (3) "already-installed does not call kernel.project.listPlugins" not asserted.

## cli:plugins-uninstall

Requirements: met.
Discrepancy (minor, wording): spec step 2 says the command resolves selected contributions "(the allowlist, or all declared ids when absent)" and passes them. Code (uninstall.ts:55-61) passes `contributions` only when the entry has an allowlist and omits it otherwise, delegating "all ids" to the use case. Behaviourally equivalent if UninstallPlugin defaults to all ids (plugin-manager spec); spec text over-states what the command does. Same pattern in update.ts:70-76.

- Declared check (51-54), hook before removeConfig (55-62), hook failure keeps declaration (catch 68), undeclared -> error without calling plugin (52-54), plugins:false (37-40), exit 1 (79-81), `{plugins}` output (101). No kernel.project.removePlugin, no init.
  Scenario -> test:
- Multiple plugins uninstall: no test with two successful uninstalls (465-494 has one fail + one ok; ok-path covered) — partial
- Failure continues + exit 1: plugins.spec.ts:465-494
- Hook before removal + removePlugin(configPath,name): 410-426, 491-493 (order)
- Non-agent plugin (no uninstall hook): no dedicated test (use case mocked)
- Allowlist honoured: 454-463
- Not declared: 496-505
- Hook failure retains declaration: 465-494
- plugins:false: 462
- JSON output: 428-452
  Gaps (minor): non-agent/no-hook plugin scenario untested at CLI level; explicit two-success multi-plugin uninstall untested.

## cli:plugins-update

Requirements: met.

- Declared set from `config.plugins` (update.ts:44-50); undeclared name -> error entry (59-67); recorded allowlist passed, none written (70-76; no ConfigWriter used); no init; plugins:false (110-113); exit 1 (120); output `{plugins, hasErrors}`; `updated|error` only; `no plugins to update` (138).
  Discrepancy: same minor wording point as uninstall (allowlist-or-all).
  Scenario -> test (plugins-update.spec.ts):
- Update all: 90-98; specific: 100-117; Update failure continues + exit 1: 147-162; undeclared: 119-132; allowlist + plugins:false: 134-145; JSON shape: 100-117, 119-132, 147-162; nothing declared: 164-171.
- Update-all uses config.plugins / no listPlugins / no ConfigWriter.listPlugins: not asserted (no spy on those).
- Idempotent (no ConfigWriter call, yaml unchanged): not tested in plugins-update.spec; covered for project update only (project-update-allowlist.spec.ts:43-72, which mocks plugins/update path with real function).
- Text output two plugins one failing: only partially (147-162 is JSON).
  Gaps (minor): no negative assertion on listPlugins/ConfigWriter; no idempotency test; no text-format mixed-result test.

## cli:plugins-list

Requirements: met.

- No `--type` flag (list.ts:34-39); plugins:false (list.ts:42-45); source `config.plugins`; every entry listed; status mapping `loaded->installed` (toListRow list.ts:84-95); not_found/error: declared `[]`, selected = allowlist or `[]`; detail only for non-installed; version `-` fallback in text (list.ts:105); `no plugins declared` / `{plugins:[]}` (list.ts:101-104,119).
  Note (not a defect): `error` detail text is shown only when not loaded; spec matches.
  Scenario -> test (plugins.spec.ts):
- List all / status installed: 342-353; allowlist shown selected/available: 355-364, 507-534; not_found + error rows: 507-534; nothing declared (text + JSON): 366-374, 536-542; JSON parseable: 342-353.
- Declarations from snapshot (no listPlugins): not asserted.
- Lists with broken plugin / plugins:false: NOT asserted for list (only show/uninstall/update/install assert it).
- Regardless of kind (agents + checks both listed): no dedicated test.
- Version known vs unknown: unknown covered (530 `-`), known version text not asserted.
- not_found contributions.selected = recorded allowlist: not asserted (no allowlist on missing row in test); `declared` empty for error row not asserted in JSON.
  Gaps (minor): 5 (plugins:false for list; no-listPlugins assertion; mixed-kind; known version display; not_found/error JSON contributions).

## cli:plugins-show

Requirements: met.

- Loads via LoadPlugin, contributions kind/id/address (show.ts:34-40), version, configSchema/defaultConfig (45-46, 62-67), capabilities derived from install/uninstall hook or agents kind and omitted when empty (show.ts:127-132, 47), plugins:false (show.ts:28-31), init never called, load failure -> handleError exit 1 (show.ts:80-82).
  Scenario -> test: details/JSON/contributions+addresses: plugins.spec.ts:376-397, 399-408; schema/defaultConfig + capabilities omitted for checks plugin + init not called: 554-580; plugin not found exit 1: 544-552 (uses `@acme/missing` rather than spec's unscoped `nonexistent-plugin`; behaviour identical, loader decides). Capabilities for hooks/agents: 376-408. Checks-only text (no capabilities line): JSON covered (578), text-format omission not asserted.
  Gaps (minor): text omission of capabilities line for checks-only plugin untested.

## cli:project-init

Requirements: met (incl. new ones).

- Signature/alias: program.ts:212 and 220 both `registerProjectInit`. Interactive detection uses `getOptionValueSource === 'cli'` (init.ts:77-83) so explicit `--workspace default` stays non-interactive. Banner only in wizard (init.ts:177-184). Known plugin options exact five (14-20, 236-240, required:false).
- Plugin name validated before initProject (init.ts:73-76 -> exit 1). Post-init install with `resolveCliContext({configPath, plugins:false})` (153-156) then `installPluginsWithKernel`. Install failure keeps init output, reports per-plugin, exit 1 (128-130, 280-282). initProject via `createConfigWriter()`; metadataCachePath taken from result. Non-interactive existing config w/o --force: relies on writer rejection -> handleError error:/exit 1.
- Output text/json shapes match spec.
  Discrepancies: none material. (Note: overwrite prompt path is `projectRoot/specd.yaml` computed in CLI (init.ts:187), while writer returns `initResult.configPath`; they coincide today. Not a violation.)
  Scenario -> test (project-init.spec.ts):
- --plugin flag: 95-122; opencode: 124-148; alias init identical + JSON: 397-447; wizard plugin selection: 245-263; no plugin valid: 291-317; overwrite confirmation text: 319-338; cancelling wizard -> exit 0: partial 265-289 (does not assert exit code for the isCancel path; only decline path asserts exit(0) at 333); declining overwrite: 319-338; help text: 340-348; banner wizard-only: 245-263, 379-395; explicit default flag: 222-243; known options exactly five: 291-317; JSON plugins results: 150-179; text metadata line: 449-465; JSON metadataCachePath: 424-447; install host plugins:false: 119-121 (does not assert the `configPath` argument); install failure exit 1: 200-220; invalid plugin name before init: 181-198; non-interactive fails w/o --force: 467-486 (asserts throw only; no `error:` stderr nor file-unchanged assertion — mocked writer); --force: 488-505.
- Not testable at CLI unit level / covered elsewhere (core ConfigWriter specs): config placement (git root vs cwd), standard directories, .gitignore entries, tmp/.gitignore, metadata cache dir creation, `configVersion: 2`, `--force` overwriting schema. No CLI-level test exists for git-root vs cwd placement (init.ts:28-35 logic untested here).
  Gaps (minor): prompt-cancel exit 0 unasserted; `configPath` arg of post-init `resolveCliContext` unasserted; project root placement untested in CLI; `error:` stderr for existing config unasserted.

## cli:project-update

Requirements: met.

- update.ts reuses `updatePluginsWithKernel` (shared impl), plugins:false (35-38), allowlist honoured via shared fn, config not modified, `project is up to date` when empty (41-48), `plugins: updated <name>` / `plugins: error <name> (<detail>)` (50-57), JSON `{plugins, hasErrors}` (59), exit 1 on errors (62-64), missing config -> resolveCliContext rejects -> handleError exit.
  Minor discrepancy: in JSON mode with no plugins the command prints `{plugins:[], hasErrors:false}` — spec shape-compatible.
  Scenario -> test: format option: project-update.spec.ts:70-84; declared plugins updated via UpdatePlugin: project-update-allowlist.spec.ts:43-72 (not install()); allowlist: same 64-67; host plugins:false + yaml untouched: same 62-71 and project-update.spec.ts:53; text prefix: 41-54; up-to-date: 56-68 (exit 0 not asserted explicitly; no throw); JSON shape: 70-84, 101-114; missing config: 116-125 (stderr contains mocked message, not the `error:` prefix; handleError adds prefix); partial failure: 86-99, 101-114 (the "second plugin still updated" is covered in plugins-update.spec.ts:147-162 for the shared function).
  Gaps (minor): `plugins: error <name> (<detail>)` text line not asserted; `error:` prefix for missing config not asserted.

## cli:host-context

Requirements: met; no regressions.

- resolveCliContext -> openCliHost -> openSpecdHost, kernel options from `buildCliKernelOptions`, `plugins` forwarded only when provided (cli-context.ts:91-97); warnings consumed from `config.warnings`, emitted once per call (98-103); returns CliContext (SdkHostContext + config + configFilePath) (cli-context-types.ts).
- openCliHost: both forms, forwards input unchanged, registers `host.dispose()` after successful open only (cli-host.ts:39-44). Cleanup registry: reverse order, idempotent promise, failures -> `warning: cleanup failed: <msg>`, AggregateError flattened, late registration invoked immediately (cli-cleanup.ts). Entrypoint run.ts:73 awaits cleanup on all exits; signals run cleanup (cli-signals.ts:29).
- Graph index worker: `plugins:false` on both bootstrap forms, `host.dispose()` in finally (graph-index-task.ts:59-84).
- No direct openSpecdHost/createSdkContext in src outside cli-host.ts and graph-index-task.ts; no resolveSdkHostContext. package.json: @specd/sdk is the only dependency among core/code-graph/sdk (also lists plugin/schema/guide deps, allowed).
- Plugin-managing commands all pass `plugins:false`: install, uninstall, update, list, show, project update, project init post-install.
  Scenario -> test: delegation/shape: test/helpers/cli-context.spec.ts:80-107; -vv kernel options: 19; default plugins enabled: 46; plugins:false: 65; warnings from config / once: 80, 109, 131; onLog callback: no dedicated test found in this file (kernel options only checked via buildCliKernelOptions at 160) — minor gap; entry point guard (no direct SDK bootstrap, no hand-built host): cli-context.spec.ts:199; helper tests: test/helpers/cli-host.spec.ts:20, 34, 48, 61; dispose via registry and idempotent: cli-context.spec.ts:172, 183; cleanup registry: cli-cleanup.spec.ts:14, 30, 44, 61, 73, 84; cleanup on error exit/signals: run.spec.ts:60-84, cli-signals.spec.ts, cli-signals-process.spec.ts; worker dispose success/failure/plugins:false (configured + bootstrap): graph-index-task.spec.ts:46, 62, 26 (line 39), 80 (line ~101); package.json dependency scenario: no test (structural; verified manually).
  Gaps (minor): onLog callback wiring scenario ("log entry reaches the callback") not clearly tested; no automated test for package.json dependency scenario; "Failure warning text `boom`" covered at cli-cleanup.spec.ts:44.

## Cross-spec / dependency contradictions

None found. plugins-install/uninstall/update/list/show/project-update/project-init all consistently reference host-context's `plugins:false`; output shape `{plugins, hasErrors}` is consistent between plugins-install, plugins-update, project-update; project-init reuses install logic as declared.

## Summary counts

- Requirements checked: ~45 across 8 specs; violations 0.
- Spec/code discrepancies: 2 minor wording (allowlist-or-all-ids stated for command in uninstall/update; code defers to use case).
- Scenarios without any test: plugins-uninstall non-agent plugin; plugins-list "lists with broken plugin/plugins:false" and "regardless of kind"; project-init config placement scenarios (git root / cwd) and several core-delegated filesystem scenarios (covered by core ConfigWriter specs, not CLI); host-context package.json dependency and onLog callback delivery.
- Weakly tested (partial assertions): ~10 (see per-spec "Gaps").
- Severity: all minor/informational.

### \_partial-sdk-agents.md

# Partial audit: batch sdk-agents (change plugin-architecture, attempt 5)

Read-only. Specs read via `changes spec-preview ... --artifact specs|verify`. Tests run: sdk 104 pass, claude 16, copilot 17, codex 17, opencode 14, standard 16 (all pass). Note: `rtk diff` output was unreliable (reported "identical" for non-identical files); I read files directly.

## Summary counts

- Critical: 0 | Major: 0 | Minor: 6 | Info: 4
- Both prior majors confirmed resolved (sdk:composition CLI dependency wording now matches `packages/cli/package.json`; owner registered before first shared write in all 5 plugins).
- Scenarios with no test (or only indirect): sdk 3, agent plugins ~8 distinct themes (listed per spec), skills 0 new.

---

## 1. sdk:composition -- status: COMPLIANT

Requirements (all met):

- Package identity/deps: `packages/sdk/package.json:13-17` deps = code-graph, core, plugin-manager only. No cli/mcp/plugin-agent-\*. plugin-manager deps: `@specd/core` only (`packages/plugin-manager/package.json:33`), no sdk -> acyclic.
- Layer structure: `src/` has composition, orchestration, presentation, shared, domain (+ core-reexports.ts, index.ts, ports.ts, extensions.ts); no infrastructure/. `domain/` only `errors/invalid-provider-lifecycle-error.ts`. `exports` has `.`, `./ports`, `./extensions` pointing at dist (`package.json:19-31`).
- Public barrel (`src/index.ts`): all listed names present: createSdkContext/openSpecdHost/withOpenGraphProvider + types (L5-12); ContributionKindHandler/ActivationContext types (L13); all 11 plugin errors incl. PluginDestroyError (L14-26); isPluginName/PLUGIN_NAME_REGEX/createConfigWriter via `core-reexports.ts:4,526-527`; orchestration (L28-42); InvalidProviderLifecycleError (L44); presentation (L48-52); code-graph symbols (L54-138); SDK_VERSION (L145). No `export * from '@specd/core'` (uses `export * from './core-reexports.js'`, acceptable, test asserts source). No Save/Update/Invalidate/PersistSpecMetadata exports.
- Import policy: CLI deps (`packages/cli/package.json:30-38`) = sdk, guide, 5 plugin-agent-\*, plugin-manager, schema-std; no core/code-graph. Matches loosened spec and scenario.
- Version: `index.ts:145`.

Scenario -> test:

- SDK depends on core/code-graph/plugin-manager: `sdk/test/composition/package-boundary.spec.ts:12` (also composition.spec.ts:8)
- Dependency graph acyclic: package-boundary.spec.ts:24
- Source tree / domain narrow: package-boundary.spec.ts:56; barrel.spec.ts:182
- Shared dir no public subpath: barrel.spec.ts:182
- No export star: barrel.spec.ts:82
- openSpecdHost/createKernel/buildProjectStatusSnapshot: barrel.spec.ts:36,45
- context markdown helpers: barrel.spec.ts:36 area / presentation specs (indirect; see gap G1)
- createGetStatus/createSpecRepository: barrel.spec.ts:45-53
- metadata surface + removed APIs: barrel.spec.ts:87, :100
- ports subpath / extensions: barrel.spec.ts:207, :213
- handler contracts (type-level): barrel.spec.ts:65 (runtime only, see G2)
- plugin error classes same class as plugin-manager: barrel.spec.ts:57
- Isolated worker / raw lock absent / built declarations / host w/o code-graph: barrel.spec.ts:116, :140, :164, :105
- CLI has no direct core/code-graph: package-boundary.spec.ts:42
- Plugin may depend on core: package-boundary.spec.ts:35
- SDK_VERSION: barrel.spec.ts:32
- Review barrel: barrel.spec.ts:36

Gaps / discrepancies:

- G1 (Info): "SDK exports context markdown presentation helpers" has no explicit assertion in barrel.spec.ts (`changeContextToMarkdown`/`projectContextToMarkdown` not asserted on the barrel; only unit-tested in presentation specs importing from src). Minor.
- G2 (Minor): "SDK exports handler contracts for plugin hosts" is declared a type-level assertion; barrel.spec.ts:65-80 only checks runtime error classes. `ContributionKindHandler`, `ContributionActivationContext`, `SdkContextOptions` have no type-level test (no `expectTypeOf`/tsc fixture). The built-declaration test (barrel.spec.ts:140) may cover SdkContextOptions indirectly; not verified.
- Spec lists `computeWorkspaceFingerprint` etc. and `SDK` aliases: all present.

---

## 2. sdk:host-context -- status: COMPLIANT

Code: `packages/sdk/src/composition/host-context.ts`.

- SdkHostContext shape (L24-35): kernel, createGraphProvider, dispose, AsyncDisposable; no config field. OK.
- createSdkContext (L98-123): builder from config+options.kernel (L102); `registerPlugins(builder, config, {handlers: options?.pluginHandlers ?? []})` unless `plugins === false` (L103-106) -- spec says handlers = "owned by plugin-manager plus options.pluginHandlers"; SDK passes only host handlers and relies on plugin-manager owning its own (consistent, not a defect); build awaited (L109); on build rejection dispose registration (L113-121); if dispose throws, the build error is rethrown and rollback errors attached (L116-119, 160-177). `dispose = () => kernel.dispose()` and `[Symbol.asyncDispose]` same fn (L124-129). Graph provider closes over same config (L127).
- rollbackErrors wording check: spec L301 / scenario "Build failure is not masked": code throws the ORIGINAL error E unchanged (identity preserved) and attaches enumerable `rollbackErrors` via defineProperty (L165-171). AggregateError is flattened to individual failures (L141-151) -- consistent with "the dispose errors are attached". Verified.
- Behaviour NOT stated in spec (Info I1): when E is a primitive/null (cannot carry properties) the rollback failures are logged via `Logger.warn` (L173-176). Spec text says only "attached as rollbackErrors". Code is a superset; spec could add one clause. Tested at host-context.spec.ts:105-130.
- openSpecdHost (L144-186 region): mixed configPath+startDir rejected (L137-139 area); forced vs discovery vs cwd; bootstrap fallback only for discovery + ConfigNotFoundError + flag (L155-170); returns `{config, configFilePath, ...ctx}` so disposal members carried. No config writes. OK.
- Config mutation boundary: no write methods.

Scenario -> test (`packages/sdk/test/composition/host-context.spec.ts` unless noted):

- Context exposes kernel/provider/dispose only: :282
- Context async-disposable / await using: :316
- Provider factory same config: :60
- awaits kernel construction: :60 (implicit, async)
- Each provider call new instance: :142
- Disposal delegates to kernel / same fn: :298
- Kernel options forwarded: :195 (checks createKernelBuilder with options; OK)
- Plugins registered before build: :60 (invocationCallOrder, :67-69)
- Plugins disabled: :73
- Plugins enabled by default: :60 (registerPlugins toHaveBeenCalled)
- Plugins enabled with empty plugin list: NO dedicated test (G3, Minor). registerPlugins is mocked in unit spec; e2e spec has no empty-config case.
- openSpecdHost forwards plugins option: :211
- Broken plugin fails context creation: host-context-e2e.spec.ts:113 (checks PluginInitError and no init order recorded) -- "already initialized plugins were destroyed" is NOT asserted (only one plugin `a` in that test; G4, Minor). Also "no kernel built" asserted only indirectly.
- Build failure disposes plugins: :79
- Build failure not masked by dispose failure: :95 (rejects.toBe(buildError), rollbackErrors [disposeError]) -- matches updated wording
- End to end real plugin-manager: host-context-e2e.spec.ts:103
- Extra handlers forwarded: :79 (objectContaining handlers [handler])
- Discovery mode cwd: :156; startDir: :221; forced path: :216; mixed rejected: :228; options forwarded: :195; warnings on config: :165,:177; fallback: :238; explicit config never falls back: :262
- Disposal: share promise :307; reverse destroy order host-context-e2e.spec.ts:103; await using :316; result carries members :326; providers not closed :333; no foreign-kernel API :344
- Host context has no write methods: :290

---

## 3. skills:shared-folder-owners -- status: COMPLIANT (spec allows node:path now)

Code: `packages/skills/src/application/shared-folder-owners.ts`.

- Marker: sorted/dedup (`sortUnique` L~128), `{owners}` shape check (L~165-175); invalid/unreadable -> "no marker" without repair in read path. OK.
- addSharedOwner: mkdir recursive, replace invalid marker with only agentId, idempotent when already owner (returns without write). OK.
- removeSharedOwner: valid -> remove/write/unlink; invalid -> `{remaining: [], hadMarker:false}` with no write; non-owner -> unchanged. OK.
- removeSharedFolderIfEmpty: `rmdir`, swallows only ENOTEMPTY/ENOENT. OK.
- Constraint "only node:fs/promises and node:path, no logging": imports are exactly those two (L1-2). OK. Exports from `skills/src/index.ts:23-27`.
- "Register before first write" requirement (L20): satisfied by all 5 plugins (see section 9 table).

Scenario -> test (`skills/test/application/shared-folder-owners.spec.ts`; EACCES in `shared-folder-owners-eacces.spec.ts`):

- Marker sorted/dedup :29; corrupt marker :67; first owner :38; idempotent :46; invalid replaced :56
- Owner registered before first shared write: plugin-level tests only (no skills-level test; correct place): claude `plugin-agent-claude/test/install-skills.spec.ts:589`, copilot `...copilot/test/install-skills.spec.ts:511`, codex `...codex/test/install-skills.spec.ts:497`, opencode `...opencode/test/install-skills.spec.ts:560`, standard `...standard/test/install-skills.spec.ts:554`. Each makes a 2nd shared write fail (dir named like file), asserts `.owners.json` == [agent], and a later full uninstall cleans up. Note: would also pass if registration happened after the first but before the second write (does not pin "before first"). Minor (G5).
- Owners remain / last owner / no marker / non-owner: :77, :87, :96, :109
- Empty folder removed :121; foreign file kept :129; missing folder :139; EACCES rethrown: eacces spec :20
- Uninstall protocol scenarios (another agent, last agent, foreign file, legacy, filtered): per-plugin tests (see sections 4-8); no skills-level test, and not needed.

---

## 4. plugin-agent-claude:plugin-agent -- status: COMPLIANT (spec wording issue D1)

Code: `plugin-agent-claude/src/index.ts`, `application/use-cases/install-skills.ts`, `uninstall-skills.ts`, `domain/types/claude-plugin.ts`, `domain/frontmatter/index.ts`.

- Factory: async `create`, manifest read from own dir then parent (index.ts:15-30), no `type` (claude-plugin.ts). Manifest `schemaVersion 2`, `contributes.agents.claude` (specd-plugin.json). Constructor takes name/version.
- Install: ResolveBundle; capabilities default `['mcp','agents','frontmatter']` (install-skills.ts:50); skills -> `.claude/skills/<n>/`, agents -> `.claude/agents/<n>.md` or sharedDir `<n>.agent.md` when no `agents` capability (L51-54, 128-130); `tools` passed as comma string and `model` only when `item.metadata.model` (L74-76); CLAUDE.md `injectSpecdBlock(...,'claude')` (L160-163). Owner registered before first shared write (L137-142). No `buildCapabilities`.
- Uninstall: filtered returns before touching owners/prompt/shared (uninstall-skills.ts:50-52); full removes managed skills (+legacy flat .md), agents, `removeSpecdBlock`, `removeSharedOwner` protocol, `removeSharedFolderIfEmpty`.
- No `Claude no-op` remains (confirmed `destroy`/`init` trivial but spec-neutral).

Scenario -> test (`plugin-agent-claude/test/install-skills.spec.ts` unless noted):

- Exports create / returns plugin: :143 (implicit), domain spec :8
- Factory reads manifest name/version: domain `claude-plugin.spec.ts:8` + install-skills :17 (version asserted)
- No type discriminator: install-skills.spec.ts:18
- Async factory awaited: :143 (await create)
- Manifest declares agents contribution: claude-plugin.spec.ts:33
- Install receives context: claude-plugin.spec.ts:21
- Frontmatter via skills rendering / shared w/o frontmatter: :143
- Install location / SKILL.md absent: :143 (SKILL.md refs :162,:172)
- Agent categorized dir + comma tools: :231 (tools at :292)
- Agent model from metadata: :549
- Agent without model omits key: NO explicit negative assertion (G6, Minor; :231 uses exact frontmatter object without model, which implicitly checks it -- weak but present)
- Fallback to shared when no agents capability: :491
- Prompt block install/uninstall: :345; filtered keeps block: :473/:483 (marker+shared; block kept assertion not verified separately)
- Uninstall selected skills, keep shared: :193/:210
- Uninstall without filter, unrelated user skills remain, legacy flat md: :223 (user-skill :217-225); legacy flat `.md` removal not asserted (G7 Minor)
- Uninstall selected agent files (options.agents): NO TEST (G8, Minor)
- Uninstall without filter removes all managed agents, unrelated user agents stay: NO explicit test (G8)
- Filtered uninstall keeps prompt block + marker: :473 (skills filter only; agents filter untested)
- Owner registration (full, filtered): :380 (filtered), full install covered by :400-:440
- Other owners keep files :400; last owner :422; foreign file :440; legacy no marker :457; agents next to shared.md :491
- Domain layer files / Frontmatter type fields / unsupported key excluded: NO tests (structural scenarios; G9 Info)
- InstallSkills passes values / ResolveBundle only / getBundle not called directly: :143 (getBundle mock refs :152,:178)
- Fast-track install + journal resumability: :167-:196; manual-only description + `disable_model_invocation: true`: :187

---

## 5. plugin-agent-copilot:plugin-agent -- status: COMPLIANT (D1)

Code: `plugin-agent-copilot/src/application/use-cases/install-skills.ts` (+ uninstall). Capabilities `['frontmatter','agents']` (L50); skills `.github/skills`, agents `.github/agents/<n>.agent.md` (always `.agent.md`, also in shared fallback); `tools` emitted as YAML list via `splitTopLevelCommas` (top-level comma split, parentheses-aware, L~90-100 and bottom of file); prompt `.github/copilot-instructions.md` tag `copilot`; owner registered before first shared write (L145-150). Uninstall: removes `.github/agents/<n>.agent.md`; protocol identical to claude.
Frontmatter type (`domain/types/frontmatter.ts`): name, description, license, allowed-tools, user-invocable, disable-model-invocation = exact spec set.

Scenario -> test (`plugin-agent-copilot/test/install-skills.spec.ts`):

- Factory/manifest/context: :18 (`type`), `domain/types/copilot-plugin.spec.ts:8,:21,:29`
- Runtime contract / no capability objects / ResolveBundle only: :147 (getBundle refs :156,:182)
- Shared files routed: :147; Frontmatter field contract + unsupported keys absent: NO dedicated type test (G9)
- Install location / SKILL.md absent: :147
- Agent profiles to `.github/agents/` (tools list): :230 (tools array :292); top-level comma split: :594
- Prompt block: :319 (filtered keeps block: only via :493 marker test; block assertion not separate)
- Uninstall selected skills: :209; unfiltered: :222; selected agent files: NO TEST; all managed agents: NO explicit test (G8)
- Owner scenarios: filtered install registers :363; other owners :383; last owner :457; foreign file :476; filtered uninstall keeps marker :493; legacy no marker :549; agents next to shared.md :401; owner before first write :511
- Fast-track omits unsupported branches + manual-only (`disable-model-invocation`): :565 (:581)

---

## 6. plugin-agent-codex:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: capabilities `['mcp','agents','frontmatter']`; agents -> `.codex/agents/<n>.toml` with `name`, `description` via `escapeTomlBasicString` (L~232-262, escapes `\\ " \b \t \n \f \r` and control chars as \uXXXX), `developer_instructions = """..."""` via `escapeTomlBasicMultiline` (escapes `\\` and `"""`); fallback `<n>.agent.md` in sharedDir; prompt AGENTS.md tag `codex`; owner before first shared write (L~128-133). Uninstall removes `<n>.toml` (full + filtered), unlike claude's `.md` (correct, `uninstall-skills.ts:49,67`). Frontmatter type name+description only.
Note: `escapeTomlBasicMultiline` calls `.trim()` on content (strips leading/trailing whitespace) -- harmless, not in spec (Info I2).

Scenario -> test (`plugin-agent-codex/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:29; runtime contract/ResolveBundle: :144
- Agents TOML: :223; backslash escaping: :327; basic string escaping: :579,:587
- Prompt block + legacy marker not injected: :301; other owner remains :375
- Uninstall selected skills :208, all :215; selected agent files (toml) / all agents: NO TEST (G8)
- Owner scenarios: :375 (other owners), :443 (last owner), :462 (foreign), :479 (filtered), :535 (legacy), :398 (agents capability missing), :497 (owner before first write)
- Filtered install registers owner: no codex-specific test (G10 Minor; covered for claude :380 and copilot :363 only)
- Fast-track: :551
- Frontmatter field contract / unsupported keys: NO test (G9)

---

## 7. plugin-agent-opencode:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: `mode: 'subagent'`, `permission` map via `toOpenCodePermission` (lowercased tool, `{ '*': allow, pattern: allow }` nesting, no duplicate keys because Map-grouped; spec rule fulfilled); agents `.opencode/agents/<n>.md` or sharedDir `<n>.agent.md`; install calls `removeSpecdBlock(...,'opencode')` then `injectSpecdBlock` (L~160-163) as the spec requires to purge legacy; owner before first shared write; uninstall protocol; wizard lists `@specd/plugin-agent-opencode` (`cli/src/commands/project/init.ts:18`); meta package dependency (`packages/specd/package.json:23`).

Scenario -> test (`plugin-agent-opencode/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:29; Frontmatter field set / unsupported keys: NO test (G9)
- Install passes capabilities / shared w/o frontmatter: :125; fast-track: :182
- Agents + bash pattern restrictions + plain tools allow: :264 (permission :326-333); `"*": allow` merge of bare+pattern: NOT tested (G11 Minor)
- Prompt block + legacy marker removed on install: :355 (:389-402); keep block while another references: :427; filtered keeps: not separately
- Uninstall selected skills :161, all :174; selected agents / all agents: NO TEST (G8)
- Wizard/meta-package scenarios: `cli/test/commands/project-init.spec.ts` (wizard); meta-package: no test found (G12 Info)
- Owner scenarios: :427, :506, :525, :542, :598, :450, :560
- Filtered install registers owner: no opencode-specific test (G10)

---

## 8. plugin-agent-standard:plugin-agent -- status: COMPLIANT (D1)

Code: install-skills.ts: capabilities literal `['frontmatter']` (L~58); skills `.agents/skills/<n>/`; agents unconditionally `<n>.agent.md` in sharedDir; the previous dead branch is gone (confirmed: no `supportsAgents` in the file); AGENTS.md tag `standard`; owner before first shared write; uninstall filtered agents removes `<n>.agent.md` from sharedDir only (explicit exception allowed by owners spec L44); frontmatter map uses `allowed-tools` with space-style `Bash(x *)`; `specd-compliance` has node, pnpm, git, gh.

Scenario -> test (`plugin-agent-standard/test/install-skills.spec.ts`):

- Factory/manifest: :18, domain spec :8,:21,:34; Frontmatter field set / hyphen: NO test (G9)
- Install location / fallback: :128, :275; fast-track: :188
- Prompt: :357; two tagged blocks :437; legacy marker purge on uninstall: :357 (:370)
- allowed-tools each skill: :422 only covers fasttrack + compliance (G13 Minor: "every Bash pattern uses space style" is asserted for 2 of 8 skills)
- specd-compliance tools: :422
- Uninstall selected skills :167, all :180, selected agent file :456, user file stays :383
- Owner scenarios: :500 (last owner), :519 (foreign), :536 (filtered), :484 (legacy), :554 (owner before first write); filtered-install-registers and other-owners-keep: no standard-specific test (G10)
- Wizard/meta: same as opencode.

---

## 9. Cross-cutting: owner registration before first shared write (all 5 plugins)

| Plugin                           | file:line (addSharedOwner call, guarded by !ownerRegistered, inside write loop before writeFile) |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude                           | plugin-agent-claude/src/application/use-cases/install-skills.ts:137-142                          |
| copilot                          | plugin-agent-copilot/.../install-skills.ts:145-150                                               |
| codex                            | plugin-agent-codex/.../install-skills.ts:128-133                                                 |
| opencode                         | plugin-agent-opencode/.../install-skills.ts:~150-155                                             |
| standard                         | plugin-agent-standard/.../install-skills.ts:~128-133                                             |
| Condition `(file.shared === true |                                                                                                  | baseDir === sharedDir)`covers both shared bundle files and agent fallback writes. Edge (Info I3):`mkdir(skillsTargetDir)` etc. happen before registration, but only non-shared dirs; marker is registered strictly before the first write into sharedDir. Verified. |

## Discrepancies (spec vs code)

D1 (Minor, spec wording, affects ALL 5 plugin specs + dependency contradiction): Each plugin spec requirement "Shared folder ownership and agent placement" says "**After** writing any file into the resolved `sharedFolder` location ..., `install()` MUST call `addSharedOwner(...)`". `skills:shared-folder-owners` (L20) and the code (table in section 9) require/implement registering BEFORE the first shared write. Plugin specs still carry the old ordering.

- spec: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, requirement "Shared folder ownership and agent placement", first paragraph
- code: install-skills.ts, see table above
- Suggested fix: reword to "Before writing the first file into the resolved sharedFolder location ... (see skills:shared-folder-owners)".

D2 (Minor, missing scenario): The new scenario "Owner registered before the first shared write" exists only in `skills:shared-folder-owners` verify.md. None of the 5 plugin verify.md files contain it, although each plugin has a test for it (lines in section 3). Add a scenario to each plugin's verify.md or explicitly state that coverage lives in the skills spec.

D3 (Minor, spec contradiction between plugin specs and owners spec): Plugin specs (claude/copilot/codex/opencode) say a filtered uninstall "MUST NOT remove the shared folder, any file in it, or the owners marker". The owners spec (L44) permits an exception: the explicitly selected agent file for plugins that write agents into the shared folder. In claude/copilot/codex/opencode, when `agents` capability is absent, filtered `options.agents` uninstall deletes `<agent>.agent.md` from the shared folder (e.g. `plugin-agent-claude/.../uninstall-skills.ts:46-50`, codex `:49`). Standard's spec does carry the exception (selected agent file from shared folder), the other four do not. Code behaviour is sensible and matches the owners spec; plugin spec text should add the exception.

D4 (Minor, spec omission): sdk:host-context says rollback errors are "attached as `rollbackErrors`" but the code also handles primitive/null build errors by `Logger.warn` (host-context.ts:173-176; tested host-context.spec.ts:105-130). Spec should mention it (or the `Logger` dependency is undocumented). Code never wraps; build error propagates unchanged: wording consistent otherwise.

D5 (Info): sdk:composition lists `src/` allowed dirs but real tree also holds `core-reexports.ts`, `ports.ts`, `extensions.ts` (top-level files); spec's layer list does not mention top-level files. Harmless.

D6 (Info): `plugin-agent-claude` spec says model comes from `specd-agent.meta.json`; code reads `item.metadata.model` from the skills repository (indirect, same source). OK.

## Scenario -> test gaps (consolidated)

- G2 sdk:composition handler contracts type-level assertion (no type test)
- G3 sdk:host-context "Plugins enabled with an empty plugin list" no test
- G4 sdk:host-context "Broken plugin" does not assert already-initialized plugins destroyed (needs 2-plugin case with 2nd failing)
- G5 owner-before-first-write tests would also pass if registration happened after the first write but before the second
- G6 claude "Agent without model omits the key" no explicit negative assertion
- G7 claude "legacy flat <skill>.md removal" not asserted
- G8 "Uninstall removes selected agent files" / "removes all specd-managed agents (unrelated agent files remain)" untested in claude, copilot, codex, opencode (only standard :456); also `options.agents` filtered uninstall keeping prompt block + marker untested in all 5
- G9 Domain-layer / Frontmatter-type / field-contract / unsupported-key scenarios untested in all 5 plugins (structural)
- G10 "Filtered install also registers the owner" tested for claude (:380) and copilot (:363) only; absent for codex, opencode, standard. "Other owners keep the shared files" absent for standard
- G11 opencode bare+pattern -> `"*": allow` merge untested
- G12 meta-package inclusion scenarios (opencode, standard): no test found
- G13 standard "every Bash pattern uses space style": 2 of 8 skills asserted

## Severity roll-up

- Major: none open.
- Minor: D1, D2, D3, D4, G8 (agent-filter uninstall coverage), G10.
- Info: D5, D6, G2-G7, G9, G11-G13, I1 Logger.warn path, I2 codex trim.

## Verified-fixed since attempt 4

- sdk:composition CLI dependency scenario now matches cli/package.json (sdk + guide + plugin-agent-\* + plugin-manager + schema-std; no core/code-graph).
- Owner marker registered before the first shared write in all five plugins (tests per plugin).
- attachRollbackErrors: no wrapping, original error propagates (identity), rollbackErrors defined enumerable; primitives log via Logger.warn.
- PluginDestroyError re-exported (`sdk/src/index.ts:19`) and asserted same class as plugin-manager (barrel.spec.ts:57-60).
- Claude no-op removed (no leftover conditional), Copilot top-level comma split (`splitTopLevelCommas`, test :594), Codex TOML escape (tests :327,:579,:587), Standard dead branch removed, owners helper imports only node:fs/promises and node:path.
