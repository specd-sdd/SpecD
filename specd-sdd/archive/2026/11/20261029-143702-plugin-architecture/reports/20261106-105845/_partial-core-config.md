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
