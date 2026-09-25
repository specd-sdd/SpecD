# Spec compliance: windows-platform-compatibility

Mode: change. Verification mode: full. Change state at audit time: verifying.

## Aggregate

| Batch           | Requirements / clauses |           Discrepancies |                   Missing tests |
| --------------- | ---------------------: | ----------------------: | ------------------------------: |
| Core paths      |                     24 |                       7 |                              16 |
| Hooks and names |                      7 | 0 behavioral, 3 wording |                               4 |
| Code graph      |              8 clauses |                2 groups | 1 scenario (locked WAL `EBUSY`) |
| CI              |                      5 |                       0 |               4 workflow guards |
| Testing         |                      7 |                       3 |           4 fixture/mock guards |

Scenarios for this change were checked against the merged verify text and the current tests. The behaviors those scenarios name are in the code. The locked-WAL scenario is implemented in `retryLocked` / `retryLockedAsync` and has no test that injects `EBUSY`.

Material findings:

- Spec publication wraps an exhausted rename in `SpecPublicationError` and drops the original `code`.
- `computeArtifactHash` collapses whitespace before newline normalization. `sha256` and `NodeContentHasher` normalize newlines. `hashFiles` does neither unless the callback does.
- Refresh and artifact hashing import infrastructure path helpers from the application layer.
- Hotspot extraction, several language adapters, scoped binding, and the SQLite workspace `startsWith` filter still split on the first colon, so a drive letter can look like workspace `C`.
- Hook wording still says "shell escaping" in the hook-execution-model constraint, `TemplateExpander` comments, and the workflow guide. The runner expands verbatim and then translates quotes. Non-Windows uses `$SHELL` or `/bin/sh`.
- `windowsHide`, `moveDir` on `EPERM`, and several retry codes have no direct test.

## Detailed findings

# Partial audit: core paths, containment, hashes, retries, VCS roots

Change: `windows-platform-compatibility`. Read-only. Scope is requirements this change added or changed in the listed specs, plus contradictions with `default:_global/architecture`, `default:_global/testing`, and `default:_global/conventions`. Spec text is the merged delta view from `changes spec-preview`.

Graph search and impact were used before source reads. `graph search` reported `CONTENT_KNOWN_STALE` even though this audit was told the index had just been rebuilt. Findings below are from the current source, not from the stale index alone.

Shared implementation checked:

- `packages/core/src/infrastructure/fs/path-platform.ts`
- `packages/core/src/infrastructure/git|hg|svn/exec.ts` and `vcs-adapter.ts`
- `packages/core/src/infrastructure/fs/file-reader.ts`
- `packages/core/src/infrastructure/fs/change-repository.ts`, `spec-repository.ts`, `archive-repository.ts`
- `packages/core/src/infrastructure/fs/write-atomic.ts`, `move-dir.ts`, `ensure-tmp-gitignore.ts`, `hash.ts`, `path-confinement.ts`
- `packages/core/src/infrastructure/node/content-hasher.ts`
- `packages/core/src/domain/services/hash-files.ts`, `pre-hash-cleanup.ts`
- `packages/core/src/application/use-cases/_shared/compute-artifact-hash.ts`
- `packages/core/src/application/use-cases/refresh-implementation-tracking.ts`
- `packages/core/src/composition/config-loader.ts`

`retryOnLock` does what the design states, which the specs only call "bounded": five attempts, delays 50/100/150/200 ms between them, retry only `EPERM` / `EBUSY` / `EACCES`, then the original error. `moveDir` copies on `EPERM` and `EXDEV` (and still on `ENOTEMPTY` / `EEXIST`). `windowsHide: true` is set only when `process.platform === 'win32'` in git, hg, and svn `exec.ts` (async and sync). There is no test that asserts `windowsHide`. `moveDir`'s `EPERM` branch is not tested; `EXDEV` is.

---

### core:config-loader

**Requirements checked**

- Storage paths are inside `rootPath` by the relative-path rule (empty relative, or not `..` and not absolute). Drive-letter case does not push an inside path outside. A string prefix of the root plus a separator is not the test. Outside paths throw `ConfigValidationError` naming the storage key. `rootPath === null` skips the check.
- `isExternal` uses that same rule. `rootPath === null` forces `isExternal === false`.
- The resolved config file uses the same inside-root rule. Separator mismatch and drive-letter case must not reject an inside config.
- `rootPath` is the normalized adapter root, not raw CLI stdout.

**Implementation status**

Implemented. `FsConfigLoader` calls `isPathInside` for the config path, for each fs storage binding (`changes`, `drafts`, `discarded`, `archive`), and for `isExternal` (`config-loader.ts` around the storage block and workspace loop). `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()` after a `NullVcsAdapter` check, and that `rootDir()` is `normalizeVcsRoot` (absolute, drive letter uppercased, no `realpath`).

`isPathInside` resolves with `path.win32` when the root has a drive letter or a backslash, uppercases the drive letter, then uses `path.win32.relative` / `path.relative`. Empty relative is inside. A relative path that `startsWith('..')` or is absolute is outside. `C:/repo` vs `C:/repository` is outside. That matches the spec text, including the spec's own `startsWith('..')` rule (a relative segment such as `..secret` would also look outside).

**Discrepancies**

None for these requirements.

**Test coverage**

`path-platform.spec.ts` covers drive-letter inside, `C:/repo` vs `C:/repository`, and `C:/work/app` vs `C:/work/application`. `config-loader.spec.ts` still covers POSIX outside-root storage and `isExternal`, not the new Windows scenarios.

**Missing tests**

- Loader scenario: drive-letter case accepts `C:/repo/changes` under `c:/repo`.
- Loader scenario: `C:/repository/changes` under `C:/repo` throws for that storage key.
- Loader scenario: `c:/repo/specs` under `C:/repo` is not external.
- Loader scenario: `C:\repo` accepts `C:/repo/specd.yaml`, and `C:/other/specd.yaml` throws.

Requirements checked: 4. Discrepancies: 0. Missing tests: 4.

---

### core:vcs-adapter

**Requirements checked**

- Git, hg, and svn normalize the repository root before cache and before `rootDir()`: absolute, Windows drive letter uppercased, no `realpath`, still a usable working directory.
- `NullVcsAdapter.rootDir()` throws and does not invent a root.
- Modified-file paths from those three adapters use `/` and do not collapse `.` or `..`.
- On Windows, spawns of `git`, `hg`, and `svn` hide the console.

**Implementation status**

Implemented. Each adapter assigns `normalizeVcsRoot` in the constructor and on the uncached `rootDir()` path (`git rev-parse --show-toplevel`, `hg root`, `svn info --show-item wc-root`). `toPortablePath` is `replaceAll('\\', '/')` only. Git, hg, and svn modified-file collectors pass paths through it. `spawnOptions` in each `exec.ts` returns `{ cwd, windowsHide: true }` only when `process.platform === 'win32'`, otherwise `{ cwd }`. Both `execFile` and `execFileSync` use that object.

`packages/core/src/infrastructure/vcs/vcs-implementation-detector.ts` has a second `toPortablePath` and runs `path.resolve` / `path.relative` before it. That can collapse `src/../secret` after the adapter has already returned it. The requirement is on paths returned by the adapters, which do not collapse. The detector is outside this spec's return value.

**Discrepancies**

None for the adapter contract.

**Test coverage**

Git, hg, and svn adapter specs: `c:/repo` and `c:\repo` become `C:\repo`; cached POSIX roots stay; `src\..\secret` stays `src/../secret`. `null/vcs-adapter.spec.ts` expects `rootDir()` to throw. No test name or assertion mentions `windowsHide` or `spawnOptions`.

**Missing tests**

- Windows spawn scenario: on `win32`, `git` / `hg` / `svn` exec options include `windowsHide: true`; on other platforms they do not. `spawnOptions` is private, so this needs an `execFile` mock.

Requirements checked: 4. Discrepancies: 0. Missing tests: 1.

---

### core:file-reader-port

**Requirements checked**

- With `basePath`, escape detection uses the inside-root rule. Drive-letter case stays inside. A sibling prefix (`C:/repo` vs `C:/repository/spec.md`) throws `PathTraversalError`.
- The path is resolved before the traversal check and the read.

**Implementation status**

Implemented. `FsFileReader` stores `normalizeVcsRoot(basePath)` and resolves the argument the same way before `isPathInside`. Misses still return `null` only for `ENOENT`. Other errors propagate. No `basePath` skips the check.

**Discrepancies**

None.

**Test coverage**

`windows-containment.spec.ts`: `FsFileReader('C:/repo').read('c:/repo/missing.txt')` resolves `null` (no traversal error); `C:/repository/file.txt` throws `PathTraversalError`. `resolveConfinedPath('C:/work/app', '../application')` throws.

**Missing tests**

None for the new scenarios. A backslash root against a slash candidate is only covered indirectly by `isPathInside`.

Requirements checked: 2. Discrepancies: 0. Missing tests: 0.

---

### core:fs-change-repository

**Requirements checked**

