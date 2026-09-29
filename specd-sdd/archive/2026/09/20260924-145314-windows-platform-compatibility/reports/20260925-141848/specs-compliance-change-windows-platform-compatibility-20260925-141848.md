# Spec compliance: windows-platform-compatibility

Mode: change. Timestamp: 20260925-141848.
Verification mode: full. Change state at audit: verifying.
Scope: requirements this change adds or modifies. Historical requirements outside those deltas were not re-audited. Leftover `/tmp` mock strings, standing `as unknown as` port doubles, and GitHub issue 64 were treated as non-goals.

## Totals

| Batch          | Requirements | Discrepancies | Missing tests |
| -------------- | -----------: | ------------: | ------------: |
| Core paths     |           15 |             3 |            13 |
| Hooks and docs |            6 |             2 |             5 |
| Code graph     |            4 |             0 |             4 |
| CI and testing |            6 |             0 |             4 |
| **Total**      |       **31** |         **5** |        **26** |

## Discrepancies

1. Config file outside the repository is not rejected. `load()` checks the YAML `configPath` setting, not the resolved `specd.yaml` file.
2. Binary snapshot content is not a separate digest path. `hashFiles` forwards every string. The text hasher normalizes every string, and the snapshot delta still asks for binary bytes to stay unchanged.
3. The project root is classified as not project-relative. `isPathInside` is true for an equal path, then an empty relative string returns `null`.
4. `HookVariables` still requires `change.workspace` in the unmodified port section. The modified hook-execution and template-variable requirements forbid that key. The code follows the no-workspace rule.
5. `RunStepHooks` returns the raw hook command. The unmodified result-shape requirement still says the returned command is the expanded command.

## Scenario verification

Windows delta scenarios that this implementation pass targeted match the code, and `pnpm test`, lint, and typecheck passed on the implementing post-hooks. The merged context contains 734 scenarios across the change specs. Scenarios outside the Windows deltas were not re-walked one by one in this cycle.

## Detailed findings

# Partial: core paths

# Partial audit: core paths

Change: `windows-platform-compatibility`
Scope: delta requirements only (added or modified), plus contradictions with the unchanged base or a direct dependency.
Graph: `graph search` / `graph impact` before file reads. Index treated as fresh.

Checked follow-ups that hold in code (not reported as findings):

- `publicationRenameError` returns the original `ErrnoException` for `EPERM` / `EBUSY` / `EACCES` (`code` preserved). `SpecPublicationError.code` is `SPEC_PUBLICATION_FAILED`. Other publication failures still wrap.
- `normalizeNewlines` is `packages/core/src/domain/services/normalize-newlines.ts`. `sha256` and `NodeContentHasher.hash` rewrite `\r\n` and lone `\r`. `computeArtifactHash` runs `applyPreHashCleanup` (whitespace collapse) before the digest. No `Buffer` hash goes through that helper.
- `RefreshImplementationTracking` takes `isPathInside` and `normalizeVcsRoot` on `ProjectPathHelpers`. The use case file does not import `infrastructure/fs/path-platform.ts`. Composition injects the real helpers.
- `git` / `hg` / `svn` `spawnOptions` set `windowsHide: true` when `platform === 'win32'`.
- `moveDir` copies on `EPERM` and `EXDEV` (also `ENOTEMPTY` / `EEXIST`).
- `con-foo` is accepted as a change slug, workspace name, and capability segment. Exact device names are rejected.
- `/tmp` in mocks and standing `as unknown as` port doubles were not audited. Resolution-fingerprint manifests (GitHub issue 64) were not required.

---

## core:config-loader

### Requirements checked

1. **Storage path containment** (modified). Inside-root rule, drive-letter case, no separator-prefix test, `ConfigValidationError` names the storage key, null `rootPath` skips the check, `rootPath` is the normalized VCS root.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Null `rootPath` forces `isExternal: false`.
3. **Config file stays inside the repository root** (added). The resolved config file must sit inside `rootPath` under that same rule. Separator mismatch and drive-letter case must not reject an inside file. An outside file must throw `ConfigValidationError`.

### Implementation status

Storage containment and `isExternal` call `isPathInside` (`packages/core/src/infrastructure/fs/config-loader.ts` around the storage loop and the specs-path check). `createDefaultConfigLoader` sets `rootPath` from `vcsAdapter.rootDir()`, which the built-in adapters already pass through `normalizeVcsRoot`. Null adapter still yields `rootPath = null`.

The new config-file requirement is not implemented. `load()` never calls `isPathInside` on the specd.yaml path (`cascade.rootPath` / `rootConfigPath`). The only nearby check is the YAML **setting** `configPath` (default `.specd/config`), stored as `resolvedConfigPath`. Discovery still stops at the VCS root, so a walked file is inside by construction. Forced mode (`resolveForcedCascade`) can load a file outside that root and will not reject it for that reason.

### Discrepancies

**Config file outside the repository is not rejected.**

- Spec: when `rootPath` is non-null, the resolved config file must be inside that root. Scenario: root `C:/repo`, file `C:/other/specd.yaml`, `load()` throws `ConfigValidationError`. Mixed separators (`C:\repo` vs `C:/repo/specd.yaml`) must be accepted.
- Code: `FsConfigLoader._buildConfig` checks `isPathInside(this.rootPath, resolvedConfigPath)` where `resolvedConfigPath` is `data.configPath`, not the yaml file. No check of `rootConfigPath`.
- Evidence: `packages/core/src/infrastructure/fs/config-loader.ts` (`resolvedConfigPath` assignment and the `rootPath !== null` block). `isPathInside` itself would accept the mixed-separator pair (`path-platform.ts`).
- Either side: the scenario text names `specd.yaml`. The existing loader test "rejects configPath values outside the repo root" covers the YAML `configPath` field (`../outside`), which is a different path. Discovery bounding is not the same as the forced-mode check the requirement states.

### Test coverage gaps

- Drive-letter storage inside (`c:/repo` vs `C:/repo/changes`) is not exercised through `load()`.
- Longer storage prefix (`C:/repo` vs `C:/repository/changes`) is not exercised through `load()`.
- Drive-letter `isExternal` (`C:/repo` vs `c:/repo/specs`) is not exercised through `load()`.
- Mixed-separator acceptance of the config file is not tested.
- Outside config file `C:/other/specd.yaml` is not tested (the `../outside` test is the `configPath` setting).

`isPathInside` unit tests cover the predicate (`path-platform.spec.ts`) but not these `load()` scenarios.

### Summary

Requirements checked: 3. Discrepancies: 1. Missing tests: 5.

---

## core:vcs-adapter

### Requirements checked

1. **Built-in adapters normalize repository roots** (added). Absolute root, uppercased Windows drive letter, no `realpath`, value stays a usable cwd. `NullVcsAdapter.rootDir()` still throws and invents no root. Modified-file paths use `/` and must not collapse `.` or `..`. Windows spawns of `git`, `hg`, and `svn` hide the console.

### Implementation status

Conforms. `GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` cache and return `normalizeVcsRoot`. `normalizeVcsRoot` is `resolvePlatformPath` (`path.win32.resolve` when the string has a drive letter or a backslash, then uppercase the drive letter). It does not call `realpath`. `toPortablePath` is `replaceAll('\\', '/')` only. `NullVcsAdapter.rootDir` throws `no VCS detected`. `spawnOptions` in `infrastructure/git/exec.ts`, `hg/exec.ts`, and `svn/exec.ts` set `windowsHide: true` on `win32`.

On this host, `path.win32.resolve('c:/repo')` is `c:\repo`, and the adapters return `C:\repo` after the drive-letter uppercase. That string is absolute under win32 rules.

### Discrepancies

None.

### Test coverage gaps

- No test spies `realpath` / `fs.realpath`. `path-platform.spec.ts` only asserts the normalized string. The "does not call realpath" clause is unmet as an assertion. Behavior in source does not call it.

Drive-letter roots, uncollapsed `src/../secret`, null `rootDir()`, and `windowsHide` are tested (`git`/`hg`/`svn` adapter specs, `null/vcs-adapter.spec.ts`, `vcs-spawn-options.spec.ts`).

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 1.

---

## core:content-hasher-port

### Requirements checked

1. **Text newline normalization** (added). `ContentHasher.hash` and shared text `sha256` turn every `\r\n` and remaining `\r` into `\n`. Every string is text. No binary string mode. Artifact hashes are a different contract (whitespace collapse) and must not be required to preserve line endings. Raw file bytes must not go through the text helper.
2. **Determinism** (modified). Identical input after that newline normalization returns the same digest.

