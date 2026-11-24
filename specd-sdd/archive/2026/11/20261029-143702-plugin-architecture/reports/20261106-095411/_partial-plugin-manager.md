# Spec-compliance audit (attempt 6) - batch plugin-manager - change plugin-architecture

Scope: 11 specs (specd-plugin-type, plugin-loader, register-plugins-use-case, install/uninstall/update/list/load-plugin-use-case, agent-plugin-type, plugin-errors, plugin-repository-port).
Source: packages/plugin-manager/src, tests: packages/plugin-manager/test (tsconfig includes test, so type-level tests are checked by `tsc --noEmit`).
Method: merged specs/verify read via spec-preview; full read of every src file; grep of every throw/reject path; runtime probes against packages/plugin-manager/dist (scratchpad/probe\*.mjs, not committed) to confirm escapes.

Totals: critical 0, major 0, minor 9 (6 of them are "Specd compatibility" escape paths, all exotic), spec-side nits 3, scenario/test gaps 7 (all weak/indirect, none uncovered in code).

Test file shorthand (all under packages/plugin-manager/test):
IP=application/install-plugin.spec.ts, UP=application/uninstall-plugin.spec.ts, UPD=application/update-plugin.spec.ts, RP=application/register-plugins.spec.ts, RPC=application/register-plugins-contract.spec.ts, LF=application/loader-failures.spec.ts, HN=application/plugin-hooks-no-agents.spec.ts, LS=application/list-plugin.spec.ts, LP=application/load-plugin.spec.ts, PRP=application/plugin-repository-port.spec.ts, PL=infrastructure/plugin-loader.spec.ts, PLC=infrastructure/plugin-loader-contract.spec.ts, ERR=domain/errors.spec.ts, CS=domain/plugin-config-schema.spec.ts, SP=domain/specd-plugin.spec.ts, ISP=domain/types/is-specd-plugin.spec.ts, IAP=domain/types/is-agent-plugin.spec.ts, AH=domain/agents-handler.spec.ts, RC=domain/resolve-contributions.spec.ts.

---

## A. "Specd compatibility" rule - exhaustive throw/rejection audit (plugin-errors spec)

Every `throw` in packages/plugin-manager/src (grep) is `new <SpecdError subclass>` or a rethrow guarded by `instanceof SpecdError`, EXCEPT the sites below. Public APIs verified by reading + probing:

Verified safe (only SpecdError escapes, plain errors wrapped with cause):

- createPluginLoader(): mergeHandlers -> DuplicateHandlerKindError (sync, as spec requires).
- loader.load(): resolve (try/catch plugin-loader.ts:239-249), readManifest wrap (113-125, fields ['specd-plugin.json']), manifest parse/strict keys (135-145, names unrecognized keys), import wrap (85-89, 'entry'), create wrap (95-100, SpecdError passthrough), base-contract accessor wrap (183-189, 'plugin'), handler.validatePlugin wrap (201-206), blockSchema.safeParse wrap (324-329).
- registerPlugins(): never throws sync (async fn); loadPluginSafely wraps loader (load-plugin-safely.ts:22-27, probed: sync throw, `throw undefined`, plain Error all -> PluginValidationError ['load']); init wrap and activate wrap -> PluginInitError / SpecdError passthrough (register-plugins.ts:119-125, 141-154; probed `throw undefined` and `throw 'str'` -> PluginInitError); destroy aggregated into PluginDestroyError (101-108; probed non-Error destroy rejection -> PluginDestroyError); resolvePluginConfig typed (probed non-object config -> InvalidPluginConfigError); registerDisposer errors are core InvalidDisposerError/RegistryConflictError (SpecdError family, core/src/composition/kernel-builder.ts:437-449) and are rolled back (162-166).
- InstallPlugin / UninstallPlugin / UpdatePlugin: loadPluginSafely + hook wrap incl. `plugin.install?.()` not-a-function TypeError inside try (install-plugin.ts hook try block; probed `throw undefined` -> PluginValidationError).
- LoadPlugin: loadPluginSafely only. ListPlugins: catch-all, never throws.
- Error classes, resolveContributions, buildContributionAddress/parseContributionAddress, isSpecdPlugin/isAgentPlugin: typed or non-throwing.