- Path confinement uses the inside-root rule, including drive-letter case. A longer prefix is outside.
- A directory move that fails with `EPERM` or `EXDEV` copies.
- A rename onto a locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` retries a bounded number of times, then surfaces the original error.
- Identical destination bytes are not treated as success for change artifacts.

**Implementation status**

Confinement goes through `isPathInside` (`resolveConfinedPath`, bucket classification, `isStrictlyInside`). Directory moves go through `moveDir`, which copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. Manifest and lock-owner writes go through `writeFileAtomic`, which `retryOnLock`s the rename and rethrows the original error. `saveArtifact` uses `fs.writeFile` after an `originalHash` check; it does not treat equal bytes as a completed rename. `sha256` newline-normalizes before that hash compare, so CRLF and LF compare equal. That is hash equality, not a rename-success shortcut.

`retryOnLock` (`path-platform.ts`): loop `attempt` 0..4; on a lock code, delay `RETRY_DELAYS_MS[attempt]` unless `attempt === 4`, then throw the caught error. Delays used are 50, 100, 150, 200. Codes are `EPERM`, `EBUSY`, `EACCES`. Non-lock errors throw immediately.

`_pruneEmptyParents` still `realpath`s before `isPathInside`. The new rule does not forbid `realpath` there. VCS roots are a different spec.

**Discrepancies**

None against the requirement text. Design's five-attempt schedule is implemented even though the spec only says "bounded".

**Test coverage**

`move-dir.spec.ts` copies on `EXDEV` and removes the source. It does not inject `EPERM`. `write-atomic.spec.ts` retries one `EBUSY` then writes, and after five `EBUSY` failures rejects with the same error object. `path-platform.spec.ts` asserts five `EBUSY` calls. Neither asserts the delay list nor `EPERM` / `EACCES`. `windows-containment.spec.ts` covers the prefix rule for `resolveConfinedPath`, which change artifacts use. No change-repository test for the Windows confinement scenarios.

**Missing tests**

- `moveDir` copies when rename fails with `EPERM` (known gap; `EXDEV` is covered).
- Retry delays 50/100/150/200 and codes `EPERM` and `EACCES`, not only five `EBUSY` failures.

Requirements checked: 4. Discrepancies: 0. Missing tests: 2.

---

### core:fs-spec-repository

**Requirements checked**

- Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` retry a bounded number of times, then surface the original error.
- Temporary `.gitignore` comparison treats `\r\n` and `\r` as `\n`. Identical normalized content is success for that file only.
- Differing artifact bytes are not success.

**Implementation status**

`publish` wraps `fs.rename` of the live spec dir, the staging dir, and the backup restore in `retryOnLock`. `ensureTmpGitignore` returns without writing when `normalizeNewlines(existing)` equals the LF marker. Artifact writes use `writeFileAtomic` and do not short-circuit on equal bytes. Spec-lock and metadata hashes use `sha256`, which newline-normalizes.

**Discrepancies**

1. Publication does not surface the original error.

   Spec and verify: after retries, the original error is surfaced (`EBUSY` in the scenario).

   Code (`spec-repository.ts` publish): both rename catches throw `new SpecPublicationError(specId, stagingDir, errorMessage(error))`. `errorMessage` keeps `Error.message` only, so `.code` is dropped and the thrown value is not the `EBUSY` object.
   - Spec correct, code wrong: callers cannot see the original `ErrnoException` or its `code`.
   - Code correct, spec wrong: publication already promises `SpecPublicationError`, and "surface" means the failure is not swallowed. The verify scenario's "original error" would then need to mean the publication error's message, which is a weaker reading of "original".

   `writeFileAtomic` itself does rethrow the original object. The wrap is only in `publish`.

**Test coverage**

`ensure-tmp-gitignore.spec.ts` writes `*\r\n!.gitignore\r\n` and expects the file to stay CRLF. `write-atomic.spec.ts` covers `EBUSY` retry for the atomic writer publication uses for file bytes. `spec-repository.spec.ts` has no `EBUSY` / `EPERM` publication rename test.

**Missing tests**

- Publication rename keeps failing with `EBUSY` until the budget is exhausted, and the assertion is on the error the caller actually receives (this would catch the wrap).
- Lone `\r` gitignore matches the LF marker. Differing artifact bytes are not treated as already published. CRLF gitignore equality is covered; a different `.gitignore` body is not asserted.

Requirements checked: 3. Discrepancies: 1. Missing tests: 2.

---

### core:fs-archive-repository

**Requirements checked**

- Resolved archive paths use the inside-root rule. Drive-letter case stays inside. A longer directory name is outside.

**Implementation status**

`resolveArchiveDirPathSync` rejects `..`, `../`, and POSIX-absolute relatives, then `path.resolve`s and `isPathInside`. Archive directory moves use `moveDir` (same `EPERM` / `EXDEV` copy as changes). Manifest writes use `writeFileAtomic`. The archive spec's new requirement is confinement, not retry.

**Discrepancies**

None.

**Test coverage**

No archive test for `c:/repo` vs `C:/repo/archive` or `C:/repo` vs `C:/repository/archive`. The predicate is unit-tested in `path-platform.spec.ts`.

**Missing tests**

- Drive-letter case stays inside the archive root.
- `C:/repository/archive` is outside `C:/repo`.

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

### core:refresh-implementation-tracking

**Requirements checked**

- A path is project-relative only when it is the project root or a descendant. Matching requires a separator boundary. A longer string prefix is outside. Drive-letter case does not change the result.
- Spec dependency: the project root used for that check is the normalized adapter root.

**Implementation status**

`_toPortableProjectRelativePath` uses `isPathInside`, then `path.win32.relative` or `path.relative`, then `toPortablePath`. Exclusions drop a `null` result. The verify scenarios (longer prefix `C:/work/application` excluded; `c:/work/app/specd` kept as `specd`) match the test.

The project root itself is `isPathInside` true, relative `''`, then `portable.length > 0 ? portable : null`. The root is not emitted as a project-relative path. Callers only use this for exclusion prefixes, so a storage path equal to the project root is silently omitted.

**Discrepancies**

1. The project root is specified as project-relative and is not returned.
   - Spec correct, code wrong: an internal path that is the project root is dropped, so it never becomes an `excludePaths` entry.
   - Code correct, spec wrong: an empty relative string is not a usable exclusion prefix, and the verify scenarios only require descendants and prefix boundaries. The "or the project root" clause would be about `isPathInside`, not about the string passed to the detector.

2. Application imports infrastructure, against `default:_global/architecture`.

   `refresh-implementation-tracking.ts` imports `isPathInside`, `normalizeVcsRoot`, and `toPortablePath` from `infrastructure/fs/path-platform.js` under `eslint-disable no-restricted-imports`. Architecture says `application/` must not import `infrastructure/`, and path helpers that need `node:path` stay in infrastructure. The design says those helpers live in infrastructure and does not add an application-import exception.
   - Architecture correct, code wrong: the use case should receive an already-normalized root and a port for relative conversion.
   - Code correct, architecture stale: sharing one helper forced an infrastructure import, and the disable is the intended exception. That exception is not written into the global spec.

**Test coverage**

`refresh-implementation-tracking.spec.ts`: `internalPaths` of `C:/work/application` and `c:/work/app/specd` with project root `C:/work/app` yields `excludePaths === ['specd']`.

**Missing tests**

- Classification of the project root itself (the requirement sentence that the implementation does not follow).

Requirements checked: 2. Discrepancies: 2. Missing tests: 1.

---

### core:content-hasher-port

**Requirements checked**

- Before a text digest, every `\r\n` and every remaining `\r` becomes `\n`. The digest is of that text. Binary content is not newline-normalized.
- The same text after that normalization has the same digest. Empty input still returns `<algorithm>:<hex>`.

**Implementation status**

`NodeContentHasher.hash` and `sha256` both run `normalizeNewlines` then UTF-8 SHA-256 and return `sha256:<hex>`. There is no binary input. Every string is normalized, including a string whose bytes happen to contain `\r\n`.

`computeArtifactHash` calls `normalizeNewlines(applyPreHashCleanup(content, cleanups))`. `applyPreHashCleanup` always ends with `.replace(/\s+/g, ' ').trim()`, even when `cleanups` is empty. `\r`, `\n`, and `\r\n` are whitespace, so they become spaces before `normalizeNewlines`. The artifact digest is of collapsed spaces, not of LF-normalized text. `normalizeNewlines` then sees no carriage returns. `hash-newlines.spec.ts` shows `computeArtifactHash('alpha\r\nbeta\r', sha256)` equals `computeArtifactHash` of the LF string because both collapse to `alpha beta`, not because both stay `alpha\nbeta\n`. `sha256` of that LF string is a different value (`LF_DIGEST` in that test).

**Discrepancies**

1. Binary content is specified as not newline-normalized. `NodeContentHasher` and `sha256` always normalize. No binary branch exists.
   - Spec correct, code wrong: a binary payload passed as a string loses `\r\n`.
   - Code correct, spec wrong: the port is `hash(content: string)` and every string is text. The binary sentence describes a case the API cannot express.

2. Artifact text hashes do not digest newline-normalized text.

   The change's text-hash requirement says the digest is computed from `\r\n` / `\r` rewritten to `\n`. `computeArtifactHash` collapses all whitespace first, so `a\nb` and `a b` hash the same, and the newline helper does not see the line endings.
   - Spec correct, code wrong: drop the unconditional `\s+` collapse, or run `normalizeNewlines` on the raw text and keep cleanup rules for schema substitutions only.
   - Code correct, spec wrong: pre-hash cleanup has always collapsed whitespace, and newline normalization was only required for `NodeContentHasher` and `sha256`. The artifact helper matching CRLF to LF is accidental. The content-hasher spec would then not govern `computeArtifactHash`.

   `NodeContentHasher` itself matches the newline rule. This discrepancy is the artifact helper the change wired into the same requirement.