### Implementation status

Conforms. `normalizeNewlines` lives in `packages/core/src/domain/services/normalize-newlines.ts`. `sha256` (`infrastructure/fs/hash.ts`) and `NodeContentHasher.hash` both digest `normalizeNewlines(content)` as UTF-8. `computeArtifactHash` does `normalizeNewlines(applyPreHashCleanup(...))`, and `applyPreHashCleanup` already replaces `\s+` with a single space before trim. `compile-context-fingerprint.ts` calls `createHash` on its canonical string and does not import the text helper. No production `createHash(...).update` of a `Buffer` goes through `normalizeNewlines`.

### Discrepancies

None against this delta. Artifact hashes are not required to keep line endings; the implementation collapses whitespace and also normalizes newlines. That is stronger than the requirement and does not contradict it.

### Test coverage gaps

None for the two verify scenarios. `hash-newlines.spec.ts` asserts CRLF and lone CR match LF for `sha256`, `NodeContentHasher`, and `computeArtifactHash`, and locks the previous LF digest.

### Summary

Requirements checked: 2. Discrepancies: 0. Missing tests: 0.

---

## core:snapshot-hasher

### Requirements checked

1. **Determinism** (modified). Same path and same text after `\r\n` / `\r` → `\n` share a digest. Binary content must not be newline-normalized.
2. Dependency note: text hashes follow `core:content-hasher-port`.

### Implementation status

Does not conform for the binary clause, and does not itself implement the text clause.

`hashFiles` (`packages/core/src/domain/services/hash-files.ts`) copies each string into `hashContent(content)` with no newline rewrite and no text/binary split. Graph impact shows production callers: none. The unit test injects `NodeContentHasher`, which rewrites every string.

Direct dependency `core:content-hasher-port` says every string passed to the text hasher is text and that there is no binary string mode. This delta still requires the snapshot hasher to leave non-text `\r\n` bytes unchanged.

### Discrepancies

**Binary snapshot content is not a separate digest path.**

- Spec: text that differs only by `\r\n` or `\r` must hash the same. Content that is not text and contains the `\r\n` byte sequence must not be rewritten to `\n`.
- Code: `hashFiles` always forwards the string. It cannot both normalize text and preserve binary unless `hashContent` changes per entry. The hasher the spec depends on normalizes every string.
- Evidence: `hash-files.ts` lines 16–18; `content-hasher.ts` `hash`; content-hasher delta ("There is no binary string mode on this port").
- Either side: the snapshot delta may be asking `hashFiles` not to pre-normalize, leaving binary safety to a raw `hashContent`. The verify scenario still says the snapshot hasher's digest must not rewrite those bytes. With the only wired text hasher, a binary-looking string is rewritten. The two deltas disagree, and the code implements only the text-hasher side.

### Test coverage gaps

- "Text file CRLF matches LF" is not in `hash-files.spec.ts`.
- "Binary content keeps its bytes" is not tested.

### Summary

Requirements checked: 1. Discrepancies: 1. Missing tests: 2.

---

## core:fs-change-repository

### Requirements checked

1. **Windows path containment and rename recovery** (added). Inside-root rule and drive-letter case. Directory move on `EPERM` or `EXDEV` copies. Rename onto a locked destination (`EPERM`, `EBUSY`, `EACCES`) retries a bounded number of times, then surfaces the original error. Identical destination bytes are not success for change artifacts.

### Implementation status

Conforms. Bucket classification and prune use `isPathInside`. `moveDir` (`move-dir.ts`) copies on `ENOTEMPTY`, `EEXIST`, `EPERM`, and `EXDEV`. Manifest and lock writes use `writeFileAtomic` → `retryOnLock` (five attempts, then the original error). `saveArtifact` writes with `fs.writeFile` after a hash conflict check. It does not treat equal destination bytes as a successful rename skip. `resolveConfinedPath` uses `isPathInside` after resolving the candidate (`path-confinement.ts`). The prefix pair `C:/work/app` vs `C:/work/application` is outside under `path.win32.relative`.

### Discrepancies

None.

### Test coverage gaps

- "Different artifact bytes are not success" has no test. Source has no byte-equality success short-circuit; the scenario is still unasserted.
- `EPERM` and `EACCES` rename retries are not asserted. `EBUSY` is (`write-atomic.spec.ts`, `path-platform.spec.ts`). The three codes share `LOCK_CODES`.

Prefix collision is covered on `isPathInside` (`C:/work/app` vs `C:/work/application`). `EXDEV` and `EPERM` copy are covered in `move-dir.spec.ts`. The repository calls `moveDir` at the directory move site.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

## core:fs-spec-repository

### Requirements checked

1. **Publication rename recovery** (added). `EPERM` / `EBUSY` / `EACCES` retries, then the original error. Tmp `.gitignore` equality treats `\r\n` and `\r` as `\n`, and that success applies to that file only. Differing artifact bytes are not success.

### Implementation status

Conforms. `publish` wraps the spec-dir renames in `retryOnLock`. `publicationRenameError` returns the caught value when `isPublicationLockError` is true, otherwise `SpecPublicationError`. The staging-to-canonical failure is mapped once, then the outer catch maps again; a lock error stays the same object. `ensureTmpGitignore` compares `normalizeNewlines` of the existing file to the LF marker and returns without rewriting when they match. Artifact publication goes through `writeFileAtomic` and does not accept a pre-existing different file as success.

Unchanged exact-byte / raw-byte revision wording still hashes UTF-8 strings via `sha256`. Under the content-hasher delta those strings are text. No separate raw-byte hasher was required for this delta.

### Discrepancies

None.

### Test coverage gaps

- "Different artifact bytes are not success" has no publication test.

`spec-repository.spec.ts` "rethrows the original EBUSY when the spec directory stays locked" expects `{ code: 'EBUSY' }`. That is not `SPEC_PUBLICATION_FAILED`. CRLF tmp gitignore is covered in `ensure-tmp-gitignore.spec.ts`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 1.

---

## core:fs-archive-repository

### Requirements checked

1. **Archive paths stay inside the repository root** (added). Inside-root rule. Drive-letter case must not look outside.

### Implementation status

Conforms on win32. `resolveArchiveDirPathSync` resolves with host `path.resolve`, then `isPathInside`. On Windows, `path.resolve` keeps the drive letter, and `isPathInside` uppercases it, so `c:/repo` contains `C:/repo/archive` and rejects `C:/repository/archive`.

On this darwin host, `path.resolve('c:/repo')` is `{cwd}/c:/repo` and `path.resolve('C:/repo/archive')` is `{cwd}/C:/repo/archive` (case-sensitive, not win32). A confinement check that host-resolves those strings before `isPathInside` does not see a drive letter. Production Windows runs do. The shared predicate, called with the raw drive-letter strings, matches the scenarios.

### Discrepancies

None for the Windows rule the requirement states. Host `path.resolve` before `isPathInside` means a macOS unit test of this function with raw `C:/` strings would not be the same check. That is untested, not a win32 miss.

### Test coverage gaps

- "Drive-letter case stays inside" is not tested on `FsArchiveRepository` / `resolveArchiveDirPathSync`.
- "A longer directory name is outside" is not tested there either.

`isPathInside('C:/repo', 'c:/repo/specd.yaml')` and `isPathInside('C:/repo', 'C:/repository')` cover the predicate only.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 2.

---

## core:file-reader-port

### Requirements checked

1. **Path traversal protection** (modified). Escape uses the inside-root rule. Drive-letter case must not look outside. A string prefix of `basePath` plus a separator must not be the test. Escape throws `PathTraversalError`.

### Implementation status

Conforms. `FsFileReader` normalizes `basePath` and the candidate with `normalizeVcsRoot`, then `isPathInside`. A miss throws `PathTraversalError`. `windows-containment.spec.ts` also checks `resolveConfinedPath('C:/work/app', '../application')`.

### Discrepancies

None.

### Test coverage gaps

None for the two new scenarios. Inside drive-letter read resolves `null` (missing file, not a traversal). `C:/repository/file.txt` against base `C:/repo` throws `PathTraversalError`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:refresh-implementation-tracking

### Requirements checked

1. **Project-relative paths keep a separator boundary** (added). Project-relative means the project root or a descendant. Match needs a separator boundary. A longer string prefix is outside. Drive-letter case must not change the result.
2. Dependency note: the root used for the check is the normalized adapter root.

