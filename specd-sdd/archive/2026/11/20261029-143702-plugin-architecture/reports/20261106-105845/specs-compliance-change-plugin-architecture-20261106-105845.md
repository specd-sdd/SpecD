# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-7)

## Summary

| Batch                     | Critical | Major                                                          | Minor            | Notes                                                                     |
| ------------------------- | -------- | -------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| core/config (5 specs)     | 0        | 0                                                              | 9                | attempt-6 major closed                                                    |
| plugin-manager (11 specs) | 0        | 0                                                              | 20 (+3 info)     | ~520 hostile probes: 6 exotic non-SpecdError escapes (E1-E6)              |
| cli (8 specs)             | 0        | 0                                                              | 12               | m1 column order, m2 uninstall duplicates, m3 uninstall of missing package |
| sdk/agents (8 specs)      | 0        | 1 (C1, latent: filtered uninstall deletes any name incl. `..`) | 6 + 14 test gaps | ~150 mutants run                                                          |
| **Total**                 | **0**    | **1**                                                          | **~47**          |                                                                           |

Baseline before the audit: all package suites passing.

## Detailed findings

### \_partial-core-config.md

# Partial audit (attempt 7): core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show

Totals: critical 0, major 0, minor 9 (plus 3 informational). The attempt-6 major (duplicate plugin names in an extending layer collapsed) is fixed. All attempt-6 fixes verified (see "Fix verification").

Paths are relative to packages/core unless stated. Line numbers are from the working tree.

## Fix verification (attempt 6 -> 7)

- Duplicate names inside an extending layer: `src/infrastructure/fs/config-cascade.ts:530-540` (`assertNoDuplicateLayerPlugins`), called at `:568` before the layer is merged. Tests: `test/infrastructure/fs/config-loader.spec.ts:2518` (asserts message and layer path) and `:2539` (no inherited plugins).
- Add and remove of one name in the same layer: `config-cascade.ts:502-515` throws "declared by this layer and is not inherited". Removals run before the layer merge (`:571-576`). Test: `config-loader.spec.ts:2550`.
- `InvalidCheckIdError`: `src/domain/services/check-registry.ts:249-251`. The check runs after the plugin-name check and before the canonical id is built. Test: `test/domain/services/check-registry.spec.ts:293`.
- `addPlugin` rejects an empty (null-contents) document: `src/infrastructure/fs/config-writer.ts:132-137`. Test: `test/infrastructure/fs/config-writer.spec.ts:435-452`. Residual gap: M2.
- Non-ENOENT read errors in the writer: `config-writer.ts:182` and `:246` wrap them via `unreadableConfigError`. Test: `config-writer.spec.ts:454`. The loader still has the raw rethrow: M1.

## core:config

Requirements touched: Cascade identity and removal model, Plugin declarations, Config version, Config writer port (summary), Startup validation.

| Requirement                                                                | Status                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade identity and removal model (plugins by `name`)                     | Implemented. Merge: `src/application/ports/config-schema.ts:335-375` (`mergePluginLists`, replace in place, append new names). Removal: `config-cascade.ts:497-517`. Absent name, no inherited plugins, and a repeated removal entry all raise `ConfigValidationError`.                                                                                                    |
| Plugin declarations (grammar, `contributions` min 1, duplicates per layer) | Implemented. `config-schema.ts:207-228` (regex from `domain/plugin-name.ts`, `.strict()`, `.min(1)`, duplicate `superRefine`). The loader maps entries at `config-loader.ts` ~664-675 and does not load plugins.                                                                                                                                                           |
| Config version                                                             | Implemented. `assertCurrentConfigFormat` (`config-loader.ts` ~688-700) checks the version first, then legacy. It runs on every active layer before merge (`:263`). Mismatch check: `config-cascade.ts:562`. `LegacyConfigFormatError` and `UnsupportedConfigVersionError` extend `ConfigValidationError`. `initProject` writes `configVersion: 2` (`config-writer.ts:59`). |
| Startup validation                                                         | Unchanged behaviour. `remove` without `extends` is rejected at `config-cascade.ts:228`. `remove.root: [schema]` is rejected at `:234`. Unknown workspace and storage removal targets are rejected at `:456-478`.                                                                                                                                                           |

Scenario to test map (core:config verify):

- Context entry removed by id: `config-loader.spec.ts:2342`. Strong.
- Plugin entry removed by name identity: `:2394`. Strong (length and name asserted).
- Removing an absent plugin name fails: `:2497` (message asserted) and `:2588` (no inherited plugins).
- Duplicate names in the removal list are rejected: `:2462`. Weak (M5).
- Layer plugin replaces the inherited entry with the same name: `:2419`. Weak on "in place" (M5).
- Layer plugin with a new name is appended: `:2419`.
- Workspace removed by name: `:2291`.
- Plugin declarations:
  - Flat list: `:1215`
  - Entry shape: `:1215`
  - Invalid structure: `:1258`
  - Unscoped name: `:1285`
  - Duplicate name: `:1297`
  - Contributions allowlist kept: `:1215`
  - Empty contributions rejected: `:1272`
  - Duplicate in an extending layer: `:2518` and `:2539`
  - Add and remove in the same layer: `:2550`
- Config version:
  - Absent version accepted: `:1350`
  - Newer version rejected: `:1337` (code and class asserted)
  - Legacy migration with `configVersion: 2` in the message: `:1310`
  - Legacy detection precedes schema errors: `:1310`. There is no separate test, but the legacy error class is asserted, so it is adequate.
  - Invalid value rejected: `:1357` and `:1422`
  - `plugins: { skills: [] }` is generic: `:1363`
  - Legacy in an extending layer, naming the layer path: `:2446`
  - init writes `configVersion`: `test/infrastructure/fs/config-writer.spec.ts:42`
  - Mismatch in an extending layer: `:2483`
- Startup validation:
  - Remove without extends: `:2599`
  - Invalid `extends` value: `:3189` region
  - Required root field: `:2614`
  - Unknown workspace removal: `:3151`
  - Explicit `extends` outside the chain is skipped: `:2112`
- Config writer port scenarios: see core:config-writer-port below.

## core:config-loader

| Requirement                                                                                                                   | Status                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML parsing and structural validation (version and legacy before strict schema, version before legacy within a layer)        | Conforms. Tests: `config-loader.spec.ts:1310`, `:1337`, `:1375` (newer plus legacy gives Unsupported), `:1388` (extending layer), `:1401`.                      |
| Schema plugins, overrides and context entry mapping (flat `plugins`, identity by `name`, `remove.plugins`, no plugin loading) | Conforms. Tests: `:1215`, `:1241` (absent package still loads), `:2394`, `:2419`, `:2462`, `:2497`.                                                             |
| All errors are `ConfigValidationError`                                                                                        | **Divergence M1** (below).                                                                                                                                      |
| Layer merge semantics                                                                                                         | Conforms. Plugin lists are copied before removal, so no previous layer is mutated. Tests: `test/infrastructure/fs/config-cascade-plugins.spec.ts:22` and `:41`. |

## core:config-writer-port

| Requirement                    | Status                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface shape and signatures | Conforms. `src/application/ports/config-writer.ts:51-94`. `AddPluginOptions` has `config` and `contributions` as readonly optionals. `listPlugins` returns `ConfigDeclaredPlugin[]` with readonly fields, which is slightly wider than the spec's mutable types (informational).                                        |
| AddPlugin                      | Conforms with gap M2. Argument checks run before any read (`config-writer.ts:119-130`). Merge preserves omitted fields (`mergePluginEntry`). No duplicate entries. The legacy shape, invalid shapes and invalid YAML are rejected without a rewrite. A missing file throws. A directory throws `ConfigValidationError`. |
| RemovePlugin                   | Conforms. No-op without a write when the key or name is absent (`:158-160`).                                                                                                                                                                                                                                            |
| ListPlugins                    | Conforms. A missing file or key gives `[]`. Legacy or invalid shapes and bad YAML throw.                                                                                                                                                                                                                                |
| InitProject                    | `configVersion: 2` is written. Other behaviour is unchanged.                                                                                                                                                                                                                                                            |

Scenario to test map (`test/infrastructure/fs/config-writer.spec.ts` unless noted):

- Port defines initProject, addPlugin, removePlugin, listPlugins: `test/composition/config-writer.spec.ts:7` checks only three methods at runtime. `listPlugins` is covered at compile time by the typed mock at `:16`. Weak but acceptable (M9).
- addPlugin adds to the flat list: `:151`.
- addPlugin with config and contributions: `:160` and `:331`.
- addPlugin does not duplicate: `:160` (the second call changes options, so the count is asserted via `toEqual` on the whole list). OK.
- removePlugin removes: `:181`.
- No-op cases: `:192` and `:204`.
- Invalid name: `:260` (byte-identical file).
- Argument error before the missing-file error: `:283`.
- Empty `contributions`: `:311`.
- Empty and comment-only documents: `:435`.
- Scalar and sequence roots: `:417`.
- Legacy shape: `:348`.
- Malformed YAML: `:379`.
- Missing file: `:397`.
- Directory path: `:454`.
- Explicit `undefined` options: `:464`.

## core:check-registry

Requirement: Canonical namespacing and plugin registration. This is the only changed area.

| Item                                                              | Status                                                                                                                                                                 |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin-name grammar `^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$` | Conforms. `check-registry.ts:245` uses `PLUGIN_NAME_REGEX` from `domain/plugin-name.ts`. The error message states the scoped grammar (`check-registry-errors.ts` ~24). |
| Check id grammar                                                  | Conforms. `CHECK_ID_REGEX` is checked at `:249` before the canonical id is built, so nothing is registered on failure.                                                 |
| Canonical id `${pluginName}.${id}` with a single leading `@`      | Conforms. `:253`. No other `@${` construction was found in `src`.                                                                                                      |
| `DuplicateCheckError`, `InvalidCheckKindError`                    | Unchanged.                                                                                                                                                             |

Scenario to test map (`test/domain/services/check-registry.spec.ts`):

- Valid registration gives the canonical id: `:15`.
- Single leading `@`: the `@@` rejection is at `:603`, and the `accepts scoped plugin names` it.each asserts that the id has no second `@`.
- Unscoped name: `:15` and `:261`.
- Special characters: `:261`.
- Message states the grammar: `:76`.
- Check id containing a dot: `:293`, which also asserts that `get('@acme/myplugin.a.b')` is undefined.
- Duplicate registration: `:137`.
- Leading digit, hyphen, underscore: `:53` and `:619`.
- Built-ins never shadowed: `:226` and `:307`.

No gaps beyond M4.

## cli:config-show

Conforms.

- Text output: `src/commands/config/show.ts:62-71`. `plugins:` lists `name  (present)` with ` [contributions: a, b]` only when an allowlist exists. This matches the spec's single-space separator.
- JSON and TOON output: the `SpecdConfig` object is passed through as-is (`:110`).
- The command uses `loadConfig` only and never calls `resolveCliContext`.
- Warnings go to stderr in `src/load-config.ts:23-27`.
- Help text is generated from `src/commands/config/config-shape.ts`. The `satisfies Record<keyof ...>` clauses produce a compile error on drift.
- The runtime drift test compares key sets and checks the level of each key: `test/commands/config-show.spec.ts:402` and `:411`.

Scenario to test map (`packages/cli/test/commands/config-show.spec.ts` unless noted):

- plugins shown: `:200`.
- No contributions suffix: `:240`.
- Allowlist shown: `:200`.
- TOON: `:256`. Decoded and compared with the config.
- JSON: `:274`.
- artifactRules not shown: `:220`.
- Broken plugin does not block: `:291` (mocked) and `test/commands/config-show-real-loader.spec.ts:41` (real loader with an unresolvable package).
- Help documents the current fields: `:402` and `:411`.
- Config not found: `:456` (mocked loader) and `config-show-real-loader.spec.ts:84` and `:102` (real loader).
- Warnings on stderr: `packages/cli/test/load-config.spec.ts:19`.

No gaps.

## Discrepancies and gaps (all minor)

**M1. The loader lets non-ENOENT read errors escape as raw errors.**

- Code: `src/infrastructure/fs/config-cascade.ts:201-205` has `catch (err) { if (isEnoent(err)) throw new ConfigValidationError(...); throw err }`. A config path that is a directory (EISDIR) or unreadable (EACCES) therefore leaks a raw Node error.
- Spec: core:config-loader "All errors are ConfigValidationError" says "No generic YAML/runtime exception SHALL escape for configuration validation failures". Spec and code disagree.
- The writer was fixed (`config-writer.ts:208-213`) but the loader was not.
- No test covers it. The writer has `config-writer.spec.ts:454`; the loader has nothing equivalent.

**M2. `addPlugin` on a document whose root is an explicit null scalar throws a raw `Error`.**

