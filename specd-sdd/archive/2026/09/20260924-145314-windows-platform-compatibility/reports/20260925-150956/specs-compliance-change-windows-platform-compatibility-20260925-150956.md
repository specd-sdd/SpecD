# Spec compliance — windows-platform-compatibility

Timestamp: 20260925-150956
Mode: change
Scope: delta requirements of the 23 specs in the change.

## Totals

- Requirements checked: 45
- Discrepancies: 4
- Missing tests: 21

## Detailed findings

### Core paths

# Core path specs

Read-only audit of requirements this change added or modified in `windows-platform-compatibility`. Baseline historical requirements were not re-audited. Spec text is the merged `specd changes spec-preview` result (deltas under `specd-sdd/changes/20260924-145314-windows-platform-compatibility/deltas/core/`). Implementation was checked with `specd graph` plus the cited source. Focus unit tests were run: 57 passed, 0 failed.

## Requirements checked

### core:config-loader (3)

1. **Storage path containment** (modified). Non-null `rootPath`: each of `changes`, `drafts`, `discarded`, `archive` is the root or inside it. Inside means the relative path from the resolved root is empty, or it does not start with `..` and is not absolute. Drive-letter case must not look outside. A string prefix of `rootPath` plus a separator is not the test. Outside throws `ConfigValidationError` naming the storage key. Null `rootPath` skips the check. `rootPath` is the normalized VCS-adapter root, not raw CLI stdout.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Outside `specsPath` is external. Null `rootPath` forces `isExternal: false`.
3. **Config file stays inside the repository root** (added). Same inside-root rule on the resolved config file. Separator mismatch and drive-letter case must not reject an inside file. Outside throws `ConfigValidationError`.

`load()` uses `isPathInside` for the yaml file (`cascade.rootPath` / `rootConfigPath`), for the YAML `configPath` setting (`resolvedConfigPath`), for each fs storage binding, and for `isExternal` (`packages/core/src/infrastructure/fs/config-loader.ts`). `isPathInside` (`path-platform.ts`) resolves with `path.win32` when the string has a drive letter or a backslash, uppercases the drive letter, then uses `path.win32.relative` / `path.relative`. `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()` (`composition/config-loader.ts`). Built-in adapters return `normalizeVcsRoot`. `NullVcsAdapter` yields `rootPath = null`.

Focus scenarios match:

- Root `C:/repo`, file `C:/other/specd.yaml`: `isPathInside` is false (`..\other\specd.yaml`). `load()` throws `ConfigValidationError` with `config file resolves outside VCS root`. Test: `config-loader-root-containment.spec.ts` (passed).
- Root `C:\repo`, file `C:/repo/specd.yaml`: both resolve to `C:\repo` and `C:\repo\specd.yaml`. Relative path is `specd.yaml`. `load()` accepts the file and the relative storage paths under it. Same test (passed).

### core:vcs-adapter (1)

**Built-in adapters normalize repository roots** (added). Git, hg, and svn normalize the root before caching it and before `rootDir()`. Absolute path, Windows drive letter uppercased, no `realpath`, still a usable cwd. `NullVcsAdapter.rootDir()` throws and invents no root. Modified-file paths use `/` and do not collapse `.` or `..`. On Windows, spawns of `git`, `hg`, and `svn` hide the console.

`GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` store and return `normalizeVcsRoot`. `normalizeVcsRoot` is `path.resolve` or `path.win32.resolve` plus a drive-letter uppercase. It does not call `realpath`. `toPortablePath` is `replaceAll('\\', '/')` only. `NullVcsAdapter.rootDir` throws `no VCS detected`. `spawnOptions` in `infrastructure/git/exec.ts`, `hg/exec.ts`, and `svn/exec.ts` sets `windowsHide: true` when `platform === 'win32'`, and `git` / `hg` / `svn` pass that object to `execFile`.

### core:content-hasher-port (2)

1. **Text newline normalization** (added). `ContentHasher.hash` and the shared text `sha256` helper turn every `\r\n` and every remaining `\r` into `\n`. Every string is text. No binary string mode. Artifact hashes are a different contract (whitespace collapse) and are not required to preserve line endings. Raw file bytes must not go through the text helper.
2. **Determinism** (modified). Same digest after that newline normalization.

`normalizeNewlines` (`domain/services/normalize-newlines.ts`) does both replacements. `sha256` (`infrastructure/fs/hash.ts`) and `NodeContentHasher.hash` digest `normalizeNewlines(content)` as UTF-8. `computeArtifactHash` normalizes newlines after `applyPreHashCleanup`. No binary branch.

### core:snapshot-hasher (1)

**Determinism** (modified). `hashFiles` forwards each string to `hashContent` unchanged. It must not detect a binary string and must not rewrite newlines. Newline normalization belongs to the text hasher. Raw file bytes are not strings and must not be passed through `hashFiles`.

`hashFiles` (`domain/services/hash-files.ts`) assigns `result[filePath] = hashContent(content)` with no classification and no rewrite. The verify scenario “Text file CRLF matches LF” is the injected text hasher’s job: `NodeContentHasher` / `sha256` already equate those strings (`hash-newlines.spec.ts`). `hashFiles` itself does not. That matches the requirement text. The equality scenario is not asserted through `hashFiles` (see Missing tests). The forwarding scenario is: `hash-files.spec.ts` spies `hashContent` and expects the same string, including `\r\n` (passed).

### core:fs-change-repository (1)

**Windows path containment and rename recovery** (added). Inside-root rule and drive-letter case. A directory move that fails with `EPERM` or `EXDEV` copies. A rename onto an existing or locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` retries a bounded number of times, then surfaces the original error. Identical destination bytes are not success for change artifacts.

`isStrictlyInside` and `resolveConfinedPath` call `isPathInside`. `C:/work/app` vs `C:/work/application` is outside (`path.win32.relative` starts with `..`). `moveDir` copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. The change repository calls `moveDir` when the change directory changes bucket. Manifest and lock writes use `writeFileAtomic` → `retryOnLock` (five attempts, delays 50/100/150/200 ms, then the original error object). `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`. `saveArtifact` hash-checks, then `fs.writeFile`. It does not return success because destination bytes already match. Directory-move `EBUSY` / `EACCES` are not in the copy set and are not retried by `moveDir`; the retry sentence is implemented on the atomic file rename and on spec publication, which is what the verify scenarios name (`EXDEV` copies; locked rename retries then throws).

### core:fs-spec-repository (1)

**Publication rename recovery** (added). Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` retry, then surface the original error (including `code`). The temporary `.gitignore` equality check treats `\r\n` and `\r` as `\n`. Identical normalized content is success for that file only. Differing artifact bytes are not success.

