# Spec-compliance audit, batch plugin-manager, change `plugin-architecture` (attempt 7)

Scope: plugin-manager:specd-plugin-type, plugin-loader, register-plugins-use-case, install-plugin-use-case, uninstall-plugin-use-case, update-plugin-use-case, list-plugins-use-case, agent-plugin-type, load-plugin-use-case, plugin-errors, plugin-repository-port.
Method: merged specs read with `changes spec-preview ... --artifact specs|verify`; code read in `packages/plugin-manager/src`; tests read in `packages/plugin-manager/test`; probes run against the built dist (`packages/plugin-manager/dist/index.js`, newer than every src file). Probe scripts are in the scratchpad `p7/` (probe1..5.mjs), about 520 hostile cases in total. `vitest run` = 238 pass / 0 fail, `tsc --noEmit` clean (tsconfig includes `test`).

## Verdict

- critical: 0
- major: 0
- minor: 14 (6 are "Specd compatibility" escapes reachable only with exotic caller/handler/loader input; 4 are code/spec drifts; 4 are weak or vacuous tests)
- info: a list of type-contract violations that escape raw (listed in section 2.3)

Every requirement of the 11 specs is implemented. Every verify scenario has at least one test, except the four called out under "no test" below (three of them are cross-package or compile-time by nature).

---

## 1. Per-spec status

### 1.1 specd-plugin-type: all requirements OK

| Requirement                   | Status | Code                                                                                                     |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| SpecdPlugin interface         | OK     | specd-plugin.ts:32-68; no `type`/`configSchema` on the interface                                         |
| PluginContext                 | OK     | specd-plugin.ts:7-15; register-plugins.ts passes only `{config, pluginConfig}`                           |
| isSpecdPlugin                 | OK     | specd-plugin.ts:118-142                                                                                  |
| Plugin manifest               | OK     | plugin-loader.ts:35-46 (`.strict()`, `schemaVersion: literal(2)`)                                        |
| Plugin name                   | OK     | `PLUGIN_NAME_REGEX` (core), used at plugin-loader.ts:38 and specd-plugin.ts:124                          |
| Contribution identity/address | OK     | specd-plugin.ts:71-110; dup id across kinds plugin-loader.ts:360                                         |
| Config schema                 | OK     | plugin-config-schema.ts (walker, depth limit 32 at :18 and :93; `resolvePluginConfig` re-asserts at :67) |
| Kind handler                  | OK     | merge-handlers.ts; contribution-kind-handler.ts                                                          |
| Lifecycles                    | OK     | install/update/uninstall never call init/destroy                                                         |

Scenario -> test:

- Has required properties: specd-plugin.spec.ts:63
- Name/version from manifest: plugin-loader-contract.spec.ts:218
- Optional install hooks: specd-plugin.spec.ts:40; is-specd-plugin.spec.ts:15
- PluginContext init with config: register-plugins.spec.ts:539
- Rejects unscoped / accepts scoped / non-function install: is-specd-plugin.spec.ts:19, :15, :23; specd-plugin.spec.ts:46
- pluginType / schemaVersion / contributes map-of-maps: plugin-loader.spec.ts:477, :587, :603
- Plugin name (valid, unscoped, dot, uppercase): specd-plugin.spec.ts:46-52 (see T4 for the scope-dot gap)
- Address format / id with dot / build validates / parse failures / several dots: specd-plugin.spec.ts:17, :27, :56 (`@acme/x` with zero dots is :27)
- Duplicate id across kinds: plugin-loader.spec.ts:170 (asserts class, pluginName, message)
- Config schema (supported / unsupported / non-object / node shape / properties+depth / resolve self-validates / no schema): plugin-config-schema.spec.ts:21, :44, :124, :131, :148, :84, :222, :229, :236, :193, :77, :209; loader level plugin-loader.spec.ts:197 and :849
- Unknown kind: plugin-loader.spec.ts:197 (weak, T1)
- validatePlugin receives plugin and name: plugin-loader-contract.spec.ts:102; plugin-loader.spec.ts:661
- Duplicate handler kind: plugin-loader-contract.spec.ts:95; plugin-loader.spec.ts:494; register-plugins.spec.ts:420
- Install-time-only kind: register-plugins-contract.spec.ts:125
- Install does not call init / options / mixed kinds: install-plugin.spec.ts:100, :62, :146; plugin-hooks-no-agents.spec.ts:80-106
- Runtime calls init for every plugin: register-plugins.spec.ts:74, :617