3. Same architecture import as refresh: `compute-artifact-hash.ts` (application) imports `normalizeNewlines` from infrastructure with `eslint-disable no-restricted-imports`. Domain `hashFiles` does not import it. See the architecture note on `core:refresh-implementation-tracking`.

**Test coverage**

`hash-newlines.spec.ts`: `sha256` and `NodeContentHasher` map `alpha\r\nbeta\r` to the known LF digest `sha256:e49c81e2d2f84e259d40e2fb8192f3bcd198b355184845d76d8f58807d0d78ee`. The artifact assertion only compares the helper to itself.

**Missing tests**

- Binary bytes that contain `\r\n` stay unnormalized (no implementation to test against).
- `computeArtifactHash` of LF text equals `sha256` of that same LF text, or an explicit assertion that whitespace collapse is required. The current test does not show which transform ran.

Requirements checked: 2. Discrepancies: 3. Missing tests: 2.

---

### core:snapshot-hasher

**Requirements checked**

- The same path hashes the same after `\r\n` and `\r` become `\n`. Binary file content is not newline-normalized.
- Content that differs only in whitespace hashes differently. Path keys are unchanged. Empty input and empty content behave as specified.

**Implementation status**

`hashFiles` copies each path and calls `hashContent(content)` with the original string. It does not normalize and it does not branch on binary. CRLF equality holds only when the callback is `NodeContentHasher` or `sha256`. Whitespace-only differences stay different, which matches this spec and does not match `computeArtifactHash`.

**Discrepancies**

1. `hashFiles` does not perform the normalization the requirement assigns to the snapshot hasher, and it has no binary exception.
   - Spec correct, code wrong: `hashFiles` should normalize text before `hashContent`, and should leave binary content alone. A callback that hashes raw strings breaks the CRLF scenario.
   - Code correct, spec wrong: the spec dependency says newline normalization lives in `core:content-hasher-port`, and `hashFiles` is only the map. Tests already pass `NodeContentHasher`. The binary sentence has nowhere to land on a `Record<string, string>` API.

   This is the same binary gap as the content hasher, plus a split about which function must call `normalizeNewlines`.

**Test coverage**

`hash-files.spec.ts` covers empty input, format, determinism, whitespace-only difference (`content` vs `content `), path keys, and empty content. It does not cover CRLF vs LF. `hash-newlines.spec.ts` does not call `hashFiles`.

**Missing tests**

- Snapshot scenario: the same text path with `\r\n` and with `\n` yields one digest through `hashFiles`.
- Binary content containing `\r\n` is not rewritten.

Requirements checked: 2. Discrepancies: 1. Missing tests: 2.

---

### Globals

**default:\_global/architecture**

Domain services touched here (`hashFiles`, `applyPreHashCleanup`) do not import infrastructure and do not do I/O. Path helpers live in `infrastructure/fs/path-platform.ts`. The contradiction is the two application imports named under refresh and content-hasher. Composition (`createDefaultConfigLoader`) is allowed to see the VCS adapter.

**default:\_global/testing**

The global spec requires infrastructure integration tests to use `os.tmpdir()` plus a unique directory, cleaned up afterward. It does not mention `chmod`. `move-dir.spec.ts`, `write-atomic.spec.ts`, and `ensure-tmp-gitignore.spec.ts` use `os.tmpdir()` / `mkdtemp` and remove the directory. A search of `packages/**` tests found no `chmod` and no `0o000`. That matches the change design's Windows unreadable-file rule. Hardcoded `/tmp/...` strings remain in unit mocks and error fixtures; they are not temp directories created for adapter I/O.

**default:\_global/conventions**

No requirement in the conventions spec contradicts these path, hash, or retry deltas.

---

## Batch counts

| Spec                                 | Requirements checked | Discrepancies | Missing tests |
| ------------------------------------ | -------------------: | ------------: | ------------: |
| core:config-loader                   |                    4 |             0 |             4 |
| core:vcs-adapter                     |                    4 |             0 |             1 |
| core:file-reader-port                |                    2 |             0 |             0 |
| core:fs-change-repository            |                    4 |             0 |             2 |
| core:fs-spec-repository              |                    3 |             1 |             2 |
| core:fs-archive-repository           |                    1 |             0 |             2 |
| core:refresh-implementation-tracking |                    2 |             2 |             1 |
| core:content-hasher-port             |                    2 |             3 |             2 |
| core:snapshot-hasher                 |                    2 |             1 |             2 |
| **Total**                            |               **24** |         **7** |        **16** |

Confirmed spot checks:

- `windowsHide` is conditional on `win32` in all three `exec.ts` files. No test.
- `moveDir` copies on `EPERM` and `EXDEV`. Only `EXDEV` is tested.
- `normalizeNewlines` runs inside `sha256` and `NodeContentHasher` before the digest. `computeArtifactHash` runs `applyPreHashCleanup` first, and that helper collapses all whitespace, so carriage returns never reach `normalizeNewlines` on the artifact path. `hashFiles` does not collapse whitespace and does not normalize unless the callback does.
- `retryOnLock` is five attempts, delays 50/100/150/200, codes `EPERM` / `EBUSY` / `EACCES`, then the original error. Tests cover five `EBUSY` attempts only.

# Spec compliance audit — hooks and device names

Change: `windows-platform-compatibility`
Scope: requirements this change added for verbatim `run:` substitution, host quote translation, and Windows device names. Historical requirements were left alone unless a delta line contradicts them.
Sources: `changes spec-preview` for the seven specs, plus `NodeHookRunner`, `translateHookCommand`, `TemplateExpander`, `isWindowsDeviceName`, `Change`, `SpecPath`, `FsConfigLoader`, and `docs/guide/workflow.md`.
Global checks: `default:_global/architecture` (domain has no I/O; spawn stays in infrastructure), `default:_global/conventions` (named ESM exports, no default export), `default:_global/docs` (workflow guide documents hook substitution).

## Cross-cutting

Behavior matches the contract. Developer `run:` values go through `TemplateExpander.expand()`. `NodeHookRunner.run()` then calls `translateHookCommand` and does not call `expandForShell`. `%` is not rewritten on that path. Windows spawn is `cmd.exe` with `['/d', '/s', '/c', command]`, `windowsVerbatimArguments: true`, and `windowsHide: true`. Other platforms spawn `$SHELL` when it is absolute, otherwise `/bin/sh`, with `['-c', command]`. There is no `execFile` shortcut. Device names are `con`, `prn`, `aux`, `nul`, `com1`–`com9`, and `lpt1`–`lpt9`, case-insensitive, whole segment only. `con-foo` stays legal.

Wording that still says "shell escaping" for developer hooks is stale. The code follows the verbatim requirement.

`default:_global/architecture`: `isWindowsDeviceName` is a pure domain function. `SpecPath` and `Change` call it without Node I/O. Quote translation and `spawn` live in infrastructure. Compliant.

`default:_global/conventions`: `translateHookCommand` and `isWindowsDeviceName` are named exports. No new default export. Compliant.

`default:_global/docs`: `docs/guide/workflow.md` documents verbatim `{{...}}` substitution, developer-written quotes, the quote-translation table (`sh` vs `cmd.exe`), that `%` is not rewritten, and that platform-specific commands belong in the developer's own script. That matches the new hook specs. Two wording gaps are listed under `core:template-variables` and `core:hook-runner-port`.

### core:hook-runner-port

**Requirements (this change).** Substituted `run:` values are inserted verbatim. Only string, number, and boolean values are substituted. The runner does not add quotes around a value. After substitution it translates quote syntax and does not rewrite `%`. On Windows, a single-quoted span, including `'\''`, becomes a double-quoted span; a `"` inside that span becomes `""`; a POSIX `\"` inside an existing double-quoted span becomes `""`; existing double quotes otherwise stay. Spawn is `cmd.exe` with `/d /s /c`, verbatim arguments, and a hidden console. On every other platform, a `""` pair inside a double-quoted span becomes `\"` when a closer still follows; an empty `""` stays empty; single-quoted spans stay single-quoted; spawn is the POSIX shell with `-c`. Program names, flags, and pipes are not translated. The runner does not use `execFile` to skip the shell. `expandForShell()` stays for commands SpecD builds; this port points at `core:template-variables` for that split.

**Implementation.** `NodeHookRunner.run()` expands with `expand()`, then `translateHookCommand(..., win32 ? 'cmd' : 'posix')`, then `spawnHook`. `toCmdQuotes` / `toPosixQuotes` implement the quote rules above, including `'\''` and `hasCloserAfterPair` so `echo ""` is not rewritten. `%` is copied through. `spawnHook` matches the Windows argv and options. Non-Windows uses absolute `$SHELL` or `/bin/sh` with `-c`. No `execFile`. No `expandForShell`.

**Discrepancies.** None in behavior. The guide says macOS and Linux run the hook with `sh`. The runner uses absolute `$SHELL` when set, and `/bin/sh` otherwise. The spec's "POSIX shell with `-c`" matches the runner. `default:_global/docs` requires the workflow guide to stay in parity with core, so the guide's bare `sh` is slightly behind the runner. Spawn flags (`/d /s /c`, verbatim arguments, hidden console) are not user-guide text; the guide's `cmd.exe` wording is enough for the documented contract.

