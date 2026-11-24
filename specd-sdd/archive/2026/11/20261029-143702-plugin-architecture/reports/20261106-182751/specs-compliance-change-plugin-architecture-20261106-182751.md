# Spec compliance — change plugin-architecture (delegated, attempt verification-attempt-8)

## Summary

| Batch                     | Critical | Major | Minor           | Notes                                                                                                                |
| ------------------------- | -------- | ----- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| core/config (5 specs)     | 0        | 0     | 9               | 9 mutants run on copies: 4 killed, 5 survived (test-strength findings T1-T5)                                         |
| plugin-manager (11 specs) | 0        | 0     | 8 (+3 info)     | ~2,400 hostile probes; m1 unguarded manifest walk in install/update/uninstall (violates a MUST)                      |
| cli (8 specs)             | 0        | 0     | 13              | built CLI run in scratch repos; M2 uninstall of a plugin that fails to load for reasons other than a missing package |
| sdk/agents (8 specs)      | 0        | 0     | 7 + 6 test gaps | 36 hostile uninstall filters x 5 modes: nothing outside the managed set deleted                                      |
| **Total**                 | **0**    | **0** | **~37**         |                                                                                                                      |

Attempt-7 major (C1: filtered uninstall deleting any name incl. `..`) verified fixed. Baseline test totals before the audit: all packages passing.

## Detailed findings

### \_partial-core-config.md

# Partial compliance audit: batch core (attempt 8)

Change: `plugin-architecture`. Specs: core:config, core:config-loader, core:config-writer-port, core:check-registry, cli:config-show.
Method: merged spec previews (specs + verify), change deltas, source read, test read, full run of the relevant suites (core 251 pass / 2 todo; cli 22 pass), behaviour probes via tsx, and 9 mutants on COPIES under the scratchpad (`scratchpad/mut`, never the repo).

Totals: 0 critical, 0 major, 9 minor (5 test-strength, 2 doc/spec drift, 2 observations). No regression found from the attempt-7 fixes.

## Verification of the attempt-7 fixes (all confirmed)

| Fix                                                         | Code                                                                       | Evidence                                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Loader wraps non-ENOENT read errors                         | config-cascade.ts:199-209 (`cannot read config file: ...`)                 | test config-loader.spec.ts:2616 (directory path, forced mode); probe: dir named specd.yaml in discovery gives ConfigValidationError |
| addPlugin rejects any non-mapping root                      | config-writer.ts:133-138 (`isMap(doc.contents)`) + readMappingRoot 245-251 | config-writer.spec.ts:354, 470-488 (empty, comment-only, `~`, `null`, scalar, sequence)                                             |
| Duplicates rejected in every layer incl. root, before merge | config-cascade.ts:542-552, 572-574                                         | config-loader.spec.ts:2527 (message + layer path), 2579 (root dup + later double removal)                                           |
| Absent root configVersion = current                         | config-cascade.ts:567-569, 581-590                                         | config-loader.spec.ts:2602 (ext v2 over absent root accepted); probe: ext v1 over absent root rejected with "absent, meaning 2"     |
| Writer messages cause-specific                              | config-writer.ts:205-221                                                   | config-writer.spec.ts:320-352 (4 causes x add/remove/list, byte-identical file)                                                     |
| Removal duplicates rejected explicitly                      | config-cascade.ts:507-514                                                  | config-loader.spec.ts:2469 (message asserted); mutant D (guard removed) killed                                                      |

## core:config (touched: Cascade identity and removal model, Plugin declarations, Config writer port, Config version)

Requirement status: all MET.

- Cascade identity/removal: name is the identity key (config-cascade.ts:515 findIndex by name; config-schema.ts mergePluginLists replace-in-place / append). Removal precedes the layer's own merge (cascade.ts:593-598), so "removed then re-declared lands at the end" holds (probe + test 2592) and "add and remove in one layer" fails with a cause-specific message (cascade.ts:517-525, test 2559). Absent name / no inherited plugins / repeated name all raise ConfigValidationError.
- Plugin declarations: PluginEntryZodSchema strict, name regex `PLUGIN_NAME_REGEX` (domain/plugin-name.ts), `contributions` min(1). Loader never loads plugins (test config-loader.spec.ts:1241).
- Config version: `z.number().int().positive().optional()`; newer -> UnsupportedConfigVersionError before legacy (config-loader.ts `assertCurrentConfigFormat`, runs per active layer at :263-265); legacy only for object-with-`agents`. Probe: `"abc"`, `"2"`, `true`, blank all give a generic ConfigValidationError.
- Writer port wording in core:config matches the port (config-writer.ts port, FsConfigWriter).