- Code: `config-writer.ts:132` only rejects `doc.contents === null`. For `null` or `~` the contents are a Scalar. `readMappingRoot` turns `toJSON()` null into `{}` (`:224`), then `doc.set('plugins', ...)` at `:145` throws.
- Verified directly with the `yaml` package: `Error: Expected a YAML collection as document contents`.
- Spec: a document with no root mapping MUST be rejected with `ConfigValidationError`. The spec names "empty or comment-only", so a null scalar is an edge outside its examples.
- The file is not rewritten, so the harm is the error type only.
- Tests cover empty, comment-only, string scalar and sequence roots, but not null.
- Note: I could not run the writer probe through vitest (no output), so only the `yaml` behaviour was verified directly.

**M3. A duplicate name in the root layer can be erased silently.**

- Code: `config-cascade.ts:555-584`. The per-layer duplicate check (`:568`) runs only for layers with index 1 or higher. The root layer relies on Zod over the merged result.
- If the root has `[x, x]` and an extending layer has `remove.plugins: [x, x]`, both root entries are removed and no error is raised.
- Spec: core:config "A plugin name MUST appear at most once within any single layer ... MUST be rejected with ConfigValidationError before that layer is merged".
- Untested. Very low likelihood.

**M4. The SDK barrel does not re-export `InvalidCheckIdError`.**

- `src/public.ts:589` exports it. `packages/sdk/src/core-reexports.ts:550-554` exports `InvalidPluginNameError`, `DuplicateCheckError`, `DuplicateCheckBindingError` and `InvalidCheckKindError`, but not `InvalidCheckIdError`.
- `packages/sdk/test/barrel.spec.ts` does not cover it.
- Hosts that depend only on the SDK cannot catch the new error by class. The spec does not require this.

**M5. Weak tests (these would pass if the behaviour were wrong).**

- `config-loader.spec.ts:2419` "replaces in place": base is `[x]` and the layer is `[x, y]`. A delete-then-append implementation also gives `[x, y]`. The test never places the replaced entry in the middle of the list.
- `:2462` "duplicate names in remove.plugins": it asserts only `ConfigValidationError`. Any other rejection (for example "not found" from the second removal, which is the actual mechanism) satisfies it.
- `:1422` mixes four values and asserts only the base class for 3.5 and 2.5, so `UnsupportedConfigVersionError` satisfies it. The dedicated tests at `:1437-1460` do cover the class distinction.

**M6. Writer error text for invalid `plugins` is misleading.**

- `config-writer.ts:192-195` and `:317-320` always say "contributions cannot be empty". This also fires for a duplicate name, a bad scoped name or an unknown key, so the message is incomplete.
- The class is correct. No test checks the message.

**M7. Remove and re-declare of an inherited name is allowed and moves the entry to the end.**

- Test: `config-loader.spec.ts:2570`. A layer that declares `@acme/x` and also removes the inherited `@acme/x` ends with the entry appended after the other inherited entries.
- Spec: core:config only says same-name layer entries replace "in place", and that removing a name the layer itself declares (and does not inherit) fails. Neither covers this combination.
- Decide whether to specify or forbid it.

**M8. Absent root `configVersion` versus an explicit value in an extending layer fails.**

- Code: `config-cascade.ts:562`. Root without `configVersion` plus an extending layer with `configVersion: 2` raises "does not match the root configVersion".
- Spec: "a different configVersion in an extending layer MUST fail validation" and "absent is accepted". It is unclear whether an explicit `2` against an absent root counts as different.
- Untested. The message reports the root as if it had a value.

**M9. The port-shape scenarios have no runtime assertion for `listPlugins`.**

- `test/composition/config-writer.spec.ts:7` asserts three methods. Only the typed mock at `:16` covers `listPlugins`.

## Informational

- `config-writer.spec.ts:218` sits under `describe('listPlugins')` but tests `addPlugin`.
- `doc.set('plugins', plain JS)` (`config-writer.ts:145` and `:161`) rewrites the `plugins` node. Comments or flow style inside that node are lost. Other comments survive. This is not specified, and tests compare only parsed values.
- The `remove.plugins` schema (`LayerRemovalZodSchema`, `config-cascade.ts:32`) is now an array. A legacy `remove: { plugins: { agents: [...] } }` gives a generic schema error, not `LegacyConfigFormatError`. The spec limits legacy detection to the `plugins` value, so this is consistent with it.

## Contradictions with dependency or global specs

None found. The `plugin-manager:specd-plugin-type` grammar matches `PLUGIN_NAME_REGEX`. `plugin-manager/src/infrastructure/loader/plugin-loader.ts:5,38` and `domain/types/specd-plugin.ts:1` reuse core's regex.

### \_partial-plugin-manager.md

# Spec-compliance audit, batch plugin-manager, change `plugin-architecture` (attempt 7)

Scope: plugin-manager:specd-plugin-type, plugin-loader, register-plugins-use-case, install-plugin-use-case, uninstall-plugin-use-case, update-plugin-use-case, list-plugins-use-case, agent-plugin-type, load-plugin-use-case, plugin-errors, plugin-repository-port.
Method: merged specs read with `changes spec-preview ... --artifact specs|verify`; code read in `packages/plugin-manager/src`; tests read in `packages/plugin-manager/test`; probes run against the built dist (`packages/plugin-manager/dist/index.js`, newer than every src file). Probe scripts are in the scratchpad `p7/` (probe1..5.mjs), about 520 hostile cases in total. `vitest run` = 238 pass / 0 fail, `tsc --noEmit` clean (tsconfig includes `test`).

## Verdict

- critical: 0
- major: 0
- minor: 14 (6 are "Specd compatibility" escapes reachable only with exotic caller/handler/loader input; 4 are code/spec drifts; 4 are weak or vacuous tests)
- info: a list of type-contract violations that escape raw (listed in section 2.3)

Every requirement of the 11 specs is implemented. Every verify scenario has at least one test, except the four called out under "no test" below (three of them are cross-package or compile-time by nature).

---

## 1. Per-spec status

### 1.1 specd-plugin-type: all requirements OK

| Requirement                   | Status | Code                                                                                                     |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| SpecdPlugin interface         | OK     | specd-plugin.ts:32-68; no `type`/`configSchema` on the interface                                         |
| PluginContext                 | OK     | specd-plugin.ts:7-15; register-plugins.ts passes only `{config, pluginConfig}`                           |
| isSpecdPlugin                 | OK     | specd-plugin.ts:118-142                                                                                  |
| Plugin manifest               | OK     | plugin-loader.ts:35-46 (`.strict()`, `schemaVersion: literal(2)`)                                        |
| Plugin name                   | OK     | `PLUGIN_NAME_REGEX` (core), used at plugin-loader.ts:38 and specd-plugin.ts:124                          |
| Contribution identity/address | OK     | specd-plugin.ts:71-110; dup id across kinds plugin-loader.ts:360                                         |
| Config schema                 | OK     | plugin-config-schema.ts (walker, depth limit 32 at :18 and :93; `resolvePluginConfig` re-asserts at :67) |
| Kind handler                  | OK     | merge-handlers.ts; contribution-kind-handler.ts                                                          |
| Lifecycles                    | OK     | install/update/uninstall never call init/destroy                                                         |

Scenario -> test:

- Has required properties: specd-plugin.spec.ts:63
- Name/version from manifest: plugin-loader-contract.spec.ts:218
- Optional install hooks: specd-plugin.spec.ts:40; is-specd-plugin.spec.ts:15
- PluginContext init with config: register-plugins.spec.ts:539
- Rejects unscoped / accepts scoped / non-function install: is-specd-plugin.spec.ts:19, :15, :23; specd-plugin.spec.ts:46
- pluginType / schemaVersion / contributes map-of-maps: plugin-loader.spec.ts:477, :587, :603
- Plugin name (valid, unscoped, dot, uppercase): specd-plugin.spec.ts:46-52 (see T4 for the scope-dot gap)
- Address format / id with dot / build validates / parse failures / several dots: specd-plugin.spec.ts:17, :27, :56 (`@acme/x` with zero dots is :27)
- Duplicate id across kinds: plugin-loader.spec.ts:170 (asserts class, pluginName, message)
- Config schema (supported / unsupported / non-object / node shape / properties+depth / resolve self-validates / no schema): plugin-config-schema.spec.ts:21, :44, :124, :131, :148, :84, :222, :229, :236, :193, :77, :209; loader level plugin-loader.spec.ts:197 and :849
- Unknown kind: plugin-loader.spec.ts:197 (weak, T1)
- validatePlugin receives plugin and name: plugin-loader-contract.spec.ts:102; plugin-loader.spec.ts:661
- Duplicate handler kind: plugin-loader-contract.spec.ts:95; plugin-loader.spec.ts:494; register-plugins.spec.ts:420
- Install-time-only kind: register-plugins-contract.spec.ts:125
- Install does not call init / options / mixed kinds: install-plugin.spec.ts:100, :62, :146; plugin-hooks-no-agents.spec.ts:80-106
- Runtime calls init for every plugin: register-plugins.spec.ts:74, :617

### 1.2 plugin-loader: all requirements OK

Load workflow steps 1-9, `createPluginLoader` bag, built-in agents handler first, `DuplicateHandlerKindError` at creation (plugin-loader.ts:313 -> merge-handlers.ts:19), strict manifest, error table, factory forms (plugin-loader.ts:374-394). Cross-check name/version/requested name at :161 and :207-212.

Scenario -> test:

- Package available: plugin-loader.spec.ts:101
- Manifest validated before import: :138, :154, :587, :603
- Version / name / requested-name mismatch: :569, :551, :530
- Named create / export default fn / default object `{create}`: :101 + plugin-loader-contract.spec.ts, :407, :383
- No factory: :641
- Import failure wrapped + SpecdError: plugin-loader-contract.spec.ts:146
- Throwing factory + SpecdError passthrough: plugin-loader-contract.spec.ts:159, :176
- Async factory: contract:66. Factory receives config only: contract:79 (see T7)
- Manifest schema / missing version / unscoped / pluginType / dup / unregistered / invalid block / unsupported keyword / defaultConfig / valid: :81, :154, :477, :170, :197 (the 4 combined), :101
- Base contract violation + exact fields: :456, :431
- Host handler for agents / two host handlers: :494, contract:95
- validatePlugin after base check: :505
- Loader does not run lifecycle: contract:124 (init, destroy, install, uninstall)
- Throwing handler wrapped + SpecdError passthrough: :692, :661
- Non-string projectRoot: :870 (weak, T2)
- Unknown manifest key named: :619
- Factory function carries `config` only: contract:79

### 1.3 register-plugins-use-case: all requirements OK

Code: infrastructure/loader/register-plugins.ts (public `registerPlugins`, `RegisterPluginsInput` exported by name from index) and application/use-cases/register-plugins.ts. The function is `async`, so no synchronous throw whatever the input is. `mergeHandlers` runs before the empty-list shortcut (:63 vs :64-66). Validation of every plugin precedes the first `init` (:80-99 then :146). One disposer `specd-plugins` (:182). Rollback with `rollbackErrors` or `Logger.warn` for frozen errors (:223-235). `PluginDestroyError` with aligned `pluginNames`.

Scenario -> test:

- Called before build (real KernelBuilder): contract:195
- Registration handle disposes: register-plugins.spec.ts:791
- Input defaults: contract:149
- Duplicate handler kind, no sync throw, with and without loader: contract:50, :62; register-plugins.spec.ts:420
- Init in list order / validation before init / selected contributions only / init for agents-only / one named disposer: :74, :143 + :332, :200, :315 + contract:100, contract:77 + :617
- Unknown id / schema violation / defaults / config without schema / duplicate entry: :143, :443, :181, :162, :230
- Destroy reverse / error isolation / idempotent: :617, :389 + :279, :74
- Partial init failure, rollback does not mask, SpecdError from init, activate failure, activate SpecdError: :553 + :110, :349 + :583, :464, :496, :816
- Load failure / plain loader error wrapped / malformed loader result / frozen init error: :848, :242, :691, :653
- Plugins disabled (SDK scenario): sdk host-context.spec.ts:75, :219; host-context-e2e.spec.ts:124 (outside plugin-manager)
- Duplicate handler with empty list / empty list: :432, :65

### 1.4 install / uninstall / update use cases: all requirements OK

Code: install-plugin.ts:62-88, uninstall-plugin.ts:49-66, update-plugin.ts:59-84. The order load -> resolve -> agents check -> hook is the same in all three. `installContextContributions` (resolve-contributions.ts:51-58) filters to agents ids only when the manifest declares agents. Hook failure is wrapped in `PluginValidationError(['install'|'uninstall'])` with cause, and a `SpecdError` passes through.