**Test coverage.** `translate-hook-command.spec.ts` covers single-quoted paths, assembled double-quoted paths, `"` inside single quotes, `'\''`, POSIX `\"` to cmd `""`, `%` left alone, empty `''` to `""`, unclosed single quotes, cmd `""` to `\"`, empty `echo ""`, a trailing literal quote, single quotes kept on POSIX, and `%` on POSIX. `hook-runner.spec.ts` runs real shells for a developer-quoted value `a b %PATH% &` (no extra quotes), a composed `{{project.root}}/{{change.name}}` path, and `printf %s "Resultado: ""listo"""` becoming `Resultado: "listo"`.

**Missing tests.** Nothing asserts `cmd.exe`, `/d /s /c`, `windowsVerbatimArguments`, or `windowsHide`, or that `run()` selects the `cmd` dialect when `process.platform === 'win32'`. Those branches are source-only. Windows quote scenarios are covered on the pure translator, not through `NodeHookRunner`.

### core:template-variables

**Requirements (this change).** In `run:` commands, values are inserted verbatim. SpecD does not add quotes. Several variables inside one pair of quotes stay one string: `mkdir "{{project.root}}/{{change.name}}"` with `/repo` and `add-auth` becomes `mkdir "/repo/add-auth"`. `expandForShell()` remains for a command SpecD builds. POSIX uses single quotes and `'\''`. The `cmd.exe` dialect turns an empty value into `""`, replaces `%` with `%%` and `"` with `""`, then wraps the value in double quotes. `HookRunner` must not use `expandForShell()` for a developer `run:` hook. `instruction:` text stays verbatim, with no shell escaping and no quote translation. `expand()` is the method `HookRunner` uses for developer commands.

**Implementation.** `expand()` calls `_replace(..., false)` and returns the primitive as text. `expandForShell()` passes `'posix'` or `'cmd'` into `shellEscape`, which matches the POSIX and cmd dialects in the spec, including empty cmd `""` and `%` → `%%`. Production callers of `expandForShell` are none. `HookRunner` calls `expand()` only. Quote translation is not done here; the spec assigns that to the runner. Instruction expansion uses the same `expand()` path.

**Discrepancies.** Behavior matches. JSDoc does not. `expand()` still says it is for instruction text with no shell escaping. `expandForShell()` still says it is used for `run:` hook commands so values are shell-escaped against injection. That contradicts this requirement. `default:_global/docs` still says guides must document template substitution "including shell escaping for `run:` commands." The workflow guide documents verbatim substitution and quote translation, which matches this spec and the runner. The docs spec sentence was not updated with the hook delta.

**Test coverage.** `expandForShell` tests cover POSIX `'it'\\''s-fine'`, cmd quoting of `a b %PATH% &` as `"a b %%PATH%% &"`, and an empty cmd value as `""`. `expand()` tests cover ordinary tokens, unknown tokens, builtins winning, and non-primitives left unexpanded.

**Missing tests.** No `expand()` test for the composed-path scenario (`mkdir "{{project.root}}/{{change.name}}"` → `mkdir "/repo/add-auth"`). No `expand()` test that `it's-a-test` stays unescaped. The composed path and a spaced `%PATH%` value are covered in `hook-runner.spec.ts` instead. No test states that `HookRunner` does not call `expandForShell` (the runner tests show the observable result).

### core:hook-execution-model

**Requirements (this change).** Before a `run:` hook runs, `HookRunner` expands `{{key.path}}` variables. Substituted values are inserted verbatim. The developer writes any quotes. Host-shell quote translation is defined by `core:hook-runner-port`. Verify: `mkdir "{{project.root}}/{{change.name}}"` becomes `mkdir "/repo/add-auth"` with no extra quotes around either value.

**Implementation.** The model does not expand commands itself. `RunStepHooks` passes `hook.command` and `{ change: { name, path } }` into `HookRunner.run()`. `NodeHookRunner` performs verbatim expansion and quote translation. `{{change.workspace}}` is still not injected. That older rule is unchanged and still holds in `RunStepHooks`.

**Discrepancies.** The requirement text matches the runner. The constraints section of the same spec still says "Template variable expansion and shell escaping are handled by `HookRunner`." "Shell escaping" contradicts the new verbatim sentence in the same spec. Implementation follows the requirement, not that constraint.

**Test coverage.** The composed-path outcome is tested on `NodeHookRunner` (`printf %s "{{project.root}}/{{change.name}}"` → `/my/project/add-auth`). Unknown tokens and plain `{{change.name}}` expansion have existing runner tests.

**Missing tests.** No execution-model or `RunStepHooks` test uses the verify fixture `mkdir "{{project.root}}/{{change.name}}"`. Coverage is on the runner, not on this spec's caller.

### core:run-step-hooks

**Requirements (this change).** `HookRunner` expands developer `run:` commands with `TemplateExpander.expand()` and then translates quote syntax. `RunStepHooks` does not call the expander. It builds `TemplateVariables` and passes them to `HookRunner.run()`. Verify: for `echo "Resultado: {{change.name}}"`, the command string still contains the developer quotes around `{{change.name}}`, and `RunStepHooks` does not call `expandForShell()`.

**Implementation.** `execute` sets `variables` to `change.name` and `change.path` from the repository. `_executeHooks` calls `this._hooks.run(hook.command, variables, relayRunnerProgress)` for `run:` entries. The command argument is the schema string, quotes included. There is no expander import and no `expandForShell` call in this use case.

**Discrepancies.** None.

**Test coverage.** Existing `run-step-hooks` tests cover dispatch, progress, and failure semantics. They do not assert this delta.

**Missing tests.** No test that a quoted `run:` command is forwarded with its quotes intact, and no test that this use case never calls `expandForShell`.

### core:change

**Requirements (this change).** A slug that is a Windows device name is rejected on every operating system. Reserved names: `con`, `prn`, `aux`, `nul`, `com1` through `com9`, `lpt1` through `lpt9`, case-insensitive, whole slug. `con-foo` stays legal when it matches the existing slug pattern. Verify: `con` rejected; `con-foo` accepted.

**Implementation.** `Change` constructor rejects when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName(props.name)` is true, with the existing invalid-name error. The predicate is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i` and does not read `process.platform`. The slug pattern is lowercase kebab-case, so `CON` is already illegal as a name; `con` and `com1` match the pattern and are rejected by the predicate. `con-foo` matches the pattern and is not a device name.

**Discrepancies.** None. Whole-slug matching means `con.txt` is not treated as `con`. That matches the spec (only the whole slug).

**Test coverage.** `windows-device-name.spec.ts`: `con`, `NUL`, `com1`, `lpt9` true; `con-foo` false. `change-device-name.spec.ts`: `con` and `com1` throw `InvalidChangeError`; `con-foo` is accepted.

**Missing tests.** Change tests do not list `prn`, `aux`, `nul`, or `lpt1`. Case-insensitivity is on the predicate (`NUL`), not on `Change` (uppercase already fails the slug pattern). No OS matrix; the check is platform-independent, so that is acceptable.

### core:workspace

**Requirements (this change).** Reserved workspace names include Windows device names, same set, rejected on every OS when the whole name is the device name. `con-foo` stays legal. `default` and `root` stay reserved. Verify: `nul` rejected; `con-foo` accepted and `default` / `root` stay reserved.

**Implementation.** `FsConfigLoader._buildConfig` calls `isWindowsDeviceName(name)` for each workspace key and throws `ConfigValidationError` (`Windows device name`). `default` is still required. `root` is still rejected before the device check. The name pattern remains `/^[a-z][a-z0-9-]*$/`, so `con-foo` is a legal name and is not a device name. The predicate does not depend on the host OS.

**Discrepancies.** None in behavior. Rejection lives in the config loader, which is the workspace-name boundary. The domain predicate has no I/O, so architecture still holds.

**Test coverage.** `config-loader.spec.ts` rejects a workspace named `con` with `/Windows device name/`. Existing tests still reject a missing `default` and a workspace named `root`.

**Missing tests.** No test that `con-foo` is accepted. The verify fixture is `nul`; the test uses `con`. Same predicate, different sample. No test that `prn`, `aux`, `com1`, or `lpt9` are rejected as workspace names.

### core:spec-id-format

**Requirements (this change).** A capability-path segment that is a Windows device name is rejected on every OS. Same reserved set, case-insensitive, whole segment. `con-foo` stays legal. A Windows drive letter is not a workspace name; spec IDs are not filesystem paths. Verify: a segment `com1` is rejected; a segment `con-foo` is accepted.

**Implementation.** `SpecPath._validateSegments` throws `InvalidSpecPathError` when `isWindowsDeviceName(segment)` is true, for `parse` and `fromSegments`. `con-foo` does not match. `parseSpecId` only splits on the first `:`. It does not apply the device rule. Callers that validate a capability path (`SpecPath.parse` in create-change existence checks, persisted depends-on, archive, compile-context, and the other use cases that resolve a cap path) hit the rejection. `Change` still stores `specIds` as strings and does not parse them in the constructor; the next `SpecPath.parse` rejects `com1`.

