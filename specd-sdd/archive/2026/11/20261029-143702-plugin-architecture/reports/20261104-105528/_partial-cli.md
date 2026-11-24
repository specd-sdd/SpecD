# Partial compliance report: batch cli (change plugin-architecture)

Scope: cli:plugins-install, plugins-uninstall, plugins-update, plugins-list, plugins-show, project-init, project-update, host-context.
Method: merged spec previews (spec + verify) compared against `packages/cli/src` and `packages/cli/test`; plugin-manager checked for `init` calls. Read-only; no code or spec modified.

Totals: critical 0, major 0, minor 7 (all minor are test-coverage gaps or spec-silent edge behaviors). No requirement is MISSING or PARTIAL.

Paths below are relative to `packages/cli` unless stated.

---

## cli:plugins-install (src/commands/plugins/install.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `install <plugin...>` + `--contributions` (l.115-118). Name check via `isPluginName` from sdk before any load (l.58, l.176). `--contributions` with !=1 plugin -> `cliError` exit 1 (l.128-130).                                                                                                          |
| Declaration source             | OK     | `getDeclaredPlugins(config)` reads `config.plugins` (l.52); no `kernel.project.listPlugins` / `ConfigWriter.listPlugins`.                                                                                                                                                                                 |
| Display name                   | OK     | `Installed plugins:` printed in text mode (l.161).                                                                                                                                                                                                                                                        |
| Already-installed              | OK     | warning `<name> already installed; use 'specd plugins update'` (l.69) contains "already installed" then "update"; InstallPlugin/addPlugin skipped. Duplicate in one invocation handled by `declaredSet.add` (l.89).                                                                                       |
| Installation workflow          | OK     | `InstallPlugin.execute` with contributions (l.80-84); `addPlugin(configPath, name, {config?, contributions?})` with config only when `defaultConfig !== undefined` and contributions only when flag given (l.85-88); per-plugin try/catch continues (l.95-101). No `kernel.project.addPlugin`, no `init`. |
| Host bootstrap without plugins | OK     | `resolveCliContext({ configPath, plugins: false })` (l.131-134).                                                                                                                                                                                                                                          |
| Exit code                      | OK     | `CliExitError(1)` after rendering when `hasErrors` (l.144-146).                                                                                                                                                                                                                                           |
| Output format                  | OK     | `{ plugins:[{name,status,detail}], hasErrors }` (l.26-31, l.167).                                                                                                                                                                                                                                         |

Discrepancies / notes:

- Minor (spec-silent edge): `--contributions ""` or `","` yields `[]` (install.ts:124-127) which is then passed through as an explicit empty selection rather than a usage error. Spec does not define it.
- `detail` is always a string in code (`PluginInstallEntry.detail: string`) whereas spec says "optional `detail`". Compatible.

Test coverage gaps (test/commands/plugins.spec.ts):

- Minor: scenario "Duplicate name in one invocation" (`@acme/x @acme/x` installed once, second reported already installed) has no test.
- Minor: scenarios "does not call `kernel.project.listPlugins` / `ConfigWriter.listPlugins`" are not asserted (mock declares `listPlugins: vi.fn()` at l.51 but never `expect(...).not.toHaveBeenCalled()`).
- Minor: "Init is not called" not asserted for install.
- Covered: valid name, unscoped rejection, contributions restriction + multi-plugin rejection (l.135), defaultConfig persisted / no empty config (l.161), already installed (l.189), failure continuation (l.204), header (l.238), JSON shape (l.246), exit 1 (l.272), `plugins:false` (l.132).

---

## cli:plugins-uninstall (src/commands/plugins/uninstall.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `uninstall <plugin...>` (l.29).                                                                                                                                                                                                                                                                                                                                             |
| Uninstall workflow             | OK     | `findDeclaredPlugin` (l.51) -> error when undeclared without calling plugin (l.52-54); `UninstallPlugin.execute` with `contributions` from the entry when present (l.55-61, absent -> use case default "all"); `removePlugin` only after a successful hook (l.62), so a throwing hook retains the declaration. No `kernel.project.removePlugin`, no type bucket, no `init`. |
| Host bootstrap without plugins | OK     | l.37-40.                                                                                                                                                                                                                                                                                                                                                                    |
| Exit code                      | OK     | l.79-81; loop continues on error.                                                                                                                                                                                                                                                                                                                                           |
| Output                         | OK     | text lines; structured `{ plugins }` only (l.101) - matches spec (no `hasErrors` required here).                                                                                                                                                                                                                                                                            |

