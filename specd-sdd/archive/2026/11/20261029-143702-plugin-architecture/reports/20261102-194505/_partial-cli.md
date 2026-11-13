# Partial compliance report: batch "cli" (change plugin-architecture)

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, config-show, host-context.
Code: packages/cli/src (commands/plugins/\*, commands/project/{init,update}.ts, commands/config/show.ts, helpers/{cli-context,cli-host,cli-cleanup}.ts, graph-index-task.ts, run.ts). Tests: packages/cli/test.
Method: read-only; spec-preview merged content vs source and tests. Tests were not executed.

Severity legend: CRITICAL (spec requirement unmet / behaviour wrong), MAJOR (notable gap or spec/code contradiction), MINOR (cosmetic, wording, test gap).

---

## cli:plugins-install

### Requirements Summary

Command signature (scoped names, `--contributions` single plugin only); declaration source = `config.plugins` (flat); header `Installed plugins:`; already-installed warning ("already installed" then "update", no reinstall); workflow (InstallPlugin with contributions, `addPlugin(configPath, name, {config?, contributions?})`, continue on error, no `kernel.project.addPlugin`, no `init`); host bootstrap `plugins:false`; exit 1 on any failure; JSON output.

### Implementation Status

- Command signature: IMPLEMENTED. `install <plugin...>`, `--contributions <ids>` split on commas; `pluginNames.length !== 1` -> `cliError('--contributions requires exactly one plugin')`. Name validated by `isPluginName` from SDK before any load (install.ts `isValidPluginName`).
- Declaration source: IMPLEMENTED via `getDeclaredPlugins(config)` (reads `config.plugins`), no kernel/ConfigWriter.listPlugins.
- Display name: IMPLEMENTED (`Installed plugins:` in text mode).
- Already-installed: IMPLEMENTED. stderr `warning: <name> already installed; use 'specd plugins update'`, status `skipped`, no writer call. Also `declaredSet` is updated after install so duplicates in one invocation are skipped.
- Installation workflow: IMPLEMENTED. `addPlugin` options built conditionally (`config` only when `defaultConfig !== undefined`, `contributions` only when flag given). Errors caught per plugin, loop continues.
- Host bootstrap: IMPLEMENTED (`resolveCliContext({configPath, plugins:false})`).
- Exit code: IMPLEMENTED (`CliExitError(1)` after render when `hasErrors`).
- Output format: IMPLEMENTED. JSON/TOON emits the whole batch result.

### Discrepancies

- MINOR: JSON/TOON output leaks internal `hasErrors` (renderInstallOutput does `output(result, format)` with `PluginInstallBatchResult`; test plugins-update.spec asserts `parsed.hasErrors` for update, same shape). Spec only lists name/status/details. `project update` JSON emits only `{plugins}` so the surfaces are inconsistent. Either spec should bless `hasErrors` or code should emit `{plugins}` only.
- MINOR: spec "Display name" says header `Installed plugins` "with a trailing colon" while the verify scenario says `Installed plugins:`; consistent with code. No issue, only noting header is also printed when all entries are errors/skipped (fine).
- MINOR: invalid-name rejection does not use the CLI usage-error path, it is a per-name `error` entry and exit 1. Verify scenario "command fails for that name" matches; "Contributions with several plugins rejected -> usage error" is implemented through `cliError` (exit code per entrypoint rules, not verified here).
- MINOR (spec wording): `Spec Dependencies` lists `plugin-manager:load-plugin-use-case` "validates plugin before installation"; the CLI never calls LoadPlugin, it relies on `InstallPlugin` (which loads internally). Spec might be wrong (wording) or code could be wrong if a separate pre-validation was intended. Likely spec wording.
- No contradiction found with `plugin-manager:specd-plugin-type` name rule (code reuses SDK `isPluginName`).

### Test Coverage (test/commands/plugins.spec.ts)

Covered: install + persist declaration (no `config` key in options; `plugins:false` asserted); unscoped name rejected; `--contributions` with several plugins rejected; contributions + defaultConfig persisted and passed to InstallPlugin; already-installed warning (stderr contains "already installed" and "update"); JSON output; exit 1 on failure.