### Implementation status

Does not fully conform. Composition passes `{ isPathInside, normalizeVcsRoot }` and the use case does not import the infrastructure module. `_toPortableProjectRelativePath` uses those helpers, then `path.win32.relative` when the normalized root has a drive letter or a backslash, then `replaceAll('\\', '/')`.

The longer-prefix and drive-letter descendant cases match the scenarios (`C:/work/application` dropped, `c:/work/app/specd` kept as `specd`). The project root itself does not.

### Discrepancies

**The project root is classified as not project-relative.**

- Spec: a path is project-relative when it is the project root or a descendant. Separator boundary and drive-letter case are additional constraints, not a reason to drop the root.
- Code: `isPathInside` is true for equal paths (`relative === ''` returns true in `path-platform.ts`). `_toPortableProjectRelativePath` then returns `null` when the portable relative string is empty. The method comment says `null` means outside `projectRoot`. `_collectExclusions` skips `null`, so an internal path equal to the project root is omitted the same way as `C:/work/application`.
- Evidence: `refresh-implementation-tracking.ts` `_toPortableProjectRelativePath` (the `portable.length > 0 ? portable : null` return).
- Either side: exclusions may intentionally avoid a relative path of `""` so the whole tree is not excluded. The requirement text still counts the root as inside. Callers cannot tell the root from an outside path.

### Test coverage gaps

None for the two verify scenarios. `refresh-implementation-tracking.spec.ts` "ignores a longer path prefix when collecting exclusions" uses root `C:/work/app`, internal paths `C:/work/application` and `c:/work/app/specd`, and expects `excludePaths` `['specd']`. The equal-root case is not a written scenario.

### Summary

Requirements checked: 1. Discrepancies: 1. Missing tests: 0.

---

## core:change

### Requirements checked

1. **Change names reject Windows device names** (added). Whole slug, case-insensitive: `con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`, on every OS. `con-foo` stays legal when it matches the slug pattern.

### Implementation status

Conforms. `Change` constructor rejects when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName(props.name)`. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. `change-device-name.spec.ts` rejects a device slug and accepts `con-foo`. The helper spec covers case and the reserved set.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:workspace

### Requirements checked

1. **Workspace identity** (modified). Names still match `/^[a-z][a-z0-9-]*$/`. Reserved: `default`, `root`, and the same Windows device names, whole name, every OS. `con-foo` stays legal.

### Implementation status

Conforms. `FsConfigLoader._buildConfig` rejects `workspaces.root` and `isWindowsDeviceName(name)` with `ConfigValidationError`. `con-foo` does not match the device regex and matches the name pattern. There is no separate domain `Workspace` type; identity is enforced at config load, which is where workspace names enter the system.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. The loader test rejects workspace `con` and accepts `con-foo`. The scenario fixture is `nul`; `con` is in the same reserved set and uses the same helper. `default` remains required and `root` remains rejected by the surrounding loader checks.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## core:spec-id-format

### Requirements checked

1. **Capability segments reject Windows device names** (added). Whole segment, case-insensitive, every OS. `con-foo` stays legal. A Windows drive letter is not treated as a workspace name; spec IDs are not filesystem paths.

### Implementation status

Conforms. `SpecPath._validateSegments` rejects `isWindowsDeviceName(segment)` with `InvalidSpecPathError`. `con-foo` passes. The device check does not parse drive letters. `parseSpecId` still splits on the first `:`; that is unchanged and is not a capability-segment rule. `:` is already an invalid segment character, so a drive letter cannot be a `SpecPath` segment.

### Discrepancies

None.

### Test coverage gaps

None for the two scenarios. `spec-path.spec.ts` rejects `con` and `auth/com1`, and accepts `con-foo`.

### Summary

Requirements checked: 1. Discrepancies: 0. Missing tests: 0.

---

## Batch totals

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             1 |             5 |
| core:vcs-adapter                     |            1 |             0 |             1 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             1 |             2 |
| core:fs-change-repository            |            1 |             0 |             2 |
| core:fs-spec-repository              |            1 |             0 |             1 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             1 |             0 |
| core:change                          |            1 |             0 |             0 |
| core:workspace                       |            1 |             0 |             0 |
| core:spec-id-format                  |            1 |             0 |             0 |
| **Total**                            |       **15** |         **3** |        **13** |

Discrepancy titles:

1. Config file outside the repository is not rejected.
2. Binary snapshot content is not a separate digest path.
3. The project root is classified as not project-relative.

# Partial: hooks

# Partial audit: hooks and template substitution

Change: `windows-platform-compatibility`
Scope: requirements this change adds or modifies in `core:hook-runner-port`, `core:template-variables`, `core:hook-execution-model`, `core:run-step-hooks`, and `default:_global/docs`.
Method: `changes spec-preview` for the merged specs, then `graph search` / `graph impact` (index `state: current`, `stale: false`). Quote-translation cases were executed against `translateHookCommand` in-process. No code or spec files were modified.

Contract checked:

- Developer `run:` hooks substitute `{{...}}` verbatim. SpecD does not add quotes. Developers own quoting.
- `expandForShell()` is only for commands SpecD itself builds. `HookRunner` and `RunStepHooks` do not use it for developer hooks.
- No `execFile`-without-shell shortcut. No `%` escaping on developer hooks.
- Quote translation is bidirectional and only rewrites syntax the host shell does not understand.
- Non-Windows spawn is absolute `$SHELL` or `/bin/sh` with `-c`, not bare `sh`.
- `docs/guide/workflow.md` and the generated guide say that. `TemplateExpander` JSDoc says `expand()` is the developer `run:` path and `expandForShell()` is only for commands SpecD builds. The guide does not call that substitution shell escaping.

## core:hook-runner-port

### Requirements checked

Modified section only:

- **Requirement: Shell escaping** — verbatim substitution of string/number/boolean values; no extra quotes; host quote translation; no `%` rewrite; Windows `cmd.exe /d /s /c` with verbatim arguments and a hidden console; other platforms spawn a POSIX shell with `-c`; no program/flag/pipe translation; no `execFile` shortcut.

Unmodified sections in the same spec were used only to look for contradictions (see Discrepancies).

### Implementation status

Conforms to the modified requirement.

`NodeHookRunner.run` expands with `expand()`, then `translateHookCommand`, then `spawnHook`:

```69:72:packages/core/src/infrastructure/node/hook-runner.ts
    const expanded = translateHookCommand(
      this._expander.expand(command, variables),
      process.platform === 'win32' ? 'cmd' : 'posix',
    )
