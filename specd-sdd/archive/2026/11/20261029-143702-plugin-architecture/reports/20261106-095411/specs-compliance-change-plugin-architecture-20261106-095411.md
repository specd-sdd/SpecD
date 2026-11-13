# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-6)

## Summary

| Batch                     | Critical | Major                                                                       | Minor                             | Notes                                                               |
| ------------------------- | -------- | --------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| core/config (5 specs)     | 0        | 1 (M1: duplicate plugin names inside one extending layer collapse silently) | 10                                | + weak/missing tests                                                |
| plugin-manager (11 specs) | 0        | 0                                                                           | ~10                               | E1-E8 exotic non-SpecdError escapes, spec wording, 7 weak scenarios |
| cli (8 specs)             | 0        | 0                                                                           | 8                                 | M1 unknown-kind wording; weak assertions                            |
| sdk/agents (8 specs)      | 0        | 0                                                                           | 9 (C1-C9) + 16 test gaps (T1-T16) | T4 surviving mutation in all five plugins                           |
| **Total**                 | **0**    | **1**                                                                       | **~37**                           |                                                                     |

Attempt-5 findings (M1 help text, E1-E3, D1-D12 etc.) verified fixed. Baseline test run before the audit: core 3378, cli 1293, plugin-manager 200, sdk 113, skills 112, five agent plugins 26-27, code-graph 799, guide 59 — all passing.

## Detailed findings

### \_partial-core-config.md

# Audit attempt 6 - batch core-config (read-only)

Change: plugin-architecture. Specs: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show.
Tests executed (all green): core `config-writer.spec`, `config-loader.spec`, `config-cascade-plugins.spec`, `check-registry.spec`, `ports/config-writer.spec` = 233 pass; cli `config-show.spec`, `config-show-real-loader.spec`, `load-config.spec` = 18 pass. CLI binary exercised by hand (help, extra arg, no config, `--config` missing).

Totals: critical 0, major 1, minor 10 (plus test-coverage gaps listed per spec).

## Verification of attempt-5 fixes