Escape paths found (each is a non-SpecdError reaching a caller; confirmed by probe unless noted). All require exotic inputs; severity minor, but each strictly violates "No plugin-manager API MAY surface ... any other non-SpecdError thrown by plugin code" (first three are plugin-code-triggered):

E1 (minor) register-plugins.ts:195-203 `attachRollbackErrors` -> `Object.defineProperty` on the surfaced error. If a plugin's `init` throws a frozen/non-extensible SpecdError (spec says a SpecdError from init "propagates unchanged") AND an earlier plugin's `destroy` fails during rollback, defineProperty throws `TypeError: Cannot define property rollbackErrors, object is not extensible`, which REPLACES the original error (probe: "frozen SpecdError init + rollback err -> TypeError NOT-SPECD"). Violates both the compat rule and "rollback failures MUST NOT replace it". Fix: try/catch around defineProperty (or wrap in PluginInitError when not extensible).
E2 (minor) plugin-loader.ts:357-377 `resolveCreateExport` reads `moduleObject['create']`, `['default']`, `defaultExport['create']` outside any try. Accessors on the plugin's own module/default export that throw escape raw (probe: `export default { get create(){ throw new Error('getter') } }` -> plain Error). Plugin code, so within the rule. Fix: move into the `create` try/catch -> PluginValidationError ['create'/'entry'].
E3 (minor/nit) plugin-loader.ts:190,193,196,212: after the guarded `baseContractFields(plugin)` (183-189) the loader re-reads accessors unguarded (`isSpecdPlugin(plugin)` re-runs baseContractFields, then `plugin.name`, `plugin.version`, `plugin.contribution`). A stateful getter (throws on 2nd read) escapes raw. Fix: snapshot the fields once, or wrap the whole of validateRuntimePlugin in the same SpecdError-guarded try.
E4 (minor) plugin-loader.ts:338-339 `result.data as Record` then `Object.keys(value)`: a host handler whose blockSchema transforms/refines to a non-object (null) makes `Object.keys` throw `TypeError` (probe confirmed). The spec only requires wrapping a throwing `safeParse` (324-329); this is the same family. Fix: guard/`isRecord` check -> PluginValidationError ['contributes.<kind>'].
E5 (minor) plugin-config-schema.ts:78-155 (`walkSchema`) / `nodeToZod` (163-192) are recursive with no depth bound: a manifest `configSchema` nested ~50k deep (JSON.parse accepts it) raises `RangeError: Maximum call stack size exceeded` from `loader.load` (probe through the real loader confirmed). Hostile data only. Fix: depth limit with UnsupportedSchemaKeywordError, or a generic catch in `validateManifest`.
E6 (minor) caller-supplied `PluginLoader` returning a malformed value (`undefined`, no `manifest`): `loaded.plugin` TypeError at register-plugins.ts:79-84 and destructuring TypeError in install/uninstall/update (probed). Not "thrown by the loader" but still a non-SpecdError from a caller-supplied loader; the spec text says "This includes failures raised by ... a caller-supplied PluginLoader". Type-violating input; fix: validate LoadedPlugin shape in loadPluginSafely.
E7 (nit, host config) plugin-loader.ts:260 `path.join(this.config.projectRoot, ...)` throws a TypeError if `config.projectRoot` is not a string (probe). It is evaluated outside the try in `resolvePackagePathsInternal` (`this.createResolvers()` is the for-of iterable at 238). Host misconfiguration, type-violating.
E8 (nit) register-plugins.ts:157-159 outer `catch (error) { await rollback(error) }` rethrows whatever it catches, with no SpecdError normalisation. Today the only things reaching it are covered above (E1 aside), but it is the structural reason E1/E6 escape; a final `instanceof SpecdError ? e : new PluginInitError(...)` guard would close the class.