`publish` wraps spec-dir renames in `retryOnLock`. `publicationRenameError` returns the caught lock error unchanged; other failures become `SpecPublicationError`. `ensureTmpGitignore` compares `normalizeNewlines` and returns without rewriting when they match. The spec repository calls that helper from list/reindex paths. Artifact writes go through `writeFileAtomic` and do not treat a pre-existing different file as a successful skip. `spec-repository.spec.ts` expects the original `{ code: 'EBUSY' }` after a locked publication rename.

### core:fs-archive-repository (1)

**Archive paths stay inside the repository root** (added). Same inside-root rule. Drive-letter case must not look outside. A longer directory name (`C:/repo` vs `C:/repository/archive`) is outside.

`resolveArchiveDirPathSync` resolves with host `path.resolve`, then `isPathInside`. On Windows, `path.resolve` keeps the drive letter and `isPathInside` uppercases it, so `c:/repo` contains `C:/repo/archive` and rejects `C:/repository/archive`. The predicate itself is tested with those shapes. The archive function is not.

### core:file-reader-port (1)

**Path traversal protection** (modified). Escape uses the inside-root rule, including drive-letter case. A string prefix of `basePath` plus a separator is not the test. Escape throws `PathTraversalError`.

`FsFileReader` normalizes `basePath` and the candidate with `normalizeVcsRoot`, then `isPathInside`. A miss throws `PathTraversalError`. `windows-containment.spec.ts`: base `C:/repo` and `c:/repo/missing.txt` resolves `null` (missing file, not a traversal); `C:/repository/file.txt` throws `PathTraversalError`.

### core:refresh-implementation-tracking (1)

**Project-relative paths keep a separator boundary** (added). Project-relative means the project root or a descendant, with a separator boundary. A longer string prefix is outside. Drive-letter case must not change the result. The portable form of the project root is `''`. That empty string means inside and must not be an exclusion prefix. An empty result is not the signal for outside. Outside stays `null`.

`_toPortableProjectRelativePath` returns `null` when `isPathInside` is false. When the root and the candidate normalize to the same path, `path.relative` / `path.win32.relative` is `''`, and that `''` is returned. `_collectExclusions` adds a path only when `rel !== null && rel.length > 0`, so the root is not an exclusion prefix and an outside path is not either. Composition passes `{ isPathInside, normalizeVcsRoot }`.

`refresh-implementation-tracking.spec.ts` (passed): root `C:/work/app` with internal paths `C:/work/application` and `c:/work/app/specd` yields `excludePaths === ['specd']`. Root `C:/work/app` plus `C:/work/app/specd` yields `['specd']` and the list does not contain `''`.

### core:change (1)

**Change names reject Windows device names** (added). Whole slug, case-insensitive, every OS: `con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`. `con-foo` stays legal when it matches the slug pattern.

`Change` constructor rejects when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName(props.name)`. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`. `change-device-name.spec.ts` rejects `con` and `com1` and accepts `con-foo`. `windows-device-name.spec.ts` covers `NUL`, `com1`, and `lpt9`.

## Discrepancies

None.

The three focus items match on both sides:

| Check                            | Spec                                                                                   | Code                                                                                         | Test                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Config file outside the root     | `C:/repo` vs `C:/other/specd.yaml` throws `ConfigValidationError`                      | `isPathInside(this.rootPath, rootConfigPath)` throws `config file resolves outside VCS root` | `config-loader-root-containment.spec.ts` rejects that pair   |
| Mixed separators inside the root | `C:\repo` vs `C:/repo/specd.yaml` is accepted                                          | win32 resolve + relative `specd.yaml` is inside                                              | same file loads and reads `workspaces[0].name === 'default'` |
| `hashFiles` and `\r\n`           | forward the string unchanged; do not classify a binary string; do not rewrite newlines | loop calls `hashContent(content)` only                                                       | spy receives `'line\r\nline'`                                |
| Project root portable path       | `''` means inside and is not an exclusion prefix; `null` means outside                 | equal paths return `''`; `!isPathInside` returns `null`; exclusions require `rel.length > 0` | exclusion list is `['specd']` and does not contain `''`      |

Previous mismatches against older delta wording are closed by the current text plus this code: `hashFiles` is specified not to normalize or detect binary strings, and the project root is specified as `''` rather than as outside. `sha256` / `NodeContentHasher` still normalize every string, which is the content-hasher requirement, not a snapshot-hasher rewrite.

Close calls that are not discrepancies:

- **CRLF equality vs `hashFiles`.** The snapshot verify scenario says CRLF and LF digests are equal. The requirement says `hashFiles` must not rewrite newlines and that normalization belongs to the text hasher. With `NodeContentHasher` or `sha256` as `hashContent`, the digests are equal (`hash-newlines.spec.ts`). `hashFiles` does not equalize by itself. That is what the requirement says.
- **Directory-move `EBUSY`.** `moveDir` copies on `EPERM` and `EXDEV` and does not retry `EBUSY` / `EACCES`. The retry sentence is implemented for atomic file renames (`writeFileAtomic`) and publication renames (`retryOnLock`). The verify scenarios split the same way: `EXDEV` copies; a locked rename retries and then throws the original error.
- **Archive `path.resolve` on darwin.** Host `path.resolve('c:/repo')` is not a win32 drive path. The requirement is the Windows inside-root rule. On Windows, `path.resolve` keeps the drive letter and `isPathInside` applies the rule. Untested at the archive function (missing test), not a win32 miss in source.

## Missing tests