**Discrepancies.** None against the verify wording ("when the ID is validated"). The check is on the capability-path value object, not on the colon split. That matches "spec IDs are not filesystem paths" and keeps the drive-letter rule out of workspace parsing.

**Test coverage.** `spec-path.spec.ts` rejects `con` and `auth/com1`, and accepts `con-foo`.

**Missing tests.** No spec-id test through `parseSpecId` (it is not supposed to reject). No `SpecPath` case for `NUL` / `COM1` (case is tested on the predicate). No test that a workspace named like a drive letter is still a workspace parse, not a device-name failure. That sentence is a non-goal relative to path parsing and has no fixture.

## Counts

- Specs audited: 7
- Focus requirements: 7 (one added requirement block per spec)
- Implementation compliant: 7
- Behavioral discrepancies: 0
- Wording discrepancies: 3
  1. `core:hook-execution-model` constraint still says HookRunner does "shell escaping"
  2. `TemplateExpander` JSDoc still says `expandForShell` is for `run:` hooks and `expand` is only for instruction text
  3. `default:_global/docs` still requires documenting "shell escaping for `run:` commands", and `docs/guide/workflow.md` says non-Windows hooks run with `sh` while the runner uses absolute `$SHELL` or `/bin/sh`
- Missing-test gaps: 4
  1. Windows spawn options and win32 dialect selection are untested on `NodeHookRunner`
  2. `expand()` has no composed-path or apostrophe verbatim test (runner covers the composed path)
  3. `RunStepHooks` has no test that developer quotes are forwarded and `expandForShell` is not called
  4. Workspace `con-foo` acceptance is untested (`con` rejection is tested; verify names `nul`)

# Partial audit: code-graph Windows requirements

Change: `windows-platform-compatibility`
Scope: Windows deltas only, from `changes spec-preview` for:

- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`
- `code-graph:indexer`
- `code-graph:workspace-integration`

Historical requirements in those specs were not re-audited. Graph search/impact ran first. `graph search` reported `CONTENT_KNOWN_STALE`. Impact on `toPortableGraphPath` returned only its definition, so call sites were confirmed by reading the files the graph had already located.

The local CLI copy of the drive-letter split in `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts` matches `splitWorkspaceIdentity` (drive letter returns null, otherwise first colon, `index <= 0` returns null). That duplication is not a violation.

---

### code-graph:sqlite-graph-store

#### Requirements

`Locked recreation preserves the index lease` (spec.md and verify.md from this change):

- When `recreate()` deletes the SQLite database or a WAL sidecar and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
- `recreate()` must not delete a live `index.lock`. A lock held by a running index survives database recreation.
- Scenario: a locked WAL file that keeps failing with `EBUSY` surfaces the original error after retries.
- Scenario: a live `index.lock` is still present after `recreate()` removes the database files.

Design/task detail used only to interpret "bounded": five attempts, delays 50/100/150/200 ms, same codes as `retryOnLock`. `@specd/core` does not export that helper, so a local copy is intended.

#### Implementation status

Compliant in both recreate implementations.

`packages/code-graph/src/infrastructure/storage-generation.ts` `retryLocked` and `retryLockedAsync`:

- `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`.
- Loop runs attempts 0 through 4 (five tries).
- On a lock error at attempts 0–3 it waits `RETRY_DELAYS_MS[attempt]` (50, 100, 150, 200 ms) and retries.
- On attempt 4 (`attempt === RETRY_DELAYS_MS.length`) it rethrows the caught error unchanged.
- Any other error is rethrown immediately.
- Sync wait uses `Atomics.wait`; async wait uses `setTimeout`.

`SQLiteGraphStore.recreate()` (`sqlite-graph-store.ts` 749–761) rejects when the client is open, then `retryLockedAsync` + `rm(..., { force: true })` for `code-graph.sqlite`, `-wal`, and `-shm` only, then rotates the storage generation.

`SQLiteGraphDatabase.recreate()` (`sqlite-graph-database.ts` 354–368) does the same trio with synchronous `retryLocked` + `rmSync`. Neither path names `graph/index.lock`.

#### Discrepancies

None in the recreation behavior against this requirement. The local retry copy is the design, not drift.

Either reading of the retry budget matches: five attempts, then the original lock error, not a wrapped error.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts` (`creates sqlite schema artifacts under graph/ and recreates backend state destructively`) writes `graph/index.lock` with contents `lease\n`, calls `store.recreate()`, and expects:

- `code-graph.sqlite` absent
- `storage.epoch` still present
- `index.lock` still present

That covers "A live index lock is not deleted" for `SQLiteGraphStore.recreate()`. `sqlite-worker-lifecycle.spec.ts` checks closed recreate removes data and does not leave the reopened store holding the old file. It does not assert `index.lock`.

#### Missing tests

"A locked WAL file surfaces the original error after retries" has no test that forces `EBUSY` (or `EPERM` / `EACCES`). A search of `packages/code-graph/**/*.spec.ts` finds no `EBUSY` and no `retryLocked` assertion. The only `EACCES` hit is an unrelated health-check stub in `get-graph-health.spec.ts`.

Also untested:

- `SQLiteGraphDatabase.recreate()` lock preservation (same suffix list, no direct test).
- Immediate throw for a non-lock code such as `ENOENT` from a non-force failure.
- That the surfaced error is the same object/code after five failures, not a new error.

---

### code-graph:isolated-index-worker

#### Requirements

`Index lease release on exit`:

- The process that holds the index lease must release it on process exit.
- On Windows it must also release the lease on `SIGBREAK`.
- Releasing on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` must not leave the lease held after exit.
- Scenario: process exit releases the lease.
- Scenario: `SIGBREAK` on Windows releases the lease.

`Signal forwarding and cleanup` still requires `SIGINT` and `SIGTERM` forwarding and does not mention `SIGBREAK`. The change design also forwards `SIGBREAK` to the child. That extra forward is consistent with the design and is not forbidden by the signal-forwarding requirement.

#### Implementation status

Compliant.

`supervisor.ts`:

- `ParentSignal` is `'SIGINT' | 'SIGTERM' | 'SIGBREAK'`.
- Listeners are installed for `SIGINT`, `SIGTERM`, `SIGBREAK`, and `exit`.
- `finalize()` removes those four listeners and calls `lease.release()` once per finalize.
- `onProcessExit` calls `lease.release()`.
- `onSigbreak` calls `lease.release()` and then `forwardSignal('SIGBREAK')`, which `child.kill`s `SIGBREAK`.
- `SIGINT` / `SIGTERM` only forward; release still happens in `finalize()` after the child settles.

`acquireGraphIndexLockLeaseByStoragePath` `release()` is idempotent (`released` flag) and deletes the lock file only when the owner token still matches. A second release from `exit` or `finalize()` after `SIGBREAK` does not throw or delete another process's lock.

`createNodeIsolatedGraphIndexRunner` acquires the lease with `signalCleanup: 'exit-only'`, so the lease helper itself does not install `SIGINT`/`SIGTERM` process-exit killers. The supervisor owns those signals. The lease helper still registers the real `process` `exit` listener, which also releases.

#### Discrepancies

None against the requirement text. `SIGBREAK` is handled on every platform, not only `win32`. The requirement says Windows must release on `SIGBREAK`; it does not forbid the same handler elsewhere.

`SIGBREAK` drops the lease before the child has exited, then forwards the signal. The scenario only requires release when `SIGBREAK` is received. The earlier release is what the requirement asks for. `SIGINT`/`SIGTERM` still wait for child termination before `finalize()` releases.

#### Test coverage

`packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts` `releases the lease on SIGBREAK and process exit`:

- Starts a run with the real `acquireGraphIndexLockLeaseByStoragePath` (`exit-only`) and a fake child.
- Emits `SIGBREAK` on the injected process emitter. That runs `onSigbreak` synchronously, which calls `lease.release()` before the following `exit` emit.
- Asserts `child.kill` was called with `SIGBREAK`.
- Emits child `exit` with signal `SIGBREAK` and expects `GraphIndexWorkerSignalError`.
- Asserts `SIGBREAK` and `exit` listener counts are 0.
- Asserts a second `acquireLock` does not throw, which means the lock file was removed.

So "SIGBREAK releases the lease" is implemented and the test does force the `SIGBREAK` handler to release. It is not a Windows-platform-gated test; the handler is unconditional, so the fake emitter is enough.

#### Missing tests

No separate test emits only `exit` or only `SIGBREAK`. Both scenarios are one test. Because `release()` is idempotent and `SIGBREAK` is emitted first, the passing assertion does not by itself show which handler deleted the file. The source order makes `SIGBREAK` the one that deletes it.

No test checks that a `SIGBREAK` release is a no-op when the lock token no longer matches, or that `SIGTERM` still releases only after child termination when `SIGBREAK` was not used.

---

### code-graph:indexer

#### Requirements

`Portable graph paths`:

- Relative paths persisted by the indexer must use `/`. That conversion must not collapse `.` or `..`.
- A key matching `^[A-Za-z]:[/\\]` must not be split into a workspace name and a path. The drive letter stays in the path.
- Scenario: `C:/repo/src/a.ts` does not yield workspace `C`.
- Scenario: persisted `src\..\secret` is stored as `src/../secret`.

#### Implementation status

The designated helpers comply. Not every indexer identity split uses them.

`split-workspace-identity.ts`:

- `isDriveLetterPath` is `/^[A-Za-z]:[/\\]/`.
- `splitWorkspaceIdentity` returns null for a drive letter, otherwise splits on the first colon, and returns null when the colon is missing or at index 0.
- `toPortableGraphPath` is `value.replaceAll('\\', '/')` only. It does not call `path.normalize` or `path.posix.normalize`.

`index-code-graph.ts` uses those helpers:

- `relativeIdentityPath` / `workspaceIdentityName` go through `splitWorkspaceIdentity`. A drive-letter key stays intact (`relativePath` falls back to the original string; workspace falls back to `''`, which is not `C`).
- Config-relative paths and the code-root containment check pass through `toPortableGraphPath`.
- Workspace file identities are `` `${ws.name}:${relPath}` ``. `discoverFiles` already replaces `\` with `/` via `relative(...).replaceAll('\\', '/')`. `createFileNode` normalizes with the same slash replace and does not collapse `.` or `..`.

`path.relative` (used inside `discoverFiles` and before some `toPortableGraphPath` calls) resolves real absolute paths, so a file that is physically `secret` is not stored as `src/../secret`. That is path resolution from two absolute paths, not the separator conversion. The separator conversion itself does not collapse dot segments.

#### Discrepancies

Primary indexer identity helpers match both scenarios. These extraction/lookup splits still take the first colon and will treat a drive letter as a workspace when given a key such as `C:/repo/src/a.ts`:

| Location                                                     | Behavior on `C:/repo/src/a.ts`                                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scoped-binding-environment.ts` `extractWorkspacePrefix`     | Prefix `C:` for symbol lookup                                                                                                                                         |
| `typescript-language-adapter.ts` `resolveRelativeImportPath` | Workspace prefix `C:`, relative path `/repo/src/a.ts`                                                                                                                 |
| `python-language-adapter.ts` `resolveRelativeImportPath`     | Same first-colon split                                                                                                                                                |
| `php-language-adapter.ts` `splitWorkspacePath`               | Colon index `> 0` and path does not start with `/`, so prefix `C:` and path `/repo/src/a.ts`                                                                          |
| `go-language-adapter.ts` `goPackageSurface`                  | If the path has no `/`, the first colon becomes the package surface prefix. `C:/...` has a slash, so this one returns the directory and does not use the drive letter |

