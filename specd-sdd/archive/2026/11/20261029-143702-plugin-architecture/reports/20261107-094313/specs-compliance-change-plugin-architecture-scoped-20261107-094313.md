# Spec compliance — change plugin-architecture (delegated, SCOPED, attempt verification-attempt-9)

Scope: only what changed after attempt 8 (plugin-manager hardening, skills shared-folder safety, CLI uninstall/update/list/init, core test hardening). The full 32-spec audit of attempt 8 (0 critical, 0 major, ~37 minor) stands for everything else.

## Summary

| Batch                  | Items  | OK     | Partial | Critical | Major | Minor |
| ---------------------- | ------ | ------ | ------- | -------- | ----- | ----- |
| plugin-manager         | 4      | 4      | 0       | 0        | 0     | 2     |
| skills + agent plugins | 5      | 5      | 0       | 0        | 0     | 3     |
| cli + core tests       | 6      | 5      | 1       | 0        | 0     | 2     |
| **Total**              | **15** | **14** | **1**   | **0**    | **0** | **7** |

## Detailed findings

### \_partial-plugin-manager.md

# Partial compliance: plugin-manager last round (change plugin-architecture)

Full package suite: `pnpm vitest run` in packages/plugin-manager -> 21 files, 283 tests, all pass. No regression.

## (1) Install/update/uninstall guarded manifest walk + loop in resolve-contributions: OK

- install-plugin.ts: try block wraps resolveContributions, installContextContributions, `manifest.contributes['agents']`, `manifest.defaultConfig`. Non-SpecdError becomes `PluginValidationError(name, ['load'], error)`; SpecdError rethrown unchanged.
- update-plugin.ts: same guarded block. uninstall-plugin.ts: same guarded block.
- resolve-contributions.ts: `declaredContributionIds` uses loops with `ids.push` (no spread). `[...allowlist]` copies only the caller allowlist (not a push(...spread)), so 130k is safe.
- Tests: test/application/hardening.spec.ts: 130,000 ids install succeeds (a spread/apply would RangeError); getter throwing on 2nd read, run for Install/Update/Uninstall, asserts PluginValidationError + cause message. Would fail if the walk were outside the guard.
- Gaps (minor): 130k only tested through InstallPlugin, not Update/Uninstall (same shared code). The throwing getter hits at the first `contributes` read inside the guarded block; no test for a throwing `defaultConfig` getter (install only).

## (2) `__proto__` in configSchema properties: OK

- plugin-config-schema.ts:165 (assertSupportedConfigSchema walk) and :267 (second check in the resolve path) throw `UnsupportedSchemaKeywordError(pluginName, 'properties', "a property named '__proto__' is not allowed")`.
- Test hardening.spec.ts:102 uses JSON.parse (own `__proto__`), checks both assertSupportedConfigSchema and resolvePluginConfig, class, `keyword: 'properties'`, message contains `__proto__`. Would fail if not rejected.
- Spec note (minor): plugin-config-schema spec text has no mention of `__proto__`/prototype (grep empty); behaviour is a hardening beyond the spec text. Spec-silent, not contradictory.

## (3) registerPlugins disposer failure naming, concurrent dispose: OK

- register-plugins.ts:183-187: registerDisposer failure sets `current = entries.map(name).join(', ')` then rollback -> PluginInitError naming `'@acme/a, @acme/b'`; rollback destroys initialized plugins, no disposer registered. Test hardening.spec.ts:~125 asserts `pluginName: '@acme/a, @acme/b'`.
- destroyReverse (:113-130): concurrent call returns the same `disposing` promise; later sequential call resolves (idempotent). Test hardening.spec.ts:~140 uses Promise.allSettled with both rejected and `reason` toBe same instance. Would fail if a second call returned a fresh promise/resolved early.
- Gaps (minor): spec text (register-plugins-use-case) does not mention the registerDisposer-failure naming format or concurrent-dispose semantic; only "MUST be idempotent" (satisfied) and "no disposer remains registered". Spec-silent. Minor: test for registerDisposer failure does not assert rollback destroyed already-initialized plugins (destroy spy) or that no disposer remains.
- Note: `disposed` set true on rollback, so a handle `dispose()` after a failed register is a no-op; consistent with spec.

## (4) specd-plugin-type spec text on zod: OK