1. **Storage drive-letter case through `load()`.** Scenario: `rootPath` `c:/repo`, storage resolves to `C:/repo/changes`, accepted. Covered only by `isPathInside('C:/repo', 'c:/repo/specd.yaml')` in `path-platform.spec.ts`, not by `load()`.
2. **Storage longer prefix through `load()`.** Scenario: `C:/repo` vs `C:/repository/changes` throws `ConfigValidationError` for that key. The older `../../outside-repo` loader test is a `..` escape, not this prefix. `isPathInside('C:/repo', 'C:/repository')` covers the predicate only.
3. **`isExternal` drive-letter case through `load()`.** Scenario: root `C:/repo`, `specsPath` `c:/repo/specs`, `isExternal` false. No loader test. Existing `isExternal` tests use a real git repo on the host, not this pair.
4. **`realpath` is not called.** Scenario AND-clause on git/hg/svn `rootDir()`. Adapter tests assert `C:\repo` from `c:/repo` or `c:\repo`. They do not spy `realpath` / `fs.realpath`. Source does not call it.
5. **Snapshot “Text file CRLF matches LF”.** `hash-files.spec.ts` asserts forwarding of `\r\n`, not equal digests. Equality is tested on `sha256`, `NodeContentHasher`, and `computeArtifactHash`, not on `hashFiles` with that hasher.
6. **Change artifacts: different destination bytes are not success.** No test. `saveArtifact` has no byte-equality success skip; the scenario is still unasserted.
7. **Spec publication: different artifact bytes are not success.** No publication test for that scenario. Locked `EBUSY` and CRLF `.gitignore` are tested.
8. **Archive drive-letter case.** Scenario `c:/repo` contains `C:/repo/archive` is not run through `resolveArchiveDirPathSync` / `FsArchiveRepository`.
9. **Archive longer directory name.** Scenario `C:/repo` vs `C:/repository/archive` is outside is not run through the archive resolver.
10. **Project root is `''`, not `null`.** The exclusion test expects `['specd']` and `not.toContain('')`. That assertion also passes if `_toPortableProjectRelativePath` returns `null` for the project root. Nothing observes the empty string itself. Outside vs inside for a longer prefix is tested (`C:/work/application` dropped, `specd` kept).

`EPERM` and `EACCES` are not separate rename fixtures. `EBUSY` is, and all three share `LOCK_CODES` in `retryOnLock`. Not counted as an extra missing test.

## Summary

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             0 |             3 |
| core:vcs-adapter                     |            1 |             0 |             1 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             0 |             1 |
| core:fs-change-repository            |            1 |             0 |             1 |
| core:fs-spec-repository              |            1 |             0 |             1 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             0 |             1 |
| core:change                          |            1 |             0 |             0 |
| **Total**                            |       **13** |         **0** |        **10** |

counts: requirements 13, discrepancies 0, missing tests 10

### Hooks

# Hook specs

Read-only audit of requirements added or modified by `windows-platform-compatibility` in:

- `core:hook-runner-port`
- `core:template-variables`
- `core:hook-execution-model`
- `core:run-step-hooks`

Sources: `changes spec-preview … --artifact specs` and `--artifact verify`, plus the change deltas. Code checked: `packages/core/src/infrastructure/node/hook-runner.ts`, `translate-hook-command.ts`, `packages/core/src/application/use-cases/run-step-hooks.ts`, `packages/core/src/application/template-expander.ts`, `packages/core/src/application/ports/hook-runner.ts`. Tests: `hook-runner.spec.ts`, `hook-runner-spawn.spec.ts`, `translate-hook-command.spec.ts`, `template-expander.spec.ts`, `run-step-hooks.spec.ts`.

Landed contract used as the reading of the modified text: developer `run:` values are substituted verbatim; SpecD does not add quotes; `expandForShell()` is only for commands SpecD builds; quote translation is bidirectional and only rewrites syntax the host shell does not understand; `%` is not escaped; Windows spawns `cmd.exe /d /s /c` with `windowsVerbatimArguments` and `windowsHide`; other hosts spawn an absolute `$SHELL` or `/bin/sh` with `-c`; `change` is `{ name, path }` and must not include `workspace`; `RunStepHooks` stores `hook.command` with tokens intact and `HookRunner` expands.

## Requirements checked

### 1. `core:hook-runner-port` — Shell escaping

Substituted values are verbatim. `NodeHookRunner.run` calls `TemplateExpander.expand`, then `translateHookCommand`, then `spawn`. It does not call `expandForShell` or `execFile`.

Quote translation matches the host rules that were executed:

- Windows single quotes, including `'it'\''s`, become one double-quoted span; a `"` inside that span becomes `""`; a POSIX `\"` inside double quotes becomes `""`. Covered by `translate-hook-command.spec.ts`.
- Existing cmd `""` inside double quotes is left as the same command string (`echo "say ""hi"""` stays unchanged).
- POSIX `""` inside a double-quoted span with a later closer becomes `\"` (`echo "Resultado: ""listo"""` → `echo "Resultado: \"listo\""`). An empty `echo ""` stays `echo ""`. Single-quoted spans stay single-quoted. An already-POSIX `\"` stays `\"`.
- `%` is not rewritten on either host (`echo "100%"` and `echo "100%" & cd %USERPROFILE%`).
- Program names, flags, and pipes are not rewritten (`ls 'a b' | wc -l` on cmd only changes the quotes).
- Windows spawn is `cmd.exe` with `['/d', '/s', '/c', command]`, `windowsVerbatimArguments: true`, and `windowsHide: true` (`hook-runner.ts` `spawnHook`).
- Non-Windows spawn uses absolute `process.env.SHELL` or `/bin/sh`, with `['-c', command]`.

`hook-runner.spec.ts` runs `printf %s "{{change.name}}"` with value `a b %PATH% &` and expects that exact stdout, and `printf %s "{{project.root}}/{{change.name}}"` as one string. On this host those tests lock verbatim insertion. `translate-hook-command.spec.ts` locks both quote directions and literal `%`.

### 2. `core:hook-runner-port` — HookVariables shape

The port parameter is `TemplateVariables` (`Record<string, Record<string, string | number | boolean>>`), re-exported from `hook-runner.ts`. There is no `HookVariables` alias.

`RunStepHooks` builds `change` as `{ name, path }` for an active change and `{ name, archivedName, path }` for the archiving-post archive fallback. Neither object has `workspace`. `run-step-hooks.spec.ts` asserts that absence on both paths.

`project.root` is not placed on the object passed to `run()`. It is a `TemplateExpander` builtin (`composition-resolver.ts` `getTemplateExpander`). `{{project.root}}` still expands, which `hook-runner.spec.ts` covers.