### Missing Tests

- Already-installed: no assertion that InstallPlugin/addPlugin were NOT called (only warning text).
- Unscoped name: no assertion that no load/install was attempted (`mockInstall` not checked).
- "Continues with remaining plugins after a failure" (multi-plugin with first failing) not tested.
- `kernel.project.addPlugin` / `listPlugins` / `ConfigWriter.listPlugins` not-called scenarios not asserted.
- "Init is not run" scenario not asserted (plugin-manager mock has no init).
- Header `Installed plugins:` text output not asserted.
- "Install works with a broken configured plugin" only indirectly covered via `plugins:false` call assertion.

---

## cli:plugins-uninstall

### Requirements Summary

Positional `<plugin>...`; per-plugin: load, resolve selected contributions from `config.plugins` entry, call UninstallPlugin, `removePlugin(configPath,name)`; undeclared name -> per-name error without calling the plugin; no `kernel.project.removePlugin`, no type bucket, no `init`; `plugins:false`; exit 1 on any failure but continue; output `uninstalled` or error, JSON parseable. Constraint: uninstall hook before config removal.

### Implementation Status

- Signature: IMPLEMENTED.
- Workflow: IMPLEMENTED. `findDeclaredPlugin` -> throws `plugin '<n>' is not declared in specd.yaml` before calling UninstallPlugin; passes `contributions` only when present (UninstallPlugin defaults to all declared ids when omitted, verified in plugin-manager `uninstall-plugin.ts`); `removePlugin` only after `uninstall.execute` succeeded (ordering constraint met; if the hook throws, the declaration is retained).
- Host bootstrap `plugins:false`: IMPLEMENTED.
- Exit code: IMPLEMENTED.
- Output: IMPLEMENTED (`{ plugins }` for json/toon).

### Discrepancies

- MINOR (spec vs code wording): step 1 says "MUST load the plugin via `LoadPlugin` use case"; code builds `UninstallPlugin(loader)` which calls `loader.load` itself. Behaviourally equivalent; spec wording is more specific than code. Spec Dependencies also list `load-plugin-use-case`. Spec probably over-specified; alternatively code deviates.
- MINOR: undeclared error is detected before plugin load, matching the spec ("without calling the plugin").

### Test Coverage

Covered: uninstall removes declaration (`removePlugin` args asserted); JSON output with `uninstalled` status.

### Missing Tests

- Allowlist honoured (`uninstall` receives `['audit']`): `UninstallPlugin.execute` mock args never asserted.
- Plugin not declared -> error entry, plugin not called, exit 1.
- Exit 1 on failure and continuation over remaining plugins.
- Multiple plugins scenario.
- Plugin that contributes only `checks` (no `uninstall` hook) scenario.
- Ordering (hook before removePlugin) and `removePlugin` NOT called when hook fails.
- `plugins:false` not asserted for uninstall (only install/show/project-update assert it).
- `kernel.project.removePlugin` not-called not asserted.

---

## cli:plugins-update

### Requirements Summary

Optional names; enumerate from `config.plugins`; no args = all; named but undeclared = error for that name; each plugin updated with recorded `contributions` allowlist; idempotent; does not mutate config; no `init`; `plugins:false`; exit 1 on any failure; output `updated|skipped|error`; JSON.

### Implementation Status

- All IMPLEMENTED in `updatePluginsWithKernel` (update.ts): declared map from `config.plugins`; undeclared -> `error` entry; `UpdatePlugin.execute({pluginName, config, contributions?})`; no writer usage, so config is never mutated; `plugins:false`; exit 1 via `CliExitError`.
- Output status `skipped` is part of the type but is never produced by this command (no code path yields `skipped`).

### Discrepancies