Scenario -> test map:

- Context entry removed by id: config-loader.spec.ts:2342
- Plugin entry removed by name: :2394
- Removing an absent plugin name fails: :2506
- Duplicate names in removal list rejected: :2469
- Layer entry replaces inherited same name / new name appended: :2419
- Workspace removed by name: :2291; Explicit-base variant skipped: :2112
- Flat plugins list / Plugin entry shape: :1215; Invalid structure: :1258; Unscoped: :1285; Duplicate: :1297; Contributions accepted: :1215; Empty contributions: :1271
- Dup inside extending layer: :2527 (strong); Adding+removing same layer: :2559
- ConfigWriter port methods / addPlugin / removePlugin scenarios: config-writer.spec.ts:151,160,181,298,365 and composition/config-writer.spec.ts:6-26 (method presence only)
- Config version: absent accepted :1350; newer :1337; legacy :1310; legacy before schema error :1310/:1363; invalid value :1357,:1422; other legacy-looking object generic :1363; legacy in extending layer :2453 (path asserted); init writes configVersion config-writer.spec.ts:52; mismatching version :2492

Gaps: see T1 and T2 below.

## core:config-loader (touched: YAML parsing and structural validation, Schema plugins/overrides/context mapping, All errors are ConfigValidationError)

Requirement status: all MET. Untouched requirements (storage containment, drive-letter, isExternal, config-inside-root) were not re-audited; the loader spec has only two storage-containment tests (config-loader.spec.ts:1608, 1649), the drive-letter / "longer prefix" scenarios presumably live in a path-platform test (not checked, not part of this change).

Scenario -> test: Legacy migration :1310 (asserts `configVersion: 2`, name, `instructionsDir` in snippet); Newer configVersion :1337; Newer beats legacy :1375; Legacy in extending layer :2453; Legacy not generic :1310; remove.plugins absent :2506; Absent configVersion :1350; Unscoped :1285; Duplicate :1297; Plugin identity is name :1215 and :2394; Plugins not loaded :1241; All errors are ConfigValidationError :1310/:1337 (instanceof both classes); Invalid cascade chain :2839.

Mutants (loader/cascade): E (format check root layer only) killed by :1388 and :2453; D killed; A and B survived (T1, T2).

## core:config-writer-port (touched: AddPlugin, RemovePlugin, ListPlugins, InitProject, Constraints, Delivery access)

Requirement status: all MET.

- addPlugin: argument checks (name regex, empty contributions) before any I/O (config-writer.ts:120-131); missing file, directory, invalid YAML, legacy/invalid shape, non-mapping root all ConfigValidationError without rewrite; merge keeps omitted fields (`??`, mergePluginEntry:303-316); explicit undefined treated as omitted.
- removePlugin: no-op when key/name absent, no `plugins: []` added; errors for invalid/legacy/missing/invalid YAML.
- listPlugins: [] for missing file or key; throws same cause-specific errors otherwise.
- initProject writes `configVersion: 2` first (config-writer.spec.ts:52-53), metadata dir, tmp gitignore, three gitignore lines.
- Delivery access: CLI imports `createConfigWriter` from `@specd/sdk` only (install.ts:3, uninstall.ts:2, init.ts:2); no CLI use of `listPlugins`; `createConfigWriter` re-exported by sdk core-reexports.ts:4; barrel test sdk/test/barrel.spec.ts:64.

