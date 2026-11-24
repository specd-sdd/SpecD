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