- MINOR: `skipped` status is declared in spec/type but unreachable. Spec could drop it or code could emit it (e.g. nothing to update). Low impact.
- MINOR: JSON output includes `hasErrors` (same as install). Test in plugins-update.spec asserts it, so it is de facto contract.
- MINOR: text output when `plugins` is empty prints `no plugins to update` (not specified); `project update` prints `project is up to date` instead. Harmless.
- MINOR: undeclared-name case: `hasErrors=true` -> exit 1 (spec says exit 1 on any failure; consistent).

### Test Coverage (test/commands/plugins-update.spec.ts)

Covered: update-all, update specific names, undeclared name reports error + exit.

### Missing Tests

- "Recorded selection preserved": `UpdatePlugin.execute` called with `contributions` from the declaration (mock args not asserted); `extra` not activated.
- `plugins:false` host bootstrap not asserted.
- Idempotency / `specd.yaml` unchanged (no writer call) not asserted.
- Exit code 1 when UpdatePlugin throws, with continuation over remaining plugins.
- `kernel.project.listPlugins` / `ConfigWriter.listPlugins` not-called.
- Text output mode not tested; JSON test for `skipped` n/a.

---

## cli:plugins-list

### Requirements Summary

No `--type` flag; enumerate `config.plugins` (flat); `plugins:false`; status `installed|not_found|error`; output name, contributions (declared + selected), version, status; JSON; read-only.

### Implementation Status

- Signature (no `--type`): IMPLEMENTED.
- Declaration source / host `plugins:false`: IMPLEMENTED.
- Status detection: IMPLEMENTED via `ListPlugins` use case from plugin-manager: `loaded -> installed`, `not_found`, else `error`, with `detail` from `item.error`.
- Output: IMPLEMENTED. Text: `<name>  <version|->  <status>  selected: [a, b]  available: c  <detail>`; JSON `{plugins:[{name, contributions:{declared, selected}, status, version?, detail?}]}`.
- Read-only: IMPLEMENTED.

### Discrepancies

- MINOR: when no plugins are declared the text output is `no plugins declared` without header; JSON `{plugins: []}`. Not specified; fine.
- MINOR: for `not_found`/`error`, `contributions.declared` is empty (manifest unavailable) and `selected` falls back to `[]` when the allowlist is absent. Spec says "all when absent", which cannot be computed without a manifest. Acceptable; spec could state this explicitly.
- MINOR: all three status branches (`installed`, `not_found`, `error`) duplicate near-identical code; no spec impact.

### Test Coverage

Covered: JSON list with `installed` status; text output `selected: [claude]`; empty list JSON.

### Missing Tests

- `not_found` and `error` status scenarios (mock only returns `loaded`).
- "Allowlist shown" with `a` selected and `b` available (the `available:` text branch is untested).
- `plugins:false` not asserted for list; "lists with a broken configured plugin" not tested.
- "All declared plugins listed regardless of kind" (agents + checks) not tested.
- `kernel.project.listPlugins` / `ConfigWriter.listPlugins` not-called.
- Version column and `-` fallback not asserted.

---

## cli:plugins-show

### Requirements Summary

Single positional; display name, version, contributions (kind, id, address `<name>.<id>`), configSchema and `defaultConfig` if any, capabilities (when plugin contributes agents); JSON; `plugins:false`, never `init`; load failure -> error + exit 1; read-only.

### Implementation Status

- IMPLEMENTED: `LoadPlugin.execute({pluginName})`, contributions flattened from `manifest.contributes` with `buildContributionAddress`, configSchema/defaultConfig conditional, JSON/text output, `plugins:false`. Errors go through `handleError` (exit code 1 assumed per entrypoint mapping).

### Discrepancies

- MINOR: spec says capabilities are shown "when the plugin contributes agents"; code always prints `capabilities: ...` (possibly an empty string in text, `[]` in JSON) and derives `install`/`uninstall` from the plugin implementing the hooks OR declaring the `agents` kind. Spec says agents-only; code is broader. Likely spec should say "install/uninstall hooks implemented". Verify scenario for JSON requires `capabilities` present, which supports the code.
- MINOR: text output with zero capabilities prints `capabilities: ` (trailing empty value).
- MINOR (spec defect): `Spec Dependencies` link path `../plugin-manager/load-plugin-use-case/spec.md` lacks the extra `../` used by sibling plugin specs (`../../plugin-manager/...`), so the link is broken. Also does not list `cli:host-context` although it requires `plugins:false`.