Scenario -> test (install): input/contributions optional install.spec.ts:35, :232; output :35; default config returned not written :119; not found :211; successful install :35; all/allowlist :232, :248; mixed kinds :146 + plugin-hooks-no-agents.spec.ts:80; options :62 (weak half, T3); unknown id :133; no install hook :100; init not called :35, :100; agents without contract :87; wrapped :164; SpecdError :190.
Uninstall: output void uninstall.spec.ts:21, :174; successful :26; not found :196; unknown id :132; mixed kinds plugin-hooks-no-agents.spec.ts:86; loads via loader :26; not tied to agents :211; no hook :174; init not called :174; agents without contract :154; wrapped :82; SpecdError :107.
Update: loads via loader :17; selection preserved plugin-hooks-no-agents.spec.ts:106 + update.spec.ts:17; id removed :84; not found :211; output shape :17 + plugin-hooks-no-agents.spec.ts:122; idempotent :184; mixed kinds plugin-hooks-no-agents.spec.ts:96; config not modified :17; agents without contract :139; wrapped :108; SpecdError :159.
Install "Agent Initialization Phase" (3 scenarios): no plugin-manager test (informative requirement, by design). Install: plugin-agent-claude/test/install-skills.spec.ts (specd-agent-init.sh). Shared-file uninstall: plugin-agent-\*/test/shared-folder-ownership.spec.ts. But see D3 about stale marker syntax.

### 1.5 list-plugins-use-case: OK

list-plugins.ts:61-81. Tests: list-plugin.spec.ts:6 (statuses), :60 (contributions + order), :38 (not_found), :6 + :80 (error, rest still listed), :104 (rendering of non-Error rejections).
Minor behaviour gap D5 (malformed loader results).

### 1.6 agent-plugin-type: OK

agents-handler.ts:12-20, agent-plugin.ts. Tests: agents-handler.spec.ts:5, :11, :17, :34; is-agent-plugin.spec.ts:18-45; register-plugins-contract.spec.ts:100 (no runtime activation); plugin-loader.spec.ts:346-381 (invalid id via loader -> PluginValidationError), :505 (agents without uninstall). AgentInstallOptions / capabilities / frontmatter / sharedFolder / fallback scenarios are contract scenarios for the plugin-agent-\* packages: tests at plugin-agent-claude/test/install-skills.spec.ts:181, :499 and shared-folder-ownership.spec.ts:144 (and the codex/copilot equivalents). In plugin-manager only the type shape is checked: is-agent-plugin.spec.ts:48 (vacuous, T6).

### 1.7 load-plugin-use-case: OK

load-plugin.ts delegates to `loadPluginSafely`. Tests: load-plugin.spec.ts:6, :37; loader-failures.spec.ts:49-89 (4 variants). The scenario "No lifecycle calls" has no dedicated LoadPlugin test (LoadPlugin has no code path that calls the plugin; the loader-level test plugin-loader-contract.spec.ts:124 covers it). Counted as weak, T9.

### 1.8 plugin-errors: OK, and the "Specd compatibility" rule has residual exotic escapes (section 2)

Classes, codes and fields match the spec (duplicate-contribution-error.ts, unknown-\*.ts, invalid-plugin-config-error.ts, unsupported-schema-keyword-error.ts, plugin-init-error.ts, plugin-destroy-error.ts with `errors` and `pluginNames`, plugin-validation.ts with cause-by-arity so `throw undefined` is recorded, `describeThrown` in every message).
Tests: errors.spec.ts:19 (codes/pluginName), :57 (message names plugin), :74, :80, :90, :102, :110, :115, :146, :150, :161, :177; register-plugins.spec.ts:765 (pluginNames in destroy order); :709, :726, :743; plugin-loader.spec.ts:756, :780, :801, :827; loader-failures.spec.ts:78.

### 1.9 plugin-repository-port: OK

plugin-repository.ts (type-only, `PluginRepositoryPort` + `DeclaredPlugin = ConfigDeclaredPlugin`, exported from ports/index.ts; the old `PluginRepository` name is gone from src and test). Tests: plugin-repository-port.spec.ts:8 (`ConfigWriter extends PluginRepositoryPort`), :13 (identity both directions), :19. The signature-drift scenario is by nature a negative compile test and has none (T5). "CLI implementation uses ConfigWriter": see D4.

---

## 2. "Specd compatibility" rule: exhaustive probes against dist

Probe design: every public entry point (registerPlugins, createPluginLoader.load via a real node_modules fixture, InstallPlugin, UpdatePlugin, UninstallPlugin, ListPlugins, LoadPlugin, helpers, error constructors) was driven with each hostile value: thrown/rejected string, undefined, null, number, Symbol, `{message}`, object with throwing `message` getter, frozen Error, and a Proxy with throwing `getPrototypeOf`/`get`/`ownKeys` traps. Accessors were installed with `Object.defineProperty` (first probe batch used spread and was discarded as a probe bug).

Result: 520 cases, all the ones listed in the task are OK, except those below.

### 2.1 Confirmed OK (no non-SpecdError escapes)

- `handler.activate` returning a rejected non-Error (string/undefined/null/number/Symbol/obj/getter-message/frozen) -> `PluginInitError` with the value as `cause`. Same for `throw` variants, thenable whose `then` throws, non-function `activate`, `activate` accessor that throws.
- `init` rejecting/throwing any of the above, `init` accessor throwing (also on 2nd read only) -> `PluginInitError`. `destroy` throwing any of the above, `destroy` accessor throwing, a frozen error, or a Proxy whose `getPrototypeOf`/`get` traps throw -> `PluginDestroyError`, second `dispose()` is a no-op, no unhandled rejection.
- Rollback with failing destroy for every thrown value; frozen `SpecdError` keeps identity; `rollbackErrors` non-configurable -> falls back to `Logger.warn`; `SpecdError` subclass with throwing `message` getter -> propagates.
- Manifest whose `contributes`, a block value, `configSchema`, nested `default`, nested `enum` (TOCTOU: 1st read ok, 2nd throws) are getters; `configSchema` Proxy with throwing `ownKeys`; `config` entry as Proxy / with throwing getter / throwing `toString` / Symbol / BigInt; `contributions` allowlist as Proxy / with Symbol / throwing `toString` element: all become `PluginValidationError(['load'])` or `InvalidPluginConfigError` through `registerPlugins`.
- Loader results (undefined, null, string, `{}`, no plugin, no manifest, manifest a string, plugin a function...) through `registerPlugins` -> `PluginValidationError(['load'])`.
- Real-FS loader: `create` throwing undefined/Symbol, rejecting null, returning thenable with throwing `then`, returning undefined/null/string/function; default export getter/null; entry import throwing undefined/Symbol/Proxy/syntax error/TLA rejection; plugin `name`/`version`/`contribution`/`install` accessors throwing on 1st or 2nd read; plugin Proxy with throwing get/has/ownKeys; manifest array/null/string/number/empty/BOM/binary/10000-deep JSON/missing/is-a-directory; configSchema 40, 5000 deep via properties and via items (typed, no stack overflow); `defaultConfig` mismatches; module-level `__proto__`/`constructor` keys; `blockSchema` throwing undefined or missing; `validatePlugin` throwing undefined/Symbol/Proxy; handler `activate`/`validatePlugin` accessors throwing; names `''`, `../x`, absolute path, NUL, file URL, `fs`, number, undefined, not installed; projectRoot undefined/null/5/{}. All typed.

### 2.2 ESCAPES found (non-SpecdError from the public API). All minor, all need hostile or contract-violating input.

E1 (minor). A thrown/rejected value whose `getPrototypeOf` trap throws (hostile Proxy) escapes raw because `error instanceof SpecdError` runs inside a catch block without protection:

- load-plugin-safely.ts:27 (so `registerPlugins`, `InstallPlugin`, `UpdatePlugin`, `UninstallPlugin`, `LoadPlugin` when the loader rejects/throws such a value: 5 entry points x 2 probes)
- install-plugin.ts:78, update-plugin.ts:75, uninstall-plugin.ts:63 (hook throws such a value)
- list-plugins.ts:76 (`error instanceof PluginNotFoundError` in the catch of `ListPlugins`; the only way `ListPlugins` can throw at all)
- plugin-loader.ts:97 and :107 (`create` / export resolution), :341 (blockSchema.safeParse throws such a Proxy)
- (plugin-loader.ts:113, :201, :218 are rescued by the outer wrapper and come out as `PluginValidationError(['plugin'])`, so the behaviour is inconsistent between catch sites.)
  Spec: plugin-errors "Specd compatibility ... holds for hostile inputs too". Probes: probe1.mjs ("... proxy" rows), probe4.mjs.
  E1b (minor, same root cause). In `registerPlugins`, a Proxy of this kind thrown by `init`/`activate` is wrapped, but `toSpecdError` (register-plugins.ts:209) throws the trap error first; the outer catch (:171-173) then wraps _that_ error, so `PluginInitError.cause` is the trap's Error and the original thrown value is lost. Spec says "original preserved as cause". Probe: probe1b.mjs prints `cause === px` false.
  E2 (minor). Agents manifest + plugin whose `install` or `uninstall` is an accessor that throws: `isAgentPlugin(plugin)` runs outside any try at install-plugin.ts:66, update-plugin.ts:63, uninstall-plugin.ts:52 (agent-plugin.ts:73-74 reads the accessors). 6 probes (3 use cases x install/uninstall accessor). Non-agents manifests are wrapped correctly. Also outside try: `manifest.defaultConfig` read at install-plugin.ts:85 and `input.options`/`input.contributions` reads.
  E3 (minor). Caller-supplied `PluginLoader` returning `{plugin: {}, manifest: {...}}` where `manifest.contributes` is missing/null, or a block value is null: `InstallPlugin`/`UpdatePlugin`/`UninstallPlugin` throw a raw `TypeError` (`Object.values(undefined)` at resolve-contributions.ts:12, `Object.keys(null)` :13, `manifest.contributes['agents']` :55). 9 probes. `loadPluginSafely` (load-plugin-safely.ts:32-39) only checks that `plugin` and `manifest` are non-null objects. `registerPlugins` wraps the same inputs (the try at register-plugins.ts:80-98); the three install-family use cases do not. The spec scenario "Malformed loader result" lists only `undefined` / "object without manifest", so this is a gap in the spirit of "a loader that resolves to something that is not {plugin, manifest}", not in its letter.
  E4 (minor). `createPluginLoader(...).load()` with a string `projectRoot` that is not absolute (`''`, `'proj'`, `'./proj'`, `'a/b'`): `createRequire('package.json')` throws a raw `TypeError [ERR_INVALID_ARG_VALUE]` (plugin-loader.ts:274, called from the `for` header at :252, outside the try at :253-262). Through `registerPlugins`/`InstallPlugin` etc. it is rewrapped as `PluginValidationError(['load'])` by `loadPluginSafely` (correct class, but message blames the manifest, probe5.mjs); `ListPlugins` reports it as an `error` entry. The `projectRoot` check at :77 only tests `typeof === 'string'`.
  E5 (minor). Malformed `blockSchema.safeParse` results from a host handler are not guarded (plugin-loader.ts:338-361): returning `undefined`, `{success:false}` without `error`, `error.issues` not an array, issue `path` missing/not iterable/containing a Symbol, a result whose `success` getter throws, or `data` as a Proxy with a throwing `ownKeys` (the `Object.keys(value)` at :356). 7 probes: raw `TypeError`/`Error`. A thrown (not returned) failure is wrapped correctly (:339-343).
  E6 (minor). `validatePlugin` that returns a rejected promise (async handler, contract says `void`): the promise is ignored (plugin-loader.ts:216) and Node raises `unhandledRejection`, which terminates the process by default. Probe4 confirmed with an `unhandledRejection` listener ("UNHANDLED ["async"]"). No SpecdError at all, and the failure is silently treated as validation success.

### 2.3 Info only (type-contract violations, host wiring); raw `TypeError`/`Error`, listed for completeness, not counted as findings

