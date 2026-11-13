# Spec-compliance audit (attempt 5) - change `plugin-architecture`, batch plugin-manager

Scope: 11 specs `plugin-manager:*` (specd-plugin-type, plugin-loader, register-plugins-use-case, install/uninstall/update/list/load-plugin-use-case, agent-plugin-type, plugin-errors, plugin-repository-port). Read-only. Merged specs read via `changes spec-preview ... --artifact specs|verify`. `vitest run` in packages/plugin-manager: 132 pass / 0 fail; `tsc --noEmit` clean (tsconfig includes `test`, so the type-level port conformance test is really type-checked).

Paths are relative to /Users/monki/Documents/Proyectos/specd-worktrees/feat-lifecycle-transitions-ux/packages/plugin-manager.

## Verdict

- Majors: 0. The two attempt-4 majors are fixed (enum/shape validation in `walkSchema`, plugin-config-schema.ts:78-123; `registerPlugins` async, never throws synchronously - contract.spec:47,59).
- Minors: 8 (3 non-SpecdError / typed-error edge paths, 2 message/field quality, 1 spec-vs-code drift, 2 test-quality).
- Scenarios with no or weak test: 21 (listed per spec below).
- All requirements implemented. Every attempt-4 fix verified (details below).

## Verification of attempt-4 fixes

| Fix                                                                                                                                    | Evidence                                                                                                                                          | Status                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Enum/shape validation (`type` set, `required` string[], `additionalProperties` boolean, `items` single object, `enum` non-empty array) | src/domain/services/plugin-config-schema.ts:87-122; tests config-schema.spec:47-66,75-100                                                         | OK (non-object node/root keyword untested, see gaps) |
| `registerPlugins` async, rejects (never sync throw), also with supplied loader                                                         | src/application/use-cases/register-plugins.ts:55 (`async`), mergeHandlers inside; infra register-plugins.ts:30 `async`; tests contract.spec:47-66 | OK                                                   |
| `PluginDestroyError` replaces AggregateError                                                                                           | register-plugins.ts:100-107, errors/plugin-destroy-error.ts; test register.spec:248-282 (asserts SpecdError, code, errors order)                  | OK                                                   |
| Loader wraps `import()` / `create()` with cause                                                                                        | plugin-loader.ts:84-100 (`entry`, `create`; SpecdError from factory passes through); tests contract.spec:130-170                                  | OK                                                   |
| Manifest read/parse cause                                                                                                              | plugin-loader.ts:113-125; tests contract.spec:172-194 (ENOENT / SyntaxError causes)                                                               | OK                                                   |
| Actionable messages                                                                                                                    | errors/\*.ts constructors; test errors.spec:57-88                                                                                                 | OK, but see M5                                       |
| Rollback keeps original error, attaches `rollbackErrors`                                                                               | register-plugins.ts:108-114,192-200; test register.spec:314-352                                                                                   | OK                                                   |

## "Specd compatibility" audit: every throw/rejection path in src

Grep of all `throw`/`new Error`/`AggregateError`/`Promise.reject` in src: every throw site constructs a SpecdError subclass (all 11 classes extend SpecdError; test errors.spec:99-128 enforces it for every exported `*Error`). No `new Error`, no `AggregateError` anywhere. Wrapping sites:

- Loader: manifest read/parse (118,123) -> PluginValidationError(cause); import (88) -> `entry`; factory (98-99) -> `create`, SpecdError passes unchanged.
- Install/uninstall/update hook (install-plugin.ts:77-78, uninstall-plugin.ts:57-58, update-plugin.ts:74-75): wrap non-SpecdError, rethrow SpecdError.
- registerPlugins: `init` (121) and `activate` (149) wrap non-SpecdError in PluginInitError; `destroy` (105) aggregates into PluginDestroyError (SpecdError thrown by destroy is placed in `errors`, as spec says); `builder.registerDisposer` failures are core `InvalidDisposerError`/`RegistryConflictError`, both SpecdError (rolled back at 160-162).
- ListPlugins catches everything and returns it as a string, nothing escapes.

Residual non-SpecdError escape paths (all edge, none reachable with a well-behaved standard loader and spec-conformant handlers):