`hook-runner.spec.ts` still passes `workspace: 'default'` in one fixture. The runner does not strip keys. The production builders do not inject `workspace`. The unmodified verify scenario “Nested variable paths are resolved” still shows `workspace: "auth"` in its GIVEN. That scenario only asserts `{{change.name}}`.

### 3. `core:template-variables` — Shell escaping for run hooks

`expand()` inserts string values verbatim and does not add quotes. `expandForShell(template, variables?, dialect = 'posix')` still quotes each value: POSIX uses `'` and `'\''`; cmd turns an empty value into `""`, `%` into `%%`, and `"` into `""`, then wraps the value. `HookRunner` does not call `expandForShell`. Instruction and artifact text go through `expand()` in `get-hook-instructions.ts` and `get-artifact-instruction.ts`, with no quote translation.

`template-expander.spec.ts` covers POSIX `expandForShell` (`it's-fine` → `'it'\''s-fine'`), cmd `%` doubling (`a b %PATH% &` → `"a b %%PATH%% &"`), and an empty cmd value (`""`). `expand()` of two adjacent tokens is covered, but not the verify string `mkdir "{{project.root}}/{{change.name}}"`. The runner test above covers that composed quoted path through `expand()` plus translation plus the shell.

### 4. `core:template-variables` — TemplateExpander class

The class matches the modified signature: `expand(template, variables?)` and `expandForShell(template, variables?, dialect?: 'posix' | 'cmd')` with default `posix`. Both share `_replace`. Builtins win on collision (`template-expander.spec.ts`). Comments say `expand` is used for developer `run:` commands and `expandForShell` is for commands SpecD builds. No production caller of `expandForShell` exists under `packages/core/src` other than the method itself.

### 5. `core:hook-execution-model` — Template variable expansion

The modified requirement says `HookRunner` expands `{{change.name}}`, `{{change.path}}`, and `{{project.root}}` verbatim, `{{change.workspace}}` is not supported, and quote translation is defined by `core:hook-runner-port`. The replaced constraints bullet says the same: callers do not shell-escape developer `run:` values.

Code matches that modified text. `RunStepHooks` does not expand. `NodeHookRunner` expands with `expand()` and then translates quotes. The verify scenario “Substituted values are not quoted by SpecD” is the same composed path covered by `hook-runner.spec.ts`.

The unmodified requirement “Default hook execution for transitions and archives” still says `RunStepHooks` “handles hook collection, variable expansion, and execution semantics.” That sentence was not part of the delta.

### 6. `core:run-step-hooks` — Ports and constructor

Constructor dependencies match the modified signature. The use case does not import `TemplateExpander` and does not call `expandForShell`. It passes `hook.command` and the contextual map to `HookRunner.run`.

The new verify scenario uses `echo "Resultado: {{change.name}}"`. No test in `run-step-hooks.spec.ts` uses a command that contains `{{`. Existing tests only round-trip literal commands such as `pnpm lint` and `echo done`.

### 7. `core:run-step-hooks` — Result shape

`_executeHooks` sets `command` from `hook.command` for a `run:` hook and `external:<type>` for an external hook, then passes that same `hook.command` to the runner. The result is not a second expansion. External command recording is tested (`external:docker`). A schema command that still contains `{{...}}` is not tested.

## Discrepancies

### D1. `HookVariables` is both a domain value object and `TemplateVariables`

- Spec A, modified requirement “HookVariables shape”: “The `HookVariables` type is `TemplateVariables`.” It must contain optional `change` (`name`, `path`, no `workspace`) and required `project.root`.
- Spec B, unmodified port constraint in the same merged spec: “`HookResult` and `HookVariables` are domain value objects re-exported by the port module.”
- Code: `packages/core/src/application/ports/hook-runner.ts` re-exports `TemplateVariables` from `application/template-expander.ts` and `HookResult` from the domain. A search of `packages/core` finds no `HookVariables` type. `run()` takes `TemplateVariables`.

If the modified sentence is the contract, the code is right: the port no longer has a separate domain `HookVariables`. If the constraint is the contract, the code is wrong: nothing named `HookVariables` is re-exported, and `TemplateVariables` is not a domain value object. The delta updated the requirement and the spec-dependencies list and left the constraint in place, so the merged spec disagrees with itself. The implementation follows the modified requirement.

### D2. `project` is required on `HookVariables`, and it is also only an expander builtin

- Spec A, modified “HookVariables shape”: `project` is required on that type.
- Spec B, modified `RunStepHooks` “Ports and constructor” and the unmodified “HookVariables construction” in the same spec: the use case only builds the `change` namespace; `project.root` is already on `TemplateExpander`. Modified “TemplateExpander class” says builtins are merged inside `expand` / `expandForShell`, and contextual variables must not override them.
- Code: `run-step-hooks.ts` passes `{ change: { name, path } }` or `{ change: { name, archivedName, path } }`. `composition-resolver.ts` constructs `new TemplateExpander({ project: { root: config.projectRoot } })`. `NodeHookRunner` expands with that expander, so `{{project.root}}` resolves even when `run()` is called with `{}` (`hook-runner.spec.ts`).

If the object passed to `run()` must itself contain `project`, every current caller is wrong, including the tests. If `HookVariables` means the map after builtin merge, the code matches `template-variables` and `run-step-hooks`, and the “project (required)” line on the port is describing the effective map rather than the argument. The open `TemplateVariables` type cannot require `project` or forbid `workspace`. Producers in this change omit `workspace`. That part matches the modified text.

### D3. Unmodified hook-execution text still assigns expansion to `RunStepHooks`

- Spec A, modified “Template variable expansion” and the replaced constraints bullet: `HookRunner` expands developer `run:` commands verbatim and then translates quotes. Callers do not shell-escape.
- Spec B, unmodified “Default hook execution for transitions and archives” in the same merged spec: `RunStepHooks` “handles hook collection, variable expansion, and execution semantics.”
- Spec C, modified `RunStepHooks` result shape: `command` is the schema `run:` text, tokens intact. `HookRunner` expands and translates. The result must not record a second expansion by `RunStepHooks`.
- Code: `run-step-hooks.ts` stores and forwards `hook.command`. `hook-runner.ts` is the only expander and translator on that path.

The code matches the modified requirements. The leftover sentence matches the pre-change model, where callers treated expansion as the use case’s job and `HookRunner` used `expandForShell`. A reader who follows the unmodified sentence would expand in `RunStepHooks` and would violate the modified result shape.

