# Compliance audit, batch `cli`, change `plugin-architecture`, attempt 8

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: merged spec-preview (specs + verify) vs `packages/cli/src` and `packages/cli/test`. `dist/index.js` is newer than the sources (checked mtime). I ran the built CLI in scratch git repos under the session scratchpad (`r1`, `r2`, `r3`).

Totals: critical 0, major 0, minor 13 (all spec-vs-code nits or weak or indirect tests). All attempt-7 fixes verified.

All paths below are under `packages/cli/` unless stated. `T:` is `test/commands/`.

## Attempt-7 items, verified

| Item                                                                                                                              | Evidence                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins list` text column order is name, status, version-or-dash, selected                                                       | `src/commands/plugins/list.ts:121-123`. Run: `@acme/x  installed  1.0.0  selected: [audit]  available: extra`. Tests: `T:plugins.spec.ts:609-610`, `771-772`, `931` |
| `uninstall X X` processes once and reports `skipped` / `already processed`                                                        | `uninstall.ts:48-55`. Run: exit 0, `@acme/x  skipped  already processed`. Tests: `T:plugins.spec.ts:842-871` (hook once, `removePlugin` once, exit 0)               |
| Declared plugin with a missing package: declaration removed, `uninstalled`, `package not found; only the declaration was removed` | `uninstall.ts:62-74`. Run: exit 0, `grep acme specd.yaml` gives 0. Test: `T:plugins.spec.ts:873-896`. See M8, the test is mocked                                    |
| Undeclared name gives error and exit 1, `removePlugin` not called                                                                 | Run confirmed. Test: `T:plugins.spec.ts:571-582`                                                                                                                    |
| Hook failure keeps the declaration                                                                                                | `T:plugins.spec.ts:539-569`, plus `898-919`                                                                                                                         |
| Install: `--contributions ""`, `,`, `' '` rejected before the host is resolved                                                    | `install.ts:133-145`. Tests: `T:plugins.spec.ts:268-311`                                                                                                            |
| Install: unknown kind gives an `UnknownContributionKindError` message                                                             | Run and `T:plugins-install-real-loader.spec.ts:75-98` (real loader)                                                                                                 |
| Init through the real writer on a temp git repo                                                                                   | `T:project-init.spec.ts:582-618`. See M4 for what it does not assert                                                                                                |
| Host-context and dispose tests                                                                                                    | `test/helpers/cli-cleanup.spec.ts`, `cli-host.spec.ts`, `cli-context.spec.ts:186-221`, `test/run.spec.ts`, `test/run-host-release.spec.ts`                          |

## Behaviour confirmed by running the CLI

- **Broken plugin and `plugins: false`.** With a declared plugin whose `init` throws:
  - `change list` fails with `error: Plugin '@acme/x' failed during init: INIT BOOM`, exit 1.
  - `plugins list|show|update|uninstall|install` and `project update` all work.
- **Install.**
  - Unscoped name: `error ... invalid plugin name`, exit 1.
  - `--contributions ""`: exit 1, `requires at least one contribution id`.
  - `--contributions` with two plugins: exit 1, `requires exactly one plugin`.
  - Unknown contribution id: `error`, exit 1, nothing recorded.
  - Duplicate `x x`: installed once, then `skipped` plus a stderr warning containing "already installed" and "update". Exit 0.
  - `defaultConfig` is written only when the manifest has one (`config: k: 1` recorded).
  - Allowlist `contributions: [audit]` is written only with `--contributions`.
  - Kind `checks` with no handler: `error`, exit 1, not recorded.
- **Update, list, show.**
  - `plugins update @acme/unknown`: error, exit 1.
  - Missing package: `list` shows `not_found`, `declared: []`, `selected` equal to the allowlist.
  - Invalid manifest: `list` shows `error` with detail.
  - Missing package: `update`, `show` and `project update` exit 1.
- **Uninstall.** `uninstall @acme/nope @acme/x` handles x anyway: x is `uninstalled`, nope is `error`, exit 1.
- **Init.**
  - From a subdirectory, `specd.yaml` goes to the git root.
  - `--plugin my-plugin`: exit 1, nothing written.
  - Existing config without `--force`: `error: Project already initialised`, exit 1.
  - `--force` re-init is idempotent (the `.gitignore` has no duplicate entries).
  - Failed plugin after init: init output kept, `plugins: error ...` line, exit 1.
  - Success: `plugins: installed`, `configVersion: 2`, plugin recorded in the flat `plugins` list.
  - `.specd/config/tmp/.gitignore` contains `*` and `!.gitignore`.
  - `changes/ drafts/ discarded/ archive/ metadata/ tmp/` all exist.
- **Missing config.** `project update` with no `specd.yaml` found from the CWD: `error: Config validation failed ... no specd.yaml found`, exit 1.

## cli:plugins-install

Requirement status: all 9 requirements OK.
`install.ts:58-66` (name rule), `68-77` (already installed, from `config.plugins` via `getDeclaredPlugins`), `79-96` (`InstallPlugin`, then `addPlugin` with `contributions` and `config` only when present), `146-149` (`plugins:false`), `159-161` (exit 1), `175-184` and `PluginInstallBatchResult` (output).

Scenario to test map:

| Scenario                                                             | Test                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Valid / multiple names                                               | `T:plugins.spec.ts:143-164`, `234-266` (3 names)                                                                                |
| Unscoped rejected, no install, no `addPlugin`, exit 1                | `T:plugins.spec.ts:166-173`, `234-266` (install called 2x, `addPlugin` 1x)                                                      |
| Contributions restriction                                            | `T:plugins.spec.ts:192-216`                                                                                                     |
| Contributions with several plugins                                   | `T:plugins.spec.ts:175-190`                                                                                                     |
| Empty contributions                                                  | `T:plugins.spec.ts:268-311`                                                                                                     |
| Kind without handler                                                 | `T:plugins-install-real-loader.spec.ts:75-98`                                                                                   |
| Already-installed check from `config.plugins`, no `listPlugins`      | `T:plugins.spec.ts:218-232`, `323-331`                                                                                          |
| Declaration read without `ConfigWriter.listPlugins`                  | `T:plugins.spec.ts:313-321`, `358-366`                                                                                          |
| Duplicate in one invocation                                          | `T:plugins.spec.ts:333-356`                                                                                                     |
| Header `Installed plugins:`                                          | `T:plugins.spec.ts:368-374` (contains, not first line, see M4b)                                                                 |
| Calls `InstallPlugin` and `addPlugin`, no `kernel.project.addPlugin` | `T:plugins.spec.ts:143-164`                                                                                                     |
| Default config persisted                                             | `T:plugins.spec.ts:192-216`                                                                                                     |
| No empty `config`                                                    | `T:plugins.spec.ts:157-162`                                                                                                     |
| Init is not run                                                      | `T:plugins-real-init-never-runs.spec.ts:116-126` (real plugin, marker file)                                                     |
| Remaining plugins after a failure                                    | `T:plugins.spec.ts:234-266` (the first failure is an unscoped name, then `mockRejectedValueOnce`)                               |
| Install works with a broken configured plugin                        | `T:plugins.spec.ts:163` and `T:plugins-real-init-never-runs.spec.ts:125`. Only the `plugins:false` argument is asserted, see M6 |
| Exit code 1                                                          | `T:plugins.spec.ts:403-413`                                                                                                     |
| JSON shape and `hasErrors`                                           | `T:plugins.spec.ts:376-401` and `249-266`                                                                                       |

## cli:plugins-uninstall

Requirement status: OK. M1 and M2 are spec/code gaps.
`uninstall.ts:37-40` (`plugins:false`), `57-60` (declared check), `62-74` (use case with allowlist, `PluginNotFoundError` fallback), `75` (`removePlugin` after the hook), `88-90` (exit 1), `103-111` (`{ plugins }`).

| Scenario                                                                 | Test                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Multiple plugins                                                         | `T:plugins.spec.ts:700-722`                               |
| Failure then `y` still removed, exit 1                                   | `T:plugins.spec.ts:539-569`                               |
| Hook then removal, `removePlugin` args, no `kernel.project.removePlugin` | `T:plugins.spec.ts:485-502`, ordering `539-569` (566-568) |
| Plugin without hook                                                      | `T:plugins.spec.ts:679-698`. Weak, see M8                 |
| Allowlist honoured                                                       | `T:plugins.spec.ts:530-537`, `724-733`                    |
| Duplicate names                                                          | `T:plugins.spec.ts:842-871`                               |
| Missing package                                                          | `T:plugins.spec.ts:873-896`. Mocked, see M8               |
| Not declared                                                             | `T:plugins.spec.ts:571-582`                               |
| Hook failure keeps declaration                                           | `T:plugins.spec.ts:539-569`, `898-919`                    |
| Broken configured plugin / `plugins:false`                               | `T:plugins.spec.ts:536`. Argument only                    |
| JSON output                                                              | `T:plugins.spec.ts:504-528`                               |

## cli:plugins-update

Requirement status: all OK.
`update.ts:44-52` (set from `config.plugins`), `58-67` (undeclared gives error), `70-76` (allowlist), `110-113` (`plugins:false`), `136-146` (output), `120-122` (exit).

| Scenario                                | Test                                             |
| --------------------------------------- | ------------------------------------------------ |
| Update all / specific                   | `T:plugins-update.spec.ts:97-124`                |
| Uses `config.plugins`, no `listPlugins` | `T:plugins-update.spec.ts:181-190`               |
| Failure then others updated, exit 1     | `T:plugins-update.spec.ts:164-179`               |
| Idempotent, no writer calls             | `T:plugins-update.spec.ts:200-211`               |
| Recorded selection preserved            | `T:plugins-update.spec.ts:153-162`, `192-198`    |
| Undeclared                              | `T:plugins-update.spec.ts:126-151`               |
| Broken plugin / `plugins:false`         | `T:plugins-update.spec.ts:161`. Argument only    |
| JSON shape                              | `T:plugins-update.spec.ts:107-124`, `164-179`    |
| Text output, mixed result               | `T:plugins-update.spec.ts:213-227` (exact lines) |
| Nothing declared                        | `T:plugins-update.spec.ts:229-236`               |

## cli:plugins-list

Requirement status: all OK, except the version source (M3).
`list.ts:42-45` (`plugins:false`), `46-58` (declared set), `88-99` (row mapping: `declared:[]` and `selected = allowlist or []` for `not_found`/`error`), `107-129` (text and JSON).

| Scenario                                                | Test                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| List all                                                | `T:plugins.spec.ts:417-428`                                           |
| From config snapshot, no `listPlugins`                  | `T:plugins.spec.ts:737-745`                                           |
| All kinds listed                                        | `T:plugins.spec.ts:747-773`                                           |
| Broken plugin / `plugins:false`                         | `T:plugins.spec.ts:742`. Argument only                                |
| Installed                                               | `T:plugins.spec.ts:417-428`                                           |
| Not found with `declared:[]` and `selected` = allowlist | `T:plugins.spec.ts:775-801` (JSON), `584-616` (text)                  |
| Load error with `declared:[]`                           | `T:plugins.spec.ts:775-801`                                           |
| Text details                                            | `T:plugins.spec.ts:584-616`                                           |
| Version and `-` fallback                                | `T:plugins.spec.ts:771-772` and `931`. Separate tests, never together |
| Nothing declared                                        | `T:plugins.spec.ts:441-449` (JSON), `618-624` (text)                  |
| Allowlist shown                                         | `T:plugins.spec.ts:584-616` (`selected: [lint]`, `available: scan`)   |
| JSON machine-parseable                                  | `T:plugins.spec.ts:417-428`                                           |

## cli:plugins-show

Requirement status: all OK, except the version source (M3).
`show.ts:28-41` (`plugins:false`, `LoadPlugin`), `55-75` (text), `93-99` (capabilities).

| Scenario                                             | Test                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Show details                                         | `T:plugins.spec.ts:451-472`                                        |
| Contributions with addresses                         | `T:plugins.spec.ts:474-483`, `805-821`                             |
| Not found, exit 1                                    | `T:plugins.spec.ts:823-838` (mocked load)                          |
| JSON                                                 | `T:plugins.spec.ts:451-472`                                        |
| Schema and defaultConfig                             | `T:plugins.spec.ts:641-675`, `934-953`                             |
| Capabilities with hooks or agents                    | `T:plugins.spec.ts:451-483`. Only the agents + hooks mock, see M7  |
| Capabilities omitted for checks-only (text and JSON) | `T:plugins.spec.ts:641-675` (JSON), `805-821` and `934-953` (text) |
| Init never called                                    | `T:plugins-real-init-never-runs.spec.ts:159-167` (real)            |

## cli:project-init

Requirement status: all OK.
`init.ts:72-75` (names validated first), `76-82` (provision by `getOptionValueSource` = `cli`), `88-102` (`initProject` and install), `104-126` (output), `148-151` (post-init host, `plugins:false`), banner only in `runInteractiveInit` (`172-179`).

| Scenario                                                | Test                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--plugin` flag                                         | `T:project-init.spec.ts:107-136`                                                      |
| Alias identical                                         | `T:project-init.spec.ts:475-500`, `676-708` (`toEqual` of the whole observable run)   |
| Alias JSON                                              | `T:project-init.spec.ts:502-525`                                                      |
| Plugin wizard                                           | `T:project-init.spec.ts:297-320`                                                      |
| No plugin selected                                      | `T:project-init.spec.ts:366-392`                                                      |
| Overwrite confirmation                                  | `T:project-init.spec.ts:322-346`, `394-414`, `426-455`                                |
| Cancel                                                  | `T:project-init.spec.ts:348-364`                                                      |
| Banner only in wizard                                   | `T:project-init.spec.ts:297-320` (figlet lines), `457-473`                            |
| Explicit default flag stays non-interactive             | `T:project-init.spec.ts:281-295` (TTY forced)                                         |
| Known options (opencode, standard, exact five)          | `T:project-init.spec.ts:366-392`                                                      |
| Default valid config                                    | `T:project-init.spec.ts:476-500`, `582-618`                                           |
| No banner (text)                                        | `T:project-init.spec.ts:457-473` (only `not.toContain('sdk   v')`)                    |
| JSON with plugins                                       | `T:project-init.spec.ts:188-217`                                                      |
| Text metadata line                                      | `T:project-init.spec.ts:527-543` (non-default path)                                   |
| JSON `metadataCachePath`                                | `T:project-init.spec.ts:502-525`                                                      |
| Git root / cwd                                          | `T:project-init.spec.ts:138-160` (mocked VCS)                                         |
| Standard dirs                                           | `T:project-init.spec.ts:582-618`. Weak, see M4a                                       |
| `.gitignore` entry                                      | `T:project-init.spec.ts:609-612`                                                      |
| Uses `createConfigWriter`                               | `T:project-init.spec.ts:476-500`, `135`                                               |
| tmp gitignore contents                                  | `T:project-init.spec.ts:615-617`. Weak, see M4a                                       |
| tmp gitignore preserved on `--force`                    | No test                                                                               |
| Metadata dir exists                                     | No test (only the `.gitignore` line, `612`)                                           |
| Metadata entry appended, not duplicated                 | Append asserted (`612`). No re-run test                                               |
| `metadataCachePath` surfaced                            | `T:project-init.spec.ts:527-543` (`.custom/meta-cache`)                               |
| Plugins recorded, `configVersion: 2`                    | `configVersion` at `608` (no plugin). Plugin recording not tested end-to-end, see M4c |
| Post-init host `plugins:false`                          | `T:project-init.spec.ts:131-133`                                                      |
| Install failure after init                              | `T:project-init.spec.ts:233-279` (writer and install mocked)                          |
| Invalid name before init                                | `T:project-init.spec.ts:219-231`                                                      |
| Non-interactive fails without `--force`, file unchanged | `T:project-init.spec.ts:545-580` (real writer)                                        |
| `--force` overwrites                                    | `T:project-init.spec.ts:620-637`. Weak, see M4a                                       |