| Fix                                                        | Verdict  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config show --help` generated from typed key table        | VERIFIED | `packages/cli/src/commands/config/config-shape.ts:22-99` (`satisfies Record<keyof SpecdWorkspaceConfig/SpecdStorageConfig/SpecdConfig, ...>` and `AllKeys<SpecdContextEntry>`), rendered by `renderConfigShapeHelp()` (`:117-134`), wired at `show.ts:93-98`. Real `--help` output lists every key of SpecdConfig (incl. warnings, configPath, logging, graph, privacy, actorProvider, contextMode, invalidation, plugins), workspace (12 keys incl. prefix/graph/contextIncludeSpecs), storage (9 keys), context entries. No project-level key appears in the workspace block. |
| Drift test                                                 | VERIFIED | `packages/cli/test/commands/config-show.spec.ts:381-388` (key-table vs `Required<SpecdConfig/Workspace/Storage>` fixtures at `:327-375`) and `:390-417` (brace-balanced parse of the actual help text per level).                                                                                                                                                                                                                                                                                                                                                               |
| `addPlugin` rejects empty `contributions` before file read | VERIFIED | `packages/core/src/infrastructure/fs/config-writer.ts:125-130`; test `config-writer.spec.ts:311-318`, and absent-file ordering `:283-296`.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| add/remove/list reject non-mapping YAML root               | VERIFIED | `config-writer.ts:203-209` (`readMappingRoot`) used at `:132,151,181`; tests `config-writer.spec.ts:320-329` (add), `:417-433` (remove+list, scalar and sequence).                                                                                                                                                                                                                                                                                                                                                                                                              |
| `InvalidPluginNameError` states scoped grammar             | VERIFIED | `packages/core/src/domain/errors/check-registry-errors.ts:24` ("@scope/name", lowercase letters, digits, underscores, hyphens, regex); test `check-registry.spec.ts:75-99`.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Same regex everywhere                                      | VERIFIED | single source `packages/core/src/domain/plugin-name.ts:2`; reused by config-schema.ts:209, config-writer.ts:119, check-registry.ts:240, plugin-manager (plugin-loader.ts:38, specd-plugin.ts), CLI install/init.                                                                                                                                                                                                                                                                                                                                                                |

## cli:config-show

Requirement status: Command signature OK; Output format OK; Help text OK (fix verified); Sensitive fields OK; Error cases OK.

- Text renderer `show.ts:13-83` matches spec layout, including `pattern:` under storage, `contextIncludeSpecs/ExcludeSpecs/llmOptimizedContext/schemaPlugins`, and `plugins:` lines `  <name>  (present)` + single space + `[contributions: a, b]` only when allowlist non-empty (`:64-71`); `schemaOverrides: (present)`.
- json/toon serialize `SpecdConfig` as-is (`show.ts:111-115`).
- Loader-only path: `loadConfig` (`packages/cli/src/load-config.ts:15-31`) does not call `resolveCliContext`; warnings go to stderr via `console.warn` (`:24-27`).
- Manual: `config show extra` -> `error: too many arguments for 'show'...`; no config -> exit 1 `error: Config validation failed ... no specd.yaml found`; `--config /nonexistent` -> exit 1 `config file not found`.

Scenario -> test map

- No positional arguments: NO TEST (only `allowExcessArguments(false)` at `show.ts:92`; behaviour verified manually). Weak/none. minor.
- artifactRules not shown: `config-show.spec.ts:217` (asserts only `not.toContain('artifactRules:')` on a config that cannot contain it; trivially true). Weak.
- plugins shown (no type grouping): `config-show.spec.ts:199-218`.
- No contributions suffix: `config-show.spec.ts:220-234`.
- TOON output: `config-show.spec.ts:236-251` (substring checks only; does not decode TOON or prove `plugins` list). Weak.
- JSON serializes SpecdConfig directly: `config-show.spec.ts:83-110, 253-268`; real loader `config-show-real-loader.spec.ts:70-90`.
- Broken plugin does not prevent config show: `config-show-real-loader.spec.ts:44-68` (real loader, unresolvable package) + `config-show.spec.ts:270-278` (no host). Good. Note the fixture uses legacy `adapter: fs` form (warnings), harmless.
- contributions allowlist shown: `config-show.spec.ts:199-218`.
- Help documents current fields: `config-show.spec.ts:381-417`.
- No sensitive values: no test (spec statement only). minor/acceptable.
- Config not found: `config-show.spec.ts:420-433` mocks `loadConfig` to reject with `ConfigValidationError`; does not exercise real discovery failure (verified manually). Weak.

Discrepancies

- None blocking. `CONTEXT_ENTRY_KEYS` (config-shape.ts:57-61) is not used by the renderer (the `context` help line is a hard-coded string at `:121`), only by the test, so the context-entry help could drift from the table; the test's regex at `config-show.spec.ts:414-416` pins the hard-coded string, so drift still fails the build. minor (maintainability).

## core:config-writer-port

Requirement status

- Interface shape OK (`ports/config-writer.ts:51-94`; interface with 4 methods).
- InitProject signature/options/result OK (`:2-25`).
- InitProject behaviour OK: configVersion 2 via `CURRENT_CONFIG_VERSION` (`config-writer.ts:59`), no storage block (`:58-73`), dirs + metadata dir (`:84-89`), rooted `/.specd/metadata/` + both local patterns idempotently (`:96-100, 347-363`), tmp `.gitignore` via `ensureTmpGitignore(configDir)` (`:84`).
- Already-initialised guard OK (`:49-51`).
- AddPlugin OK: name check `:119-124`, empty-contributions check `:125-130` before any read; merge preserves omitted fields `:261-273`; legacy/invalid shape rejected without write `:287-302`; missing file -> ConfigValidationError `:223-225`; invalid YAML `:239-251`.
- RemovePlugin OK: absent plugins key/name -> return without write `:152,154`; legacy/invalid/absent file throw.
- ListPlugins OK: ENOENT -> [] `:173-177`; same errors as add/remove `:179-191`.
- Delivery access: CLI uses `createConfigWriter()` (`cli/src/commands/plugins/install.ts:51`, `uninstall.ts:42`, `project/init.ts:90,241`); no `FsConfigWriter` import in CLI.
- Optional config: init synthesizes no plugin entries.

Scenario -> test map (core `test/infrastructure/fs/config-writer.spec.ts` unless noted)

- Implementation satisfies contract: `test/application/ports/config-writer.spec.ts:10-48` (type-level; relies on tsc since tsconfig includes `test`).
- Fresh project initialised: `:42-63`, `:65-82`, `:84-91`.
- Metadata cache dir created: `:65-74`.
- Metadata dir idempotent on re-init: `:93-102` re-inits with force but asserts only the .gitignore count, never that the directory exists / no error is explicit. WEAK.
- Metadata entry appended to root .gitignore, other content undisturbed: `:84-91` only starts from no .gitignore; "other existing ignore content is undisturbed" is NOT tested. GAP (minor).
- Entry not duplicated: `:93-102`.
- Non-default fs `metadataPath` not rewritten: NO TEST. GAP.
- Non-filesystem repository not subject to gitignore step: NO TEST. GAP.
- tmp gitignore: `:408-415`.
- Result metadata: `:42-48`.
- Existing config without force throws / with force overwrites: `:123-134`.
- Adds plugin: `:151-158`. With config and contributions: `:160-177`, `:331-344`.
- Duplicate updates existing: `:160-177`. Update preserves omitted fields: `:298-309`.
- Invalid name rejected, file unmodified: `:218-223`, `:260-269`.
- Empty contributions rejected without writing: `:311-318`, `:283-296`.
- Legacy not rewritten: `:348-363`.
- Config+contributions persisted and listed: `:331-344`.
- Malformed YAML (add/remove/list, byte-identical): `:379-395`.
- Absent config on mutation: `:271-281`, `:397-405`.
- Remove / absent no-op / no plugins key byte-identical: `:181-209`.
- ListPlugins all / no key / legacy / absent: `:156-229`, `:231-239` (legacy asserted as LegacyConfigFormatError for list; "same error as add/remove" is only implied by `:356-361`).
- Delivery via composition factory / not FsConfigWriter: CLI tests mock `createConfigWriter` (`cli/test/commands/plugins.spec.ts`, `project-init.spec.ts`, `plugins-update.spec.ts`, `project-update-allowlist.spec.ts`); no static check for "not FsConfigWriter" (grep confirms none in cli/src). Weak (acceptable).
- InitProjectOptions/Result shape: type-level only (no assertions in `ports/config-writer.spec.ts` for these two interfaces other than via the `impl` literal at `:39-47`). Weak.
- Optional plugin config absent after init: `config-writer.spec.ts:62` (storage undefined) + `:225-229` (plugins absent).

Discrepancies

- minor: spec says an explicit `undefined` in `options` "is not allowed"; implementation silently treats `{ contributions: undefined }` as omitted (`config-writer.ts:266-267`). Type-level only; no runtime rejection. Spec: config-writer-port AddPlugin. Code: `mergePluginEntry` uses `??`.
- minor: `addPlugin` on a 0-byte or comment-only `specd.yaml` succeeds and produces a file containing only `plugins:` (verified with a probe: result `"plugins:\n  - name: \"@a/b\"\n"`). Spec only requires errors for invalid YAML / invalid shape / absent file, so this is arguably in-spec, but it writes an invalid project config.
- minor (spec-side): the two scenarios "Non-default filesystem metadataPath is not rewritten" and "Non-filesystem repository is not subject to the metadata gitignore step" presuppose `initProject` reads a resolved config; `InitProjectOptions` has no such input and `initProject` always writes defaults (`config-writer.ts:80`). They are vacuously satisfied and untestable as written.

## core:config

Touched requirements: Cascade identity and removal model, Plugin declarations, Config version, Config writer port (plus startup validation).

Requirement status

- Plugin declarations: PARTIAL (see M1).
- Config version: OK. `assertCurrentConfigFormat` (`config-loader.ts:691-700`) called for every active layer before merge (`:263-265`); version check precedes legacy; `positive().int()` in `config-schema.ts:293`; root-vs-layer version mismatch `config-cascade.ts:528-535`; fractional > 2 reports `UnsupportedConfigVersionError` (acceptable per spec text).
- Cascade identity and removal: PARTIAL (see M1, m1).
- Config writer port: OK (methods match; `Readonly<Record>` vs `Record` is a harmless variance).

Scenario -> test map (core `test/infrastructure/fs/config-loader.spec.ts` unless noted)

- Plugin entry removed by name: `:2394-2417`.
- Removing an absent plugin name fails: `:2497-2516`.
- Duplicate names in removal list: `:2462-2481`.
- Layer plugin replaces same name in place / new name appended: `:2419-2444`.
- Flat plugins list / entry shape / contributions accepted: `:1215-1239`.
- Invalid plugin structure: `:1258-1269`. Unscoped name: `:1285-1295`. Duplicate name (single layer, root): `:1297-1308`.
- Empty contributions list rejected: `:1271-1283`.
- Absent configVersion accepted: `:1350-1355`. Newer rejected: `:1337-1348`. Legacy migration: `:1310-1335`. Legacy precedes schema: `:1310-1335`. Invalid value: `:1357-1361`, `:1422-1435`. `plugins.skills` generic: `:1363-1373`. Legacy in extending layer: `:2446-2460`. Mismatch in extending layer: `:2483-2495`. init writes configVersion: `config-writer.spec.ts:52`.
- Plugin mutation does not alias previous layer arrays: `config-cascade-plugins.spec.ts:21-60`.
- GAPS: no test for `remove.plugins` when no plugins are inherited at all (`config-cascade.ts:497-499`, "no plugins in inherited config"); no test for duplicate names inside an extending layer (this is the M1 defect); no test for a layer removing a plugin it adds itself (m1).

Discrepancies

- **M1 (major)** Duplicate plugin names inside one extending layer are silently collapsed instead of rejected. Spec: core:config "A plugin name MUST appear at most once" and core:config-loader line "rejecting duplicate names". Code: `mergePluginLists` (`packages/core/src/application/ports/config-schema.ts:356-374`) replaces the match by `result[index] = entry`, so the second entry of the layer overwrites the first (or the inherited one) and `PluginsZodSchema`'s duplicate check (`:215-227`) runs on the already-merged list and never sees it. Reproduced with the built CLI: root `plugins: [@acme/x]`, `specd.local.yaml` (`extends: true`) with `@acme/x {a:1}` and `@acme/x {a:2}` -> `config show --format json` gives `plugins: [{name:@acme/x, config:{a:2}}]` with no error, while the same duplicate in a root layer fails (test `:1297`). Fix direction: detect duplicates within each layer's own `plugins` before merging.
- **m1 (minor)** `remove.plugins` is applied after the layer's own `plugins` are merged (`config-cascade.ts:536-537`), so a layer can add `@acme/y` and remove `@acme/y` in the same file without error. Spec: "Removing a name that is absent from the inherited list ... MUST fail". Reproduced: root `[@acme/x]`, local `plugins: [@acme/y]` + `remove.plugins: [@acme/y]` loads fine, result `[@acme/x]`. (Same ordering exists for context/workspaces/storage, pre-existing.)

## core:config-loader

Requirement status: YAML parsing and legacy/version pre-checks OK; plugin mapping OK (`config-loader.ts:665-675`, no plugin loading); error surface OK (`LegacyConfigFormatError`/`UnsupportedConfigVersionError` extend `ConfigValidationError`: `legacy-config-format-error.ts:7`, `unsupported-config-version-error.ts:10`); warnings via `SpecdConfig.warnings`.

Scenario -> test map: see core:config table (same tests). Additional:

- Plugins are not loaded by the loader: `config-loader.spec.ts:1241-1256`.
- Plugin identity is name (mapped entry preserves name/config/contributions): `:1215-1239`.
- Newer version precedes legacy: `:1375-1386`; extending layer newer version: `:1388-1399`; root legacy even when extend removes plugins: `:1401-1420`.
- Weak: "Legacy format in extending layer ... naming the layer" asserted via regex `/specd\.local\.yaml/` at `:2459` (good).
  Discrepancies: only M1/m1 above (loader spec line 162 states "rejecting duplicate names" and removal semantics).

## core:check-registry

Requirement status: all requirements touched by this change OK.

- Scoped grammar enforced `check-registry.ts:240-242`; canonical id `${pluginName}.${check.id}` (`:244`), single leading `@`; duplicate -> `DuplicateCheckError` (`:246-248`); kind -> `InvalidCheckKindError` (`:250-260`); `withExecutableBuiltins` (`:131-153`) keeps ids/bindings/governance; `getBindings/getGovernance` (`:199-211`); governance defaults (`:343-354`).
- Composition forwards governance: `composition-registries.ts:239` (`register(reg.pluginName, reg.check, reg.defaultBindings, opts)`); doc comment updated to scoped grammar (`:67`).

Scenario -> test map (`packages/core/test/domain/services/check-registry.spec.ts`)

- Retrieve registered / unregistered: `:14-50`, `:463-481`.
- List 16 + 2: `:463-481`.
- getBindings: `:14-50`, `:621-625`. getGovernance: `:201-224`, `:504-520`, `:621-625`.
- withExecutableBuiltins: `:522-542`.
- Built-ins injected / no shadowing: `:186-195`, `:225-258`, `:292-305`.
- Invalid plugin name (incl. whitespace, dots, uppercase, traversal): `:52-73`, `:260-290`, `:588-602`.
- Grammar accepted (digit, hyphen, underscore): `:70` (`@acme/1plugin`), `:101-114`, `:604-619`.
- Canonical id / single `@`: `:101-114`.
- Error states grammar: `:75-99`.
- Duplicate check: `:136-153`. Kind adaptation / reject effect: `:116-134`, `:307-328`.
- Duplicate binding coordinates incl. step-skip, archive: `:154-185`, `:400-438`, `:627-632`.
- Governance locks (embedding/override/config/disable, composition forwarding, executable instances, schema-embedded real result, archive exception): not touched by this change; governance defaults covered at `:329-398`, `:483-520`, `:563-578`; the schema-validation-level scenarios live in other specs' tests (not re-audited here; no regression observed).
- GAP/Weak: "Archive and transition coordinates are independent", "archiveChecks survive layer merging", plugin-archive tuning scenarios are not in this file (out of scope of this change).

Discrepancies

- m2 (minor, code wording): `CheckEmbeddingForbiddenError` message and doc comment attribute the lock to `allowBindingOverride` (`check-registry-errors.ts:112-113,136`). Spec: placement is governed only by `allowSchemaEmbedding` ("allowBindingOverride SHALL NOT restrict placement"). Misleading diagnostic for plugin authors.
- m3 (minor, spec-side drift): verify.md scenarios still use pre-scoped names that the same spec's grammar rejects: "Retrieve registered check by canonical ID" (`@security.code-scan`), "Valid CustomCheckDefinition automatically adapted" (`registry.register('qa', checkDef)`), "Reject check definition explicitly declaring effect kind" (`register('shell', ...)`), "Register valid check binding coordinates" (`@security.scan`). Following them literally would throw `InvalidPluginNameError`; code and tests (`@acme/...`) are right, the verify scenarios are stale.
- m4 (minor): pluginName is validated but `check.id` is not (ids with dots/`@` are accepted, test `:292-305` pins it as intended). Spec silent; noted only because ids like `a.b` make canonical ids ambiguous.

## Cross-spec / global notes

- m5 (minor, spec-side): core:config-writer-port "Delivery access" and verify say CLI imports `createConfigWriter` "from `@specd/core`"; CLI imports it from `@specd/sdk` (re-export of the same function: `sdk/src/core-reexports.ts:4`; `cli/src/commands/plugins/install.ts:3`, `uninstall.ts:2`, `project/init.ts:2`). Consistent with the CLI-delegates-to-SDK direction but literally differs from the spec text.
- m6 (minor): `listPlugins` on a directory / unreadable path throws a raw fs error (`config-writer.ts:173-177` only maps ENOENT); spec only defines ENOENT -> [], so acceptable but not a `ConfigValidationError`.
- No contradiction found between PLUGIN_NAME_REGEX use in core, plugin-manager and CLI; grammar text in core:config, core:check-registry, core:config-writer-port and InvalidPluginNameError agree.

### \_partial-plugin-manager.md

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

### \_partial-cli.md

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

### \_partial-sdk-agents.md

# Partial audit: batch sdk-agents (attempt 6)

Change: `plugin-architecture`. Read-only audit. Specs: sdk:composition, sdk:host-context, plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.

Verification run: `vitest run` PASS in sdk (113), claude (27), copilot (26), codex (27), opencode (27), standard (26). `tsc --noEmit` clean in sdk, the five plugins and skills (test dirs are in `include`, so `expectTypeOf` and `@ts-expect-error` assertions are enforced by typecheck, not by vitest runtime).

I also ran each of the five plugins' real `create().install()` (real `@specd/skills` repository and `ResolveBundle`, no mocks) into a temp dir and inspected the output (details under T8). All correct.

## Totals

- Critical: 0
- Major: 0
- Minor code/spec discrepancies: 9 (C1-C9)
- Test gaps (weak or missing): 16 (T1-T16). T4 is the most important: a mutation survives.
- All requirements implemented. Every scenario is mapped below. Gaps are listed explicitly.

## Attempt-6 delta: verified

| Claim                                                                               | Result                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner-before-write tests strengthened in all five plugins                           | OK. claude `install-skills.spec.ts:597`, copilot `:515`, codex `:501`, opencode `:568`, standard `:562`. A directory named like the FIRST shared file forces the first shared write to fail. The test then asserts `.owners.json` lists the plugin, `shared.md` absent, a later full uninstall removes the folder. Would fail if `addSharedOwner` ran after the write. Strong. |
| Filtered uninstall in shared folder (no `agents` capability)                        | OK. `agent-lifecycle.spec.ts:182` in claude, copilot, codex, opencode, `:123` in standard. `removeSharedOwner` is spied (wrapping the real one) and asserted 0 calls. Marker byte-identical, other agent file and `shared.md` remain.                                                                                                                                          |
| Capabilities behaviour                                                              | OK. `agent-lifecycle.spec.ts:223/239` (default set includes `agents`; decoy in shared folder untouched). Spec wording in all five plugin specs matches code (`options?.capabilities ?? [defaults]` in both install and uninstall).                                                                                                                                             |
| SDK `readRollbackFailures` unpacks `PluginDestroyError.errors`                      | OK in code (`host-context.ts:188-200`). Real `PluginDestroyError` has `errors` as an own property and `code` as a prototype getter. `'code' in err` is true for prototype getters, so detection works on the real class. Test `host-context.spec.ts:364` uses a synthetic object, not the real class (see T12).                                                                |
| SDK tests: empty plugin list / multi-plugin rollback / type-level handler contracts | OK. `host-context-e2e.spec.ts:140` (undefined and `[]`), `:130` (a ok, b fails, `destroy:a`), `handler-contracts.spec.ts:12-38` (`toEqualTypeOf`, enforced by tsc).                                                                                                                                                                                                            |
| Meta-package tests opencode / standard                                              | OK. `meta-package.spec.ts:7` in each asserts `workspace:*` in `packages/specd/package.json` (confirmed present). Wizard option is tested in `cli/test/commands/project-init.spec.ts:339-341` (exact list of five). `cli/src/commands/project/init.ts:14-20` has all five.                                                                                                      |
| Frontmatter contract tests                                                          | OK. `test/domain/frontmatter-contract.spec.ts` in all five. `expectTypeOf<keyof Frontmatter>` is an exact-set check and `@ts-expect-error` rejects unknown keys. Both are enforced only through `tsc`. opencode also tests `toOpenCodePermission` (`:69` bare + patterns gives `'*'`, `:78` patterns preserved).                                                               |

## sdk:composition: status

| Requirement                             | Status | Evidence                                                                                                                                                                                                                                                           |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package identity and dependencies       | OK     | `packages/sdk/package.json` deps are exactly core, code-graph, plugin-manager. `test/composition/package-boundary.spec.ts:12` and `composition.spec.ts:8`. plugin-manager has no sdk dependency (`package-boundary.spec.ts:24`).                                   |
| Layer structure                         | OK     | `package-boundary.spec.ts:56` (no `infrastructure/`, `domain/` has only `errors/`); `barrel.spec.ts` "permits the SDK domain and curated shared aliases" (`exports['.']` equals dist js/d.ts, no `./domain`/`./shared`).                                           |
| Public barrel exports                   | OK     | `src/index.ts`, `core-reexports.ts` (`isPluginName`/`PLUGIN_NAME_REGEX` `:526-527`, `createConfigWriter` `:4`, kernel/metadata/persisted-spec factories `:366-380`). Removed APIs absent (grep for `SaveSpecMetadata`, `PersistSpecMetadata` finds nothing).       |
| Public barrel exports for host adapters | OK     | `index.ts:54-139`. Lock/IPC symbols absent. Publish-shaped consumer `test/fixtures/publish-shaped-worker-consumer.ts` lists all 7 failure classes and `@ts-expect-error` on lock symbols; `barrel.spec.ts` builds and typechecks it, then greps `dist/index.d.ts`. |
| Import policy                           | OK     | cli deps: sdk, guide, plugin-agent-\*, plugin-manager, schema-std; no core/code-graph (`package-boundary.spec.ts:42`). `grep` finds no `@specd/core` or `@specd/code-graph` import in `cli/src` or `mcp/src`.                                                      |
| Version constant                        | OK     | `index.ts:150`; `barrel.spec.ts` "exports SDK_VERSION".                                                                                                                                                                                                            |
| Implementation review orchestration     | OK     | `buildImplementationReview` exported plus types; `barrel.spec.ts` "exports host bootstrap and orchestration symbols".                                                                                                                                              |

### sdk:composition scenario to test map

| Scenario                                              | Test                                                                                                                    | Strength                                                                                                                                                    |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK depends on core, code-graph, plugin-manager       | `package-boundary.spec.ts:12`, `composition.spec.ts:8`                                                                  | strong                                                                                                                                                      |
| Dependency graph acyclic                              | `package-boundary.spec.ts:24`                                                                                           | strong (checks deps and devDeps)                                                                                                                            |
| Source tree keeps infrastructure out                  | `package-boundary.spec.ts:56`                                                                                           | strong                                                                                                                                                      |
| Internal shared dir has no subpath                    | `barrel.spec.ts` "permits the SDK domain..."                                                                            | ok                                                                                                                                                          |
| No export star from core                              | `barrel.spec.ts` "does not use export star" (regex on `index.ts`)                                                       | ok (`core-reexports.ts` is `export {…}` explicit)                                                                                                           |
| Orchestration and bootstrap symbols                   | `barrel.spec.ts` "exports host bootstrap..." and "re-exports core bootstrap factories"                                  | strong                                                                                                                                                      |
| Context markdown helpers                              | `barrel.spec.ts` "exports the context markdown presentation helpers"                                                    | strong                                                                                                                                                      |
| Kernel-equivalent factories                           | `barrel.spec.ts` "re-exports core bootstrap factories" (`createGetStatus`, `createSpecRepository`)                      | strong                                                                                                                                                      |
| Revised metadata materialization surface              | `barrel.spec.ts` "re-exports curated core surface"                                                                      | **weak: T11** (`createRegenerateSpecMetadata` not asserted; class/type names not asserted)                                                                  |
| Removed metadata mutation APIs not restored           | same test, `createSave/Update/InvalidateSpecMetadata` absent                                                            | **weak: T11** (`SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, `PersistSpecMetadata` names not checked)                                 |
| Ports subpath re-exports core ports                   | `barrel.spec.ts` "exposes core port contracts via /ports"                                                               | **weak: T11** (runtime `defined`/`function` only; no type-identity assertion)                                                                               |
| Handler contracts                                     | `handler-contracts.spec.ts:12,18`                                                                                       | strong (type level, enforced by tsc)                                                                                                                        |
| Plugin error classes                                  | `barrel.spec.ts` "re-exports plugin error classes from the same module"                                                 | **partial**: identity asserted for 4 of the 11 classes (`PluginInit/Destroy/Validation`, `DuplicateHandlerKind`); the others only `typeof function`. Minor. |
| Isolated graph worker available                       | `barrel.spec.ts` "re-exports host-adapter..." and "isolated worker..."                                                  | strong                                                                                                                                                      |
| Raw lock absent                                       | `barrel.spec.ts` "re-exports the isolated worker without raw lock..." and "keeps lock... out of built SDK declarations" | strong                                                                                                                                                      |
| Built declarations expose complete worker contract    | `barrel.spec.ts` "compiles every documented worker contract"                                                            | strong (real build + tsc)                                                                                                                                   |
| Host can index without direct Code Graph import       | same fixture                                                                                                            | strong                                                                                                                                                      |
| Layer and package-entry rules match published surface | `barrel.spec.ts` "permits the SDK domain..."                                                                            | ok                                                                                                                                                          |
| CLI no direct core/code-graph                         | `package-boundary.spec.ts:42`                                                                                           | strong                                                                                                                                                      |
| Plugin may depend on core                             | `package-boundary.spec.ts:35`                                                                                           | ok                                                                                                                                                          |
| SDK_VERSION matches package version                   | `barrel.spec.ts` "exports SDK_VERSION"                                                                                  | strong                                                                                                                                                      |
| Review exposed without parallel imports               | `barrel.spec.ts` + `build-implementation-review.spec.ts`                                                                | ok                                                                                                                                                          |