## Missing tests

### M1. Schema command with `{{...}}` is what `RunStepHooks` passes and records

Requirements 6 and 7, and verify scenario “Developer hook text is passed to HookRunner verbatim”.

`run-step-hooks.spec.ts` asserts the runner receives `pnpm lint`, `echo done`, and similar literal strings, and asserts `external:docker`. It never uses a command such as `echo "Resultado: {{change.name}}"`, so it does not show that developer quotes and `{{change.name}}` survive, and it does not show that `result.hooks[].command` is that same schema string rather than an expanded or quote-translated string.

### M2. Windows spawn receives the translated command together with the cmd flags

Requirement 1, verify scenario “Windows turns developer single quotes into cmd quotes”.

`translate-hook-command.spec.ts` asserts `mkdir '{{change.path}}'` becomes `mkdir "{{change.path}}"`. `hook-runner-spawn.spec.ts` asserts `cmd.exe`, `/d /s /c`, `windowsVerbatimArguments`, and `windowsHide`, but only for `echo ok`, which translation does not change. Nothing asserts that a single-quoted command is both translated and passed as that translated string under those spawn options. A regression that spawned the pre-translation string would still pass the spawn tests.

### M3. cmd `expandForShell` doubles an embedded `"`

Requirement 3. POSIX quoting and cmd `%` / empty-string quoting are tested. The modified sentence also says the cmd dialect replaces `"` with `""` before wrapping. No test uses a value that contains `"`.

### M4. Number and boolean substitution

Requirements 1 and 3 keep the rule that only string, number, and boolean values are substituted. `template-expander.spec.ts` covers strings and a non-primitive object left as `{{change.complex}}`. It does not substitute a number or a boolean, either verbatim via `expand()` or quoted via `expandForShell()`.

## Summary

Checked the seven requirements this change rewrote for developer `run:` hooks: verbatim substitution, host quote translation, cmd and POSIX spawn, `HookVariables` / `change` without `workspace`, `expandForShell` limited to SpecD-built commands, and `RunStepHooks` storing the schema command.

The implementation follows that landed contract. `NodeHookRunner` expands with `expand()`, translates quotes, does not escape `%`, and spawns `cmd.exe /d /s /c` or an absolute `$SHELL` / `/bin/sh` with `-c`. `RunStepHooks` forwards `hook.command` and builds `change` without `workspace`. `expandForShell` remains, with a cmd dialect, and hook execution does not call it.

Three discrepancies are spec-internal. The merged hook-runner port still calls `HookVariables` a re-exported domain value object while also defining it as `TemplateVariables`. It also requires `project` on that value while the modified use-case and expander text keep `project` on the expander. The hook execution model still says `RunStepHooks` performs variable expansion in a section the delta did not change. The code follows the modified sentences in each case.

Four test gaps: token-preserving `RunStepHooks` command text, Windows spawn of a translated command, cmd `expandForShell` quote doubling, and number/boolean substitution.

counts: requirements 7, discrepancies 3, missing tests 4

### Code graph

# Code graph specs

Audit of requirements added or modified by `windows-platform-compatibility` for:

- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`
- `code-graph:indexer`
- `code-graph:workspace-integration`

Source of requirements: `changes spec-preview … --artifact specs` deltas (added requirement bodies and the two modified `Spec Dependencies` sections). Verify scenarios from the matching `verify.md` deltas are used only as the test contract. Neither spec nor code is treated as automatically right.

## Requirements checked

### code-graph:sqlite-graph-store — Locked recreation preserves the index lease

1. When `recreate()` deletes the SQLite database or its WAL sidecars and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
2. `recreate()` does not delete a live `index.lock`. A lock held by a running index survives recreation of the database files.

**Code.** `SQLiteGraphStore.recreate` (`packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts`) deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm`, each through `retryLockedAsync`. It never names `index.lock`. `retryLockedAsync` (`packages/code-graph/src/infrastructure/storage-generation.ts`) attempts the operation five times, treats `EPERM`, `EBUSY`, and `EACCES` as lock errors, and rethrows the caught error after the fifth failure. The in-worker `SQLiteGraphDatabase.recreate` uses the synchronous `retryLocked` twin and the same three suffixes, also leaving `index.lock` untouched.

**Verdict.** Matches the spec for the stated files and codes. The bound is five attempts; the spec says “bounded,” and the verify scenario plus the WAL test fix that bound at five `EBUSY` failures. Preserving every `index.lock`, including a stale file, is stronger than “a live lock survives” and does not contradict it. The test stands in for a running holder by writing the lock file; the implementation does not inspect the holder, it simply does not delete that path.

### code-graph:isolated-index-worker — Index lease release on exit

3. The process that holds the index lease releases it on process exit.
4. On Windows that process also releases the lease on `SIGBREAK`.
5. Releasing the lease on `SIGTERM` remains required where that signal is delivered.
6. Failure to deliver `SIGTERM` does not leave the lease held after the process has exited.

**Code.** `createNodeIsolatedGraphIndexRunner` acquires the lease with `signalCleanup: 'exit-only'`, so `acquireGraphIndexLockLeaseByStoragePath` still registers an `exit` release and does not register its own `SIGINT`/`SIGTERM` handlers. The supervisor (`packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts`) registers `exit` → `lease.release()`, `SIGBREAK` → `lease.release()` then forward, and `SIGINT`/`SIGTERM` → forward only. `finalize()` also calls `lease.release()` when the run settles, including after a forwarded signal causes the child to exit. `release()` deletes `graph/index.lock` only when the owner token still matches.

**Verdict.** Exit and `SIGBREAK` match the spec. `SIGTERM` still ends in a release if the child exits or the parent process exits; it is not released inside the `SIGTERM` callback the way `SIGBREAK` is. That still satisfies “where that signal is delivered” if delivery is followed by child exit or process exit. Swallowing `SIGTERM` (a listener prevents Node’s default termination) can keep the lease until one of those later events. The spec does not require the release to happen inside the `SIGTERM` handler, so this is not scored as a mismatch. The modified dependency line points the lease at `code-graph:sqlite-graph-store`; the lease file is `index-lock.ts`, and the sqlite spec only forbids deleting it during `recreate()`. The worker does release that file. The dependency sentence is descriptive, not a second behavioral rule.