- **E1 (minor)** plugin-loader.ts:191 `handler.validatePlugin?.(plugin, pluginName)` is not wrapped. A host-supplied handler that throws a plain Error escapes raw from `load()`. Spec says the handler "throws PluginValidationError to reject", so a conformant handler is fine; the blanket rule ("No plugin-manager API MAY surface a plain Error ... thrown by plugin code") is not enforced here. Same for plugin-loader.ts:306 `handler.blockSchema.safeParse(block)` (a Zod schema with async refinement or throwing refine raises a plain Error), and `baseContractFields` (specd-plugin.ts:122-130) reading a throwing getter on the returned plugin object.
- **E2 (minor)** register-plugins.ts:77 `loader.load()` from a caller-supplied `PluginLoader` is not wrapped. Spec (Failure policy): "Any failure to load, validate or initialize a plugin MUST fail registerPlugins with a typed error naming the plugin". The port doc (application/ports/plugin-loader.ts) only declares PluginNotFoundError/PluginValidationError, and the standard loader complies, but register.spec:238-246 enshrines a plain `Error('missing')` surfacing from a custom loader (`rejects.toThrow('missing')`), i.e. the test contradicts the "typed error naming the plugin" wording. Code vs spec: spec stricter than code; either wrap in registerPlugins or relax the spec/port contract to "loader MUST throw SpecdError".
- **E3 (minor)** `resolvePluginConfig` is public API (domain/index.ts) but only safe after `assertSupportedConfigSchema`. With an unvalidated schema (custom loader path in register-plugins.ts:82) `enum: 'fast'` passes `length > 0` in nodeToZod (plugin-config-schema.ts:133) and `enumToZod` calls `'fast'.map` (line 195) -> raw TypeError. The standard loader always runs the gate first (plugin-loader.ts:147-149), and test config-schema.spec:91-100 documents this as "gate" behaviour, so only reachable through a non-standard loader.

## Per-spec results

### plugin-manager:specd-plugin-type - all requirements implemented

| Requirement                                                                       | Status                                                                                                 | Code                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| SpecdPlugin interface                                                             | OK (no `type`, no `configSchema`; hooks optional; install ret `Promise<unknown>`)                      | domain/types/specd-plugin.ts:32-68          |
| PluginContext (`config`,`pluginConfig` only)                                      | OK                                                                                                     | specd-plugin.ts:7-15                        |
| isSpecdPlugin                                                                     | OK (name regex via core `isPluginName`, init/destroy fns, optional install/uninstall/contribution fns) | specd-plugin.ts:118-142                     |
| Plugin manifest (schemaVersion 2, no pluginType, strict, contributes map of maps) | OK                                                                                                     | plugin-loader.ts:35-46                      |
| Plugin name regex                                                                 | OK, identical to spec (core `PLUGIN_NAME_REGEX`, core/src/domain/plugin-name.ts:2)                     |                                             |
| Contribution identity/address                                                     | OK, single error class for build+parse                                                                 | specd-plugin.ts:71-110                      |
| Config schema subset                                                              | OK incl. shape validation, non-object root -> `configSchema`, nested -> `type`                         | plugin-config-schema.ts:78-123              |
| Contribution kind handler                                                         | OK (open registry via mergeHandlers, unknown kind -> UnknownContributionKindError, activate optional)  | merge-handlers.ts, plugin-loader.ts:296-326 |
| Plugin lifecycles                                                                 | OK (loader and install paths never call `init`)                                                        |                                             |

Discrepancies (both sides shown):

- **D1 (minor, spec/code drift)** Loader spec's manifest schema listing shows `configSchema: PluginConfigSchemaSubset.optional()`; code uses `configSchema: z.unknown().optional()` (plugin-loader.ts:43) plus the hand-written walker. Behaviour is equivalent, the spec snippet is not literally what is implemented.
- **D2 (minor, ambiguity)** Spec: "`type` MUST be one of object,string,..."; code (plugin-config-schema.ts:87-92) additionally REQUIRES `type` on every node, so a node like `{ enum: [...] }` or `{ default: 1 }` is rejected as keyword `type`. Spec does not say whether `type` is mandatory on nested nodes. `enum` element types are not validated (spec types them string|number|boolean; `z.literal(obj)` would accept an object by identity).
- **D3 (minor)** Strict-manifest violation (e.g. `pluginType`) yields `fields: ['manifest']` (plugin-loader.ts:138-140) because Zod's `unrecognized_keys` issue has `path: []` (verified). The offending key is not named; spec only requires a typed error naming the plugin, so compliant but unhelpful.

Scenario -> test map (file:line under test/):

