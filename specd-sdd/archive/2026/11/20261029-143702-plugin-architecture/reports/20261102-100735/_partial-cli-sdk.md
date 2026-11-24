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