### Test Coverage

Covered: JSON show (name, capabilities, contributions with address, `plugins:false`); text output with contribution address and capabilities without `init`.

### Missing Tests

- Load failure -> error message and exit code 1 ("Plugin not found" scenario).
- configSchema / `defaultConfig` display.
- Plugin without `agents` contributions (e.g. checks only) capability output.
- Not-calling `init`.

---

## cli:project-init

### Requirements Summary

Signature with `--plugin` repeatable, `--force`, alias `specd init`; interactive mode (TTY, text format, no config flags) with banner, prompts and plugin multiselect; known plugin options (claude, copilot, codex, opencode, standard); non-interactive text/json output (`initialized specd in ...`, `metadata cache: ...`, per-plugin lines; JSON with `plugins`); config placement at git root else cwd; delegation to `createConfigWriter().initProject` only; plugins installed after init via plugin install logic recorded in flat `plugins` list with `configVersion: 2`; already-initialised handling.

### Implementation Status

- Signature/alias: IMPLEMENTED (alias registration is in program; init tests use `specd init`).
- Interactive: IMPLEMENTED with `@clack/prompts`; plugin multiselect uses `AVAILABLE_AGENT_PLUGINS` = exactly the 5 spec'd names. Overwrite confirmation implemented.
- Non-interactive outputs: IMPLEMENTED (text lines; JSON `result, configPath, schema, workspaces, metadataCachePath, plugins`).
- Root placement: IMPLEMENTED (`createVcsAdapter().rootDir()` fallback `process.cwd()`).
- Delegation: IMPLEMENTED (`createConfigWriter().initProject`); CLI never writes YAML.
- Plugin install after init: IMPLEMENTED by `installSelectedPlugins` -> `resolveCliContext({configPath, plugins:false})` + `installPluginsWithKernel`. `configVersion: 2` and flat list are produced by core ConfigWriter (outside this audit; not verified in the CLI).
- Already initialised: delegated to `initProject` (non-interactive error path relies on writer throwing; exit 1 + `error:` via `handleError`).

### Discrepancies

- MINOR: the ASCII banner is printed in every text-format invocation (including non-interactive with flags), while the spec scopes the "Welcome header" to interactive mode. In non-interactive text mode the spec output starts with `initialized specd in ...`. Either spec is wrong (banner always shown) or code should print the banner only in the wizard.
- MINOR: interactive detection compares `opts.workspace !== 'default'` and `opts.workspacePath !== 'specs/'` against defaults, so explicitly passing the default values (`--workspace default`) still enters the wizard on a TTY; spec says "no configuration flags provided". Edge case (code wrong or spec ambiguity).
- MINOR: exit code after a plugin install failure (`hasErrors`) is 1 even though init succeeded; spec silent. Reasonable, but undocumented partial-failure behaviour.
- MINOR: `--plugin` accepts names with no early validation; invalid names produce `error` entries from install logic and exit 1 after init has already created files.
- MINOR: `Spec Dependencies` lacks `cli:host-context` (init uses `resolveCliContext({plugins:false})`) and the spec says "standard config discovery is not invoked", which is only true for the init step, not for the plugin step (loads the freshly written config with an explicit `configPath`). Spec wording gap.
- MINOR: spec text mentions "skills installation" heading while content is plugin install (stale naming, harmless).
- Consistency with cli:plugins-install: init relies on the same install function, so `configVersion: 2` list recording stays consistent. No contradiction.

### Test Coverage (test/commands/project-init.spec.ts)

Covered: `--plugin` install after init; opencode plugin; JSON with plugin results; `specd init` alias with `initProject`; JSON output; metadata cache line in text; exit 1 when exists without `--force`; `--force` overwrite; excess positional args rejected.

### Missing Tests

