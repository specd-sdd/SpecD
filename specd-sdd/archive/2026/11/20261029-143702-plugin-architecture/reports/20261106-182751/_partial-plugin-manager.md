# plugin-manager batch, attempt 8 (change plugin-architecture)

Scope: 11 specs (specd-plugin-type, plugin-loader, register-plugins-use-case, install/uninstall/update/list/load use cases, agent-plugin-type, plugin-errors, plugin-repository-port).
Build state checked: `dist/index.js` (18:05:21) is newer than every `src` file (latest 17:31:57). `vitest run` PASS 276 / FAIL 0, `tsc --noEmit` clean, eslint clean.

## Totals

- critical: 0
- major: 0
- minor: 8 (m1 to m8 below). m1 is a MUST in plugin-errors ("no plugin-manager API MAY surface a non-SpecdError").
- informational: 3 (never-resolving hang, spec/spec tension, cross-package scenarios)
- All attempt-7 E1-E6 escapes confirmed fixed (see "Regression of earlier probes").

## Probes

Scratchpad: `.../scratchpad/p8/` (lib.mjs, sweep.mjs, real.mjs, host.mjs, ids.mjs, proto.mjs, rd.mjs, t0.mjs). Classification: `instanceof SpecdError` (same core copy as plugin-manager), 1.5 to 20 s hang timers.

### Regression of earlier p7 probes (rebuilt dist)

- probe1, probe1b, probe5: no escape, no hang.
- probe3 (178 cases): 5 ESCAPE, all caller-argument violations (entry.name throwing toString, entry.name Symbol, install `contributions` containing a Symbol, install `pluginName` Symbol, `handler.kind` getter that throws on a later read).
- probe4: 4 ESCAPE, all caller-argument violations (loader `load(Symbol)`, `load({toString throws})`, hostile `config` Proxy for the loader, `createPluginLoader(undefined)`).
- probe2: 52 ESCAPE lines. Most are probe artefacts: `mk({ get install(){throw} })` spreads the getter while building the call arguments, so the probe throws before the API is called (proved by t0.mjs: the same scenario built without spread returns PluginValidationError). The rest are the same class as m2 (null/non-iterable inputs, direct calls of exported helpers with Proxy/Symbol arguments).
- No unhandled rejection reported by probe4.

### New hostile probes

1. sweep.mjs (2,040 cases): every plugin field (name, version, init, destroy, contribution, install, uninstall) and manifest field throwing on the k-th read (k = 1..14) through registerPlugins, Install/Update/Uninstall (plain and agents manifests), ListPlugins and LoadPlugin; entry fields, config fields, handler fields, use-case input fields. Result: ok 1960, specd 33, ESCAPE 47. Plugin-side getters (all k) and every registerPlugins/ListPlugins/LoadPlugin manifest-side case are clean. The 47 escapes: m1 (18 cases) and m2 (29 cases).
2. real.mjs (real filesystem loader, 80 cases): create() returning Proxy plugin, all-traps-throwing Proxy, revoked Proxy, name/init getter throwing on 2nd read, null-proto plugin, frozen plugin, throw Symbol/null/Proxy, thenable that throws or rejects, top-level throw, TLA reject, syntax error, 5 MB message; manifests with 200,000-deep JSON in a block, defaultConfig, schema properties/items/enum/required/default, `__proto__` kind/id/top-level/schema property, 200,000 ids, BOM, null, array, empty file, Infinity default. All typed (PLUGIN_VALIDATION_ERROR, UNSUPPORTED_SCHEMA_KEYWORD, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG) or accepted; no stack overflow, no wrong error class. Only the m2 loader-argument cases escape, plus the never-resolving `create()` (I3).
3. host.mjs (about 270 cases): `init`/`activate`/`registerDisposer`/loader rejection/sync-throwing loader/`destroy` throwing 11 hostile values (frozen Proxy-wrapped SpecdError with throwing defineProperty/get/all traps, getter message, null-proto, Symbol, circular, 10 MB string) combined with 4 rollback-destroy failure modes; odd loaders (sync throw, no load fn, getter load, thenable that throws, never resolves); reentrant/concurrent dispose; circular manifest/config/schema/default/items; 200,000-deep config value and schema; 3 M ids; Proxy and revoked manifests/plugins/contributes/blocks/schemas/loaded values. Result: all typed except m1, m2 and I3.

