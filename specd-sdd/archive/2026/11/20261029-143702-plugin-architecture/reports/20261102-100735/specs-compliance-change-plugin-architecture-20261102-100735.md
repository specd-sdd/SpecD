# Specs compliance — plugin-architecture (delegated, attempt verification-attempt-1)

Static read audit; tests run separately by verify (typecheck 25/25, tests 24/24 tasks pass).

## Detailed Findings

# Partial audit: core + cli specs (plugin-architecture)

Scope: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show, cli:project-init, cli:project-update.
Method: merged spec-preview read, then code and test inspection (read-only). Static review only; tests were not run.
Paths below are relative to `packages/`. `guides.ts` diffs ignored.

## Cross-spec / spec-internal contradictions (highest value)

1. **Tmp `.gitignore` location.**
   - core:config says `configPath = <specdPath>/config` (default `.specd/config`). core:config-writer-port says init creates `{configPath}/tmp/.gitignore`.
   - cli:project-init scenario says "resolved config path `.specd`" and expects `.specd/tmp/.gitignore`.
   - Code: `core/src/infrastructure/fs/config-writer.ts:72` calls `ensureTmpGitignore(<root>/.specd)`, so it writes `.specd/tmp/.gitignore`.
   - Runtime repositories call `ensureTmpGitignore(this.configPath())` (change-repository.ts:257, archive-repository.ts:179, spec-repository.ts:171). With the default config that is `.specd/config/tmp/.gitignore`. The loader test at config-loader.spec.ts:244 confirms `configPath` defaults to `.specd/config`.
   - So init protects `.specd/tmp`, not the `.specd/config/tmp` where fs-cache and change-locks live. Runtime recreates the right file lazily, so the impact is low.
   - Option A: the spec is right (`{configPath}/tmp`). Then change the writer to `.specd/config` and fix the project-init scenario.
   - Option B: the code is right. Then fix core:config and the writer-port wording, because `.specd/tmp` is also a derived dir (`{specdPath}/tmp`) in core:config.
2. **project-update exit code.**
   - cli:project-update "Partial failure" says "No step causes a non-zero exit in v1" and that warnings go to stderr.
   - Code (`cli/src/commands/project/update.ts:60-62`) throws `CliExitError(1)` when `result.hasErrors`. The test `project-update.spec.ts:86` asserts exit 1.
   - Per-plugin update lines (`error`/`skipped`) are printed to stdout, not stderr.
   - Option A: the spec is stale. A failed plugin update should exit non-zero, and the spec and the "Warnings ... exit 0" scenario need rewording to distinguish warnings from errors.
   - Option B: the code is wrong. Errors should be downgraded to warnings on stderr with exit 0.
3. **core:config Purpose and core:config-loader.** They do not mention `configVersion` or flat `plugins` as top-level keys. core:config has no requirement for `plugins`, `contributions`, `configVersion`, or the legacy-format error; those are only in config-loader. `cli:project-update` still references "skills manifest" in `core:config`, which is stale.

## core:config

Requirements: file location and format, privacy, env overrides, forced actor provider, local override, cascade identity and removal (`plugins[]` by `name`), schema ref, invalidation, workspaces, graph, storage, named adapters, config path, template vars, schemaPlugins, schemaOverrides, context selection. The change only touches plugins (identity and removal), `configVersion`, and `configPath`.

| Requirement                                                                                                              | Status                                                       | Evidence                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cascade identity: `plugins[]` replace in place by name, new names appended                                               | OK                                                           | `core/src/application/ports/config-schema.ts` `mergePluginLists` (diff, ~l.335+) via `deepMergeRawConfig` (ignoredKeys includes `plugins`). Test config-loader.spec.ts:2259                                                                                                |
| `remove.plugins: [{name}]`                                                                                               | OK                                                           | `core/src/infrastructure/fs/config-cascade.ts` `applyRemovals` (~l.495) and `LayerRemovalZodSchema` (l.32). Test config-loader.spec.ts:2234                                                                                                                                |
| Removal of an absent name                                                                                                | Spec silent. Code throws ConfigValidationError ("not found") | config-cascade.ts ~l.505. Test config-loader.spec.ts:2303. Consistent with other collections (context test l.2377)                                                                                                                                                         |
| `configVersion` across layers                                                                                            | Not in spec (extra behaviour)                                | `mergeActiveLayers` in config-cascade.ts (diff, ~l.521-540) rejects any layer whose `configVersion` differs from the root, and forces the root version. Test config-loader.spec.ts:2289. Propose: add a scenario to core:config-loader or core:config, or remove the check |
| Other requirements (privacy, env, workspaces, graph, storage, context selection, schema plugins/overrides, invalidation) | Not changed by this change; spot-checked only                | Tests exist for most                                                                                                                                                                                                                                                       |

Counts: ok 2, discrepancy 0 (1 spec gap: configVersion layer mismatch), untested: no test for stale "plugins" mention; the config cascade for `plugins` with a legacy object in a base layer was not tested (see config-loader).

## core:config-loader

Requirements relevant to the change: YAML parsing and structural validation (legacy detection, version check), "Schema plugins, schema overrides, and context entry mapping" (flat plugins, scoped names, duplicates rejected, `remove.plugins`, no plugin loading).

| Requirement / scenario                                                                                                            | Status                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy `plugins.agents` raises LegacyConfigFormatError (code `LEGACY_CONFIG_FORMAT`) with the flat snippet and `configVersion: 2` | OK                                                                                                                                                    | `core/src/infrastructure/fs/config-loader.ts:704-737` and `domain/errors/legacy-config-format-error.ts`. Test l.1258                                                                                                                                                                                                                                 |
| `configVersion` > supported raises UnsupportedConfigVersionError (`UNSUPPORTED_CONFIG_VERSION`)                                   | OK                                                                                                                                                    | config-loader.ts:705-707, `CURRENT_CONFIG_VERSION = 2`. Test l.1283                                                                                                                                                                                                                                                                                  |
| Both errors extend ConfigValidationError                                                                                          | OK                                                                                                                                                    | the two error files                                                                                                                                                                                                                                                                                                                                  |
| Runs "before the strict schema"                                                                                                   | Mostly OK. The check runs per active layer after merge and env overrides (config-loader.ts:285), before `SpecdYamlZodSchema.safeParse`                | Edge: cascade merge and `applyRemovals` run first, so a `remove.plugins` layer over a legacy object base can raise `remove.plugins: no plugins in inherited config` instead of the migration message. Untested. Option A: acceptable. Option B: spec "run before the strict schema" should also cover removals, so move the check ahead of the merge |
| Missing `configVersion` accepted                                                                                                  | Not in spec. Code accepts it (test l.1294)                                                                                                            | Suggest adding a scenario                                                                                                                                                                                                                                                                                                                            |
| Flat plugins mapping `{name, config?, contributions?}`, scoped name regex, duplicate names rejected                               | OK                                                                                                                                                    | `config-schema.ts` `PluginEntryZodSchema` (PLUGIN_NAME_REGEX) and `PluginsZodSchema` superRefine. Tests l.1194, 1220, 1233, 1245                                                                                                                                                                                                                     |
| `contributions` min 1                                                                                                             | Not in spec. Code `.min(1)` in config-schema.ts and config-writer.ts `pluginSchema`                                                                   | Spec gap. An empty allowlist is rejected, and the writer silently drops invalid lists (see writer)                                                                                                                                                                                                                                                   |
| Loader must NOT load plugins or validate `config`                                                                                 | OK                                                                                                                                                    | `_buildConfig` passes `config` through (config-loader.ts:666-675)                                                                                                                                                                                                                                                                                    |
| Invalid YAML / missing `schema` / `adapter: s3` / "no config found" / "walk stops at VCS root" scenarios                          | Untested (or only indirectly): no direct test found for invalid YAML, missing `schema`, `adapter: s3`, or a `load()` throwing when no config is found | Pre-existing gaps                                                                                                                                                                                                                                                                                                                                    |
| Discovery scenarios (startDir, ancestor, explicit-base skip, standalone reset, no-VCS)                                            | OK (tests l.805-830, 1935-2040)                                                                                                                       | Forced-mode scenarios tested l.2399-2560                                                                                                                                                                                                                                                                                                             |
| Storage and config-file containment, drive-letter case                                                                            | Test files exist (`config-loader-root-containment.spec.ts`, spec l.1447). Drive-letter and `..` prefix edge cases not verified                        | Not part of this change                                                                                                                                                                                                                                                                                                                              |
| `Path probe` scenario "Discovery mode returns resolved chain root path"                                                           | OK                                                                                                                                                    | tests l.1504, 2988-3010. Note test l.1524 is named "prefers specd.local.yaml"                                                                                                                                                                                                                                                                        |
| Windows device name workspace rejection (tests l.108-182)                                                                         | Behaviour not in the spec                                                                                                                             | Spec gap (pre-existing)                                                                                                                                                                                                                                                                                                                              |

Counts: ok ~10, discrepancy 1 (edge ordering of the legacy check; low), untested ~5.

## core:config-writer-port

Port: `initProject`, `addPlugin`, `removePlugin`, `listPlugins`.

| Requirement                                                                  | Status                                                                                                                              | Evidence                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface shape (4 methods, interface not class)                             | OK                                                                                                                                  | `core/src/application/ports/config-writer.ts`                                                                                                                                                                                                                 |
| `InitProjectOptions` / `InitProjectResult` shape (incl. `metadataCachePath`) | OK                                                                                                                                  | same file, lines 1-25                                                                                                                                                                                                                                         |
| initProject: `configVersion: 2`, no `storage` block                          | OK                                                                                                                                  | config-writer.ts:41-56. Test spec l.40-60 (storage undefined)                                                                                                                                                                                                 |
| Creates specs dir and storage dirs, metadata dir (idempotent)                | OK                                                                                                                                  | config-writer.ts:72-80. Test l.63, 74                                                                                                                                                                                                                         |
| Rooted `/.specd/metadata/` gitignore entry, idempotent                       | OK                                                                                                                                  | config-writer.ts:84-88, `appendGitignoreEntries`. Tests l.82, 91                                                                                                                                                                                              |
| `specd.local.yaml` and `specd.local.*.yaml`                                  | OK                                                                                                                                  | same. Tests l.82, 102                                                                                                                                                                                                                                         |
| tmp `.gitignore` (`*` / `!.gitignore`)                                       | **Discrepancy**                                                                                                                     | Written at `.specd/tmp`, not `{configPath}/tmp`. See contradiction 1. **No test** for it in core                                                                                                                                                              |
| Already-initialised guard, `--force`                                         | OK                                                                                                                                  | config-writer.ts:36-39. Tests l.121, 127                                                                                                                                                                                                                      |
| Non-default `metadataPath` / non-fs adapter scenarios                        | OK (vacuous: init always writes a fresh default fs config)                                                                          | Untested                                                                                                                                                                                                                                                      |
| addPlugin: add, no duplicate, merge `config`/`contributions`                 | OK                                                                                                                                  | config-writer.ts:105-117 `mergePluginEntry`. Tests l.149, 158. Spec says "updated"; the code **preserves** unspecified fields (merge). Compatible, but could be stated                                                                                        |
| addPlugin does not validate the plugin name                                  | Spec silent. Name rules are enforced only at load time                                                                              | Option A: writer should validate with `isPluginName`. Option B: leave to the loader                                                                                                                                                                           |
| addPlugin/removePlugin on an invalid existing `plugins` value                | **Data-loss risk**: `parsePlugins` returns `[]` on any schema failure, then `doc.set('plugins', ...)` overwrites the existing value | config-writer.ts:104-130, 235-244. For example a legacy `plugins.agents` object or an entry with empty `contributions` gets silently replaced. Spec silent. Option A: the spec should say invalid lists raise ConfigValidationError. Option B: the code stays |
| removePlugin: remove, absent is a no-op                                      | OK                                                                                                                                  | Tests l.179, 190 (no-op also rewrites the file)                                                                                                                                                                                                               |
| listPlugins: all entries, empty on absent file                               | OK                                                                                                                                  | Tests l.202, 207. Returns `[]` on invalid YAML or invalid list (spec silent)                                                                                                                                                                                  |
| Delivery via `createConfigWriter`                                            | OK. CLI imports it from `@specd/sdk` (cli/src/commands/project/init.ts:2), not `@specd/core`                                        | The spec says "from @specd/core". Wording stale because of the SDK delegation (memory: CLI delegates to SDK). Update the spec to say "SDK/core"                                                                                                               |
| "Delivery MUST NOT use `listPlugins` for declaration reads"                  | Not verified in detail; `plugins/get-declared-plugins.ts` was modified to read the config snapshot                                  |                                                                                                                                                                                                                                                               |
| Optional initialization leaves plugin config absent                          | OK                                                                                                                                  | init writes no `plugins` key                                                                                                                                                                                                                                  |

Counts: ok ~14, discrepancy 2 (tmp gitignore, silent drop of invalid plugins list), untested 3 (tmp gitignore content, `configVersion: 2` written for the add-plugin scenario with config+contributions on a fresh entry, absent-config `listPlugins` with plugins missing is covered).

## core:check-registry

Only change in this area: plugin namespace becomes scoped (`@scope/name` + `.id`).

