# Compliance audit (attempt 6) - change plugin-architecture - batch cli

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: merged spec-preview (specs + verify) read in full; code read in full (install/uninstall/update/list/show/get-declared-plugins, project/init, project/update, cli-context, cli-host, cli-cleanup, graph-index-task, package.json); tests read; plus real runs of `node packages/cli/dist/index.js` in a scratch git repo (exit codes and output confirmed).

Result: 0 critical, 0 major, 8 minor. All requirements are implemented. Every verify scenario has a test, but a few are covered only weakly (mocked use cases, or exit code not asserted).

Conventions: test paths are relative to packages/cli/test. "mocked" = the plugin-manager use case or installer is a vi.fn, so the test proves the CLI wiring only.

---

## cli:plugins-install (src/commands/plugins/install.ts)

Requirements: all OK.

- Command signature: `<plugin...>` at :117; `isPluginName` from the SDK at :192-194 (invalid names rejected per name before any load, :58-66). `--contributions` is trimmed and filtered at :133-139. Empty, comma-only or blank values go through `cliError` (exit 1) at :140-142, BEFORE `resolveCliContext` at :146. Several plugins plus `--contributions` is rejected at :143-145. The CLI passes no `handlers` to `createPluginLoader` (:49), so only the built-in agents handler exists. Real run: `install @acme/x --contributions ""` gives `error: --contributions requires at least one contribution id`, rc=1, and no config lookup (the scratch dir had no specd.yaml).
- Declaration source: `getDeclaredPlugins(config)` reads `config.plugins` in memory (:52). There are no `kernel.project.listPlugins` or `writer.listPlugins` calls.
- Display name: header `Installed plugins:` at :177. JSON/toon output is `{plugins, hasErrors}` at :183.
- Already installed: stderr `warning: X already installed; use 'specd plugins update'` (:69-70). Status is `skipped` and no install happens. A duplicated name within one invocation is handled via `declaredSet.add` at :91. Real run confirmed.
- Installation workflow: `InstallPlugin.execute` receives `contributions` only when the flag was given (:80-84). `addPlugin` gets `config` only when `defaultConfig !== undefined`, and `contributions` only when the flag was given (:85-90). `LoadPlugin`, `init` and `kernel.project.addPlugin` are never called. A failure is caught and the loop continues (:97-104).
- Host bootstrap: `plugins: false` at :148.
- Exit code: `CliExitError(1)` at :159-161. Output shape is OK.

Scenario -> test (plugins.spec.ts)
| Scenario | Test |
| Valid plugin names | :115 |
| Multiple plugin names | :204 (claude and copilot in one run) |
| Unscoped name rejected | :137, :204 |
| Contributions restriction | :163 (use case receives `['claude']`, addPlugin records it) |
| Contributions with several plugins rejected | :137 (second half; stderr text checked) |
| Empty contributions rejected | :261 and `it.each` :282 (`,` ` ` `,,` `,`); asserts resolveCliContext, InstallPlugin and addPlugin not called |
| Kind with no handler | :238 (see M1, M2) |
| Unscoped name triggers no install | :204 (mockInstall called 2 times, not 3) |
| Already-installed check uses config.plugins | :189 (no `kernel.project.listPlugins` assertion, see M5) |
| No ConfigWriter.listPlugins | :306, :316, :351 |
| Plugin already installed | :189 |
| Duplicate name in one invocation | :326 |
| Header | :361 |
| Calls InstallPlugin and records in config | :115 (`kernel.project.addPlugin` not asserted, see M5) |
| Default config persisted | :163 |
| No empty config written | :115 (`not.toHaveProperty('config')`) |
| Init is not run | :306/:351 assert LoadPlugin not called; `init` itself is never observed because InstallPlugin is mocked |
| Remaining plugins after a failure | :204 (claude fails, copilot installed and recorded, unscoped name not recorded) |
| Broken configured plugin | :115 (`resolveCliContext` receives `plugins: false`) |
| Exit code | :395 (only `ExitSentinel` thrown; the code value is not asserted, see M4) and :204 |
| JSON format and `hasErrors` | :369 (partial: `hasErrors` is checked only in :204, :238 and :326) |

---

## cli:plugins-uninstall (src/commands/plugins/uninstall.ts)

Requirements: all OK.