## Requirement and scenario status per spec

### plugin-manager:specd-plugin-type (all requirements implemented)

Code: `domain/types/specd-plugin.ts`, `domain/services/plugin-config-schema.ts`, `domain/services/resolve-contributions.ts`, `domain/services/merge-handlers.ts`.

- SpecdPlugin interface: has props `specd-plugin.spec.ts:65`; name/version from manifest `plugin-loader-contract.spec.ts:221`; optional hooks `specd-plugin.spec.ts:40`, `is-specd-plugin.spec.ts:15`.
- PluginContext: `register-plugins.spec.ts:539`, `:181`.
- isSpecdPlugin: unscoped `is-specd-plugin.spec.ts:19`, scoped `:15`, non-function install `:23`.
- Manifest: pluginType `plugin-loader.spec.ts:489`, schemaVersion 1 `:599`, contributes array `:615`.
- Plugin name: `specd-plugin.spec.ts:46` (it.each). Dots/uppercase covered there.
- Address: format `specd-plugin.spec.ts:17`, dot id `:35`/`:58`, build validation `:27`/`:35`, one error class on parse `:58`, duplicate id across kinds `plugin-loader.spec.ts:170`, multi-dot `:58`.
- Config schema: supported keywords `plugin-config-schema.spec.ts:21`, unsupported keyword `:44`, non-object node `:56`, node shape `:84`/`:148`, properties array and depth 32/33 `:222`/`:229`/`:236`, loader-level deep schema `plugin-loader.spec.ts:861`, resolve validates itself `:193`, config without schema `:77`/`:209`.
- Handler: unknown kind `plugin-loader.spec.ts:197`, validatePlugin args `plugin-loader-contract.spec.ts:105`, duplicate kind `plugin-loader-contract.spec.ts:98` + `register-plugins.spec.ts:420`, install-time-only kind `register-plugins-contract.spec.ts:125`.
- Lifecycles: install does not call init `install-plugin.spec.ts:103`, options `:65`, mixed kinds `:149`, init order `register-plugins.spec.ts:74`.
- Discrepancies: none. Tension with global architecture, see I2.
- Weak: "Unknown kind / invalid block / bad schema / bad default" are four assertions in one test (`plugin-loader.spec.ts:197`); a failure hides the others. Not a gap.

### plugin-manager:plugin-loader

Code: `infrastructure/loader/plugin-loader.ts` (load 77-123, validateManifest 155-198, validateRuntimePlugin 208-248, parseBlock 405-438).

- All 9 workflow steps and error-handling bullets match the code, including raw-JSON `__proto__` validation (173-183), projectRoot guard (78-85), async validatePlugin awaited (234-235), safeParse garbage wrapped (405-437).
- Tests: package available `plugin-loader.spec.ts:101`; manifest validated before import `:138`/`:154`; version/name mismatch `:581`/`:563`; requested name mismatch `:542`; named/default/`{create}` export `:101`/`:419`/`:395`; no factory `:653`; import failure `plugin-loader-contract.spec.ts:149`; throwing factory + SpecdError passthrough `:162`/`:179`; async factory `:66`; config only `:79`; missing version `:81`; unscoped `:154`; pluginType `:489`; duplicate id `:170`; unregistered kind/invalid block/schema keyword/defaultConfig `:197`; base contract fields `:443`/`:468`; host agents handler `:506`; two widgets handlers `plugin-loader-contract.spec.ts:98`; agents validatePlugin `:517`; no lifecycle `plugin-loader-contract.spec.ts:127`/`plugin-loader.spec.ts:327`; throwing handler wrapped `:704`/`:673`; projectRoot `:882`/`:894`; unknown key named `:631`; manifest-unreadable/non-JSON `plugin-loader-contract.spec.ts:197`/`:209`; `__proto__` kind `:904`; Proxy blockSchema, async validatePlugin, Proxy factory `:960`/`:1004`/`:1026`; getter on 2nd read `:813`.
- Scenario "Valid manifest passes Zod validation" and "Manifest schema validates required fields": covered indirectly by `:101` and `:358`; no dedicated test.
- Discrepancies: none.