- Interactive wizard (plugin multiselect options, includes opencode/standard, overwrite confirm, cancel) has no tests.
- `metadataCachePath` JSON field assertion and "surfaced from result, not re-derived".
- Root placement (git root vs cwd).
- `plugins:false` used by the post-init install context; failure of plugin install -> exit 1.
- `standard` plugin option scenario; tmp `.gitignore` / directory / `.gitignore` scenarios are core-level (not CLI testable here).

---

## cli:project-update

### Requirements Summary

`project update [--format]`; runs plugin update logic for all declared plugins honouring allowlist, host with `plugins:false`; text lines prefixed `plugins: updated <name>`; `project is up to date` when nothing to update; per-plugin result lines to stdout, skills warnings to stderr (no exit change), all plugins processed then exit 1 on any error; requires specd.yaml.

### Implementation Status

- IMPLEMENTED: delegates to `updatePluginsWithKernel({config})` (shared with `plugins update`), `plugins:false`, `plugins: updated <name>` for updated; others `plugins: <status> <name> (<detail>)`; empty -> `project is up to date` (text) or `{plugins: []}`; JSON `{plugins}`; exit 1 on errors after processing all.
- Missing specd.yaml: `resolveCliContext` throws -> handled -> exit 1 with `error:`.

### Discrepancies

- MAJOR (spec staleness / contradiction with dependencies): the spec still describes "skills update" (Purpose, Requirement titles `Skills update step`, Partial failure "warnings (skill no longer in bundle) ... to stderr as in `specd skills update`", Constraint "In v1 the only update step is skills", dependency on `cli:skills-update` and "skills manifest" in `core:config`). There is no `cli:skills-update` spec in specs/cli (directory has no such entry) so the dependency link is dangling, and the code has no concept of skill warnings. Spec wrong (should be rewritten around plugins) is far more likely than code wrong.
- MINOR: Verify scenario "Warnings from skills update do not change exit code" cannot be satisfied or tested; stale.
- MINOR: Verify scenario "Declared plugins are updated: each plugin's `install()` method is called" - code calls `UpdatePlugin`, not `install()` directly; behaviour is mediated by plugin-manager (update-plugin-use-case). Wording of the scenario may be stale.
- MINOR: `Nothing to update` also applies when plugins are declared but all `skipped`; code only prints the up-to-date message when no plugins at all (skipped is never produced anyway).
- MINOR: JSON for the error case: `{plugins}` only; unlike `plugins update`, there is no `hasErrors` field (inconsistent but spec-compliant).

### Test Coverage (test/commands/project-update.spec.ts)

Covered: step-prefixed text; up-to-date message; grouped JSON; exit 1 on plugin error. `plugins:false` asserted. (updatePluginsWithKernel is mocked.)

### Missing Tests

- Missing `specd.yaml` -> exit 1 + `error:`.
- Continue-and-aggregate: second plugin still updated after first fails (mocked at a level that hides this; covered only transitively by plugins-update tests, which also do not test it).
- Allowlist honoured through project update (mocked away).
- Stale skills warning scenario (no test, and not implementable).

---

## cli:config-show

### Requirements Summary

`config show [--format]`; text summary incl. `plugins:` section listing flat list with `(present)` and `[contributions: ...]` only when an allowlist exists; json/toon serialize `SpecdConfig` directly; no sensitive fields; errors via entrypoint exit rules; read-only.

### Implementation Status

- IMPLEMENTED. `renderText` emits `projectRoot`, `specdPath`, `schemaRef`, `approvals`, workspaces (name, ownership, adapter), storage (+ `pattern:`), `context`, `contextIncludeSpecs`/`contextExcludeSpecs`, `llmOptimizedContext`, `schemaPlugins`, `plugins`, `schemaOverrides`. JSON/TOON `output(config, fmt)` directly.
- Command uses `loadConfig` (config loader only, no host/plugin bootstrap), so it never loads plugins; compatible with the "broken plugin" goal.

### Discrepancies