- Declared check via `findDeclaredPlugin` (:51-54). An undeclared name becomes a per-name error and neither the use case nor `removePlugin` is called.
- `UninstallPlugin.execute` gets `contributions` only when the entry has an allowlist (:55-61). Then `removePlugin` (:62). If the hook throws, `removePlugin` is skipped (catch at :68). `plugins: false` at :39. Output is `{plugins}` (:101). Exit 1 via `CliExitError` (:79-81).

Scenario -> test
| Scenario | Test |
| Uninstall multiple plugins | :678 |
| Uninstall failure (the other plugin is still uninstalled, exit 1) | :530 |
| Calls hook and removes from config | :477 (plus :530 for order, see M3) |
| Plugin with no uninstall hook | :657 (mocked) |
| Allowlist honoured | :521, :702 |
| Plugin not declared | :561 (use case and `removePlugin` not called, sentinel; code value not asserted) |
| Hook failure retains the declaration | :530 |
| Broken configured plugin / `plugins: false` | :521 |
| JSON output | :495 |

---

## cli:plugins-update (src/commands/plugins/update.ts)

Requirements: all OK.

- Declared set from `config.plugins` (:44). An undeclared name becomes a per-name error without calling `UpdatePlugin` (:58-67). `contributions` is passed only when an allowlist exists (:73-75). No `ConfigWriter` is used and `init` is never called. `plugins: false` at :112. Text output `no plugins to update` at :137-139. Output shape `{plugins, hasErrors}` at :146. Real run OK.

Scenario -> test (plugins-update.spec.ts)
| Scenario | Test |
| Update all | :94, :174 |
| Update specific | :104 |
| Update-all uses config.plugins (`kernel.project.listPlugins`) | :174 (checks `mockListExecute` and the writer listing; `kernel.project.listPlugins` is not asserted directly) |
| No ConfigWriter.listPlugins | :174 |
| Update failure (the other plugin is still updated, exit 1) | :157 |
| Idempotent (no ConfigWriter call) | :192 |
| Recorded selection preserved | :146 |
| Undeclared plugin | :123 (the "UpdatePlugin not called" part is not asserted, see M6) |
| `plugins: false` | :146 |
| JSON output (`updated` or `error`, `hasErrors`) | :157 |
| Text output (mixed) | :205 (exact lines) |
| Nothing declared | :221 |

---

## cli:plugins-list (src/commands/plugins/list.ts)

Requirements: all OK. One undocumented extra (M7).

- Rows come from `config.plugins` plus the `ListPlugins` use case. `toListRow` (:88-99) follows the spec: for `not_found`/`error`, `declared=[]` and `selected` is the allowlist or `[]`. Status `loaded` is mapped to `installed`. Version is `-` in text when unknown (:115). `no plugins declared` and `{plugins: []}` are handled. `plugins: false` at :44. The `--type` flag is absent.

Scenario -> test
| Scenario | Test |
| List all | :409 |
| Declarations from config snapshot / no writer listing | :715 |
| Regardless of kind | :724 |
| Broken configured plugin | :715 (`plugins: false`) |
| Installed | :409 |
| Not found (`declared` empty, `selected` allowlist) | :572 (text), :752 (JSON) |
| Load error (detail, `declared` empty) | :572, :752 |
| Text details | :422, :724 |
| Version column and `-` fallback | :572 (`@acme/missing  -  not_found`), :724 |
| Nothing declared (text and JSON) | :433 (JSON), :601 (text) |
| Allowlist shown (selected and available) | :572 (`selected: [lint]`, `available: scan`) |
| JSON parseable | :409 |

---

## cli:plugins-show (src/commands/plugins/show.ts)

Requirements: all OK.

- Name, version, contributions as kind/id/address (:35-41), `configSchema` and `defaultConfig`, and capabilities only when `install`/`uninstall` exist or `agents` is declared (:93-98). The capabilities line/field is omitted otherwise. `plugins: false` at :30. A load error goes to `handleError`, giving exit 1. `init` is not called (only `LoadPlugin` is used).

Scenario -> test
| Scenario | Test |
| Show details | :443, :466 |
| Contributions with addresses | :466, :782 |
| Plugin not found | :800 (stderr `error:` and name), :609 |
| JSON output | :443 |
| Config schema and default config | :619 |
| Capabilities with hooks or agents | :443, :466 |
| Capabilities omitted for checks-only (text) | :782 |
| Capabilities omitted for checks-only (JSON) | :619 |
| Init never called | :619 (`init` mock not called) |