## sdk:host-context: status

| Requirement              | Status                          | Code                             | Notes                                                                                                                                                                    |
| ------------------------ | ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SdkHostContext shape     | OK                              | `host-context.ts:26-36, 117-123` | No `config` field; `Object.keys` asserted exactly `[createGraphProvider, dispose, kernel]` (`host-context.spec.ts:292`).                                                 |
| createSdkContext         | OK with minor edge cases C1, C2 | `:94-124`                        | Order, `plugins:false`, `pluginHandlers`, dispose-on-build-failure, `rollbackErrors`, primitive error all implemented as specified.                                      |
| openSpecdHost            | OK                              | `:139-175`                       | Mixed inputs rejected before loader creation; forced / startDir / cwd modes; fallback only for `ConfigNotFoundError` and never for `configPath`.                         |
| Host disposal            | OK                              | `:117-123`                       | `dispose` returns `kernel.dispose()` directly (same promise); `[Symbol.asyncDispose]` is the same function; the provider is never closed. No API wraps a foreign kernel. |
| Config mutation boundary | OK                              | n/a                              | No write methods on the context.                                                                                                                                         |

### sdk:host-context scenario to test map

| Scenario                                                | Test                                                                                   | Strength                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Context exposes kernel, provider factory, disposal only | `host-context.spec.ts:289`                                                             | strong                                                                                                                           |
| Context is async-disposable                             | `:323` (`await using`)                                                                 | strong                                                                                                                           |
| Provider factory uses same config                       | `:60-71`                                                                               | strong (`toHaveBeenCalledWith(sampleConfig)`)                                                                                    |
| Awaits kernel construction                              | implicit in every `await createSdkContext`                                             | n/a (descriptive)                                                                                                                |
| New provider on each call                               | `:149`                                                                                 | ok (mock returns A then B)                                                                                                       |
| Disposal delegates to kernel                            | `:305`                                                                                 | strong                                                                                                                           |
| Kernel options forwarded                                | `:202` (`createKernelBuilder` called with `kernelOptions`)                             | ok; the spec's `onLog` example is not used, but forwarding is asserted by identity                                               |
| Plugins registered before build                         | `:68-70` (`invocationCallOrder`)                                                       | strong                                                                                                                           |
| Plugins disabled                                        | `:73` and e2e `:121`                                                                   | strong                                                                                                                           |
| Plugins enabled by default                              | `:60` and e2e `:104`                                                                   | strong                                                                                                                           |
| Empty plugin list                                       | e2e `:140` (both undefined and `[]`); also asserts `registerDisposer` not called       | strong                                                                                                                           |
| openSpecdHost forwards `plugins`                        | `:218`                                                                                 | ok                                                                                                                               |
| Broken plugin fails creation                            | e2e `:114,130` (`PluginInitError`, `.pluginName === '@local/b'`, `init:a`,`destroy:a`) | strong                                                                                                                           |
| Build failure disposes plugins                          | `:86`                                                                                  | ok                                                                                                                               |
| Build failure not masked by dispose failure             | `:102` (identity `toBe(buildError)`, `rollbackErrors`)                                 | strong                                                                                                                           |
| Primitive build error not masked                        | `:115` (string, null, number; `Logger.warn` called)                                    | strong                                                                                                                           |
| End to end real plugin-manager                          | e2e `:104`                                                                             | ok. "before the kernel existed" is not observed directly (only init order); the ordering is covered by the mocked test at `:68`. |
| Extra handlers forwarded                                | `:86-100` (`registerPlugins` called with `handlers: [handler]`)                        | ok                                                                                                                               |
| Discovery from cwd                                      | `:163`                                                                                 | strong                                                                                                                           |
| startDir                                                | `:228`                                                                                 | strong                                                                                                                           |
| Forced path                                             | `:223`                                                                                 | strong                                                                                                                           |
| Mixed inputs rejected                                   | `:235` (also asserts loader not created)                                               | strong                                                                                                                           |
| SDK options forwarded                                   | `:202`                                                                                 | strong                                                                                                                           |
| Warnings on config / no top-level warnings              | `:172`, `:184`                                                                         | strong                                                                                                                           |
| Opt-in bootstrap fallback                               | `:245`                                                                                 | strong                                                                                                                           |
| Explicit config never falls back                        | `:269`                                                                                 | strong                                                                                                                           |
| dispose shares kernel disposal                          | `:314` (same promise identity twice)                                                   | partial: "each disposer ran exactly once" is core's contract; see T14                                                            |
| dispose destroys plugins in reverse                     | e2e `:104` (`destroy:b`, `destroy:a`)                                                  | strong                                                                                                                           |
| await using releases host                               | `:323`                                                                                 | strong                                                                                                                           |
| openSpecdHost result carries disposal members           | `:333`                                                                                 | strong                                                                                                                           |
| Graph providers not closed                              | `:340`                                                                                 | strong                                                                                                                           |
| No API wraps a foreign kernel                           | `:351` (regex over barrel)                                                             | weak-ish (name-based heuristic; a function with another name would pass). Minor.                                                 |
| Host context has no write methods                       | `:297`                                                                                 | ok                                                                                                                               |