- MINOR: `--help` text (`addHelpText`) documents a stale JSON schema (`specsPath`, `isExternal`, `changesPath`, ...) that no longer matches `SpecdConfig` and the spec's "serialize SpecdConfig directly"; code (help text) wrong.
- MINOR: text `contributions` suffix has two leading spaces (`  [contributions: ...]`); spec example shows single bracket suffix without precise spacing. Cosmetic.
- MINOR: spec text template shows `[type: <adapter>]  config: ...` for workspaces; code prints `[type: <adapter>]  config: ...` with ownership first. Consistent with the example.
- MINOR: `schemaPlugins` printed with a preceding blank line, spec lists it inline with the group (cosmetic).
- Spec example output omits `contextExcludeSpecs`/`schemaPlugins`; fine since optional.
- Spec dependency on `core:config` fine; no contradiction with `core:config` plugins shape (flat list of `{name, config?, contributions?}` matches `DeclaredPluginEntry`).

### Test Coverage (test/commands/config-show.spec.ts)

Covered: text sections, approvals, JSON full config, optional fields omitted, workspaces, multiple workspaces, plugins in text with `[contributions: codex]`, `artifactRules` not shown, config not found.

### Missing Tests

- `plugins` shown without contributions suffix when no allowlist (negative case).
- TOON output.
- Sensitive-fields scenario trivially covered by absence of redaction.

---

## cli:host-context

### Requirements Summary

`resolveCliContext` delegates (via CLI host-opening helper) to `openSpecdHost` with `configPath`, `options.kernel`, `options.plugins` (default true); `plugins?: boolean` option; returns `CliContext` (SdkHostContext + `config`, `configFilePath`); warnings from `config.warnings` once; kernel options kept in CLI; only `resolveCliContext`/helper call SDK bootstrap; helper `openCliHost` wraps `openSpecdHost`/`createSdkContext`, registers `dispose` in cleanup registry, forwards input unchanged, failed open registers nothing; `resolveSdkHostContext` and hand-built host removed; `CliContext` exposes `dispose`; cleanup registry semantics (reverse order, idempotent, failure warnings, late registration invoked immediately); entrypoint triggers registry; graph index worker uses `plugins:false` and disposes in `finally`; package.json: `@specd/sdk` sole platform dependency.

### Implementation Status