Discrepancies: none.
Test coverage: plugins.spec.ts l.354, 372, 398 (allowlist + plugins:false), 409 (hook failure keeps declaration, next plugin processed), 440 (undeclared). Minor: the "non-agent plugin with no uninstall hook" scenario is a plugin-manager concern and is not exercised at CLI level (mocked use case); acceptable.

---

## cli:plugins-update (src/commands/plugins/update.ts)

| Requirement                    | Status | Evidence                                                                                                                                                                              |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature              | OK     | `update [plugin...]` (l.102).                                                                                                                                                         |
| Declaration source             | OK     | `getDeclaredPlugins(config)` (l.44).                                                                                                                                                  |
| Update behavior                | OK     | no args -> all declared (l.47-50); undeclared name -> error entry without calling `UpdatePlugin` (l.58-67); recorded allowlist forwarded (l.73-75); no ConfigWriter usage, no `init`. |
| Host bootstrap without plugins | OK     | l.110-113.                                                                                                                                                                            |
| Exit code                      | OK     | l.120-122.                                                                                                                                                                            |
| Output                         | OK     | statuses `updated`/`error` only; `{plugins, hasErrors}`; text `no plugins to update` (l.137-139).                                                                                     |

Discrepancies: none.
Test coverage (test/commands/plugins-update.spec.ts): all, named, undeclared, allowlist + no config write + plugins:false (l.134-144), failure continuation, empty message. Minor: JSON-shape and "idempotent twice" scenarios not explicitly asserted (project-update spec covers JSON shape on the shared function).

---

## cli:plugins-list (src/commands/plugins/list.ts)

| Requirement             | Status | Evidence                                                                                                                                                                                                                             |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature       | OK     | no `--type` option.                                                                                                                                                                                                                  |
| Declaration source      | OK     | `getDeclaredPlugins(config)` (l.46); `plugins:false` (l.42-45).                                                                                                                                                                      |
| Plugin status detection | OK     | `ListPlugins` loader status mapped `loaded -> installed`, `not_found`, `error` with `detail` (l.88-99). Non-loaded: `declared=[]`, `selected = allowlist ?? []` (l.90-91).                                                           |
| Output format           | OK     | JSON `{plugins:[{name, contributions:{declared,selected}, status, version?, detail?}]}`; text shows version or `-`, selected, available; `no plugins declared` when empty (l.109-112); JSON `{plugins: []}` (l.128 with empty rows). |

Discrepancies: none. Notes (minor, non-blocking): text mode prints an extra `Installed plugins:` header (l.113) for list; spec does not define it (the header is mandated only for install). The header is misleading for rows with `not_found`/`error` status.
Test coverage (plugins.spec.ts l.286, 299, 310, 451, 480): good. Minor: "Lists with a broken configured plugin" is only verified by `plugins:false` argument, which is what the spec requires.

---

## cli:plugins-show (src/commands/plugins/show.ts)

