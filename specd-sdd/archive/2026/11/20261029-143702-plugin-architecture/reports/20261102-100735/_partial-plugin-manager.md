# Partial compliance report: plugin-manager specs (change plugin-architecture)

Scope: packages/plugin-manager (src + test). Read-only audit. Paths are relative to packages/plugin-manager unless noted.
Legend: OK / DISC (discrepancy) / MISSING. "Untested" = no test asserts the scenario in plugin-manager tests.

Overall: implementation closely follows the specs. The main gaps are (a) LoadPlugin output contract, (b) the PluginRepositoryPort having no implementer / different name, (c) install/uninstall/update error wrapping, (d) thin test coverage on many verify scenarios (several tests are consolidated into one `it`, many scenarios have no assertion).

---

## 1. plugin-manager:specd-plugin-type

Requirements: SpecdPlugin interface; PluginContext; isSpecdPlugin; manifest (schemaVersion 2, no pluginType, contributes map of maps); name rule; contribution id/address; configSchema subset; kind handler registry; lifecycles.

Implementation status

- SpecdPlugin interface: OK. `src/domain/types/specd-plugin.ts:32-68` (name, version, init, destroy, optional install/uninstall/contribution; no `type`, no `configSchema`).
- PluginContext {config, pluginConfig}: OK. `specd-plugin.ts:7-15`.
- isSpecdPlugin: OK. `specd-plugin.ts:105-115` (object, string name/version, isPluginName, init/destroy functions, optional hooks).
- Manifest schemaVersion 2 / pluginType rejected / contributes map-of-maps: OK. `src/infrastructure/loader/plugin-loader.ts:31-42` (`z.literal(2)`, `.strict()` rejects pluginType, `z.record(z.record(...))`).
- Plugin name regex: OK. `packages/core/src/domain/plugin-name.ts:2` identical to spec regex; used at plugin-loader.ts:34 and specd-plugin.ts:108.
- Contribution id regex, address build/parse: OK. `specd-plugin.ts:71-97` (parse requires exactly one dot, dot>0). Id regex enforced in loader `validateContributions` (plugin-loader.ts:316-319).
- Duplicate id across kinds: OK. plugin-loader.ts:320 `DuplicateContributionError`.
- configSchema subset: OK. `src/domain/services/plugin-config-schema.ts:7-96` (keyword whitelist, root type object, recursion on properties/items). Config without schema rejected: plugin-config-schema.ts:54-59.
- Kind handler registry: OK. `contribution-kind-handler.ts:26-44`; unknown kind -> `UnknownContributionKindError` plugin-loader.ts:305; handler without `activate` skipped register-plugins.ts:130.
- Lifecycles (install must not call init; init once per plugin in list order): OK (register-plugins.ts:108-117; install-plugin.ts has no init call).

Discrepancies (spec vs code; neither assumed authoritative)

1. `PluginInstallContext` (specd-plugin.ts:20-27) has `options?: object`; spec lists only `config` and `contributions` (options appear only in `AgentInstallContext`, per agent-plugin-type). Option A: update spec to include `options?` on base context (code is what install/uninstall/update actually forward). Option B: move `options` to AgentInstallContext only and narrow the use cases.
2. `install?` returns `Promise<unknown>` in code (specd-plugin.ts:52) vs `Promise<void>` in spec. Code needs `unknown` to carry `data` through InstallPluginOutput. Spec should be updated, or AgentPlugin-only result typing kept.
3. `ContributionKindHandler` has an extra `validatePlugin?(plugin, pluginName)` hook (contribution-kind-handler.ts:37) not in spec; it is how the agents rule "must implement install/uninstall" is enforced at load time. Spec should document it (or the rule be enforced elsewhere).
4. Spec-internal inconsistency: this spec lists `description` among required manifest fields ("`version`, `description`, `minCoreVersion`"), but plugin-loader spec and code make `description` optional (plugin-loader.ts:36). Code follows plugin-loader spec. Fix wording in one spec.
5. "Plugin names are validated in ... `cli plugins install`": cli install uses `isPluginName` (cli/src/commands/plugins/install.ts:183). OK.

Test coverage (test/domain/specd-plugin.spec.ts, types/is-specd-plugin.spec.ts, domain/plugin-config-schema.spec.ts, infrastructure/plugin-loader.spec.ts)

