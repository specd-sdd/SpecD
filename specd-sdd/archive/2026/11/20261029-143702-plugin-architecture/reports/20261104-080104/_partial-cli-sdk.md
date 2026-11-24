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