The change task says indexer persistence and workspace-integration parsing should call `splitWorkspaceIdentity`. Those named paths do. The requirement text is broader: any key that begins with a drive letter must not be split into a workspace and a path. The adapter and binding-environment splits still do that.

Two readings:

- Spec drift relative to the task list: only the named persistence/identity helpers were in scope, and those comply.
- Implementation gap relative to the requirement sentence: indexing still splits drive-letter keys inside extraction and scoped binding.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/split-workspace-identity.spec.ts`:

- `C:/repo/src/a.ts` is a drive letter and `splitWorkspaceIdentity` returns null.
- `c:\repo\src\a.ts` is a drive letter (predicate only; split null is not repeated for the backslash form).
- `core:src/../secret` keeps `..` in `relativePath`.
- `toPortableGraphPath('src\\..\\secret')` is `src/../secret`.
- `src/a.ts` (no colon) returns null.

That is direct coverage of both indexer scenarios at the helper. No `IndexCodeGraph` test persists `src\..\secret` or feeds `C:/repo/src/a.ts` through discovery.

#### Missing tests

- Indexer persistence of a backslash path that contains `..`, through `IndexCodeGraph` or `createFileNode`, not only `toPortableGraphPath`.
- `splitWorkspaceIdentity('c:\\repo\\src\\a.ts')` is null (regex is shared with the predicate, so this is a small gap).
- Drive-letter keys through `extractWorkspacePrefix` and the TypeScript/Python/PHP relative-import splits.
- A workspace-prefixed path whose relative segment contains a colon is only split on the first colon. The spec does not require otherwise.

---

### code-graph:workspace-integration

#### Requirements

`Drive letters are not workspace names`:

- Parsing a graph identity must not treat a Windows drive letter as a workspace name.
- A string matching `^[A-Za-z]:[/\\]` is a drive-letter path.
- The character before the first `:` must not become `{workspaceName}`.
- Scenario: `C:/repo/src/a.ts` does not use workspace `C`, and the drive letter stays part of the path.

`matches-exclude` `extractWorkspace` was checked against the stated rule: a drive letter returns null; a path with no colon returns the whole path.

#### Implementation status

`splitWorkspaceIdentity` matches the scenario: null for `C:/...` and `C:\...`, so callers that use `?.workspace` do not assign `C`. The drive-letter string remains the path when the caller falls back to the original value (`relativeIdentityPath`).

`matches-exclude.ts` `extractWorkspace`:

- `/^[A-Za-z]:[/\\]/` returns null.
- No colon returns the whole path (`idx === -1`).
- A leading colon (`idx === 0`) returns null.
- Otherwise the prefix before the first colon is the workspace.
- `matchesExclude` only treats that result as a workspace exclusion when it is non-null, so `C:/repo/src/a.ts` is not excluded as workspace `C`.

`resolve-impact-file-selectors.ts` local `splitWorkspaceIdentity` has the same drive-letter null and first-colon behavior. `toGraphDisplayPath` returns the original canonical path when the identity is null, so `C:/repo/src/a.ts` is not displayed as workspace `C`.

#### Discrepancies

The helper and `matches-exclude` match the requirement. Other workspace-prefix parsers do not:

- `compute-hotspots.ts` `extractWorkspace` is `indexOf(':')` with no drive-letter guard. On `C:/repo/src/a.ts` the workspace is `C`. Callers at lines 144–145 use that to classify same-workspace versus cross-workspace callers. Two drive-letter files compare equal as workspace `C` even when they are not the same workspace. A drive-letter file versus `core:...` is counted as cross-workspace.
- `sqlite-graph-database.ts` around line 1476: an inclusion filter uses `row.file_path.startsWith(options.workspace + ':')`. Workspace `C` matches `C:/repo/src/a.ts`. The exclude path just below uses `splitWorkspaceIdentity` and does not. Inclusion and exclusion disagree for the same drive-letter key.
- CLI display splits in `impact.ts`, `search.ts`, and `hotspots.ts` still take the first colon. They are outside the code-graph helpers. A drive-letter `filePath` would be labeled workspace `C` in those commands. The impact-file selector copy is the one that was updated and is not a violation.

`matches-exclude` returning the whole path when there is no colon is the requested behavior. `compute-hotspots` has a separate `extractWorkspace` with the same no-colon fallback but without the drive-letter null. That second function is the discrepancy.

#### Test coverage

`matches-exclude.spec.ts` covers the no-colon rule: `matchesExclude('standalone', undefined, ['standalone'])` is true, and a different name is false. It does not cover a drive letter.

`split-workspace-identity.spec.ts` covers the scenario `C:/repo/src/a.ts` → not a workspace. No CLI test covers the local selector copy. No hotspot test feeds a `C:/` symbol path.

#### Missing tests

- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false, and `matchesExclude('C:\\repo\\src\\a.ts', undefined, ['C'])` is false.
- `computeHotspots` does not count `C` as the workspace of a drive-letter `filePath`.
- SQLite symbol search with `workspace: 'C'` does not return `C:/repo/...` rows.
- CLI `toGraphDisplayPath` leaves `C:/repo/src/a.ts` unchanged. Behavior matches; there is no test.

---

## Summary counts

Windows requirement headings audited: 4
Behavioral clauses: 8

| Spec                               | Clauses                                                       | Implementation                                                                                               | Discrepancies                                                   | Scenario tests                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `code-graph:sqlite-graph-store`    | 2                                                             | Both met (`retryLocked` / `retryLockedAsync` and both `recreate()` methods)                                  | 0                                                               | Live `index.lock` covered. Locked WAL `EBUSY` not covered                                                                        |
| `code-graph:isolated-index-worker` | 3 (exit, `SIGBREAK`, `SIGTERM` still released when delivered) | Met. `SIGBREAK` releases and forwards. `exit` releases. Release is idempotent                                | 0                                                               | `SIGBREAK` and exit covered in one test. `SIGBREAK` handler does release                                                         |
| `code-graph:indexer`               | 2                                                             | Helpers met. Adapter and scoped-binding splits still take the first colon                                    | 1 residual split set                                            | Both scenarios covered on `splitWorkspaceIdentity` / `toPortableGraphPath` only                                                  |
| `code-graph:workspace-integration` | 1                                                             | `splitWorkspaceIdentity` and `matches-exclude` met. Hotspot extract and SQLite workspace `startsWith` do not | 1 residual split set (same drive-letter hole, extra call sites) | Drive-letter scenario covered on the helper. `matches-exclude` drive letter not covered. No-colon whole-path behavior is covered |

Totals:

- Requirements (headings): 4
- Clauses checked: 8
- Clauses whose named implementation matches: 8
- Discrepancy groups: 2 (indexer extraction/binding first-colon splits; workspace hotspot extract plus SQLite inclusion `startsWith`). CLI selector duplication is not one of them.
- Spec scenarios: 7
- Scenarios with a test that exercises the behavior: 6
- Scenarios with no forcing test: 1 — "A locked WAL file surfaces the original error after retries" (no `EBUSY` injection)
- "A live index lock is not deleted": tested on `SQLiteGraphStore.recreate()`
- "SIGBREAK releases the lease": tested; the test also emits `exit`, and `SIGBREAK` runs first and calls `lease.release()`

# Partial audit: CI and testing

Change: `windows-platform-compatibility`
Specs: `default:_global/continuous-integration`, `default:_global/testing`
Mode: read-only. Sources: `specd changes spec-preview` plus the working tree (uncommitted). Graph index was stale; navigation used the listed files and targeted searches. No code or spec files were modified.

Checked artifacts:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitattributes`
- root `package.json` (`test`, `preflight:test`, `lint-staged`, `typecheck`, `build`)
- `pnpm-workspace.yaml` `onlyBuiltDependencies`
- `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
- suite scan for `chmod` / `0o000`, `/tmp`, `/var/www`, `file:///tmp/`, `os.tmpdir()` / `mkdtemp`, snapshots, Jest