- Covered: isSpecdPlugin scoped/unscoped/non-function install/null/missing fields; address build and 0/2-dot parse failure; config schema defaults/strict; no-schema config rejection; unknown kind; unsupported keyword `$ref`; duplicate id across kinds.
- Untested scenarios: "Has required properties/no type/no configSchema" (type-level only); "Name and version sourced from manifest" (factory in plugin packages, not here); "Initialization with SpecdConfig" (only indirectly); "Other schemaVersion rejected" (plugin-loader.spec.ts:73/129 use schemaVersion 1 but only assert missing version/not imported, not a schemaVersion-specific assertion; schemaVersion 3 untested); "pluginType rejected" in isolation (only combined with schemaVersion:1 so it would fail even without the pluginType rule); "contributes.checks is an array" (untested; zod record on array not asserted); "Valid scoped names"/"Dot in scope or package"/"Uppercase" (no direct regex tests; only unscoped name); "Id containing a dot rejected" (no test; regex only); "Address format" OK; "Supported keywords accepted" partially (plugin-config-schema.spec); `oneOf` rejection untested; "Install-time-only kind" at runtime (only agents-only init test, register-plugins.spec.ts:274; no custom handler without activate); "Install does not call init" (install-plugin.spec.ts:71 for a no-hook plugin only); "Runtime calls init for every plugin... in list order" OK (register-plugins.spec.ts:65).

Counts: requirements 8 OK-impl / 0 missing; scenarios 28: OK-tested ~9, OK-impl-untested ~17, discrepancy items 4 (spec/code wording), untested ~19 (see above).

---

## 2. plugin-manager:plugin-loader

Implementation (`src/infrastructure/loader/plugin-loader.ts`)

- Load workflow steps 1-9: OK. Resolve (createResolvers 224-229, two require resolvers), read manifest (98-110), validate manifest before import (120-147 happens at line 78, import at line 80), contribution blocks (296-326), dynamic import (80), create() (85), isSpecdPlugin + contribution() requirement (157-181), name/version cross-check (165-170). Loader never calls init/install/destroy.
- Manifest schema: OK with deviation: `configSchema: z.unknown().optional()` (line 39) and validated separately by `assertSupportedConfigSchema` instead of `PluginConfigSchemaSubset` zod type in spec; behaviour matches (UnsupportedSchemaKeywordError).
- Error handling mapping: OK (PluginValidationError / Duplicate / UnknownKind / UnsupportedKeyword / InvalidPluginConfig for defaultConfig, lines 126, 130, 135, 305, 320).
- Factory: OK (create as named or default.create, line 334-351).

Discrepancies

1. `PluginLoaderOptions` (plugin-loader.ts:24-29) has extra optional `handlers`; spec says `{ config }` only. Also `create()` is called with `{ config }` only (line 85), consistent with spec. Extra handlers option is necessary for the kind-registry design; spec should add it.
2. Base-contract violation reports fixed fields `['name','version','init','destroy']` (line 163) regardless of which one failed; spec only requires PluginValidationError. A plugin with an invalid runtime name is indistinguishable. Minor; spec wording allows it.
3. Manifest `.strict()` rejects ANY unknown top-level field (not just pluginType); spec only mandates rejecting pluginType. Stricter than spec, could break plugins with extra metadata (e.g. `$schema`). Decide whether spec should say "unknown fields rejected".
4. Missing/unreadable `specd-plugin.json` throws PluginValidationError(['specd-plugin.json']) (103/108), spec silent; reasonable.
5. Loader executes `handler.validatePlugin` (172) which spec step 8 does not mention (see specd-plugin-type disc. 3).

Test coverage (infrastructure/plugin-loader.spec.ts)

- Covered: package not found; missing version; valid load; invalid manifest -> not imported (line 122); unscoped name before import (138); duplicate id (154); unknown kind, invalid block, `$ref`, bad defaultConfig (173, one combined test); runtime version mismatch + missing contribution accessor (236); no lifecycle call on load (282).
- Untested: "pluginType rejected" specifically (combined with schemaVersion 1 in missing-version test); "Valid manifest passes Zod" explicit scenario (covered by line 85); base-contract violation (plugin missing init/destroy -> PluginValidationError) not tested; "create factory receives config" (config passed) not asserted; default-export `create` variant untested; missing manifest file / invalid JSON untested; name mismatch (only version mismatch tested); `needsContribution` positive case (contribution accessor present) untested; packages found via second resolver untested.