- resolveCliContext: IMPLEMENTED (cli-context.ts). `options.kernel = buildCliKernelOptions({onLog})`; `plugins` forwarded only when defined (so default true is the SDK's default).
- Warnings: IMPLEMENTED once per call from `config.warnings` via `console.warn('warning: ...')`.
- Host-opening helper: IMPLEMENTED (cli-host.ts): overloads for discovery and resolved-config forms; registers `host.dispose()` after successful open only. NOTE: the cleanup callback is registered after the host exists; a failed open registers nothing.
- CliContext type: IMPLEMENTED (cli-context-types.ts; host returned directly with `config`/`configFilePath`).
- Cleanup registry: IMPLEMENTED (cli-cleanup.ts): reverse order, memoized promise, `warning: cleanup failed: ...` on stderr, AggregateError flattened, late registration runs immediately (`void runOne`).
- Entrypoint triggers: IMPLEMENTED in run.ts (`await runCliCleanup()` after parse, both on success and error) and cli-signals.ts (signal path).
- Graph worker: IMPLEMENTED (graph-index-task.ts): `plugins:false` for both configured and bootstrap modes; `host.dispose()` in `finally`.
- Package deps: IMPLEMENTED (package.json has `@specd/sdk`; no `@specd/core`/`@specd/code-graph`; no src imports from those packages found).
- `resolveSdkHostContext` removed; no hand-built host in src (grep clean).
- Plugins:false usage by management commands: install, uninstall, update, list, show, project update and project init install step all pass `plugins:false`.

### Discrepancies

- MINOR: spec says "emit each warning ... at most once"; it is emitted by `resolveCliContext` via `console.warn`, but `loadConfig` (used by `config show`) emits its own warnings separately. Not a violation but two code paths for warnings. Spec only covers `resolveCliContext`.
- MINOR: `config show` and any command using `loadConfig` bypass `resolveCliContext`/helper. Spec "Host bootstrap entry point" only constrains host bootstrap (`openSpecdHost`/`createSdkContext`), not config loading, so no violation; noted for completeness.
- MINOR: spec verify scenario "Kernel options forwarded for verbosity" says `openSpecdHost` receives `kernelOptions`, whereas the requirement text and code use `options.kernel` (the test title in cli-context.spec says `options.kernel`). Spec inconsistency inside host-context (verify.md wrong).
- MINOR: spec dependency link to `core:kernel` uses `../../../../specs/core/kernel/spec.md` while siblings use `../../core/...`; likely broken link path in spec.
- MINOR: spec for the cleanup registry says a failing cleanup is reported as a `warning:` line; the actual text is `warning: cleanup failed: <msg>`. Compatible.
- MINOR: `graph-index-task.ts` calls `openSpecdHost`/`createSdkContext` directly, allowed by the spec exception for the worker (no discrepancy).
- MINOR: kernel-dispose timing: spec says commands need not call `dispose` because registry releases hosts; run.ts awaits `runCliCleanup()` before `process.exit`, satisfying the "every exit path" requirement from `cli:entrypoint` (entrypoint spec itself not audited here).

### Test Coverage

- cli-context.spec.ts: `-vv` trace destination; `plugins:false` forwarded; warnings read from config and context shape; once-per-bootstrap; no warnings when absent; `buildCliKernelOptions` paths; host released via registry without dispose; dispose once; source scan for no direct SDK bootstrap / no hand-built host / no `helpers/sdk-host.ts`.
- cli-host.spec.ts: opens via `openSpecdHost`, registers dispose; `createSdkContext` form; input forwarded unchanged; failed open registers nothing.
- cli-cleanup.spec.ts: reverse order; idempotent concurrent; failing cleanup does not stop others; AggregateError; late cleanup invoked immediately; late failure warning.
- graph-index-task.spec.ts: configured and bootstrap contexts with `plugins:false`; dispose on success and failure; SDK boundary.
- run-host-release.spec.ts: host disposed at exit without command calling dispose.
- package-deps.spec.ts: `@specd/sdk` present, core/code-graph absent.

### Missing Tests

- "Plugins enabled by default" (no `plugins` option -> SDK host opened with plugins enabled/undefined) not asserted.
- Optional `onLog` callback wiring scenario ("Optional onLog callback wired").
- `plugins:false` -> "no plugin is loaded or initialized" is SDK-level; not testable in CLI.
- `CliContext` `[Symbol.asyncDispose]` presence not asserted.
- `plugins:false` assertion in the graph worker for the bootstrap mode exists; failing configured plugin does not break indexing not tested.
- Cleanup on error exit path (`CliExitError`) and signal paths: run.spec/cli-signals specs exist (covered under `cli:entrypoint`).

---

## Cross-spec findings

1. MAJOR: `cli:project-update` is stale vs the plugin architecture (skills terminology, dangling `cli:skills-update` dependency, unimplementable verify scenario). Needs spec rewrite in this change.
2. MINOR: `hasErrors` in JSON for install/update vs spec and `project update`: undefined contract.
3. MINOR: `cli:plugins-show` capabilities rule differs from implementation; spec dependency link broken; missing `cli:host-context` dependency.
4. MINOR: verify.md of `host-context` references `kernelOptions` instead of `options.kernel`.
5. Test coverage for plugin management commands is thin on negative paths (undeclared plugin, allowlist propagation, continue-on-error, not-found/error statuses); most requirement-level behaviours are implemented but not asserted.

## Summary counts

- Critical: 0
- Major: 1 (project-update stale skills spec / dangling dependency)
- Minor: 40 approx. (spec wording/test-gap level; the notable code-side minors are: banner shown in non-interactive init, wizard entered when default flag values are passed explicitly, unreachable `skipped` status, `hasErrors` leaking into JSON, stale `config show --help` JSON schema, capabilities shown without agents condition)
- Missing-test groups: install 7, uninstall 8, update 6, list 6, show 4, project-init 5, project-update 4, config-show 3, host-context 4.
