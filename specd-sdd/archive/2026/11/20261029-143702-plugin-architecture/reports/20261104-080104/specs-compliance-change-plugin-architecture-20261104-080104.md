# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-3)

## Summary

- Typecheck clean; all test suites pass (core 3346, cli 1252, plugin-manager 90, sdk 97, etc.).
- No critical/high findings. 1 medium (core:config-writer-port tmp .gitignore path). Rest low/info + test gaps.

## Detailed Findings

<!-- _partial-agents.md -->

# Partial audit: agent plugin specs (plugin-architecture)

Scope: plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.
Method: spec-preview (merged) vs. source in packages/plugin-agent-\*/src and packages/skills/src/application/shared-folder-owners.ts, plus test files. Unit tests green (given).

## Cross-cutting implementation findings (all five plugins)

- Manifests (specd-plugin.json): schemaVersion 2, no pluginType, `contributes.agents.<id>` = claude/copilot/codex/opencode/standard. COMPLIANT.
- Factory: `src/index.ts` async `create(_options)`, reads manifest from own dir then parent, throws PluginValidationError, constructs plugin with name/version. No `type` discriminator. COMPLIANT.
- install/uninstall take `AgentInstallContext` and delegate `context.config` / `context.options` (claude-plugin.ts). No configSchema. COMPLIANT.
- Capabilities passed as literals/defaults: claude [mcp,agents,frontmatter]; copilot [frontmatter,agents]; codex [mcp,agents,frontmatter]; opencode [mcp,agents,frontmatter]; standard ['frontmatter']. No buildCapabilities helper. ResolveBundle used (no direct getBundle). COMPLIANT.
- Prompt injection: injectSpecdBlock(path, prompt, '<id>') on install (CLAUDE.md / copilot-instructions.md / AGENTS.md); full uninstall calls removeSpecdBlock; filtered uninstall returns early (keeps block). opencode additionally calls removeSpecdBlock before inject (spec-required). COMPLIANT.
- Owners protocol: install calls addSharedOwner(sharedDir, id) iff something was written to shared dir (shared files or agent fallback), for filtered and unfiltered installs. Full uninstall: removeSharedOwner -> if hadMarker && remaining empty -> delete shared.md + `<agent>.agent.md` + removeSharedFolderIfEmpty. Filtered uninstall returns before touching marker. COMPLIANT.
- Agent placement: `supportsAgents` derived from `capabilities.includes('agents')`; else agents go to sharedDir as `<name>.agent.md` (claude/codex/opencode/copilot); standard unconditional sharedDir. COMPLIANT.
- Shared-folder resolve: `shared-folder.ts` duplicated verbatim in all 5 packages (not a spec discrepancy; design note only; low).
- NOTE: the `diff` tooling output in this environment was unreliable; I read codex/opencode uninstall files directly and confirmed they use `.codex`/`.opencode` paths and `'codex'`/`'opencode'` ids.

## 1. plugin-agent-claude:plugin-agent

Requirements (13): Factory export, Manifest/install context, Domain layer, Frontmatter type, Application layer, Frontmatter injection, Install location, Prompt Injection, Uninstall behavior, Shared folder ownership/placement, Fast-track install, Manual-only fast-track routing (+constraints).
Implementation: all implemented. Skills -> .claude/skills/<name>/, agents -> .claude/agents/<name>.md; tools comma-string; `model` from `item.metadata.model` (omitted when absent); fast-track frontmatter has `disable_model_invocation: true` and "Manual-only: use only when the user explicitly invokes /specd-fasttrack". Frontmatter type has all 14 fields.
Discrepancies: none material. Low: `tools: metadata.allowed_tools.split(', ').join(', ')` is a no-op round trip (harmless dead logic).
Tests (install-skills.spec.ts, 12 tests): routing + shared markdown, agent frontmatter, model, CLAUDE.md inject/uninstall, owner registration (filtered), other-owner keeps files, sole-owner removes folder, foreign file, legacy no-marker, filtered uninstall keeps marker, agent fallback to shared dir. Good coverage.
Missing tests: manifest content/schemaVersion/no pluginType; factory reads manifest name/version & manifest-parent fallback; no `type` discriminator; async factory awaited (4 factory scenarios + "Manifest declares agents contribution"); "Install receives the context"; frontmatter type field-set scenarios; domain layer file existence; "does not call getBundle directly" (static); fast-track description wording (only 1 grep hit for disable_model_invocation; partially covered).
Counts: reqs 12/12 implemented; scenarios ~41; with direct test ~22; no test ~19 (mostly factory/manifest/static-structure).

## 2. plugin-agent-copilot:plugin-agent

Requirements (11): Factory, Manifest, Runtime contract, Skill install + frontmatter injection, Frontmatter field contract, Install location, Prompt injection, Uninstall, Shared ownership, Fast-track, Manual-only.
Implementation: all implemented. Skills -> .github/skills/<name>/, agents -> .github/agents/<name>.agent.md with `tools` as YAML list; prompt in .github/copilot-instructions.md; fast-track has `'disable-model-invocation': true` + manual-only description. Frontmatter type: name, description, license, allowed-tools, user-invocable, disable-model-invocation (exact set).
Discrepancies: none material. Info: spec Dependencies lists `skills:skill-templates-source` while claude/codex/... list `skills:skill-repository` (spec-side inconsistency; code uses createSkillRepository from @specd/skills in all) - low, spec wording.
Tests (7 tests): routing, agent YAML wrapper, prompt inject/uninstall, user file kept, filtered install registers owner, other owner remains, agent fallback to shared dir.
Missing tests: factory/manifest scenarios (as above); last-owner-removes-folder; foreign file keeps folder (partly "user file in shared folder" test, line 344); legacy no-marker; filtered uninstall keeps marker + shared files; "selected agent file removal"; fast-track unsupported branches omitted (14 fasttrack hits, probably covered in main test; not verified in detail).
Counts: reqs 11/11 implemented; scenarios ~38; tested ~17; untested ~21.

## 3. plugin-agent-codex:plugin-agent