### 1.2 plugin-loader: all requirements OK

Load workflow steps 1-9, `createPluginLoader` bag, built-in agents handler first, `DuplicateHandlerKindError` at creation (plugin-loader.ts:313 -> merge-handlers.ts:19), strict manifest, error table, factory forms (plugin-loader.ts:374-394). Cross-check name/version/requested name at :161 and :207-212.

Scenario -> test:

- Package available: plugin-loader.spec.ts:101
- Manifest validated before import: :138, :154, :587, :603
- Version / name / requested-name mismatch: :569, :551, :530
- Named create / export default fn / default object `{create}`: :101 + plugin-loader-contract.spec.ts, :407, :383
- No factory: :641
- Import failure wrapped + SpecdError: plugin-loader-contract.spec.ts:146
- Throwing factory + SpecdError passthrough: plugin-loader-contract.spec.ts:159, :176
- Async factory: contract:66. Factory receives config only: contract:79 (see T7)
- Manifest schema / missing version / unscoped / pluginType / dup / unregistered / invalid block / unsupported keyword / defaultConfig / valid: :81, :154, :477, :170, :197 (the 4 combined), :101
- Base contract violation + exact fields: :456, :431
- Host handler for agents / two host handlers: :494, contract:95
- validatePlugin after base check: :505
- Loader does not run lifecycle: contract:124 (init, destroy, install, uninstall)
- Throwing handler wrapped + SpecdError passthrough: :692, :661
- Non-string projectRoot: :870 (weak, T2)
- Unknown manifest key named: :619
- Factory function carries `config` only: contract:79

### 1.3 register-plugins-use-case: all requirements OK

Code: infrastructure/loader/register-plugins.ts (public `registerPlugins`, `RegisterPluginsInput` exported by name from index) and application/use-cases/register-plugins.ts. The function is `async`, so no synchronous throw whatever the input is. `mergeHandlers` runs before the empty-list shortcut (:63 vs :64-66). Validation of every plugin precedes the first `init` (:80-99 then :146). One disposer `specd-plugins` (:182). Rollback with `rollbackErrors` or `Logger.warn` for frozen errors (:223-235). `PluginDestroyError` with aligned `pluginNames`.

Scenario -> test:

- Called before build (real KernelBuilder): contract:195
- Registration handle disposes: register-plugins.spec.ts:791
- Input defaults: contract:149
- Duplicate handler kind, no sync throw, with and without loader: contract:50, :62; register-plugins.spec.ts:420
- Init in list order / validation before init / selected contributions only / init for agents-only / one named disposer: :74, :143 + :332, :200, :315 + contract:100, contract:77 + :617
- Unknown id / schema violation / defaults / config without schema / duplicate entry: :143, :443, :181, :162, :230
- Destroy reverse / error isolation / idempotent: :617, :389 + :279, :74
- Partial init failure, rollback does not mask, SpecdError from init, activate failure, activate SpecdError: :553 + :110, :349 + :583, :464, :496, :816
- Load failure / plain loader error wrapped / malformed loader result / frozen init error: :848, :242, :691, :653
- Plugins disabled (SDK scenario): sdk host-context.spec.ts:75, :219; host-context-e2e.spec.ts:124 (outside plugin-manager)
- Duplicate handler with empty list / empty list: :432, :65

### 1.4 install / uninstall / update use cases: all requirements OK

Code: install-plugin.ts:62-88, uninstall-plugin.ts:49-66, update-plugin.ts:59-84. The order load -> resolve -> agents check -> hook is the same in all three. `installContextContributions` (resolve-contributions.ts:51-58) filters to agents ids only when the manifest declares agents. Hook failure is wrapped in `PluginValidationError(['install'|'uninstall'])` with cause, and a `SpecdError` passes through.