### code-graph:indexer — Portable graph paths

7. Relative paths persisted by the indexer use `/`. That conversion does not collapse `.` or `..`.
8. A key matching `^[A-Za-z]:[/\\]` is not split into a workspace name and a path. The drive letter stays part of the path.
9. Every graph-identity split uses that rule, including language-adapter relative imports, scoped binding, and hotspot caller classification.
10. A PHP namespace separator is not a graph identity and stays local.

**Code.** `toPortableGraphPath` replaces `\` with `/` and does not normalize `.` or `..`. `splitWorkspaceIdentity('C:/repo/src/a.ts')` returns `null` because `isDriveLetterPath` matches first. Callers that then keep the original string leave the drive letter in the path. `discoverFiles` also rewrites `\` to `/` via `path.relative(...).replaceAll('\\', '/')`. `path.relative` itself canonicalizes `..` before that rewrite; the spec sentence attaches non-collapse to the separator conversion, which `toPortableGraphPath` honors. The verify example `src\..\secret` → `src/../secret` is the conversion function, and that function is what the indexer applies to config-relative paths after discovery.

Adapter relative imports (`typescript`, `python`, `php`, and Go’s slash branch) call `splitWorkspaceIdentity` and, on `null`, keep the original path, so `C:/repo/src/a.ts` does not become workspace `C`. Scoped binding’s `extractWorkspacePrefix` returns `undefined` instead of `C:`. Hotspot `extractWorkspace` returns `''` for a drive-letter path, and the workspace filter compares `splitWorkspaceIdentity(...)?.workspace`. PHP `\` is rewritten only inside Cake/class helpers (`replaceAll('\\', '/')` in `getCakeTargetCandidates` and `toPhpFileStem`), not by the graph-identity splitter.

**Verdict.** Clauses 7, 8, and the forward-slash cases of 9 match. Clause 10 matches the code and has no test (see Missing tests). Clause 9 fails for a Go file whose only slash is the drive slash (Discrepancy 1).

### code-graph:workspace-integration — Drive letters are not workspace names

11. Parsing a graph identity does not treat a Windows drive letter as `{workspaceName}`. A string matching `^[A-Za-z]:[/\\]` keeps the drive letter in the path.
12. The rule applies to exclusion, hotspot classification, SQLite workspace inclusion, and CLI graph display.
13. A workspace filter of `C` does not match a drive-letter path.

**Code.**

- Exclusion: `matchesExclude` returns `null` from its drive-letter check, so exclude-workspace `C` does not exclude `C:/repo/src/a.ts`.
- Hotspot classification: drive-letter paths classify as `''`, not `C`. The inclusion filter drops them when `workspace` is `C` because the split is `null`.
- SQLite inclusion: `searchSymbols` post-filters with `splitWorkspaceIdentity(row.file_path)?.workspace`. A stored path `C:/repo/src/a.ts` is not workspace `C` even if some other column differs. The drive-letter test inserts that path with `workspace: 'repo'` and expects `searchSymbols({ workspace: 'C' })` to be empty; that assertion fails if the path were split as workspace `C`, so it does exercise the path rule.
- CLI display: `toGraphDisplayPath` uses a second copy of the same split. A drive-letter path does not parse, and the canonical string is returned. `resolve-impact-file-selectors.spec.ts` expects `C:/repo/src/a.ts` unchanged.

**Verdict.** Matches for `C:/…` paths. The CLI splitter is a duplicate of the code-graph function; current behavior matches. `C:` with no slash or backslash after the colon is not a drive-letter path under the spec regex, and `splitWorkspaceIdentity('C:')` returns workspace `C` (this is how Discrepancy 1 becomes a workspace name).

### Modified spec-dependency sections

14. `code-graph:isolated-index-worker` dependency text now cites `code-graph:sqlite-graph-store` for the index lease and persistence layout.
15. `code-graph:indexer` dependency list now includes `code-graph:sqlite-graph-store` for persisted graph identity.

No behavioral contradiction with the added requirements. See clause 6 for the lease wording.

## Discrepancies

### 1. Go package surface `C:/a.go` is the workspace prefix `C:`

**Spec.** A key matching `^[A-Za-z]:[/\\]` must not be split into a workspace name and a path. The drive letter is part of the path. Every graph-identity split, including language-adapter surfaces, uses that rule. The added verify example is the nested path: `C:/repo/src/a.go` stays a path, and the workspace name is not `C`.

**Code.** `goPackageSurface` returns `filePath.slice(0, filePath.lastIndexOf('/'))` whenever a `/` exists, and only then falls through to `splitWorkspaceIdentity`.

- `C:/repo/src/a.go` → `C:/repo/src`. `splitWorkspaceIdentity` of that surface is `null`. This matches the verify scenario and the Go adapter test.
- `C:/a.go` → slice at the drive slash → `C:`. `isDriveLetterPath('C:')` is false because the regex requires `/` or `\` after the colon, so `splitWorkspaceIdentity('C:')` returns `{ workspace: 'C', relativePath: '' }`.

**Both readings.**

- Spec is right about the general rule, and the slash branch is wrong for a file in the drive root: the stored package surface is exactly the workspace prefix the change forbids. The nested example does not catch it.
- Code is right for the only path the verify scenario and the new test name (`C:/repo/src/a.go` → `C:/repo/src`, and not `C:`). The drive-root surface `C:` is the same shape the adapter already uses for a real workspace root (`workspace:first.go` → `workspace:`). The spec never says what the directory of `C:/a.go` should be.

## Missing tests

1. **`EPERM` and `EACCES` retries.** The sqlite requirement names three lock codes. `sqlite-graph-store.spec.ts` exhausts five `EBUSY` failures on the WAL and checks that the original `EBUSY` is surfaced and `index.lock` remains. Nothing fails `rm` with `EPERM` or `EACCES`.
2. **Process exit alone releases the lease.** Verify scenario: the worker holds the lease, the process exits, the lease is released. `supervisor.spec.ts` “releases the lease on SIGBREAK and process exit” emits `SIGBREAK` and then `exit` before it tries to acquire the lock again. `SIGBREAK` already calls `lease.release()`, so a broken `exit` listener would still pass.
3. **`SIGBREAK` alone releases the lease.** Same test. An `exit` listener that releases would hide a `SIGBREAK` handler that only forwards. The test also does not assert that the lock is gone before `exit` is emitted.
4. **`SIGTERM` still releases the lease.** `signals.spec.ts` forwards `SIGTERM` and checks the child kill and listener cleanup. It does not assert that `index.lock` can be acquired again. Other supervisor tests reacquire the lock after start failures that kill the child with `SIGTERM`; they do not emit `SIGTERM` on the parent.
5. **PHP namespace separator stays local.** No test passes a namespace such as `App\Models\User` through identity parsing or asserts that `\` is not a graph-identity separator. The drive-letter PHP test only checks `resolveRelativeImportPath('C:/repo/src/a.php', './b.php')`.
6. **Hotspot caller classification.** `compute-hotspots.spec.ts` asserts that `workspace: 'C'` returns no entries for `C:/repo/src/a.ts` and `C:/repo/src/b.ts`. That uses the filter’s `splitWorkspaceIdentity` check. `extractWorkspace`, which buckets same-workspace vs cross-workspace callers, is not asserted. A regression that classified those callers as workspace `C` would still pass.

Covered, and not counted above:

- `splitWorkspaceIdentity('C:/repo/src/a.ts')` is `null`; backslash form is covered for `isDriveLetterPath` only.
- SQLite `searchSymbols` with workspace `C` does not return `C:/repo/src/a.ts`.
- Scoped binding does not pass prefix `C:`.
- Go surface of `C:/repo/src/a.go` is `C:/repo/src`.
- TypeScript, Python, and PHP relative imports keep `C:/repo/src` in the resolved path.
- `toPortableGraphPath('src\\..\\secret')` is `src/../secret`.
- Five WAL `EBUSY` failures surface `EBUSY`; a written `index.lock` is still present after a failed recreate and after a successful recreate.
- CLI `toGraphDisplayPath` leaves `C:/repo/src/a.ts` unchanged.
- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.

## Summary

counts: requirements 15, discrepancies 1, missing tests 6

### CI and testing

# CI and testing specs

Read-only audit of requirements this change added or modified in `default:_global/testing`, `default:_global/continuous-integration`, `default:_global/docs`, `core:workspace`, and `core:spec-id-format`. Spec text is the change `spec-preview` (`--artifact specs`). Neither the spec nor the code was treated as automatically right.

`@ladybugdb/core` is absent from `pnpm-workspace.yaml` `onlyBuiltDependencies`. That absence is an intended non-goal and is not a discrepancy.

Change-name rejection lives in `core:change`, which is outside this batch. The device-name helper is shared, and `change-device-name.spec.ts` rejects `con` and `com1` and accepts `con-foo`. That observation is not counted here.

## Requirements checked

### 1. `default:_global/testing` — Fixtures are valid on Windows (temp paths and file URLs)

Filesystem tests must locate temporary directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`.