| Requirement                                                                                                             | Status                                                                           | Evidence                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open registry API (`get`, `has`, `list`, `bindings`)                                                                    | OK                                                                               | `core/src/domain/services/check-registry.ts:158-203`                                                                                                                                                  |
| Immutability and 16 built-ins                                                                                           | OK                                                                               | `DOMAIN_CHECKS` in check-bindings.ts (16 entries). Test l.429                                                                                                                                         |
| Canonical id `${pluginName}.${id}` with a single `@`; regex `^@[a-z0-9][a-z0-9_-]*\/[a-z0-9][a-z0-9_-]*$`               | OK                                                                               | check-registry.ts:236-244, `domain/plugin-name.ts`. Tests l.14, 49, 226, 258                                                                                                                          |
| InvalidPluginNameError only on grammar violation                                                                        | OK                                                                               |                                                                                                                                                                                                       |
| DuplicateCheckError, InvalidCheckKindError, adaptation to `kind: 'predicate'`                                           | OK                                                                               | l.247-262. Tests l.102, 82, 273                                                                                                                                                                       |
| Binding coordinate identity and DuplicateCheckBindingError (transition and step-skip)                                   | OK                                                                               | `coordinateKey`. Tests l.120, 366, 405                                                                                                                                                                |
| Duplicate `archiveChecks` declaration per check                                                                         | Implemented elsewhere (build-schema). Test `build-schema-archive-checks.spec.ts` |                                                                                                                                                                                                       |
| Governance defaults (embedding follows default bindings, bindingOverride default, configOverride/disable defaults true) | OK                                                                               | check-registry.ts:296-312. Test l.470                                                                                                                                                                 |
| Binding inherits check-level `allowConfigOverride`/`allowBindingOverride`                                               | OK                                                                               | `applyBindingSpecs` transition-checks.ts:~523-528 falls back to governance                                                                                                                            |
| Category A/B/C governance, archive exception                                                                            | OK                                                                               | `nonEmbeddableBuiltins`; check-bindings.ts archive specs (`workspace.readOnly`, `deps.consistent`, `impl.filesResolved` locked; `spec.overlap`, `impl.linksInScope` open). Tests l.295, 449, 459, 527 |
| Composition forwards governance and step-skip bindings; executable builtins                                             | OK                                                                               | `composition/composition-registries.ts:239`; `withExecutableBuiltins`. Tests composition-registries.spec.ts:44, workflow-check-registry.spec.ts:330                                                   |
| Cascading config precedence                                                                                             | Not in the registry; resolver elsewhere                                          |                                                                                                                                                                                                       |

Discrepancies and gaps:

- JSDoc on `register` still says "Plugin namespace matching ^[a-z][a-z0-9-]\*$" (check-registry.ts, `@param pluginName`). Stale doc only.
- Scenario "Plugin namespace accepts the documented grammar" requires digit, hyphen and underscore examples. The test (`it.each`, l.~215) uses only hyphens. Leading-digit and underscore names are untested.
- Scenario "@acme/protocol + id edge does not shadow `protocol.edge`" is covered by the equivalent l.258 test but not literally.
- The spec says custom `register` options type is `PluginCheckRegistration`; code names it `PluginCheckRegistrationOptions` (naming only).

Counts: ok ~14, discrepancy 0 (1 stale comment), untested 2.

## cli:config-show

| Requirement                                                                  | Status                                                                                                                                                    | Evidence                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Signature (`--format`)                                                       | OK. It also accepts `--config` (extra, per entrypoint conventions)                                                                                        | `cli/src/commands/config/show.ts:97-98`              |
| Text output, `plugins` flat list with `(present)` and `[contributions: ...]` | OK. The spec scenario says line includes `contributions: audit`; the code prints `[contributions: audit]`                                                 | show.ts:62-71. Test l.182 covers the plugins section |
| artifactRules not shown                                                      | OK (never rendered). Untested                                                                                                                             |                                                      |
| json/toon serialise `SpecdConfig` as-is                                      | OK (`output(config, fmt)`), but `--help` text (show.ts:78-92) documents an obsolete shape (`specsPath`, `changesPath`...) that no longer matches. Doc bug |
| Error cases                                                                  | OK. Test l.204                                                                                                                                            |

Gaps: the `contributions: audit` scenario has no test (test l.182 only covers the plugins list; confirm). No plugin-section test for multiple entries.
Counts: ok 5, discrepancy 1 (stale help text), untested 2 (contributions line, artifactRules).

## cli:project-init

| Requirement                                                                   | Status                                                                                                                                                                                                                                                                        | Evidence                                                                                  |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Signature and alias                                                           | OK                                                                                                                                                                                                                                                                            | `cli/src/commands/project/init.ts`; tests l.165+ for alias                                |
| Interactive-mode detection                                                    | **Minor discrepancy**: flags are detected by value (`opts.workspace !== 'default'`, `workspacePath !== 'specs/'`), so passing `--workspace default` or `--workspace-path specs/` explicitly does not count as a flag (init.ts:75-79). Spec: "no configuration flags provided" | Option A: spec is satisfied loosely. Option B: use commander's `getOptionValueSource`     |
| Known plugin options (5, including opencode and standard)                     | OK                                                                                                                                                                                                                                                                            | init.ts:14-20. Untested in the wizard (interactive path has no tests)                     |
| Non-interactive output text and json (`metadataCachePath`, `plugins`)         | OK                                                                                                                                                                                                                                                                            | init.ts:104-128. Tests l.134, 217. The banner is printed first in text mode (not in spec) |
| Config placement (git root or CWD)                                            | OK in code (`resolveProjectRoot`, init.ts:26-33). **Untested** (no test for either scenario)                                                                                                                                                                                  |
| Delegation to `createConfigWriter().initProject`, no `createInitProject`      | OK (via `@specd/sdk`). Test l.166                                                                                                                                                                                                                                             |
| tmp `.gitignore`, metadata dir and gitignore                                  | Delegated; see writer discrepancy. CLI tests mock `initProject`, so scenarios "Standard directories are created", ".gitignore entry is added", "tmp gitignore ..." are covered only at the core level (and tmp not at all)                                                    |
| Plugin install after init; `plugins: false` host; `configVersion: 2` recorded | OK. Test l.79                                                                                                                                                                                                                                                                 |
| Already initialised (non-interactive exit 1 and error:, `--force`)            | OK. Tests l.235, 256                                                                                                                                                                                                                                                          |
| Interactive already-initialised prompt                                        | OK in code, untested                                                                                                                                                                                                                                                          |
| Install errors cause exit 1                                                   | Not in spec (spec silent)                                                                                                                                                                                                                                                     | init.ts:130-132                                                                           |

Counts: ok ~10, discrepancy 2 (flag detection, tmp gitignore via writer), untested 5 (config placement x2, wizard, known options, interactive overwrite).

## cli:project-update

| Requirement                                                                         | Status                                                                                             | Evidence                                               |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Signature                                                                           | OK (also `--config`)                                                                               | `cli/src/commands/project/update.ts`                   |
| Plugin update for all declared plugins, honouring `contributions`, `plugins: false` | OK                                                                                                 | update.ts:35-38; `plugins/update.ts:~70-76`. Test l.41 |
| Text prefix `plugins: updated ...`; "project is up to date"                         | OK. Tests l.41, 56                                                                                 |
| JSON `plugins` array                                                                | OK. Test l.70                                                                                      |
| Partial failure                                                                     | **Discrepancy** (contradiction 2): errors exit 1, and warnings are on stdout                       |
| Missing `specd.yaml` exits 1 with error                                             | Delegated to `resolveCliContext`. **Untested** here                                                |
| Declared plugins updated ("each plugin's `install()` is called")                    | The test mocks `updatePluginsWithKernel`; actual `UpdatePlugin` call is unverified by the CLI test | `plugins/update.ts`                                    |
| "Does not modify specd.yaml"                                                        | OK (read-only)                                                                                     |

Counts: ok 6, discrepancy 1 (exit code / stderr), untested 2 (missing specd.yaml, warnings-to-stderr scenario).

## Totals

| Spec                    | OK  | Discrepancy     | Untested |
| ----------------------- | --- | --------------- | -------- |
| core:config             | 2   | 0 (+1 spec gap) | 1        |
| core:config-loader      | ~10 | 1 (low)         | ~5       |
| core:config-writer-port | ~14 | 2               | 3        |
| core:check-registry     | ~14 | 0 (stale doc)   | 2        |
| cli:config-show         | 5   | 1 (help text)   | 2        |
| cli:project-init        | ~10 | 2               | 5        |
| cli:project-update      | 6   | 1               | 2        |

## Priority actions

1. Resolve the `{configPath}/tmp` versus `.specd/tmp` mismatch (spec and writer).
2. Decide the project-update error semantics (exit code and stderr) and align the spec or code.
3. Make `FsConfigWriter.addPlugin` and `removePlugin` refuse to overwrite an invalid existing `plugins` value.
4. Add tests for:
   - init tmp `.gitignore` content;
   - `contributions: audit` in config show;
   - registry names with a leading digit or underscore;
   - config-loader invalid YAML, missing `schema`, `adapter: s3`, and no-config-found;
   - init config placement.
5. Fix the stale `register` JSDoc and the `config show --help` schema text.

# Partial compliance report: plugin-manager specs (change plugin-architecture)

Scope: packages/plugin-manager (src + test). Read-only audit. Paths are relative to packages/plugin-manager unless noted.
Legend: OK / DISC (discrepancy) / MISSING. "Untested" = no test asserts the scenario in plugin-manager tests.

Overall: implementation closely follows the specs. The main gaps are (a) LoadPlugin output contract, (b) the PluginRepositoryPort having no implementer / different name, (c) install/uninstall/update error wrapping, (d) thin test coverage on many verify scenarios (several tests are consolidated into one `it`, many scenarios have no assertion).

---

## 1. plugin-manager:specd-plugin-type

Requirements: SpecdPlugin interface; PluginContext; isSpecdPlugin; manifest (schemaVersion 2, no pluginType, contributes map of maps); name rule; contribution id/address; configSchema subset; kind handler registry; lifecycles.

Implementation status

- SpecdPlugin interface: OK. `src/domain/types/specd-plugin.ts:32-68` (name, version, init, destroy, optional install/uninstall/contribution; no `type`, no `configSchema`).
- PluginContext {config, pluginConfig}: OK. `specd-plugin.ts:7-15`.
- isSpecdPlugin: OK. `specd-plugin.ts:105-115` (object, string name/version, isPluginName, init/destroy functions, optional hooks).
- Manifest schemaVersion 2 / pluginType rejected / contributes map-of-maps: OK. `src/infrastructure/loader/plugin-loader.ts:31-42` (`z.literal(2)`, `.strict()` rejects pluginType, `z.record(z.record(...))`).
- Plugin name regex: OK. `packages/core/src/domain/plugin-name.ts:2` identical to spec regex; used at plugin-loader.ts:34 and specd-plugin.ts:108.
- Contribution id regex, address build/parse: OK. `specd-plugin.ts:71-97` (parse requires exactly one dot, dot>0). Id regex enforced in loader `validateContributions` (plugin-loader.ts:316-319).
- Duplicate id across kinds: OK. plugin-loader.ts:320 `DuplicateContributionError`.
- configSchema subset: OK. `src/domain/services/plugin-config-schema.ts:7-96` (keyword whitelist, root type object, recursion on properties/items). Config without schema rejected: plugin-config-schema.ts:54-59.
- Kind handler registry: OK. `contribution-kind-handler.ts:26-44`; unknown kind -> `UnknownContributionKindError` plugin-loader.ts:305; handler without `activate` skipped register-plugins.ts:130.
- Lifecycles (install must not call init; init once per plugin in list order): OK (register-plugins.ts:108-117; install-plugin.ts has no init call).

Discrepancies (spec vs code; neither assumed authoritative)

1. `PluginInstallContext` (specd-plugin.ts:20-27) has `options?: object`; spec lists only `config` and `contributions` (options appear only in `AgentInstallContext`, per agent-plugin-type). Option A: update spec to include `options?` on base context (code is what install/uninstall/update actually forward). Option B: move `options` to AgentInstallContext only and narrow the use cases.
2. `install?` returns `Promise<unknown>` in code (specd-plugin.ts:52) vs `Promise<void>` in spec. Code needs `unknown` to carry `data` through InstallPluginOutput. Spec should be updated, or AgentPlugin-only result typing kept.
3. `ContributionKindHandler` has an extra `validatePlugin?(plugin, pluginName)` hook (contribution-kind-handler.ts:37) not in spec; it is how the agents rule "must implement install/uninstall" is enforced at load time. Spec should document it (or the rule be enforced elsewhere).
4. Spec-internal inconsistency: this spec lists `description` among required manifest fields ("`version`, `description`, `minCoreVersion`"), but plugin-loader spec and code make `description` optional (plugin-loader.ts:36). Code follows plugin-loader spec. Fix wording in one spec.
5. "Plugin names are validated in ... `cli plugins install`": cli install uses `isPluginName` (cli/src/commands/plugins/install.ts:183). OK.

Test coverage (test/domain/specd-plugin.spec.ts, types/is-specd-plugin.spec.ts, domain/plugin-config-schema.spec.ts, infrastructure/plugin-loader.spec.ts)