Scenario -> test: Adds plugin :151; config+contributions persisted/listed :365; Duplicate updates :160; Update preserves omitted :298; Invalid name rejected + unmodified :260; Legacy not rewritten :382; Empty contributions :311; Empty/comment-only :470; Directory path :490; Malformed YAML :413; Absent config :271/:431; Removes :181; Absent no-op :192 (weak, T3); no plugins key byte-identical :204 (weak, T3); ListPlugins all :365; no key :225; legacy throws :231; absent config :213; Fresh project :42,:84.

## core:check-registry (touched: Immutability, Canonical namespacing, Open check registry, Governance, new scenarios)

Requirement status: all MET against registry code (check-registry.ts). Notes:

- Scoped grammar uses `PLUGIN_NAME_REGEX` (:245); check id regex `^[a-z0-9][a-z0-9_-]*$` (:22, :249) throws InvalidCheckIdError before any state change; canonical id `${pluginName}.${check.id}` with a single leading `@` (:253).
- InvalidPluginNameError message states `@scope/name` and lowercase (errors file), asserted at check-registry.spec.ts:76-100.
- getBindings/getGovernance/withExecutableBuiltins match the spec text. Built-in categories A/B/C (:86-113) and the archive exception (check-bindings.ts:158-243) match spec bullets 6 and 9 (pre-existing code; spec was synced).
- Composition forwards all governance fields (composition-registries.ts:228-240) and step-skip bindings; unchanged by this change.

Scenario -> test: Built-ins injected :187; Namespaced/no shadow :226,:307; Invalid plugin name :53,:261; Grammar accepted :71,:102; Valid registration :15; Single leading @ :102,:603; Reject unscoped :38,:261; Reject special chars :39; Duplicate :137; getBindings two bindings :454-477 + unknown id :636; getGovernance explicit true :519 + unknown :636; withExecutableBuiltins :537; Grammar message :76; Check id with dot :293; Retrieve/has :478; kind adaptation :15/:117; effect rejected :117; Register binding coordinates :454.

Mutants: K (loose getBindings) and M (no governance copy) killed; N and O survived (T4).

## cli:config-show (touched: Output format, Help text, Error cases, new scenarios)

Requirement status: all MET.

- Text view: `  <name>  (present)[ [contributions: a, b]]` (show.ts:67-75); section omitted when the list is empty; JSON/TOON serialize `SpecdConfig` directly.
- Help text generated from typed key tables with `satisfies Record<keyof ...>` (config-shape.ts), so a new/removed SpecdConfig key breaks the build; optionality in the tables matches specd-config.ts (checked key by key).
- Loads config only (`loadConfig`), no host/plugin load; warnings printed by `loadConfig` via `console.warn` (load-config.ts:20-24).

Scenario -> test: plugins in text output config-show.spec.ts:200; contributions allowlist shown :200 (asserts exact `(present) [contributions: codex]`); no suffix without allowlist :240; TOON :256 (full decode equality); JSON flat list :274 and config-show-real-loader.spec.ts:56; Broken plugin does not prevent config show config-show-real-loader.spec.ts:41 (real loader, unresolved package) plus :291 (resolveCliContext not called); Help documents current fields :402,:411; Config not found :456; warnings load-config.spec.ts:19.

## Findings (all minor)

Test strength

- T1 (minor) config-loader.spec.ts:2608 "rejects a different configVersion in an extending layer over a root without one" uses `configVersion: 3`, which is rejected earlier by `assertCurrentConfigFormat` (UnsupportedConfigVersionError, a ConfigValidationError), so it never reaches the mismatch branch. Mutant A (skip mismatch check when root is absent) survives all 217 loader/writer tests. Behaviour is correct (probe: ext v1 over absent root -> "configVersion 1 does not match the root configVersion (absent, meaning 2)"), but the spec sentence "a different configVersion in an extending layer MUST fail" for an absent root is untested for versions below 2. Fix: use `configVersion: 1`.
- T2 (minor) config-loader.spec.ts:2548 "duplicate inside an extending layer with no inherited plugins" asserts only the class; the merged-config Zod `superRefine` duplicate check catches it even if the per-layer check were skipped (mutant B survives). Spec scenario "Duplicate plugin name inside an extending layer rejected" is covered by :2527 (strong), so impact is low; assert the `duplicate plugin name` message or layer path.
- T3 (minor) config-writer.spec.ts:192 and :204 prove the no-op by byte equality only. Spec says the method MUST NOT write the file; mutant C (removePlugin always rewrites) survives because `doc.toString()` happens to reproduce identical bytes. Add a write spy / mtime / inode check.
- T4 (minor) check-registry.spec.ts:537 compares only list/bindings lengths and one governance record for `withExecutableBuiltins`; copying `_boundCoordinates` and `_builtinIds` is untested (mutants N and O survive). Effect: duplicate-coordinate detection and chained `withExecutableBuiltins` on a derived registry could regress unnoticed.
- T5 (minor) config show help test (config-show.spec.ts:402-438) compares key NAMES only; types and optionality strings in config-shape.ts are not checked against SpecdConfig by any test (optionality is correct today, verified manually).