- `registerPlugins`: `options === null`; `handlers` not an array; handler with throwing `kind` getter (mergeHandlers merge-handlers.ts:17-19, and later reads at register-plugins.ts:150); `config.plugins` getter throwing, not iterable, or containing `null`; entry `name` as Symbol or throwing `toString` (message interpolation in `PluginValidationError` at register-plugins.ts:67-68; single-entry case OK, only the duplicate-name path escapes); `builder` without `registerDisposer` is wrapped OK.
- `InstallPlugin` with a Symbol `pluginName` or a Symbol contribution id (UnknownContributionError message interpolation); `ListPlugins.execute(undefined)` / `pluginNames` not iterable.
- Public pure helpers called with garbage: `isSpecdPlugin`, `baseContractFields`, `isAgentPlugin` on a Proxy or a throwing accessor or `null`; `resolvePluginConfig`, `assertSupportedConfigSchema`, `configSchemaToZod` with a schema/config that is a getter-bearing object or Proxy (note: spec requires "typed error, never TypeError" for malformed _shape_, which holds; accessor-throwing input is outside it); `configSchemaToZod(null)` and `enum: "fast"` (documented as taking an already validated schema); `buildContributionAddress`/`parseContributionAddress` with Symbol/throwing `toString`; `mergeHandlers(null)`; error constructors with Symbol name / Symbol in `issues` / `toString`-throwing names (`PluginInitError`, `InvalidPluginConfigError`, `PluginDestroyError`, `PluginValidationError(fields = Proxy)`); `createPluginLoader(undefined)`; a `config` Proxy.
- `PluginValidationError` with a Proxy/Symbol cause: OK (describeThrown guards).

---

## 3. Other discrepancies (spec vs code, "neither is the source of truth")

D1 (minor). Manifest key `__proto__` is silently swallowed. `{"contributes":{"__proto__":{"a":{}}}}` loads successfully with `contributes = {}` and no declared ids (probe5.mjs prints `ACCEPTED {} []`). Spec: a kind without a registered handler MUST fail with `UnknownContributionKindError`. Cause: `z.record(z.record(z.unknown()))` at plugin-loader.ts:42 assigns the key as a prototype, so `Object.entries` at :334 never sees it. `{"agents":{"__proto__":{}}}` is rejected correctly. Code side fix would be to reject `__proto__` explicitly; spec side says nothing about it.
D2 (minor/info). `PluginDestroyError` only helps `registration.dispose()`. Via a kernel, `core:kernel` (specs/core/kernel/spec.md "Kernel disposal", failure isolation) rejects with an `AggregateError` of `DisposerFailedError` whose `cause` is the `PluginDestroyError`. The plugin-manager statement "a SpecdError, never a plain AggregateError" is true of what plugin-manager emits, but a host that disposes the kernel sees core's `AggregateError`. Cross-spec boundary, no change needed in plugin-manager; worth one sentence in plugin-errors.
D3 (minor, stale spec text). install-plugin-use-case "Agent Initialization Phase" scenarios 2 and 3 describe separate `<!-- <specd-plugin:opencode> -->` markers and a base block `<!-- <specd> -->`. The implementation (skills/src/application/specd-block-manager.ts:31, :101) tracks the agents in the opening tag `<!-- <specd agents="a,b"> -->` and only keeps `specd-plugin:*` as a legacy form that is migrated (plugin-agent-codex/test/shared-folder-ownership.spec.ts:347-357). Spec and code disagree; the code is newer.
D4 (minor). plugin-repository-port "Implementation note" says the CLI calls `ConfigWriter.addPlugin()`, `removePlugin()` and `listPlugins()`. In `packages/cli/src` only `addPlugin` (commands/plugins/install.ts:85) and `removePlugin` (commands/plugins/uninstall.ts:62) are called; listing reads the in-memory snapshot (commands/plugins/get-declared-plugins.ts:21). Scenario "CLI implementation uses ConfigWriter" is therefore only partly true for `listPlugins`.
D5 (minor). `ListPlugins` bypasses `loadPluginSafely` (list-plugins.ts:65). A loader result lacking `plugin` (`{manifest}`) or with a non-object plugin (a function) is reported as `status: 'loaded'` with `plugin` undefined/garbage; `{}` or `undefined` become `status: 'error'` with a raw message such as "Cannot read properties of undefined (reading 'contributes')" instead of the `load` validation message the other use cases give. Spec only defines loaded/not_found/error, so this is an inconsistency, not a violation.
D6 (info). `dispose()` concurrency: a second concurrent call returns immediately (register-plugins.ts:111 `if (disposed) return`) while the first is still destroying, and never sees the `PluginDestroyError`. Spec ("idempotent", "reported once") is satisfied literally. Core's kernel handles concurrent callers itself (returns the same promise), so only direct users of `registration.dispose()` are affected.
D7 (info). `loader.resolve(..., {conditions})` at plugin-loader.ts:254-256 is cast through `unknown`; `require.resolve` ignores `conditions`. Harmless today (the spec only asks for `createRequire`), but the option is dead code.

No contradictions found against `core:config`, `core:kernel-builder` (`registerDisposer(name, fn)` at core kernel-builder.ts:437 matches the call at register-plugins.ts:182; a name conflict raises `RegistryConflictError`, a SpecdError, and is rolled back correctly), `default:_global/architecture` (application layer imports only domain and ports; domain imports only core).

---

## 4. Test gaps and weak tests

None of the 11 specs has a scenario without any test inside the repo, except:

- no test: plugin-repository-port "Signature drift fails compilation" (T5, inherently a negative type test);
- no test inside plugin-manager (covered elsewhere): "Agent Initialization Phase" x3 (T9), "Plugins disabled" (sdk tests), agent-plugin-type install/capabilities/fallback scenarios (plugin-agent-\* tests).

Weak or vacuous:

- T1 (minor). "Unknown kind rejected" plugin-loader.spec.ts:197-263 and "Invalid block for kind": only `toBeInstanceOf`; the spec requires naming the plugin and the kind (the message content is only covered in errors.spec.ts:57).
- T2 (minor). "Non-string project root is rejected": plugin-loader.spec.ts:870-876 asserts the class but not `fields: ['projectRoot']` (the scenario text requires it). Also no test for the relative-root case (E4).
- T3 (minor). "Options forwarded only when provided": install-plugin.spec.ts:35-60, update-plugin.spec.ts:17, uninstall-plugin.spec.ts:26 use `toHaveBeenCalledWith({config, contributions})`, which treats a missing property and `options: undefined` as equal; the "absent in the second call" half is not really proven.
- T4 (minor). Plugin name: `@ac.me/plugin` (dot in the scope) and `@specd/plugin-agent-claude` as accepted value are not exercised (specd-plugin.spec.ts:46-52, is-specd-plugin.spec.ts).
- T5 (minor, inherent). Conformance is a type-level assertion (plugin-repository-port.spec.ts:8) that only fails under `tsc --noEmit`, not under `vitest run`; the package `typecheck` script does include `test`, so it is enforced in CI only if typecheck runs.
- T6 (minor). is-agent-plugin.spec.ts:48-69 is vacuous: the `install` stub (legacy `(config, options)` signature) is never called, so its `expect(options).toEqual(...)` never runs; the `AgentInstallOptions` type shape is only checked by the compiler.
- T7 (minor). "Factory receives config only ... config is the fully-resolved SpecdConfig": plugin-loader-contract.spec.ts:79-93 checks `Object.keys(options)` equals `['config']` but not that the value is the loader's `config`.
- T8 (minor). Depth limit: plugin-config-schema.spec.ts:229-256 checks 32 levels accepted and 200000 rejected; the boundary 33 is not asserted, so an off-by-one in `depth > MAX_SCHEMA_DEPTH` (plugin-config-schema.ts:93) would pass.
- T9 (minor). load-plugin-use-case "No lifecycle calls": no test on `LoadPlugin` itself (load-plugin.spec.ts:6, :37 only check output and NotFound); covered indirectly by plugin-loader-contract.spec.ts:124 and by the code path (no calls).
- T10 (minor). The hardening added since attempt 6 has no tests for E1-E6 (they are bugs, not tested behaviours), and `ListPlugins` + Proxy rejection is untested.

Scenarios covered strongly (spot checks of assertions): partial init failure order and no disposer (register-plugins.spec.ts:553), frozen error + warn (:653), `PluginDestroyError.pluginNames` alignment (:765), mixed-kind agents-only filtering in all three use cases (plugin-hooks-no-agents.spec.ts), `throw undefined` cause recorded in registerPlugins, 4 use cases and the loader (:726, :743, loader-failures.spec.ts:78).

---

## 5. Severity summary

| ID         | Severity | Where                                                                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| E1, E1b    | minor    | load-plugin-safely.ts:27; install/update/uninstall :78/:75/:63; list-plugins.ts:76; plugin-loader.ts:97/:107/:341; register-plugins.ts:209 |
| E2         | minor    | install-plugin.ts:66, update-plugin.ts:63, uninstall-plugin.ts:52                                                                          |
| E3         | minor    | resolve-contributions.ts:12-13/:55 via load-plugin-safely.ts:32-39                                                                         |
| E4         | minor    | plugin-loader.ts:252/:274                                                                                                                  |
| E5         | minor    | plugin-loader.ts:338-361                                                                                                                   |
| E6         | minor    | plugin-loader.ts:216                                                                                                                       |
| D1         | minor    | plugin-loader.ts:42/:334                                                                                                                   |
| D2, D6, D7 | info     | cross-spec / concurrency / dead option                                                                                                     |
| D3, D4     | minor    | install-plugin-use-case verify; plugin-repository-port spec note                                                                           |
| D5         | minor    | list-plugins.ts:65                                                                                                                         |
| T1-T10     | minor    | see section 4                                                                                                                              |

Totals: critical 0, major 0, minor 14 findings with code/spec impact (E1 [incl. E1b], E2, E3, E4, E5, E6, D1, D3, D4, D5, T1, T2, T3, T7), plus 6 further minor test-quality notes (T4-T6, T8-T10) and 3 info items (D2, D6, D7). The previous attempt's E1-E8 and `PluginDestroyError` naming issues are confirmed fixed.

### \_partial-cli.md

# Compliance audit (attempt 7) - batch cli, change plugin-architecture

Specs: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: merged spec read via `changes spec-preview`, implementation read in full (packages/cli/src/commands/plugins/\*, commands/project/{init,update}.ts, helpers/{cli-context,cli-host,cli-cleanup,cli-signals}.ts, run.ts, graph-index-task.ts), all CLI tests read, built CLI (packages/cli/dist, newer than src) run in scratch git repos (scr7, scr7b under the scratchpad), including a real PTY run of the wizard.

TOTAL: 0 critical, 0 major, 12 minor (4 behaviour/spec-wording, 8 weak or missing tests). All requirements implemented.
Attempt-6 minors: verified fixed or hardened - exit code values (`rejects.toMatchObject({code:1})` + `process.exit` assertions), no-call assertions (kernel spies, writer.listPlugins, addPlugin, InstallPlugin), unknown-kind (real plugin-manager + temp package, exact message, plugins-install-real-loader.spec.ts:75-98), built-in-only handler (:100-119, `createPluginLoader` gets `{config}` only), list header (plugins.spec.ts:606), init alias (project-init.spec.ts:605-637 side by side incl. wizard + cancel).

Live CLI confirmation (scratch repo, `init` from a subdir): config written at git root with `configVersion: 2`, `.gitignore` gets `/.specd/metadata/`; second init without --force: `error: Project already initialised ...` rc=1; `--plugin my-plugin` -> rc=1 and nothing written; `--format json --plugin @specd/plugin-agent-claude` -> JSON with result/configPath/schema/workspaces/metadataCachePath/plugins, `plugins: - name: "@specd/plugin-agent-claude"` recorded; install of already-declared -> stderr `warning: ... already installed; use 'specd plugins update'`, status skipped, rc 0; unscoped -> error entry rc 1; `--contributions ""` and `" , "` -> `error: --contributions requires at least one contribution id` rc 1; several plugins + --contributions -> rc 1; missing package + good package -> error row, good one installed + recorded, rc 1; duplicate name -> installed then skipped; list with not_found entry shows `-`, `selected: [lint]`, detail, JSON `declared: []`; update/project update with missing package -> `plugins: error name (detail)`, other plugins still updated, rc 1, specd.yaml untouched; no specd.yaml -> `error: Config validation failed ... no specd.yaml found` rc 1 for update/list/install; wizard (PTY) Ctrl-C -> "Cancelled.", exit 0, nothing written; wizard decline overwrite -> exit 0, file untouched; show nonexistent -> `error: Plugin ... was not found` rc 1.

---

## cli:plugins-install - requirements all OK

- Command signature, Declaration source, Display name (`Installed plugins:` install.ts:177), Already-installed (install.ts:68-77, warning on stderr + `skipped` row), Installation workflow (install.ts:80-96; `config` only when defaultConfig, `contributions` only when flag), Host bootstrap `plugins:false` (install.ts:146-149), Exit code (install.ts:159), Output shape `{plugins,hasErrors}` (install.ts:183): OK.
- Empty `--contributions` rejected before context (install.ts:140-142 precedes :146).

Scenario -> test