---

## cli:project-init (src/commands/project/init.ts)

Requirements: all OK. The new spec statements were verified:

- Plugin names are validated at :72-75, BEFORE `initProject` (:91). Real run: `init --plugin my-plugin` gives rc=1, and the directory stays empty.
- Interactive detection uses option source (`getOptionValueSource === 'cli'`, :76-82), so an explicit `--workspace default` stays non-interactive.
- Cancel and decline: `outro('Cancelled.')` followed by `CliExitError(0)` at :191-194, :203-205, :216-218, :226-228, :236-238. `run.ts` exits explicitly with 0. The help text at :53-58 contains "exits with code 0".
- Overwrite prompt (:188-190) names the path ("specd.yaml already exists at <path>") and says that overwriting replaces the configuration "including its declared plugins and workspaces". It is asked before the schema, workspace and plugin prompts.
- The banner is printed only in the wizard (:172-179).
- `createConfigWriter().initProject` is used. `kernel.project.init`, `createInitProject` and `InitProject` are never used.
- Post-init install: `resolveCliContext({configPath, plugins:false})` (:148-151), then the shared `installPluginsWithKernel`. A failure keeps the init output and exits 1 (:124, :275).
- Known plugin options: exactly the 5 plugins (:14-20), `required:false`.
- JSON includes `metadataCachePath` taken from the `initProject` result (:117).
- `specd init` alias: registered at program.ts:220, with `project init` at :212. Real run: JSON output has all fields; re-run gives `ALREADY_INITIALISED`, rc=1, `error:` on stderr.

Scenario -> test (project-init.spec.ts)
| Scenario | Test |
| --plugin flag | :98 |
| Alias works identically | :431 (init alias only; no side-by-side comparison with `project init`, see M7) |
| Alias JSON identical keys | :457 |
| Plugin selection wizard | :258 |
| Selecting no plugin | :322 |
| Overwrite confirmation text | :350 (path, "Overwrit", "declared plugins"; "workspaces" is not asserted) |
| Cancelling the wizard | :304 (`exit(0)`, no `initProject`) |
| Declining the overwrite | :350, :278 |
| Help documents exit 0 | :371 |
| Banner only in wizard | :258 (`sdk   v` marker) |
| Explicit default flag stays non-interactive | :242 |
| Wizard includes opencode / standard (exactly five) | :322 |
| Default values give a valid config | :431 (CLI wiring only; the file content is covered by core config-writer.spec.ts :42) |
| No banner in non-interactive text | :412 |
| JSON with plugin results | :177 |
| Text metadata cache line | :482 |
| JSON `metadataCachePath` | :457 |
| Git root placement | :127 |
| CWD fallback | :140 |
| Standard directories, .gitignore, tmp gitignore, metadata dir and entry, `--force` re-init | core/test/infrastructure/fs/config-writer.spec.ts (:65, :84, :93, :104, :129, :408). CLI tests mock `initProject`. |
| Not InitProject / `kernel.project.init` | implicit via mocks only (see M5) |
| `metadataCachePath` surfaced, not re-derived | :457, :482 (the mock returns `.specd/metadata`, which is echoed) |
| Plugins installed after init (`configVersion: 2`, recorded in the list) | :98 asserts the call. The yaml content and `configVersion: 2` are core scope (the installer is mocked) |
| Post-init host without plugins | :98 (`configPath` and `plugins:false`) |
| Plugin failure after init | :220 (exit 1, init called once) |
| Invalid plugin name rejected before init | :208 (init not called, stderr text) |
| Non-interactive fails without --force | :500 (real writer; file unchanged; `error:`; exit 1) |
| --force overwrites | :537 (asserts only `force:true` is passed; the schema is not overwritten for real) |

---

## cli:project-update (src/commands/project/update.ts)

Requirements: all OK.

- Reuses `updatePluginsWithKernel({config})` (:36) with `plugins: false` (:34). It does not write the config. Text lines are `plugins: updated <n>` and `plugins: <status> <n> (<detail>)` (:49-51). Empty result prints `project is up to date` (exit 0). JSON is `{plugins, hasErrors}`. A failure gives exit 1 after all plugins are processed. A missing config propagates as an error with `error:` and exit 1.