Doc / spec drift

- D1 (minor, docs vs spec+code) docs/guide/plugins.md:27 says "`configVersion` must be `2`" and docs/guide/configuration.md:999 says "`configVersion: 2` is required once `plugins` is present". Spec (core:config "Config version") and code accept an absent version and any positive integer up to 2. Docs/guide/configuration.md:1175 ("An extending layer cannot change it") omits that an extending layer may restate the current version over an absent root.
- D2 (minor, pre-existing, not introduced here) check-registry spec lists default-binding scopes as transition / archive / step-skip, but built-in bindings also use `scope: 'operation'` (check-bindings.ts:87,100) and `register()` silently coerces any unknown plugin binding scope (e.g. `operation`) into a wildcard `transition` binding (check-registry.ts:298-310). Spec and code disagree about the scope vocabulary; not part of this change's diff.

Observations (no spec requirement, no action required)

- O1 Writer asymmetry: for a file with `configVersion: 3` and no `plugins` key, `addPlugin` throws UnsupportedConfigVersionError while `removePlugin`/`listPlugins` succeed (probe). Spec is silent.
- O2 `AddPluginOptions`, `ConfigDeclaredPlugin` and the `ConfigWriter` port type are not exported from core `public.ts` / sdk; hosts get them only via inference from `createConfigWriter`. Spec requires only the factory export. Also `remove: { plugins: [] }` with no inherited plugins fails ("no plugins in inherited config"), consistent with `remove.context: []`; and a missing `.specd` directory yields `StorageDirectoryNotFoundError` (pre-existing, not a ConfigValidationError, outside the "validation failure" wording).

## Contradictions with dependency/global specs

None found. Layering is respected (application/ports/config-schema.ts imports domain/plugin-name; domain registry imports domain/plugin-name; infrastructure writer imports `assertCurrentConfigFormat` from the sibling loader module).

## Probes and mutant log (scratchpad only)

- Probes: `scratchpad/probe/probe.mts` (22 loader/writer cases, outputs as described above).
- Mutants on copies in `scratchpad/mut`: A survived, B survived, C survived, D killed, E killed, K killed, M killed, N survived, O survived. Repo untouched.

### \_partial-plugin-manager.md

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

### \_partial-cli.md

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

### \_partial-sdk-agents.md

# Audit attempt 8 - batch sdk-agents (plugin-architecture)

Specs: sdk:composition, sdk:host-context, plugin-agent-{claude,copilot,codex,opencode,standard}:plugin-agent, skills:shared-folder-owners.
Baseline: vitest green: skills 139, claude 73, copilot 72, codex 109, opencode 76, standard 73, sdk 129. No plugin/skills/core dist is stale.

## Verdict

0 critical, 0 major, 7 minor, 6 test gaps (weak/missing). Attempt-7 C1 (filtered uninstall deleting any name incl. `..`) is FIXED and proven by probes.

## Probe results (real `create().install()/uninstallWithResult()` on temp projects; scripts in scratchpad probe.mjs..probe6.mjs)

All five plugins (claude, copilot, codex, opencode, standard):