Scenario -> test (install): input/contributions optional install.spec.ts:35, :232; output :35; default config returned not written :119; not found :211; successful install :35; all/allowlist :232, :248; mixed kinds :146 + plugin-hooks-no-agents.spec.ts:80; options :62 (weak half, T3); unknown id :133; no install hook :100; init not called :35, :100; agents without contract :87; wrapped :164; SpecdError :190.
Uninstall: output void uninstall.spec.ts:21, :174; successful :26; not found :196; unknown id :132; mixed kinds plugin-hooks-no-agents.spec.ts:86; loads via loader :26; not tied to agents :211; no hook :174; init not called :174; agents without contract :154; wrapped :82; SpecdError :107.
Update: loads via loader :17; selection preserved plugin-hooks-no-agents.spec.ts:106 + update.spec.ts:17; id removed :84; not found :211; output shape :17 + plugin-hooks-no-agents.spec.ts:122; idempotent :184; mixed kinds plugin-hooks-no-agents.spec.ts:96; config not modified :17; agents without contract :139; wrapped :108; SpecdError :159.
Install "Agent Initialization Phase" (3 scenarios): no plugin-manager test (informative requirement, by design). Install: plugin-agent-claude/test/install-skills.spec.ts (specd-agent-init.sh). Shared-file uninstall: plugin-agent-\*/test/shared-folder-ownership.spec.ts. But see D3 about stale marker syntax.

### 1.5 list-plugins-use-case: OK

list-plugins.ts:61-81. Tests: list-plugin.spec.ts:6 (statuses), :60 (contributions + order), :38 (not_found), :6 + :80 (error, rest still listed), :104 (rendering of non-Error rejections).
Minor behaviour gap D5 (malformed loader results).

### 1.6 agent-plugin-type: OK

agents-handler.ts:12-20, agent-plugin.ts. Tests: agents-handler.spec.ts:5, :11, :17, :34; is-agent-plugin.spec.ts:18-45; register-plugins-contract.spec.ts:100 (no runtime activation); plugin-loader.spec.ts:346-381 (invalid id via loader -> PluginValidationError), :505 (agents without uninstall). AgentInstallOptions / capabilities / frontmatter / sharedFolder / fallback scenarios are contract scenarios for the plugin-agent-\* packages: tests at plugin-agent-claude/test/install-skills.spec.ts:181, :499 and shared-folder-ownership.spec.ts:144 (and the codex/copilot equivalents). In plugin-manager only the type shape is checked: is-agent-plugin.spec.ts:48 (vacuous, T6).

### 1.7 load-plugin-use-case: OK

load-plugin.ts delegates to `loadPluginSafely`. Tests: load-plugin.spec.ts:6, :37; loader-failures.spec.ts:49-89 (4 variants). The scenario "No lifecycle calls" has no dedicated LoadPlugin test (LoadPlugin has no code path that calls the plugin; the loader-level test plugin-loader-contract.spec.ts:124 covers it). Counted as weak, T9.

### 1.8 plugin-errors: OK, and the "Specd compatibility" rule has residual exotic escapes (section 2)

Classes, codes and fields match the spec (duplicate-contribution-error.ts, unknown-\*.ts, invalid-plugin-config-error.ts, unsupported-schema-keyword-error.ts, plugin-init-error.ts, plugin-destroy-error.ts with `errors` and `pluginNames`, plugin-validation.ts with cause-by-arity so `throw undefined` is recorded, `describeThrown` in every message).
Tests: errors.spec.ts:19 (codes/pluginName), :57 (message names plugin), :74, :80, :90, :102, :110, :115, :146, :150, :161, :177; register-plugins.spec.ts:765 (pluginNames in destroy order); :709, :726, :743; plugin-loader.spec.ts:756, :780, :801, :827; loader-failures.spec.ts:78.

### 1.9 plugin-repository-port: OK

plugin-repository.ts (type-only, `PluginRepositoryPort` + `DeclaredPlugin = ConfigDeclaredPlugin`, exported from ports/index.ts; the old `PluginRepository` name is gone from src and test). Tests: plugin-repository-port.spec.ts:8 (`ConfigWriter extends PluginRepositoryPort`), :13 (identity both directions), :19. The signature-drift scenario is by nature a negative compile test and has none (T5). "CLI implementation uses ConfigWriter": see D4.

---

## 2. "Specd compatibility" rule: exhaustive probes against dist

Probe design: every public entry point (registerPlugins, createPluginLoader.load via a real node_modules fixture, InstallPlugin, UpdatePlugin, UninstallPlugin, ListPlugins, LoadPlugin, helpers, error constructors) was driven with each hostile value: thrown/rejected string, undefined, null, number, Symbol, `{message}`, object with throwing `message` getter, frozen Error, and a Proxy with throwing `getPrototypeOf`/`get`/`ownKeys` traps. Accessors were installed with `Object.defineProperty` (first probe batch used spread and was discarded as a probe bug).