Counts: scenarios 17: OK-tested 11, OK-untested 6; discrepancies 3 (strict manifest, handlers option, validatePlugin); missing tests ~6.

---

## 3. plugin-manager:register-plugins-use-case

Implementation: `src/application/use-cases/register-plugins.ts`, wrapper `src/infrastructure/loader/register-plugins.ts`.

- Signature: OK. Application function needs `loader` (required, line 20); infra wrapper (loader/register-plugins.ts:30-41) makes `loader` optional with `createPluginLoader` default, which is what the spec's `RegisterPluginsOptions.loader?` describes. The public export from package index is the infra wrapper (infrastructure/loader/index.ts) while `application/use-cases/index.ts` exports only the types; OK. No-plugin case returns noop dispose (62-64): OK.
- Registration order: OK. Duplicate check (66-72) -> load+validate all (77-87) -> init in order (108-117) -> activate by kind skipping handlers without activate (119-146) -> ONE disposer `registerDisposer('specd-plugins', dispose)` (154). Allowlist respected via `resolveContributions`.
- Selection/config validation: OK (resolvePluginConfig, resolveContributions, duplicates -> PluginValidationError).
- Destroy/isolation: OK-ish (91-105): reverse order, collects errors, throws `AggregateError` once, idempotent via `disposed` flag.
- Failure policy: OK with caveat (below).
- Bypass: OK. `packages/sdk/src/composition/host-context.ts:102` (`options?.plugins === false`), test sdk/test/composition/host-context.spec.ts:70.

Discrepancies