### plugin-manager:register-plugins-use-case

Code: `application/use-cases/register-plugins.ts`, `infrastructure/loader/register-plugins.ts` (public wrapper, async so never throws synchronously).

- Signature/exports: `RegisterPluginsInput` and `PluginRegistration` exported (`dist/index.d.ts`, `infrastructure/loader/index.ts:2`, `application/use-cases/index.ts`). Called before build `register-plugins-contract.spec.ts:195`; handle dispose `register-plugins.spec.ts:791`; input defaults `register-plugins-contract.spec.ts:149`; duplicate handler (with and without loader, no sync throw) `register-plugins-contract.spec.ts:50`/`:62`.
- Registration order: init order `register-plugins.spec.ts:74`; validate before init `:143`/`:332`; selected only `:200`; agents-only init `:315`/`register-plugins-contract.spec.ts:100`; one disposer `register-plugins.spec.ts:617`/`register-plugins-contract.spec.ts:77`.
- Selection/config: unknown id `:143`; schema violation `:443`; defaults `:181`; config without schema `:162`; duplicate entry `:230`.
- Destroy: reverse `:74`/`:617`; isolation `:279`/`:389`; idempotent `:279`/`:791`; names order `:765`.
- Failure policy: partial init `:553`; rollback mask `:349`/`:583`; SpecdError passthrough `:464`; activate `:496`/`:816`; load failure `:848`; plain loader error `:242`; malformed loader result `:691`; frozen error `:653`.
- Bypass: empty list `:65`; duplicate handler with empty list `:432`; "Plugins disabled" is an SDK scenario (sdk:host-context), not testable here.
- Discrepancy (minor, m4): disposer-registration failure is reported as `PluginInitError` with an empty plugin name. Spec: `register-plugins.ts:150-153` (`current = ''`) vs spec text "typed error naming the plugin" (the spec is silent on this case). Message is `Plugin '' failed during init: dup`.
- Concurrency note (m5): a second `dispose()` called while the first is still running resolves immediately and never sees a `PluginDestroyError` (`register-plugins.ts:101-108`, repro `rd.mjs`). Spec says only "idempotent"; arguably fine.
- No scenario without a test, except the SDK-level "Plugins disabled".

### plugin-manager:install-plugin-use-case

Code: `application/use-cases/install-plugin.ts`.

- Behavior steps 1-5, agents-only filtering, `contributions: []` when no agents ids selected, wrapped hook errors, SpecdError passthrough: all match.
- Tests: input/optional `install-plugin.spec.ts:40`/`:235`; default config returned `:122`; not found `:214`; success `:40`; all/allowlist `:235`/`:251`; mixed kinds `:149`; options only when provided `:65`; unknown id `:136`; no hook `:103`; init not called `:103`; agents without contract `:90`; wrapped `:167` (includes message 'disk full' `:189`); SpecdError `:193`; `contributions: []` `plugin-hooks-no-agents.spec.ts:46`.
- "Agent Initialization Phase" scenarios (CLAUDE.md block, shared AGENTS.md ref counting): informational pointer in the spec; tested in plugin-agent-\* packages, not here (I3).
- Discrepancy: m1 (manifest walked outside any try).

### plugin-manager:uninstall-plugin-use-case

Code: `application/use-cases/uninstall-plugin.ts`. Matches spec.

- Tests: void output `uninstall-plugin.spec.ts:26`; success `:31`; not found `:199`; unknown id `:135`; mixed `plugin-hooks-no-agents.spec.ts:86`; not tied to agents `:31`/`:177`; no hook `:177`; init not called `:177`; agents without contract `:157`; wrapped `:85`; SpecdError `:110`; options `:56`; hostile hooks `hostile-hooks.spec.ts:90`; it.each `:214`.
- Discrepancy: m1.

### plugin-manager:update-plugin-use-case

Code: `application/use-cases/update-plugin.ts`. Matches spec.

