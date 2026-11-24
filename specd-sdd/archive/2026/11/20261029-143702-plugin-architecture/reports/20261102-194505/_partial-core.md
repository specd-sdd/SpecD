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