1. If `destroyReverse(initialized)` itself throws (AggregateError) while handling an init/activate failure (lines 112, 141, 148), the AggregateError propagates instead of `PluginInitError` naming the plugin, masking the original failure. Spec: "initialized plugins MUST be destroyed ... before the error propagates" and typed error naming the plugin. Option A: swallow/attach destroy errors and rethrow the original; Option B: spec states destroy errors win.
2. `disposed = true` is set before the loop; if dispose rejects once, later calls resolve silently (as spec's idempotent requirement). Fine, but errors are reported only on the first call; a caller who ignores the first rejection loses them. Acceptable.
3. Activation failure (handler.activate throws) is wrapped as `PluginInitError` (143) though spec only defines PluginInitError for throwing `init`. Spec silent; likely fine, document.
4. Handler kind duplicates: `mergeHandlers` throws `PluginValidationError('<handlers>', ['kind'])` (176) with a non-plugin name; spec silent (and conflicts with "every error names the plugin" constraint in plugin-errors). Also the same merge logic is duplicated in plugin-loader.ts:273-283 (code duplication).
5. Activation happens after ALL inits (119 loop after 108 loop); spec step order (2 then 3) agrees. A failure in plugin B activation destroys plugin A (init'd) — OK.
6. Spec constraint "Plugin code is imported only after manifest and config validated": the loader imports plugin code in `load()` (plugin-loader.ts:80) BEFORE `resolvePluginConfig` / `resolveContributions` run in register-plugins.ts:84-85. Manifest is validated first (inside load), but config/allowlist validation (the spec's "config") happens after import and `create()` of that plugin and of earlier plugins. Spec: "Load and validate every plugin (manifest, config, contribution allowlist) before running any init" - satisfied for init; but the Constraint "Plugin code is imported only after its manifest and config validated" is NOT strictly met. Option A: relax spec constraint to "manifest" only; Option B: split loader into manifest-read and import steps so config is checked first.

Test coverage (test/application/register-plugins.spec.ts)

- Covered: empty list (56); init in order + one disposer + reverse destroy + idempotent (65); partial init failure with prior destroyed + no disposer (101, only one prior plugin so reverse order not shown); invalid selection -> init not called (134); config without schema (153); defaults applied (172); activate receives only selected contributions (193); duplicate declaration (223); load failure -> no disposer (235); aggregated destroy errors + second dispose no-op (245); agents-only init (274).
- Untested: "Called before build" ordering relative to build; "Registration handle disposes plugins before any kernel exists" (partially via registration.dispose()); "Validation before any init" with invalid CONFIG on second plugin (test 134 covers selection, not config; 153 covers no-schema); "Config does not satisfy schema" -> InvalidPluginConfigError (no test with violated schema); "Destroy error isolation" asserting all destroys still ran and error reported after (test only checks AggregateError class, not that both destroys were called); init-failure destroy order b then a (only one prior plugin); typed error naming plugin for load failure asserted via message 'missing'; "Plugins disabled" tested only in sdk package (OK); `PluginInitError` instance check missing (uses toMatchObject on pluginName); activation failure path; builder.registerDisposer failure path (153-158); handler-kind duplicates.

Counts: scenarios 21: OK-tested 10, OK-untested/weak 10, discrepancy items 2 (error masking, import-before-config-validation) + 2 minor.

---

## 4. plugin-manager:install-plugin-use-case

Implementation: `src/application/use-cases/install-plugin.ts:58-83`.

- Input/Output shape: OK (lines 11-36, optional defaultConfig/data).
- Behavior 1-5: OK. loader.load, resolveContributions (UnknownContributionError), agents guard via isAgentPlugin (61-63), install() with context `{config, contributions, options?}` (64-75), result with defaultConfig (76-82); no init/destroy.
- Agent Initialization Phase: use case delegates to `plugin.install({config, contributions, options})` OK. Rendering/injection/refcount is in plugin-agent-_ packages (plugin-agent-_/test/install-skills.spec.ts mentions `specd-plugin:`/hook assets), not in plugin-manager.

Discrepancies

1. Error handling: spec says `PluginValidationError` when `install()` throws. Code rethrows any `SpecdError` unchanged (73) and wraps only non-SpecdErrors with `PluginValidationError(['install'])` (74). Scenario "Install failure is wrapped" holds only for plain Errors. Option A: spec clarified (SpecdErrors pass through); Option B: always wrap and keep cause. Also the original error is lost (no cause) in the wrapped error.
2. `PluginNotFoundError` when package cannot be resolved: delegated to loader; OK.
3. Agent-guard order: contributions are resolved (line 60) before the agent guard (61); spec order is the same (2 then 3). OK.
4. Spec says options "for agent plugins"; code forwards options for all plugins (harmless).

Test coverage (test/application/install-plugin.spec.ts)

- Covered: selected contributions installed (31); agents without hooks -> PluginValidationError (58); plugin without hook succeeds and init not called (71); defaultConfig returned (90); unknown contribution (104).
- Untested: "Plugin not found" (loader mocked; PluginNotFoundError propagation not asserted); "All contributions selected by default" a,b exact array (only empty/one); "Allowlist respected" exact `['a']`; "Install failure is wrapped" (no test with a throwing install); "no config file modified" not assertable here; the three "Agent Initialization Phase" scenarios (CLAUDE.md block, hook asset, AGENTS.md refcount on uninstall) are not in plugin-manager tests; they sit in plugin-agent-\* tests (not audited in depth; shared-file refcount scenarios belong to skills/plugin-agent specs rather than this use case spec - spec scoping smell).

Counts: scenarios 15: OK-tested 5, OK-untested 7 (+3 agent-phase scenarios outside package); discrepancy 1 (error wrapping).

---

## 5. plugin-manager:uninstall-plugin-use-case

Implementation: `src/application/use-cases/uninstall-plugin.ts:40-57`. Same structure as install: load, resolveContributions, agents guard, `plugin.uninstall?.(context)`, wrap non-SpecdError as `PluginValidationError(['uninstall'])`, returns void, no init/destroy. OK.

Discrepancies: same as install #1 (SpecdError passthrough vs "PluginValidationError when uninstall() throws").

Test coverage (test/application/uninstall-plugin.spec.ts, 1 test): covers only successful uninstall with `contributions: ['claude']` and context shape. Untested: not-agents-bucket plugin; plugin without uninstall hook; init not called; agents-declaration without uninstall -> PluginValidationError; uninstall failure wrapped; unknown contribution id; PluginNotFoundError; output void.

Counts: scenarios 8: OK-tested 2 (successful uninstall, loads via loader); OK-untested 6; discrepancy 1.

---

## 6. plugin-manager:update-plugin-use-case

Implementation: `src/application/use-cases/update-plugin.ts:55-79`. OK: load, resolve (UnknownContributionError for removed ids), agents guard, `install?.()` with selected ids, returns `{success, message, contributions, data?}` (no defaultConfig, matches spec). Idempotency: stateless, OK.

Discrepancies

1. Error wrapping same as install (SpecdError passthrough).
2. "An update MUST NOT activate a contribution that was not already selected: when contributions is omitted ... the CLI passes that allowlist." This is CLI behavior; use case with omitted `contributions` selects all declared ids (as spec's input comment says). Verify at CLI: packages/cli/src/commands/plugins/update.ts (not audited here).

Test coverage (test/application/update-plugin.spec.ts): covered "selection preserved + config not written" (17) and "selected id removed" (51). Untested: idempotency (two runs equal), agents-declaration guard, update failure wrapped, input/output shape, load via PluginLoader explicit assertion.

Counts: scenarios 8: OK-tested 3, OK-untested 4 (idempotency, guard, wrap, output shape), discrepancy 1.

---

## 7. plugin-manager:list-plugins-use-case

Implementation: `src/application/use-cases/list-plugins.ts:60-80`. OK: per-name load, `loaded` with plugin, manifest, `declaredContributionIds`; `PluginNotFoundError` -> `not_found`; any other error -> `error` with message; continues listing others. No init/install/destroy.

Discrepancy (minor): `pluginNames` is `readonly string[]` (spec `string[]`), output `readonly PluginListStatus[]`; compatible. `PluginListStatus` type name is extra exported type.

Test coverage (test/application/list-plugin.spec.ts, 1 test): loaded with contributions + error status for another plugin. Untested: `not_found` status (PluginNotFoundError mapping); "Invalid manifest is an error entry" specifically unscoped (uses generic PluginValidationError); input shape.

Counts: scenarios 6: OK-tested 3 (returns statuses, contributions, error status), OK-untested 3 (not_found, unscoped manifest via real loader, input array); discrepancies 0.

---

## 8. plugin-manager:load-plugin-use-case

Implementation: `src/application/use-cases/load-plugin.ts:33-35` simply `return this.loader.load(...)`; `LoadPluginOutput = LoadedPlugin`.

Discrepancies

1. Spec Output is a discriminated union `{plugin, manifest} | { error: PluginNotFoundError | PluginValidationError }` and scenario "Plugin not found -> returns { error: PluginNotFoundError }". Code never returns `{error}`; it throws (loader errors propagate). Option A: update spec to "throws typed errors" (also consistent with spec text that "other typed loader errors are propagated as thrown errors"). Option B: implement the union and catch the two errors. Consumers (cli plugins show/list) would need to be checked for which style they expect.
2. Behavior step 2 "validate the plugin implements the base SpecdPlugin contract": delegated to the loader (`isSpecdPlugin` in plugin-loader.ts:162), the use case itself does not re-validate. Equivalent with the real loader; with a custom/mock loader the guarantee is absent.

Test coverage (test/application/load-plugin.spec.ts, 1 test): covered "Plugin loaded" and loader call. Untested: "Plugin not found" scenario (it would currently fail if asserted as `{error}`), "No lifecycle calls", base-contract validation, input shape.

Counts: scenarios 5: OK-tested 2 (plugin loaded, loads via loader); discrepancy 1 (Plugin not found scenario contradicted by code); untested 2.

---

## 9. plugin-manager:plugin-errors

Implementation: `src/domain/errors/*.ts`. All 8 classes extend `SpecdError`, codes exactly match spec (DUPLICATE_CONTRIBUTION_ID, UNKNOWN_CONTRIBUTION, UNKNOWN_CONTRIBUTION_KIND, INVALID_PLUGIN_CONFIG, UNSUPPORTED_SCHEMA_KEYWORD, PLUGIN_INIT_FAILED; existing PLUGIN_NOT_FOUND, PLUGIN_VALIDATION_ERROR). Messages contain the plugin name. `PluginInitError.cause` preserved (plugin-init-error.ts:20). `PluginValidationError.fields` is `readonly string[]` (spec `string[]`).

Discrepancies

1. `InvalidPluginConfigError` issue text for no-schema case is "config provided but plugin declares no configSchema" (plugin-config-schema.ts:57) vs spec comment "config given but no configSchema declared"; wording only.
2. `PluginInitError` message is only "Plugin 'x' failed during init" and omits the cause message; spec requires "actionable message"; the cause is available only via `.cause`. Consider appending the cause message.
3. Constraint "Every error raised while loading, validating or initializing a plugin MUST name the plugin" is violated by `mergeHandlers` (`'<handlers>'`, plugin-loader.ts:279 and register-plugins.ts:176) and by `parseContributionAddress`, which uses the address as pluginName (specd-plugin.ts:94).
4. Constraint about `LEGACY_CONFIG_FORMAT` / `UNSUPPORTED_CONFIG_VERSION` owned by core: not checked here (core responsibility).

Test coverage (test/domain/errors.spec.ts): one test checks codes of the 6 new errors, pluginName on two, cause on init, `kind`. Untested: PluginNotFoundError.pluginName, PluginValidationError.fields, that messages contain the plugin name, pluginName on remaining errors, contributionId/issues/keyword properties (partially), extends SpecdError.

Counts: scenarios 5 (+2 base req): OK-tested 2 (stable codes, init cause), OK-untested 3 (pluginName/fields/message), discrepancies 2 (message detail, `<handlers>` naming).

---

## 10. plugin-manager:plugin-repository-port

Implementation: `src/application/ports/plugin-repository.ts`: interface named `PluginRepository` (not `PluginRepositoryPort`), plus `AddPluginOptions`, `DeclaredPlugin` (readonly fields), methods addPlugin/removePlugin/listPlugins, no type/bucket. Shape matches spec.

Discrepancies

1. Name: spec `PluginRepositoryPort`, code `PluginRepository`. Cosmetic; align one.
2. "Implementation note: in the CLI this port is implemented via ConfigWriter" - no class implements `PluginRepository` anywhere outside plugin-manager (grep over packages found no usage). CLI uses `ConfigWriter` directly (cli/src/commands/plugins/\*.ts via `createConfigWriter`). Scenario "CLI implementation uses ConfigWriter" has no corresponding code. Option A: remove port + implementation note from spec (dead abstraction); Option B: add a CLI adapter implementing the port.
3. `DeclaredPlugin` is also redefined in cli (`cli/src/commands/plugins/get-declared-plugins.ts:6` `DeclaredPluginEntry`), duplicating the type.

Test coverage: none (interface only; no tests). Missing: all 5 scenarios untestable at runtime except type-level; "CLI implementation uses ConfigWriter" has no code to test.

Counts: scenarios 5: OK-impl 3 (has methods, addPlugin signature, removal/list shape by type only), untested 5, discrepancy 2 (name, no implementer).

---

## 11. plugin-manager:agent-plugin-type

Implementation: `src/domain/types/agent-plugin.ts`, `src/domain/handlers/agents-handler.ts`.

- AgentPlugin extends SpecdPlugin with required install/uninstall; AgentInstallContext extends PluginInstallContext with options: OK.
- Agents handler: OK. `kind: 'agents'`, blockSchema `z.record(idRegex, z.object({}).strict())` (accepts `{}`, rejects unknown fields), no `activate`, plus `validatePlugin` enforcing isAgentPlugin (agents-handler.ts:12-20).
- AgentInstallOptions / TemplateVariable / AgentInstallResult: OK; fields readonly (spec mutable arrays; compatible). `capabilities` identifiers mcp/agents/frontmatter are not defined as constants or validated in plugin-manager (just `readonly string[]`); contract is documentary.
- isAgentPlugin: OK (agent-plugin.ts, install and uninstall functions).
- Agent installation and fallback (target dir/shared.md): implemented in plugin-agent-\* and skills, not in plugin-manager; not auditable here.

Discrepancies

1. `AgentInstallOptions.skills/agents/capabilities` are `readonly string[]` vs spec `string[]`; harmless.
2. Spec says the handler is "registered by hosts that handle plugins ... so the loader accepts the agents kind"; code auto-includes `agentsContributionHandler` in both loader (`mergeHandlers`, plugin-loader.ts:276) and registerPlugins (register-plugins.ts:172); hosts do not register it. If a host passes its own `agents` handler, `mergeHandlers` throws `PluginValidationError('<handlers>')`. Spec wording should say built-in.
3. `AgentInstallContext.contributions` carries selected agents ids per spec; the code passes ALL selected contribution ids (any kind) from resolveContributions (install-plugin.ts:60), so in a plugin with mixed kinds `contributions` includes non-agent ids. Spec: "contributions carries the selected agents contribution ids". Option A: spec says "selected ids"; Option B: filter by kind for agent plugins.

Test coverage (domain/agents-handler.spec.ts, domain/types/is-agent-plugin.spec.ts)

- Covered: empty block accepted & no activate; unknown field rejected (at schema level, not through loader -> PluginValidationError); isAgentPlugin missing install -> false; accepts install+uninstall; recursive variables typing.
- Untested: "rejects plugin with install but no uninstall"; "Selected contributions are passed" (['claude']); "No runtime activation" via registerPlugins (only init-still-runs test); loader-level "Unknown field rejected -> PluginValidationError" (covered by bad-block loader test at plugin-loader.spec.ts:173); capability identifiers and variables.frontmatter/sharedFolder scenarios (contract/documentation scenarios, no code in this package); AgentInstallResult shape; agent install fallback scenarios (belongs to plugin-agent-\* / skills).

Counts: scenarios 17: OK-tested 5, OK-untested 4, contract/doc-only (not testable here) 8; discrepancies 2.

---

## Cross-spec / global contradictions

- specd-plugin-type "description" required vs plugin-loader "description" optional (see 1.4).
- plugin-errors constraint (all errors name plugin) vs `'<handlers>'` and address-as-plugin in PluginValidationError.
- register-plugins constraint (code imported only after config validated) vs plugin-loader workflow (import happens in load before config/allowlist checks).
- load-plugin-use-case output union vs plugin-loader / list-plugins behavior (errors thrown/caught): plugin-loader says errors are thrown; load-plugin spec says some are returned.
- install/uninstall/update error spec ("PluginValidationError when X throws") vs code passing through SpecdError subclasses; plugin-errors says typed errors catchable by type, so passthrough may be intended.
- plugin-repository-port implementation note vs actual CLI (uses ConfigWriter directly; no adapter).
- core:config spec path in Spec Dependencies uses `../../core/core/config/spec.md` in some specs and `../../core/config/spec.md` in register-plugins; one is a broken relative link (spec hygiene).
- Not checked against core kernel-builder spec beyond `builder.registerDisposer(name, fn)` usage (register-plugins.ts:154).

## Totals (approximate)

| Spec                   | OK-tested | OK-untested     | Discrepancy items | Untested/missing tests |
| ---------------------- | --------- | --------------- | ----------------- | ---------------------- |
| specd-plugin-type      | ~9        | ~17             | 4                 | ~19                    |
| plugin-loader          | 11        | 6               | 3                 | ~6                     |
| register-plugins       | 10        | 10              | 2 (+2 minor)      | ~10                    |
| install-plugin         | 5         | 7 (+3 external) | 1                 | ~8                     |
| uninstall-plugin       | 2         | 6               | 1                 | 6                      |
| update-plugin          | 3         | 4               | 1                 | 4                      |
| list-plugins           | 3         | 3               | 0                 | 3                      |
| load-plugin            | 2         | 1               | 1                 | 2                      |
| plugin-errors          | 2         | 3               | 2                 | 3                      |
| plugin-repository-port | 0         | 5 (type only)   | 2                 | 5                      |
| agent-plugin-type      | 5         | 4 (+8 doc-only) | 2                 | ~8                     |

Highest-priority findings: (1) LoadPlugin never returns `{error}`; (2) PluginRepositoryPort name and no CLI adapter; (3) plugin code imported before config/allowlist validation vs spec constraint; (4) SpecdError passthrough vs "wrapped as PluginValidationError"; (5) destroy failure during init rollback masks PluginInitError; (6) `AgentInstallContext.contributions` not filtered to agents; (7) test gaps: uninstall/update/list/load use cases have 1-2 tests each, no test for not_found, install failure wrapping, schemaVersion-specific rejection, destroy isolation assertions.