- Has required properties: no runtime test for "no `type`/no `configSchema`" (type-level only) - GAP (trivial).
- Name and version sourced from manifest: negative side application/ infrastructure/plugin-loader.spec:509,527 (mismatch); positive side is plugin-factory behaviour - n/a here.
- Optional install hooks: domain/types/is-specd-plugin.spec:15; domain/specd-plugin.spec:41.
- Initialization with SpecdConfig: application/register-plugins.spec:175 (`objectContaining({pluginConfig})`) - WEAK (does not assert `config` passed).
- Rejects unscoped: is-specd-plugin.spec:19; accepts scoped: :15; non-function install: :23.
- pluginType rejected: infrastructure/plugin-loader.spec:437. Other schemaVersion rejected: only :123 which combines schemaVersion 1 + pluginType - GAP (not isolated). contributes must be map of maps: :314 uses top-level `contributes: []`; `contributes.checks` as array not tested - PARTIAL.
- Plugin name valid / dot rejected / uppercase rejected: NO test in plugin-manager, core or cli (grep for `isPluginName|PLUGIN_NAME_REGEX|my.plugin|@Acme` in test dirs found nothing) - GAP (3 scenarios). Unscoped rejected: specd-plugin.spec:32,42; loader.spec:139.
- Address format: specd-plugin.spec:17. Id with dot rejected / build validates parts: :27-38 (uses `Bad.Id`). Parsing failures one class: only `@acme/plugin` and `@acme/plugin.id.extra` tested (:28-31); `acme.a` (invalid plugin part) and `@acme/x.A` (invalid id part) - GAP. Duplicate id across kinds: loader.spec:155 (asserts class only, not "naming the plugin"). Several dots: specd-plugin.spec:29.
- Supported keywords accepted: config-schema.spec:12. Unsupported keyword rejected: :35 (asserts class only, not plugin/keyword) and loader.spec:174 - WEAK. Non-object schema node rejected (root or property): NO test (`{type:'date'}` at :47-53 is an unknown type, not a non-object node; root-not-object never tested; keyword `configSchema`/`type` never asserted) - GAP. Node shape validated: :47-66 covers type 'date' (not 'null'), required, additionalProperties, items array; enum :75-89 asserts keyword `enum` + pluginName; others assert only the class (no keyword/plugin) - PARTIAL. Config without schema rejected: config-schema.spec:68; register.spec:156 (class only, not "naming the plugin").
- Unknown kind rejected: loader.spec:174. validatePlugin receives plugin and name: infrastructure/plugin-loader-contract.spec:94 only the non-throwing call-args half; "handler throws -> loading fails with the thrown PluginValidationError" only via the agents handler (loader.spec:463) - PARTIAL. Duplicate handler kind: contract.spec:87 (loader), application/register-plugins.spec:385 (+:395 empty list). Install-time-only kind: application/register-plugins-contract.spec:119.
- Install does not call init: install-plugin.spec:96,31; uninstall-plugin.spec:169. Options carried: install-plugin.spec:58. Mixed-kind agents only: install-plugin.spec:142; plugin-hooks-no-agents.spec:73. Runtime init for every plugin in order: register-plugins.spec:68.

### plugin-manager:plugin-loader - all requirements implemented, no discrepancy

Load workflow steps 1-9 match plugin-loader.ts:76-103 (resolve via two `createRequire` bases :243-248; manifest validated before import; requested name vs manifest name checked before import :144; factory forms :334-354; base contract fields :180-183; handler `validatePlugin` :190-192; `contribution` required when a kind has `activate` :193-199). `createPluginLoader` merges handlers synchronously so DuplicateHandlerKindError is thrown at creation (:282). Error table all matched.

Scenario -> test:

- Package available: loader.spec:86. Manifest validated before import: loader.spec:123,139,437 - **WEAK (M-T1)**: the fixture entry is `throw new Error("IMPORTED")`; since import failures are now wrapped as `PluginValidationError(['entry'])` (loader :88), these assertions (`rejects.toBeInstanceOf(PluginValidationError)`) pass even if the loader imported before validating. They must also assert `fields` is not `['entry']` (or use a side-effect marker). Real regression risk for the "before importing any plugin code" invariant.
- Version mismatch: loader.spec:527. Name mismatch: :509. Requested name differs: :488 (asserts naming requested plugin per title; class+fields).
- Named create: loader.spec:86 (named `create`). Default fn: :367. Default object: :343.
- **No factory export rejected (fields `create`): NO test** - GAP.
- Entry import wrapped (+ SpecdError instance): contract.spec:130. Throwing factory wrapped / SpecdError passthrough: contract.spec:142,154. Async factory: contract.spec:66. Factory receives config only: contract.spec:74 (loader created WITHOUT extra handlers; scenario says "loader created with extra handlers" - minor).
- Manifest: required fields :66 (missing version), unscoped :139, pluginType :437, dup id :155, unregistered kind :174, invalid block :174, unsupported keyword :174, defaultConfig :174, valid manifest :86.
- Error handling: base contract :416; names failing fields :391 (`fields` exactly `['destroy']`); host agents handler :454; two host handlers contract.spec:87; validatePlugin after base check :463; loader does not run lifecycle contract.spec:108.
- Factory function: contract.spec:74.