**Status: met.**

Created fixtures use `os.tmpdir()` / `tmpdir()` plus `mkdtemp` or `mkdtempSync` (for example `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `spec-repository.spec.ts`, `change-repository.spec.ts`, and `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`). Worker and barrel tests build module URLs with `pathToFileURL(join(tmpdir(), ...))` in `barrel.spec.ts`, `signals.spec.ts`, `supervisor.spec.ts`, and `dist.spec.ts`.

A repo search of `*.{ts,js,mjs}` found no `/var/www`, no `file:///tmp`, and no `mkdtemp`, `mkdir`, or `writeFile` call aimed at a literal `/tmp` path. `protocol.spec.ts` uses the literal `file:///task.js` as a JSON envelope for `isStartMessage`. That string is not `file:///tmp` and the test does not create a file there.

Leftover `'/tmp/...'` strings remain in mocks, stub return values, and expected CLI arguments (for example `changePath: '/tmp/test-changes/my-change'` in `change-create.spec.ts`, and `path: '/tmp/changes/add-auth'` in `hook-runner.spec.ts`). Those tests do not create a fixture at `/tmp`. Per this change they are non-goals and are not flagged.

### 2. `default:_global/testing` — Unreadable files do not use `chmod 0o000`

A test that needs an unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.

**Status: met.**

`get-graph-health.spec.ts` creates the directory with `mkdtempSync(join(tmpdir(), ...))`, writes a real file, and then mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. A search of `*.{ts,js,mjs}` found no `chmod`, `chmodSync`, or `0o000`.

### 3. `default:_global/continuous-integration` — Workflow file is tracked

The repository must track `.github/workflows/ci.yml`. Tracking that directory must not require tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` must stay ignored. Gemini workflow files under `.github/workflows/` must not be ignored if they are added later.

**Status: met.**

`.gitignore` is:

```
.github/*
!.github/workflows/
!.github/workflows/**
```

`git check-ignore -q` reports `.github/workflows/ci.yml` and a hypothetical `.github/workflows/gemini-review.yml` as not ignored. It reports `.github/copilot-instructions.md`, `.github/skills/foo`, `.agents/foo`, and `.claude/skills/x` as ignored. Agent directories (`.agents/`, `.claude/`, `.codex/`, `.opencode/`, `.gemini/`) and `skills-lock.json` stay ignored.

`ci.yml` is untracked in the index (`?? .github/`) because this change is not committed. The verify scenario is the ignore rule, which matches. Uncommitted state is not a discrepancy.

### 4. `default:_global/continuous-integration` — Three operating systems

`ci.yml` must run the same job on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any one runner must fail the check.

**Status: met.**

One `check` job uses `strategy.matrix.os: [macos-latest, ubuntu-latest, windows-latest]` and the same step list on every runner. `fail-fast: false` still fails the workflow when any matrix job fails; it only keeps the other runners going. That matches the allowed reading of this requirement.

### 5. `default:_global/continuous-integration` — When the workflow runs

The workflow must run on pull requests and on pushes to `main`. It must not call the Gemini workflows.

**Status: met.**

```yaml
on:
  pull_request:
  push:
    branches:
      - main
```

Default `pull_request` includes opened and synchronize (updated). The file has no `workflow_call`, no Gemini job, and no step that invokes a Gemini workflow.

### 6. `default:_global/continuous-integration` — Toolchain install

Each job must check out the repository, install the pnpm `10.6.5` binary, install Node 22, and run `pnpm install --frozen-lockfile`. That install is what builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. The workflow must not install extra apt, brew, or Chocolatey packages.

**Status: met.**

`ci.yml` steps are `actions/checkout@v4`, `pnpm/action-setup@v4` with `version: 10.6.5`, `actions/setup-node@v4` with `node-version: 22`, then `pnpm install --frozen-lockfile`. There is no apt, brew, or choco step. Root `packageManager` is `pnpm@10.6.5`.

`pnpm-workspace.yaml` `onlyBuiltDependencies` lists those five packages (plus `core-js` and `core-js-pure`, which the design treats as allowlisted and not native). `@specd/code-graph` depends on the three `@ast-grep/lang-*` packages and `better-sqlite3`. `esbuild` is in `pnpm-lock.yaml` as a transitive dependency, so the frozen install is what builds it. Extra allowlist entries are not forbidden.

### 7. `default:_global/continuous-integration` — Checks

Each job must run `pnpm typecheck`, `pnpm build`, and `pnpm test`, in that order. `typecheck` and `build` must skip `@specd/public-web`. `pnpm test` must run Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and each `@specd/plugin-agent-*` package. It must not include `@specd/mcp` or `@specd/public-web`. The workflow must not run changeset status or publish.

**Status: met.**

`ci.yml` runs those three commands in that order and nothing after them. Root scripts:

- `typecheck`: `turbo typecheck --filter=!@specd/public-web`
- `build`: `turbo build --filter=!@specd/public-web`
- `test`: `turbo test --concurrency=3` with filters for exactly the twelve packages named above

Each of those twelve packages has `"test": "vitest run"`. `@specd/mcp` has a Vitest script but is not in the filter. `@specd/public-web` is not in the filter. No changeset or publish step is in the workflow.

### 8. `default:_global/docs` — Non-Windows hook spawn in the workflow guide

The modified user-guide requirement says developer `run:` values are inserted verbatim, SpecD translates only quote syntax the host shell does not understand, and the guide must say that non-Windows hooks run with the absolute `SHELL` value when it is absolute, otherwise `/bin/sh`. It must not describe that substitution as shell escaping.

**Status: met.**

`docs/guide/workflow.md` says substitution inserts `{{...}}` exactly, `instruction:` is verbatim and is not a shell command, and:

> A `run:` command is a shell command. macOS and Linux run it with the absolute `$SHELL` or `/bin/sh`. Windows runs it with `cmd.exe`.

The quote section is titled as quote translation, not shell escaping. The only other "escape" in that file is the lifecycle phrase "manual escape to revise specs", which is unrelated.

`NodeHookRunner.spawnHook` matches that rule: on `win32` it spawns `cmd.exe` with `['/d', '/s', '/c', command]`; otherwise it uses `process.env['SHELL']` when that value is absolute, and `/bin/sh` when `SHELL` is missing or relative, with `['-c', command]`.

### 9. `core:workspace` — Windows device names are reserved workspace names

`con`, `prn`, `aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9` must be rejected on every operating system when the whole workspace name is the device name. `con-foo` must stay legal. `default` and `root` stay reserved.

**Status: met.**

`FsConfigLoader._buildConfig` calls `isWindowsDeviceName(name)` and throws `ConfigValidationError` (`'...' is a Windows device name`) before the workspace is built. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`, so the whole segment is compared case-insensitively and `con-foo` does not match. Workspace keys are a Zod `z.record`, so `con` reaches this check rather than being dropped earlier. `workspaces.root` is still rejected as reserved for project-global graph identities, and `workspaces.default` is still required.

`config-loader.spec.ts` rejects workspace `con` with `/Windows device name/` and accepts `con-foo`. `isWindowsDeviceName('NUL')` is true in `windows-device-name.spec.ts`, which covers the scenario's `nul` example case-insensitively. An existing test rejects workspace `root`.

### 10. `core:spec-id-format` — Capability segments reject Windows device names

A capability-path segment that is a Windows device name must be rejected on every operating system. The same reserved set is compared case-insensitively as the whole segment. `con-foo` must remain legal. This rule does not treat a Windows drive letter as a workspace name; spec IDs are not filesystem paths.

**Status: met.**

`SpecPath._validateSegments` rejects a segment when `isWindowsDeviceName(segment)` is true, with `InvalidSpecPathError`. `SpecPath.parse` splits on `/` only. `parseSpecId` still splits on the first `:` and does not interpret a drive letter as a workspace. The device-name rule is not implemented by treating spec IDs as Windows paths.

`spec-path.spec.ts` throws on `con` and on `auth/com1`, and accepts `con-foo`. Case-insensitivity is covered by `isWindowsDeviceName('NUL')` on the same helper `SpecPath` calls.

## Discrepancies

None.

## Missing tests

### Counted

1. **`prn` and `aux` are never asserted.** The reserved set in both the workspace requirement and the spec-id requirement includes `prn` and `aux`. `windows-device-name.spec.ts` asserts `con`, `NUL`, `com1`, `lpt9`, and `con-foo` only. No `*.spec.ts` under `packages/` contains `prn`, `aux`, or `lpt1`. `lpt9` exercises `lpt[1-9]`, and `com1` exercises `com[1-9]`. `prn` and `aux` are separate alternatives, so deleting them from the regex would not fail the current tests. The loader, `SpecPath`, and change-name checks all call this helper, so one helper assertion would cover those call sites.

### Coverage notes (not counted)

Workflow files have no Vitest. File inspection is the test, and the files match the spec, so this is not a discrepancy and is not a missing test:

- `.github/workflows/ci.yml` matches the trigger, matrix, toolchain, and check requirements.
- `.gitignore` matches the tracking requirement (`git check-ignore` as above).
- `.gitattributes` is present (`* text=auto eol=lf`, plus `*.md`, `*.yaml`, `*.yml`, `*.json` forced to LF). None of these five specs require it. It is not a discrepancy.
- The docs verify scenario is a review of `docs/guide/workflow.md`. The hook sentence matches the code.
- The fixture and chmod rules are properties of the suite. Inspection found `os.tmpdir()` fixtures, `pathToFileURL` for real module URLs, an `EACCES` mock instead of `chmod 0o000`, and no created `/tmp` fixture. Mock `/tmp` strings are non-goals.

## Summary

counts: requirements 10, discrepancies 0, missing tests 1