Result: 520 cases, all the ones listed in the task are OK, except those below.

### 2.1 Confirmed OK (no non-SpecdError escapes)

- `handler.activate` returning a rejected non-Error (string/undefined/null/number/Symbol/obj/getter-message/frozen) -> `PluginInitError` with the value as `cause`. Same for `throw` variants, thenable whose `then` throws, non-function `activate`, `activate` accessor that throws.
- `init` rejecting/throwing any of the above, `init` accessor throwing (also on 2nd read only) -> `PluginInitError`. `destroy` throwing any of the above, `destroy` accessor throwing, a frozen error, or a Proxy whose `getPrototypeOf`/`get` traps throw -> `PluginDestroyError`, second `dispose()` is a no-op, no unhandled rejection.
- Rollback with failing destroy for every thrown value; frozen `SpecdError` keeps identity; `rollbackErrors` non-configurable -> falls back to `Logger.warn`; `SpecdError` subclass with throwing `message` getter -> propagates.
- Manifest whose `contributes`, a block value, `configSchema`, nested `default`, nested `enum` (TOCTOU: 1st read ok, 2nd throws) are getters; `configSchema` Proxy with throwing `ownKeys`; `config` entry as Proxy / with throwing getter / throwing `toString` / Symbol / BigInt; `contributions` allowlist as Proxy / with Symbol / throwing `toString` element: all become `PluginValidationError(['load'])` or `InvalidPluginConfigError` through `registerPlugins`.
- Loader results (undefined, null, string, `{}`, no plugin, no manifest, manifest a string, plugin a function...) through `registerPlugins` -> `PluginValidationError(['load'])`.
- Real-FS loader: `create` throwing undefined/Symbol, rejecting null, returning thenable with throwing `then`, returning undefined/null/string/function; default export getter/null; entry import throwing undefined/Symbol/Proxy/syntax error/TLA rejection; plugin `name`/`version`/`contribution`/`install` accessors throwing on 1st or 2nd read; plugin Proxy with throwing get/has/ownKeys; manifest array/null/string/number/empty/BOM/binary/10000-deep JSON/missing/is-a-directory; configSchema 40, 5000 deep via properties and via items (typed, no stack overflow); `defaultConfig` mismatches; module-level `__proto__`/`constructor` keys; `blockSchema` throwing undefined or missing; `validatePlugin` throwing undefined/Symbol/Proxy; handler `activate`/`validatePlugin` accessors throwing; names `''`, `../x`, absolute path, NUL, file URL, `fs`, number, undefined, not installed; projectRoot undefined/null/5/{}. All typed.

### 2.2 ESCAPES found (non-SpecdError from the public API). All minor, all need hostile or contract-violating input.

E1 (minor). A thrown/rejected value whose `getPrototypeOf` trap throws (hostile Proxy) escapes raw because `error instanceof SpecdError` runs inside a catch block without protection:

- load-plugin-safely.ts:27 (so `registerPlugins`, `InstallPlugin`, `UpdatePlugin`, `UninstallPlugin`, `LoadPlugin` when the loader rejects/throws such a value: 5 entry points x 2 probes)
- install-plugin.ts:78, update-plugin.ts:75, uninstall-plugin.ts:63 (hook throws such a value)
- list-plugins.ts:76 (`error instanceof PluginNotFoundError` in the catch of `ListPlugins`; the only way `ListPlugins` can throw at all)
- plugin-loader.ts:97 and :107 (`create` / export resolution), :341 (blockSchema.safeParse throws such a Proxy)
- (plugin-loader.ts:113, :201, :218 are rescued by the outer wrapper and come out as `PluginValidationError(['plugin'])`, so the behaviour is inconsistent between catch sites.)
  Spec: plugin-errors "Specd compatibility ... holds for hostile inputs too". Probes: probe1.mjs ("... proxy" rows), probe4.mjs.
  E1b (minor, same root cause). In `registerPlugins`, a Proxy of this kind thrown by `init`/`activate` is wrapped, but `toSpecdError` (register-plugins.ts:209) throws the trap error first; the outer catch (:171-173) then wraps _that_ error, so `PluginInitError.cause` is the trap's Error and the original thrown value is lost. Spec says "original preserved as cause". Probe: probe1b.mjs prints `cause === px` false.
  E2 (minor). Agents manifest + plugin whose `install` or `uninstall` is an accessor that throws: `isAgentPlugin(plugin)` runs outside any try at install-plugin.ts:66, update-plugin.ts:63, uninstall-plugin.ts:52 (agent-plugin.ts:73-74 reads the accessors). 6 probes (3 use cases x install/uninstall accessor). Non-agents manifests are wrapped correctly. Also outside try: `manifest.defaultConfig` read at install-plugin.ts:85 and `input.options`/`input.contributions` reads.
  E3 (minor). Caller-supplied `PluginLoader` returning `{plugin: {}, manifest: {...}}` where `manifest.contributes` is missing/null, or a block value is null: `InstallPlugin`/`UpdatePlugin`/`UninstallPlugin` throw a raw `TypeError` (`Object.values(undefined)` at resolve-contributions.ts:12, `Object.keys(null)` :13, `manifest.contributes['agents']` :55). 9 probes. `loadPluginSafely` (load-plugin-safely.ts:32-39) only checks that `plugin` and `manifest` are non-null objects. `registerPlugins` wraps the same inputs (the try at register-plugins.ts:80-98); the three install-family use cases do not. The spec scenario "Malformed loader result" lists only `undefined` / "object without manifest", so this is a gap in the spirit of "a loader that resolves to something that is not {plugin, manifest}", not in its letter.
  E4 (minor). `createPluginLoader(...).load()` with a string `projectRoot` that is not absolute (`''`, `'proj'`, `'./proj'`, `'a/b'`): `createRequire('package.json')` throws a raw `TypeError [ERR_INVALID_ARG_VALUE]` (plugin-loader.ts:274, called from the `for` header at :252, outside the try at :253-262). Through `registerPlugins`/`InstallPlugin` etc. it is rewrapped as `PluginValidationError(['load'])` by `loadPluginSafely` (correct class, but message blames the manifest, probe5.mjs); `ListPlugins` reports it as an `error` entry. The `projectRoot` check at :77 only tests `typeof === 'string'`.
  E5 (minor). Malformed `blockSchema.safeParse` results from a host handler are not guarded (plugin-loader.ts:338-361): returning `undefined`, `{success:false}` without `error`, `error.issues` not an array, issue `path` missing/not iterable/containing a Symbol, a result whose `success` getter throws, or `data` as a Proxy with a throwing `ownKeys` (the `Object.keys(value)` at :356). 7 probes: raw `TypeError`/`Error`. A thrown (not returned) failure is wrapped correctly (:339-343).
  E6 (minor). `validatePlugin` that returns a rejected promise (async handler, contract says `void`): the promise is ignored (plugin-loader.ts:216) and Node raises `unhandledRejection`, which terminates the process by default. Probe4 confirmed with an `unhandledRejection` listener ("UNHANDLED ["async"]"). No SpecdError at all, and the failure is silently treated as validation success.

### 2.3 Info only (type-contract violations, host wiring); raw `TypeError`/`Error`, listed for completeness, not counted as findings

- `registerPlugins`: `options === null`; `handlers` not an array; handler with throwing `kind` getter (mergeHandlers merge-handlers.ts:17-19, and later reads at register-plugins.ts:150); `config.plugins` getter throwing, not iterable, or containing `null`; entry `name` as Symbol or throwing `toString` (message interpolation in `PluginValidationError` at register-plugins.ts:67-68; single-entry case OK, only the duplicate-name path escapes); `builder` without `registerDisposer` is wrapped OK.
- `InstallPlugin` with a Symbol `pluginName` or a Symbol contribution id (UnknownContributionError message interpolation); `ListPlugins.execute(undefined)` / `pluginNames` not iterable.
- Public pure helpers called with garbage: `isSpecdPlugin`, `baseContractFields`, `isAgentPlugin` on a Proxy or a throwing accessor or `null`; `resolvePluginConfig`, `assertSupportedConfigSchema`, `configSchemaToZod` with a schema/config that is a getter-bearing object or Proxy (note: spec requires "typed error, never TypeError" for malformed _shape_, which holds; accessor-throwing input is outside it); `configSchemaToZod(null)` and `enum: "fast"` (documented as taking an already validated schema); `buildContributionAddress`/`parseContributionAddress` with Symbol/throwing `toString`; `mergeHandlers(null)`; error constructors with Symbol name / Symbol in `issues` / `toString`-throwing names (`PluginInitError`, `InvalidPluginConfigError`, `PluginDestroyError`, `PluginValidationError(fields = Proxy)`); `createPluginLoader(undefined)`; a `config` Proxy.
- `PluginValidationError` with a Proxy/Symbol cause: OK (describeThrown guards).