### plugin-manager:register-plugins-use-case - all requirements implemented

Matches register-plugins.ts: handlers merged before empty-list short-circuit (:60,63); dupe names -> PluginValidationError (:68-73); all load + config + allowlist validated before first init (:75-85); init in order (:117-125); activate per kind skipping handlers without `activate` (:127-153); exactly one `specd-plugins` disposer after success (:160); rollback destroys reverse, keeps original error, attaches `rollbackErrors` (:108-114); idempotent disposer (:100-102). `RegisterPluginsInput` exported by name (infrastructure/loader/index.ts:2, src/index.ts).

Notes: the plugin whose `init` failed is not destroyed (only fully initialized ones) - consistent with spec ("plugins already initialized"). E2 above applies.

Scenario -> test:

- Called before build with real KernelBuilder: contract.spec:74 (real `createKernelBuilder`, asserts registerDisposer called before build; never calls `build()`) - OK-ish. Registration handle disposes: register.spec:68 (mock builder, reverse order, double dispose). Input defaults (no `input`, standard loader, one plugin initialized): contract.spec:68 uses NO plugins - **GAP**. Duplicate handler kind (rejection, no sync throw, with/without loader): contract.spec:47,59; register.spec:385.
- Init in list order: register.spec:68. Validation before any init: :297,:137,:156,:404. Handlers receive selected only: :196. Init for agents-only: :284; contract.spec:94 (no builder calls except registerDisposer). One named disposer: contract.spec:74 (1 plugin) / register.spec:68 (2 plugins); spec says three - trivial.
- Unknown allowlist id: register.spec:137 (class only; "naming the plugin" not asserted). Config violates schema: :404. Defaults applied: :175. Config without schema: :156. Duplicate entry: :226.
- Destroy reverse: :68. Destroy error isolation: :248,:354 (SpecdError, PluginDestroyError.errors order). Idempotent: :248,:68; contract.spec:74.
- Partial init failure (a,b,c; c throws): register.spec:104 uses 2 plugins (reverse order b-then-a not exercised) - PARTIAL. Rollback failure doesn't mask: :314 (1 initialized plugin) - PARTIAL. SpecdError from init: :425. Activate failure: :457. Load failure fails startup: :238 asserts a plain `Error('missing')` surfaces, not "a typed error naming the plugin" - WEAK, see E2.
- Plugins disabled: SDK-level (sdk:host-context) - out of this batch. Empty list + duplicate handler: register.spec:395. Empty list: register.spec:59; contract.spec:68.

### plugin-manager:install-plugin-use-case - implemented, no discrepancy

install-plugin.ts:61-87 matches Behavior 1-5 and Error handling (agents guard :65, wrap :77-78, SpecdError passthrough, `defaultConfig` returned not written, hooks filtered via `installContextContributions`, options forwarded only when provided). Agent Initialization Phase is informative (plugin-agent-\* specs), no plugin-manager test expected.

Scenario -> test: Plugin not found install-plugin.spec:202; Successful install :31; Output/defaultConfig :115; Unknown id :129; Plugin without install hook :96; Init not called :31,:96; Mixed kinds :142 (+plugin-hooks-no-agents.spec:73); Options only when provided :58 (with-options half; absent half is implied by :31 `toHaveBeenCalledWith` exact object); Agent declaration without contract :83; wrapped :160; SpecdError passthrough :181; agents declared but none selected -> `[]`: plugin-hooks-no-agents.spec:39.
GAPS: "All contributions selected by default" and "Allowlist respected" with a NON-agents plugin declaring `a`,`b` (ids pass through unfiltered) - no test; all fixtures are agents-only or mixed. Agent Initialization Phase scenarios (CLAUDE.md block / AGENTS.md ref-count) - not testable here (live in plugin-agent-\* / skills), listed for completeness.