Related fidelity gap (minor, F-cause): `PluginValidationError` only records `cause` when `cause !== undefined` (plugin-validation.ts constructor: `if (cause !== undefined) this.cause = cause`; message branch on `cause === undefined`). A hook/loader/handler that does `throw undefined` yields a PluginValidationError with NO cause and the generic "fix these fields" message (probe: "install hook throws undefined" / "loader throws undefined"). Spec: "with the original error as cause". Also `describeCause` renders non-Error objects as "unknown error" (e.g. `throw { message: 'x' }`), and ListPlugins renders `{message: 5}` as "[object Object]" (list-plugins.ts catch: `error instanceof Error ? error.message : String(error)`). Cosmetic.

---

## B. Per spec

### 1. plugin-manager:specd-plugin-type

Requirement status (impl: src/domain/types/specd-plugin.ts, domain/services/plugin-config-schema.ts, domain/services/merge-handlers.ts, infrastructure/loader/plugin-loader.ts):

- SpecdPlugin interface: OK (specd-plugin.ts:32-68; no `type`/`configSchema`; install/uninstall/contribution optional).
- PluginContext: OK (config + pluginConfig only, specd-plugin.ts:7-15; register-plugins.ts:120 passes exactly these).
- isSpecdPlugin: OK (baseContractFields 118-132; name via core `isPluginName`, same regex as core PLUGIN*NAME_REGEX `^@[a-z0-9]a-z0-9*-]_\/[a-z0-9][a-z0-9_-]_$`, core/src/domain/plugin-name.ts:2 - identical to the spec regex).
- Plugin manifest: OK (strict zod, plugin-loader.ts:35-46; schemaVersion literal 2; pluginType rejected as unrecognized key; contributes map-of-maps).
- Plugin name: OK.
- Contribution identity/address: OK (CONTRIBUTION_ID_REGEX 71; build 81-86; parse 95-110 single error class; uniqueness across kinds plugin-loader.ts:339-345).
- Plugin configuration schema: OK incl. new rules - type mandatory on every node (walkSchema 91-100), root object (101), required array of strings (104-113), enum non-empty of string/number/boolean (114-127), additionalProperties boolean (128-137), items single schema (145-154), non-object node keyword `type`/`configSchema` (79-85), resolvePluginConfig re-validates (59), no config w/o schema rejected (55-58).
- Contribution kind handler: OK (merge-handlers.ts:12-24; unknown kind plugin-loader.ts:322; validatePlugin 201-206; no-activate skipped register-plugins.ts:140).
- Plugin lifecycles: OK.

Discrepancies:

- (spec-side nit) Code also raises `UnsupportedSchemaKeywordError` with keyword `properties` when `properties` is not an object (plugin-config-schema.ts:140-142); the spec's enumerated offending keywords (`type, required, additionalProperties, items, enum`) omit `properties`. Code is reasonable; spec should list it.
- (spec-side nit) `items: null` or `items: 5` yields keyword `items` with reason "must be a single schema, not an array" (146-151) - message slightly misleading for non-array non-objects. Cosmetic.
- (minor, impl) `default` value is never shape-checked against its node type; `defaultConfig`/default mismatch only surfaces when resolving (zod `.default` does not validate). Spec silent.
- (minor, impl) defaultConfig present with no configSchema -> InvalidPluginConfigError at load (plugin-loader.ts:155-157 via resolvePluginConfig:55-58). Spec says defaultConfig is "validated against configSchema"; behaviour is defensible but unspecified.

Scenario -> test:

- Has required properties: SP:63 (no type/configSchema), ISP:15.
- Name and version sourced from manifest: NO test in plugin-manager (concerns plugin factories; loader cross-check covered by PL:549 / PL:567). GAP (weak).
- Optional install hooks: SP:40.
- Initialization with SpecdConfig: RP:536.
- Rejects unscoped / Accepts scoped / Rejects non-function install: ISP:19, ISP:15, ISP:23 (+SP:46 it.each names).
- pluginType rejected: PL:475; Other schemaVersion rejected: PL:585; contributes map of maps: PL:601 and PL:344.
- Valid scoped names / unscoped / dot / uppercase: SP:46 it.each.
- Address format: SP:17; Id with dot rejected: SP:27 (Bad.Id build) + PL:344; Building validates parts: SP:27; Parsing failures one error class: SP:56; Duplicate id across kinds: PL:169 (asserts class only, NOT that the plugin is named - weak); Address with several dots: SP:27, SP:56.
- Supported keywords accepted: CS:12, CS:175; Unsupported keyword: CS:35, CS:133, PL:195; Non-object node: CS:115, CS:122, ERR:145; Node shape validated: CS:47, CS:75, CS:91, CS:139 (all listed shapes covered incl. null type, nested no-type, enum object); Config resolution validates itself: CS:184 (+CS:91); Config without schema: CS:68, CS:200, RP:159.
- Unknown kind rejected: PL:195; validatePlugin receives plugin and name: PLC:102; Duplicate handler kind: PLC:95, RP:417; Install-time-only kind: RPC:125.
- Install does not call init: IP:100; options: IP:62; mixed kinds: IP:146, HN:80; Runtime calls init for every plugin: RP:71, RP:614.

### 2. plugin-manager:plugin-loader

Requirement status: Load workflow OK (plugin-loader.ts:76-103; two-resolver chain 258-263; validation before import; factory forms 357-377; cross-check 147-149, 193-198); Manifest schema OK (strict + named keys 135-145, defaultConfig vs configSchema 155-157); Error handling OK (all listed mappings present: 113-125, 85-89, 95-100, 201-206, 324-329, 183-189; DuplicateHandlerKindError carries kind only); Factory function OK (called with `{ config }` only, line 96).
Discrepancies: escape paths E2, E3, E4, E5, E7 above (minor). No spec-vs-code semantic mismatch otherwise. Note `fields` for base-contract violation is exact (baseContractFields) - but `[]`-fields case: if `contractFields.length === 0` yet `!isSpecdPlugin` cannot happen (same function), fine.
Scenario -> test:

- Package available: PL:100; Manifest validated before import: PL:137, PL:153; Version mismatch: PL:567; Name mismatch: PL:549; Requested name differs: PL:528; Named create: PL:100; export default create: PL:405; default {create}: PL:381; No factory: PL:639; Entry import fails wrapped (+SpecdError): PLC:146 (asserts PluginValidationError + cause; the explicit `instanceof SpecdError` is implied through ERR:99, not asserted here - weak nit); Throwing factory wrapped / SpecdError passthrough: PLC:158 / PLC:175; Async factory: PLC:66; Factory receives config only: PLC:79.
- Manifest schema validates required fields / missing version / unscoped / pluginType: PL:80, PL:80, PL:153, PL:475; Duplicate id: PL:169 (plugin not asserted); Unregistered kind, invalid block, $ref, defaultConfig: PL:195 (single table test, each by class); Valid manifest: PL:100.
- Base contract violation: PL:454; names failing fields (only destroy): PL:429; Host handler for agents / two host handlers: PL:492 / PLC:95; validatePlugin after base check: PL:503; Loader does not run lifecycle: PLC:124, PL:313; Throwing handler validation wrapped + SpecdError passthrough: PL:690 / PL:659 (+ blockSchema throw PL:724, accessor throw PL:754); Unknown manifest key named: PL:617 (+PL:475).
- Factory function (config only): PLC:79.
  Gaps: none uncovered. Weak: duplicate-id test does not assert plugin naming; no loader test that `fields` for the strict-manifest case names a nested/unknown key beyond top-level (spec only requires top-level).

### 3. plugin-manager:register-plugins-use-case

Requirement status: Signature OK (infrastructure/loader/register-plugins.ts:30-41 default `{}`, async so no sync throw incl. supplied loader; RegisterPluginsInput exported via infrastructure/index -> loader/index.ts:2); Registration order OK (register-plugins.ts:68-86 load/validate all, 118-127 init in order, 129-156 dispatch, 163 one disposer); Selection/config validation OK (79-85, dup names 68-74); Destroy/error isolation OK (90-108); Failure policy OK (117-125 init, 141-154 activate, rollback 109-115 with rollbackErrors); Bypass OK (merge before empty short-circuit 61-66).
Discrepancies: E1, E6, E8 (minor). Spec nit: step 1 text says validation of "contribution allowlist" happens before init - it does (84). Duplicate-name check runs before loading any plugin (68-74) - consistent with scenario.
Scenario -> test:

- Called before build (real KernelBuilder): RPC:77 (real builder; does not assert ordering init-before-build() explicitly - weak).
- Registration handle disposes plugins (two plugins, reverse order, twice no-op, no kernel): RP:276 (reverse order via errors) + RP:71/RP:614 (disposer path) - the `registration.dispose()` call directly with two plugins in reverse order without a kernel is only indirectly covered; "no kernel ever built" not asserted. Weak.
- Input defaults: RPC:149; Duplicate handler kind (async rejection, with/without loader): RPC:50, RPC:62, RP:417.
- Init in list order: RP:71; Validation before any init: RP:329, RP:140; Selected contributions only: RP:197; Init for agents-only plugin: RPC:100, RP:312; One named disposer: RPC:77, RP:614 (3 plugins).
- Unknown allowlist id: RP:140; Config violates schema: RP:440; Defaults applied: RP:178; Config without schema: RP:159; Duplicate plugin entry: RP:227.
- Destroy reverse: RP:71, RP:614; Destroy error isolation (PluginDestroyError, SpecdError, errors contains value): RP:276, RP:386; Idempotent: RPC:77, RP:276.
- Partial init failure: RP:550 (+RP:107); Rollback failure does not mask: RP:346, RP:580; SpecdError from init: RP:461; Activate failure rolls back: RP:493; Load failure fails startup: partial - RP:259 (SpecdError from supplied loader); no test through the DEFAULT loader with an unresolvable package (GAP, weak); Plain loader error wrapped: RP:239.
- Plugins disabled: SDK-level (sdk:host-context) - not in this batch; Duplicate handler with empty list: RP:429; Empty list: RP:62, RPC:71.
  Untested behaviour (not a verify scenario): SpecdError thrown by `activate` propagating unchanged; non-Error/async-rejecting activate (probed OK).

### 4. plugin-manager:install-plugin-use-case

Requirement status: Input/Output OK (install-plugin.ts); Behavior OK (load 60-ish via loadPluginSafely, resolveContributions, agents check using isAgentPlugin, install context with options only when given, agents-only filtering via installContextContributions, output contributions == hook list, defaultConfig returned); Error handling OK (hook wrap with fields ['install'], cause, SpecdError passthrough); Agent Initialization Phase: informative pointer; delegated and verified in plugin-agent-\* packages (capabilities/install tests exist in plugin-agent-{claude,codex,copilot,opencode}/test/agent-lifecycle.spec.ts and install-skills.spec.ts; not re-audited here).
Discrepancies: E6 (minor).
Scenario -> test: Input includes pluginName/config: IP:35; Contributions optional: IP:231; Output shape: IP:35; Default config returned: IP:119; Plugin not found: IP:210; Successful install: IP:35; All contributions default: IP:231; Allowlist: IP:247; Mixed kinds: IP:146, HN:80; Options only when provided: IP:62 + IP:35; Unknown id: IP:133; No install hook: IP:100; Init not called: IP:100; Agent declaration w/o contract: IP:87; Install failure wrapped: IP:164 (does not assert message contains cause text; covered at class level ERR:134 and LF for loader) - weak nit; SpecdError passthrough: IP:189; empty `contributions: []` case: HN:46. Agent Initialization Phase scenarios: not testable in plugin-manager (see above).

### 5. plugin-manager:uninstall-plugin-use-case

Requirement status: OK (uninstall-plugin.ts). Minor: `UninstallPluginOutput` (spec: `type UninstallPluginOutput = void`) is not declared/exported (application/use-cases/index.ts exports only `UninstallPluginInput`). Minor/cosmetic.
Scenario -> test: Input: UP:21; Output void: UP:21; Successful: UP:21; Not found: UP:191; Unknown id: UP:127; Mixed kinds: HN:86; Loads via loader: implicit in every UP test (mock loader.load) - fine; Not tied to agents bucket: UP:206 (it.each); No uninstall hook: UP:169; Init not called: UP:169; Agent w/o contract: UP:149; Uninstall failure wrapped: UP:77; SpecdError passthrough: UP:102; options forwarded: UP:48; empty agents list: HN:57.