Scenario -> test
| Scenario | Test |
| --format option | project-update.spec.ts :72 |
| Declared plugins updated via UpdatePlugin, exit 0 | project-update-allowlist.spec.ts :43 (real `updatePluginsWithKernel`, mocked `UpdatePlugin`) |
| Allowlist honoured | project-update-allowlist.spec.ts :43 |
| Host without plugins and config untouched | project-update-allowlist.spec.ts :43 (byte-identical file, no writer calls), project-update.spec.ts :42 |
| Text prefix | project-update.spec.ts :42, :103 |
| Up to date | project-update.spec.ts :57 |
| JSON | project-update.spec.ts :72, :122 |
| Missing specd.yaml | project-update.spec.ts :139 (`resolveCliContext` rejection is mocked) |
| Partial failure (first fails, second still updated, `hasErrors`, exit 1) | project-update.spec.ts :103, :122 (the "second still updated" part is a mocked result; the loop continuation is covered in plugins-update.spec.ts :157) |

---

## cli:host-context (src/helpers/cli-context.ts, cli-host.ts, cli-cleanup.ts, graph-index-task.ts)

Requirements: all OK.

- `resolveCliContext` delegates to `openCliHost` and then `openSpecdHost` with `configPath`, `options.kernel` (verbosity, console destination, optional callback `onLog` at cli-context.ts:56-65) and `options.plugins` only when provided (:95; the SDK default is on). The returned host is `CliContext` (config, configFilePath, kernel, createGraphProvider, dispose).
- Warnings are read from `config.warnings` and emitted once (:99-103).
- `openCliHost` forwards the input unchanged and registers `dispose` before returning (cli-host.ts:39-44). A failed open registers nothing because the registration comes after the `await`.
- The cleanup registry (cli-cleanup.ts) runs in reverse order, is idempotent through the memoized promise, reports `warning: cleanup failed: <msg>` (an AggregateError is flattened to one line per cause), and a late registration runs immediately.
- The graph worker opens with `plugins:false` in both modes (graph-index-task.ts:62-71) and disposes in `finally`.
- package.json has `@specd/sdk` as the only core/code-graph/sdk dependency. The other `@specd/*` entries are guide, plugin-\*, plugin-manager and schema-std, which are allowed.
- `resolveSdkHostContext` is gone (helpers/sdk-host.ts does not exist; grep finds no occurrence).

Scenario -> test
| Scenario | Test |
| Bootstrap through the helper | cli-context.spec.ts :96, cli-host.spec.ts :20 |
| Verbosity forwarded | cli-context.spec.ts :19 |
| Plugins enabled by default | cli-context.spec.ts :46 (asserts `options` has no `plugins` key; the SDK default is not verified here) |
| Plugins disabled | cli-context.spec.ts :81 |
| Warnings from config / once | cli-context.spec.ts :96, :125, :147 |
| onLog callback | cli-context.spec.ts :46, :65 |
| Commands use the helper / no direct bootstrap / no hand-built host | cli-context.spec.ts :216 (source scan, regex) |
| Helper registers cleanup / both forms / unchanged input / failed open | cli-host.spec.ts :20, :34, :48, :61 |
| CliContext carries dispose | cli-context.spec.ts :96 (shape); "dispose twice releases once" is weak (see M8) |
| Commands need not call dispose | cli-context.spec.ts :188 |
| Cleanup order / idempotent / late / failing / warning text | cli-cleanup.spec.ts :14, :30, :44, :61, :73, :84 |
| Cleanup on error exit and signals | run.spec.ts :51-:181, cli-signals.spec.ts, cli-signals-process.spec.ts :70 :80 :90 |
| Worker disposes on success / failure | graph-index-task.spec.ts :46, :62 |
| Worker `plugins:false` (both modes) | graph-index-task.spec.ts :26, :80 |
| package.json sole platform dependency | package-deps.spec.ts :9 |

---

## Findings (all minor)

M1 (plugins-install, spec vs output). Verify scenario "Plugin with a kind that has no handler" says the result is `error` "naming `UnknownContributionKindError`".