| Requirement       | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command signature | OK     | `show <plugin>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Output            | OK     | name, version, contributions `{kind,id,address}` via `buildContributionAddress` (returns `<name>.<id>`, plugin-manager specd-plugin.ts:81), `configSchema`/`defaultConfig` when present, `capabilities` only when `install`/`uninstall` hook exists or `agents` kind declared (l.91-97); omitted otherwise in text and JSON (l.50, l.70). `plugins:false` (l.28-31); `init` never called (LoadPlugin does not init; the only `.init(` in plugin-manager is `register-plugins.ts:118`). |
| Error handling    | OK     | load failure -> `handleError` -> CliExitError exit code (test l.488).                                                                                                                                                                                                                                                                                                                                                                                                                  |

Discrepancies: none. (Capability derivation lists `install` and `uninstall` independently; spec text is consistent.)
Test coverage (plugins.spec.ts l.320, 343, 488, 498): good. Minor: no assertion that `init` is not called on the loaded plugin in show (test at l.343 title mentions init omission from text only).

---

## cli:project-init (src/commands/project/init.ts)

| Requirement                    | Status        | Evidence                                                                                                                                                                                                                                         |
| ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature              | OK            | flags l.47-52; `specd init` alias registered in program.ts (covered by tests l.338-452). `--schema` has no commander default but falls back to `@specd/schema-std` (l.84).                                                                       |
| Interactive mode               | OK            | TTY && fmt text && no flag with source `cli` (l.71-77). Banner only in wizard (l.171-178); prompts schema/workspace/path/multiselect `required:false` (l.197-234); cancel -> exit before `initProject` (l.202-238).                              |
| Known plugin options           | OK            | exactly claude, copilot, codex, opencode, standard (l.14-20).                                                                                                                                                                                    |
| Non-interactive mode           | OK            | text output l.100-107; JSON l.109-119 including `metadataCachePath` from `initResult`.                                                                                                                                                           |
| Config file placement          | OK            | `resolveProjectRoot` uses VCS root else cwd (l.28-35).                                                                                                                                                                                           |
| Delegation to ConfigWriter     | OK            | `createConfigWriter().initProject(...)`, no InitProject/kernel.project.init; `metadataCachePath` taken from the result (l.102, 115). tmp/.gitignore, metadata dir, .gitignore handled in core (not in CLI scope of this batch; batch core owns). |
| Plugin installation after init | OK            | names validated before `initProject` (l.67-70, exit 1); post-init `resolveCliContext({configPath, plugins:false})` (l.147-150) then shared `installPluginsWithKernel`; failure keeps init output, reports per plugin, exit 1 (l.122-124).        |
| Already initialised            | OK (see note) | Non-interactive: `initProject` throws -> `handleError` -> exit 1 with `error:`; interactive: confirm overwrite/cancel (l.184-195).                                                                                                               |

Discrepancies:

- Minor: interactive overwrite path only asks a confirm question with the path in the message; spec says the wizard "informs the user and asks" - effectively equal.
- Minor (spec-silent): interactive cancel exits with code 0 (`CliExitError(0)`, l.192, 204...). Spec says only "aborts the command without writing anything".
- Minor: interactive wizard does not re-validate plugin names, but the options come from a fixed known list so this is safe.
- Note: the existing-config conflict in non-interactive mode relies on core's `initProject` error (not tested here with a real filesystem; the CLI test l.408 uses a mock).

Test coverage (test/commands/project-init.spec.ts): `--plugin` flow (l.95, with `plugins:false` l.120), opencode, JSON with plugins, unscoped rejection before write (l.181), install failure exit 1 (l.200), explicit default flag stays non-interactive (l.222), wizard + banner (l.245), cancel/overwrite (l.265, 291), no banner non-interactive (l.320), alias (l.339-452). Minor gaps: no CLI-level test that exactly the five known options are offered; "metadataCachePath not recomputed" not asserted; filesystem scenarios (standard dirs, tmp gitignore, metadata gitignore, `configVersion: 2`) are core ConfigWriter responsibilities and are not verifiable in CLI tests (mocked writer).

---

## cli:project-update (src/commands/project/update.ts)

| Requirement        | Status | Evidence                                                                                                                                                                                         |
| ------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Command signature  | OK     | `--format` (and extra `--config`).                                                                                                                                                               |
| Plugin update step | OK     | shares `updatePluginsWithKernel` (l.39), `plugins:false` (l.35-38), no config write.                                                                                                             |
| Output on success  | OK     | `plugins: updated <name>` / `plugins: error <name> (<detail>)` (l.52-56); empty -> `project is up to date` / `{plugins:[],hasErrors:false}` (l.41-47); structured `{plugins, hasErrors}` (l.59). |
| Partial failure    | OK     | all plugins processed, exit 1 via `CliExitError` (l.62-64). Missing specd.yaml surfaces from `resolveCliContext` and `handleError`.                                                              |

Discrepancies: none. Note: when plugins empty and `hasErrors` cannot be true, so early `return` is safe.
Test coverage (project-update.spec.ts l.41-116): text prefix + plugins:false, up-to-date, JSON, exit 1, hasErrors, load failure. Minor: the allowlist scenario and `specd.yaml` untouched are not asserted in project-update tests (covered in plugins-update tests for the shared function).

---

## cli:host-context (src/helpers/cli-context.ts, cli-host.ts, cli-cleanup.ts, cli-signals.ts, run.ts, graph-index-task.ts)

| Requirement                                    | Status | Evidence                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| resolveCliContext delegates to openSpecdHost   | OK     | `openCliHost({configPath?, options:{kernel: buildCliKernelOptions(), plugins?}})` (cli-context.ts:91-97); plugins omitted -> SDK default `true`; warnings read from `host.config.warnings`, emitted once (l.99-103). All five plugin commands and project update pass `plugins:false`. |
| CLI kernel options preservation                | OK     | `buildCliKernelOptions` (l.44-71) verbosity, TTY format, optional callback.                                                                                                                                                                                                            |
| Host bootstrap entry point                     | OK     | Grep: `openSpecdHost`/`createSdkContext` appear only in `helpers/cli-host.ts` and `graph-index-task.ts` (worker, exempted). `resolveSdkHostContext` is gone; `withProvider` uses `openCliHost` (with-provider.ts:28-29).                                                               |
| CLI host-opening helper                        | OK     | `openCliHost` overloads for both forms, forwards input unchanged, registers `host.dispose()` after successful open only (cli-host.ts:40-50).                                                                                                                                           |
| CliContext exposes dispose                     | OK     | Result is the SDK host plus config/configFilePath; cleanup registry guarantees release.                                                                                                                                                                                                |
| CLI cleanup registry                           | OK     | reverse order, memoized promise, per-cleanup try/catch, AggregateError flattened, `warning: cleanup failed: <msg>`; late registrations run immediately (cli-cleanup.ts:47-92).                                                                                                         |
| Entrypoint triggers cleanup on every exit path | OK     | `run.ts` awaits `runCliCleanup()` after success and error paths before `process.exit`; signal handlers run cleanup then exit 130/143 (cli-signals.ts). Only `run.ts` and `cli-signals.ts` call `process.exit`.                                                                         |
| Graph index worker                             | OK     | `plugins:false` in both branches, `host.dispose()` in `finally` (graph-index-task.ts:62-72, 76-79).                                                                                                                                                                                    |
| CLI package runtime dependencies               | OK     | package.json depends on `@specd/sdk` and no `@specd/core` / `@specd/code-graph`; no source imports from them. (`@specd/guide`, `@specd/plugin-*`, `@specd/schema-std` are outside the stated platform trio.)                                                                           |

Discrepancies: none.
Test coverage: cli-context.spec.ts (verbosity, plugins default/false, warnings once, dispose via cleanup, source scan for direct SDK bootstrap), cli-host.spec.ts (both forms, forwarding, failed open), cli-cleanup.spec.ts, cli-signals*.spec.ts, run*.spec.ts, graph-index-task.spec.ts.

- Minor: scenario "Worker opens its host without plugins ... from a bootstrap context" - `plugins:false` is asserted only for the configured branch (graph-index-task.spec.ts:39); the bootstrap-mode test (l.80-110) does not assert the `createSdkContext` second argument contains `plugins: false`.
- Minor: scenario "Optional onLog callback wired / log entry reaches the callback" is not clearly covered in cli-context.spec.ts beyond kernel options mapping (not verified in depth).

---

## Cross-spec / dependency contradictions

- None found against direct dependencies (`plugin-manager:*` use cases, `core:config-writer-port` add/removePlugin, `core:get-config`), all of which are consistent with the CLI usage. `cli:project-init` references `core:composition` `createConfigWriter()`; the CLI imports it from `@specd/sdk` re-exports, consistent with `cli:host-context` dependency rule.
- The mock-heavy CLI tests cannot confirm that the real `InstallPlugin` returns `defaultConfig` / `message` as the install command assumes (`InstallPluginOutput` is typed, so a type-level contract exists).

## Severity summary

- Critical: 0
- Major: 0
- Minor: 7
  1. install: duplicate-name-in-one-invocation untested.
  2. install: "no listPlugins calls" and "init not called" not asserted.
  3. install: `--contributions ""` yields empty selection (spec-silent).
  4. list: extra "Installed plugins:" header in list text (spec-silent).
  5. project-init: cancel exit code 0 / overwrite wording (spec-silent); no CLI test for the five known options.
  6. project-update: allowlist / untouched config scenarios not asserted at project-update level.
  7. host-context: bootstrap-mode worker `plugins:false` assertion missing.