Requirements (11) similar. Implementation: complete. Agents -> .codex/agents/<name>.toml with name, description, `developer_instructions = """..."""` using escapeTomlBasicMultiline (backslash test present); fallback `<name>.agent.md` in shared dir; AGENTS.md block via inject/removeSpecdBlock('codex'); uninstall removes `.toml` agents. Frontmatter limited to name/description. Fast-track has manual-only description (no disable flag required for codex).
Discrepancies: none material.
Tests (6 tests): routing, TOML wrapper, AGENTS.md inject/uninstall, TOML escaping, other-owner keeps prompt ref + shared.md, agent fallback.
Missing tests (notable): NO test of `.owners.json` for codex at all: install registers owner, filtered install registers owner, last-owner removes shared files + empty folder, foreign file keeps folder, legacy no-marker, filtered uninstall keeps marker (6 owner scenarios). Also factory/manifest, legacy `<specd-plugin:codex>` marker purge (only via skills block-manager tests), filtered AGENTS.md block retention.
Counts: reqs 11/11 implemented; scenarios ~39; tested ~13; untested ~26. Severity of gap: medium (shared-folder protocol code is identical to claude's but unverified for codex).

## 4. plugin-agent-opencode:plugin-agent

Requirements (15 incl. wizard + meta package). Implementation: complete. `mode: 'subagent'` and `permission` map via `toOpenCodePermission` (bare tool -> allow, patterned -> nested map, bare+patterns -> "\*": allow per spec), agents -> .opencode/agents/<name>.md; remove-then-inject block; shared ownership. Wizard: cli init.ts lists opencode (test project-init.spec "supports --plugin with @specd/plugin-agent-opencode"). Meta package: packages/specd/package.json has 5 workspace deps (agent plugins), consistent.
Discrepancies: none material. Frontmatter type includes `allowed_tools` (spec explicitly allows for agent entries).
Tests (6 tests): routing, default fast-track render, agent frontmatter (permission), AGENTS.md block + uninstall, other-owner keeps ref, agent fallback.
Missing tests: same owner-marker gap as codex (no `.owners.json` assertions: 6 scenarios); permission edge cases (bare+pattern merge, no duplicate keys) beyond what the agent test covers; filtered-uninstall prompt retention; meta package dependency test (static); factory/manifest.
Counts: reqs 15/15 implemented; scenarios ~42; tested ~16; untested ~26. Gap severity: medium for owners.

## 5. plugin-agent-standard:plugin-agent

Requirements (15 incl. allowed-tools, wizard, meta). Implementation: complete. Capabilities ['frontmatter']; skills -> .agents/skills/<name>/; agents unconditionally `<sharedDir>/<name>.agent.md`; AGENTS.md block 'standard'; filtered agent uninstall removes only `<sharedDir>/<agent>.agent.md` and does not touch marker; allowed-tools strings are space-separated with `Bash(x *)` style, compliance includes git/gh/node/pnpm; fasttrack has allowed-tools incl. node/specd/pnpm/Agent. Init wizard lists `@specd/plugin-agent-standard`.
Discrepancies: none material. Info: install maps agent `allowed-tools` by splitting on ',' into an array whereas skills use space-separated string - dead path today (standard agentFrontmatter entries have no allowed-tools); would mis-handle space-separated values if ever added (low, latent).
Tests (9 tests): .agents/skills routing + allowed-tools, default fast-track, agent wrapper, AGENTS.md inject/uninstall, selected agent uninstall, allowed-tools space style/compliance, two tagged blocks, selected agent removal from shared folder, legacy no-marker. Best owner coverage after claude.
Missing tests: last-owner removes folder, foreign file keeps folder, other-owner-remains (only 5 owners mentions), filtered uninstall keeps marker, factory/manifest, wizard/meta static.
Counts: reqs 15/15 implemented; scenarios ~38; tested ~19; untested ~19.

## 6. skills:shared-folder-owners

Requirements (5): Owners marker file, Registering an owner, Releasing an owner, Removing folder only when empty, Uninstall protocol for agent plugins (+constraints).
Implementation (packages/skills/src/application/shared-folder-owners.ts, exported from index.ts): addSharedOwner (mkdir recursive, sorted unique, idempotent byte-identical, replaces invalid marker), removeSharedOwner (invalid/missing -> {remaining:[], hadMarker:false} without writing; non-owner no-op; deletes marker when none remain), removeSharedFolderIfEmpty (rmdir; swallows only ENOTEMPTY/ENOENT). Uses only node:fs/promises, no logging. Marker is `{ "owners": [...] }` with trailing newline. COMPLIANT.
Subtle: a missing marker is treated as `undefined` and invalid as `{kind:'absent'}`; both yield hadMarker false; read never repairs. addSharedOwner on invalid replaces with only the id - spec-conformant.
Discrepancies: none. Constraint "no concurrency" - not applicable.
Tests: shared-folder-owners.spec.ts (13 tests) + shared-folder-owners-eacces.spec.ts cover all 15 unit scenarios of the first four requirements including EACCES propagation. Uninstall-protocol scenarios are covered at the plugin level (claude full set; copilot partial; standard partial; codex/opencode missing, see above).
Counts: reqs 5/5 implemented; scenarios 20; 15 unit-tested directly, 5 protocol scenarios tested via claude (all), partially via others.

## Overall severity summary

- High: none. No spec/code contradictions found in these six specs.
- Medium: test gap - codex and opencode have no owners-marker tests (install registration, last-owner cleanup, foreign file, legacy, filtered). Copilot lacks last-owner/legacy/filtered-uninstall-marker tests; standard lacks last-owner/foreign/other-owner tests.
- Low: no tests for factory/manifest scenarios in any plugin (manifest schemaVersion/contributes, name/version from manifest, no `type`, async awaited); shared-folder.ts duplicated 5x; standard agent allowed-tools split(',') latent; copilot spec dependency names `skills:skill-templates-source` vs others `skills:skill-repository` (spec wording).

<!-- _partial-cli-sdk.md -->

# Partial audit: CLI + SDK specs (change plugin-architecture)

Scope: cli:plugins-install, cli:plugins-uninstall, cli:plugins-update, cli:plugins-list, cli:plugins-show, cli:project-init, cli:project-update, cli:host-context, sdk:composition, sdk:host-context.
Method: merged spec-preview (spec + verify) read per spec; implementation read directly in packages/cli/src and packages/sdk/src; test titles/assertions inspected. Unit tests reported green by caller; not re-run.

Overall: no blocking or high-severity discrepancies. Implementation matches the specs closely. Findings are low severity / test-gap level.

## cli:plugins-install

Requirements: signature (scoped names, `--contributions` single plugin only), declaration source (config.plugins, no listPlugins), header `Installed plugins:`, already-installed warning, workflow (InstallPlugin -> `createConfigWriter().addPlugin` with contributions/config only when present), `plugins:false` host, exit code 1, `{plugins, hasErrors}` output.
Implementation (packages/cli/src/commands/plugins/install.ts): all implemented. Name validated with `isPluginName` before load; duplicate names in one call handled via `declaredSet.add`; warning text `X already installed; use 'specd plugins update'` (contains "already installed" then "update"); no `kernel.project.addPlugin`; no init call; `resolveCliContext({plugins:false})`; `CliExitError(1)` on errors.
Discrepancies: none material.

- Low: `PluginInstallEntry.detail` is always a string (spec says optional). Compatible.
- Low: `--contributions` with several plugins calls `cliError` (usage error); spec only says "usage error" - fine.
  Tests (test/commands/plugins.spec.ts "plugins install", 8 tests): install+persist, unscoped + multi-plugin contributions rejection, contributions + defaultConfig persisted, already installed skip, unscoped triggers no install and continues after failure, header text, JSON shape, exit 1. plugins:false asserted (line ~132).
  Missing tests: no explicit "no empty config key written when no defaultConfig" assertion verified; no explicit assertion that `config.plugins` is used rather than listPlugins (implicit: no such call exists); duplicate-name-in-one-invocation scenario not seen by title; "init not called" not asserted. All low.
  Counts: 9 requirements, 9 implemented, 0 discrepancies (2 low notes), ~4 scenario gaps (low).

## cli:plugins-uninstall

Implementation (uninstall.ts): verifies declaration via `findDeclaredPlugin`, passes `contributions` allowlist to `UninstallPlugin`, calls `removePlugin` only after hook succeeds (hook throw -> declaration kept, error entry), undeclared -> error without calling plugin, `plugins:false`, exit 1 after processing all, output `{plugins}` in json/toon. Matches spec.
Discrepancies: none.
Tests: uninstalls+removes, JSON output, allowlist + plugins:false, hook failure retains declaration and continues, undeclared plugin. Good coverage of all verify scenarios except "plugin with no uninstall hook" (delegated to plugin-manager; low).
Counts: 5 requirements, 5 implemented, 0 discrepancies.

## cli:plugins-update

Implementation (update.ts `updatePluginsWithKernel`): enumerates `config.plugins`, named filter, undeclared name -> error entry (UpdatePlugin not called), per-plugin recorded `contributions` passed to UpdatePlugin, no ConfigWriter usage, `plugins:false`, statuses `updated|error`, text `no plugins to update`, `{plugins,hasErrors}`, exit 1. Matches.
Discrepancies: none.
Tests (plugins-update.spec.ts, 6 tests): all, named, undeclared exit 1, allowlist + no config write + plugins:false, continue after failure, empty message. Gap (low): JSON-shape assertion for `plugins update` directly (covered indirectly by project-update tests with mocks).
Counts: 5 requirements, 5 implemented, 0 discrepancies.

## cli:plugins-list

Implementation (list.ts): flat `config.plugins`, `ListPlugins` loader status mapped (loaded->installed, not_found, error); for non-loaded `declared=[]`, `selected=allowlist ?? []`; loaded `selected=allowlist ?? declared`; version `-` fallback; `no plugins declared` / `{plugins: []}`; `plugins:false`; no `--type`.
Discrepancies:

- Low (spec silent): text output prints an extra header line `Installed plugins:` and an `available: ...` suffix; spec only requires name/contributions/version/status. Not contradictory.
- Info: `detail` only emitted for non-installed rows (spec: detail for `error`; `not_found` also gets detail if loader provides one) - compatible.
  Tests: lists with status, selected/available text, empty output, not_found/error rows + missing version + available ids. Good. Gap (low): "lists with broken configured plugin" is only implied by the `plugins:false` assertion.
  Counts: 4 requirements, 4 implemented, 0 real discrepancies.

## cli:plugins-show

Implementation (show.ts): `plugins:false`, `LoadPlugin`, contributions as kind/id/address via `buildContributionAddress`, configSchema/defaultConfig when present, capabilities (`install`/`uninstall` when hook exists or `agents` kind) omitted entirely when empty (text + JSON), error -> `handleError` (exit 1).
Discrepancies: none. (Info: `agents` kind yields both install and uninstall even if only one hook is implemented - matches spec wording "or declares the agents contribution kind".)
Tests: metadata, addresses and no init in text capabilities, load failure exit 1, schema/default config with capabilities omitted for checks plugin. Gap (low): positive capabilities list for hook plugin only partly covered.
Counts: 3 requirements, 3 implemented, 0 discrepancies.

## cli:project-init

Implementation (project/init.ts): flags incl. repeatable `--plugin`; plugin names validated with `isPluginName` BEFORE `initProject` (cliError -> exit 1); interactive = TTY && text && no CLI-sourced flag (via `getOptionValueSource === 'cli'`, so explicit default counts as provided); banner only in wizard; known plugin set exactly claude/copilot/codex/opencode/standard; `createConfigWriter().initProject`; metadataCachePath taken from result; post-init install via `resolveCliContext({configPath, plugins:false})` + `installPluginsWithKernel`; install failure keeps init output and exits 1; text/json output as specified.
Discrepancies:

- Low: in the interactive wizard the "specd.yaml already exists, overwrite?" confirmation is asked after all settings/plugin prompts, not "when the wizard starts" (verify scenario "Overwrite confirmation for an existing config"). Spec wording vs code ordering; behaviour (ask, cancel on no, nothing written) is intact.
- Info: wizard cancel exits with code 0 (`CliExitError(0)`); spec only says nothing is written.
- Info: `configVersion: 2` and tmp/.gitignore/metadata dir creation are core ConfigWriter responsibilities; not verifiable at CLI level (mocked in CLI tests). Should be covered by core:config-writer-port audit.
  Tests (project-init.spec.ts, 17 tests): --plugin install + plugins:false, opencode, JSON with plugin results, unscoped rejected before write, install failure exit 1, explicit default flag stays non-interactive, wizard + banner + multiselect, wizard cancel/overwrite, no banner in non-interactive text, alias scenarios (exit 0, JSON, metadata line, exists without --force, --force, excess args).
  Missing tests (low): known plugin options exactly-5 assertion (only opencode checked by title; standard not by title); "selecting none in wizard".
  Counts: 7 requirements, 7 implemented, 1 low discrepancy.

## cli:project-update

Implementation (project/update.ts): reuses `updatePluginsWithKernel`, `plugins:false`, text `plugins: updated <name>` / `plugins: error <name> (<detail>)`, `project is up to date` when empty (json `{plugins:[],hasErrors:false}`), json `{plugins,hasErrors}`, exit 1 after all processed, no config write.
Discrepancies: none. (Info: extra `--config <path>` option not in the spec signature; harmless.)
Tests (project-update.spec.ts, 6 tests): label prefix + plugins:false, up-to-date, grouped JSON, exit 1, hasErrors in JSON, config load failure. Note: `updatePluginsWithKernel` is mocked here, so "UpdatePlugin not install()", allowlist and "second plugin still updated" are verified only through plugins-update.spec.ts (shared implementation). Acceptable; low gap.
Counts: 3 requirements, 3 implemented, 0 discrepancies.

## cli:host-context

Implementation: `resolveCliContext` (helpers/cli-context.ts) -> `openCliHost` (helpers/cli-host.ts) which forwards input unchanged to `openSpecdHost` / `createSdkContext` and registers `host.dispose` in the cleanup registry only after successful open; `plugins` forwarded only when provided; warnings read from `config.warnings`, emitted once; `buildCliKernelOptions` keeps verbosity/TTY/onLog in CLI; cleanup registry (cli-cleanup.ts) reverse order, idempotent shared promise, failure isolation, `warning: cleanup failed: <msg>`, AggregateError flattening, late-registration immediate run; run.ts and cli-signals.ts trigger `runCliCleanup`; graph-index-task.ts opens with `plugins:false` and disposes in `finally`; no `resolveSdkHostContext`; package.json lists `@specd/sdk` as only platform dep (no core/code-graph); no `@specd/core`/`@specd/code-graph` imports in cli/src.
Discrepancies: none found.

- Info: graph-index-task.ts calls `openSpecdHost`/`createSdkContext` directly - explicitly allowed by spec for the worker.
  Tests: cli-context.spec (-vv mapping, plugins default/false, warnings, once-only, cleanup release, double dispose, source scan for direct bootstrap/hand-built host), cli-host.spec (4), cli-cleanup.spec (6 incl. late registration/failure), cli-signals specs, graph-index-task.spec (dispose on success/failure, plugins:false, SDK boundary).
  Missing tests (low): explicit "stderr contains `warning: cleanup failed: boom`" text check not confirmed by title; worker "plugins:false for bootstrap (non-configured) mode" has only one plugins:false assertion (line 39, configured mode); onLog callback scenario not seen by title; package.json sole-dependency check not seen in cli tests (sdk tests check it from the SDK side).
  Counts: 8 requirements, 8 implemented, 0 discrepancies, ~4 low test gaps.

## sdk:composition

Implementation: package deps exactly core, code-graph, plugin-manager; no cli/mcp/plugin-agent deps; exports ".", "./ports", "./extensions" -> dist; src layout composition/orchestration/presentation/shared/domain (no infrastructure); index.ts explicit exports (no `export * from '@specd/core'`; `export * from './core-reexports.js'` is a local curated file); plugin handler types and all 10 plugin error classes re-exported; code-graph host-adapter symbols; SDK_VERSION; `createConfigWriter` and `isPluginName` (from core) re-exported for CLI.
Discrepancies:

- Low: `isPluginName`/`PLUGIN_NAME_REGEX`/`createConfigWriter` are exported via core-reexports but are not listed in the spec's "Public barrel exports" bullets (spec references plugin-name rule as `plugin-manager:specd-plugin-type`, while the implementation of `isPluginName` lives in core domain/plugin-name.ts). Spec/code naming of the owning package differ; behaviour consistent. Consider mentioning in spec or confirming specd-plugin-type's rule is the same regex.
  Tests: barrel.spec (SDK_VERSION, bootstrap, factories, no export star, error classes, code-graph symbols, worker without lock internals, declarations, ports/extensions subpaths), composition.spec + package-boundary.spec (dependency sets, plugin-manager does not depend on sdk).
  Missing tests (low): error classes identity vs `@specd/plugin-manager` (only `typeof === 'function'`); absence of `SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, `PersistSpecMetadata` only partially asserted (`createSaveSpecMetadata` seen); `SdkContextOptions`/handler types asserted via source-text `toContain` rather than type-level.
  Counts: 7 requirements, 7 implemented, 1 low discrepancy.

## sdk:host-context

Implementation (packages/sdk/src/composition/host-context.ts): `SdkHostContext` (kernel, createGraphProvider, dispose, asyncDispose = same fn delegating to `kernel.dispose()`; no config field); `createSdkContext` creates builder, awaits `registerPlugins(builder, config, {handlers})` unless `plugins===false`, then `builder.build()`; on build failure disposes registration and rethrows the build error with `rollbackErrors` attached (non-object build errors cannot carry it - negligible); `createGraphProvider` closes over same config, new instance each call; `openSpecdHost` rejects configPath+startDir, loader modes, bootstrap fallback only with flag and never for explicit configPath, config.warnings not duplicated; no config write methods; no foreign-kernel wrapper API.
Discrepancies: none.
Tests: host-context.spec (same config to kernel & provider, plugins:false skips, handlers forwarded + dispose on build failure, rollbackErrors, graph options, distinct providers, discovery/forced/startDir/mixed rejection/fallback/no-fallback, warnings, disposal semantics, await using, no mutation methods, no foreign kernel), host-context-e2e.spec (init a then b before kernel, destroy b then a, failed init builds no kernel, plugins:false loads none).
Missing tests (low): "plugins registered before build" ordering with mocks (covered by e2e), "plugins enabled with empty list" (not seen by title), "Build failure disposes plugins" covered together with handlers test.
Counts: 4 requirements, 4 implemented, 0 discrepancies.

## Summary

- 10 specs, ~55 requirements, all implemented. 0 critical/high/medium discrepancies. 2 low spec-vs-code wording items (init overwrite prompt ordering; isPluginName ownership/barrel listing) plus several info notes (extra `--config` options, extra list header, wizard cancel exit 0).
- Test gaps are all low: project-update mocks the shared update function; some verify scenarios are covered only implicitly (empty-config key, init-not-called, error-class identity, removed metadata APIs absence, worker plugins:false in bootstrap mode).
- Items deferred to other audits: core ConfigWriter behaviors (configVersion 2, tmp/.gitignore, metadata cache dir, addPlugin/removePlugin), plugin-manager use cases (Install/Uninstall/Update/List/Load/registerPlugins).

<!-- _partial-core.md -->

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

<!-- _partial-plugin-manager.md -->

# Partial compliance audit: plugin-manager specs (change plugin-architecture)

Scope: packages/plugin-manager (src + test). Specs read via `changes spec-preview` (merged). Read-only audit; unit tests reported green by caller.
Severity scale: HIGH / MEDIUM / LOW / INFO. Neither spec nor code is treated as source of truth.

## Summary table

| Spec                      | Reqs | Reqs implemented | Scenarios | Covered by tests | Partial | Missing tests                                             | Discrepancies |
| ------------------------- | ---- | ---------------- | --------- | ---------------- | ------- | --------------------------------------------------------- | ------------- |
| specd-plugin-type         | 8    | 8                | 36        | 22               | 5       | 9                                                         | 2 LOW, 1 INFO |
| plugin-loader             | 4    | 4                | 31        | 20               | 3       | 8                                                         | 1 LOW, 1 INFO |
| register-plugins-use-case | 6    | 6                | 28        | 18               | 3       | 7                                                         | 1 LOW         |
| install-plugin-use-case   | 5    | 5                | 19        | 10               | 1       | 8 (3 are informative/out of scope)                        | 0             |
| uninstall-plugin-use-case | 4    | 4                | 13        | 9                | 1       | 3                                                         | 0             |
| update-plugin-use-case    | 5    | 5                | 14        | 9                | 1       | 4                                                         | 0             |
| list-plugins-use-case     | 3    | 3                | 7         | 5                | 0       | 2                                                         | 0             |
| agent-plugin-type         | 7    | 7                | 18        | 10               | 2       | 6 (type/contract scenarios, mostly agent-plugin packages) | 0             |
| load-plugin-use-case      | 3    | 3                | 6         | 4                | 0       | 2                                                         | 0             |
| plugin-errors             | 4    | 4                | 10        | 8                | 0       | 2                                                         | 0             |
| plugin-repository-port    | 3    | 3                | 9         | 4                | 1       | 4 (interface-inspection scenarios)                        | 0             |

No HIGH or MEDIUM discrepancies found. All requirements have an implementation. Findings are LOW or INFO plus test-coverage gaps.

Implementation map:

- Domain: packages/plugin-manager/src/domain/types/{specd-plugin,plugin-manifest,agent-plugin,contribution-kind-handler}.ts, services/{plugin-config-schema,merge-handlers,resolve-contributions}.ts, handlers/agents-handler.ts, errors/\*.ts
- Application: src/application/use-cases/{register-plugins,install-plugin,uninstall-plugin,update-plugin,list-plugins,load-plugin}.ts, ports/{plugin-loader,plugin-repository}.ts
- Infrastructure: src/infrastructure/loader/{plugin-loader,register-plugins}.ts
- Public surface: src/index.ts re-exports domain, application, infrastructure. `registerPlugins`, `RegisterPluginsInput`, `createPluginLoader`, `PluginLoaderOptions`, `PluginRegistration` are exported by name. Application-level `registerPlugins` (requires loader) is intentionally not exported; the infra wrapper (loader optional) is the public one. Matches spec.

---

## 1. plugin-manager:specd-plugin-type

Requirements: SpecdPlugin interface; PluginContext; isSpecdPlugin; Plugin manifest; Plugin name; Contribution identity/address; Plugin configuration schema; Contribution kind handler; Plugin lifecycles.

Implementation status: all implemented.

- SpecdPlugin (src/domain/types/specd-plugin.ts): name/version/init/destroy required; install/uninstall/contribution optional; no `type`, no `configSchema`. OK.
- PluginContext {config, pluginConfig} only. OK.
- isSpecdPlugin delegates to `baseContractFields` (name via core `isPluginName`, version string, init/destroy functions, optional hooks functions). OK.
- Manifest (loader.ts `manifestSchema`): `.strict()` with `schemaVersion: z.literal(2)`, so `pluginType` and other schemaVersions are rejected with PluginValidationError. `contributes` is record-of-records so an array under `checks` fails. OK.
- Plugin name: regex lives in core (`PLUGIN_NAME_REGEX`, `isPluginName`), used in manifest, loader, isSpecdPlugin. Not re-verified in core here.
- Address: `buildContributionAddress` / `parseContributionAddress` both throw only InvalidContributionAddressError; CONTRIBUTION_ID_REGEX applied. OK.
- Config schema: `assertSupportedConfigSchema` walks nodes, enforces keyword whitelist, root object, type enum, required array of strings, additionalProperties boolean, items single object; non-object nodes yield `configSchema` (root) / `type` (nested). `resolvePluginConfig` rejects config with no schema. OK.
- Kind handler: `ContributionKindHandler` matches (activate/validatePlugin optional). `mergeHandlers` raises DuplicateHandlerKindError, used by both loader and registerPlugins (shared routine, as required). Unknown kind -> UnknownContributionKindError. OK.
- Lifecycles: install/uninstall use cases never call init; register-plugins calls init in list order. `installContextContributions` implements agents-only filtering. OK.

Discrepancies:

1. LOW: `PluginInstallContext.options` is typed `object` (code) vs `Readonly<Record<string, unknown>>` (spec). The code type is wider; consumers cannot index it without casts. Spec side: arguably should say `object` if agent options (`AgentInstallOptions`, an interface without index signature) must be assignable; `AgentInstallContext.options?: AgentInstallOptions` is only a valid narrowing of `object`, not of `Record<string, unknown>` (interfaces lack implicit index signatures). So code likely deviates deliberately; the spec snippet is probably what needs aligning.
2. LOW: `SpecdPlugin.install?` returns `Promise<unknown>` (code) vs `Promise<void>` (spec). Needed so `AgentPlugin.install` can return `AgentInstallResult` and `InstallPluginOutput.data` can carry it. Spec text for specd-plugin-type should say `Promise<unknown>` (the agent-plugin-type spec already says AgentInstallResult).
3. INFO: Spec states root `type` MUST be object; code additionally requires a `type` on every nested node (a node without `type` is rejected with keyword `type`). Spec lists `type` among keywords but never says it is mandatory per node. Stricter than spec; consistent with the Zod conversion. Consider documenting.

Test coverage (test/domain/{specd-plugin,types/is-specd-plugin,plugin-config-schema,resolve-contributions,errors,agents-handler}.spec.ts, test/infrastructure/plugin-loader.spec.ts, test/application/\*):

- Covered: scoped/unscoped name guard, non-function install, address build/parse failures, supported keywords + defaults, nested non-object/ bad type / bad required / bad additionalProperties / items array (plugin-config-schema.spec), config without schema, unknown kind (loader), pluginType rejected, duplicate handler, duplicate id across kinds, install does not call init, mixed-kind agents-only ids (install), init order.
  Missing tests:
- "Has required properties ... no `type`, no `configSchema` property" (no assertion on absence).
- "Name and version sourced from manifest" (factory-level; belongs to plugin packages, not asserted here).
- "Valid scoped names / Dot in scope or package / Uppercase rejected" for the name regex directly (regex is core; only `my-plugin` unscoped is tested here).
- "contributes must be a map of maps" (array under `checks`), and explicit `schemaVersion: 1` without `pluginType` (existing tests send `schemaVersion: 1` together with `pluginType`, so each cause is not isolated).
- "Non-object schema node rejected" for non-object ROOT with keyword `configSchema` (only nested cases asserted).
- "Handler validatePlugin receives plugin and name" with a custom (non-agents) handler (only agents handler path tested).
- "Install-time-only kind" with a non-agents handler lacking `activate` at registerPlugins.
- "Install context carries options" (no test in install/uninstall/update specs passes `options`; see below).
- "Duplicate id: cross-kind validation" asserts error class in loader test but not that it names the plugin.
  Counts: 36 scenarios; ~22 covered, ~5 partially, ~9 missing.

---

## 2. plugin-manager:plugin-loader

Requirements: Load workflow; Manifest schema; Error handling; Factory function.

Implementation status: all implemented (src/infrastructure/loader/plugin-loader.ts).

- Resolution via `createRequire` from `config.projectRoot/package.json`, then `import.meta.url`; failure -> PluginNotFoundError. OK (derivePackageRoot additionally verifies package.json name equals requested name).
- Manifest validated (strict Zod, config schema subset, contribution blocks, id uniqueness, defaultConfig vs configSchema) BEFORE `import()`. OK.
- Factory resolution: named `create`, default function, default object `{create}`; none -> PluginValidationError(['create']). `await createFunction({ config })` passes config only. OK.
- Runtime validation: base contract fields exact list, name/version cross-check, handler `validatePlugin`, `contribution` required if any kind has `activate`. OK.
- `createPluginLoader` throws DuplicateHandlerKindError at creation via `mergeHandlers`. OK.
- Loader never calls init/install/destroy. OK.

Discrepancies:

1. LOW: Loader does not verify that the manifest `name` equals the requested/resolved package name; only the runtime plugin name is compared to the manifest name. `derivePackageRoot` guarantees package.json name matches, but a package whose `specd-plugin.json` carries a different (valid) name and whose factory returns the same different name would load under the requested name. Spec step 9 only requires runtime == manifest, so strictly compliant; flagged as a gap either side could close.
2. INFO: Manifest Zod schema in code uses `configSchema: z.unknown().optional()` and validates the subset afterwards with `assertSupportedConfigSchema` (spec shows `PluginConfigSchemaSubset.optional()` inline). Behavior equivalent (UnsupportedSchemaKeywordError is thrown rather than a Zod issue, which matches the Error handling requirement).

Test coverage (test/infrastructure/plugin-loader.spec.ts, 19 tests):
Covered: not found, missing version, successful load, manifest invalid -> no import, unscoped name, duplicate id, unknown kind / invalid block / bad schema / bad default (single combined test), runtime mismatch and missing contribution accessor, no lifecycle calls (init not called), bad manifest shape, default-exported `{create}`, `export default create`, base-contract fields list (destroy only), pluginType, host `agents` handler -> DuplicateHandlerKindError, agents without install/uninstall, name mismatch, version mismatch.
Missing tests:

- "No factory export rejected" (field `create`).
- "Async factory awaited" explicitly (tests use sync factories).
- "Factory receives config only" with extra handlers.
- Named `create` export is likely covered by the main load test but not asserted by name.
- "Two host handlers of one kind (widgets) rejected" at loader level (only `agents` case; register spec covers the two-handler case at registerPlugins level).
- "Handler validatePlugin runs after base check / receives (plugin, name)" with a custom handler.
- Combined test (line 174) bundles four scenarios; failures would be hard to attribute (quality note).
- Resolution fallback to loader package location (`import.meta.url`) is untested.
  Counts: 31 scenarios; ~20 covered, ~3 partial, ~8 missing.

---

## 3. plugin-manager:register-plugins-use-case

Requirements: Signature; Registration order; Selection and config validation; Destroy and error isolation; Failure policy; Bypass.

Implementation status: all implemented (application use-case `register-plugins.ts` + infra wrapper `infrastructure/loader/register-plugins.ts`).

- Signature: infra `registerPlugins(builder, config, input = {})`, default loader `createPluginLoader({config, handlers})`; `RegisterPluginsInput` and `PluginRegistration` exported. OK.
- Load+validate (config, allowlist, duplicate names) all before first `init`; init in list order; activation per kind skipping handlers without `activate`; exactly one disposer `specd-plugins`. OK.
- Config: `resolvePluginConfig` applies defaults and rejects config without schema; `resolveContributions` throws UnknownContributionError. Duplicate entry -> PluginValidationError. OK.
- Destroy: reverse order, errors collected, AggregateError thrown after all ran, idempotent via `disposed` flag. OK.
- Failure policy: SpecdError passes unchanged, others wrapped in PluginInitError(cause); activate failures wrapped identically; rollback destroys initialized plugins in reverse, attaches `rollbackErrors` to the original, original always rethrown; no disposer registered on failure; failure of `registerDisposer` also rolls back. OK.
- Bypass/empty list: returns `{dispose: no-op}`, no disposer. OK.

Discrepancies:

1. LOW: With an empty/absent `plugins` list the application-level function returns before `mergeHandlers`, so a duplicate-handler wiring error is not raised when a custom `loader` is supplied and no plugins are configured. Spec: "MUST throw DuplicateHandlerKindError when it is set up, before loading any plugin". Through the public infra wrapper without a custom loader the error is still raised (createPluginLoader merges handlers eagerly). Edge case only.
2. INFO: Failing plugin's own `destroy` is not called when its `init` throws (only previously initialized ones). Consistent with scenarios ("destroy on b then a" when c fails); stated here as intentional.
3. INFO: Manifest `defaultConfig` is not applied at runtime when `config` is absent (only `configSchema` defaults are). Spec assigns defaultConfig persistence to the CLI, so consistent.

Test coverage (test/application/register-plugins.spec.ts, 18 tests, uses a fake builder and fake loader):
Covered: empty list, init order + single disposer + reverse destroy + idempotent dispose, partial init failure, invalid selection before init, config without schema, schema defaults, handler receives selected contributions only, duplicate plugin entry, load failure, aggregated destroy errors, agents-only init, validation before any init, rollback failure not masking, error isolation, duplicate handler kind (agents), schema violation -> InvalidPluginConfigError, SpecdError unchanged, activate failure wraps and rolls back.
Missing tests:

- "Called before build ... using a real KernelBuilder" (only a hand-rolled stub builder; no real `KernelBuilder` integration). MEDIUM-ish test gap, as the spec explicitly asks for a real builder.
- "Input defaults" (call without `input`, default loader and built-in handler): not exercised (every test passes a `loader`).
- Two same-kind host handlers (only `agents` case tested here; loader spec covers neither).
- "rollbackErrors" attached property is not asserted (test asserts original error only, per its title).
- "Dispose before any kernel exists" is covered by dispose calls on `registration`, but not explicitly "no kernel built".
- "Plugins disabled" is SDK-level (out of scope here).
  Counts: 28 scenarios; ~18 covered, ~3 partial, ~7 missing.

---

## 4. plugin-manager:install-plugin-use-case

Implementation status: implemented (install-plugin.ts). Loads via PluginLoader; resolves selection (UnknownContributionError); agents guard via `isAgentPlugin` (PluginValidationError fields ['install','uninstall']); context {config, contributions (agents-only filtering), options only when provided}; no-hook = success; hook errors: SpecdError rethrown, others wrapped in PluginValidationError(name, ['install'], cause); output `contributions` equals hook list; `defaultConfig` from manifest; `data` from hook; init/destroy not called; no config mutation. No discrepancies.

Note: when the manifest declares `agents` and only non-agent ids are selected, `contributions` passed to the hook is `[]` (consistent with spec's filtering rule).

Test coverage (install-plugin.spec.ts, 8 tests): installs selected, agents-without-hooks rejected, no hooks succeed without init, defaultConfig returned, unknown id, mixed kinds, wrapped error with cause, SpecdError unchanged, PluginNotFound propagates.
Missing tests:

- "All contributions selected by default" with `a`,`b` (default selection with 2 ids; covered indirectly at resolve-contributions level).
- "Allowlist respected" at use-case level.
- "Options forwarded only when provided" / `context.options` equals input (no test anywhere passes `options`).
- "Default config returned, not written" (no assertion that no file is written; trivially true since no writer is injected).
- Agent Initialization Phase scenarios (CLAUDE.md block, AGENTS.md shared markers): informative, belong to plugin-agent-\* and skills packages; not testable here.
  Counts: 19 scenarios; ~10 covered, ~1 partial, ~8 missing/out of scope (3 are plugin-agent-level).

---

## 5. plugin-manager:uninstall-plugin-use-case

Implementation status: implemented (uninstall-plugin.ts), mirrors install semantics, returns void. No discrepancies.

Test coverage (uninstall-plugin.spec.ts): selected contributions (agents-only), wrapped failure with cause, SpecdError unchanged, unknown id, agents without contract, no hook resolves without init, PluginNotFound propagates.
Missing tests: options forwarding; explicit "mixed kinds pass only agents ids" (the first test passes `['claude']`, only agents manifest); "not tied to the agents bucket" with a non-agents plugin that HAS an uninstall hook (existing non-agents test has no hook).
Counts: 13 scenarios; ~9 covered, 1 partial, 3 missing.

---

## 6. plugin-manager:update-plugin-use-case

Implementation status: implemented (update-plugin.ts). Same as install minus defaultConfig; output has success/message/contributions/data. No discrepancies. Idempotency delegated to plugin install as spec says.

Test coverage (update-plugin.spec.ts): selection `['claude']`, removed id -> UnknownContributionError, wrapped error with cause, agents without contract, SpecdError unchanged, idempotent twice.
Missing tests: selection preserved with a 2-id plugin (`b` not activated), mixed kinds agents-only, options forwarding, explicit PluginNotFoundError, explicit "no config written" (first test asserts no `defaultConfig` property).
Counts: 14 scenarios; ~9 covered, 1 partial, 4 missing.

---

## 7. plugin-manager:list-plugins-use-case

Implementation status: implemented (list-plugins.ts). Sequential load in input order, `loaded`/`not_found`/`error` mapping, `contributions` from `declaredContributionIds`, one failure does not stop others. `ListPluginsInput.pluginNames` is `readonly string[]` (spec prose says `readonly string[]`; code block says `string[]`; code matches prose). No discrepancies.

Test coverage (list-plugin.spec.ts): valid + invalid listed, not_found + continues, contributions for loaded.
Missing: explicit input-order test (b, a) beyond incidental order; invalid-manifest (unscoped name) entry is simulated with a thrown PluginValidationError rather than a real loader.
Counts: 7 scenarios; 5 covered, 2 missing.

---

## 8. plugin-manager:agent-plugin-type

Implementation status: implemented. `AgentPlugin`, `AgentInstallContext`, `AgentInstallOptions`, `TemplateVariable`, `AgentInstallResult`, `isAgentPlugin` in src/domain/types/agent-plugin.ts; `agentsContributionHandler` (no activate, strict empty-object blockSchema keyed by id regex, validatePlugin via isAgentPlugin) in src/domain/handlers/agents-handler.ts; built in by `mergeHandlers`, so no host wiring. Exported publicly. No discrepancies in plugin-manager.

Observation (INFO): Requirements "Agent installation and fallback" and the capability/frontmatter/sharedFolder rules are runtime obligations of agent plugin packages (plugin-agent-\*) and `@specd/skills`, not of plugin-manager. Not verifiable here; check in those packages' audits.

Spec vs code note (INFO): spec says the agents block is "a map from contribution id to an object ... unknown fields are rejected"; code accepts only `{}` per agent (`z.object({}).strict()`). Consistent today because no per-agent fields exist.

Test coverage: is-agent-plugin.spec.ts (valid, missing install, install+uninstall, recursive options typing), agents-handler.spec.ts (empty block accepted, no activate, unknown field rejected), loader test for agents without install/uninstall, register test for agents-only init.
Missing tests: missing-uninstall variant of isAgentPlugin; "Invalid id key rejected (Bad.Id) -> PluginValidationError" through the loader (the code path exists in validateContributions/blockSchema); "Unknown field rejected" through the loader (only at schema level); "Built-in handler needs no host wiring" through `registerPlugins` with no handlers; capabilities/frontmatter/sharedFolder/agent fallback scenarios (out of package).
Counts: 18 scenarios; ~10 covered, 2 partial, ~6 missing (about 4 belong to plugin-agent-\*/skills).

---

## 9. plugin-manager:load-plugin-use-case

Implementation status: implemented (load-plugin.ts): delegates to loader, returns `{plugin, manifest}`, errors propagate, no lifecycle calls, no duplicate base-contract check. No discrepancies.

Test coverage (load-plugin.spec.ts): returns loaded object, NotFound propagates, no init/destroy on a second run (the init/destroy spies are assigned after the first execute, so the second run is the effective check).
Missing: other typed loader errors (validation errors) propagating, explicit `install` not called.
Counts: 6 scenarios; 4 covered, 2 missing/weak.

---

## 10. plugin-manager:plugin-errors

Implementation status: all classes exist in src/domain/errors with spec codes: PLUGIN_NOT_FOUND, PLUGIN_VALIDATION_ERROR, DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD, PLUGIN_INIT_FAILED, DUPLICATE_HANDLER_KIND, INVALID_CONTRIBUTION_ADDRESS. All extend core `SpecdError`; plugin-named ones carry `pluginName` and name it in the message; `DuplicateHandlerKindError` has `kind`, no pluginName; `PluginValidationError` has `fields` and optional `cause`. `PluginInitError.cause` preserved. Exported via domain index. No discrepancies.

Minor (INFO): `PluginNotFoundError` / `PluginValidationError` declare `code` as `string` getter rather than literal types (spec has no type requirement).

Test coverage (errors.spec.ts): codes, pluginName, cause, messages containing plugin name (for PluginInitError, UnknownContributionError via message assertions, and validation error), DuplicateHandlerKindError code/kind, address error code, validation fields/cause.
Missing tests: `PluginNotFoundError.pluginName`, `PluginValidationError.code`, per-class "message contains plugin name" for all six classes (only some asserted); `DuplicateHandlerKindError` has no `pluginName` property; `UnsupportedSchemaKeywordError` keyword `configSchema` for non-object root (see specd-plugin-type).
Counts: 10 scenarios; 8 covered, 2 missing.

---

## 11. plugin-manager:plugin-repository-port

Implementation status: implemented. `PluginRepositoryPort` in src/application/ports/plugin-repository.ts with `addPlugin(configPath, name, options?: AddPluginOptions)`, `removePlugin(configPath, name)`, `listPlugins(configPath)`; `DeclaredPlugin = ConfigDeclaredPlugin` (alias of core type). Core `AddPluginOptions` in packages/core/src/application/ports/config-writer.ts has `config?` and `contributions?` matching the spec. The old name `PluginRepository` has no remaining references in packages/\*/src. No discrepancies.

Test coverage: test/application/plugin-repository-port.spec.ts has the type-level conformance check `ConfigWriter extends PluginRepositoryPort` assigned to a literal `true`, which fails typecheck on drift (covers "ConfigWriter is assignable" and "Signature drift fails compilation").
Missing tests: "DeclaredPlugin is the core type" (type identity assertion); interface-inspection scenarios (methods present, configPath first, no `type` param) are covered only implicitly by conformance; "CLI implementation uses ConfigWriter" belongs to CLI audit.
Counts: 9 scenarios; 4 covered, 1 partial, 4 missing/out of scope.

---

## Cross-cutting findings (priority order)

1. TEST GAP (most notable): no test anywhere in plugin-manager passes `options` to install/uninstall/update, though three specs (specd-plugin-type "Install context carries options", install "Options forwarded only when provided", uninstall/update options forwarding) have scenarios for it. Implementation is correct (`...(input.options !== undefined ? { options } : {})`).
2. TEST GAP: registerPlugins is only tested with a hand-written builder stub and an always-supplied loader. Spec scenarios "Called before build ... real KernelBuilder" and "Input defaults" are unverified.
3. TEST GAP: loader scenarios "no factory export (field create)", "async factory awaited", "factory receives config only" are untested.
4. LOW spec/code drift: `PluginInstallContext.options` (`object` vs `Readonly<Record<string, unknown>>`) and `SpecdPlugin.install` return type (`Promise<unknown>` vs `Promise<void>`); recommend updating the spec text, since code values are needed for `AgentInstallOptions` and `InstallPluginOutput.data`.
5. LOW: duplicate-handler check is skipped by application-level `registerPlugins` when the plugin list is empty and a custom loader is given.
6. LOW: manifest `name` is not compared to the requested plugin name in the loader.