```

`spawnHook` matches the spawn contract. Windows uses `cmd.exe` with `/d /s /c`, `windowsVerbatimArguments: true`, and `windowsHide: true`. Other platforms use `process.env.SHELL` when that value is absolute, otherwise `/bin/sh`, and pass `-c`. The call is `spawn`, not `execFile`, and `shell: true` is not set.

```19:31:packages/core/src/infrastructure/node/hook-runner.ts
function spawnHook(command: string): ReturnType<typeof spawn> {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: true,
      windowsHide: true,
    })
  }
  const envShell = process.env['SHELL']
  const shell = envShell !== undefined && path.isAbsolute(envShell) ? envShell : '/bin/sh'
  return spawn(shell, ['-c', command], {
```

`translateHookCommand` does not rewrite `%` and does not wrap substituted values. In-process checks:

| Input                                | Host          | Result                               |
| ------------------------------------ | ------------- | ------------------------------------ |
| `mkdir 'C:\Users\Ada Lovelace\repo'` | cmd           | `mkdir "C:\Users\Ada Lovelace\repo"` |
| `echo 'say "hi"'`                    | cmd           | `echo "say ""hi"""`                  |
| `echo 'it'\''s fine'`                | cmd           | `echo "it's fine"`                   |
| `echo "Resultado: \"listo\""`        | cmd           | `echo "Resultado: ""listo"""`        |
| `echo "Resultado: ""listo"""`        | cmd           | unchanged                            |
| `echo "100%"`                        | cmd and posix | unchanged                            |
| `echo ""`                            | cmd and posix | unchanged                            |
| `echo "Resultado: ""listo"""`        | posix         | `echo "Resultado: \"listo\""`        |
| `echo "Resultado: \"listo\""`        | posix         | unchanged                            |
| `mkdir 'C:\Users\Ada Lovelace\repo'` | posix         | unchanged                            |
| `echo 'it'\''s fine'`                | posix         | unchanged                            |

The hook-runner-port sentence "spawn the POSIX shell with `-c`" does not name the binary. That is compatible with the stricter docs rule and with this spawn path. It is not a contradiction.

### Discrepancies

**D1. `HookVariables` still requires `change.workspace`, which the modified sibling specs forbid.**

- Spec drift in this file's unmodified **Requirement: HookVariables shape**: optional `change` is still documented as `{ name, workspace, path }` with `workspace: string`.
- The modified **Requirement: Template variable expansion** in `core:hook-execution-model` says `{{change.workspace}}` is not supported and must not be injected into `HookVariables`.
- `core:template-variables` (dependency) says `change.workspace` must not be a key and that the typed `HookVariables` interface is replaced by `TemplateVariables`.
- Code follows the modified/dependency rule. The port re-exports `TemplateVariables` and has no `workspace` field (`packages/core/src/application/ports/hook-runner.ts` lines 1–2 and 42–46). `RunStepHooks` builds `{ change: { name, path } }` only (`packages/core/src/application/use-cases/run-step-hooks.ts` lines 196–198).

Either the HookVariables section is stale, or the no-workspace rules over-reach. The implementation matches the no-workspace rules.

### Test gaps

- **T1.** No test asserts the Windows spawn options. `windowsVerbatimArguments` appears in `hook-runner.ts` and not in a test. The verify scenario "Windows turns developer single quotes into cmd quotes" requires verbatim arguments and a hidden console; `translate-hook-command.spec.ts` only checks the string.
- **T2.** No test asserts the non-Windows executable or argv. `hook-runner.spec.ts` "falls back to default shell when SHELL env is not absolute" only expects exit code 0. On this host a bare `sh` on `PATH` would also pass. Nothing asserts `/bin/sh`, absolute `$SHELL`, or `-c`.
- Quote-string scenarios (no extra quotes, `'\''`, `\"` to `""`, `""` to `\"`, empty `echo ""`, literal `%`, unknown tokens) are covered by `packages/core/test/infrastructure/node/translate-hook-command.spec.ts` and `packages/core/test/infrastructure/node/hook-runner.spec.ts`.
- There is no cmd-host test that `echo "Resultado: ""listo"""` stays unchanged. Behavior matches the spec; the suite does not lock it. Counted as **T5** below.

## core:template-variables

### Requirements checked

- **Requirement: Shell escaping for run hooks** (modified) — verbatim `run:` insertion, no added quotes, composed path stays one quoted string, `expandForShell()` remains for SpecD-built commands (posix `'\''`, cmd empty `""`, `%` → `%%`, `"` → `""`, then wrap), `HookRunner` must not use `expandForShell()` for developer hooks, instruction/artifact text stays verbatim with no quote translation.
- **Requirement: TemplateExpander class** (modified) — `expand()` is the verbatim path used by `GetHookInstructions`, `GetArtifactInstruction`, and `HookRunner`; `expandForShell()` quotes values for a command SpecD builds and defaults to `posix`; `HookRunner` does not call it for developer hooks.

### Implementation status

Conforms.

`expand()` calls `_replace` with shell escaping off. `expandForShell()` passes the dialect into `shellEscape`. Cmd dialect of `shellEscape` still doubles `%` and quotes; that path is not used for developer hooks.

```60:90:packages/core/src/application/template-expander.ts
  /**
   * Expands `{{namespace.key}}` tokens with verbatim substitution.
   *
   * Used for instruction text and for `run:` hook values. Substitution is verbatim.
   * ...
   */
  expand(template: string, variables?: TemplateVariables): string {
    return this._replace(template, variables, false)
  }

  /**
   * Expands `{{namespace.key}}` tokens and quotes each substituted value.
   *
   * Used only for commands SpecD itself builds. Developer `run:` hooks use {@link expand}
   * and keep the developer's own quotes.
   * ...
   */
  expandForShell(...)
```

JSDoc meets the contract: `expandForShell` is only for commands SpecD builds, and developer `run:` hooks use `expand`. The `expand` comment itself says "`run:` hook values" and "verbatim"; the word "developer" is on the `expandForShell` comment that points at `expand`.

Call sites:

- `NodeHookRunner` calls `expand`, not `expandForShell` (`hook-runner.ts` line 70).
- `GetHookInstructions` calls `expand` (`get-hook-instructions.ts` line 133).
- `GetArtifactInstruction` calls `expand` for template, delta instruction, and rules (`get-artifact-instruction.ts` lines 140, 156, 183).
- Graph file search for `expandForShell` in `core` resolves to `template-expander.ts` and `template-expander.spec.ts` only. No production hook path calls it.

### Discrepancies

None in the modified requirements. `expandForShell` still percent-escapes, which the same requirement requires for SpecD-built commands. That does not apply to developer hooks.

D1 (above) is the cross-spec clash with this spec's unchanged "no `change.workspace`" rule and the stale HookVariables shape.

### Test gaps

- **T3.** The modified scenario "expand does not escape" (`Read {{change.name}}` with `it's-a-test` stays verbatim) has no `expand()` test. `template-expander.spec.ts` only escapes apostrophes through `expandForShell`.
- The composed-path scenario (`mkdir "{{project.root}}/{{change.name}}"` → `mkdir "/repo/add-auth"`) is not a direct `expand()` unit test. `hook-runner.spec.ts` covers the same substitution through `printf %s "{{project.root}}/{{change.name}}"`, which prints `/my/project/add-auth`. Not counted again.
- `expandForShell` posix, cmd percent-doubling, and empty cmd `""` are tested in `template-expander.spec.ts`.

## core:hook-execution-model

### Requirements checked

- **Requirement: Template variable expansion** (modified) — `{{change.name}}`, `{{change.path}}`, `{{project.root}}`; no `{{change.workspace}}`; unknown tokens preserved; values inserted verbatim; developer writes quotes; host quote translation is defined by `core:hook-runner-port`.
- **Constraints** (rewritten) — the last bullet restates verbatim expansion plus quote translation only, and says callers do not shell-escape those values. Same rule as the requirement. Not counted as a separate requirement.

Added verify scenario: `mkdir "{{project.root}}/{{change.name}}"` stays `mkdir "/repo/add-auth"` with no extra quotes. Covered by the runner test cited above.

### Implementation status

Conforms for substitution and quoting. Expansion happens inside `HookRunner` via `expand()` plus `translateHookCommand`, which is what this requirement delegates to `core:hook-runner-port`.

`RunStepHooks` does not put `workspace` on the variable map (see D1 evidence).

### Discrepancies

D1. This modified requirement forbids `change.workspace` on the variables passed to `HookRunner`. The dependency spec `core:hook-runner-port` still requires that field. See D1.

No quoting contradiction with the dependency. This requirement points quote translation at `core:hook-runner-port`, and that port's modified shell-escaping text matches.

### Test gaps

No execution-model test of its own for the new quoting scenario. Behavior is tested on `NodeHookRunner` / `TemplateExpander`, which is the component this requirement assigns the work to. Not an additional missing test.

## core:run-step-hooks

### Requirements checked

- **Requirement: Ports and constructor** (modified) — `HookRunner` expands developer `run:` commands with `TemplateExpander.expand()` and then translates quotes. `RunStepHooks` does not call the expander. It builds `TemplateVariables` and passes them to `HookRunner.run()`.

Added verify scenario: a command `echo "Resultado: {{change.name}}"` is still quoted that way when `HookRunner.run` is called, and `RunStepHooks` does not call `expandForShell()`.

### Implementation status

The modified requirement is implemented. The use case never imports `TemplateExpander` and never calls `expand` or `expandForShell`. Shell hooks go out as the schema command plus the variable map:

```237:260:packages/core/src/application/use-cases/run-step-hooks.ts
      const command = hook.type === 'run' ? hook.command : `external:${hook.externalType}`
      onProgress?.({ type: 'hook-start', hookId: hook.id, command })
      // ...
      const result =
        hook.type === 'run'
          ? await this._hooks.run(hook.command, variables, relayRunnerProgress)
          : await this._runExternalHook(hook, variables)
```

The result entry copies that same raw `command` (lines 262–268).

### Discrepancies

**D2. Returned hook `command` is the raw schema text, while the base result-shape requirement still says it is the expanded command.**

- Unmodified **Requirement: Result shape** in this spec: `command` is "the expanded command string (after template variable substitution)".
- Modified **Requirement: Ports and constructor**: `RunStepHooks` does not call the expander; `HookRunner` expands.
- `HookRunner.run` returns `HookResult` (exit, stdout, stderr) and does not return the expanded command (`hook-runner.ts` lines 64–68 and 119).
- So the use case cannot fill an expanded `command` without expanding itself, which the modified requirement forbids.

Two readings: the result-shape sentence was not updated when expansion moved into `HookRunner` (spec drift), or the result should still show the post-substitution command and the implementation dropped it (implementation bug). Code and tests currently report the developer command, including any unexpanded `{{...}}` tokens.

### Test gaps

- **T4.** The added scenario is untested. `run-step-hooks.spec.ts` passes commands such as `pnpm lint` through to the mock and checks the variable map has no `workspace`. No test uses `echo "Resultado: {{change.name}}"`, and none asserts that `expandForShell` is absent. The mock receiving `pnpm lint` unchanged only shows that commands with no tokens are forwarded.

## default:\_global/docs

### Requirements checked

- **Requirement: User guide documentation and frontmatter** (modified bullet) — developer `run:` values are inserted verbatim; SpecD then translates only quote syntax the host shell does not understand; the guide says non-Windows hooks run with the absolute `SHELL` value when it is absolute, otherwise `/bin/sh`; the guide must not describe that substitution as shell escaping.

The verify scenario "Configuration and workflow guide parameters match core implementation" was updated to require that same wording in `docs/guide/workflow.md`.

Other bullets in the replaced section (archive patterns, workspaces, project update, Code Graph, opening page) were not re-audited.

### Implementation status

Conforms.

`docs/guide/workflow.md` lines 404–430:

- "`{{...}}` is replaced with the value exactly as it is. SpecD does not add quotes around it."
- Composed path example: `mkdir "{{project.root}}/{{change.name}}"` becomes `mkdir "/repo/add-auth"`.
- "`instruction:` text is also substituted verbatim."
- "macOS and Linux run it with the absolute `$SHELL` or `/bin/sh`. Windows runs it with `cmd.exe`."
- Quote table: single quotes stay on `$SHELL` or `/bin/sh` and become double quotes on `cmd.exe`; `echo "Resultado: ""listo"""` becomes `echo "Resultado: \"listo\""` on sh and stays unchanged on cmd; `echo "100%"` stays unchanged; "SpecD does not rewrite `%`."
- "SpecD does not translate program names, flags, or pipes."

The generated guide topic `workflow` in `packages/guide/src/infrastructure/generated/guides.ts` contains the same Substitution and "Running on macOS, Linux, and Windows" sections. Counts in that topic body: `shell escaping` 0, `shell-escaped` 0, `shell escape` 0, `absolute `$SHELL``1,`/bin/sh` 2.

`TemplateExpander` JSDoc is cited under template-variables and matches the contract.

### Discrepancies

None for the modified bullet. The guide does not call verbatim substitution shell escaping. It does not document `windowsVerbatimArguments` or `/d /s /c`; the modified docs bullet does not require those flags.

### Test gaps

None counted. The verify scenario is a document review, and both `docs/guide/workflow.md` and the bundled topic match it. There is no automated assertion of that prose.

## Summary

| Item                 | Count |
| -------------------- | ----- |
| Requirements checked | 6     |
| Discrepancies        | 2     |
| Missing tests        | 5     |

Requirements:

1. `core:hook-runner-port` — Shell escaping
2. `core:template-variables` — Shell escaping for run hooks
3. `core:template-variables` — TemplateExpander class
4. `core:hook-execution-model` — Template variable expansion
5. `core:run-step-hooks` — Ports and constructor
6. `default:_global/docs` — User guide documentation and frontmatter (hook substitution bullet)

Discrepancy titles:

1. **HookVariables still requires `change.workspace`** while the modified hook-execution requirement and template-variables forbid it.
2. **RunStepHooks returns the raw hook command** while the base result-shape requirement still requires the expanded command.

Missing tests:

1. **T1** — Windows spawn options (`cmd.exe /d /s /c`, `windowsVerbatimArguments`, `windowsHide`) are not tested.
2. **T2** — Non-Windows spawn is not asserted as absolute `$SHELL` or `/bin/sh` with `-c` (not bare `sh`).
3. **T3** — `expand()` verbatim non-escaping (apostrophes) is not unit-tested.
4. **T4** — `RunStepHooks` does not test a developer-quoted `{{...}}` command passed through without `expandForShell()`.
5. **T5** — No test locks the cmd identity of an already-cmd doubled quote (`echo "Resultado: ""listo"""` stays unchanged). Behavior was checked in-process and matches.

The quoting contract itself holds in code, JSDoc, `docs/guide/workflow.md`, and the generated workflow guide. Developer hooks use `expand()` plus bidirectional quote translation. `expandForShell()` is not on the developer-hook path. Spawn is a shell with `-c` or `cmd.exe /d /s /c`, not `execFile`. `%` is not rewritten for developer hooks.

# Partial: code graph

# Partial audit: code-graph Windows requirements

Change: `windows-platform-compatibility`
Scope: requirements this change adds or modifies, from `changes spec-preview` for:

- `code-graph:indexer`
- `code-graph:workspace-integration`
- `code-graph:sqlite-graph-store`
- `code-graph:isolated-index-worker`

Historical requirements in those specs were not re-audited. Graph search and impact ran first (`splitWorkspaceIdentity`, `toPortableGraphPath`, `ParentSignal`, `retryLocked`, file impact of `split-workspace-identity.ts` and CLI `impact.ts`). The hardcoded resolution-manifest fingerprint list (GitHub issue 64) is out of scope. A local copy of the drive-letter split or of lock retry is not a violation: code-graph is not required to import `@specd/core` infrastructure for these rules.

## Summary

| Spec                               | Requirements checked           | Implementation | Discrepancies | Missing tests                                         |
| ---------------------------------- | ------------------------------ | -------------- | ------------- | ----------------------------------------------------- |
| `code-graph:indexer`               | 1 requirement, 6 clauses       | Met            | 0             | Scoped-binding drive letter; Go drive-letter identity |
| `code-graph:workspace-integration` | 1 requirement, 4 clauses       | Met            | 0             | SQLite inclusion filter `C` vs `C:/repo/src/a.ts`     |
| `code-graph:sqlite-graph-store`    | 1 requirement, 3 clauses       | Met            | 0             | Exhausted WAL `EBUSY` surfaces the original error     |
| `code-graph:isolated-index-worker` | 1 requirement, 3 clauses       | Met            | 0             | 0                                                     |
| **Total**                          | **4 requirements, 16 clauses** |                | **0**         | **4**                                                 |

---

### code-graph:indexer

#### Requirements checked

`Portable graph paths` (added spec and verify):

1. Relative paths persisted by the indexer use `/`.
2. That conversion does not collapse `.` or `..`.
3. A key matching `^[A-Za-z]:[/\\]` is not split into a workspace name and a path. `splitWorkspaceIdentity` returns null. The drive letter stays in the path.
4. Every graph-identity split uses that rule, including language-adapter relative imports (TypeScript, Python, PHP, Go), scoped binding, and hotspot caller classification.
5. A PHP namespace separator is not a graph identity and stays local.
6. Scenarios: `C:/repo/src/a.ts` is not workspace `C`; `src\..\secret` persists as `src/../secret`; an adapter split of `C:/repo/src/a.ts` does not yield workspace `C`.

The modified Spec Dependencies section only adds the SQLite store link. It does not change behavior.

#### Implementation status

Met.

`packages/code-graph/src/domain/services/split-workspace-identity.ts:1` defines `DRIVE_LETTER_PATH = /^[A-Za-z]:[/\\]/`. `splitWorkspaceIdentity` (`:19-26`) returns null for a drive-letter path, then null when the first `:` is missing or at index 0, otherwise `{ workspace, relativePath }`. `toPortableGraphPath` (`:34-36`) is `value.replaceAll('\\', '/')` and does not normalize `.` or `..`.

Indexer persistence:

- `discover-files.ts:202` stores `relative(root, fullPath).replaceAll('\\', '/')`. The same replacement is at `:112` for gitignore bases. `replaceAll` does not collapse `..`.
- `index-code-graph.ts:723-726` prefixes `ws.name` onto that relative path and runs `toPortableGraphPath` on the config-relative path. Root discovery does the same at `:763-768`.
- `path.relative` can resolve `..` between two absolute paths before the separator replacement. That is path resolution, not the separator conversion. The conversion itself keeps `src/../secret` (`split-workspace-identity.spec.ts:22-24`).

Identity consumers of the shared helper (graph impact of `code-graph:src/domain/services/split-workspace-identity.ts`, depth 1):

- Relative imports: `typescript-language-adapter.ts:1815-1817`, `python-language-adapter.ts:1143-1145`, `php-language-adapter.ts:2521-2523`. A null identity keeps `fromFile` as the relative path, so `C:/repo/src/a.ts` stays in the resolved path.
- Go has no `resolveRelativeImportPath`. Imports are marked `isRelative: false` (`go-language-adapter.ts:751`). The graph-identity split is `goPackageSurface` (`:149-154`): a `/` keeps the directory, including a `C:/...` prefix; otherwise it calls `splitWorkspaceIdentity` and does not treat `C` as the workspace. A forward-slash drive path therefore stays in the package surface.
- Scoped binding: `scoped-binding-environment.ts:378-380` `extractWorkspacePrefix` uses `splitWorkspaceIdentity` and returns undefined when the identity is null.
- Hotspot caller classification: `compute-hotspots.ts:19-21` returns `''` for a drive-letter path, then `splitWorkspaceIdentity`. Callers compare those names at `:145-146`. The workspace filter at `:223-225` compares `splitWorkspaceIdentity(...)?.workspace` to `options.workspace`, so filter `C` does not match `C:/repo/src/a.ts`.
- Indexer helpers: `index-code-graph.ts:99-110` `relativeIdentityPath` and `workspaceIdentityName`.

PHP namespace backslashes stay local. `php-language-adapter.ts` imports only `splitWorkspaceIdentity`, not `toPortableGraphPath`. `resolveQualifiedNameToPath` (`:2163`) uses `qualifiedName.replace(/\\/g, path.sep)` and `path.join`. Other `replaceAll('\\', '/')` sites (`:123`, `:204`, `:320`, `:523`, `:625`) convert namespace text to lookup segments inside the adapter. They are not graph-identity splits.

#### Discrepancies

None.

#### Test coverage

- `packages/code-graph/test/infrastructure/sqlite/split-workspace-identity.spec.ts:9-24` — drive letter is null; `src\..\secret` becomes `src/../secret`; parent segments survive a real workspace split.
- `typescript-language-adapter.spec.ts:859-861`, `python-language-adapter.spec.ts:574-576`, `php-language-adapter.spec.ts:1301-1303` — relative import of `C:/repo/src/...` keeps the drive letter.
- `compute-hotspots.spec.ts:480-491` — workspace filter `C` returns no entries for `C:/repo/src/a.ts`.

#### Missing tests

- Scoped binding: no test that `extractWorkspacePrefix('C:/repo/src/a.ts')` is undefined. The implementation calls the shared helper (`scoped-binding-environment.ts:379`), but nothing would fail if that call site split on the first colon again.
- Go: no test that `goPackageSurface('C:/repo/src/a.go')` keeps the drive letter and does not yield workspace `C`. TypeScript, Python, and PHP cover the relative-import scenario. Go's only identity split is untested.

---

### code-graph:workspace-integration

#### Requirements checked

`Drive letters are not workspace names` (added spec and verify):

1. Parsing a graph identity does not treat a Windows drive letter as a workspace name. `^[A-Za-z]:[/\\]` is a drive-letter path. The character before the first `:` does not become `{workspaceName}`.
2. The drive letter stays part of the path.
3. This applies to exclusion, hotspot classification, SQLite workspace inclusion, and CLI graph display.
4. A workspace filter of `C` does not match a drive-letter path. Scenarios: `C:/repo/src/a.ts` is not workspace `C`; hotspot classification or SQLite inclusion does not place that path in workspace `C`.

#### Implementation status

Met.

Shared parse: `split-workspace-identity.ts:19-26` (see indexer).

Exclusion: `matches-exclude.ts:16-22` repeats the same regex and returns null for a drive-letter path, so `excludeWorkspaces` containing `C` does not exclude `C:/repo/src/a.ts` (`:36-38`). The regex is local and equivalent; it is not a second, weaker rule.

Hotspot classification and filter: `compute-hotspots.ts:19-21` and `:223-225`.

SQLite inclusion: `sqlite-graph-database.ts:1476-1484` filters `searchSymbols` rows with `splitWorkspaceIdentity(row.file_path)?.workspace`. A drive-letter path yields `undefined`, which is not workspace `C`. `excludeWorkspaces` uses the same split. File and document search (`:1621`, `:1733`, `:1774-1784`) compare the stored `workspace` column, not a colon split of the path.

CLI display uses a local copy with the same regex and the same null-on-drive-letter behavior:

- `packages/cli/src/commands/graph/resolve-impact-file-selectors.ts:57-81` `splitWorkspaceIdentity`
- `toGraphDisplayPath` (`:97-99`) returns the canonical path when the identity is null, so `C:/repo/src/a.ts` is displayed unchanged
- `impact.ts:16-17` and `:467`, `:574`, `:739`, `:865` call that copy
- `search.ts:9` and `:243-244`, `:258`
- `hotspots.ts:7` and `:180-181`, `:196`, `:215-216`

#### Discrepancies

None.

#### Test coverage

- `matches-exclude.spec.ts:52` — `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.
- `compute-hotspots.spec.ts:480-491` — hotspot workspace filter `C` excludes the drive-letter path.
- `packages/cli/test/commands/graph/resolve-impact-file-selectors.spec.ts:50-57` — `toGraphDisplayPath` of `C:/repo/src/a.ts` is `C:/repo/src/a.ts`. `impact.ts`, `search.ts`, and `hotspots.ts` display through that function.

#### Missing tests

SQLite inclusion: no test that `searchSymbols` (or the filter at `sqlite-graph-database.ts:1476-1478`) drops `C:/repo/src/a.ts` when `workspace` is `C`. The hotspot half of the verify scenario is tested. The SQLite half is not.

---

### code-graph:sqlite-graph-store

#### Requirements checked

`Locked recreation preserves the index lease` (added spec and verify), plus the recreate file set this change requires:

1. When `recreate()` deletes the SQLite database or its WAL sidecars and deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it retries a bounded number of times and then surfaces the original error.
2. `recreate()` deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm`. It does not delete `graph/index.lock`.
3. Scenarios: a WAL sidecar that keeps failing with `EBUSY` surfaces the original error after retries; a live `index.lock` is still present after database files are removed.

#### Implementation status

Met in both recreate implementations.

`packages/code-graph/src/infrastructure/storage-generation.ts:122-176`:

- `LOCK_CODES` is `EPERM`, `EBUSY`, `EACCES`.
- `retryLocked` and `retryLockedAsync` attempt the operation five times (attempts 0–4).
- A lock error on attempts 0–3 waits (`RETRY_DELAYS_MS` is 50, 100, 150, 200 ms) and retries.
- On attempt 4 (`attempt === RETRY_DELAYS_MS.length`) the caught error is rethrown unchanged.
- Any other code is rethrown immediately.

`SQLiteGraphStore.recreate()` (`sqlite-graph-store.ts:749-761`) rejects when the client is open, then `retryLockedAsync` + `rm(..., { force: true })` for suffixes `''`, `-wal`, and `-shm` on `graph/code-graph.sqlite`, then rotates the storage generation. It does not name `index.lock`.

`SQLiteGraphDatabase.recreate()` (`sqlite-graph-database.ts:354-368`) deletes the same three paths with synchronous `retryLocked` + `rmSync`. It does not name `index.lock`.

#### Discrepancies

None. The local retry helper is the code-graph copy of the lock-retry rule. It is not a missing import from `@specd/core`.

#### Test coverage

`packages/code-graph/test/infrastructure/sqlite/sqlite-graph-store.spec.ts`:

- `:901-916` writes `graph/index.lock`, calls `store.recreate()`, and expects `code-graph.sqlite` gone, `storage.epoch` still present, and `index.lock` still present.
- `:919-932` mocks `fs/promises.rm` (`:5-16`) to throw `EBUSY` twice on the WAL path, then expects `recreate()` to succeed and the WAL file to be gone. That proves retry of `EBUSY`. It does not exhaust the five attempts.

#### Missing tests

"A locked WAL file surfaces the original error after retries" is untested. Nothing keeps failing with `EBUSY` (or `EPERM` / `EACCES`) through all five attempts and asserts the original error object and `code`. `SQLiteGraphDatabase.recreate()` is the same suffix list and has no direct lock test; the store test covers the public `recreate()`.

---

### code-graph:isolated-index-worker

#### Requirements checked

`Index lease release on exit` (added spec and verify), with the supervisor signal rule:

1. The process that holds the index lease releases it on process exit.
2. On Windows it also releases the lease on `SIGBREAK`. Releasing on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` does not leave the lease held after exit.
3. Supervisor `ParentSignal` includes `SIGBREAK`. `SIGBREAK` releases the lease and forwards the signal.
4. Scenarios: process exit releases the lease; `SIGBREAK` releases the lease on Windows.

The modified Spec Dependencies section points the worker at the SQLite index lease. It does not change behavior.

#### Implementation status

Met.

`packages/code-graph/src/infrastructure/isolated-index-worker/supervisor.ts:32` — `type ParentSignal = 'SIGINT' | 'SIGTERM' | 'SIGBREAK'`.

`forwardSignal` (`:252-262`) records the signal and `child.kill(signal)`. `onSigbreak` (`:265-268`) calls `lease.release()` and then `forwardSignal('SIGBREAK')`. `onProcessExit` (`:269-271`) calls `lease.release()`. Both listeners are installed at `:284-285` and removed in `finalize` (`:137-140`) before `lease.release()` at `:147`. `release` on the lease is idempotent (`index-lock.ts:107-109`).

Production construction uses `signalCleanup: 'exit-only'` (`supervisor.ts:347-348`), so the lease object itself listens for `exit` and not for `SIGINT`/`SIGTERM` (`index-lock.ts:128-131`). The supervisor owns `SIGBREAK`. The lease's own `exit` listener (`index-lock.ts:118`, `:128`) also releases if the process exits.

`SIGTERM` is still forwarded by `onSigterm` (`:264`). Exit cleanup does not depend on `SIGTERM` being delivered.

#### Discrepancies

None.

#### Test coverage

`packages/code-graph/test/infrastructure/isolated-index-worker/supervisor.spec.ts:292-307` emits `SIGBREAK` and `exit`, expects `child.kill` with `SIGBREAK`, expects `GraphIndexWorkerSignalError` after the child exits with `SIGBREAK`, expects both listeners removed, and expects a later `acquireLock` on the same root to succeed.

`signals.spec.ts:20-53` still forwards `SIGINT` and `SIGTERM` once and leaves pre-existing listeners in place.

The exit scenario is not isolated: the `SIGBREAK` test emits `exit` in the same run. A no-op `onProcessExit` would still pass because `onSigbreak` already released the lease. Both handlers are present and the combined run does release the lease. That is partial coverage of the exit scenario, not a missing behavior.

#### Missing tests

None that leave a required behavior with no forcing assertion, beyond the combined exit/`SIGBREAK` run noted above.

---

## Counts

- Requirements checked: 4 (16 clauses)
- Discrepancies: 0
- Missing tests: 4
- Discrepancy titles: none

Missing-test titles:

1. Exhausted WAL `EBUSY` surfaces the original error after retries.
2. SQLite symbol inclusion filter `C` does not include `C:/repo/src/a.ts`.
3. Scoped binding does not treat a drive letter as a workspace.
4. Go `goPackageSurface` keeps a drive letter and does not yield workspace `C`.

# Partial: CI and testing

# Partial audit: CI and testing

Change: `windows-platform-compatibility`
Specs: `default:_global/continuous-integration`, `default:_global/testing` (Windows fixture requirement only)
Mode: read-only. Sources: `node packages/cli/dist/index.js changes spec-preview windows-platform-compatibility <specId> --format text` and the working tree. No code or spec files were modified.

Scope limits for this partial:

- Testing requirements other than **Fixtures are valid on Windows** were not re-audited.
- Leftover `'/tmp'` strings inside mocks, and standing `as unknown as` port doubles, are explicit non-goals of this change. They are not discrepancies.

Checked artifacts:

- `.github/workflows/ci.yml`
- `.gitignore`
- `.gitattributes`
- root `package.json` (`test`, `preflight:test`, `lint-staged`, `typecheck`, `build`)
- `pnpm-workspace.yaml` `onlyBuiltDependencies`
- `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`
- `mkdtemp` / `pathToFileURL` call sites under `packages/**/*.{spec,test}.ts`
- suite scan for `chmod`, `0o000`, `/var/www`, `file:///tmp`

---

### default:\_global/continuous-integration

#### Requirements checked

1. **Workflow file is tracked.** The repo must track `.github/workflows/ci.yml` without tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` stay ignored.
2. **Three operating systems.** The same job runs on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any runner fails the check.
3. **When the workflow runs.** Pull requests and pushes to `main`. It must not call Gemini workflows.
4. **Toolchain install.** Checkout, pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`. That install builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. No apt, brew, or Chocolatey packages.
5. **Checks.** Each job runs `pnpm typecheck`, `pnpm build`, then `pnpm test`. `typecheck` and `build` skip `@specd/public-web`. `pnpm test` includes `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, and `@specd/plugin-agent-claude`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`, `@specd/plugin-agent-standard`. It excludes `@specd/mcp` and `@specd/public-web`. No changeset status and no publish.

Audit contract checked with those requirements (not extra spec requirements):

- `.gitignore` is `.github/*`, then `!.github/workflows/` and `!.github/workflows/**`.
- The six Gemini workflow files stay untracked. Agents, skills, and `copilot-instructions.md` stay ignored.
- One workflow file, `.github/workflows/ci.yml`, with the same steps on all three runners. `fail-fast: false` is acceptable. A failing job still fails the check.
- `preflight:test` is `pnpm test`. `lint-staged` typecheck is `pnpm typecheck`.
- `@ladybugdb/core` is not in `onlyBuiltDependencies`.

#### Implementation status

| Requirement                            | Status                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow file is tracked               | Met                      | `.gitignore` lines 20–22: `.github/*`, `!.github/workflows/`, `!.github/workflows/**`. `git check-ignore -v .github/workflows/ci.yml` reports the negation `!.github/workflows/**` (not ignored). `git check-ignore -v` reports `.github/*` for `.github/copilot-instructions.md`, `.github/agents/specd.agent.md`, and `.github/skills/specd/SKILL.md`. `.agents/` and `skills-lock.json` stay ignored. `.github/workflows/` contains only `ci.yml`. `git ls-files .github` is empty and `git status` shows `?? .github/`, so the file is untracked until commit. The verify scenario is ignore evaluation, which passes. |
| Three operating systems                | Met                      | `.github/workflows/ci.yml`: `strategy.matrix.os` is `[macos-latest, ubuntu-latest, windows-latest]`, `runs-on: ${{ matrix.os }}`, one `check` job, same steps on every OS. `fail-fast: false`. No `continue-on-error`. GitHub fails the workflow when any matrix job fails; `fail-fast: false` only lets the other jobs finish.                                                                                                                                                                                                                                                                                            |
| When the workflow runs                 | Met                      | `on.pull_request` (default activities, including open and synchronize) and `on.push.branches: [main]`. No `workflow_call`, no Gemini job. The workflow directory has no Gemini file.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Toolchain install                      | Met                      | Steps: `actions/checkout@v4`, `pnpm/action-setup@v4` version `10.6.5` (matches root `packageManager`), `actions/setup-node@v4` `node-version: 22` with `cache: pnpm`, `pnpm install --frozen-lockfile`. No apt, brew, or choco. `onlyBuiltDependencies` lists `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, `better-sqlite3`, `esbuild`, plus `core-js` and `core-js-pure`.                                                                                                                                                                                                                          |
| Checks                                 | Met                      | Job order is `pnpm typecheck`, `pnpm build`, `pnpm test`. Root `typecheck` and `build` use `--filter=!@specd/public-web`. Root `test` filters are the twelve packages named above. `@specd/mcp` and `@specd/public-web` are absent from that script. Those package names exist (`packages/mcp`, `packages/guide`, `packages/sdk`, `packages/skills`, `packages/plugin-manager`, `apps/public-web`, and the five `plugin-agent-*` packages). `preflight:test` is `pnpm test`. The workflow does not run changeset or publish (`preflight:changeset` remains a local script and is not a CI step).                           |
| Six Gemini workflow files stay ignored | Met for the current tree | Only `ci.yml` is under `.github/workflows/`. No Gemini workflow has ever been committed (`git log --all -- .github/workflows` is empty). `ci.yml` does not call them. Agents, skills, `copilot-instructions.md`, and `.github/commands/gemini-*.toml` match `.github/*` and are ignored. The spec constraint says Gemini workflow files may be tracked because they share `.github/workflows/`; this change does not add them.                                                                                                                                                                                             |
| `lint-staged`                          | Met                      | `*.ts` is `eslint --fix`, `prettier --write`, `pnpm typecheck`. No `bash -c` in `package.json` or `ci.yml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `@ladybugdb/core`                      | Met                      | Working-tree diff deletes `@ladybugdb/core` from `onlyBuiltDependencies`. The name is absent from `pnpm-workspace.yaml`, root `package.json`, and `pnpm-lock.yaml`.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

#### Discrepancies

None.

Observations (not counted):

- `ci.yml` and `.gitattributes` are untracked. Ignore rules allow `ci.yml` to be added. The index records the file when the change is committed.
- `fail-fast: false` is allowed. The check still fails if one job fails, because no step sets `continue-on-error`.
- Node is `22`, which is what the spec requires.
- `git check-ignore -v` on a hypothetical `.github/workflows/gemini-review.yml` (and the same for `gemini-triage.yml`, `gemini-scheduled-triage.yml`, `gemini-invoke.yml`, `gemini-plan-execute.yml`, `gemini-dispatch.yml`) reports `!.github/workflows/**`. Those paths are not ignored if a file is added later. The spec allows that. The six files are not in the tree today, and `ci.yml` does not call them.
- `.gitattributes` is `* text=auto eol=lf` plus `*.md`, `*.yaml`, `*.yml`, `*.json` with `text eol=lf`. That file is outside this spec.

#### Test coverage

No Vitest (or other in-repo test) asserts the workflow, the gitignore negation, or the root script filters. Coverage is file inspection plus `git check-ignore`.

| Verify scenario                                 | Covered by                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Only workflows are re-included                  | `git check-ignore` on `ci.yml` (not ignored) and on `copilot-instructions.md`, an agent file, and a skill file (ignored) |
| One red runner fails the check                  | Workflow shape only. No `continue-on-error`. Not executed on GitHub in this audit                                        |
| Pull request starts the workflow / push to main | `on:` block. Not executed                                                                                                |
| Native modules come from pnpm install           | Step list plus `onlyBuiltDependencies`. Install was not run here                                                         |
| Three commands in order                         | Step order in `ci.yml`                                                                                                   |
| `pnpm test` package set                         | Root `test` script string. `preflight:test` is `pnpm test`                                                               |

#### Missing tests

1. No test that Git ignores `.github/copilot-instructions.md`, `.github/agents/`, and `.github/skills/`, and does not ignore `.github/workflows/ci.yml`.
2. No test that `ci.yml` is the only workflow and that it contains the three runners, the trigger set, the toolchain pins, the command order, and none of apt, brew, choco, public-web, changeset, publish, or Gemini.
3. No test that a failed matrix job fails the workflow (GitHub aggregation).
4. No test that root `test` and `preflight:test` filters match the spec package list and omit `@specd/mcp` and `@specd/public-web`.

#### Spec dependency chain

Depends on `default:_global/testing` (CI runs the Vitest suite those conventions describe). This partial checked only the Windows fixture requirement of that spec. Filesystem temp directories use `os.tmpdir()`. Real worker module URLs use `pathToFileURL` on a path under `os.tmpdir()`. `get-graph-health.spec.ts` does not use `chmod 0o000`. No contradiction with the CI spec: CI runs `pnpm test` on `windows-latest`, which is the suite this requirement constrains.

---

### default:\_global/testing

#### Requirements checked

**Fixtures are valid on Windows** only.

Filesystem tests must locate temporary directories with `os.tmpdir()` and build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...`. An unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the process cannot read, or the scenario must be skipped where that bit has no effect.

Not checked in this partial: test runner, unit-test completeness, typed port mocks, integration cleanup beyond the Windows temp-dir rule, test naming, and the snapshot ban. Mock `'/tmp'` literals and standing `as unknown as` doubles are non-goals.

#### Implementation status

| Requirement                                           | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temp directories come from the OS                     | Met                                   | Every `mkdtemp` / `mkdtempSync` call under `packages/**/*.{spec,test}.ts` passes `os.tmpdir()` or `tmpdir()` (`join(tmpdir(), ...)` or `path.join(os.tmpdir(), ...)`). Sampled creators include `get-graph-health.spec.ts`, `move-dir.spec.ts`, `write-atomic.spec.ts`, `ensure-tmp-gitignore.spec.ts`, `spec-repository.spec.ts`, sqlite store specs, and isolated-worker specs. `change-create.spec.ts` creates its integration directory with `fs.mkdtemp(path.join(os.tmpdir(), ...))` at line 365.  |
| File URLs come from the local path                    | Met for URLs the tests actually build | `barrel.spec.ts`, `signals.spec.ts`, and `supervisor.spec.ts` call `pathToFileURL(join(tmpdir(), ...))`. `protocol.spec.ts` uses the literal `file:///task.js` as a JSON envelope fixture for `isStartMessage`. That string is not `file:///tmp` and is not a path the test creates.                                                                                                                                                                                                                     |
| No dependency on `/tmp`, `/var/www`, or `file:///tmp` | Met                                   | Repo search of `*.{ts,js}` found no `/var/www`, no `file:///tmp`, no `chmod`, and no `0o000`. Remaining `'/tmp...'` strings are mock config paths, stub return values, and expected CLI arguments (for example `changePath: '/tmp/test-changes/my-change'` in `change-create.spec.ts`, and `path: '/tmp/changes/add-auth'` passed into a hook template in `hook-runner.spec.ts`). Those tests do not `mkdtemp('/tmp')` or write a fixture there. Per this change they are non-goals and are not flagged. |
| Unreadable files do not use chmod zero                | Met                                   | `get-graph-health.spec.ts` creates `projectRoot` with `mkdtempSync(join(tmpdir(), 'specd-health-read-error-'))`, writes a normal file, and mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. The assertion is `FreshnessState.Unknown` and `CONTENT_UNKNOWN`, not `CONTENT_DIRTY`. The temp root is removed in `finally` with `rmSync`. No `chmod` call exists in the suite.                                                                                      |

#### Discrepancies

None.

Observation (not counted): the unreadable-file case simulates `EACCES` with a `readFile` mock. It does not set an OS ACL, and it is not `it.skip` on `win32`. The verify scenario forbids `chmod 0o000`. That API is absent, and the test still observes a read failure on every OS, including Windows.

#### Test coverage

| Verify scenario                        | Covered by                                                                                                                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Temporary paths come from the OS       | Integration and filesystem specs that call `mkdtemp(Sync)` with `os.tmpdir()`, including `get-graph-health.spec.ts`                                                                                                                             |
| Unreadable files do not use chmod zero | `get-graph-health.spec.ts` “keeps content inspection failures unknown instead of marking the graph dirty” asserts `CONTENT_UNKNOWN` via `deniedReads`. Nothing asserts the absence of `chmod` by name; the suite contains no `chmod` or `0o000` |

#### Missing tests

No additional missing test beyond the CI gaps. The two Windows verify scenarios are exercised by existing specs. There is no separate meta-test that fails the build when a future spec introduces `chmod 0o000` or `mkdtemp('/tmp')`. That guard was not counted, because the current suite already follows the rule and this change does not require a lint for mock `'/tmp'` strings.

#### Spec dependency chain

Depends on `default:_global/architecture` and `default:_global/conventions`. Those specs were not expanded. The new Windows fixture text does not contradict the CI spec.

---

## Summary counts

| Item                      | Count                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specs audited             | 2                                                                                                                                                                                              |
| Requirements checked      | 6 (CI 5, testing Windows fixtures 1)                                                                                                                                                           |
| Requirements met          | 6                                                                                                                                                                                              |
| Requirements not checked  | 6 testing conventions outside the Windows fixture rule                                                                                                                                         |
| Discrepancies             | 0                                                                                                                                                                                              |
| Missing tests             | 4 (gitignore negation, workflow shape, red-runner aggregation, root `test` filters)                                                                                                            |
| Notes (not discrepancies) | `ci.yml` untracked but not ignored; Gemini workflow files absent and not called; unreadable-file case is an `EACCES` mock; mock `'/tmp'` strings and `as unknown as` doubles left as non-goals |