- Spec side: the entry is reported as `error` naming `UnknownContributionKindError`.
- Code side: the entry `detail` is `error.message` only (install.ts:97-103, :202-204). The real message is "Plugin 'x' declares unknown contribution kind 'checks'; register a handler for it or remove it from 'contributes'" (plugin-manager/src/domain/errors/unknown-contribution-kind-error.ts). It contains neither the class name nor the `UNKNOWN_CONTRIBUTION_KIND` code.
- The "register a handler" hint is not actionable from the CLI, which registers none.
- Fix either side: reword the scenario ("reported as an error for the unknown kind"), or include the code in the detail.

M2 (plugins-install, weak test). The no-handler scenario test (plugins.spec.ts:238) mocks `InstallPlugin` to reject with a hand-built error.

- It does not prove that the CLI registers only the agents handler: no test runs `createPluginLoader({config})` with a non-agents manifest through the CLI.
- That path is covered only in plugin-manager/test/infrastructure/plugin-loader.spec.ts.
- It also does not assert the class name or code that the spec names.

M3 (plugins-uninstall, weak test). "Hook is invoked before the declaration is removed" is asserted at plugins.spec.ts:556-558 using the first `invocationCallOrder` entries.

- In that test the first `removePlugin` call is for the SECOND plugin, so the ordering assertion is trivially true.
- It does not prove hook-before-remove for the same plugin. :477 and :678 do not check order.

M4 (several commands, weak test). Exit code 1 is checked only via `rejects.toThrow(ExitSentinel)` or `.rejects.toThrow()`.

- Locations: plugins.spec.ts :137, :204, :395, :530, :561, :609, :800; plugins-update.spec.ts :123, :157, :205.
- `ExitSentinel.code` is never compared to 1. project-init.spec.ts and project-update.spec.ts do assert `process.exit` called with 1.

M5 (negative assertions missing).

- No test asserts `kernel.project.listPlugins`, `kernel.project.addPlugin` or `kernel.project.removePlugin` are not called (install, update, uninstall).
- No test asserts `kernel.project.init` and `createInitProject` are not called in project-init.
- Only the writer, list and load mocks are checked. The code does not call them, so there is no behavior divergence.

M6 (plugins-update, weak test). The undeclared-plugin test (plugins-update.spec.ts:123) does not assert `UpdatePlugin` is not called for that name. The same gap applies to the "init not called" requirement in update and uninstall (the use case is mocked, so `init` is unobservable).

M7 (undocumented behaviors and unproven equivalence). These are not spec violations.

- `plugins list` text prints a header line `Installed plugins:` before rows (list.ts:113). The list spec is silent on this.
- `plugins list` text also prints `detail` for `not_found` rows (list.ts:97, :116). The spec says only "with a detail message for `error`", while JSON `detail?` is fine.
- The init alias equivalence scenario ("output identical to `project init`") has no side-by-side test. Both registrations call the same `registerProjectInit`, program.ts:212 and :220.
- Interactive init also has only `AVAILABLE_AGENT_PLUGINS`, with no validation (not needed).

M8 (host-context, weak test). Scenario "calling `dispose` twice releases the host once" (cli-context.spec.ts:199) asserts only `toHaveBeenCalled()`.

- The test comment admits the mock is not memoized, so idempotence is not verified in the CLI. It belongs to sdk:host-context.
- Also, "Plugins enabled by default" (:46) checks that no `plugins` key is passed rather than an enabled host. This is equivalent given the SDK default.

Other weak points of the same kind (not counted separately)

- init --force (project-init.spec.ts:537) verifies only that `force:true` is passed; the overwrite itself is proven by core tests.
- The overwrite-prompt test (:350) does not assert the word "workspaces", although the spec requires it. The code message does contain it.
- The project-update "missing config" test (project-update.spec.ts:139) mocks the `resolveCliContext` rejection and does not run the real config discovery.

## Contradictions with dependency or global specs

None found.

- The CLI registers no handlers beyond the built-in agents (install.ts:49), which is consistent with `sdk:host-context`, whose `pluginHandlers` default is `[]` (sdk/src/composition/host-context.ts:102).
- The package dependency rule is consistent with plugin-manager and the schema/plugin packages being allowed.
- `core:config-writer-port` calls used (`addPlugin`, `removePlugin`, `initProject`) match the port.

## Counts

critical 0 / major 0 / minor 8 (M1-M8). Requirements checked: 8 specs, all implemented. About 120 scenarios mapped; 0 with no test. About 12 are weakly covered (M2-M8).