## Plugin specs: status

Applies to all five (`<P>` = claude, copilot, codex, opencode, standard). Differences are noted per row.

| Requirement                                                                                                           | Claude                                            | Copilot                                         | Codex                                                              | OpenCode                                                                | Standard                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Factory export (`create`, manifest read own dir then parent, no `type`)                                               | OK `src/index.ts:15-52`                           | OK                                              | OK                                                                 | OK                                                                      | OK                                                                 |
| Manifest (`schemaVersion 2`, no `pluginType`, `agents.<id>`)                                                          | OK                                                | OK                                              | OK                                                                 | OK                                                                      | OK                                                                 |
| Domain layer / frontmatter type                                                                                       | OK (`Frontmatter` has the 14 keys)                | OK (6 keys)                                     | OK (`name`,`description`)                                          | OK (5 + `allowed_tools` for agents)                                     | OK (6 keys)                                                        |
| Capabilities passed as literals                                                                                       | `['mcp','agents','frontmatter']`                  | `['frontmatter','agents']`                      | `['mcp','agents','frontmatter']`                                   | `['mcp','agents','frontmatter']`                                        | `['frontmatter']` (hard-coded, ignores `options.capabilities`: C9) |
| Via `ResolveBundle`, no direct `getBundle`                                                                            | OK `install-skills.ts:90`                         | OK `:96`                                        | OK                                                                 | OK `:94`                                                                | OK                                                                 |
| Skills / agents location                                                                                              | `.claude/skills/<n>/`, `.claude/agents/<n>.md`    | `.github/skills`, `.github/agents/<n>.agent.md` | `.codex/skills`, `.codex/agents/<n>.toml`                          | `.opencode/skills`, `.opencode/agents/<n>.md`                           | `.agents/skills`, agents always in shared folder as `<n>.agent.md` |
| Agent mapping                                                                                                         | `tools` = comma string, `model` only when present | `tools` = YAML list (`splitTopLevelCommas`)     | TOML `name`, `description`, `developer_instructions` with escaping | `mode: subagent`, `permission` map                                      | `name`, `description` only                                         |
| Prompt injection (install)                                                                                            | `injectSpecdBlock(CLAUDE.md,…,'claude')`          | `.github/copilot-instructions.md`, `'copilot'`  | `AGENTS.md`, `'codex'`                                             | `removeSpecdBlock` then `injectSpecdBlock` on `AGENTS.md`, `'opencode'` | `AGENTS.md`, `'standard'`                                          |
| Uninstall: filtered keeps block / marker, no `removeSharedOwner`                                                      | OK (early return `uninstall-skills.ts:53-55`)     | OK `:52-54`                                     | OK                                                                 | OK                                                                      | OK                                                                 |
| Uninstall: full (skills incl. legacy `.md`, agents, `removeSpecdBlock`, owners protocol, `removeSharedFolderIfEmpty`) | OK `:57-85`                                       | OK `:56-85`                                     | OK                                                                 | OK                                                                      | OK                                                                 |
| Owner registered before first shared write (incl. fallback agents)                                                    | OK `:144-148`                                     | OK `:151-155`                                   | OK                                                                 | OK `:148-152`                                                           | OK                                                                 |
| Agent placement derived from `capabilities`                                                                           | OK `:56-61`                                       | OK                                              | OK                                                                 | OK                                                                      | n/a (unconditional)                                                |
| Fast-track + manual-only routing                                                                                      | OK description + `disable_model_invocation: true` | OK + `disable-model-invocation: true`           | OK description only                                                | OK description only                                                     | OK description + `allowed-tools`                                   |
| `allowed-tools` space style (standard only)                                                                           | n/a                                               | n/a                                             | n/a                                                                | n/a                                                                     | OK all 8 skills; `specd-compliance` has node, pnpm, git, gh        |
| Wizard / meta package (opencode, standard)                                                                            | n/a                                               | n/a                                             | n/a                                                                | OK                                                                      | OK                                                                 |

