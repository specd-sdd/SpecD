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