---

### default:\_global/continuous-integration

#### Requirements

1. **Workflow file is tracked.** The repo must track `.github/workflows/ci.yml` without tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` stay ignored.
2. **Three operating systems.** The same job runs on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any runner fails the check.
3. **When the workflow runs.** Pull requests and pushes to `main`. It must not call Gemini workflows.
4. **Toolchain install.** Checkout, pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`. That install builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. No apt, brew, or Chocolatey packages.
5. **Checks.** Each job runs `pnpm typecheck`, `pnpm build`, then `pnpm test`. `typecheck` and `build` skip `@specd/public-web`. `pnpm test` includes `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and the five `@specd/plugin-agent-*` packages. It excludes `@specd/mcp` and `@specd/public-web`. No changeset status and no publish.

Related change contract (not separate CI requirements): `.gitattributes` is `* text=auto eol=lf` plus `*.md`, `*.yaml`, `*.yml`, `*.json` `eol=lf`. `lint-staged` typecheck is `pnpm typecheck`, not `bash -c`. `@ladybugdb/core` must not be restored to `onlyBuiltDependencies`; note if absent.

#### Implementation status

| Requirement              | Status                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workflow file is tracked | Met for ignore rules; file not in the index yet | `.gitignore` is `.github/*`, `!.github/workflows/`, `!.github/workflows/**`. `git check-ignore -q .github/workflows/ci.yml` exits 1 (not ignored). `git check-ignore -q .github/copilot-instructions.md` exits 0 (ignored by `.github/*`). `.agents/` and `skills-lock.json` stay ignored. `.github/workflows/` contains only `ci.yml`. `git status` shows `?? .github/` and `git ls-files` does not list it, so it is untracked until this change is committed. The verify scenario is about ignore evaluation, which passes. |
| Three operating systems  | Met                                             | `jobs.check.strategy.matrix.os` is `[macos-latest, ubuntu-latest, windows-latest]`. `runs-on: ${{ matrix.os }}`. Same steps on every OS. `fail-fast: false`. No `continue-on-error`. GitHub marks the workflow failed when any matrix job fails; `fail-fast: false` only lets the other jobs finish.                                                                                                                                                                                                                           |
| When the workflow runs   | Met                                             | `on.pull_request` (default activity, including open and synchronize) and `on.push.branches: [main]`. No `workflow_call`, no Gemini job, no Gemini file on disk.                                                                                                                                                                                                                                                                                                                                                                |
| Toolchain install        | Met                                             | Steps: `actions/checkout@v4`, `pnpm/action-setup@v4` version `10.6.5` (matches root `packageManager`), `actions/setup-node@v4` `node-version: 22` with `cache: pnpm`, `pnpm install --frozen-lockfile`. No apt, brew, or choco. `onlyBuiltDependencies` lists `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, `better-sqlite3`, `esbuild`, plus `core-js` and `core-js-pure`.                                                                                                                              |
| Checks                   | Met                                             | Job order is `pnpm typecheck`, `pnpm build`, `pnpm test`. Root `typecheck` and `build` use `--filter=!@specd/public-web`. Root `test` filters are exactly the twelve packages named in the spec. `@specd/mcp` and `@specd/public-web` are absent. `preflight:test` is `pnpm test`, so it inherits those filters. The workflow does not run changeset or publish (`preflight:changeset` remains a local script and is not a CI step).                                                                                           |
| `.gitattributes`         | Met (change contract)                           | `* text=auto eol=lf`, then `*.md`, `*.yaml`, `*.yml`, `*.json` with `text eol=lf`. New untracked file. No binary types marked as text.                                                                                                                                                                                                                                                                                                                                                                                         |
| `lint-staged`            | Met (change contract)                           | `*.ts` is `eslint --fix`, `prettier --write`, `pnpm typecheck`. No `bash -c` in `package.json` or `ci.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@ladybugdb/core`        | Note only                                       | Working-tree diff deletes `- '@ladybugdb/core'` from `onlyBuiltDependencies`. The name is absent from `pnpm-workspace.yaml`, root `package.json`, and `pnpm-lock.yaml`. It was not restored. The CI spec's native-module list does not include it.                                                                                                                                                                                                                                                                             |

#### Discrepancies

None against the five CI requirements.

Observations (not counted as discrepancies):

- `ci.yml` and `.gitattributes` are untracked. Ignore rules allow `ci.yml` to be added. Tracking in the index happens when the change is committed.
- `fail-fast: false` is allowed. The check still fails if the Windows job fails, because no step sets `continue-on-error`.
- Node is `22`, not a pinned `22.x.y`. The spec says Node 22.

`@ladybugdb/core` absence is recorded above and is not a miss against the listed native modules.

#### Test coverage

No Vitest (or other in-repo test) asserts the workflow, the gitignore negation, or the root script filters. Coverage is file inspection plus `git check-ignore`.

| Verify scenario                                 | Covered by                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Only workflows are re-included                  | `git check-ignore` on `ci.yml` (not ignored) and `copilot-instructions.md` (ignored) |
| One red runner fails the check                  | Workflow shape only. No `continue-on-error`. Not executed on GitHub in this audit    |
| Pull request starts the workflow / push to main | `on:` block. Not executed                                                            |
| Native modules come from pnpm install           | Step list plus `onlyBuiltDependencies`. Install was not run here                     |
| Three commands in order                         | Step order in `ci.yml`                                                               |
| `pnpm test` package set                         | Root `test` script string                                                            |

#### Missing tests

- No test that Git ignores `.github/copilot-instructions.md` and does not ignore `.github/workflows/ci.yml`.
- No test that `ci.yml` contains the three runners, the trigger set, the toolchain pins, and the command order.
- No test that a failed matrix job fails the workflow (GitHub aggregation).
- No test that root `test` / `preflight:test` filters match the spec package list and omit `@specd/mcp` and `@specd/public-web`.

#### Spec dependency chain

Depends on `default:_global/testing` (CI runs that Vitest suite). See the testing section: filesystem temp dirs sampled use `os.tmpdir()`, and `get-graph-health.spec.ts` does not use `chmod 0o000`. Hardcoded `/tmp` strings remain in other tests. If any of those strings are resolved as real paths, the Windows matrix job can fail for a reason the testing spec already forbids. Mocked string comparisons do not by themselves fail on Windows.

---

### default:\_global/testing

#### Requirements

1. **Test runner.** Vitest only. Tests live under package `test/`, mirroring `src/`, suffix `.spec.ts`.
2. **Unit tests for domain and application layers.** Every invariant-enforcing use case and entity method has a unit test. Ports are mocked. Unit tests do not touch the filesystem, network, or processes.
3. **Port mocks are typed.** Full port interface. No `{ ... } as unknown as Port`. Unused methods throw `new Error('not implemented')`.
4. **Integration tests for infrastructure adapters.** Real temp directories via `os.tmpdir()` plus a unique subfolder, removed after each test.
5. **Fixtures are valid on Windows.** Filesystem tests locate temp directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`. An unreadable file must not use `chmod 0o000` on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.
6. **Test naming.** `.spec.ts` matching the source name. Behaviour descriptions use `given / when / then`. Helpers are `setup<Thing>` / `cleanup<Thing>`.
7. **No snapshot tests.** No `toMatchSnapshot` or `toMatchInlineSnapshot`.

This change adds requirement 5. Requirements 1–4, 6, and 7 are the pre-existing conventions. They were spot-checked, not re-audited for every use case.

#### Implementation status

| Requirement                                         | Status                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test runner                                         | Met on spot check               | Root devDependency `vitest`. No `from 'jest'` under `packages/`. No `packages/**/src/**/*.spec.ts`. No `*.test.ts` under `packages/`.                                                                                                                                                                                                                                                                      |
| Unit tests for domain and application               | Not re-audited                  | Pre-existing. This partial did not enumerate every entity method.                                                                                                                                                                                                                                                                                                                                          |
| Port mocks are typed                                | Not met (standing)              | `as unknown as` appears in 67 `*.spec.ts` files. `get-graph-health.spec.ts`, which this change edits, still has 10 `as unknown as` casts, including `as unknown as CodeGraphHostPort` on the provider mock.                                                                                                                                                                                                |
| Integration temp dirs                               | Met for sampled creators        | `mkdtemp` / `mkdtempSync` hits use `os.tmpdir()` (`get-graph-health.spec.ts`, `move-dir.spec.ts`, `write-atomic.spec.ts`, sqlite store specs, isolated-worker specs). `get-graph-health` removes its temp root in `finally` via `rmSync`. Full adapter cleanup was not re-audited.                                                                                                                         |
| Fixtures are valid on Windows — temp dirs and chmod | Met for the change's named case | `get-graph-health.spec.ts` creates dirs with `mkdtempSync(join(tmpdir(), ...))`. Unreadable content is a `vi.mock` of `node:fs/promises` `readFile` that throws `EACCES` when the path is in `deniedReads`. Repo search found no `chmod`, `chmodSync`, or `0o000`. No `file:///tmp` or `/var/www` under `packages/**/*.{ts,js}`. Worker specs build module URLs with `pathToFileURL(join(tmpdir(), ...))`. |
| Fixtures are valid on Windows — hardcoded `/tmp`    | Partial                         | 29 `*.spec.ts` files still contain `'/tmp...'` string literals. Two test helpers pass `configPath: '/tmp'` into repository stubs (`packages/core/test/application/use-cases/helpers.ts`, `packages/code-graph/test/helpers/stub-change-repository.ts`). These are mocked paths and expected CLI arguments, not `mkdtemp('/tmp')`.                                                                          |
| Test naming                                         | Not re-audited                  | Suffix spot check found `.spec.ts` and no `.test.ts`. Description wording was not sampled.                                                                                                                                                                                                                                                                                                                 |
| No snapshot tests                                   | Met on search                   | No `toMatchSnapshot` or `toMatchInlineSnapshot` under `packages/**/*.spec.ts`.                                                                                                                                                                                                                                                                                                                             |