### Plugin scenario to test map

Test file shorthand: `IS` = `test/install-skills.spec.ts`, `AL` = `test/agent-lifecycle.spec.ts`, `PL` = `test/domain/types/<p>-plugin.spec.ts`, `FC` = `test/domain/frontmatter-contract.spec.ts`. Line numbers are claude's unless stated. The other plugins mirror them within a few lines (see the test-name lists).

| Scenario (all plugins unless noted)                                                  | Test                                                                                                                                                                                   | Strength                                                                                                              |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Exposes create / returns plugin                                                      | `IS:143` (every test `await create({config})`)                                                                                                                                         | ok                                                                                                                    |
| Factory reads manifest for name and version                                          | **none** (`PL:8` constructs the class directly)                                                                                                                                        | **gap T2**                                                                                                            |
| No type discriminator                                                                | `PL:8` (`not.toHaveProperty('type')` on the constructed class, not on `create()`)                                                                                                      | weak (T2)                                                                                                             |
| Async factory result awaited                                                         | none in plugins; loader contract tests in `plugin-manager/test/infrastructure/plugin-loader*.spec.ts`                                                                                  | T3, minor                                                                                                             |
| Manifest declares agents contribution                                                | `PL:38`                                                                                                                                                                                | strong                                                                                                                |
| Install receives the context                                                         | `PL:21` (config and options forwarded for install and uninstall)                                                                                                                       | strong                                                                                                                |
| Created plugin satisfies runtime contract / no capability objects (copilot, codex)   | `IS:230` (copilot: `capabilities: arrayContaining(['frontmatter','agents'])`); codex `IS:144`                                                                                          | ok                                                                                                                    |
| Install emits frontmatter through skills rendering                                   | `IS:143`: asserts `---`/`description:` but those come from the **mock bundle content**                                                                                                 | **weak (T8)**                                                                                                         |
| Shared files without frontmatter                                                     | `IS:143` (`shared-content` exact, no `description:`)                                                                                                                                   | ok                                                                                                                    |
| Installs to skills dir + sharedFolder default                                        | `IS:143` (`configPath`, `schemaRef`, `sharedFolder` variables; files at expected paths)                                                                                                | strong                                                                                                                |
| Shared dir has no SKILL.md                                                           | not asserted explicitly                                                                                                                                                                | minor                                                                                                                 |
| Installs agents to categorized dir                                                   | `IS:235` (file exists, contains prompt); frontmatter only as a variable                                                                                                                | partial (T8)                                                                                                          |
| Agent model read from metadata (claude)                                              | `IS:557` (variable `model: 'sonnet'`)                                                                                                                                                  | ok                                                                                                                    |
| Agent without model omits key (claude)                                               | `IS:638`                                                                                                                                                                               | strong                                                                                                                |
| Bash patterns / plain tools / no duplicate keys (opencode)                           | `IS:268` (exact object) and `FC:69,78`                                                                                                                                                 | strong                                                                                                                |
| Fallback to shared location when `agents` missing                                    | `IS:499` (claude; others `:405` copilot, `:402` codex, `:458` opencode) asserts agent file in shared dir and absent from the agents dir                                                | ok, but does not assert owner registered (T4)                                                                         |
| Prompt block written                                                                 | `IS:353`                                                                                                                                                                               | strong                                                                                                                |
| Uninstall removes block when sole reference                                          | `IS:353` (file gone)                                                                                                                                                                   | strong                                                                                                                |
| Uninstall keeps block while another plugin references it (codex, opencode, standard) | codex `IS:379`, opencode `IS:435`, standard `IS:445`                                                                                                                                   | strong                                                                                                                |
| Filtered uninstall keeps block (`options.skills`)                                    | **only `options.agents` is asserted** (`AL:123,182`)                                                                                                                                   | **gap T1**                                                                                                            |
| Legacy marker removed on install (opencode)                                          | `IS:363` (seeded `<specd-plugin:opencode>`)                                                                                                                                            | strong                                                                                                                |
| Legacy marker purged on uninstall (codex, standard)                                  | none (`codex IS:305`, `standard IS:365` check only that a fresh install has no legacy marker: vacuous)                                                                                 | **gap T7**                                                                                                            |
| Uninstall removes selected skill dirs and keeps shared                               | `IS:143` (`skills:['specd']`, shared file remains)                                                                                                                                     | ok                                                                                                                    |
| Uninstall without filter removes only managed; user skill remains                    | `IS:143` (user-skill remains), `IS:677` (legacy flat files)                                                                                                                            | strong                                                                                                                |
| Uninstall removes selected agent files                                               | `AL:123`                                                                                                                                                                               | strong                                                                                                                |
| Uninstall without filter removes managed agents, keeps unrelated                     | `AL:160`                                                                                                                                                                               | strong                                                                                                                |
| Filtered uninstall keeps prompt block and marker                                     | `AL:123`, `IS:481`                                                                                                                                                                     | partial (T1)                                                                                                          |
| Install registers owner / filtered install registers owner                           | `IS:388` (filtered); codex/opencode `AL:223`; standard `AL:160`                                                                                                                        | ok                                                                                                                    |
| Owner registered before first shared write                                           | `IS:597` (see delta table)                                                                                                                                                             | strong                                                                                                                |
| Filtered uninstall removes only selected agent in shared folder                      | `AL:182` (standard `AL:123`)                                                                                                                                                           | strong                                                                                                                |
| Other owners keep shared files                                                       | claude `IS:408` (marker equals `['copilot']`), standard `AL:176`                                                                                                                       | strong for claude and standard; **copilot `IS:387`, codex `IS:379`, opencode `IS:435` do not assert the marker (T6)** |
| Last owner removes shared files and folder                                           | copilot `IS:461`, codex `IS:447`, opencode `IS:514`, standard `IS:508` (shared.md and folder gone); claude `IS:430` only `shared.md` gone, folder removal only indirectly via `IS:597` | **T5** (agent files and marker not asserted)                                                                          |
| Foreign file keeps folder                                                            | `IS:448`                                                                                                                                                                               | weak: asserts only `notes.txt` survives, not that `shared.md` and the marker were deleted (T5)                        |
| Legacy install without marker deletes no shared file                                 | `IS:465`                                                                                                                                                                               | strong                                                                                                                |
| Agents next to shared.md when `agents` missing                                       | `IS:499`                                                                                                                                                                               | ok (T4)                                                                                                               |
| Domain layer files exist                                                             | `FC:36-44`                                                                                                                                                                             | ok                                                                                                                    |
| Frontmatter values cover supported fields / unsupported excluded                     | `FC` (`expectTypeOf` exact key set, `@ts-expect-error`, map keys subset)                                                                                                               | strong (tsc-enforced)                                                                                                 |
| InstallSkills passes values into skills rendering / shared to sharedFolder           | `IS:143,235` (`getBundle` called with variables and capabilities)                                                                                                                      | ok                                                                                                                    |
| Does not call `SkillRepository.getBundle` directly                                   | none possible with this mock (`getBundle` is invoked by `ResolveBundle` itself)                                                                                                        | T9                                                                                                                    |
| Default install includes fast-track                                                  | claude `IS:143` (2 installed), opencode `IS:186`, standard `IS:192`; **copilot `IS:572` and codex `IS:558` use an explicit `skills:['specd-fasttrack']`**                              | **T10** for copilot and codex                                                                                         |
| Manual-only routing                                                                  | `IS:143` (exact frontmatter object incl. `disable_model_invocation: true`)                                                                                                             | strong (exact-equality)                                                                                               |
| Copilot omits unsupported fast-track branches                                        | `IS:572` only checks frontmatter; branch omission is a skills-renderer concern                                                                                                         | weak (T10)                                                                                                            |
| Wizard (opencode, standard)                                                          | `cli/test/commands/project-init.spec.ts:339`                                                                                                                                           | strong                                                                                                                |
| Meta package (opencode, standard)                                                    | `meta-package.spec.ts:7`                                                                                                                                                               | strong                                                                                                                |
| allowed-tools config (standard)                                                      | `FC` (all 8 entries: space style, `Read`, `Bash(node *)`, no colon) and `IS:430` (compliance has node, pnpm, git, gh)                                                                  | strong                                                                                                                |
| Codex TOML escaping                                                                  | `IS:331,589,597`                                                                                                                                                                       | strong for string escaping                                                                                            |