## cli:project-update

Requirement status: all OK.
`update.ts:35-38` (`plugins:false`), `39` (shared `updatePluginsWithKernel`), `41-49`, `52-63` (output).

| Scenario                                             | Test                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--format`                                           | `test/commands/project-update.spec.ts:72-87`                                                                                      |
| Declared plugins via `UpdatePlugin`, not `install()` | `T:project-update-allowlist.spec.ts:43-72` (the mock module has no `InstallPlugin`)                                               |
| Allowlist                                            | `T:project-update-allowlist.spec.ts:64-68`                                                                                        |
| Host without plugins, `specd.yaml` untouched         | `T:project-update-allowlist.spec.ts:62-71` (file compared byte for byte)                                                          |
| Text prefix                                          | `T:project-update.spec.ts:42-55`                                                                                                  |
| Up to date                                           | `T:project-update.spec.ts:57-70`. Mocked, see M11                                                                                 |
| JSON grouping                                        | `T:project-update.spec.ts:72-96`                                                                                                  |
| Missing `specd.yaml`                                 | `T:project-update-real-discovery.spec.ts:16-37`, `T:project-update.spec.ts:149-162`                                               |
| Partial failure, exit 1, `hasErrors`                 | `T:project-update.spec.ts:98-147`. "Second plugin still updated" is covered through the shared `T:plugins-update.spec.ts:164-179` |

## cli:host-context

Requirement status: all OK.
`cli-context.ts:83-104`, `helpers/cli-host.ts:30-44`, `helpers/cli-cleanup.ts`, `run.ts`, `helpers/cli-signals.ts`, `graph-index-task.ts:58-83`.
The dependencies are as the spec requires: `package.json` has only `@specd/sdk` among the platform packages, and no `@specd/core` or `@specd/code-graph` import exists in `src`.

| Scenario                                                                                               | Test                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap via helper, `CliContext` shape                                                               | `test/helpers/cli-context.spec.ts:100-127`                                                                                                   |
| Verbosity                                                                                              | `cli-context.spec.ts:19-46` (`-vv` only)                                                                                                     |
| Plugins enabled by default                                                                             | `cli-context.spec.ts:48-67`. See M13                                                                                                         |
| Plugins disabled                                                                                       | `cli-context.spec.ts:85-98`. "No plugin loaded or initialized" is not verified here; see sdk `host-context-e2e.spec.ts:143`                  |
| Warnings from `config.warnings`, once each                                                             | `cli-context.spec.ts:100-178`                                                                                                                |
| `onLog` wired                                                                                          | `cli-context.spec.ts:69-83`. Weak, see M5                                                                                                    |
| Commands use the helper / no direct SDK bootstrap / no hand-built host                                 | `cli-context.spec.ts:223-265` (source scan, `resolveSdkHostContext` and `helpers/sdk-host.ts` gone)                                          |
| Helper registers, covers both forms, forwards unchanged                                                | `test/helpers/cli-host.spec.ts:20-59` (`toBe(input)`, strong)                                                                                |
| Failed open registers nothing                                                                          | `cli-host.spec.ts:61-66`. Weak, see M5                                                                                                       |
| `CliContext` has dispose                                                                               | `cli-context.spec.ts:100-127`                                                                                                                |
| Dispose twice releases once                                                                            | CLI test (`cli-context.spec.ts:203-220`) shows the pass-through count 2. Idempotency lives in sdk `host-context-e2e.spec.ts:162-170`. See M5 |
| Commands need not dispose                                                                              | `cli-context.spec.ts:192-201`, `test/run-host-release.spec.ts:24-37`                                                                         |
| Reverse order, idempotent and concurrent, late register, failing cleanup, failure text, AggregateError | `test/helpers/cli-cleanup.spec.ts:14-97`                                                                                                     |
| Cleanup on error exit and signals                                                                      | `test/run.spec.ts:51-95`, `test/helpers/cli-signals.spec.ts`, `cli-signals-process.spec.ts:70-100`                                           |
| Worker disposes on success and failure, `plugins:false` in both modes                                  | `test/graph-index-task.spec.ts:26-114`                                                                                                       |
| Package deps                                                                                           | `test/package-deps.spec.ts:9-21`                                                                                                             |

## Discrepancies and weak spots (all minor)

- **M1 (spec internal gap, uninstall).**
  - Spec side: the Output requirement (`plugins-uninstall` spec) lists the statuses as `uninstalled` or `error`. The Requirements text never mentions duplicates or a missing package. Both appear only in verify scenarios ("Duplicate names", "Declared plugin whose package is missing").
  - Code side: `uninstall.ts:17` also emits `skipped`. `uninstall.ts:71-74` implements the missing-package fallback.
  - Action: add both to the Requirements text.
- **M2 (spec gap, behaviour).** A plugin whose package is present but fails to load (for example an invalid `specd-plugin.json`) can never be uninstalled.
  - Spec side: the Host-bootstrap requirement says a broken configured plugin "can still be uninstalled". Only `PluginNotFoundError` falls back to declaration removal (`uninstall.ts:72`).
  - Code side: I ran it. `plugins uninstall @acme/z` prints `error  Plugin '@acme/z' failed validation (specd-plugin.json)`, exits 1, and `specd.yaml` still has the entry. The user must hand-edit the file.
  - Action: decide whether `PluginValidationError` on load should also remove the declaration, or state in the spec that it does not.
- **M3 (spec vs code, version source).** The list spec says version "from the npm package" and show says "(from the npm package)". The code uses the runtime plugin's `version` (`list.ts:96`, `show.ts:46`). The loader requires it to equal `manifest.version` (`plugin-manager/src/infrastructure/loader/plugin-loader.ts:226`). It never reads the `package.json` version, which can differ.
- **M4 (weak init tests).**
  - **a.** `T:project-init.spec.ts:615-617` asserts only that `.specd/config/tmp/.gitignore` is `not.toBe('')`. The spec says `*` then `!.gitignore`. A wrong file body would pass. The same test never asserts `changes/ drafts/ discarded/ archive/` or the metadata directory (only `specs` and `.specd`, lines 613-614). The `--force` scenario (`620-637`) only checks that `force: true` is passed to a mock, not that the new schema is written.
  - **b.** "stdout starts with `initialized specd in`" and "header exactly `Installed plugins:`" (`T:plugins.spec.ts:373`) are checked with `toContain`. The first-line position is not asserted. The list test at `608` does assert the first line.
  - **c.** No test covers a re-run with `--force` (tmp `.gitignore` preserved, no duplicated `/.specd/metadata/` entry). No test records a plugin end to end after init (`installPluginsWithKernel` is mocked). I verified these by running the CLI.
- **M5 (weak host tests).**
  - `cli-host.spec.ts:61-66` ("failed open registers nothing") would pass even if something harmless were registered, because it only awaits `runCliCleanup()`.
  - `cli-context.spec.ts:69-83` ("log entry reaches the callback") calls the destination's `onLog`, which is the very function passed in. It never emits through the kernel logger.
  - The CLI test for "calling `dispose` twice releases the host once" (`cli-context.spec.ts:203-220`) shows a pass-through count of 2. Idempotency is proven only in the sdk package (`host-context-e2e.spec.ts:162-170`).
- **M6 (indirect broken-plugin proof at CLI level).** Every "works with a broken configured plugin" scenario (install, uninstall, update, list, show, graph worker) asserts only that the mocked `resolveCliContext` or `openSpecdHost` received `plugins:false`. `plugins-real-init-never-runs.spec.ts` mocks `resolveCliContext`, so its real throwing `init` proves only that the plugin-manager use cases never call `init`. The real-host proof is the sdk `host-context-e2e.spec.ts:143`. I confirmed the real CLI behaviour manually (see "Behaviour confirmed by running the CLI").
- **M7 (show capabilities).**
  - Spec side: capabilities are shown "when the plugin implements an `install` or `uninstall` hook or declares `agents`".
  - Code side: `show.ts:96-97` implements this.
  - Test side: only the `agents` + both hooks mock is tested (`T:plugins.spec.ts:451-483`). A hook-only non-agents plugin (and install-only vs uninstall-only) is untested.
- **M8 (mocked uninstall paths).**
  - "Plugin that is not an agent plugin" (`T:plugins.spec.ts:679-698`) only checks that a mocked `UninstallPlugin` returning `undefined` leads to `removePlugin`. It does not show hook absence.
  - The missing-package test (`873-896`) relies on the mocked `PluginNotFoundError` class (`62-63`), not the real loader. The `instanceof` check works in a real run (confirmed manually).
- **M9 (`update X X`).** `updatePluginsWithKernel` does not de-duplicate. `plugins update X X` runs `UpdatePlugin` twice and prints two `updated` lines. `install` and `uninstall` de-duplicate. The spec is silent and the update is idempotent, so this is only an inconsistency.
- **M10 (`list` header).** `plugins list` prints the header `Installed plugins:` even when every row is `not_found` or `error` (`list.ts:113`). The list spec does not mandate a header.
- **M11 (project-update gaps).** "No `plugins` section gives `project is up to date`" uses a mocked `updatePluginsWithKernel` returning `[]` (`T:project-update.spec.ts:57-70`). The real-config variant is only the `?? []` in `get-declared-plugins.spec.ts`. The "missing specd.yaml" real test passes `--config` to a nonexistent file instead of discovery from the CWD (`T:project-update-real-discovery.spec.ts:25-33`). I confirmed CWD discovery manually.
- **M12 (cleanup nit).** `cli-cleanup.ts:15-20` flattens only one `AggregateError` level, so a nested `AggregateError` prints its own message. The test covers one level only (`cli-cleanup.spec.ts:61-71`).
- **M13 (over-constrained test).** The host-context spec says `options.plugins` is the caller's option (default `true`). `cli-context.ts:96-98` omits it when not given, and `cli-context.spec.ts:62-63` asserts `plugins` is `undefined`. An explicit `plugins: true` would fail the test, though it would satisfy the spec.

## Cross-spec checks

No contradictions found with `plugin-manager:uninstall-plugin-use-case`, `install-plugin-use-case`, `plugin-loader` (the CLI's `PluginNotFoundError` use matches the "package cannot be resolved" error) or `sdk:host-context`. Scratch runs agree with all of them.
The M1 wording gap is within `cli:plugins-uninstall` itself.