- Covered: isSpecdPlugin scoped/unscoped/non-function install/null/missing fields; address build and 0/2-dot parse failure; config schema defaults/strict; no-schema config rejection; unknown kind; unsupported keyword `$ref`; duplicate id across kinds.
- Untested scenarios: "Has required properties/no type/no configSchema" (type-level only); "Name and version sourced from manifest" (factory in plugin packages, not here); "Initialization with SpecdConfig" (only indirectly); "Other schemaVersion rejected" (plugin-loader.spec.ts:73/129 use schemaVersion 1 but only assert missing version/not imported, not a schemaVersion-specific assertion; schemaVersion 3 untested); "pluginType rejected" in isolation (only combined with schemaVersion:1 so it would fail even without the pluginType rule); "contributes.checks is an array" (untested; zod record on array not asserted); "Valid scoped names"/"Dot in scope or package"/"Uppercase" (no direct regex tests; only unscoped name); "Id containing a dot rejected" (no test; regex only); "Address format" OK; "Supported keywords accepted" partially (plugin-config-schema.spec); `oneOf` rejection untested; "Install-time-only kind" at runtime (only agents-only init test, register-plugins.spec.ts:274; no custom handler without activate); "Install does not call init" (install-plugin.spec.ts:71 for a no-hook plugin only); "Runtime calls init for every plugin... in list order" OK (register-plugins.spec.ts:65).

Counts: requirements 8 OK-impl / 0 missing; scenarios 28: OK-tested ~9, OK-impl-untested ~17, discrepancy items 4 (spec/code wording), untested ~19 (see above).

---

## 2. plugin-manager:plugin-loader

Implementation (`src/infrastructure/loader/plugin-loader.ts`)

- Load workflow steps 1-9: OK. Resolve (createResolvers 224-229, two require resolvers), read manifest (98-110), validate manifest before import (120-147 happens at line 78, import at line 80), contribution blocks (296-326), dynamic import (80), create() (85), isSpecdPlugin + contribution() requirement (157-181), name/version cross-check (165-170). Loader never calls init/install/destroy.
- Manifest schema: OK with deviation: `configSchema: z.unknown().optional()` (line 39) and validated separately by `assertSupportedConfigSchema` instead of `PluginConfigSchemaSubset` zod type in spec; behaviour matches (UnsupportedSchemaKeywordError).
- Error handling mapping: OK (PluginValidationError / Duplicate / UnknownKind / UnsupportedKeyword / InvalidPluginConfig for defaultConfig, lines 126, 130, 135, 305, 320).
- Factory: OK (create as named or default.create, line 334-351).

Discrepancies

1. `PluginLoaderOptions` (plugin-loader.ts:24-29) has extra optional `handlers`; spec says `{ config }` only. Also `create()` is called with `{ config }` only (line 85), consistent with spec. Extra handlers option is necessary for the kind-registry design; spec should add it.
2. Base-contract violation reports fixed fields `['name','version','init','destroy']` (line 163) regardless of which one failed; spec only requires PluginValidationError. A plugin with an invalid runtime name is indistinguishable. Minor; spec wording allows it.
3. Manifest `.strict()` rejects ANY unknown top-level field (not just pluginType); spec only mandates rejecting pluginType. Stricter than spec, could break plugins with extra metadata (e.g. `$schema`). Decide whether spec should say "unknown fields rejected".
4. Missing/unreadable `specd-plugin.json` throws PluginValidationError(['specd-plugin.json']) (103/108), spec silent; reasonable.
5. Loader executes `handler.validatePlugin` (172) which spec step 8 does not mention (see specd-plugin-type disc. 3).

Test coverage (infrastructure/plugin-loader.spec.ts)

- Covered: package not found; missing version; valid load; invalid manifest -> not imported (line 122); unscoped name before import (138); duplicate id (154); unknown kind, invalid block, `$ref`, bad defaultConfig (173, one combined test); runtime version mismatch + missing contribution accessor (236); no lifecycle call on load (282).
- Untested: "pluginType rejected" specifically (combined with schemaVersion 1 in missing-version test); "Valid manifest passes Zod" explicit scenario (covered by line 85); base-contract violation (plugin missing init/destroy -> PluginValidationError) not tested; "create factory receives config" (config passed) not asserted; default-export `create` variant untested; missing manifest file / invalid JSON untested; name mismatch (only version mismatch tested); `needsContribution` positive case (contribution accessor present) untested; packages found via second resolver untested.

Counts: scenarios 17: OK-tested 11, OK-untested 6; discrepancies 3 (strict manifest, handlers option, validatePlugin); missing tests ~6.

---

## 3. plugin-manager:register-plugins-use-case

Implementation: `src/application/use-cases/register-plugins.ts`, wrapper `src/infrastructure/loader/register-plugins.ts`.

- Signature: OK. Application function needs `loader` (required, line 20); infra wrapper (loader/register-plugins.ts:30-41) makes `loader` optional with `createPluginLoader` default, which is what the spec's `RegisterPluginsOptions.loader?` describes. The public export from package index is the infra wrapper (infrastructure/loader/index.ts) while `application/use-cases/index.ts` exports only the types; OK. No-plugin case returns noop dispose (62-64): OK.
- Registration order: OK. Duplicate check (66-72) -> load+validate all (77-87) -> init in order (108-117) -> activate by kind skipping handlers without activate (119-146) -> ONE disposer `registerDisposer('specd-plugins', dispose)` (154). Allowlist respected via `resolveContributions`.
- Selection/config validation: OK (resolvePluginConfig, resolveContributions, duplicates -> PluginValidationError).
- Destroy/isolation: OK-ish (91-105): reverse order, collects errors, throws `AggregateError` once, idempotent via `disposed` flag.
- Failure policy: OK with caveat (below).
- Bypass: OK. `packages/sdk/src/composition/host-context.ts:102` (`options?.plugins === false`), test sdk/test/composition/host-context.spec.ts:70.

Discrepancies

