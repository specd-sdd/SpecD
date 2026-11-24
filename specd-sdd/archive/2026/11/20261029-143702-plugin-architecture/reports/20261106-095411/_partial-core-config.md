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
