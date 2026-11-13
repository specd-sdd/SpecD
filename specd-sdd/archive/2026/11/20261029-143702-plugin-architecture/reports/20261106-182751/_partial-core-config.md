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