## skills:shared-folder-owners: status

Implementation `packages/skills/src/application/shared-folder-owners.ts`. Requirements OK: marker file, `addSharedOwner`, `removeSharedOwner`, `removeSharedFolderIfEmpty`, uninstall protocol (implemented per plugin). Constraint "only `node:fs/promises` and `node:path`, no logging" is met. Exports in `skills/src/index.ts:23-26`.

| Scenario                                                                                | Test (`skills/test/application/shared-folder-owners.spec.ts`) | Strength    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| Marker sorted and deduplicated                                                          | `:29`                                                         | strong      |
| Corrupt marker treated as absent                                                        | `:67` (file left as `{`)                                      | strong      |
| First owner creates folder and marker                                                   | `:38`                                                         | strong      |
| Registering twice idempotent                                                            | `:46` (byte-identical)                                        | strong      |
| Invalid marker replaced on register                                                     | `:56`                                                         | strong      |
| Owner registered before first shared write                                              | in plugin tests (see delta table)                             | strong      |
| Owners remain after release                                                             | `:77`                                                         | strong      |
| Last owner deletes marker                                                               | `:87`                                                         | strong      |
| No marker leaves folder untouched                                                       | `:96`                                                         | strong      |
| Releasing a non-owner is a no-op                                                        | `:109`                                                        | strong      |
| Empty folder removed                                                                    | `:121`                                                        | strong      |
| Folder with foreign files kept                                                          | `:129`                                                        | strong      |
| Missing folder accepted                                                                 | `:139`                                                        | strong      |
| Other errors propagate (`EACCES`)                                                       | **none**                                                      | **gap T13** |
| Another agent still uses folder / last agent removes / foreign file / legacy / filtered | the plugin tests (T5, T6)                                     | see above   |