- Tests: success/no config write `update-plugin.spec.ts:22`; options `:54`; removed id `:87`; wrapped `:111`; agents contract `:142`; SpecdError `:162`; idempotent `:187`; not found `:214`; no defaultConfig `plugin-hooks-no-agents.spec.ts:122`; mixed `:96`; selection preserved `:106`.
- Discrepancy: m1.

### plugin-manager:list-plugins-use-case

Code: `application/use-cases/list-plugins.ts` (via `loadPluginSafely`). Matches spec, including `not_found` classification through never-throwing `isInstanceOf` and message formatting for non-SpecdError rejections.

- Tests: statuses `list-plugin.spec.ts:6`; contributions `:60`; not_found `:38`; error `:6`/`:80`; order `:60`; invalid manifest `:80`; hostile loader results `:104`; hostile Proxy rejection `hostile-hooks.spec.ts:112`; `loader-failures.spec.ts:69`/`:91`/`:115`.
- Sweep result: all manifest-side and plugin-side hostile cases give `loaded`/`error` entries, never a throw. Only caller-argument cases (`pluginNames` non-iterable, `input` undefined, getter on `pluginNames`) escape (m2).

### plugin-manager:load-plugin-use-case

Code: `application/use-cases/load-plugin.ts` (pure `loadPluginSafely` delegate).

- Tests: `load-plugin.spec.ts:6` (loaded), `:65` (not found), `:37` (no lifecycle). Matches.

### plugin-manager:agent-plugin-type

Code: `domain/types/agent-plugin.ts`, `domain/handlers/agents-handler.ts`, `application/use-cases/has-agent-hooks.ts`.

- Tests: install/uninstall + contributions `install-plugin.spec.ts:40`; block accepted `agents-handler.spec.ts:5`; unknown field `agents-handler.spec.ts:11` plus loader-level `plugin-loader.spec.ts:221-250` (in the multi-case test at `:197`); no runtime activation `register-plugins-contract.spec.ts:100`; built-in handler `register-plugins-contract.spec.ts:149`; invalid id key `agents-handler.spec.ts:34`, `plugin-loader.spec.ts:383`; missing hooks `plugin-loader.spec.ts:517`, `agents-handler.spec.ts:17`; isAgentPlugin three cases `is-agent-plugin.spec.ts:18`/`:26`/`:33`; recursive options `:48` (type-level plus passthrough).
- Scenarios without a plugin-manager test (type-level or cross-package): AgentInstallOptions capability identifiers, "Plugins do not pass pre-normalized capability objects", frontmatter, sharedFolder, AgentInstallResult shape, "Agent installed in agents directory", "Agent fallback to shared directory". These belong to plugin-agent-\* specs; nothing here asserts them (I3).

### plugin-manager:plugin-errors

Code: `domain/errors/*`, `is-specd-error.ts`, `describe-thrown.ts`.

- Tests: name/fields/codes/messages `errors.spec.ts:19`/`:57`/`:74`/`:80`; destroy names `errors.spec.ts:90`, `register-plugins.spec.ts:765`; undefined cause `errors.spec.ts:102`, `register-plugins.spec.ts:726`/`:743`; cause message visible `errors.spec.ts:110`/`:150`, `install-plugin.spec.ts:189`; all classes are SpecdError `errors.spec.ts:115`; keyword for non-object nodes `errors.spec.ts:161`; hostile inputs `hostile-hooks.spec.ts`, `loader-failures.spec.ts`.
- Discrepancy (the "Specd compatibility" paragraph): see m1 and m2. Constructors of error classes with Symbol or throwing-toString arguments throw TypeError/raw Error (PluginInitError(name Symbol), PluginDestroyError(names throwing toString), PluginValidationError(fields Proxy), InvalidPluginConfigError(issues with Symbol)). Not reachable with typed arguments (m2).

### plugin-manager:plugin-repository-port

Code: `application/ports/plugin-repository.ts`.