### 6. plugin-manager:update-plugin-use-case

Requirement status: OK (update-plugin.ts: same pipeline, no defaultConfig, message "Updated"). Idempotency delegated to plugin (documented).
Scenario -> test: Input: UPD:17; Output indicates success: UPD:17; Loads via loader: implicit; Selection preserved: UPD:17, HN:106; Selected id removed: UPD:84; Not found: UPD:211; Output shape/no defaultConfig: HN:122; Idempotent: UPD:184; Mixed kinds: HN:96; Config not modified: UPD:17; Multiple updates: UPD:184; Agent w/o contract: UPD:139; Update failure wrapped: UPD:108; SpecdError passthrough: UPD:159; options: UPD:51.

### 7. plugin-manager:list-plugins-use-case

Requirement status: OK (list-plugins.ts: per-name try/catch, input order, not_found only for PluginNotFoundError, contributions via declaredContributionIds, no lifecycle). Note it calls `loader.load` directly (not loadPluginSafely) - fine because it catches everything. Cosmetic: `String(error)` for non-Error objects -> "[object Object]".
Scenario -> test: Input: LS:6; Returns statuses: LS:6; Reports contributions: LS:60; Not found: LS:38; Error status: LS:6; Order: LS:60; Invalid manifest (unscoped) error entry + others listed: LS:80.

### 8. plugin-manager:agent-plugin-type

Requirement status: AgentPlugin/AgentInstallContext/Options/Result types OK (domain/types/agent-plugin.ts; options fields are `readonly`, structurally compatible with spec); agents handler OK (domain/handlers/agents-handler.ts: strict empty block, key regex, no activate, validatePlugin via isAgentPlugin; built-in via mergeHandlers always first); isAgentPlugin OK. Capability/fallback rules are behavioural rules for plugin-agent-_ packages, not enforceable in plugin-manager.
Scenario -> test: Has install/uninstall: IAP:18, IAP:48; Selected contributions passed: IP:35; Agents block validated: AH:5; Unknown field rejected (loader-level PluginValidationError): PL:195 (bad-block case) + AH:11; No runtime activation: RPC:100; Built-in handler needs no host wiring: RPC:149, PL:100; Invalid id key: PL:344 (loader-level, PluginValidationError naming plugin) + AH:34; Declaring agents w/o install/uninstall: PL:503, AH:17; isAgentPlugin x3: IAP:26, IAP:33, IAP:18/IAP:40; AgentInstallOptions scenarios (skills/agents/variables/capabilities, capability ids, no pre-normalised objects, frontmatter, sharedFolder): type-level IAP:48 only; behavioural ones live in plugin-agent-_ tests (agent-lifecycle/install-skills). Result tracks installed/skipped: type-level only. Agent installed in agents dir / fallback to shared dir: plugin-agent-\* packages, not plugin-manager. Not a gap in this package, but the plugin-manager spec has no executable verification of these.

### 9. plugin-manager:load-plugin-use-case