### plugin-manager:uninstall-plugin-use-case - implemented, no discrepancy

uninstall-plugin.ts:43-60 OK.
Scenario -> test: Successful uninstall uninstall-plugin.spec:21; Plugin not found :191; Unknown id :127; Mixed kinds plugin-hooks-no-agents.spec:79; Loads via loader (implicit, `vi.fn load`); Plugin without uninstall :169; Init not called :169; Agent declaration w/o contract :149 (fields install/uninstall); wrapped :77; SpecdError passthrough :102; options :48.
GAP: "Not tied to the agents bucket" (non-agent plugin WITH an `uninstall` hook receives the selected ids) - :169 has no hook, so the call-with-ids half is untested.

### plugin-manager:update-plugin-use-case - implemented, no discrepancy

update-plugin.ts:58-83 OK; output omits `defaultConfig` (plugin-hooks-no-agents.spec:111).
Scenario -> test: Loads via loader (implicit); Selection preserved update.spec:17 + plugin-hooks-no-agents.spec:99; Selected id removed :84; Plugin not found - **no UpdatePlugin test for PluginNotFoundError** (install:202 and uninstall:191 and load:37 have it; update-plugin.spec has none) - GAP; Output shape :17; Idempotent :184; Mixed kinds plugin-hooks-no-agents.spec:89; Config not modified :17; Agent declaration w/o contract :139; wrapped :108; SpecdError passthrough :159; Multiple updates same result :184.

### plugin-manager:list-plugins-use-case - implemented, no discrepancy

list-plugins.ts:60-80: loaded / PluginNotFoundError -> not_found / other -> error with message; failure per plugin isolated; order preserved; ids via `declaredContributionIds`.
Tests: Returns statuses list-plugin.spec:6; contributions `['a','b']` :60; not_found :38; error status :6; order :60 (checks names order; spec example b,a); invalid manifest (unscoped) entry: :6 uses a generic invalid plugin (verify it uses an unscoped-name manifest - not confirmed) - treat as PARTIAL. Non-Error rejections handled (`String(error)`).

### plugin-manager:agent-plugin-type - implemented, no discrepancy

domain/types/agent-plugin.ts (AgentPlugin, AgentInstallContext Omit<..,'options'>, `isAgentPlugin` install+uninstall functions), domain/handlers/agents-handler.ts (blockSchema `record(idRegex, strict object)`, no activate, `validatePlugin` via isAgentPlugin -> PluginValidationError naming plugin). Built in by mergeHandlers (:15). Minor type drift only: `AgentInstallOptions` uses `readonly` arrays/records where the spec shows mutable `string[]`/`Record` (assignment-compatible for callers; harmless).
Tests: Has install/uninstall (type-level) is-agent-plugin.spec:18,48; Selected contributions passed plugin-hooks-no-agents.spec:73/install-plugin.spec:31; Agents block validated agents-handler.spec:5, loader.spec:283; Unknown field rejected agents-handler.spec:11, loader.spec:174; No runtime activation contract.spec:94; Built-in needs no wiring loader.spec:283 (no handlers passed); Invalid id key loader.spec:314-337 (asserts `pluginName` only, not the `PluginValidationError` class - WEAK); agents without uninstall loader.spec:463; isAgentPlugin 3 scenarios is-agent-plugin.spec:26,33,40,18. AgentInstallOptions / capability / frontmatter / sharedFolder / fallback scenarios: contract-level or agent-plugin behaviour (plugin-agent-\* specs); only type-shape check is-agent-plugin.spec:48 - no plugin-manager-level test, acceptable.

### plugin-manager:load-plugin-use-case - implemented, no discrepancy

load-plugin.ts:33-35 delegates to the loader; errors propagate. Tests: load-plugin.spec:6 (plugin+manifest), :37 (PluginNotFoundError); "no lifecycle calls" is covered at loader level (contract.spec:108), not at LoadPlugin level - trivial; "validates base contract" is loader's duty (loader.spec:416).

### plugin-manager:plugin-errors - requirements implemented

All 11 classes extend SpecdError with the specified stable codes, `pluginName`/`kind`/`address`/`errors`/`cause` properties and messages containing the plugin (or kind) and a remedy. `PluginDestroyError` is a SpecdError with `errors` in destroy order. Spec "Specd compatibility" satisfied except the edge paths E1-E3.