- Tests: `plugin-repository-port.spec.ts:8` (ConfigWriter assignable), `:13` (DeclaredPlugin identical), `:19` (readonly return).
- Weak: the conformance tests are type-level (`const x: ConfigWriter extends Port ? true : false = true`); they only fail under `tsc` (tsconfig includes `test`, so `pnpm typecheck` does enforce them), not under `vitest run`. "Signature drift fails compilation" has no negative test (for example a `@ts-expect-error` assignment of a drifted signature). "CLI implementation uses ConfigWriter" is not testable here (CLI tests). Severity: minor (m7).

## Findings

### m1 (minor, spec MUST) Install/Update/Uninstall walk the manifest outside any try/catch

`install-plugin.ts:65-69,86`, `update-plugin.ts:62-66`, `uninstall-plugin.ts:52-58`, `resolve-contributions.ts:10-16,55-57`, `load-plugin-safely.ts:45-59`.
`loadPluginSafely` validates `manifest.contributes` once (shape check), then the use case re-reads it unguarded (`resolveContributions`, `installContextContributions`, `manifest.contributes['agents']`, `manifest.defaultConfig` for the output). `registerPlugins` (wrapped at `register-plugins.ts:71-83`) and `ListPlugins` do guard the same reads.
Reproduced (sweep.mjs, ids.mjs, host.mjs), non-SpecdError escapes from Install/Update/Uninstall:

- `manifest.contributes` getter that throws on the 2nd, 3rd or 4th read (TOCTOU): raw `Error`.
- Block that is an object with a throwing `ownKeys` trap, or a revoked Proxy: raw `Error` / `TypeError`.
- `manifest.defaultConfig` getter that throws (InstallPlugin output only): raw `Error`.
- Manifest with more than about 125,000 ids: `RangeError: Maximum call stack size exceeded` from `ids.push(...Object.keys(blocks))` (`resolve-contributions.ts:13`). Reproducible with a real manifest: 130,000 ids fail, 100,000 pass; the real loader accepts 200,000 (real.mjs "hugeIds"). Through `registerPlugins` it becomes a `PluginValidationError(['load'])`, through `ListPlugins` an error entry.
  Spec side: plugin-errors "No plugin-manager API MAY surface a plain Error ... and it holds for hostile inputs too ... a caller-supplied PluginLoader". Code side: unguarded. Fix: loop-based push, and wrap the manifest walking in the same try/catch used by `registerPlugins` (or return a frozen snapshot from `loadPluginSafely`). No test covers these.

### m2 (minor, type-contract violations) Raw errors for arguments that violate the declared TypeScript types

All reproduced, all are caller mistakes and unreachable for correctly typed callers or after core config validation:

- `registerPlugins`: `options` null; `config.plugins` getter that throws or not iterable; entry `null` / revoked Proxy / Proxy; `entry.name` getter, Symbol, or throwing toString (including duplicate-name path, `register-plugins.ts:62-67`); `handlers` not an array, element null, `handler.kind` getter that throws (`merge-handlers.ts:15-23`, `register-plugins.ts:140`).
- Use cases: `input` undefined; getters on `pluginName` / `config` / `contributions` / `options` / `pluginNames`; `pluginName` Symbol (template literal in the success message); `contributions` containing Symbol or throwing toString (`unknown-contribution-error`); `pluginNames` non-iterable.
- Loader: `load(Symbol)` and `load({toString throws})` (PluginNotFoundError message), `config.projectRoot` getter that throws (`plugin-loader.ts:78`), `createPluginLoader(undefined)`.
- Exported helpers called directly with hostile values: `buildContributionAddress` / `parseContributionAddress` (Symbol, throwing toString; spec says "never a different error class"), `isSpecdPlugin` / `baseContractFields` / `isAgentPlugin` with Proxy or null (`isAgentPlugin(null)`), `resolvePluginConfig` / `assertSupportedConfigSchema` / `configSchemaToZod` with Proxy schema or getter schema, `resolveContributions`, `declaredContributionIds`, `installContextContributions`, `mergeHandlers` with null/non-iterable.
  Recommend a decision: either document these as out of contract, or add a one-line coercion/guard. No test.

### m3 (minor) `__proto__` property in a configSchema is silently dropped