#### Discrepancies

**D1. Hardcoded `/tmp` strings remain after the Windows fixture requirement.**

- Spec: "Tests MUST NOT depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...` paths." Verify scenario: when a filesystem test creates a temporary directory, it is under `os.tmpdir()` and does not hardcode `/tmp` or `file:///tmp/`.
- Code: creating a temp directory uses `os.tmpdir()`. `/var/www` and `file:///tmp` are gone. `'/tmp/...'` remains in these spec files:
  - `packages/cli/test/commands/change.spec.ts`
  - `packages/cli/test/commands/change-create.spec.ts`
  - `packages/cli/test/commands/graph-hotspots.spec.ts`
  - `packages/cli/test/commands/graph-impact.spec.ts`
  - `packages/cli/test/commands/graph-index.spec.ts`
  - `packages/cli/test/commands/graph-search.spec.ts`
  - `packages/cli/test/commands/graph-stats.spec.ts`
  - `packages/cli/test/commands/schema-extend.spec.ts`
  - `packages/cli/test/commands/schema-fork.spec.ts`
  - `packages/cli/test/commands/schema-show.spec.ts`
  - `packages/code-graph/test/application/services/bootstrap-graph-config.spec.ts`
  - `packages/core/test/application/use-cases/archive-change.spec.ts`
  - `packages/core/test/application/use-cases/archive-change-batch-restore.spec.ts`
  - `packages/core/test/application/use-cases/get-active-schema.spec.ts`
  - `packages/core/test/application/use-cases/get-config.spec.ts`
  - `packages/core/test/application/use-cases/get-project-metadata.spec.ts`
  - `packages/core/test/composition/actor-resolver.spec.ts`
  - `packages/core/test/composition/kernel-get-config.spec.ts`
  - `packages/core/test/composition/use-cases/archive-change.spec.ts`
  - `packages/core/test/composition/use-cases/get-config.spec.ts`
  - `packages/core/test/composition/use-cases/update-implementation-tracking.spec.ts`
  - `packages/core/test/composition/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/node/hook-runner.spec.ts`
  - `packages/core/test/infrastructure/vcs-actor-resolver.spec.ts`
  - `packages/plugin-manager/test/application/install-plugin.spec.ts`
  - `packages/plugin-manager/test/application/update-plugin.spec.ts`
  - `packages/sdk/test/composition/host-context.spec.ts`
  - `packages/sdk/test/orchestration/run-index-project-graph.spec.ts`
  - `packages/skills/test/resolve-bundle.spec.ts`
- Both readings:
  - **Implementation gap:** task 9.5 and the requirement's second sentence say tests must not depend on hardcoded `/tmp`. These files still embed that prefix. CLI cases pass `--path /tmp/repo` into the program. If the code under test `path.resolve`s that string, Windows yields a different absolute path than the assertion.
  - **Spec broader than the scenario:** the verify scenario fires when a filesystem test creates a directory. The remaining hits are stub config objects and mocked return paths (`projectRoot: '/tmp/project'`, `changePath: '/tmp/change'`). They do not create `/tmp`. String equality still passes on Windows. The spec could be narrowed to "directories and file URLs the test actually creates," which would match the code that was changed.
- `get-graph-health.spec.ts` is not in this list. Its real directories use `os.tmpdir()`.

**D2. `chmod 0o000` replacement matches the prohibition; the "unreadable file" alternative is a mock.**

- Spec: do not use `chmod 0o000` as the Windows unreadable condition. Produce a file the process cannot read, or skip where the bit has no effect.
- Code: `get-graph-health.spec.ts` never chmods. It writes a normal file under `os.tmpdir()` and mocks `readFile` to throw `EACCES` for that path. The assertion is `FreshnessState.Unknown` / `CONTENT_UNKNOWN`, not `CONTENT_DIRTY`.
- Both readings:
  - **Code matches the intent:** the condition is "read failed," which is true on Windows without chmod. The prohibition is satisfied. Repo-wide search found no `0o000`.
  - **Spec's allowed substitutes are narrower:** a mock does not make the OS deny the read, and the test is not skipped on `win32`. A strict reading would want an ACL/icacls setup or `it.skip` on Windows. The mock is the more portable of the two and is what the change implemented.

**D3. Typed port mocks (standing, including a file this change touched).**

- Spec: no partial mock with `as unknown as Port`.
- Code: 67 spec files still use `as unknown as`. `get-graph-health.spec.ts` has 10, including the provider double used by the new unreadable-file case.
- Both readings:
  - **Implementation gap:** the global testing spec is still violated, including in the Windows fixture test.
  - **Spec is older and widely unmet:** this change did not claim to retype every port double. Treating D3 as a release blocker for Windows CI would expand the change far past fixtures. It remains a real spec/code gap.

#### Test coverage

| Requirement / scenario                  | Coverage                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temp paths come from the OS             | `get-graph-health.spec.ts` and other `mkdtemp(Sync)(join(tmpdir(), ...))` tests create real dirs under `os.tmpdir()`. No test asserts the absence of `'/tmp'` literals.                  |
| Unreadable files do not use chmod zero  | The health spec covers the outcome (read error stays `CONTENT_UNKNOWN`) via `deniedReads`. Nothing asserts "this file does not call chmod." The prohibition holds because chmod is gone. |
| Jest rejected / tests outside `test/`   | No dedicated guard test found in this pass. Layout spot check is clean.                                                                                                                  |
| Unit test must not touch the filesystem | Not re-checked. The health spec's read-error case is an integration-style temp dir inside a use-case spec.                                                                               |
| Partial mock cast                       | The forbidden pattern is still what many tests, including the health spec, use. No test fails the build when `as unknown as` appears.                                                    |
| Integration cleanup                     | Health spec uses `try/finally` + `rmSync`. Not all adapters were re-read.                                                                                                                |
| Wrong suffix / snapshot assertion       | Search found no `.test.ts` and no snapshot matchers. No meta-test enforces that.                                                                                                         |

#### Missing tests

- No suite-wide assertion that spec files do not contain `'/tmp'`, `'/var/www'`, or `file:///tmp/`.
- No Windows job assertion, in-repo, that `get-graph-health` avoids `chmod 0o000` (behavior is covered; the forbidden API is not).
- No test that port doubles implement every method without `as unknown as`.
- Pre-existing verify scenarios (Jest import, co-located spec file, snapshot matcher, integration `afterEach` cleanup) have no single compliance test; they rely on review and the suite's current shape.

#### Spec dependency chain

Depends on `default:_global/architecture` (what is unit vs integration) and `default:_global/conventions` (ESM, why Vitest). Those specs were not expanded in this partial. No contradiction found between the new Windows fixture text and the CI spec: CI runs `pnpm test` on `windows-latest`, which is the suite this requirement constrains.

---

## Summary counts

| Item                        | Count                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| Specs audited               | 2                                                                            |
| Requirements                | 12 (CI 5, testing 7)                                                         |
| Requirements met            | 8 (CI 5; testing: runner, sampled integration temp dirs, snapshot ban)       |
| Requirements partial        | 1 (Windows fixtures: chmod and real temp dirs met; `/tmp` strings remain)    |
| Requirements not re-audited | 2 (unit-test completeness, test naming wording)                              |
| Requirements not met        | 1 (typed port mocks, standing)                                               |
| Discrepancies               | 3 (D1 `/tmp` strings, D2 mock vs OS-unreadable wording, D3 `as unknown as`)  |
| CI discrepancies            | 0                                                                            |
| Notes (not discrepancies)   | 2 (`ci.yml` untracked but not ignored; `@ladybugdb/core` removed and absent) |
| Missing test areas          | 8 (4 CI workflow/script guards, 4 testing fixture/mock/naming guards)        |