## Discrepancies and edge cases (all minor; code and spec shown)

- **C1** `packages/sdk/src/composition/host-context.ts:217`. Spec: "the build error MUST still be the error that propagates". Code: `Object.defineProperty(error, 'rollbackErrors', …)` throws `TypeError` if the build error is frozen or non-extensible. That `TypeError` then replaces the build error. Fix: wrap in try/catch and fall through to `Logger.warn`. Very unlikely in practice.
- **C2** `host-context.ts:224` (spec step 4: disposal errors for a primitive build error "are reported through the logger at `warn`"). Code uses the ambient core `Logger`. `Logger.setImplementation` is called inside `buildKernel` (`core/src/composition/kernel.ts:345`) after `fs.mkdir(logDir)` (`:335`). If the build fails before that, or the host never built a kernel before, the warning goes to the NullLogger and is silently lost. It also does not reach `options.kernel.onLog`. Edge case: only primitive build error combined with dispose failure.
- **C3** `packages/plugin-agent-opencode/src/application/use-cases/install-skills.ts:189`. `toOpenCodePermission` splits `allowedTools` with `split(',')`. Copilot uses `splitTopLevelCommas` (`copilot install-skills.ts:70`, tested at `copilot IS:604`) for the same string format. A `Bash(a, b)` pattern would be mangled in opencode. No such data exists today (the data has no commas inside parentheses).
- **C4** All five `uninstall-skills.ts:39-40`. `options.skills = []` (or `agents = []`) is treated as "not provided", so `uninstall({skills: []})` runs a FULL uninstall (removes all managed skills, the prompt reference, releases the owner). Spec: "When `options.skills` is provided" / "neither … is provided". Install uses the same `length > 0` rule ("all skills when no filter"), so the behaviour is consistent but a host passing `[]` meaning "none" gets a destructive full uninstall. The spec does not define empty arrays; consider stating it. The tests themselves rely on `skills: []` plus `agents:[X]` (`IS:235`) meaning "all skills plus agent X" on install, which differs from what their names suggest.
- **C5** `plugin-agent-copilot` spec, Requirement "Frontmatter field contract": "Fields outside this set MUST NOT be represented in the Copilot frontmatter value collection by default", while the agent path emits `tools` (list) into `variables.frontmatter` (`install-skills.ts:92`). The spec text itself requires `tools` for agents ("Emit `tools` as a YAML list"). The opencode spec adds the clarifying sentence "This field set applies to skills"; copilot does not. Spec wording gap, code is right.
- **C6** `skills/src/application/shared-folder-owners.ts:42,73,182`. Spec: owners "MUST contain no duplicates"; a marker with duplicate or unsorted owners is accepted as valid on read, and `removeSharedOwner` of a non-owner returns the unsorted/duplicated list unchanged. Harmless; only files written by `addSharedOwner` are normalized.
- **C7** `plugin-agent-codex/src/application/use-cases/install-skills.ts:224`. `escapeTomlBasicMultiline` escapes `\` and `"""` only. Other control characters (for example U+0000) in a prompt are not valid in a TOML multi-line basic string. Current templates contain none. `escapeTomlBasicString` handles them for single-line values.
- **C8** All five `src/index.ts` `readManifest`: `catch { continue }` hides JSON parse errors, and `name`/`version` are not validated, so a manifest without them yields `name: undefined`. The spec only says "read `specd-plugin.json` … to obtain `name` and `version`". The build step `sync-plugin-manifests` keeps the manifests in sync (all five confirmed correct, `schemaVersion: 2`).
- **C9** Capability inconsistency. `standard install-skills.ts` hard-codes `['frontmatter']` and ignores `options.capabilities`. The other four use `options?.capabilities ?? defaults` and forward caller-supplied identifiers unvalidated to `@specd/skills`. Spec "declare only the <runtime>-supported capability identifiers" is met only for the defaults. `plugin-manager:agent-plugin-type` (`capabilities` MUST be supplied by the agent plugin) is ambiguous on who owns the set. Related nit: the SDK barrel also exports `Logger` and `FsConfigWriterOptions` (`core-reexports.ts:4,37`), which `sdk:composition` does not list. Harmless.

No contradiction found between the batch specs and `plugin-manager:agent-plugin-type`, `skills:shared-folder-owners`, `core:kernel`, `plugin-manager:register-plugins-use-case` or `plugin-manager:plugin-errors`.

## Test gaps (weak or missing), by priority

- **T4 (most important: a mutation survives).** All five plugins. Owner registration for fallback agent files has no test. Every test that lacks the `agents` capability and asserts the agent file location (claude `IS:499`, copilot `IS:405`, codex `IS:402`, opencode `IS:458`) never asserts `.owners.json`. Every owners assertion comes from installs where a shared bundle file (`shared.md`) is written first. Deleting the `|| baseDir === sharedDir` clause (for example claude `install-skills.ts:144`) leaves the whole suite green. Standard has the same hole: agent-only installs are never asserted for the marker. Consequence if broken: an agent-only install leaves orphan `<agent>.agent.md` that a later uninstall never removes (`hadMarker=false`). Add: agent-only install with capabilities lacking `agents`, then assert `.owners.json`.
- **T1** All five. "Filtered uninstall keeps the prompt block" is asserted only for `options.agents` (`AL:151/216`); the verify scenario names `options.skills`. Trivially true today (early return) but untested.
- **T2** All five. "Factory reads manifest for name and version" and "no `type` on `create()` result": no test calls `create()` and checks `name`/`version` against the manifest or the manifest fallback to the parent dir. `PL:8` only tests the class constructor.
- **T5** Last-owner scenarios are under-asserted. Deletion of `<agent>.agent.md` in the shared folder on last-owner uninstall is untested in claude, copilot, codex, opencode (only standard `IS:391` covers it, with a seeded marker). The foreign-file test (`IS:448` and equivalents) asserts only that `notes.txt` survives; it would pass if the plugin deleted nothing. Claude's last-owner test (`IS:430`) asserts only `shared.md` is gone (no folder or marker check), unlike the other four.
- **T6** copilot `IS:387`, codex `IS:379`, opencode `IS:435`: the "other owners keep the shared files" tests do not assert that `.owners.json` lists only the other plugin, nor that `<agent>.agent.md` files remain.
- **T7** codex and standard: "Legacy plugin marker purged on uninstall" has no test at plugin level (the opencode install side has one). The skills package has `specd-block-manager.spec.ts:121` for opencode's marker.
- **T8** Plugin tests never run the real renderer: every test mocks `repository.getBundle`, so "rendered frontmatter", "tools as comma-separated string" (claude), "tools as list" (copilot), "mode: subagent / permission map" (opencode) are verified only as the `variables.frontmatter` object handed to `ResolveBundle`. I ran all five real installs by hand (real skills repository plus `ResolveBundle`) and the output is correct: claude agent has `tools: Bash(node *), …` and no `model`; copilot has a `tools:` YAML list; opencode has `mode: subagent` and a `permission:` map; codex writes valid TOML; standard writes agents to the shared folder; all fast-track frontmatter correct; `.owners.json` correct. A single integration test per plugin (no mock) would remove the dependence on the unmocked skills pipeline.
- **T9** "Does not call `SkillRepository.getBundle` directly" cannot be detected with the current mock (`ResolveBundle` itself calls `getBundle`). Code review confirms `ResolveBundle` is the only path in all five.
- **T10** copilot and codex: "default install includes fast-track (no explicit filter)" is not tested (their fast-track tests pass `skills: ['specd-fasttrack']`). Copilot and standard: "instructions requiring unavailable capabilities are absent" is not tested with real templates.
- **T11** sdk `barrel.spec.ts`: `createRegenerateSpecMetadata` is not asserted; `SaveSpecMetadata`, `UpdateSpecMetadata`, `InvalidateSpecMetadata`, `PersistSpecMetadata` names (types) not asserted absent (a `.d.ts`/source grep would do); `/ports` identity is runtime-only; error-class identity is asserted for only 4 of 11 classes.
- **T12** sdk: `readRollbackFailures` is tested only with a synthetic object (`code` + `errors`) because `@specd/plugin-manager` is mocked in `host-context.spec.ts`; the real `PluginDestroyError` and the `AggregateError` branch are not exercised, and no e2e test combines a build failure with a destroy failure.
- **T13** skills: scenario "Other errors propagate (EACCES)" has no test (a mutation that swallows all errors passes). Wrong-shape-but-valid JSON (`{"owners":"x"}`, array, non-string entries) is not tested for "treated as no marker".
- **T14** sdk: "each disposer ran exactly once" is not tested at SDK level (mock returns a shared promise); it relies on `core:kernel` tests.
- **T15** sdk: "No API wraps a foreign kernel" (`host-context.spec.ts:351`) is a name regex over the barrel, not a semantic check.
- **T16** Vacuous-assertion note: the `// @ts-expect-error` and `expectTypeOf` frontmatter/handler contract tests pass at runtime regardless; they are effective only because `tsc --noEmit` includes `test/`. If CI runs only `vitest`, those scenarios are not enforced.

## Files

- Source: `packages/sdk/src/composition/host-context.ts`, `packages/sdk/src/index.ts`, `packages/sdk/src/core-reexports.ts`, `packages/plugin-agent-*/src/application/use-cases/{install,uninstall}-skills.ts`, `packages/plugin-agent-*/src/index.ts`, `packages/skills/src/application/shared-folder-owners.ts`.
- Tests: `packages/sdk/test/composition/*.spec.ts`, `packages/sdk/test/barrel.spec.ts`, `packages/plugin-agent-*/test/**`, `packages/skills/test/application/shared-folder-owners.spec.ts`, `packages/cli/test/commands/project-init.spec.ts`.
