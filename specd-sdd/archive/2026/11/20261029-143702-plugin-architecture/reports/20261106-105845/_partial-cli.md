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