- Hostile filters (36 names x 5 modes: skills, agents, both, skills with capabilities [], agents with capabilities []): `..`, `.`, empty, `../x`, `../../x`, `../outside/victim`, absolute path to victim dir and file, `a\..\..\x`, `a/../../x`, `specd/..`, `specd/../..`, `name\0x`, `__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`, trailing space or newline, `*`, `**`, `.owners.json`, `shared`, `shared.md`, a user skill, a user agent, a user symlink inside the skills dir (`evil-link`, `evil-link2.md`), `specd-new/../specd`, `specd-new/`.
  Result: project tree + outside tree + a sibling file byte-identical before/after; every name is reported in `skipped`. 0 failures.
- A MANAGED name that is a symlink (skill dir to an outside dir; flat `<skill>.md` to an outside file; agent file to an outside file): filtered and full uninstall remove only the link, the outside targets are intact (fs.rm does not follow links).
- Full uninstall keeps an unrelated file in the skills dir; empty `skills: []`/`agents: []` behaves as a full uninstall (leaves empty `.claude/skills`, `.claude/agents` dirs - not required to be removed).
- Install with hostile `skills`/`agents` names: all land in `skipped: item not found` (`repository.get` validates against listed directories); nothing written.
- `selectManagedNames` with `__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`, `prototype`, `length`, `0`, `includes`, `at`: all skipped (uses `Array.includes` on the managed array, no object-key lookup). No prototype slip-through. Non-string entries (`1`, `null`, `undefined`, `{}`) THROW TypeError (fail-closed, nothing deleted); an array entry `['specd']` is skipped.
- Claude real render: `allowed-tools`, `argument-hint`, `disable-model-invocation: true` (fast-track), no snake_case key; agent keeps `tools`/`model`. Copilot: tools as YAML list; Codex: TOML agent; OpenCode: `mode: subagent` + `permission` map; Standard: `allowed-tools` space-separated, agents `<name>.agent.md` in the shared folder.

## Mutation results (mutants only on copies in scratchpad/sa-mut)

Claude 41 mutants; killed all except: M27 (agents-only filter reports a bogus skipped entry) and M17/M26/M30 (no-op or equivalent, my own pattern errors). Copilot and Codex generic set (~30): survivors only G10b (filtered uninstall no longer removes legacy flat `<skill>.md`) and G27. See "Test gaps". OpenCode and Standard: no survivors (G4/G38/G39 N/A for standard, which has no runtime agents dir or capability switch). Claude G10b and G27 also survive.

## Per-spec status

### sdk:composition - all requirements OK

- Package identity: deps exactly core, code-graph, plugin-manager (packages/sdk/package.json). Test packages/sdk/test/composition/composition.spec.ts:8, package-boundary.spec.ts:12/24.
- Layer structure: src/{composition,orchestration,presentation,shared,domain/errors}; no infrastructure. package-boundary.spec.ts:56. `exports` has `.`, `./ports`, `./extensions` pointing to dist. barrel.spec.ts:286, 311, 321.
- Barrel: all listed names present (index.ts, core-reexports.ts:4 createConfigWriter, :531-532 PLUGIN_NAME_REGEX/isPluginName, :692 InvalidCheckIdError). Removed APIs absent: barrel.spec.ts:137. Plugin error identity: barrel.spec.ts:74/96. No export-star: :113.
- Host-adapter exports, no lock/IPC: barrel.spec.ts:205/216. SDK_VERSION :44; codeGraphVersion :299.
- Discrepancy (minor, spec wording vs code): verify scenario "SDK tracks revised metadata materialization surface" says `MaterializeSpecMetadata`, `GetSpecMetadata`, `RegenerateSpecMetadata`, `InitializePersistedSpecState` "are available"; code (core-reexports.ts:191-208) re-exports the classes TYPE-ONLY and barrel.spec.ts:177-196 asserts `name in sdk === false` for them. Test codifies a reading narrower than the spec wording; the spec should say "types and create\* factories".
- Minor/info: spec host-context says `createKernelBuilder` from `@specd/core`; code imports `@specd/core/extensions` (host-context.ts:10). Both subpaths export it (core public.ts:6, extensions.ts:5); harmless.

### sdk:host-context - all requirements OK