`plugin-config-schema.ts:258-261` (`shape[key] = ...` with key `__proto__` sets the prototype of `shape` instead of an own property). JSON.parse keeps it as an own key, the walker accepts it, then `resolvePluginConfig` with `properties.__proto__ = {type:string, default:'x', required}` and config `{}` returns `{}` (required and default ignored), and with additionalProperties false a config value is rejected as "Unrecognized key(s): '**proto**'" instead of a type check. Spec: "never silently degraded", and the loader treats `__proto__` as visible for `contributes`. Repro: `proto.mjs`. Fix: `Object.defineProperty` or a null-proto shape, or reject `__proto__` keys in the walker.

### m4 (minor) Disposer registration failure reports an empty plugin name

`register-plugins.ts:150-153`: `current = ''` then `rollback` gives `PluginInitError('', cause)`: `Plugin '' failed during init: dup`. Spec requires typed errors to name the plugin; the failure is not about one plugin. Repro: `rd.mjs`.

### m5 (minor / info) Concurrent dispose

`register-plugins.ts:101-108`: second `dispose()` during the first returns immediately (fulfilled) before destroys finish and never reports the aggregated error. Spec only says idempotent. Repro: `rd.mjs` prints `['rejected','fulfilled']`.

### m6 (minor) Test gaps for the new hardening (no test found for any of these)

- Install/Update/Uninstall with hostile `manifest.contributes` (getter, proxy block, 2nd-read) and with more than 125,000 ids (m1).
- `hasAgentHooks` second read: tests cover first-read throw (`hostile-hooks.spec.ts:90`) but not "getter throws only on the 2nd read" for `install`/`uninstall` at `plugin.install?.()` (the sweep shows it is correctly wrapped; add a regression test).
- `registerDisposer` throwing: no test (grep `registerDisposer` in tests shows only success paths) and no spec text.
- Real-loader tests for `__proto__` id and 200,000-deep JSON blocks (behaves correctly, untested).
- Concurrent `dispose()` (m5) untested.

### m7 (minor) plugin-repository-port conformance is type-level only; no negative drift test

See the plugin-repository-port section.

### m8 (minor) Merged-test grouping

`plugin-loader.spec.ts:197`, `:281`, `:358` bundle several scenarios in one `it`; failures would mask later cases. Not a coverage gap.

### I1 (informational) Never-resolving promises hang

`loader.load`, `create()`, `plugin.init`, `activate`, `destroy` (including during rollback) that never resolve make `registerPlugins` / use cases hang forever (host.mjs, real.mjs "rejectNever": 10 hang cases, all by design). No spec requires a timeout. Not reported as a defect; note for hosts.

### I2 (informational, spec vs spec) Domain purity vs zod

`default:_global/architecture` "Domain layer is pure ... depends only on the TypeScript standard library and other domain types". plugin-manager `domain/` imports `zod` (`handlers/agents-handler.ts`, `services/plugin-config-schema.ts`, `types/contribution-kind-handler.ts`) and `@specd/core`. `specd-plugin-type` mandates `blockSchema: ZodType` on the handler contract, so the spec itself requires a third-party type in domain. Zod does no I/O, so the first sentence of the architecture requirement ("zero I/O dependencies") holds; only the second sentence is violated. Needs an explicit exception in one of the two specs.

### I3 (informational) Cross-package scenarios not verifiable in this package

install-plugin-use-case "Agent Initialization Phase" (3 scenarios), agent-plugin-type capability/frontmatter/sharedFolder/fallback scenarios, register-plugins "Plugins disabled" (sdk:host-context), plugin-repository-port "CLI implementation uses ConfigWriter". Covered (or not) in plugin-agent-\*, sdk and cli batches.

## Scenario to test gaps (summary)

- No test at all: m6 items; install-plugin "Agent Initialization Phase", agent-plugin-type capability and fallback scenarios, port "Signature drift fails compilation" (negative), port "CLI implementation uses ConfigWriter", "Plugins disabled" (all other packages).
- Weak (indirect or bundled): plugin-loader "Valid manifest passes Zod validation" and "Manifest schema validates required fields" (`plugin-loader.spec.ts:101`, `:358`), bundled `:197`/`:281`, port conformance (type-level).