- **M5 (minor, message quality)** PluginValidationError message is fixed text "failed validation (install); fix these fields in the plugin package or its specd-plugin.json to match the plugin contract" (errors/plugin-validation.ts:39) even when it wraps a runtime hook/import/create failure; the cause message (e.g. "disk full", "import boom") is not in the message. A CLI that prints only `message` would give a misleading remedy ("fix specd-plugin.json") for an `install()` crash. Spec requires only an actionable message naming the plugin, so compliant; suggest including `describe(cause)` as PluginInitError/PluginDestroyError already do.
- PluginInitError is also used for `activate` failures but its message says "failed during init" (plugin-init-error.ts:22); spec wording matches ("PluginInitError during init or activate").

Scenario -> test: Error has pluginName (errors.spec:19,57,70); Error has fields (:51); Errors name the plugin (:57); Stable codes (:19; `PLUGIN_VALIDATION_ERROR` code NOT asserted though listed in "Validation error carries fields and cause" - GAP trivial); Each class message contains plugin (:57; PluginDestroyError n/a); Init keeps cause (:19,:35); DuplicateHandlerKindError no pluginName (:74); InvalidContributionAddressError code (:46); **Non-object schema node keyword (`configSchema` for root, `type` for nested): NO test** - GAP (same as specd-plugin-type); Validation error carries fields+cause (:51, code missing).

### plugin-manager:plugin-repository-port - implemented, no discrepancy

application/ports/plugin-repository.ts matches the spec signature (configPath first, `DeclaredPlugin = ConfigDeclaredPlugin`, `AddPluginOptions` from core). Exported as `PluginRepositoryPort` only (no `PluginRepository`). Type-level tests plugin-repository-port.spec:8,13,19 (conformance, identity, readonly listPlugins), type-checked by `tsc --noEmit` (tsconfig `include: ["src","test"]`).
Scenario -> test: Has required methods / addPlugin options / remove / list: spec:19 (type shape); DeclaredPlugin is core type :13; ConfigWriter assignable :8; Signature drift fails compilation: provided by the same assertion (`tsc`), no negative test (acceptable); CLI uses ConfigWriter directly: outside this package (CLI tests).

## Contradictions with dependency/global specs

None found in this batch. Observations:

- `plugin-loader` spec text "Resolve ... first from the project root and then from the loader package's own location" is implemented exactly (plugin-loader.ts:243-248).
- `plugin-errors` constraint "Errors MUST extend SpecdError from @specd/core" holds (domain/errors/\*.ts import it from `@specd/core`).
- `register-plugins-use-case` depends on `core:kernel-builder`: `registerDisposer(name, fn)` usage matches core (core/src/composition/kernel-builder.ts:439-445 throws SpecdErrors for invalid/duplicate disposers; duplicate `specd-plugins` registration would be rolled back).

## Severity index

Minor (8): E1 (plugin-loader.ts:191,306 handler throws unwrapped), E2 (register-plugins.ts:77 / test register.spec:238 plain Error vs "typed error naming the plugin"), E3 (plugin-config-schema.ts:133,195 unguarded TypeError via custom loader), D1 (spec snippet vs `z.unknown()` configSchema), D2 (nested `type` mandatory, enum item types unvalidated - spec silent), D3 (strict-manifest violation reports field `manifest`), M5 (PluginValidationError message hides cause / misleading remedy), M-T1 (loader.spec:123,139,437 pass even if package imported before validation).

Test gaps (no or weak test), by spec:

- specd-plugin-type (11): runtime "no type/configSchema"; PluginContext config assertion (weak); schemaVersion-only rejection; `contributes.checks` array; plugin name valid/dot/uppercase (3); parse failures `acme.a`, `@acme/x.A`; non-object schema root/property; keyword/plugin assertions for unsupported keyword and node shape (weak); validatePlugin-throws via custom handler.
- plugin-loader (2): no `create` export (fields `create`); factory-args test not run with extra handlers.
- register-plugins (4): Input defaults with real standard loader and one plugin; partial-init a,b,c reverse order; rollback with several initialized plugins; load failure "typed error naming plugin".
- install (1): non-agent plugin all-contributions/allowlist ids. uninstall (1): non-agent plugin with hook receives ids. update (1): PluginNotFoundError. agent-plugin-type (1): invalid-id class assertion. plugin-errors (1): non-object schema node keyword (+ PLUGIN_VALIDATION_ERROR code assert).