- Valid plugin names -> plugins.spec.ts:142-163. Multiple names -> plugins.spec.ts:233-265 (two valid names processed).
- Unscoped rejected / no install -> plugins.spec.ts:165-172, :233-265 (InstallPlugin 2 calls, addPlugin 1).
- Contributions restriction -> plugins.spec.ts:191-215. Several plugins + contributions -> :165-189 (message asserted; spec says "usage error", impl uses cliError exit 1, consistent with cli:entrypoint).
- Empty contributions -> plugins.spec.ts:267-310 (resolveCliContext, InstallPlugin, addPlugin all not called). STRONG.
- Kind without handler -> plugins-install-real-loader.spec.ts:75-98 STRONG (real loader, exact detail, addPlugin not called, rc 1).
- Declaration source (2 scenarios) -> plugins.spec.ts:217-231, :312-330, :357-365 (kernel spies, writer.listPlugins, ListPlugins not called).
- Already installed -> :217-231. Duplicate name -> :332-355.
- Header -> :367-373 (asserts `toContain`, not "exactly"/first line; list test :606 does assert line 0).
- Calls InstallPlugin + addPlugin, no kernel.addPlugin -> :142-163. Default config -> :191-215 (config + contributions). No empty config -> :161.
- Init not called -> :312-320 (weak, see m7). Remaining after failure -> :233-265.
- Broken configured plugin -> :162 (only `plugins:false` passed to mocked resolveCliContext; weak, m7).
- Exit code -> :401-411. JSON shape -> :375-399 (+ hasErrors true at :258-264; hasErrors:false never asserted for install).

## cli:plugins-uninstall - requirements OK

- uninstall.ts:51-62: declared check, allowlist only when present, hook before removePlugin, no kernel calls; plugins:false (:37-40); exit 1 (:79-81); `{plugins}` JSON (:101).
  Scenario -> test
- Multiple -> plugins.spec.ts:698-720. Failure continues -> :537-567 (also hook-before-remove order via invocationCallOrder, STRONG).
- Hook + remove, no kernel call -> :483-500 (does not assert hook-before-remove here, but :564-566 does). No-hook plugin -> :677-696. Allowlist -> :528-535, :722-731. Undeclared -> :569-580. Hook failure retains declaration -> :537-567. Broken plugin -> :528-535 (mock only, m7). JSON -> :502-526.
- m2 (behaviour): duplicate name in one invocation reports `uninstalled` twice (live: `uninstall @specd/plugin-agent-codex @specd/plugin-agent-codex`), hook called twice; config snapshot is never updated in the loop (uninstall.ts:49-62) whereas install tracks `declaredSet`. Spec silent; second occurrence is no longer declared after the first removal so spec literal reading ("not declared -> error") would give an error. No test.
- m3 (behaviour/spec gap): declared plugin whose package is missing (`@acme/missing`) cannot be uninstalled: UninstallPlugin throws PluginNotFoundError (plugin-manager:uninstall-plugin-use-case), CLI reports error and keeps the declaration, so the stale entry can only be removed by hand-editing specd.yaml. Spec says plugins:false exists "so that a broken configured plugin can still be uninstalled" but only the init-throws case is meant; no scenario for not_found. Both sides: spec Constraint "MUST remove the declaration on success" (no failure rule for not_found) vs impl retains it. Verified live.

## cli:plugins-update - requirements OK

- update.ts:44-90: names from config.plugins, per-entry allowlist only when present, undeclared -> error, no writer, no init, `updated|error`; `no plugins to update` (:138); plugins:false (:110-113).
  Scenario -> test (plugins-update.spec.ts)
- All -> :97-105, :181-190. Specific -> :107-124. Update-all uses config.plugins / no ConfigWriter.listPlugins -> :181-190. Failure -> :164-179 and :213-227 (exact text lines, STRONG). Idempotent -> :200-211 (addPlugin/removePlugin never called). Recorded selection -> :153-162, :192-198 ("extra not activated" is plugin-manager behaviour; test only checks allowlist forwarding). Undeclared -> :126-151 (STRONG: UpdatePlugin execute not called, rc 1). Broken plugin -> :161 (mock). JSON -> :164-179, :200-211 (status values `updated|error` asserted). Text -> :213-227. Nothing declared -> :229-236.
- Findings: none beyond m7.

## cli:plugins-list - requirements OK

- list.ts:46-58, 88-99, 107-128. All statuses, `-` fallback, `no plugins declared`, `{plugins:[]}`.
- m1 (spec vs impl): spec text format says "one line per plugin (name, status, version or `-`)"; impl prints `name  version  status  selected: [...]` (list.ts:121-123), tests lock that order (plugins.spec.ts:607-608, :769-770). Spec's own scenario text only requires the columns, so it is wording, but the two sides disagree on order.
  Scenario -> test
- List all -> :415-426. Declarations from snapshot -> :735-743. Any kind -> :745-771. Broken plugin -> :735-743 (plugins:false only, m7). Installed -> :425. Not found -> :773-799 (declared [], selected allowlist). Error -> :773-799. Text details -> :582-614 (STRONG: header line 0, detail suffix regex). Version fallback -> :607-608 (only for non-loaded rows; a loaded plugin without version never asserted, m8). Nothing declared -> :439-447, :616-622. Allowlist shown -> :428-437, :582-614. JSON -> :415-426.

## cli:plugins-show - requirements OK

- show.ts:34-77: contributions kind/id/address, configSchema/defaultConfig, capabilities only when install/uninstall hook or agents (:93-98), omitted otherwise; plugins:false; load errors -> exit 1.
  Scenario -> test
- Show details -> :449-470. Addresses -> :472-481, :802-819. Not found -> :821-836 (error: + exit 1; LoadPlugin mocked, real message confirmed live). JSON -> :449-470. Schema/defaultConfig displayed -> :639-673 JSON only; text lines (show.ts:66-71) untested (m8). Capabilities with hooks/agents -> :449-481. Omitted for checks-only -> :803-819 (text) and :639-673 (JSON). Init never called -> :672 (weak: LoadPlugin mocked, `init` is a bare vi.fn; only proves the CLI itself does not call plugin.init, m7).

## cli:project-init - requirements OK

- init.ts: alias registered in program.ts:212 and :220; provision by option source (init.ts:76-82); validation before write (:72-75); delegation to writer only; post-init install with `{configPath, plugins:false}` (:148-151); exit 1 on install failure after output (:124-126); known plugin list (:14-20); cancel/decline -> CliExitError(0) (:191-194 etc.), help text (:56); overwrite prompt names path and plugins/workspaces (:189).
  Discrepancies
- m4 (spec wording): scenario "tmp gitignore created idempotently" says config path `.specd` -> `.specd/tmp/.gitignore`. Actual (live and core test core/test/infrastructure/fs/config-writer.spec.ts:408-414) is `.specd/config/tmp/.gitignore`; default configPath is `.specd/config` (core:config). Spec side is wrong, not the code. Same scenario group (dirs, root .gitignore entry, tmp gitignore, metadata dir) has no CLI test; they are covered by core tests with the real writer (config-writer.spec.ts:84-120, :408-414, :482-504) and by my live run.
  Scenario -> test (project-init.spec.ts)
- --plugin -> :105-134. Alias identical -> :605-637, :442-467 (STRONG, side by side incl. wizard/cancel/json/invalid plugin). Alias JSON -> :469-492. Plugin wizard -> :269-287. No plugin -> :333-359. Overwrite confirmation -> :361-381 (path, "Overwrit", declared plugins, workspaces), ordering :393-422. Cancel -> :315-331 (exit 0, nothing written, no install). Decline -> :289-313, :361-381. Help -> :383-391. Banner only in wizard -> :269-287, :424-440, :253-267 (m9: assertion is the version line `sdk   v`, not the ASCII art). Explicit default flag -> :253-267. Known options -> :333-359 (exact list + `required:false`). Defaults/minimal config -> :136-158 mocked; live OK. No banner -> :424-440. JSON plugins -> :186-215. Metadata line -> :494-510 (does not assert it comes after the "initialized" line). metadataCachePath in JSON -> :469-492 (m5: mock returns `.specd/metadata`, identical to the default, so hard-coding would pass). Git root / cwd -> :136-158. Delegation (dirs, gitignore, tmp, metadata) -> core tests only (m4). Uses createConfigWriter not InitProject -> :105-134 + `expectNoKernelPluginCalls`. Plugins installed after init -> :105-134 (mocked install; configVersion 2 + recorded plugin only via core test :52 and live run). Post-init host plugins:false -> :129-131. Install failure after init -> :231-251 (m6: asserts rc 1 and initProject called, not the per-plugin failure output). Invalid plugin before init -> :217-229 (STRONG). Already initialised -> :512-547 (real writer, STRONG). --force overwrite -> :549-566 (only force:true forwarded; new schema content is a core concern).

## cli:project-update - requirements OK

- update.ts:35-64. Shares updatePluginsWithKernel; empty -> `project is up to date` / `{plugins:[],hasErrors:false}`; text prefix `plugins:`; error line `plugins: error <name> (<detail>)`; exit 1.
  Scenario -> test
- --format -> :72-86. Declared plugins via UpdatePlugin -> project-update-allowlist.spec.ts:43-72 (STRONG: plugin-manager mock exposes only UpdatePlugin, config file byte-identical). Allowlist -> same. Host plugins:false + untouched -> same + project-update.spec.ts:54. Text prefix -> :42-55. Up to date -> :57-70. JSON -> :72-86, :122-137 (hasErrors:false never asserted on the success path). Missing specd.yaml -> :139-152 (m11: ConfigValidationError mocked; real discovery confirmed live only). Partial failure -> :88-120 (mixed lines exact), second plugin still updated -> covered via plugins-update.spec.ts:164-179 (shared function, but project-update.spec.ts mocks it entirely).

## cli:host-context - requirements OK

- cli-context.ts:85-105 (configPath, options.kernel, plugins only when given, warnings once from config.warnings); cli-host.ts (both bootstrap forms, dispose registered after successful open only, input forwarded unchanged); cli-cleanup.ts (reverse order, memoised promise, AggregateError flattened, late registration runs immediately); run.ts/cli-signals.ts trigger cleanup on all exits; graph-index-task.ts:60-83 (plugins:false in both forms, dispose in finally). grep of src: no `openSpecdHost`/`createSdkContext` outside cli-host.ts and graph-index-task.ts; no `resolveSdkHostContext`; `withProvider` uses `openCliHost` (commands/graph/with-provider.ts).
  Scenario -> test