---

## 3. Other discrepancies (spec vs code, "neither is the source of truth")

D1 (minor). Manifest key `__proto__` is silently swallowed. `{"contributes":{"__proto__":{"a":{}}}}` loads successfully with `contributes = {}` and no declared ids (probe5.mjs prints `ACCEPTED {} []`). Spec: a kind without a registered handler MUST fail with `UnknownContributionKindError`. Cause: `z.record(z.record(z.unknown()))` at plugin-loader.ts:42 assigns the key as a prototype, so `Object.entries` at :334 never sees it. `{"agents":{"__proto__":{}}}` is rejected correctly. Code side fix would be to reject `__proto__` explicitly; spec side says nothing about it.
D2 (minor/info). `PluginDestroyError` only helps `registration.dispose()`. Via a kernel, `core:kernel` (specs/core/kernel/spec.md "Kernel disposal", failure isolation) rejects with an `AggregateError` of `DisposerFailedError` whose `cause` is the `PluginDestroyError`. The plugin-manager statement "a SpecdError, never a plain AggregateError" is true of what plugin-manager emits, but a host that disposes the kernel sees core's `AggregateError`. Cross-spec boundary, no change needed in plugin-manager; worth one sentence in plugin-errors.
D3 (minor, stale spec text). install-plugin-use-case "Agent Initialization Phase" scenarios 2 and 3 describe separate `<!-- <specd-plugin:opencode> -->` markers and a base block `<!-- <specd> -->`. The implementation (skills/src/application/specd-block-manager.ts:31, :101) tracks the agents in the opening tag `<!-- <specd agents="a,b"> -->` and only keeps `specd-plugin:*` as a legacy form that is migrated (plugin-agent-codex/test/shared-folder-ownership.spec.ts:347-357). Spec and code disagree; the code is newer.
D4 (minor). plugin-repository-port "Implementation note" says the CLI calls `ConfigWriter.addPlugin()`, `removePlugin()` and `listPlugins()`. In `packages/cli/src` only `addPlugin` (commands/plugins/install.ts:85) and `removePlugin` (commands/plugins/uninstall.ts:62) are called; listing reads the in-memory snapshot (commands/plugins/get-declared-plugins.ts:21). Scenario "CLI implementation uses ConfigWriter" is therefore only partly true for `listPlugins`.
D5 (minor). `ListPlugins` bypasses `loadPluginSafely` (list-plugins.ts:65). A loader result lacking `plugin` (`{manifest}`) or with a non-object plugin (a function) is reported as `status: 'loaded'` with `plugin` undefined/garbage; `{}` or `undefined` become `status: 'error'` with a raw message such as "Cannot read properties of undefined (reading 'contributes')" instead of the `load` validation message the other use cases give. Spec only defines loaded/not_found/error, so this is an inconsistency, not a violation.
D6 (info). `dispose()` concurrency: a second concurrent call returns immediately (register-plugins.ts:111 `if (disposed) return`) while the first is still destroying, and never sees the `PluginDestroyError`. Spec ("idempotent", "reported once") is satisfied literally. Core's kernel handles concurrent callers itself (returns the same promise), so only direct users of `registration.dispose()` are affected.
D7 (info). `loader.resolve(..., {conditions})` at plugin-loader.ts:254-256 is cast through `unknown`; `require.resolve` ignores `conditions`. Harmless today (the spec only asks for `createRequire`), but the option is dead code.

No contradictions found against `core:config`, `core:kernel-builder` (`registerDisposer(name, fn)` at core kernel-builder.ts:437 matches the call at register-plugins.ts:182; a name conflict raises `RegistryConflictError`, a SpecdError, and is rolled back correctly), `default:_global/architecture` (application layer imports only domain and ports; domain imports only core).

---

## 4. Test gaps and weak tests

None of the 11 specs has a scenario without any test inside the repo, except:

- no test: plugin-repository-port "Signature drift fails compilation" (T5, inherently a negative type test);
- no test inside plugin-manager (covered elsewhere): "Agent Initialization Phase" x3 (T9), "Plugins disabled" (sdk tests), agent-plugin-type install/capabilities/fallback scenarios (plugin-agent-\* tests).

Weak or vacuous:

- T1 (minor). "Unknown kind rejected" plugin-loader.spec.ts:197-263 and "Invalid block for kind": only `toBeInstanceOf`; the spec requires naming the plugin and the kind (the message content is only covered in errors.spec.ts:57).
- T2 (minor). "Non-string project root is rejected": plugin-loader.spec.ts:870-876 asserts the class but not `fields: ['projectRoot']` (the scenario text requires it). Also no test for the relative-root case (E4).
- T3 (minor). "Options forwarded only when provided": install-plugin.spec.ts:35-60, update-plugin.spec.ts:17, uninstall-plugin.spec.ts:26 use `toHaveBeenCalledWith({config, contributions})`, which treats a missing property and `options: undefined` as equal; the "absent in the second call" half is not really proven.
- T4 (minor). Plugin name: `@ac.me/plugin` (dot in the scope) and `@specd/plugin-agent-claude` as accepted value are not exercised (specd-plugin.spec.ts:46-52, is-specd-plugin.spec.ts).
- T5 (minor, inherent). Conformance is a type-level assertion (plugin-repository-port.spec.ts:8) that only fails under `tsc --noEmit`, not under `vitest run`; the package `typecheck` script does include `test`, so it is enforced in CI only if typecheck runs.
- T6 (minor). is-agent-plugin.spec.ts:48-69 is vacuous: the `install` stub (legacy `(config, options)` signature) is never called, so its `expect(options).toEqual(...)` never runs; the `AgentInstallOptions` type shape is only checked by the compiler.
- T7 (minor). "Factory receives config only ... config is the fully-resolved SpecdConfig": plugin-loader-contract.spec.ts:79-93 checks `Object.keys(options)` equals `['config']` but not that the value is the loader's `config`.
- T8 (minor). Depth limit: plugin-config-schema.spec.ts:229-256 checks 32 levels accepted and 200000 rejected; the boundary 33 is not asserted, so an off-by-one in `depth > MAX_SCHEMA_DEPTH` (plugin-config-schema.ts:93) would pass.
- T9 (minor). load-plugin-use-case "No lifecycle calls": no test on `LoadPlugin` itself (load-plugin.spec.ts:6, :37 only check output and NotFound); covered indirectly by plugin-loader-contract.spec.ts:124 and by the code path (no calls).
- T10 (minor). The hardening added since attempt 6 has no tests for E1-E6 (they are bugs, not tested behaviours), and `ListPlugins` + Proxy rejection is untested.

Scenarios covered strongly (spot checks of assertions): partial init failure order and no disposer (register-plugins.spec.ts:553), frozen error + warn (:653), `PluginDestroyError.pluginNames` alignment (:765), mixed-kind agents-only filtering in all three use cases (plugin-hooks-no-agents.spec.ts), `throw undefined` cause recorded in registerPlugins, 4 use cases and the loader (:726, :743, loader-failures.spec.ts:78).

---

## 5. Severity summary

| ID         | Severity | Where                                                                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| E1, E1b    | minor    | load-plugin-safely.ts:27; install/update/uninstall :78/:75/:63; list-plugins.ts:76; plugin-loader.ts:97/:107/:341; register-plugins.ts:209 |
| E2         | minor    | install-plugin.ts:66, update-plugin.ts:63, uninstall-plugin.ts:52                                                                          |
| E3         | minor    | resolve-contributions.ts:12-13/:55 via load-plugin-safely.ts:32-39                                                                         |
| E4         | minor    | plugin-loader.ts:252/:274                                                                                                                  |
| E5         | minor    | plugin-loader.ts:338-361                                                                                                                   |
| E6         | minor    | plugin-loader.ts:216                                                                                                                       |
| D1         | minor    | plugin-loader.ts:42/:334                                                                                                                   |
| D2, D6, D7 | info     | cross-spec / concurrency / dead option                                                                                                     |
| D3, D4     | minor    | install-plugin-use-case verify; plugin-repository-port spec note                                                                           |
| D5         | minor    | list-plugins.ts:65                                                                                                                         |
| T1-T10     | minor    | see section 4                                                                                                                              |

Totals: critical 0, major 0, minor 14 findings with code/spec impact (E1 [incl. E1b], E2, E3, E4, E5, E6, D1, D3, D4, D5, T1, T2, T3, T7), plus 6 further minor test-quality notes (T4-T6, T8-T10) and 3 info items (D2, D6, D7). The previous attempt's E1-E8 and `PluginDestroyError` naming issues are confirmed fixed.