- Shape/dispose: host-context.ts:96-114 (`dispose` delegates to `kernel.dispose`, same function as `[Symbol.asyncDispose]`). Tests host-context.spec.ts:327,343,352,361,371,378,389,402; e2e host-context-e2e.spec.ts:104-162.
- createSdkContext: order register then build (spec test :61 checks invocationCallOrder); `plugins:false` :74; init failure :80 + e2e :114/130; build failure disposes :87; dispose error not masking, `rollbackErrors` :103/417/457 and real PluginDestroyError host-context-rollback.spec.ts:61/84; primitive/null/number/frozen: :116 it.each, :431; pluginHandlers :87; graph options :140; new provider per call :150.
- openSpecdHost: mixed inputs rejected :236; startDir :229; configPath :224; fallback only on ConfigNotFoundError, never with configPath :246-:318; warnings stay on config :173/185; plugins option forwarded :219.
- Config mutation boundary: :335.
- Weak (minor): "Plugins enabled with an empty plugin list" has no dedicated test (the default-path test mocks registerPlugins; the real empty-list behaviour lives in plugin-manager). Limitation documented in code (Logger null implementation drops the warn when the build fails before the logger is set) is spec-consistent ("when no logger implementation has been configured they are not emitted").

### skills:shared-folder-owners - all requirements OK

- Code: packages/skills/src/application/shared-folder-owners.ts (add :40, remove :64, rmdir :93), select-managed-names.ts.
- Scenario tests: sorted/dedup shared-folder-owners.spec.ts:29; corrupt marker :142; first owner :38; idempotent byte-identical :46; duplicates normalised :67-:83; invalid replaced :56; wrong shape :112/:131; owners remain :152; last owner :162; no marker :171; non-owner :184; empty folder :196; foreign file :204; missing :214; EACCES propagates shared-folder-owners-eacces.spec.ts:20. Uninstall protocol scenarios are in each plugin's install-skills/shared-folder-ownership specs (below). "Owner registered before first shared write" claude install-skills.spec.ts:597 (and same file in the others).
- Minor hazards (spec-consistent, noted): (a) a symlinked `.owners.json` is followed on write (probe6 B: the outside file is rewritten with the merged owners); (b) a symlinked shared folder: full uninstall deletes the files then `rmdir` throws ENOTDIR (probe6 A) - spec says other errors propagate, but the uninstall has already done its work and rejects; (c) `readMarkerFile` maps EACCES/EISDIR to "absent", then addSharedOwner overwrites (spec: unreadable = no marker).

### skills resolveSharedFolder (cross-spec, used by all plugins) - hazards