1. If `destroyReverse(initialized)` itself throws (AggregateError) while handling an init/activate failure (lines 112, 141, 148), the AggregateError propagates instead of `PluginInitError` naming the plugin, masking the original failure. Spec: "initialized plugins MUST be destroyed ... before the error propagates" and typed error naming the plugin. Option A: swallow/attach destroy errors and rethrow the original; Option B: spec states destroy errors win.
2. `disposed = true` is set before the loop; if dispose rejects once, later calls resolve silently (as spec's idempotent requirement). Fine, but errors are reported only on the first call; a caller who ignores the first rejection loses them. Acceptable.
3. Activation failure (handler.activate throws) is wrapped as `PluginInitError` (143) though spec only defines PluginInitError for throwing `init`. Spec silent; likely fine, document.
4. Handler kind duplicates: `mergeHandlers` throws `PluginValidationError('<handlers>', ['kind'])` (176) with a non-plugin name; spec silent (and conflicts with "every error names the plugin" constraint in plugin-errors). Also the same merge logic is duplicated in plugin-loader.ts:273-283 (code duplication).
5. Activation happens after ALL inits (119 loop after 108 loop); spec step order (2 then 3) agrees. A failure in plugin B activation destroys plugin A (init'd) — OK.
6. Spec constraint "Plugin code is imported only after manifest and config validated": the loader imports plugin code in `load()` (plugin-loader.ts:80) BEFORE `resolvePluginConfig` / `resolveContributions` run in register-plugins.ts:84-85. Manifest is validated first (inside load), but config/allowlist validation (the spec's "config") happens after import and `create()` of that plugin and of earlier plugins. Spec: "Load and validate every plugin (manifest, config, contribution allowlist) before running any init" - satisfied for init; but the Constraint "Plugin code is imported only after its manifest and config validated" is NOT strictly met. Option A: relax spec constraint to "manifest" only; Option B: split loader into manifest-read and import steps so config is checked first.

Test coverage (test/application/register-plugins.spec.ts)

- Covered: empty list (56); init in order + one disposer + reverse destroy + idempotent (65); partial init failure with prior destroyed + no disposer (101, only one prior plugin so reverse order not shown); invalid selection -> init not called (134); config without schema (153); defaults applied (172); activate receives only selected contributions (193); duplicate declaration (223); load failure -> no disposer (235); aggregated destroy errors + second dispose no-op (245); agents-only init (274).
- Untested: "Called before build" ordering relative to build; "Registration handle disposes plugins before any kernel exists" (partially via registration.dispose()); "Validation before any init" with invalid CONFIG on second plugin (test 134 covers selection, not config; 153 covers no-schema); "Config does not satisfy schema" -> InvalidPluginConfigError (no test with violated schema); "Destroy error isolation" asserting all destroys still ran and error reported after (test only checks AggregateError class, not that both destroys were called); init-failure destroy order b then a (only one prior plugin); typed error naming plugin for load failure asserted via message 'missing'; "Plugins disabled" tested only in sdk package (OK); `PluginInitError` instance check missing (uses toMatchObject on pluginName); activation failure path; builder.registerDisposer failure path (153-158); handler-kind duplicates.

Counts: scenarios 21: OK-tested 10, OK-untested/weak 10, discrepancy items 2 (error masking, import-before-config-validation) + 2 minor.

---

## 4. plugin-manager:install-plugin-use-case

Implementation: `src/application/use-cases/install-plugin.ts:58-83`.

- Input/Output shape: OK (lines 11-36, optional defaultConfig/data).
- Behavior 1-5: OK. loader.load, resolveContributions (UnknownContributionError), agents guard via isAgentPlugin (61-63), install() with context `{config, contributions, options?}` (64-75), result with defaultConfig (76-82); no init/destroy.
- Agent Initialization Phase: use case delegates to `plugin.install({config, contributions, options})` OK. Rendering/injection/refcount is in plugin-agent-_ packages (plugin-agent-_/test/install-skills.spec.ts mentions `specd-plugin:`/hook assets), not in plugin-manager.

Discrepancies

1. Error handling: spec says `PluginValidationError` when `install()` throws. Code rethrows any `SpecdError` unchanged (73) and wraps only non-SpecdErrors with `PluginValidationError(['install'])` (74). Scenario "Install failure is wrapped" holds only for plain Errors. Option A: spec clarified (SpecdErrors pass through); Option B: always wrap and keep cause. Also the original error is lost (no cause) in the wrapped error.
2. `PluginNotFoundError` when package cannot be resolved: delegated to loader; OK.
3. Agent-guard order: contributions are resolved (line 60) before the agent guard (61); spec order is the same (2 then 3). OK.
4. Spec says options "for agent plugins"; code forwards options for all plugins (harmless).

Test coverage (test/application/install-plugin.spec.ts)

- Covered: selected contributions installed (31); agents without hooks -> PluginValidationError (58); plugin without hook succeeds and init not called (71); defaultConfig returned (90); unknown contribution (104).
- Untested: "Plugin not found" (loader mocked; PluginNotFoundError propagation not asserted); "All contributions selected by default" a,b exact array (only empty/one); "Allowlist respected" exact `['a']`; "Install failure is wrapped" (no test with a throwing install); "no config file modified" not assertable here; the three "Agent Initialization Phase" scenarios (CLAUDE.md block, hook asset, AGENTS.md refcount on uninstall) are not in plugin-manager tests; they sit in plugin-agent-\* tests (not audited in depth; shared-file refcount scenarios belong to skills/plugin-agent specs rather than this use case spec - spec scoping smell).

Counts: scenarios 15: OK-tested 5, OK-untested 7 (+3 agent-phase scenarios outside package); discrepancy 1 (error wrapping).

---

## 5. plugin-manager:uninstall-plugin-use-case

Implementation: `src/application/use-cases/uninstall-plugin.ts:40-57`. Same structure as install: load, resolveContributions, agents guard, `plugin.uninstall?.(context)`, wrap non-SpecdError as `PluginValidationError(['uninstall'])`, returns void, no init/destroy. OK.

Discrepancies: same as install #1 (SpecdError passthrough vs "PluginValidationError when uninstall() throws").

Test coverage (test/application/uninstall-plugin.spec.ts, 1 test): covers only successful uninstall with `contributions: ['claude']` and context shape. Untested: not-agents-bucket plugin; plugin without uninstall hook; init not called; agents-declaration without uninstall -> PluginValidationError; uninstall failure wrapped; unknown contribution id; PluginNotFoundError; output void.

Counts: scenarios 8: OK-tested 2 (successful uninstall, loads via loader); OK-untested 6; discrepancy 1.

---

## 6. plugin-manager:update-plugin-use-case

Implementation: `src/application/use-cases/update-plugin.ts:55-79`. OK: load, resolve (UnknownContributionError for removed ids), agents guard, `install?.()` with selected ids, returns `{success, message, contributions, data?}` (no defaultConfig, matches spec). Idempotency: stateless, OK.

Discrepancies

1. Error wrapping same as install (SpecdError passthrough).
2. "An update MUST NOT activate a contribution that was not already selected: when contributions is omitted ... the CLI passes that allowlist." This is CLI behavior; use case with omitted `contributions` selects all declared ids (as spec's input comment says). Verify at CLI: packages/cli/src/commands/plugins/update.ts (not audited here).

Test coverage (test/application/update-plugin.spec.ts): covered "selection preserved + config not written" (17) and "selected id removed" (51). Untested: idempotency (two runs equal), agents-declaration guard, update failure wrapped, input/output shape, load via PluginLoader explicit assertion.

Counts: scenarios 8: OK-tested 3, OK-untested 4 (idempotency, guard, wrap, output shape), discrepancy 1.

---

## 7. plugin-manager:list-plugins-use-case

Implementation: `src/application/use-cases/list-plugins.ts:60-80`. OK: per-name load, `loaded` with plugin, manifest, `declaredContributionIds`; `PluginNotFoundError` -> `not_found`; any other error -> `error` with message; continues listing others. No init/install/destroy.

Discrepancy (minor): `pluginNames` is `readonly string[]` (spec `string[]`), output `readonly PluginListStatus[]`; compatible. `PluginListStatus` type name is extra exported type.

Test coverage (test/application/list-plugin.spec.ts, 1 test): loaded with contributions + error status for another plugin. Untested: `not_found` status (PluginNotFoundError mapping); "Invalid manifest is an error entry" specifically unscoped (uses generic PluginValidationError); input shape.

Counts: scenarios 6: OK-tested 3 (returns statuses, contributions, error status), OK-untested 3 (not_found, unscoped manifest via real loader, input array); discrepancies 0.

---

## 8. plugin-manager:load-plugin-use-case

Implementation: `src/application/use-cases/load-plugin.ts:33-35` simply `return this.loader.load(...)`; `LoadPluginOutput = LoadedPlugin`.

Discrepancies

1. Spec Output is a discriminated union `{plugin, manifest} | { error: PluginNotFoundError | PluginValidationError }` and scenario "Plugin not found -> returns { error: PluginNotFoundError }". Code never returns `{error}`; it throws (loader errors propagate). Option A: update spec to "throws typed errors" (also consistent with spec text that "other typed loader errors are propagated as thrown errors"). Option B: implement the union and catch the two errors. Consumers (cli plugins show/list) would need to be checked for which style they expect.
2. Behavior step 2 "validate the plugin implements the base SpecdPlugin contract": delegated to the loader (`isSpecdPlugin` in plugin-loader.ts:162), the use case itself does not re-validate. Equivalent with the real loader; with a custom/mock loader the guarantee is absent.

Test coverage (test/application/load-plugin.spec.ts, 1 test): covered "Plugin loaded" and loader call. Untested: "Plugin not found" scenario (it would currently fail if asserted as `{error}`), "No lifecycle calls", base-contract validation, input shape.

Counts: scenarios 5: OK-tested 2 (plugin loaded, loads via loader); discrepancy 1 (Plugin not found scenario contradicted by code); untested 2.

---

## 9. plugin-manager:plugin-errors

Implementation: `src/domain/errors/*.ts`. All 8 classes extend `SpecdError`, codes exactly match spec (DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD, PLUGIN_INIT_FAILED; existing PLUGIN_NOT_FOUND, PLUGIN_VALIDATION_ERROR). Messages contain the plugin name. `PluginInitError.cause` preserved (plugin-init-error.ts:20). `PluginValidationError.fields` is `readonly string[]` (spec `string[]`).

Discrepancies

1. `InvalidPluginConfigError` issue text for no-schema case is "config provided but plugin declares no configSchema" (plugin-config-schema.ts:57) vs spec comment "config given but no configSchema declared"; wording only.
2. `PluginInitError` message is only "Plugin 'x' failed during init" and omits the cause message; spec requires "actionable message"; the cause is available only via `.cause`. Consider appending the cause message.
3. Constraint "Every error raised while loading, validating or initializing a plugin MUST name the plugin" is violated by `mergeHandlers` (`'<handlers>'`, plugin-loader.ts:279 and register-plugins.ts:176) and by `parseContributionAddress`, which uses the address as pluginName (specd-plugin.ts:94).
4. Constraint about `LEGACY_CONFIG_FORMAT` / `UNSUPPORTED_CONFIG_VERSION` owned by core: not checked here (core responsibility).

Test coverage (test/domain/errors.spec.ts): one test checks codes of the 6 new errors, pluginName on two, cause on init, `kind`. Untested: PluginNotFoundError.pluginName, PluginValidationError.fields, that messages contain the plugin name, pluginName on remaining errors, contributionId/issues/keyword properties (partially), extends SpecdError.

Counts: scenarios 5 (+2 base req): OK-tested 2 (stable codes, init cause), OK-untested 3 (pluginName/fields/message), discrepancies 2 (message detail, `<handlers>` naming).

---

## 10. plugin-manager:plugin-repository-port

Implementation: `src/application/ports/plugin-repository.ts`: interface named `PluginRepository` (not `PluginRepositoryPort`), plus `AddPluginOptions`, `DeclaredPlugin` (readonly fields), methods addPlugin/removePlugin/listPlugins, no type/bucket. Shape matches spec.

Discrepancies

1. Name: spec `PluginRepositoryPort`, code `PluginRepository`. Cosmetic; align one.
2. "Implementation note: in the CLI this port is implemented via ConfigWriter" - no class implements `PluginRepository` anywhere outside plugin-manager (grep over packages found no usage). CLI uses `ConfigWriter` directly (cli/src/commands/plugins/\*.ts via `createConfigWriter`). Scenario "CLI implementation uses ConfigWriter" has no corresponding code. Option A: remove port + implementation note from spec (dead abstraction); Option B: add a CLI adapter implementing the port.
3. `DeclaredPlugin` is also redefined in cli (`cli/src/commands/plugins/get-declared-plugins.ts:6` `DeclaredPluginEntry`), duplicating the type.

Test coverage: none (interface only; no tests). Missing: all 5 scenarios untestable at runtime except type-level; "CLI implementation uses ConfigWriter" has no code to test.

Counts: scenarios 5: OK-impl 3 (has methods, addPlugin signature, removal/list shape by type only), untested 5, discrepancy 2 (name, no implementer).

---

## 11. plugin-manager:agent-plugin-type

Implementation: `src/domain/types/agent-plugin.ts`, `src/domain/handlers/agents-handler.ts`.

- AgentPlugin extends SpecdPlugin with required install/uninstall; AgentInstallContext extends PluginInstallContext with options: OK.
- Agents handler: OK. `kind: 'agents'`, blockSchema `z.record(idRegex, z.object({}).strict())` (accepts `{}`, rejects unknown fields), no `activate`, plus `validatePlugin` enforcing isAgentPlugin (agents-handler.ts:12-20).
- AgentInstallOptions / TemplateVariable / AgentInstallResult: OK; fields readonly (spec mutable arrays; compatible). `capabilities` identifiers mcp/agents/frontmatter are not defined as constants or validated in plugin-manager (just `readonly string[]`); contract is documentary.
- isAgentPlugin: OK (agent-plugin.ts, install and uninstall functions).
- Agent installation and fallback (target dir/shared.md): implemented in plugin-agent-\* and skills, not in plugin-manager; not auditable here.

Discrepancies

1. `AgentInstallOptions.skills/agents/capabilities` are `readonly string[]` vs spec `string[]`; harmless.
2. Spec says the handler is "registered by hosts that handle plugins ... so the loader accepts the agents kind"; code auto-includes `agentsContributionHandler` in both loader (`mergeHandlers`, plugin-loader.ts:276) and registerPlugins (register-plugins.ts:172); hosts do not register it. If a host passes its own `agents` handler, `mergeHandlers` throws `PluginValidationError('<handlers>')`. Spec wording should say built-in.
3. `AgentInstallContext.contributions` carries selected agents ids per spec; the code passes ALL selected contribution ids (any kind) from resolveContributions (install-plugin.ts:60), so in a plugin with mixed kinds `contributions` includes non-agent ids. Spec: "contributions carries the selected agents contribution ids". Option A: spec says "selected ids"; Option B: filter by kind for agent plugins.

Test coverage (domain/agents-handler.spec.ts, domain/types/is-agent-plugin.spec.ts)

- Covered: empty block accepted & no activate; unknown field rejected (at schema level, not through loader -> PluginValidationError); isAgentPlugin missing install -> false; accepts install+uninstall; recursive variables typing.
- Untested: "rejects plugin with install but no uninstall"; "Selected contributions are passed" (['claude']); "No runtime activation" via registerPlugins (only init-still-runs test); loader-level "Unknown field rejected -> PluginValidationError" (covered by bad-block loader test at plugin-loader.spec.ts:173); capability identifiers and variables.frontmatter/sharedFolder scenarios (contract/documentation scenarios, no code in this package); AgentInstallResult shape; agent install fallback scenarios (belongs to plugin-agent-\* / skills).

Counts: scenarios 17: OK-tested 5, OK-untested 4, contract/doc-only (not testable here) 8; discrepancies 2.

---

## Cross-spec / global contradictions

- specd-plugin-type "description" required vs plugin-loader "description" optional (see 1.4).
- plugin-errors constraint (all errors name plugin) vs `'<handlers>'` and address-as-plugin in PluginValidationError.
- register-plugins constraint (code imported only after config validated) vs plugin-loader workflow (import happens in load before config/allowlist checks).
- load-plugin-use-case output union vs plugin-loader / list-plugins behavior (errors thrown/caught): plugin-loader says errors are thrown; load-plugin spec says some are returned.
- install/uninstall/update error spec ("PluginValidationError when X throws") vs code passing through SpecdError subclasses; plugin-errors says typed errors catchable by type, so passthrough may be intended.
- plugin-repository-port implementation note vs actual CLI (uses ConfigWriter directly; no adapter).
- core:config spec path in Spec Dependencies uses `../../core/core/config/spec.md` in some specs and `../../core/config/spec.md` in register-plugins; one is a broken relative link (spec hygiene).
- Not checked against core kernel-builder spec beyond `builder.registerDisposer(name, fn)` usage (register-plugins.ts:154).

## Totals (approximate)

| Spec                   | OK-tested | OK-untested     | Discrepancy items | Untested/missing tests |
| ---------------------- | --------- | --------------- | ----------------- | ---------------------- |
| specd-plugin-type      | ~9        | ~17             | 4                 | ~19                    |
| plugin-loader          | 11        | 6               | 3                 | ~6                     |
| register-plugins       | 10        | 10              | 2 (+2 minor)      | ~10                    |
| install-plugin         | 5         | 7 (+3 external) | 1                 | ~8                     |
| uninstall-plugin       | 2         | 6               | 1                 | 6                      |
| update-plugin          | 3         | 4               | 1                 | 4                      |
| list-plugins           | 3         | 3               | 0                 | 3                      |
| load-plugin            | 2         | 1               | 1                 | 2                      |
| plugin-errors          | 2         | 3               | 2                 | 3                      |
| plugin-repository-port | 0         | 5 (type only)   | 2                 | 5                      |
| agent-plugin-type      | 5         | 4 (+8 doc-only) | 2                 | ~8                     |

Highest-priority findings: (1) LoadPlugin never returns `{error}`; (2) PluginRepositoryPort name and no CLI adapter; (3) plugin code imported before config/allowlist validation vs spec constraint; (4) SpecdError passthrough vs "wrapped as PluginValidationError"; (5) destroy failure during init rollback masks PluginInitError; (6) `AgentInstallContext.contributions` not filtered to agents; (7) test gaps: uninstall/update/list/load use cases have 1-2 tests each, no test for not_found, install failure wrapping, schemaVersion-specific rejection, destroy isolation assertions.

# Partial compliance audit: CLI plugin commands + host-context + SDK (change plugin-architecture)

Scope: cli:plugins-install, cli:plugins-uninstall, cli:plugins-update, cli:plugins-list, cli:plugins-show, cli:host-context, sdk:composition, sdk:host-context.
Method: merged spec-preview vs. code in packages/cli, packages/sdk (+ plugin-manager use cases read for delegated behaviour). Read-only. Tests were read, not executed.
Paths below are relative to repo root. CLI = packages/cli/src, tests = packages/cli/test.

Legend: OK = implementation matches spec; D = discrepancy (spec vs code, both readings given); U = implemented but no test asserts it.

---

## 1. cli:plugins-install (commands/plugins/install.ts)

Requirements: signature + name validation + `--contributions` (single plugin only); declaration source = `config.plugins` (no listPlugins); header `Installed plugins:`; already-installed warning ("already installed" ... "update"), no re-install; workflow InstallPlugin -> `createConfigWriter().addPlugin` (config only when defaultConfig, contributions only when flag), never `kernel.project.addPlugin`, never init; host with `plugins:false`; exit 1 on any failure but continue; JSON output.

Implementation status

- Signature/validation: OK. `install <plugin...>` + `--contributions` (install.ts:115-118); `isPluginName` check before any load (58-66); `--contributions` with !=1 plugin -> `cliError` usage error (128-130).
- Declaration source: OK. `getDeclaredPlugins(config)` reads `config.plugins` (52, get-declared-plugins.ts:21-23); no kernel/ConfigWriter listPlugins calls anywhere in plugins/\*.
- Display name: OK. install.ts:161 `Installed plugins:` (text mode only).
- Already-installed: OK. Message "X already installed; use 'specd plugins update'" to stderr, status `skipped`, no install, no config mutation (68-77). Exit code stays 0 (spec silent; reasonable).
- Workflow: OK. InstallPlugin.execute with optional contributions (80-84); addPlugin with `config` only if defaultConfig !== undefined, `contributions` only if flag (85-88). No kernel.project.addPlugin, no init call.
- Host bootstrap: OK. `resolveCliContext({ configPath, plugins:false })` (131-134).
- Exit code: OK. Loop continues on error, `CliExitError(1)` at end (144-146).
- Output/JSON: OK. `output(result, fmt)` emits `{plugins:[{name,status,detail}], hasErrors}`.

Discrepancies

- None substantive. Cosmetic: orphan JSDoc block at install.ts:170-175 ("Maps a plugin runtime type to the config bucket key") with no function below it; a leftover from the removed type-bucket logic. Code-quality only.
- Minor spec-vs-code note: empty `--contributions ""` yields `[]` (filter at 127), which is then passed through as an explicit empty allowlist; spec does not say whether this is a usage error. Spec gap, not a violation.

Test coverage (tests/commands/plugins.spec.ts)

- Covered: install + persisted declaration, `plugins:false` asserted (116-136, assertion at ~L135), unscoped name rejection and contributions+several plugins usage error (138), contributions + defaultConfig persisted (164), no `config` key when none (L134 `not.toHaveProperty('config')`), already-installed warning (192), JSON (205), exit 1 on failure (231).
- Missing tests (U): "Multiple plugin names" (both attempted); "does not call kernel.project.listPlugins / ConfigWriter.listPlugins" (not asserted; test mocks supply `listPlugins: vi.fn()` but never assert it was not called); header `Installed plugins:` text assertion; "Init is not called"; "Install works with a broken configured plugin" (only the `plugins:false` argument is asserted, not an end-to-end broken-plugin case); "continues processing remaining plugins" after a failure (231 checks exit only, to be verified).
  Counts: requirements 8 OK / 0 D; scenarios ~17: 17 implemented, ~9 explicitly tested, ~8 untested (multi-name, 2 declaration-source negatives, header, init-not-called, broken-plugin e2e, continue-after-failure, already-installed JSON/exit).

---

## 2. cli:plugins-uninstall (commands/plugins/uninstall.ts)

Requirements: positional plugins; load via LoadPlugin, resolve contributions from the `config.plugins` entry allowlist (all when absent), call UninstallPlugin, then `removePlugin`; no kernel.project.removePlugin; no type bucket; undeclared name -> per-name error w/o calling plugin; `plugins:false`; exit 1 on any failure, continue; output `uninstalled`/error; hook before config removal.

Implementation status

- Workflow: OK. `findDeclaredPlugin` (51) -> error `plugin 'x' is not declared in specd.yaml` before any plugin call (52-54); `UninstallPlugin.execute({pluginName, config, contributions?})` (55-61); then `writer.removePlugin` (62). Order uninstall-hook-then-remove satisfies the constraint. UninstallPlugin loads via the loader and passes `resolveContributions(...)` (all ids when allowlist undefined) to `plugin.uninstall?.()` (plugin-manager uninstall-plugin.ts:40-51).
- Literal reading: spec step 1 says "load the plugin via LoadPlugin use case"; command doesn't instantiate `LoadPlugin`, it relies on UninstallPlugin's internal `loader.load`. Behaviour is equivalent. Classified D (minor, wording): either update the spec to "load through UninstallPlugin/loader" or have the command call LoadPlugin (redundant second load). Recommend spec wording fix.
- Bootstrap `plugins:false`: OK (37-40). Exit code/continue: OK (69-81). Output: OK (`uninstalled`/`error`, JSON `{plugins:[...]}`).

Discrepancies: 1 minor (above).

Test coverage (plugins.spec.ts 291, 309)

- Covered: uninstall removes declaration (removePlugin called), JSON output.
- Missing (U): multiple plugins; failure -> exit 1 + continue; "hook called with selected contribution ids / allowlist honoured" (UninstallPlugin is mocked, execute args never asserted); non-agent (checks-only) plugin; undeclared plugin error and plugin not called; `plugins:false` for uninstall (asserted only for show/install); `kernel.project.removePlugin` not called.
  Counts: requirements 4 OK / 1 minor D; scenarios 7: 7 implemented, 2 tested, 5 untested (multi, exit/continue, allowlist, non-agent, undeclared) plus broken-plugin e2e.

---

## 3. cli:plugins-update (commands/plugins/update.ts)

Requirements: optional names; declaration source `config.plugins`; no names => all declared; named but undeclared => ERROR for that name; update with recorded allowlist; idempotent; does not mutate specd.yaml; no init; `plugins:false`; exit 1 if any plugin fails; statuses `updated|skipped|error`.

Implementation status

- Declaration source / update set: OK (46-52).
- Recorded selection: OK (71-77; `contributions` passed only if allowlist exists; UpdatePlugin resolves defaults; "extra not activated" holds because only selected ids are forwarded).
- No config mutation, no init: OK (no writer used; `configPath` computed but unused).
- `plugins:false`: OK (111-114). Exit code: OK (123-125).
- DISCREPANCY (undeclared plugin): update.ts:61-68 reports a name not in `config.plugins` as status `skipped`, does NOT set `hasErrors`, so exit code is 0. Spec ("Update behavior" + scenario "Undeclared plugin") says "an error is reported for that name", and exit-code requirement says exit 1 if any plugin fails.
  - If spec is right: change to `status:'error'`, `hasErrors = true` (consistent with uninstall, which errors on undeclared).
  - If code is right (skip is intentional so `update a b` is tolerant): amend spec to say "reported as `skipped` with a message, exit 0", and note the verify scenario. Note the spec's own status vocabulary includes `skipped`, which makes the code reading plausible, but uninstall treats the same case as an error, so the sibling specs are inconsistent.

Test coverage (plugins-update.spec.ts)

- Covered: update all (90), update specific (100), JSON shape (~115).
- Missing (U): declaration source negatives (listPlugins not called); exit 1 on failure + continue; idempotent / yaml untouched; recorded allowlist preserved (UpdatePlugin args never asserted); undeclared plugin (this would have caught the discrepancy); `plugins:false` for update.
  Counts: requirements 6 OK / 1 D; scenarios 10: 10 implemented (undeclared = D), 3 tested, 7 untested.

---

## 4. cli:plugins-list (commands/plugins/list.ts)

Requirements: no `--type`; enumerate `config.plugins` (flat), `plugins:false`; status installed/not_found/error; output name, contributions (declared ids + which selected), version, status; read-only; JSON.

Implementation status

- Signature: OK, no `--type` (32-38).
- Declaration source + bootstrap: OK (42-46).
- Status mapping: OK (59-80): loaded->installed, not_found, else error with `detail`.
- Output: JSON OK (`contributions:{declared,selected}`, version, status, detail; 112).
- DISCREPANCY (text output): text row prints only the SELECTED ids in brackets (107-108), not the declared-but-unselected ids. Spec "Output format" + scenario "Allowlist shown" ("`a` shown as selected and `b` as available but not selected") is satisfied only in JSON/toon, not in text.
  - If spec is right: render e.g. `[a] (available: b)` in text.
  - If code is right: relax spec to "in machine formats" or say text shows only selection.
- Minor: when no plugins declared, text prints `no plugins declared` and no header; header "Installed plugins:" used for declared list (not required by spec, though list shows not_found/error rows under an "Installed" header; wording only).
- Edge: for `not_found`/`error` rows `declared` ids come from `item.contributions ?? []`, so for an unloadable plugin the declared list is empty and `selected` falls back to `[]` (or the allowlist). Fine.
- Read-only: OK. Does not call init (uses ListPlugins via loader).

Test coverage (plugins.spec.ts 245, 258)

- Covered: lists declared plugins with status; empty list.
- Missing (U): not_found / error statuses; allowlist shown (selected vs available); mixed agents+checks plugins; `plugins:false` for list (not asserted); no listPlugins calls; text output includes version and contributions.
  Counts: requirements 4 OK / 1 D (text rendering); scenarios 9: 8 implemented + 1 D, 2 tested, 7 untested.

---

## 5. cli:plugins-show (commands/plugins/show.ts)

Requirements: single positional; display name, version, every contribution as kind + id + address `<name>.<id>`, configSchema + defaultConfig (if any), capabilities (when plugin contributes agents); JSON; `plugins:false`, no init; load failure -> error + exit 1; read-only.

Implementation status

- Bootstrap `plugins:false` (27-30), no init (LoadPlugin only): OK.
- Contributions with kind/id/address via `buildContributionAddress` (34-40): OK in JSON. Text prints only addresses (55) and drops kind/id/schema.
- DISCREPANCY (text output): text mode omits `configSchema` / `defaultConfig` and per-contribution kind (51-58); JSON includes them (42-49). Spec says "MUST display" them; scenario "Contributions shown with addresses" requires kind `checks`, id `audit` and address. If spec is right, text must print them; if code is right, spec should say JSON carries the full detail and text is a summary.
- DISCREPANCY (capabilities): `buildCapabilities` (74-83) always returns `['init','destroy', +install, +uninstall]` regardless of whether the plugin contributes agents. Spec describes capabilities as shown "when the plugin contributes agents" (agent capabilities), and also says init must not be called. Code reports lifecycle hooks, always, including for checks-only plugins. If spec is right: gate on `manifest.contributes.agents` and report agent capabilities; if code is right: spec should define capabilities as the plugin lifecycle hook list. Also listing `init` as a "capability" is semantically odd given show never runs it.
- Error handling: relies on `handleError` after LoadPlugin throws (62-64); exit 1 presumably via handleError (not verified in this audit).

Test coverage (plugins.spec.ts 268)

- Covered: show metadata JSON (name, capabilities contains install, contributions with addresses, `plugins:false`).
- Missing (U): plugin-not-found -> error + exit 1; configSchema/defaultConfig output; text-mode output; checks-only plugin (`@acme/x.audit` scenario with kind `checks`); capabilities only for agent plugins.
  Counts: requirements 3 OK-ish / 2 D (text completeness, capabilities semantics); scenarios 4: 4 implemented (1 partially), 1-2 tested, 2-3 untested.

---

## 6. cli:host-context (helpers/cli-context.ts, cli-host.ts, cli-cleanup.ts, cli-context-types.ts, graph-index-task.ts, run.ts, cli-signals.ts)

Status per requirement

- resolveCliContext delegates: OK. `openCliHost({configPath, options:{kernel: buildCliKernelOptions(...), plugins?}})` (cli-context.ts:91-97) -> `openSpecdHost` (cli-host.ts:42). Default plugins enabled (flag omitted when undefined, so SDK default true). Warnings from `config.warnings`, emitted once per call (99-103), no top-level warnings field.
  - Wording nuance: spec says SDK receives `kernelOptions`; the SDK input field is `options.kernel`. Spec text uses the old name; code is consistent with sdk:host-context (`options?.kernel`). Spec wording drift only.
- Kernel options preservation: OK (verbosity, TTY format, onLog callback destination at cli-context.ts:44-71).
- Host bootstrap entry point: OK. Only `cli-host.ts` and `graph-index-task.ts` call `openSpecdHost/createSdkContext`; no `resolveSdkHostContext`, no hand-built host (grep over src confirmed).
- Host-opening helper: OK. Overloaded `openCliHost`, forwards input unchanged, registers `host.dispose` AFTER successful open (a rejecting open registers nothing).
- CliContext exposes dispose: OK (cli-context-types.ts: extends SdkHostContext + config + configFilePath).
- Cleanup registry: OK (cli-cleanup.ts): reverse order, memoized promise, failures isolated, `warning: cleanup failed: ...` on stderr, late registrations run immediately (fire and forget). Triggered from run.ts:73 and cli-signals.ts:29.
- Graph index worker: OK. `plugins:false` on both branches, `finally { await host.dispose() }` (graph-index-task.ts:62-96). Does not use cleanup registry.
- CLI runtime deps: OK. package.json lists `@specd/sdk` and no `@specd/core` / `@specd/code-graph`. (plugin-\* , schema-std, plugin-manager deps are explicitly allowed.)
- `plugins: false` in management commands: install, uninstall, update, list, show all pass it. `project update` is listed by the spec as a plugins:false command; NOT verified here (out of file scope; check packages/cli/src/commands/project/update.ts).

Discrepancies: 0 substantive; 1 wording (`kernelOptions` vs `options.kernel`).

Test coverage

- Covered: cli-context.spec.ts (verbosity -> trace, `plugins:false` forwarded, warnings from config / once / none when empty, cleanup release, source scan for forbidden bootstrap + no hand-built host + helper file removed); cli-host.spec.ts (both forms, registers disposal, forwards input unchanged, failed open registers nothing); cli-cleanup.spec.ts (reverse order, idempotent/concurrent, failure isolation, late registration + late failure warning, AggregateError lines); run-host-release.spec.ts (host released although command never disposes); graph-index-task.spec.ts (dispose on success / failure, `plugins:false` at line 39).
- Missing (U): "Plugins enabled by default" (no test that `plugins` key is absent / true when not passed); "Optional onLog callback wired" (not seen); CLI package.json deps scenario (no test); worker "broken plugin does not fail indexing" only indirectly; `dispose` called twice releases once is a mock (acknowledged in the test comment, contract belongs to SDK).
  Counts: requirements 8 OK / 0 D; scenarios ~28: 28 implemented, ~24 tested, ~4 untested.

---

## 7. sdk:composition (packages/sdk)

- Package identity: OK. deps = core, code-graph, plugin-manager only (package.json:14-18); test package-boundary.spec.ts + composition.spec.ts. "plugin-manager does not depend on sdk" scenario has no explicit test (U).
- Layer structure: OK. src has composition/, orchestration/, presentation/, shared/, domain/ (domain holds only `InvalidProviderLifecycleError`), no infrastructure. Built `exports["."]` -> dist/index.js + d.ts (package.json:18-23). No test for "src/shared has no subpath" beyond barrel suites (U).
- Public barrel: mostly OK. `src/index.ts` has no `export * from '@specd/core'` (uses `export * from './core-reexports.js'`, index.ts:34); `./ports` and `./extensions` subpaths re-export core subpaths (ports.ts, extensions.ts; package.json:24-31); `SDK_VERSION` exported; removed Save/Update/InvalidateSpecMetadata and PersistSpecMetadata are absent (grep core-reexports: 0 matches); Materialize/Get/Regenerate/InitializePersisted present. Lock helpers (acquireGraphIndexLock, etc.) are absent.
  - Spec drift candidate (Discrepancy, minor): spec says the root barrel MUST NOT export "internal composition helpers" and lists a closed set of code-graph exports; index.ts also exports `createCodeGraphProvider`, `createIndexProjectGraph`, `DEFAULT_HOTSPOT_KINDS`, `computeWorkspaceFingerprint`, `computeRootFingerprint`, `serializeFingerprintMap`, `GraphProviderStaleError`, `CODE_GRAPH_VERSION`, many resolver/result types, `InvalidProviderLifecycleError`. Most are justified by the later requirements (implementation review types, worker contracts) and by CLI needing to drop direct code-graph imports. Either the spec's list should be broadened to "all symbols CLI/MCP need" or the extras trimmed. Not a hard violation of the explicit "MUST NOT" list.
  - Also `isPluginName`, `createConfigWriter`, `LegacyConfigFormatError` etc. are exported (barrel.spec lines 46-52) via core-reexports; the spec bullet "Explicit re-exports from @specd/core (bootstrap, ... )" covers this; fine.
- Import policy / SDK_VERSION: OK (barrel.spec L33; CLI deps verified above).
- Implementation review orchestration: OK (`buildImplementationReview` + types, index.ts:19-27).
- Spec Dependencies listing `plugin-manager:register-plugins-use-case`: honoured by createSdkContext.
- Verify scenario "SDK exports handler contracts for plugin hosts": spec text says `ContributionKindHandler` and `SdkContextOptions` available; code exports both (types), tests only check `SdkContextOptions` type use (composition.spec.ts:20-24), no runtime check possible for types (U-ish).

Test coverage: barrel.spec.ts covers export-star check, factories, removed metadata APIs, lock helper absence, built declarations via publish-shaped consumer, SDK_VERSION; composition.spec.ts / package-boundary.spec.ts cover dependency scenarios.
Missing (U): "Dependency graph stays acyclic" (plugin-manager not depending on sdk), "SDK source tree keeps infrastructure out" (no directory assertion), "`@specd/sdk/ports` resolves same contract as core/ports" (only runtime re-export; types), PersistSpecMetadata absence not asserted explicitly.
Counts: requirements 8 OK / 1 minor D (barrel extras vs closed list); scenarios ~21: 21 implemented, ~14 tested, ~5-7 untested.

---

## 8. sdk:host-context (packages/sdk/src/composition/host-context.ts)

- SdkHostContext shape: OK (28-38; no `config` field; spread `kernel, createGraphProvider, dispose, [Symbol.asyncDispose]`).
- createSdkContext: OK. Builder from `config, options?.kernel` (100); `registerPlugins(builder, config, {handlers: options?.pluginHandlers ?? []})` awaited before `builder.build()` unless `plugins === false` (101-107); plugin-manager adds its built-in agents handler (register-plugins.ts mergeHandlers); `createGraphProvider` closes over same `config` and `options?.graph` (115); `dispose` = `kernel.dispose()`, asyncDispose same function (112-117). If `build()` fails the registration is disposed (109), then error rethrown (idempotent with the registered kernel disposer due to `disposed` flag).
  - Failure semantic: plugin registration failure rejects `createSdkContext` with typed error naming the plugin (PluginInitError wrapping, plugin-manager register-plugins.ts:107-115) and destroys already-initialized plugins in reverse: OK (plugin-manager).
- openSpecdHost: OK. Mixed `configPath`+`startDir` rejected before loader creation (135-137), forced mode vs discovery vs cwd (139-146), `Promise.all([load, resolvePath])`, `allowBootstrapFallback` only on ConfigNotFoundError, never for explicit configPath (152-163), forwards `input.options` to createSdkContext (164), `{config, configFilePath, ...ctx}`, warnings stay on `config.warnings`.
  - Minor: mixed-input error is a plain `Error`, not a typed error (spec only requires failure with a message telling the caller to choose one). OK.
  - Minor: with bootstrap fallback, `plugins` still default-enabled but synthetic config has no plugins; fine.
- Host disposal: OK. dispose delegates to kernel; graph providers not closed; no API wraps foreign kernel (no such export; `createSdkContext` builds its own kernel). `OpenSpecdHostResult` carries disposal members through spread.
- Config mutation boundary: OK. No write methods on context.

Test coverage (sdk/test/composition/host-context.spec.ts, mock-based)

- Covered: same config to kernel builder + provider factory, register-before-build order (assertion at ~L66-68), `plugins:false` skip, handlers forwarded + disposal on build failure, graph options forwarded, distinct providers, discovery/forced/startDir, mixed rejection, bootstrap fallback + explicit config no fallback, warnings preserved and not duplicated, shape without config / no write methods, dispose delegation and alias, shared promise on repeated calls, `await using`, spread carries members, providers not closed, no foreign-kernel API.
- Covered elsewhere: reverse destroy order, failing init destroys prior plugins (plugin-manager/test/application/register-plugins.spec.ts:65,101,245).
- Missing at SDK level (U): "Plugins enabled by default" as a standalone scenario (implicitly L58 `registerPlugins` toHaveBeenCalled); "Broken plugin fails context creation with PluginInitError naming the plugin" (SDK-level, mocked registerPlugins never rejects; covered only in plugin-manager); "dispose destroys plugins in reverse order" through a real host (only plugin-manager level); "await using" with the real kernel disposers.
  Counts: requirements 5 OK / 0 D; scenarios 31: 31 implemented, ~27 tested directly, ~4 covered only indirectly/other package.

---

## Cross-spec / global-spec notes

1. cli:plugins-update vs cli:plugins-uninstall inconsistency: an undeclared name is an error (exit 1) in uninstall and in update's spec text, but `skipped`/exit 0 in update's code. Recommend aligning one way across both.
2. cli:plugins-show spec "Capabilities (when the plugin contributes agents)" vs code listing lifecycle hooks for every plugin; also the shared `plugin-manager:specd-plugin-type` model (flat contributions, no type) no longer has an "agent plugin" concept at the manifest level besides `contributes.agents`, so the spec phrase needs clarifying.
3. cli:plugins-install/uninstall/update/list/show all cite `cli:host-context` for `plugins:false`; host-context's "Commands that manage plugins (... `project update`)" list includes `project update`, which was not verified in this audit.
4. cli:host-context says `kernelOptions`; sdk:host-context says `options.kernel`. Pick one name in the spec (code follows sdk).
5. No contradiction with sdk:composition's dependency rules found: cli depends on sdk only among core/code-graph/sdk; it also depends directly on `@specd/plugin-manager` (allowed by cli:host-context, "Plugin and schema dependencies are unaffected").
6. Stale artifact: install.ts:170-175 orphan JSDoc; and `configPath` computed but unused in update.ts:115 (passed to `updatePluginsWithKernel` input, never read). Both leftovers of removed behaviours; harmless but indicate cleanup.

## Summary table

| Spec                  | Reqs OK/D   | Scenarios total / tested / untested | Key discrepancies                                                         |
| --------------------- | ----------- | ----------------------------------- | ------------------------------------------------------------------------- |
| cli:plugins-install   | 8 / 0       | 17 / ~9 / ~8                        | none (orphan JSDoc)                                                       |
| cli:plugins-uninstall | 4 / 1 minor | 7 / 2 / 5                           | LoadPlugin wording                                                        |
| cli:plugins-update    | 6 / 1       | 10 / 3 / 7                          | undeclared name = `skipped`, exit 0 (spec: error)                         |
| cli:plugins-list      | 4 / 1       | 9 / 2 / 7                           | text omits non-selected declared contributions                            |
| cli:plugins-show      | 3 / 2       | 4 / 1-2 / 2-3                       | text omits kind/schema/defaultConfig; capabilities always lifecycle hooks |
| cli:host-context      | 8 / 0       | ~28 / ~24 / ~4                      | wording (`kernelOptions`); `project update` plugins:false not checked     |
| sdk:composition       | 8 / 1 minor | ~21 / ~14 / ~6                      | barrel exports more than the listed set                                   |
| sdk:host-context      | 5 / 0       | 31 / ~27 / ~4                       | none                                                                      |

# Partial audit: plugin-agent-\* specs (change plugin-architecture)

Scope: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent (merged via spec-preview) vs packages/plugin-agent-\* and plugin-manager:agent-plugin-type.
Legend: OK / DISC (discrepancy) / UNTESTED (implemented, no test asserts it). Neither spec nor code is assumed correct.

## Cross-cutting findings (apply to all 5 plugins)

### X1. Spec self-contradiction on `type` discriminator (DISC, spec-vs-spec, spec-vs-dependency)

- Every spec's "Factory export" says: "The `type` field MUST remain hardcoded as `'agent'`" (claude/copilot/codex/opencode/standard). Claude/opencode/standard "Domain layer" repeats "The `type` getter MUST return `'agent'`". Copilot and Codex "Plugin runtime contract" scenario: "returned plugin has `type: 'agent'`".
- Every verify.md "No type discriminator" scenario: "returned plugin has no `type` property".
- Dependency plugin-manager:agent-plugin-type: "Whether a plugin is an agent plugin is determined by its manifest declaring `contributes.agents`, not by a `type` field".
- Code: no `type` getter in any plugin (e.g. packages/plugin-agent-claude/src/domain/types/claude-plugin.ts:30-80). Tests assert `not.toHaveProperty('type')` (claude-plugin.spec.ts:19, codex-plugin.spec.ts:18, opencode-plugin.spec.ts:18, agent-standard-plugin.spec.ts:18, copilot-plugin.spec.ts presumably same).
- Resolution options: (a) spec is stale -> remove the "type hardcoded" sentences and the `type: 'agent'` scenarios (code + dependency spec + "No type discriminator" scenarios agree); (b) the spec is right -> code must add a `type` getter, but that contradicts agent-plugin-type and its own verify scenarios. Recommend (a).

### X2. Prompt-block injection contract: spec vs code (DISC) - codex, opencode, standard (and claude/copilot wording)

- Codex/opencode/standard spec: `injectSpecdBlock(agentsMdPath, prompt)` with NO tag; `install()` MUST call `removeSpecdBlock(agentsMdPath, "<id>")` to purge legacy marker; `uninstall()` MUST call `removeSpecdBlock(path, "<id>")` THEN `removeSpecdBlock(path)` (base block). Scenarios: AGENTS.md contains `<!-- <specd> -->` base block; legacy marker removed on install.
- Code:
  - codex install: `injectSpecdBlock(agentsMdPath, prompt, 'codex')` (packages/plugin-agent-codex/src/application/use-cases/install-skills.ts ~line 139); NO `removeSpecdBlock` on install; uninstall only `removeSpecdBlock(path,'codex')` (uninstall-skills.ts ~line 59) with comment "reference-counted block manager removes block when 0 agents remain".
  - opencode: install does `removeSpecdBlock(path,'opencode')` then `injectSpecdBlock(path, prompt, 'opencode')` (install-skills.ts ~line 160-162); uninstall only `removeSpecdBlock(path,'opencode')`.
  - standard: `injectSpecdBlock(.., 'standard')` (install-skills.ts ~line 150); no legacy purge; uninstall only `removeSpecdBlock(path,'standard')`.
  - claude: `injectSpecdBlock(CLAUDE.md, prompt, 'claude')`; copilot: `injectSpecdBlock(.., 'copilot')`; claude spec says "only the base `<!-- <specd> -->` block is injected (no plugin-specific marker block)".
- Tests encode the code behaviour, i.e. a different marker format: `<!-- <specd agents="claude"> -->` (claude install-skills.spec.ts:~330), `agents="copilot"` (copilot spec:305), `agents="codex"` (codex:287), `agents="opencode"` (opencode:374), `agents="standard"` (standard:344). None asserts `<!-- <specd> -->` literally, and no test seeds a legacy `<!-- <specd-plugin:X> -->` block.
- Interpretation A (code is right): a newer reference-counted block manager in @specd/skills tags the block with the agent list (`<specd agents="...">`); specs (claude, copilot, codex, opencode, standard "Prompt Injection" + the legacy-purge/two-step-uninstall scenarios) are stale and should be rewritten to the ref-counted model. Evidence for A: code comments in uninstall-skills.ts, uniform tag across all 5 plugins, all tests agree.
- Interpretation B (spec is right): code should call the untagged API, purge the legacy marker on install, and remove the base block on uninstall. This would break shared-AGENTS.md semantic for codex+opencode+standard (the first uninstall would remove the block for the others) - the spec's two-step uninstall is unsafe under shared files.
- Also: uninstall with a skills/agents FILTER returns early in all 5 plugins before removing the prompt block (spec says `uninstall()` removes it; scenarios only cover unfiltered, so ambiguous).

### X3. `agents` capability fallback not implemented as conditional (DISC/UNTESTED) - claude, codex, opencode

- Specs (claude Application layer #8, codex #11, opencode #8; scenarios "Fallback to shared location when agents capability is missing" and dependency agent-plugin-type "Agent installation and fallback"): if `agents` capability is missing, install agents next to shared.md.
- Code: capabilities are a hard-coded literal including `agents` (claude install-skills.ts:64, codex ~:63, opencode ~:62), so the branch can never trigger; no code path writes an agent into sharedDir in claude/codex/opencode. Only standard (no `agents` capability) always writes agents to sharedDir (standard install-skills.ts ~line 118 `itemTargetDir = sharedDir`), and copilot declares `agents`.
- Options: spec is describing a generic contract that these plugins satisfy vacuously (capability always present) -> scenario is not applicable, should be rewritten/removed for fixed-capability plugins; or code should honour `options.capabilities` (not done; plugin ignores `options.capabilities` input).
- Tests: none for any of the 3 plugins (UNTESTED).

### X4. `create` signature (minor DISC)

- Specs: `create(options: PluginLoaderOptions): AgentPlugin`. Code: `async create(_options): Promise<AgentPlugin>` in all 5 index.ts. Likely loader awaits (not verified here; see plugin-manager:plugin-loader). Spec text should say `Promise<AgentPlugin>` or the code is wrong. Low risk.

### X5. Legacy uninstall leftovers (code quirk, not in spec)

- claude/codex/opencode unfiltered uninstall removes `<sharedDir>/<agent>.agent.md` and `shared.md` individually then `rm(sharedDir)` (non-recursive; fails silently if user files exist). Spec says "the resolved sharedFolder location is removed" AND "MUST NOT remove unrelated files". Code resolves the tension by non-recursive rmdir (user files preserved); copilot uses `rm(sharedDir,{recursive:true})` which would delete user files in the shared folder (see copilot D2). Test claude "non-specd user files in sharedFolder" covers only claude.

### X6. Agent-frontmatter coverage (UNTESTED, all 5)

Agent tests mock `getBundle` and return fixed content, so assertions only verify the _variables passed_ (`variables.frontmatter`) and that the file exists with the prompt; none verifies that YAML/TOML frontmatter really prepends the system prompt in the written file (spec: "Prepend the rendered system prompt with the generated YAML frontmatter"). That rendering is in @specd/skills (outside this partial).

---

## 1. plugin-agent-claude:plugin-agent

Requirements summary: factory; manifest v2 `agents.claude`; domain layer (claude-plugin.ts, frontmatter.ts, frontmatter/); Frontmatter type (14 fields); InstallSkills (caps `['mcp','agents','frontmatter']`, ResolveBundle, sharedFolder, agent sub-mapping tools string + model); Frontmatter injection; Install location (.claude/skills, .claude/agents); Prompt Injection (CLAUDE.md); Uninstall; Fast-track install; Manual-only fast-track.

Implementation status:

- Factory/manifest: OK. packages/plugin-agent-claude/src/index.ts:11-55 (own dir then parent), specd-plugin.json (schemaVersion 2, no pluginType, agents.claude).
- Domain layer: OK (files live under src/domain/types/ and src/domain/frontmatter/index.ts; spec gives names only).
- Frontmatter type: OK, all 14 fields (src/domain/types/frontmatter.ts:1-74). Scenario "unsupported key excluded": type-level only (no runtime filtering).
- Application layer: OK. ResolveBundle (install-skills.ts:~95), literal caps (:64), sharedFolder only passed through if user supplied, no getBundle direct call, no buildCapabilities. Agent mapping: `tools` string from `allowed_tools` (line ~78; `.split(', ').join(', ')` is a no-op), `model` only if present (none of the shipped agent entries define `model`).
- Install location: OK (.claude/skills/<n>/, .claude/agents/<n>.md, default sharedFolder `<configPath>/skills/shared`, shared-folder.ts:51-53). No SKILL.md written in shared dir by plugin (depends on bundle).
- Prompt Injection: DISC (X2): tag 'claude' used; spec says no plugin-specific marker. `extraInstructions` not used (MAY).
- Uninstall: OK for filter/unfiltered/unrelated preserved (uninstall-skills.ts). Minor: sharedDir removal is non-recursive rmdir after deleting shared.md and agent.agent.md.
- Fast-track install and manual-only: OK. frontmatter/index.ts has `disable_model_invocation: true` and "Manual-only ... /specd-fasttrack" description. "No static or unsupported frontmatter fields": entry has only name, description, disable_model_invocation.

Discrepancies: X1 (type), X2 (marker), X3 (agents fallback never reachable), X4.

Scenario coverage (test/install-skills.spec.ts, test/domain/types/claude-plugin.spec.ts):

- Exports create function: OK (implicit via import).
- Factory reads manifest name/version: UNTESTED (claude-plugin.spec.ts uses constructor directly with '0.0.1'; create() with manifest version never asserted).
- No type discriminator: OK (claude-plugin.spec.ts:19).
- Manifest declares agents contribution: OK (claude-plugin.spec.ts:33).
- Install receives context: OK (claude-plugin.spec.ts:21; forwards config+options).
- Install emits Claude frontmatter via skills rendering: OK/partial (mock bundle supplies frontmatter; test checks `description:` present; install-skills.spec.ts:~140).
- Shared files no frontmatter: OK (:~176).
- Installs to .claude/skills + sharedFolder default: OK (:~120-180).
- Shared dir has no SKILL.md: UNTESTED.
- Installs agents to categorized dir (tools string, model): partial. Asserts `variables.frontmatter.tools` string (:~255); `model` never asserted (no agent defines it); file location asserted (:~272).
- Fallback when agents capability missing: UNTESTED / not implemented (X3).
- CLAUDE.md block written/removed: OK but asserts `<specd agents="claude">` (DISC with spec text X2).
- Uninstall selected skill dirs keeps shared: OK (:~165). Without filter removes managed + shared, keeps user skills: OK (:~172).
- Uninstall selected agent files (agents filter): UNTESTED. Uninstall all managed agents + keeps unrelated user agents: UNTESTED (only user _skill_ and shared-dir user files tested).
- Domain layer contains claude-plugin.ts / frontmatter.ts: UNTESTED (structural; trivially true).
- Frontmatter values cover supported metadata / unsupported excluded: UNTESTED (no test on type; compile-time only).
- InstallSkills passes Claude values / only Claude caps / ResolveBundle: OK for fasttrack (:~157-170 asserts capabilities and variables.frontmatter); getBundle spy is the underlying call through ResolveBundle.
- Shared files to sharedFolder: OK.
- Does not call getBundle directly: UNTESTED (review-only scenario; code satisfies).
- Default Claude install includes fast-track (+ journal contract): OK (:~150-156).
- Installing fast-track for Claude (manual-only, disable_model_invocation true): OK (:~160-170).

Counts: 29 scenarios. OK 15, DISC 2 (marker, +type spec contradiction counted separately in X1), UNTESTED/gap 10 (factory version, SKILL.md in shared, model, fallback, agents-selective uninstall, agents-unfiltered uninstall, domain files, frontmatter-cover, unsupported-key exclusion, no-getBundle-direct) plus 2 partial.

## 2. plugin-agent-copilot:plugin-agent

Requirements: factory; manifest `agents.copilot`; runtime contract; skill installation (caps `['frontmatter','agents']`, ResolveBundle, skills -> .github/skills, agents -> .github/agents/<n>.agent.md with `tools` YAML list); frontmatter field contract (name, description, license, allowed-tools, user-invocable, disable-model-invocation); install location; prompt injection (.github/copilot-instructions.md); uninstall; fast-track install; manual-only.

Implementation status:

- Factory/manifest: OK (src/index.ts, specd-plugin.json).
- Capabilities `['frontmatter','agents']`: OK (install-skills.ts:64) - note differs in order only.
- Agent mapping: OK. `tools` is a string[] derived from `allowed-tools` split on ',' (install-skills.ts:~77-90); `.agent.md` suffix OK; writes to .github/agents.
- Frontmatter type: OK, exactly the 6 spec fields (src/domain/types/frontmatter.ts: name, description, license, allowed-tools(string|string[]), user-invocable, disable-model-invocation).
- Fast-track: OK; frontmatter entry has name, description, `'disable-model-invocation': true` (frontmatter/index.ts:15-20). Specs says allowed-tools not required.
- Install location: OK.
- Prompt injection: `injectSpecdBlock(.github/copilot-instructions.md, prompt, 'copilot')` - spec says without tag/marker discussion (spec only requires injectSpecdBlock and `<!-- <specd> -->` block) -> DISC X2 (minor; Copilot spec doesn't forbid tag but scenario expects `<!-- <specd> -->` and test asserts `<specd agents="copilot">`).
- Uninstall: DISC D2 below.

Discrepancies:

- D1: X1 (spec says `type:'agent'` in Runtime contract scenario and "No type discriminator" in same verify.md).
- D2: unfiltered uninstall does `rm(sharedDir,{recursive:true,force:true})` (uninstall-skills.ts ~line 50) which deletes non-specd user files placed in sharedFolder. Spec: "the resolved sharedFolder location is removed" AND "MUST NOT remove unrelated directories or files under .github/skills or .github/agents" (shared folder itself not in the protected list). So code matches the letter of the spec; claude/codex/opencode/standard behave differently (preserve user files). Inconsistent across plugins; decide which is intended (spec for claude says "resolved sharedFolder location is removed" too). Option A: copilot is right and others should be recursive; Option B: others are right (safer) and copilot should be non-recursive.
- D3: X2 tag.
- D4: `tools` source: agents' `allowed-tools` strings in copilot frontmatter use Claude-style `Bash(node *), ...` (frontmatter/index.ts:51), split by ',' -> items with embedded spaces/parens; Copilot may not recognise these tool names. Spec only requires list form; semantic validity unspecified.

Scenario coverage (test/install-skills.spec.ts, test/domain/types/copilot-plugin.spec.ts):

- Exposes factory: OK. Reads manifest name/version: UNTESTED. No type discriminator: OK.
- Manifest agents.copilot: OK (copilot-plugin.spec.ts:29). Install receives context: OK (:21).
- Runtime contract scenario (`type:'agent'`): DISC X1; capability ids not objects: OK implicitly (:~130 `getBundle` called with capabilities array? not asserted explicitly) -> UNTESTED strictly.
- Install passes caps + frontmatter values: partial: fasttrack frontmatter asserted (:156-170); capabilities array itself not asserted for copilot.
- Routes shared/non-shared, shared no frontmatter: OK (:179-181).
- Does not call getBundle directly: UNTESTED (review).
- Frontmatter value model full set / unsupported excluded: UNTESTED (type-only).
- Skills under .github/skills + shared default: OK. No SKILL.md in shared: UNTESTED.
- Installs agent profiles .github/agents with .agent.md and tools list: partial (:253-287 checks `variables.frontmatter` and file content 'prompt-content'; tools list assertion unclear; file name .agent.md asserted via path).
- Prompt injection write/remove: OK but marker `agents="copilot"` (:305,313).
- Uninstall selected skill keeps shared: OK (:183-184). Without filter: OK (:196-198).
- Uninstall selected agent files / all managed agents + keep user agents: UNTESTED.
- Copilot omits unsupported fast-track branches: OK (:154-155 absent MCP text, no `allowed-tools:`).
- Manual-only + disable-model-invocation: OK (:156-170).

Counts: 27 scenarios. OK 14, DISC 2 (+X1), UNTESTED 11.

## 3. plugin-agent-codex:plugin-agent

Requirements: factory; manifest `agents.codex`; runtime contract; skill install (caps `['mcp','agents','frontmatter']`, agents -> .codex/agents/<n>.toml with name, description, developer_instructions multi-line string + TOML escaping; fallback when agents missing); frontmatter contract (name, description only); install location (.codex/skills); prompt injection AGENTS.md (untagged inject, purge legacy on install, two-step uninstall); uninstall; fast-track; manual-only.

Implementation status:

- Factory/manifest: OK.
- Caps literal: OK (install-skills.ts:~63).
- Agent TOML: OK in shape (install-skills.ts:~118-132): `name = JSON.stringify(..)`, `description = JSON.stringify(..)`, `developer_instructions = """ ... """`.
  - DISC D1 (escaping): only `"""` is escaped (`replace(/"""/g,'\\"\\"\\"')`); backslashes in the prompt are NOT escaped. In a TOML multi-line basic string `\` starts an escape sequence, so content with `\n`-like text, Windows paths, regexes or `\` followed by invalid char yields invalid TOML or altered text. Spec: "Ensure the instructions are correctly escaped for TOML." Option A: code bug (escape `\` first, or use `'''` literal string); Option B: spec is fine, current agent prompts happen to have no backslashes (not verified here).
  - Also `JSON.stringify` for TOML strings is mostly compatible but not identical (e.g. U+2028 and lone surrogates).
  - Frontmatter for agents is intentionally not passed (variables.frontmatter only for skills) - consistent with TOML wrapper.
- Frontmatter contract: OK (types: name, description only).
- Fast-track: OK (frontmatter name+description only). Manual-only description: OK.
- Prompt injection: DISC X2 (inject with 'codex' tag; no legacy purge on install; uninstall only removes tagged ref). Spec scenarios "Legacy plugin marker removed on install" and "Uninstall removes AGENTS.md base block" are not implemented as written.
- Uninstall: OK (.toml removal, shared.md, rmdir sharedDir).
- Fallback agents missing: X3.

Scenario coverage:

- Factory/name/version: version via manifest UNTESTED; no type: OK (codex-plugin.spec.ts:18); manifest: OK (:29); install context: OK (:21; only install forwarding tested, uninstall forwarding not).
- Runtime contract `type:'agent'`: DISC X1; no capability objects: UNTESTED explicitly.
- Install passes Codex caps + values: OK (install-skills.spec.ts:127-165, fasttrack frontmatter lines 151-153 equals exactly name/description).
- Routes shared/non-shared: OK. No direct getBundle: UNTESTED.
- Value model limits to name+description / unsupported excluded: UNTESTED (type-only; fasttrack frontmatter exact-match test partially covers).
- Install location + no SKILL.md in shared: first OK, second UNTESTED.
- Agents to .codex/agents/\*.toml with developer_instructions, multi-line, escaped: OK (install-skills.spec.ts:263-269 incl. triple-quote escaping); backslash escaping UNTESTED.
- Fallback agents missing: UNTESTED / not implemented.
- AGENTS.md prompt block: DISC (asserts `<specd agents="codex">` and absence of legacy marker, :287-288). Uninstall removes block: OK (:290-295) but via ref-count semantics. Legacy marker removal on install: UNTESTED and not implemented.
- Uninstall selected skills / all, keep user skills: OK. Selected agents / all managed agents + keep user agents: UNTESTED.
- Default Codex installation renders fast-track (frontmatter only name+description, journal resumability): OK (:151-156). Manual-only description: OK (frontmatter index).

Counts: 28 scenarios. OK 14, DISC 4 (marker install, legacy purge, base-block uninstall, TOML backslash escaping), UNTESTED 10.

## 4. plugin-agent-opencode:plugin-agent

Requirements: factory (named export); manifest `agents.opencode`; domain layer; frontmatter type (name, description, license, compatibility, metadata); application layer (caps `['mcp','agents','frontmatter']`; skills -> .opencode/skills, agents -> `.opencode/agents/<agent-name>/`; mode: subagent, permissions list from allowedTools); frontmatter injection; install location; prompt injection AGENTS.md; wizard integration; meta package; uninstall; fast-track; manual-only.

Implementation status:

- Factory/manifest: OK. Named export `create`: OK.
- Frontmatter type: DISC D1: types/frontmatter.ts includes an extra `allowed_tools?: string` (lines ~30-33, "Optional allowed tools list for agents"), outside the "exact field set" (name, description, license, compatibility, metadata); "Unknown fields MUST NOT be represented". It is used only for agent mapping, so skill output is unaffected, but the type contradicts the "exact" wording. Option A: spec should add an agent-only field; Option B: map agent tools elsewhere (separate agent-metadata type).
- Agents path: DISC D2 spec-internal: Application layer says `.opencode/agents/<agent-name>/` (directory), Uninstall requirement/scenarios and Install-location scenario say `.opencode/agents/` and `specd-project-context-optimizer.md`. Code writes flat `.opencode/agents/<name>.md` (install-skills.ts ~line 125). Code matches uninstall/scenarios; Application-layer bullet 6 is stale.
- Agent mapping: OK in effect: `mode: 'subagent'` + `permissions` as array of `{tool: 'allow'}` (install-skills.ts:~77-92). Quirk: duplicates (4x bash) since `Bash(node *)`, `Bash(specd *)`... each produce `{bash:'allow'}`; and permissions derived from Claude-style strings. Scenario text: "`permissions` mapped from allowedTools" OK; whether the Open Code runtime accepts the list-of-single-key form is unspecified (spec example shows `- bash: allow`, so OK).
- Prompt injection: DISC X2 (partially compliant: calls `removeSpecdBlock(path,'opencode')` on install before inject, satisfying legacy purge; but inject uses tag 'opencode'; uninstall lacks base-block removal).
- Wizard: OK (packages/cli/src/commands/project/init.ts:15-19 includes opencode). Test: cli/test/commands/project-init.spec.ts:108 `supports --plugin with @specd/plugin-agent-opencode` (OK, though it tests the --plugin flag, not the interactive list).
- Meta package: OK (packages/specd/package.json:23 `workspace:*`). No test (UNTESTED; structural).
- Fast-track: OK (frontmatter name+description only; capability-aware content retained).
- Manual-only: OK.
- Fallback: X3.
- Domain layer: OK (type, frontmatter, map).

Scenario coverage:

- Named create factory: OK; version from manifest: UNTESTED; no type: OK (:18).
- Manifest: OK (:29). Install context: OK (:21).
- Domain contract: UNTESTED (structural).
- Frontmatter value model supported set / unsupported excluded: UNTESTED (and D1).
- Install passes caps + values (fast-track test lines 215-232: capabilities `['mcp','agents','frontmatter']` and frontmatter asserted, 'mcp-instructions'/'agent-instructions' retained): OK.
- Shared no frontmatter: OK (:133-134).
- Skills in .opencode/skills + sharedFolder default: OK; No SKILL.md in shared: UNTESTED.
- Agents to .opencode/agents with mode subagent and permissions: OK for variables (:292-310) + path (:313-322); content-level YAML UNTESTED (X6).
- Fallback agents missing: UNTESTED / not implemented.
- AGENTS.md write: DISC (asserts `agents="opencode"`, :374-375); uninstall removes (:385-389, preserves existing content): OK. Legacy marker removal on install: UNTESTED (code removes only tag 'opencode' ref, not the legacy `<specd-plugin:opencode>` form unless block manager handles it).
- Wizard exposes option: partial (init spec tests --plugin flag).
- Meta package depends: UNTESTED.
- Uninstall selected skills / unfiltered + user skills: OK (:136-151). Selected agents / all managed agents + keep user: UNTESTED.
- InstallSkills follows workflow / no YAML prepend / no direct getBundle: partial/UNTESTED (review).
- Default opencode installation includes fast-track: OK (test :157-233). Manual-only: OK (frontmatter asserted at :215+).

Counts: 33 scenarios. OK 16, DISC 4 (marker, frontmatter extra field, agents dir path spec-inconsistency, base-block uninstall), UNTESTED 13.

## 5. plugin-agent-standard:plugin-agent

Requirements: factory; manifest `agents.standard`; domain layer; frontmatter type (name, description, license, compatibility, metadata, `allowed-tools` space-separated); application layer (caps `['frontmatter']`; skills -> .agents/skills; agents -> same dir as shared); frontmatter injection; install location; prompt injection AGENTS.md; allowed-tools configuration (`Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)`, Agent...); wizard; meta package; uninstall (skills only); fast-track (allowed-tools incl. Agent); manual-only.

Implementation status:

- Factory/manifest: OK. Caps literal `['frontmatter']`: OK (install-skills.ts:~58).
- Frontmatter type: OK (6 fields: name, description, license, compatibility, metadata, allowed-tools; src/domain/types/frontmatter.ts).
- allowed-tools configuration: DISC D1. Spec: tool strings "matching the agentskills.io format (space-separated)" and listing `Bash(node *)`, `Bash(specd *)`, `Bash(pnpm *)`. Code uses `Bash(node:*) Bash(specd:*) Bash(pnpm:*)` (colon-star form) (frontmatter/index.ts:7-45). Space-separated: OK. Pattern syntax: differs from spec's literal examples. Option A: code right (agentskills.io/Claude legacy permission syntax `Bash(cmd:*)`; spec examples are loose notation); Option B: spec right (matches the Claude plugin's `Bash(node *)`), code should change. Also test asserts only `Bash(`.
  - Missing from spec list? `specd-new` has no Write/Edit (appropriate); spec requires "Agent where applicable": present for design/implement/new/compliance/fasttrack.
- Agent fallback (to sharedDir as `<name>.agent.md`): OK (install-skills.ts:~120-135); agentFrontmatter entries carry no allowed-tools; code still passes `allowed-tools` list if present (unreachable for shipped data), and passes frontmatter variable for agents despite comment "unused for frontmatter injection" (comment in frontmatter/index.ts says unused; code in install-skills.ts:~78-88 does build `agentFrontmatterVars` and sends it as `variables.frontmatter`). Inconsistent comments vs code (D2, low).
- Prompt injection: DISC X2 (tag 'standard', no legacy purge, no base-block removal).
- Uninstall: OK for skills. D3 code quirk: unfiltered path never deletes `<sharedDir>/<agent>.agent.md` files (only shared.md), so `rm(sharedDir)` (non-recursive) fails silently whenever an agent file was installed, leaving sharedFolder behind - violates "the resolved sharedFolder location is removed". Spec for standard doesn't talk about agents in uninstall; filtered path removes them. Option A: code bug (add agent-file removal like claude/codex/opencode do); Option B: spec should state agents fallback files are left alone.
  - Also `managedSkills = list().map(...)` is used for both skills and agents (no kind filter) - harmless.
- Wizard: OK (init.ts:19). Meta package: OK (packages/specd/package.json:24).
- Fast-track: OK. allowed-tools = `Bash(node:*) Bash(specd:*) Bash(pnpm:*) Read Write Edit Grep Glob Agent` (see D1 for syntax). Instruction omission for unsupported caps: OK (test asserts no mcp/agent instructions, :243-244).
- Manual-only: OK (description).

Scenario coverage:

- Named create: OK. name/version from manifest: UNTESTED. No type: OK (:18).
- Manifest: OK (:34-40). Install context: OK (:21-31).
- Domain contract: UNTESTED (structural).
- Frontmatter value model/ allowed-tools hyphen: OK (`allowed-tools:` present and `allowed_tools:` absent, install-skills.spec.ts:126-128); space-separated value: partial (test mock string, not real data; `Bash(` only).
- Install passes caps + values: OK (:112-125, :221-241).
- Shared no frontmatter: OK (:139-140).
- Install to .agents/skills + shared default: OK. No SKILL.md in shared: UNTESTED.
- Fallback for agents (sharedDir): OK-ish (:250-327 verifies agent frontmatter variables and 'prompt-content'; location assertion presumed in test, not confirmed).
- AGENTS.md: DISC (asserts `agents="standard"`, :344-345); uninstall removes: OK (:347-352). Legacy marker: UNTESTED and not implemented.
- allowed-tools per skill (non-empty, includes Read and `Bash(node *)`): UNTESTED against real map (tests use mock bundles; real skillFrontmatter never inspected) and DISC D1 on syntax.
- Wizard: partial (no standard-specific test; opencode only at project-init.spec.ts:108). Meta package: UNTESTED.
- Uninstall selected skills / unfiltered + user skills: OK (:142-157).
- InstallSkills workflow, no YAML prepend, no direct getBundle: partial/UNTESTED (review).
- Default Standard installation declares fast-track tools: OK (:163-244 asserts allowed-tools string). Manual-only: OK (:229).

Counts: 28 scenarios. OK 14, DISC 3 (marker/legacy/base-block, allowed-tools syntax, sharedFolder left behind when agents present), UNTESTED 11.

## Dependency spec check: plugin-manager:agent-plugin-type

- Install context shape (`AgentInstallContext` with config/options/contributions): consistent. All 5 plugins forward `context.config`/`context.options` only; `context.contributions` is ignored (OK; each plugin has a single contribution).
- Capability ids passed as arrays of identifiers, not objects: consistent in all 5 (literals).
- `variables.frontmatter` carries frontmatter; no pre-built YAML: consistent. Code spreads `options.variables` then sets `frontmatter`; user-supplied `variables.frontmatter` is overwritten (fine).
- `options.capabilities` (AgentInstallOptions) is ignored by all five plugins (they use their own literal). Dependency spec says capabilities are "supplied by the agent plugin at install time", so ignoring caller capabilities is consistent.
- `agents` fallback to shared.md directory: only standard exercises it (see X3).
- `type` contradiction: see X1; the plugin-agent specs contradict agent-plugin-type, which dropped `type`.
- Filename of shared context file: dependency spec says "same directory as the shared context file (`shared.md`)"; standard writes agents as `<name>.agent.md` in that dir (OK).

## Overall totals (scenario level, approximate)

| Spec     | Scenarios | OK  | Discrepancy | Untested/gap    |
| -------- | --------- | --- | ----------- | --------------- |
| claude   | 29        | 15  | 2           | 10 (+2 partial) |
| copilot  | 27        | 14  | 2           | 11              |
| codex    | 28        | 14  | 4           | 10              |
| opencode | 33        | 16  | 4           | 13              |
| standard | 28        | 14  | 3           | 11              |

## Highest-priority items

1. X2: prompt-block contract (tagged ref-counted block in code and tests vs untagged block + legacy purge + two-step uninstall in specs). Specs likely stale; decide and align 5 specs + add legacy-marker test.
2. X1: remove `type: 'agent'` language from 5 specs (contradicts verify.md and agent-plugin-type).
3. Codex TOML escaping gap for backslashes (real correctness risk).
4. Standard: sharedFolder not removed after unfiltered uninstall when agent files exist; allowed-tools syntax `Bash(x:*)` vs spec `Bash(x *)`.
5. Copilot recursive shared-folder removal inconsistent with other plugins.
6. Missing tests: agents-filter uninstall (all 5), user-agent preservation (all 5), agents-capability fallback (claude/codex/opencode), factory name/version from manifest via create() (all 5), meta-package and wizard for standard, no SKILL.md in shared (all 5), real-data `allowed-tools` check (standard).