- spec-preview line 125: "The plugin-manager domain layer MAY import `zod` ... accepted exception ... `ContributionKindHandler.blockSchema` is a `ZodType`". Code: domain/types/contribution-kind-handler.ts:2, domain/handlers/agents-handler.ts:1, domain/services/plugin-config-schema.ts:1 import zod. Consistent.

## Discrepancies

- critical: none
- major: none
- minor: (a) specs for the use cases/plugin-errors do not explicitly state the guarded-walk `['load']` wrapping nor `__proto__` rejection nor joined-names/concurrent-dispose; the behaviour is implemented and tested but not traceable to a verify scenario (consider adding scenarios). (b) minor test gaps listed above.

Counts: items OK 4, PARTIAL 0, MISSING 0; discrepancies critical 0, major 0, minor 2.

### \_partial-skills-agents.md

# Partial compliance: skills + plugin-agent-\* (plugin-architecture, last round)

Test runs: skills 161 pass; claude 75, copilot 74, codex 111, opencode 76, standard 73, all pass, 0 fail.

## Items

1. resolveSharedFolder: OK. packages/skills/src/domain/shared-folder.ts:28-53. Rejects empty, `.`, `./`, `\` (normalised to ''), root, escapes; `..foo` accepted; absolute inside root -> relative POSIX (l.48-50). Tests: packages/skills/test/domain/shared-folder.spec.ts:10-37 (would fail if wrong; includes root, `${root}/`, `/`).
2. Symlink marker: OK. shared-folder-owners.ts:127-144 (lstat -> symlink kind, unlink then write regular file, target untouched), :155-163 (non-valid -> hadMarker:false, no follow). Tests: shared-folder-owners.spec.ts:219-246 assert regular file, target content unchanged, link preserved on release.
3. ENOTDIR swallowed: OK. shared-folder-owners.ts:186-195, 304-311. Tests: shared-folder-owners-eacces.spec.ts:27 (mocked ENOTDIR) and spec.ts:248 (real symlink-to-file). EACCES propagation covered in the eacces spec.
4. selectManagedNames: OK. select-managed-names.ts:361-377. Non-string -> 'invalid name' without throwing; `__proto__`/`constructor`/`toString` -> 'not a specd-managed item' (array includes, no prototype lookup). Tests select-managed-names.spec.ts:21-58 (incl. non-string mix with null/undefined/42/{}/[]).
5. Spec text: OK. Merged spec states the empty/`.`/`./`/root rejection, `..foo`, symlink marker, ENOTDIR exactly as implemented.

## Filtered-uninstall wording (plugin-agent-claude:plugin-agent, l.111)

Implemented through selectManagedNames in all five uninstall-skills.ts (l.56-60). Each plugin's test/uninstall-safety.spec.ts:200-218 (opencode :202-220) runs real UninstallSkills with skills ['..'] and agents ['../x'], asserts nothing deleted (file outside the agents dir survives) and both reported invalid. Passes in all 5 plugins. OK.

## Discrepancies / gaps

- minor (test/verify gap): verify.md for skills:shared-folder-owners has no scenarios for the new behaviours (symlink marker, ENOTDIR, shared-folder rejection of ''/'.'/root, `..foo`). Unit tests exist and are strong, but spec scenarios are missing, so the new spec text has no verify traceability. Verify scenario list: only "Missing folder is accepted" and "Other errors propagate" cover removeSharedFolderIfEmpty.
- minor: readMarkerFile (shared-folder-owners.ts:252-259) returns undefined on any lstat error (e.g. EACCES) and then addSharedOwner writes a fresh marker. Consistent with "unreadable = no marker"; not a violation.
- minor: no test that addSharedOwner's symlink case replaces a dangling symlink (unlink path is the same, low risk).

Counts: items OK 5 / PARTIAL 0 / MISSING 0; critical 0, major 0, minor 3 (one test/verify gap, two notes).

### \_partial-cli-core.md

# Partial compliance: cli + core (last round) - change plugin-architecture

Runs: `cd packages/cli && pnpm vitest run` = 103 files / 1322 tests PASS (first run, no flakes). Core subset (check-registry, config-loader, config-writer, composition dirs) = 520 PASS / 0 FAIL. Built CLI exercised in one scratch git repo (scratchpad/uns).

## Items

1. plugins uninstall - OK
   - Code packages/cli/src/commands/plugins/uninstall.ts:56-95: undeclared -> throw (no removePlugin, :63-66); LoadPlugin first (:69-72); load ok -> UninstallPlugin with allowlist only if present (:73-80); PluginNotFoundError -> `package not found; only the declaration was removed` (:81-82); other -> `plugin failed to load (<reason>); only the declaration was removed` (:83-85); removePlugin (:86); hook throw -> catch, declaration kept, status error (:88-95); duplicates -> skipped/already processed (:57-60); plugins:false (:42-45); exit 1 on any error, continues (:99-101).
   - Real CLI run (declared @acme/bad invalid manifest, @acme/gone missing, @acme/nope undeclared, @acme/gone repeated): outputs exactly the spec details; declarations removed from specd.yaml (`plugins: []`); undeclared = error; exit 1.
   - Tests (would fail if behaviour wrong): test/commands/plugins.spec.ts:857-935 (dup once + skipped JSON/text; PluginNotFound -> detail + removePlugin; hook failure -> removePlugin not called, error, exit 1), :485-600 (allowlist, plugins:false, undeclared -> no uninstall/removePlugin, ordering hook-before-remove, next plugin continues), :694-755. Other-load-failure covered with the REAL loader and invalid specd-plugin.json: test/commands/plugins/plugins-uninstall-real-loader.spec.ts:62-86.
   - Gap (minor): "plugin whose package is missing" test only mocks LoadPlugin rejection with PluginNotFoundError; real-loader missing-package path is verified only by my manual CLI run (real loader returned PluginNotFoundError correctly).

2. plugins update X X - OK
   - Code update.ts:56-63 (processed Set -> skipped/already processed). Test plugins-update.spec.ts:126-149 asserts mockUpdate called once and exact two-entry output.

3. plugins list header - OK
   - Code list.ts:108-113: header printed whenever rows exist (rows only empty when nothing declared); "no plugins declared" otherwise. Test plugins.spec.ts (header test when all rows not_found/error asserts lines[0]==='Installed plugins:' and 3 lines). Real CLI run printed header with error + not_found rows.

4. host-context test - OK
   - test/helpers/cli-context.spec.ts:48-70 accepts undefined|true and rejects false (`not.toBe(false)`). Would fail if plugins were forced false.

5. project-init tests - PARTIAL (minor)
   - project-init.spec.ts:582-623 runs the real writer in a tmp git repo: asserts .gitignore contents (specd.local.yaml, specd.local._.yaml, /.specd/metadata/), storage dirs (changes/drafts/discarded/archive/metadata), `.specd/config/tmp/.gitignore` = `_`then`!.gitignore`, configVersion 2. :625-656 real `--force` re-run over an existing config (old content gone, configVersion 2, dirs exist).
   - Gap (minor): spec scenario "tmp gitignore preserved on re-init with --force" and "re-running init does not duplicate the /.specd/metadata/ entry" are not asserted in the --force test (it does not re-read the tmp .gitignore nor count the metadata entry occurrences after the second run). The second run is also over a hand-written config, not over a prior real init.

6. core T1-T4 - OK
   - T1 config-loader.spec.ts:2492+: root configVersion 2 vs extending layer configVersion 1 -> rejects.
   - T2 config-loader.spec.ts:2527-2545 asserts message matches `duplicate plugin name '@acme/x'` and the layer file name specd.local.yaml; :2548-2558 no-inherited variant; :2581 root dup.
   - T3 config-writer.spec.ts:187-219: writeFileAtomic wrapped in vi.fn spy, mockClear, `not.toHaveBeenCalled()` plus byte-identical file, for absent name and for file with no plugins key.
   - T4 check-registry.spec.ts:537-573: copy keeps list length/ids, bindings() keys and governance equal; original not mutated; non-builtin and kind mismatch throw InvalidInputError.

## Spec-preview note

`changes spec-preview` rejects the `cli:cli/...` ids I first tried; correct ids are `cli:plugins-uninstall` etc. `--artifact verify` is not a valid option of this CLI version (the preview prints spec.md and verify.md together); I used those outputs.

## Discrepancies

- critical: none
- major: none
- minor: (a) init --force test does not re-assert tmp .gitignore / non-duplicated metadata entry after the re-run (spec scenarios "tmp gitignore preserved on re-init" and "re-running ... does not duplicate"); (b) missing-package uninstall verified in tests only with a mocked PluginNotFoundError (real loader path OK in manual run).

## Counts

Items OK 5, PARTIAL 1 (init tests, minor), MISSING 0. Regressions: 0.