- `sharedFolder` `.`, `./`, `''`, `\` resolve to the PROJECT ROOT (containment check `path.relative` = '' passes, domain/shared-folder.ts:34-38). Probe3: install writes `shared.md` and `.owners.json` into the project root; full uninstall removes them (only managed names, so no foreign loss; rmdir(root) is swallowed ENOTEMPTY). Recommend rejecting an empty relative path. minor.
- `..foo` (a valid directory name) is rejected because `containment.startsWith('..')` (false positive); an absolute path inside the root is accepted but `relativePath` then holds the ABSOLUTE path (probe2) although the doc says "project-relative POSIX path exposed to templates". Symlink escape not checked (lexical containment only). minor.

### plugin-agent-claude:plugin-agent - all requirements OK

- Requirements verified in code: install-skills.ts (capabilities `['mcp','agents','frontmatter']` :53; addSharedOwner before the first shared write :133-137; agents dir by capability :58; hyphen keymap SKILL_YAML_KEYS :178), uninstall-skills.ts (managed-name validation :56-69; full uninstall both agent locations :76-90; owner protocol :84-90), claude-plugin.ts (`uninstallWithResult`), index.ts (manifest validation).
- Scenario -> test: factory create.spec.ts:45/62/74/86/97/109; install routing install-skills.spec.ts:143; agent frontmatter :235; model :557, no model :638; shared fallback :499; prompt block :353; owners :388/408/430/448/465/481; owner-before-write :597; legacy flat :677; real render + manual-only fast-track real-pipeline.spec.ts:50-99; hyphen keys skill-frontmatter-keys.spec.ts:68; safety uninstall-safety.spec.ts:162-274; both agent locations :284; sharedFolder override :311/:336; skipped on install :355; shared-folder agents ownership shared-folder-ownership.spec.ts:144-263; filtered keeps block/marker agent-lifecycle.spec.ts:123/182/223.
- Divergence (design, minor/info): install with only `skills` still installs ALL agents, with only `agents` ALL skills (probe4: 3 vs 9 items). Matches the `agent-plugin-type` contract "omit = all", but filtered uninstall is the opposite (only the selected kind). Intentional per both specs, yet asymmetric; worth one sentence in the specs.
- Mutants surviving / weak tests: see test gaps T1-T4.

### plugin-agent-copilot:plugin-agent - all requirements OK

- Capabilities `['frontmatter','agents']`; agents `.github/agents/<name>.agent.md` with `tools` as YAML list via splitTopLevelCommas (install-skills.ts:73-80); fast-track `disable-model-invocation: true` (frontmatter/index.ts). Tests mirror claude; tools split agent-tools-split.spec.ts (copilot test dir).
- Code smell (minor): uninstall-skills.ts:43 `supportsAgents ? '${agent}.agent.md' : '${agent}.agent.md'` identical branches (dead conditional; behaviour correct). install-skills.ts last line re-exports splitTopLevelCommas (stray).

### plugin-agent-codex:plugin-agent - all requirements OK

- TOML agents `.codex/agents/<name>.toml`, escaping of backslash, `"""` and control chars (install-skills.ts escapeTomlBasicMultiline) tested in toml-escaping.spec.ts; frontmatter name+description only; AGENTS.md block with `codex`; fallback `.agent.md` in shared folder when capability missing. Full uninstall removes `.toml` and shared `.agent.md`.

### plugin-agent-opencode:plugin-agent - all requirements OK

- `mode: subagent` + `permission` map (toOpenCodePermission, permission.spec.ts:5-20: comma inside parentheses, several patterns, bare+patterns -> `*`). Meta-package + wizard (cli project-init.spec.ts:162, :381-385; meta-package.spec.ts).
- Minor: install calls `removeSpecdBlock(agentsMdPath,'opencode')` before `injectSpecdBlock` (install-skills.ts ~l.158). Spec only requires injectSpecdBlock to purge legacy markers; the extra remove+inject can relocate/rewrite the block and is not described by the spec (other plugins do not do it).

### plugin-agent-standard:plugin-agent - all requirements OK

- Capabilities `['frontmatter']`, agents always `<name>.agent.md` in the shared folder, `allowed-tools` space-separated with `Bash(x *)` style, specd-compliance includes node and pnpm (frontmatter/index.ts:30-35). Wizard list cli project-init.spec.ts:381-385; meta-package.spec.ts. Full uninstall has no runtime agents dir (correct).

## Test gaps (weak or missing)

- T1 (minor, all 5 plugins): agents-only filtered uninstall never asserts `skipped: []` (mutant: skills selection receives the agent names -> bogus skipped entries) - survived in claude, copilot, codex (opencode and standard kill it). uninstall-safety.spec.ts:256 only checks a skills-only filter.
- T2 (minor, claude, copilot, codex; opencode/standard kill it): filtered uninstall no longer removing the legacy flat `<skill>.md` survives; only the full-uninstall path is tested for legacy flat files (uninstall-safety.spec.ts:416).
- T3 (minor): no test feeds `__proto__`/`constructor` names to selectManagedNames or a plugin filter (implementation is safe via Array.includes; a Set/object refactor could regress). Non-string entries untested.
- T4 (minor): scenario "Unsupported Claude metadata stays out of the value collection" and "Frontmatter values cover supported metadata" are type-level only; no runtime assertion.
- T5 (minor): fast-track "journal-resumability" at plugin level is asserted only against a mocked bundle string (claude install-skills.spec.ts:176); real render is covered only in skills/test/template-workflow.spec.ts:36 (not through the plugin).
- T6 (minor): no test for sharedFolder `.`/empty/absolute-inside-root or symlinked shared/marker (hazards above).

## Contradictions with dependency/global specs

None found. Only wording items: sdk host-context "createKernelBuilder from @specd/core" vs `/extensions` import; sdk verify "MaterializeSpecMetadata ... available" vs type-only export.