Requirement status: OK (load-plugin.ts delegates to loadPluginSafely; output `{plugin, manifest}`). Spec says "the use case does not repeat the check" - satisfied.
Scenario -> test: Input: LP:6; Plugin loaded: LP:6; Not found: LP:37 (+LF); Loads via loader/base contract: LP:6 (contract check is loader's, PL:454); No lifecycle calls: LP:6 is a mock loader test - lifecycle absence asserted for the loader at PLC:124 (indirect, weak). Wrapping of plain loader error: LF (4 use cases).

### 10. plugin-manager:plugin-errors

Requirement status: OK. Classes/codes: PLUGIN_NOT_FOUND, PLUGIN_VALIDATION_ERROR, DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD (with optional reason), PLUGIN_INIT_FAILED, PLUGIN_DESTROY_FAILED, DUPLICATE_HANDLER_KIND, INVALID_CONTRIBUTION_ADDRESS - all extend SpecdError, messages actionable, PluginValidationError message includes cause message (plugin-validation.ts buildMessage), cause stored.
Discrepancies:

- (spec-internal inconsistency, minor) Spec lists `PluginDestroyError` under "Each class MUST ... carry the pluginName it concerns" but defines it with only `errors`; the constraints section exempts only DuplicateHandlerKindError/InvalidContributionAddressError. Code (plugin-destroy-error.ts) has no pluginName and its message does not say WHICH plugin failed (errors are raw thrown values, aggregated in destroy order). Either spec needs an exemption or the error should record names.
- (minor) cause fidelity for `throw undefined` (see section A) and `describeCause` for non-Error objects.
- Compat rule: see section A (E1-E8).
  Scenario -> test: Error has pluginName/fields: ERR:19; Errors name plugin: ERR:57; Stable codes: ERR:19; Each class message: ERR:57; Init error keeps cause: RP:493 (cause asserted), ERR:19; Wrapped cause message visible: ERR:134 (class level) + LF (message contains 'disk unplugged' for load); IP:164 asserts cause but not message text (weak); DuplicateHandlerKindError: ERR:74; InvalidContributionAddressError: ERR:19/ERR:99; Non-object schema node keyword: ERR:145, CS:115, CS:122; Validation error fields+cause+code: ERR:130, ERR:134; every exported class is a SpecdError with code: ERR:99; PluginDestroyError order: ERR:90, RP:276.

### 11. plugin-manager:plugin-repository-port

Requirement status: OK. application/ports/plugin-repository.ts: `DeclaredPlugin = ConfigDeclaredPlugin` (re-export alias), `PluginRepositoryPort` with configPath-first signatures using core `AddPluginOptions`; old name removed. The spec text shows an `AddPluginOptions` interface declared in the port; code imports core's `AddPluginOptions` (spec says it mirrors core; acceptable - spec-side wording nit).
Scenario -> test: Has required methods / addPlugin / removePlugin / listPlugins: PRP:19 (structural, compile-time); DeclaredPlugin is core type: PRP:13 (both directions); ConfigWriter assignable: PRP:8 (`ConfigWriter extends PluginRepositoryPort ? true : false` assigned to `true`, checked by tsc since tsconfig includes test/); Signature drift fails compilation: same type-level assertion (relies on tsc being part of CI; vitest alone would not catch it) - weak but acceptable; CLI implementation uses ConfigWriter: not in plugin-manager (CLI tests) - not audited in this batch.

---

## C. Cross-spec / dependency / global contradictions

- core:kernel-builder: `registerDisposer` throws RegistryConflictError if `specd-plugins` already registered, i.e. a second `registerPlugins` on the same builder initialises all plugins first and only then fails (rolled back correctly, 162-166). Spec says "exactly one disposer"; not contradictory, but init side effects occur before the conflict is detected (nit).
- default:\_global/architecture: layering OK (domain imports only core + zod; application imports domain/ports; infrastructure does I/O). `application/use-cases/register-plugins.ts` imports `@specd/core/extensions` type only. No violation found.
- Spec <-> spec: plugin-loader spec says unregistered kind -> `UnknownContributionKindError`; specd-plugin-type says "typed error naming the plugin and the kind" - consistent.
- plugin-errors "Each class MUST carry pluginName" vs PluginDestroyError - see section B.10 (spec-internal).

## D. Severity summary

critical: 0
major: 0
minor (impl): E1 frozen-error rollback TypeError; E2 module export getter; E3 re-read accessors; E4 blockSchema non-object result; E5 unbounded schema recursion; E6 malformed caller-loader result; E7 projectRoot TypeError (nit); E8 outer catch not normalised (structural); cause lost for `throw undefined`; UninstallPluginOutput not exported.
minor (spec-side): `properties` keyword missing from the shape-violation keyword list; PluginDestroyError pluginName inconsistency; port spec shows own AddPluginOptions declaration.
test gaps (all weak): name/version-from-manifest scenario (no test here); registerPlugins with default loader on unresolvable package; duplicate-id test lacks plugin-name assertion; "Called before build" ordering not asserted; registration.dispose-before-kernel not directly asserted with two plugins; install wrap test lacks message-contains-cause assertion; entry-import test lacks explicit SpecdError instanceof; no test for SpecdError from `activate`.