- SDK via helper / context shape -> cli-context.spec.ts:98-125. Verbosity -> :19-44 (argv restored after assertions, not in finally, m10). Plugins default -> :46-65. plugins false -> :83-96. Warnings from config / once -> :98-147, :149-176. onLog -> :46-81. Entry point scan -> :221-252. Helper registers/both forms/unchanged/failed open -> cli-host.spec.ts:20-66. No hand-built host -> :221-252 (m10: scan is one literal regex; `resolveSdkHostContext` only checked via missing file helpers/sdk-host.ts). CliContext carries dispose -> :98-125; dispose twice once -> :201-218 (tautological: mock implements memoisation). Commands need not dispose -> :190-199, run-host-release.spec.ts:23-36. Registry (order, idempotent, late, failing, aggregate, warning text) -> cli-cleanup.spec.ts:14-97. Cleanup on error exit / signals -> run.spec.ts:51-95, helpers/cli-signals.spec.ts:31-93, cli-signals-process.spec.ts:70-100. Worker (success, failure, plugins:false both forms) -> graph-index-task.spec.ts:26-114. Package deps -> package-deps.spec.ts:8-22 (m12: manifest also lists @specd/guide, whitelisted by the test; the spec's "sole" dependency is defined against core/code-graph/sdk so no violation, noted only).

---

## Minor list (all severity minor)

- m1 plugins-list text column order name/version/status vs spec name/status/version (list.ts:121-123 vs spec Output format). Align spec or code.
- m2 uninstall of a duplicated name reports `uninstalled` twice and runs the hook twice (uninstall.ts:49-62). No test.
- m3 uninstall cannot remove a declaration whose package is not found (PluginNotFoundError, declaration retained); spec silent.
- m4 project-init tmp gitignore scenario path `.specd/tmp/.gitignore` is wrong (real: `.specd/config/tmp/.gitignore`); Delegation scenarios have no CLI-level test (core covers).
- m5 weak: metadataCachePath "not re-derived" (mock equals default) project-init.spec.ts:17-22, 491, 509.
- m6 weak: install-failure-after-init does not assert failure reported in output (project-init.spec.ts:231-251).
- m7 weak: every "broken configured plugin" and "init not called" scenario (install, uninstall, update, list, show, project update) is proven only by `resolveCliContext` receiving `plugins:false` against mocked plugin-manager (plugins.spec.ts:162, 469, 534, 740, 672; plugins-update.spec.ts:161; project-update-allowlist.spec.ts:62). No test with a real plugin whose `init` would throw.
- m8 weak/missing: show text rendering of configSchema/defaultConfig (show.ts:66-71); list `-` for a loaded plugin with no version; install `hasErrors:false` on success.
- m9 weak: wizard banner assertion checks only `sdk   v` version line (project-init.spec.ts:282).
- m10 weak: host-context source-scan regex is one literal pattern; dispose-once test is tautological; verbosity test restores argv outside finally (cli-context.spec.ts:31-43, 201-218, 245-251).
- m11 weak: project update missing-config test mocks the error (project-update.spec.ts:139-152); empty JSON output `{plugins:[],hasErrors:false}` (update.ts:45) and success-path hasErrors:false untested.
- m12 info: @specd/guide runtime dependency of cli (package.json) whitelisted in package-deps.spec.ts:20; consistent with spec wording but not named in it.

No contradictions with dependency/global specs found: exit codes and error prefixes follow cli:entrypoint (CliExitError, `error:`), `specd init` alias matches cli:entrypoint line "identical behaviour", plugin name rule via `isPluginName` from the plugin-manager spec.

### \_partial-sdk-agents.md

# Partial audit: batch sdk-agents (attempt 7)

Change: `plugin-architecture`. Read-only audit (no repo file modified; mutation experiments ran on copies under the session scratchpad). Specs: sdk:composition, sdk:host-context, plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.

Verification run: `vitest run` + `tsc --noEmit` PASS in sdk (121 tests), skills (126), claude (53), copilot (52), codex (89), opencode (56), standard (54). Real `create().install()` of all five plugins run into temp projects (real skills repository and `ResolveBundle`, no mocks), outputs inspected, then uninstalled (tree empty afterwards for all five). Codex TOML output parsed with Python `tomllib`: keys `name, description, developer_instructions`, and the decoded instructions equal the rendered agent prompt. Mutation testing: about 110 mutants over the plugins, 22 over skills, 18 over sdk host-context (harness baselines verified green).

## Totals

- Critical: 0
- Major: 1 (C1, latent: filtered uninstall deletes unmanaged / arbitrary paths, all five plugins; not reachable from today's CLI)
- Minor code/spec discrepancies: 6 (C2-C7)
- Test gaps: 14 (T1-T14), all found by mutation survival or reading; none is a spec-requirement violation
- All requirements implemented, all verify scenarios map to at least one test (gaps are strength gaps, listed below)

## Attempt-6 items: verified

| Attempt-6 item                                                                                        | Result                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| C1 frozen build error masks build error (sdk)                                                         | FIXED. `host-context.ts:222-242` `attachRollbackErrors` wraps `defineProperty` in try/catch and falls to `Logger.warn`; build error always rethrown unchanged. Tests `host-context.spec.ts:394-418` (frozen, non-extensible: identity, not `TypeError`, no own `rollbackErrors`, warn called) and `:116-137` (string, null, number). Mutation D18/D10 killed. |
| C2 logger not configured                                                                              | Documented limitation, now in spec wording ("when no logger implementation has been configured yet they are not emitted") and in JSDoc `:211-216`. Not a defect.                                                                                                                                                                                              |
| C3 opencode comma splitting                                                                           | FIXED. `opencode install-skills.ts` `toOpenCodePermission` uses `splitTopLevelCommas` (skills `split-top-level-commas.ts`). Mutation O1 killed (opencode `test/domain/frontmatter-contract.spec.ts:68,77`); skills K20-K22 killed (`split-top-level-commas.spec.ts`).                                                                                         |
| C4 empty arrays                                                                                       | Spec now states "An empty `skills` or `agents` array counts as not provided" in all five. Code uses `length > 0` everywhere. Tests `shared-folder-ownership.spec.ts:264` (install) and `:281` (`it.each` skills / agents / both) in claude, codex, copilot, opencode; standard `:258,:275`. Mutants M7-M10 killed in all five.                                |
| C5 copilot "applies to skills" wording                                                                | FIXED in spec ("This field set applies to skills. Agent entries MAY additionally carry `allowed_tools`..."). Residual: key name (see C4 below).                                                                                                                                                                                                               |
| C6 marker dedupe/sort                                                                                 | FIXED in spec and code (`shared-folder-owners.ts:36-47,63-65,182-184`). Tests `shared-folder-owners.spec.ts:66-101`. One residual gap T11.                                                                                                                                                                                                                    |
| C7 codex control chars                                                                                | FIXED. `escapeTomlBasicMultiline` + `escapeControlCharacter` (`install-skills.ts:215-275`). Tests `toml-escaping.spec.ts:69` (all 33 control codes), `:87`; mutants X1-X3, X5-X7 killed. Real TOML parses (see above). Residual T9 (`.trim()`).                                                                                                               |
| C8 create() validation                                                                                | FIXED in all five (`src/index.ts:14-58`): own dir first, parent fallback, `PluginValidationError` naming `specd-plugin.json: name                                                                                                                                                                                                                             | version`. Tests `create.spec.ts:45,62,74,86,97,109` in all five. Mutants M19-M21 killed. |
| C9 standard hard-codes capabilities                                                                   | Unchanged and now spec-consistent (standard spec: `['frontmatter']`, agents unconditional). Test `standard shared-folder-ownership.spec.ts:360`. The other four honour `options.capabilities`; spec text says so explicitly. Closed.                                                                                                                          |
| T1 filtered skills uninstall keeps block                                                              | FIXED: `shared-folder-ownership.spec.ts:312` in all five (asserts block, marker bytes, shared.md, agents). M23 killed.                                                                                                                                                                                                                                        |
| T2 create() tests                                                                                     | FIXED: `create.spec.ts` (name/version from manifest, no `type`, precedence, fallback, unreadable, missing, invalid).                                                                                                                                                                                                                                          |
| T4 owner for fallback agents (surviving mutation)                                                     | FIXED: `shared-folder-ownership.spec.ts:144` (agent-only install, capabilities without `agents`, owner registered, later full uninstall cleans up, no `SKILL.md`). Mutant M1 killed in all five.                                                                                                                                                              |
| T5/T6 last-owner / other-owner assertions                                                             | FIXED: `shared-folder-ownership.spec.ts:177,197,220,239` assert agent files, `shared.md`, marker and folder in all five.                                                                                                                                                                                                                                      |
| T7 legacy marker purge on uninstall                                                                   | FIXED: `shared-folder-ownership.spec.ts:339` all five.                                                                                                                                                                                                                                                                                                        |
| T8 real pipeline                                                                                      | FIXED: `real-pipeline.spec.ts:50,78,89` all five (real repo and `ResolveBundle`: frontmatter regex, fast-track description, `disable_model_invocation` / `disable-model-invocation`, capability branches, agent runtime format, uninstall leaves zero files).                                                                                                 |
| T10 default fast-track                                                                                | FIXED via `real-pipeline.spec.ts:50` (default install, no filter).                                                                                                                                                                                                                                                                                            |
| T12 real `PluginDestroyError`                                                                         | FIXED: `host-context-rollback.spec.ts:61,84` (real class and real plugin-manager).                                                                                                                                                                                                                                                                            |
| T13 EACCES                                                                                            | FIXED: `skills/test/application/shared-folder-owners-eacces.spec.ts:20` (mocked `rmdir`, rethrows same error). Mutant K10-K12 killed.                                                                                                                                                                                                                         |
| T14 each disposer once                                                                                | FIXED: `host-context-e2e.spec.ts:162`.                                                                                                                                                                                                                                                                                                                        |
| T3 async factory awaited, T9 no direct `getBundle`, T15 foreign-kernel regex, T16 tsc-only type tests | Unchanged (see T12-T14 below).                                                                                                                                                                                                                                                                                                                                |

## sdk:composition

| Requirement                                                        | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identity / dependencies                                    | OK     | `packages/sdk/package.json` deps exactly core, code-graph, plugin-manager. Tests `package-boundary.spec.ts`, `composition.spec.ts`.                                                                                                                                                                                                                                                                                                                                                                       |
| Layer structure                                                    | OK     | `package-boundary.spec.ts` (no `infrastructure/`, narrow `domain/`), `barrel.spec.ts` (exports map `.`, `./ports`, `./extensions`; no `./shared`).                                                                                                                                                                                                                                                                                                                                                        |
| Public barrel exports                                              | OK     | Runtime check against `dist/index.js`: every listed value present (including `createKernel`, `createGetStatus`, `createSpecRepository`, `isPluginName`, `PLUGIN_NAME_REGEX`, `createConfigWriter`, `createRegenerateSpecMetadata`, `SDK_VERSION`, `codeGraphVersion`). All 11 plugin error classes are the same objects as in `@specd/plugin-manager`. Forbidden names absent (`SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, `PersistSpecMetadata`, their `create*`, lock helpers). |
| Host-adapter exports, import policy, version, review orchestration | OK     | unchanged since attempt 6 (`barrel.spec.ts`, `package-boundary.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Scenario to test: all scenarios mapped as in attempt 6 (strong). Deltas: "Revised metadata materialization surface" now asserts `createRegenerateSpecMetadata` (`barrel.spec.ts:113-121`); "Removed APIs not restored" checks runtime, `src/index.ts`, `core-reexports.ts` and `dist/index.d.ts` by regex (`:124-146`). Remaining weak points: T12 and T13.

Note (minor, spec wording): the use-case classes `MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState` are exported as TYPES only (`core-reexports.ts:186-203`), so at runtime `'MaterializeSpecMetadata' in sdk` is false. The spec says they and their `create*` factories "are available"; type-level availability satisfies the type scenario but not a runtime reading. Same pattern as the other use cases, so it is a consistent choice (see C7).

## sdk:host-context

| Requirement              | Status | Code                            | Notes                                                                                                                                                                                                                                                 |
| ------------------------ | ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SdkHostContext shape     | OK     | `host-context.ts:26-36,117-123` | no `config` field; exact keys asserted `host-context.spec.ts:290`.                                                                                                                                                                                    |
| createSdkContext         | OK     | `:94-124`, `:188-242`           | order builder, plugins, build; `plugins:false`; handlers; dispose on build failure; `rollbackErrors` unpacks `PluginDestroyError.errors` and `AggregateError`; frozen / non-extensible / primitive build error rethrown unchanged with `Logger.warn`. |
| openSpecdHost            | OK     | `:139-175`                      | mixed inputs rejected first; forced / startDir / cwd; fallback only for `ConfigNotFoundError`, never with `configPath`.                                                                                                                               |
| Host disposal            | OK     | `:117-123`                      | `dispose` returns `kernel.dispose()` (same promise), `[Symbol.asyncDispose]` same function.                                                                                                                                                           |
| Config mutation boundary | OK     | n/a                             | no write methods.                                                                                                                                                                                                                                     |

Scenario to test (all verify scenarios covered; strength noted):

| Scenario                                                                  | Test                                             | Strength                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Context exposes kernel/provider/dispose only; async-disposable            | `host-context.spec.ts:290,324`                   | strong                                                                                                      |
| Provider factory same config; new instance each call                      | `:61,150`                                        | strong                                                                                                      |
| Disposal delegates; asyncDispose same function; shared promise            | `:306,315` (identity) ; mutants D4/D5 killed     | strong                                                                                                      |
| Kernel options forwarded; graph options forwarded                         | `:203,140` ; D14/D15 killed                      | strong                                                                                                      |
| Plugins before build / disabled / default / empty list                    | `:61`, `:74`, e2e `:121,140` ; D3 killed         | strong                                                                                                      |
| Handlers forwarded                                                        | `:87` ; D9 killed                                | strong                                                                                                      |
| Broken plugin; already-initialised destroyed; no kernel                   | e2e `:114,130`, `:80`                            | strong                                                                                                      |
| Build failure disposes plugins; not masked; `rollbackErrors`              | `:87,103`, rollback `:61,84` ; D1/D2/D6 killed   | strong                                                                                                      |
| Primitive / frozen / non-extensible error not masked, logged at warn      | `:116-137`, `:394-418` ; D10/D18 killed          | strong                                                                                                      |
| End to end real plugin-manager                                            | e2e `:104`                                       | ok ("init before kernel exists" is shown only by order; the mocked test `:61` proves register-before-build) |
| Discovery cwd, startDir, forced path, mixed rejected                      | `:164,229,224,236` ; D7/D17 killed               | strong                                                                                                      |
| Warnings stay on config, none at top level                                | `:173,185`                                       | strong                                                                                                      |
| Opt-in bootstrap fallback (flag true)                                     | `:246`                                           | strong                                                                                                      |
| "config discovery remains the behavior when the flag is omitted or false" | none                                             | GAP T1 (mutants D11, D12 survive)                                                                           |
| Explicit configuration never falls back                                   | `:270` ; D8 killed                               | strong                                                                                                      |
| dispose shares kernel disposal; destroys in reverse; once                 | `:315`, e2e `:104,162`                           | strong                                                                                                      |
| await using; result carries members; providers not closed                 | `:324,334,341`                                   | strong                                                                                                      |
| No API wraps a foreign kernel                                             | `:352` (regex over barrel) + `:365` (type-level) | partial: name heuristic (T13)                                                                               |
| No write methods on context                                               | `:298`                                           | ok                                                                                                          |

No contradiction with `core:kernel`, `core:kernel-builder`, `plugin-manager:register-plugins-use-case` (handlers: built-in `agents` handler merged inside `registerPlugins`, `register-plugins.ts:62`) or `plugin-manager:plugin-errors`.

## skills:shared-folder-owners

Implementation `packages/skills/src/application/shared-folder-owners.ts`, exports `skills/src/index.ts:23-27`. Requirements: marker file, `addSharedOwner`, `removeSharedOwner`, `removeSharedFolderIfEmpty`, uninstall protocol (implemented per plugin, see below): all OK. Constraints (only `node:fs/promises` and `node:path`, no logging) met.

| Scenario                                                                                  | Test (`skills/test/application/shared-folder-owners.spec.ts`)                                                                                                                   | Strength                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Marker sorted and deduplicated                                                            | `:29`, `:66-101`                                                                                                                                                                | strong                                      |
| Corrupt marker treated as absent (also wrong shapes)                                      | `:134`, `:103-121`                                                                                                                                                              | strong                                      |
| First owner creates folder and marker                                                     | `:38`                                                                                                                                                                           | strong                                      |
| Registering twice idempotent (byte-identical)                                             | `:46`                                                                                                                                                                           | strong                                      |
| Normalises duplicates; invalid replaced on register                                       | `:67,75`, `:56`, `:123`                                                                                                                                                         | strong; unsorted-only case missing (T11)    |
| Owner registered before first shared write                                                | plugin tests, all five (`install-skills.spec.ts` first-shared-write-fails test: claude `:597`, codex `:501`, copilot `:515`, opencode `:568`, standard `:562`) ; M1, M14 killed | strong                                      |
| Owners remain / last owner / no marker / non-owner                                        | `:144,154,163,176`, `:83`                                                                                                                                                       | strong                                      |
| Empty folder removed / foreign kept / missing accepted                                    | `:188,196,206`                                                                                                                                                                  | strong                                      |
| Other errors propagate (EACCES)                                                           | `shared-folder-owners-eacces.spec.ts:20`                                                                                                                                        | strong                                      |
| Uninstall protocol: other owner keeps, last owner removes, foreign file, legacy, filtered | per plugin `shared-folder-ownership.spec.ts:177,197,220,239,312` plus `install-skills.spec.ts`                                                                                  | strong (M2-M6, M15, M23 killed in all five) |

Mutation on skills (22 mutants, filtered to the owners and comma-split tests): all killed except K3 (real gap T11), K4 (equivalent), K15/K16 (equivalent, a second check rejects the same value), K17 (trailing newline is not specified).

## Plugin specs (claude, copilot, codex, opencode, standard)

### Requirement status

| Requirement                                                                                                       | Claude                                                                 | Copilot                                         | Codex                                                         | OpenCode                                                                                                              | Standard                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Factory export, manifest read, validation, no `type`                                                              | OK `src/index.ts:14-58`                                                | OK                                              | OK                                                            | OK                                                                                                                    | OK                                                       |
| Manifest (schemaVersion 2, no pluginType, `agents.<id>`)                                                          | OK (checked json of all five; name/version equal package.json)         | OK                                              | OK                                                            | OK                                                                                                                    | OK                                                       |
| Domain layer, constructor name/version, frontmatter type                                                          | OK                                                                     | OK (6 keys)                                     | OK (2 keys)                                                   | OK (5 keys + agent `allowed_tools`)                                                                                   | OK (6 keys)                                              |
| Capabilities literal, via `ResolveBundle` only                                                                    | `['mcp','agents','frontmatter']`                                       | `['frontmatter','agents']`                      | `['mcp','agents','frontmatter']`                              | `['mcp','agents','frontmatter']`                                                                                      | `['frontmatter']`                                        |
| Skill / agent location                                                                                            | `.claude/skills/<n>/`, `.claude/agents/<n>.md`                         | `.github/skills`, `.github/agents/<n>.agent.md` | `.codex/skills`, `.codex/agents/<n>.toml`                     | `.opencode/skills`, `.opencode/agents/<n>.md`                                                                         | `.agents/skills`, agents in shared folder `<n>.agent.md` |
| Agent mapping                                                                                                     | `tools` comma string, `model` only if present (real run: no model key) | `tools` YAML list, top-level comma split        | TOML `name`, `description`, `developer_instructions`, escaped | `mode: subagent`, `permission` map                                                                                    | `name`, `description` only                               |
| Prompt injection / removal                                                                                        | CLAUDE.md `'claude'`                                                   | `.github/copilot-instructions.md` `'copilot'`   | AGENTS.md `'codex'`                                           | AGENTS.md, remove-then-inject `'opencode'`                                                                            | AGENTS.md `'standard'`                                   |
| Owner registered before first shared write incl. fallback agents                                                  | OK `install-skills.ts:143-148`                                         | OK `:151-156`                                   | OK `:138-143`                                                 | OK `:148-153`                                                                                                         | OK `:138-143`                                            |
| Agent placement from `capabilities` (install and filtered uninstall)                                              | OK                                                                     | OK                                              | OK                                                            | OK                                                                                                                    | n/a (unconditional)                                      |
| Filtered uninstall: no `removeSharedOwner`, keeps marker, shared files, block; selected shared agent file only    | OK `uninstall-skills.ts:38-55`                                         | OK                                              | OK                                                            | OK                                                                                                                    | OK                                                       |
| Full uninstall protocol (legacy flat files, agents, block, owners, `removeSharedFolderIfEmpty`, errors propagate) | OK with C2                                                             | OK with C2                                      | OK with C2                                                    | OK with C2                                                                                                            | OK                                                       |
| Fast-track + manual-only routing                                                                                  | OK (`disable_model_invocation: true`)                                  | OK (`disable-model-invocation: true`)           | OK (description only, no extra keys)                          | OK (description only)                                                                                                 | OK (description + `allowed-tools`)                       |
| Standard `allowed-tools` space style                                                                              | n/a                                                                    | n/a                                             | n/a                                                           | n/a                                                                                                                   | OK (`frontmatter-contract.spec.ts:69`)                   |
| Wizard / meta package (opencode, standard)                                                                        | n/a                                                                    | n/a                                             | n/a                                                           | OK (`cli/src/commands/project/init.ts:18-19`, `cli/test/commands/project-init.spec.ts:350`, `meta-package.spec.ts:7`) | OK                                                       |

### Real install inspection (no mocks)

All five: files land in the specified dirs; `.specd/config/skills/shared/.owners.json` lists the plugin; `shared.md` has no frontmatter and no `SKILL.md` in the shared folder; fast-track description starts "Manual-only: use only when the user explicitly invokes /specd-fasttrack."; uninstall leaves an empty tree. Claude agent: `name`, `description`, `tools: Bash(node *), ..., Write`, no `model`. Copilot agent: `tools:` YAML list. OpenCode agent: `mode: subagent`, `permission:` map. Codex: valid TOML. Standard: agents `*.agent.md` in the shared folder with only `name`/`description`. Claude fast-track and Codex/OpenCode (description only), Copilot `disable-model-invocation`, Standard `allowed-tools`.

### Scenario to test map (line numbers: `IS` install-skills.spec.ts, `SO` shared-folder-ownership.spec.ts, `AL` agent-lifecycle.spec.ts, `CR` create.spec.ts, `RP` real-pipeline.spec.ts, `PL` domain/types/<p>-plugin.spec.ts, `FC` domain/frontmatter-contract.spec.ts)

| Scenario                                                                               | Claude                                                    | Copilot                                  | Codex                                               | OpenCode                                             | Standard               | Strength                                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Exposes create; factory reads manifest; no `type`                                      | CR:45                                                     | CR:45                                    | CR:45                                               | CR:45                                                | CR:45                  | strong (also CR:62,74,86 precedence/fallback, CR:97,109 rejection)                                                          |
| Async factory result awaited                                                           | none in plugins (loader contract in plugin-manager tests) | same                                     | same                                                | same                                                 | same                   | T12                                                                                                                         |
| Manifest declares agents contribution; install receives context                        | PL:38,21                                                  | PL:34,21                                 | PL:34,21                                            | PL:?,21 (`domain/types/opencode-plugin.spec.ts`)     | same                   | strong                                                                                                                      |
| Plugin runtime contract / no capability objects (codex, copilot)                       | IS:143 (capabilities array)                               | IS:230                                   | IS:144                                              | IS:125                                               | IS:128                 | ok                                                                                                                          |
| Install emits frontmatter through skills rendering                                     | RP:50 (real)                                              | RP:50                                    | RP:50                                               | RP:50                                                | RP:50                  | strong                                                                                                                      |
| Shared files without frontmatter; shared dir no `SKILL.md`                             | IS:143, SO:144                                            | IS:147, SO:144                           | IS:144, SO:144                                      | IS:125, SO:144                                       | IS:128, SO:139         | strong                                                                                                                      |
| Installs to skills dir + sharedFolder default                                          | IS:143                                                    | IS:147                                   | IS:144                                              | IS:125                                               | IS:128                 | strong for default; override untested (T2)                                                                                  |
| Installs agents to categorized dir                                                     | IS:235, RP:78                                             | IS:230, RP:78                            | IS:223, RP:78                                       | IS:268, RP:78                                        | IS:279 (shared), RP:78 | strong                                                                                                                      |
| Agent model read / omitted (claude)                                                    | IS:557, IS:638, RP:78                                     | n/a                                      | n/a                                                 | n/a                                                  | n/a                    | strong                                                                                                                      |
| Bash patterns / plain tools / no duplicate keys (opencode)                             | n/a                                                       | n/a                                      | n/a                                                 | FC:68,77, IS:268                                     | n/a                    | strong (O1-O4 killed)                                                                                                       |
| Tool-list comma split on top-level (copilot)                                           | n/a                                                       | IS:604 tests the skills helper only      | n/a                                                 | n/a                                                  | n/a                    | WEAK T5                                                                                                                     |
| TOML escaping                                                                          | n/a                                                       | n/a                                      | IS:331,589,597, `toml-escaping.spec.ts:69,79,83,87` | n/a                                                  | n/a                    | strong                                                                                                                      |
| Fallback to shared when `agents` missing                                               | IS:499, SO:144                                            | IS:405, SO:144                           | IS:402, SO:144                                      | IS:458, SO:144                                       | n/a                    | strong (M1, S4, A2 killed)                                                                                                  |
| Prompt block written / removed                                                         | IS:353                                                    | IS:323                                   | IS:305                                              | IS:363                                               | IS:365                 | strong                                                                                                                      |
| Shared block kept while another plugin references (codex, opencode, standard)          | n/a                                                       | n/a                                      | IS:379                                              | IS:435                                               | IS:445                 | strong                                                                                                                      |
| Filtered uninstall keeps block (`options.skills` and `options.agents`)                 | SO:312, AL:123                                            | same                                     | same                                                | same                                                 | same                   | strong                                                                                                                      |
| Legacy plugin marker purged (uninstall) / removed on install (opencode)                | SO:339                                                    | SO:339                                   | SO:339                                              | SO:339, IS:363                                       | SO:333                 | strong for purge. OpenCode's explicit `removeSpecdBlock` before inject is behaviourally redundant (mutant O5 survives): T10 |
| Uninstall removes selected skill dirs, keeps shared                                    | IS:143                                                    | IS:147                                   | IS:144                                              | IS:125                                               | IS:128                 | strong                                                                                                                      |
| Uninstall without filter keeps unrelated user skills; legacy flat `<skill>.md` removed | IS:143, IS:677                                            | IS:349 (user file), legacy flat UNTESTED | IS:144 only user skill; legacy flat UNTESTED        | legacy flat UNTESTED                                 | legacy flat UNTESTED   | WEAK T4 (M11/M12/Z1/E2 survive in codex, copilot, opencode, standard)                                                       |
| Uninstall selected agent files; unrelated agents kept                                  | AL:123,160                                                | AL:123,160                               | AL:123,160                                          | AL:123,160                                           | IS:464, IS:391         | strong                                                                                                                      |
| Filtered uninstall of shared agent file, no `removeSharedOwner`                        | AL:182                                                    | AL:182                                   | AL:182                                              | AL:182                                               | AL:123                 | strong (spy wraps real impl)                                                                                                |
| Default capability set in uninstall includes `agents`                                  | AL:239                                                    | AL:219                                   | AL:239                                              | AL:239                                               | n/a                    | strong (M22, S6 killed)                                                                                                     |
| Install registers owner / filtered install registers owner                             | IS:388                                                    | IS:367                                   | AL:223                                              | AL:223                                               | AL:160                 | strong                                                                                                                      |
| Owner registered before first shared write                                             | IS:597                                                    | IS:515                                   | IS:501                                              | IS:568                                               | IS:562                 | strong                                                                                                                      |
| Other owners keep shared files                                                         | IS:408, SO:197                                            | IS:387, SO:197                           | IS:379, SO:197                                      | IS:435, SO:197                                       | AL:176, SO:191         | strong                                                                                                                      |
| Last owner removes shared files and folder                                             | IS:430, SO:177                                            | IS:461, SO:177                           | IS:447, SO:177                                      | IS:514, SO:177                                       | IS:508, SO:171         | strong                                                                                                                      |
| Foreign file keeps folder                                                              | IS:448, SO:220                                            | IS:480, SO:220                           | IS:466, SO:220                                      | IS:533, SO:220                                       | IS:527, SO:214         | strong                                                                                                                      |
| Legacy install without marker deletes nothing                                          | IS:465, SO:239                                            | IS:556, SO:239                           | IS:542, SO:239                                      | IS:609, SO:239                                       | IS:492, SO:233         | strong                                                                                                                      |
| Domain layer files exist; frontmatter value model                                      | FC (exact key set via `expectTypeOf`, `@ts-expect-error`) | FC                                       | FC                                                  | FC                                                   | FC                     | strong only under `tsc` (T14)                                                                                               |
| InstallSkills passes values into skills; does not call `getBundle` directly            | IS:143 (variables, capabilities)                          | IS:147                                   | IS:144                                              | IS:125                                               | IS:128                 | ok; "no direct getBundle" undetectable by mock (T3)                                                                         |
| Default install includes fast-track; manual-only; no unsupported keys                  | RP:50                                                     | RP:50                                    | RP:50                                               | RP:50                                                | RP:50                  | strong                                                                                                                      |
| Wizard / meta package                                                                  | n/a                                                       | n/a                                      | n/a                                                 | cli project-init.spec.ts:350, meta-package.spec.ts:7 | same                   | strong                                                                                                                      |

## Discrepancies (code and spec both shown)

- **C1 (MAJOR, latent; all five plugins)** Filtered uninstall removes ANY named path, not only specd-managed ones, and does not sanitise names.
  - Spec (all five, "Filtered uninstall" and last paragraph of "Uninstall behavior"): "uninstall MUST remove only the selected specd-managed skill directories", "MUST remove only the selected specd-managed agent files", "Uninstall MUST NOT remove unrelated directories or files under ... that are not part of the specd-managed set".
  - Code: `uninstall-skills.ts` claude/codex/copilot/opencode `:42-52`, standard `:37-46`: `rm(path.join(targetDir, skill), { recursive: true, force: true })` and `rm(path.join(targetDir, `${skill}.md`))` for every name in `options.skills`; agents the same. No check against `repository.list()`.
  - Experiment (all five): after a default install and a user-created `skills/my-user-skill/` and `agents/my-user-agent.*`, `uninstall({ skills: ['my-user-skill'], agents: ['my-user-agent'] })` deleted both user items; `uninstall({ skills: ['..'] })` deleted the whole `.claude/` (resp. `.codex/`, `.github/`, `.opencode/`, `.agents/`) tree parent of the skills dir. The full uninstall is correctly limited to the repository list.
  - Reachability: nothing in `packages/cli/src` or `plugin-manager/src` passes `skills`/`agents` to `uninstall` today, so only direct API callers are affected. Pre-existing logic (same in HEAD), but the spec text is strict and no test covers it. Fix: intersect with `repository.list()` (or reject names containing path separators or `..`) and add a test that a user skill named in the filter survives.
- **C2 (minor; claude, codex, copilot, opencode)** Full uninstall skips removal of the runtime agents directory when the supplied `capabilities` lack `agents`.
  - Spec "Full uninstall" step 2: "remove all specd-managed agent files under `.claude/agents/`" (unconditional). Only the FILTERED paragraph says "uninstall evaluates `capabilities` the way install does".
  - Code: `uninstall-skills.ts:69` (`if (supportsAgents) { for (const agent of managedAgents) rm(agentsTargetDir/...) }`, copilot `:67`).
  - Experiment: default install, then `uninstall({ options: { capabilities: ['frontmatter'] } })` leaves `.claude/agents/*.md`, `.codex/agents/*.toml`, `.github/agents/*.agent.md`, `.opencode/agents/*.md`. Either remove the condition (full uninstall should remove both locations) or add the capability rule to the spec's full-uninstall text. No test covers it.
- **C3 (minor, spec text; claude)** Frontmatter keys are written in snake_case (`allowed_tools`, `argument_hint`, `disable_model_invocation`; real output: `disable_model_invocation: true`, `allowed_tools: Bash(node *), ...`). Spec literally requires `disable_model_invocation: true` and lists the keys with underscores, and code and tests agree. But `plugin-agent-standard` (hyphen "per agentskills.io") and `plugin-agent-copilot` (`disable-model-invocation`) use hyphens, and Claude Code's published skill frontmatter uses hyphenated keys (`allowed-tools`, `argument-hint`, `disable-model-invocation`, `user-invocable`; `when_to_use` is the only underscore). If that holds, the Claude manual-only fast-track guarantee does not take effect at runtime. I could not verify the Claude Code runtime offline, so this is a spec question for the author, not a code/spec mismatch.
- **C4 (minor, spec text; copilot)** Spec "Frontmatter field contract": agent entries "MAY additionally carry `allowed_tools`". Code uses the key `'allowed-tools'` for agent entries (`domain/frontmatter/index.ts:51,56`, `install-skills.ts:84-85`), `FC` asserts `'allowed-tools'`. The `Frontmatter` type doc (`types/frontmatter.ts:~20`) says "space-separated string or YAML list" while agent values are comma-separated and split with `splitTopLevelCommas`. Align the spec key name (and the type comment) with the code. Also the shared key means a skill entry with `allowed-tools` would be emitted verbatim to the skill frontmatter, contrary to "it is never written to a skill's frontmatter" (no such entry exists today).
- **C5 (minor, note; all five)** Install with only `options.skills` still installs ALL agents (and `options.agents` alone installs ALL skills): `install-skills.ts:40` (`requestedAgents` defaults to all). Consistent with `AgentInstallOptions` docs ("When omitted, install all agents") and the specs ("or all skills when no filter is provided"); flagged because a "filtered install" in the scenarios is easy to read as selecting only the named items. No change needed unless the CLI starts using the filters.
- **C6 (minor, spec wording; opencode)** Spec "Prompt Injection": `install()` MUST call `removeSpecdBlock(agentsMdPath, "opencode")` before injecting to purge a legacy marker. Code does (`install-skills.ts` after the loop) but `injectSpecdBlock` already purges the legacy marker, so the call is not observable (mutant O5 survives, legacy-marker test `IS:363` passes either way). Spec/code agree; only the test cannot enforce the MUST.
- **C7 (minor; sdk)** Use-case classes (`MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState`) are type-only re-exports (`core-reexports.ts:186-203`); see sdk:composition note. Also `barrel.spec.ts` (~`:195`, "compiles every documented worker contract") runs `pnpm --filter @specd/sdk build` inside `vitest`, rewriting `dist/` as a test side effect.

No contradiction found between the batch specs and `plugin-manager:agent-plugin-type` (capabilities and agent fallback text matches), `skills:shared-folder-owners`, `core:kernel`, `plugin-manager:register-plugins-use-case`, `plugin-manager:plugin-errors`.

## Test gaps (weak or missing), by priority

Mutants quoted were applied to copies of the real sources and the full plugin suite run; "survives" means all tests stayed green.

- **T1 (sdk, host-context)** Scenario text "config discovery remains the behavior when the flag is omitted or false" has no test; the test named "uses a synthetic graph host only when discovery fallback is enabled" (`host-context.spec.ts:246`) only runs with the flag set. Mutant D11 (remove `input?.allowBootstrapFallback !== true`) survives: fallback would run for every discovery miss. Mutant D12 (fallback on any error, not only `ConfigNotFoundError`) also survives. Add: `load` rejects `ConfigNotFoundError`, flag omitted and `false` => rejects, `createVcsAdapter` not called; flag true with another error class => rethrown.
- **T2 (all five)** `variables.sharedFolder` override is never exercised: mutants "install ignores the override" and "uninstall ignores the override" survive in all five plugins (every test relies on the default `.specd/config/skills/shared`). Spec: "pass `variables.sharedFolder` only when overriding the default" and "Files marked as shared MUST be installed under the rendered `sharedFolder` location". Add install + full uninstall with a custom `sharedFolder`.
- **T3 (all five)** `InstallResult.skipped` is untested: mutants dropping `skipped.push(... 'item not found')` and `... 'bundle has no files'` survive; only `result.skipped` equals `[]` is asserted in `real-pipeline.spec.ts:42`. Spec codex/copilot: "return an `InstallResult` with installed and skipped entries".
- **T4 (codex, copilot, opencode, standard)** Legacy flat `<skill>.md` handling: install removing it (mutants "no legacy rm on install" and "wrong legacy path") and full uninstall removing it ("including legacy flat `<skill>.md` files left by previous versions", verify scenario "Uninstall without filter...") survive in these four. Only Claude has it (`install-skills.spec.ts:677`).
- **T5 (copilot)** Agent tool-list splitting end to end: `install-skills.spec.ts:604` imports and tests `splitTopLevelCommas` from `@specd/skills`, not the plugin path. Mutant "install splits on every comma" survives. Real data has no comma inside parentheses, so only a fixture can catch it (compare opencode `frontmatter-contract.spec.ts:68,77`).
- **T6 (claude, opencode)** The `installed[].path` returned for a fallback agent (`<agent>.agent.md` in the shared folder) is untested (mutant "path always `.md`" survives).
- **T7 (claude)** `skipped` 'bundle has no files' (subset of T3), listed for traceability.
- **T8 (codex)** `escapeTomlBasicMultiline(...).trim()` is not asserted (mutant dropping `.trim()` survives); exact body shape is covered only by the real run (`RP:78` checks start and `\n"""` end).
- **T9** see T8 (kept numbering stable with in-text references).
- **T10 (opencode)** The explicit `removeSpecdBlock` before `injectSpecdBlock` (spec MUST) cannot be distinguished (C6); a spy test would be needed.
- **T11 (skills)** Marker with unsorted-but-unique owners and the registering id already present is not shown to be rewritten sorted: mutant "skip rewrite when lengths match" (K3) survives. Spec: "a marker that is unsorted or holds duplicates is rewritten normalised even when the id is already present". Tests use duplicates only (`:67,75`).
- **T12 (all five)** "Async factory result is awaited": no plugin-level test; loader behaviour lives in plugin-manager tests. Unchanged from attempt 6 (T3).
- **T13 (sdk)** "No API wraps a foreign kernel" is a name regex over `src/index.ts` (`host-context.spec.ts:352`) plus type-level checks (`:365`); a differently named wrapper would pass the regex. "init ran before the kernel existed" is shown only by order in e2e.
- **T14 (all)** `expectTypeOf` / `@ts-expect-error` frontmatter and handler contract tests (`FC`, `handler-contracts.spec.ts`) are enforced by `tsc --noEmit`, not by `vitest run`; CI must run typecheck on `test/`. "Plugin does not call `SkillRepository.getBundle` directly" cannot be detected with a mocked repository (`ResolveBundle` itself calls `getBundle`); code review confirms it in all five.

## Files

- Source: `packages/sdk/src/composition/host-context.ts`, `packages/sdk/src/index.ts`, `packages/sdk/src/core-reexports.ts`, `packages/plugin-agent-{claude,copilot,codex,opencode,standard}/src/index.ts`, `.../src/application/use-cases/{install,uninstall}-skills.ts`, `.../src/domain/frontmatter/index.ts`, `packages/skills/src/application/shared-folder-owners.ts`, `packages/skills/src/application/split-top-level-commas.ts`.
- Tests: `packages/sdk/test/composition/{host-context,host-context-e2e,host-context-rollback,handler-contracts,package-boundary,composition}.spec.ts`, `packages/sdk/test/barrel.spec.ts`, `packages/plugin-agent-*/test/**`, `packages/skills/test/application/{shared-folder-owners,shared-folder-owners-eacces,split-top-level-commas}.spec.ts`, `packages/cli/test/commands/project-init.spec.ts`.
- Scratch (not in repo): mutation harness and results under the session scratchpad `mut/`, real-run scripts under `run/`.
