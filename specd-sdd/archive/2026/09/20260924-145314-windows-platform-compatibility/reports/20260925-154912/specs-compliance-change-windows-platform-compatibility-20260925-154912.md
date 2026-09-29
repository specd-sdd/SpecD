# Spec compliance — windows-platform-compatibility

Mode: change
Date: 2026-09-25 15:49
Scope: requirements added or modified by the change.

## Totals

| Batch             | Requirements | Discrepancies | Missing tests |
| ----------------- | -----------: | ------------: | ------------: |
| code-graph        |            4 |             1 |             4 |
| hooks             |            8 |             2 |             3 |
| core paths        |           15 |             1 |            14 |
| CI, testing, docs |            7 |             0 |             0 |
| **Total**         |       **34** |         **4** |        **21** |

## Discrepancies

1. Bare drive letter `C:` is parsed as workspace `C` in exclusion and CLI graph display.
2. Nested-path scenario and runner test still supply `change.workspace`.
3. Verify still assigns variable expansion to `RunStepHooks`.
4. Non-fs storage paths and workspaces skip the inside-root check.

## Detailed Findings

---

# Spec compliance partial — code-graph (windows-platform-compatibility)

Read-only audit of requirements **added or modified** by change `windows-platform-compatibility`. Scope is the merged `specs` artifact (`changes spec-preview --artifact specs --diff`) plus the paired `verify` scenarios. Unchanged requirements were not re-audited. Markdown underscore escapes in the diff renderer (`COVERS\_SYMBOL`, `node\_modules`) are display artifacts, not requirement edits.

Graph navigation used `graph search` / `graph impact` before file reads. The index reported `CONTENT_KNOWN_STALE`; symbol locations were confirmed by reading the current source.

## code-graph:sqlite-graph-store

### Requirements Summary

**Added: Locked recreation preserves the index lease**

> When `recreate()` deletes the SQLite database or its WAL sidecars and the deletion fails with `EPERM`, `EBUSY`, or `EACCES`, it MUST retry a bounded number of times and then MUST surface the original error.
>
> `recreate()` MUST NOT delete a live `index.lock`. A lock that is held by a running index MUST survive recreation of the database files.

Verify scenarios: a WAL delete that keeps failing with `EBUSY` surfaces the original error after bounded retries; a live `index.lock` is still present after `recreate()` removes the database files.

### Implementation Status

Met.

`SQLiteGraphStore.recreate()` deletes only `code-graph.sqlite`, `code-graph.sqlite-wal`, and `code-graph.sqlite-shm` through `retryLockedAsync`, then rotates the storage-generation sidecar. `index.lock` is a sibling file (`graph/index.lock`) and is not in that suffix list. `SQLiteGraphDatabase.recreate()` does the same with synchronous `retryLocked` and `rmSync`.

`retryLocked` / `retryLockedAsync` treat lock errors as:

```ts
const LOCK_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [50, 100, 150, 200] as const
```

The loop runs five attempts (`attempt` 0 through 4). On a lock error when `attempt === RETRY_DELAYS_MS.length`, it throws the original error. Other error codes are not retried.

### Discrepancies

None.

### Test Coverage

- `creates sqlite schema artifacts under graph/ and recreates backend state destructively` writes `graph/index.lock` and expects it to remain after `recreate()`.
- `retries a locked WAL file while recreating the store` fails `node:fs/promises` `rm` of the WAL path twice with `EBUSY`, then expects recreation to succeed. The store method calls that `rm`.
- `surfaces the original lock error after five WAL failures` sets five `EBUSY` failures, expects `recreate()` to reject with `code: 'EBUSY'`, and expects both the WAL file and `index.lock` to remain.

`EPERM` and `EACCES` are the same `LOCK_CODES` predicate as `EBUSY`. The verify scenario names `EBUSY` only.

### Missing Tests

None.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 0 missing tests.

## code-graph:isolated-index-worker

### Requirements Summary

**Added: Index lease release on exit**

> The process that holds the index lease MUST release it on process exit. On Windows it MUST also release the lease on `SIGBREAK`. Releasing the lease on `SIGTERM` remains required where that signal is delivered. Failure to deliver `SIGTERM` MUST NOT leave the lease held after the process has exited.

Verify scenarios: process exit releases the lease; `SIGBREAK` on Windows releases the lease.

The spec dependency change (from `_none_` to `code-graph:sqlite-graph-store`) is not a behavioral requirement. The new requirement is consistent with that store’s index lease: the worker must release the same lock `recreate()` is required to leave in place.

### Implementation Status

Met.

The supervisor acquires the lease with `signalCleanup: 'exit-only'`, so the lock helper still registers an `exit` release and does not install its own `SIGINT` / `SIGTERM` exit-the-parent handlers. The supervisor then installs:

- `onProcessExit` → `lease.release()`
- `onSigbreak` → `lease.release()` then forward `SIGBREAK` to the child
- `onSigterm` → forward `SIGTERM` to the child

`finalize()` also calls `lease.release()` before the run’s promise settles, and `release()` is idempotent (token-checked `rmSync`, listener removal). A parent `exit` therefore drops the lease even when `SIGTERM` is not delivered. `SIGTERM` still ends in lease release when the child exit settles the run, which is the existing signal-forwarding path.

### Discrepancies

None.

### Test Coverage

`releases the lease on SIGBREAK and process exit` emits `SIGBREAK` and `exit` on the same run, expects the child to be killed with `SIGBREAK`, then expects a second `acquireLock` not to throw.

That assertion does not prove the two verify scenarios separately. `onSigbreak` releases before `onProcessExit` runs, so a failure of either handler can be masked by the other.

`SIGTERM` release is covered by the pre-existing settle/finalize path (lease released in `finalize()`), not by a new scenario in this delta.

### Missing Tests

1. **Process exit releases the lease without `SIGBREAK`.** The verify scenario “Process exit releases the lease” is only exercised in the same test as `SIGBREAK`.
2. **`SIGBREAK` releases the lease without a following parent `exit` event.** The verify scenario “SIGBREAK releases the lease on Windows” is only exercised together with `exit`.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 2 missing tests.

## code-graph:indexer

### Requirements Summary

**Added: Portable graph paths**

> Relative paths persisted by the indexer MUST use `/` as the separator. That conversion MUST NOT collapse `.` or `..` segments.
>
> A key that begins with a Windows drive letter, matching `^[A-Za-z]:[/\\]`, MUST NOT be split into a workspace name and a path. A bare drive letter, matching `^[A-Za-z]:$`, is the same kind of path: the directory of a file at the drive root. `goPackageSurface('C:/a.go')` is `C:`, and that string MUST NOT parse as workspace `C`. The drive letter is part of the path, not a workspace prefix. Every graph-identity split MUST use that rule, including language-adapter relative imports, package surfaces, scoped binding, and hotspot caller classification. A PHP namespace separator is not a graph identity and MUST stay local.

Verify scenarios: splitting `C:/repo/src/a.ts` does not yield workspace `C`; persisting `src\..\secret` stores `src/../secret`; a language-adapter split of `C:/repo/src/a.ts` does not yield workspace `C`; `goPackageSurface` of `C:/a.go` is surface `C:` and the workspace name is not `C`.

### Implementation Status

Met for the indexer-owned splits.

Separator conversion is `toPortableGraphPath`:

```ts
return value.replaceAll('\\', '/')
```

That replacement does not normalize `.` or `..`. Discovery also uses `relative(...).replaceAll('\\', '/')` for walked paths. `node:path.relative` / `join` normalize `..` between absolute filesystem paths before that slash conversion. The requirement’s “conversion” is the separator conversion, and the verify input `src\..\secret` is what `toPortableGraphPath` preserves. Config-relative paths computed with `path.relative` can still drop `..` that existed only as lexical segments of an absolute path; that is path resolution, not the slash conversion.

The shared splitter is:

```ts
const DRIVE_LETTER_PATH = /^[A-Za-z]:(?:[/\\]|$)/
```

`splitWorkspaceIdentity` returns `null` when `isDriveLetterPath` is true, before `indexOf(':')`.

**`splitWorkspaceIdentity('C:')` in `packages/code-graph/src/domain/services/split-workspace-identity.ts` returns `null`.** `C:` matches `/^[A-Za-z]:(?:[/\\]|$)/` because of the `$` alternative, so the function returns before it can set `workspace` to `C`.

Call sites named by this requirement import that helper:

- TypeScript, Python, and PHP relative-import splits use `splitWorkspaceIdentity`.
- `goPackageSurface` returns the directory before the last `/`. For `C:/a.go` that slice is `C:`. It calls `splitWorkspaceIdentity` only when the path has no `/`. Parsing that surface with the shared helper returns `null`, so it is not workspace `C`.
- Scoped binding uses `splitWorkspaceIdentity` for the workspace prefix.
- Hotspot caller classification uses `isDriveLetterPath` and returns `''` for a drive-letter path, then the shared splitter.

PHP namespace separators stay inside adapter-local candidate mapping (`replaceAll('\\', '/')` on a class/namespace string). They are not passed through the graph-identity splitter.

A second, narrower copy of the drive-letter check lives in CLI display and in `matchesExclude`. Those copies omit `$`. They are outside the call sites this requirement lists. The workspace-integration requirement names them explicitly; the discrepancy is recorded there.

### Discrepancies

None for this requirement’s listed indexer, adapter, package-surface, scoped-binding, and hotspot-classification splits.

### Test Coverage

- `split-workspace-identity.spec.ts`: `isDriveLetterPath('C:')` is true, `splitWorkspaceIdentity('C:')` is null, `splitWorkspaceIdentity('C:/repo/src/a.ts')` is null, and `toPortableGraphPath('src\\..\\secret')` is `src/../secret`. A workspace identity `core:src/../secret` keeps the parent segment.
- Go adapter tests: surface of `C:/repo/src/a.go` is `C:/repo/src` and is not `C:`; surface of `C:/a.go` is `C:`.
- TypeScript, Python, and PHP relative-import tests resolve from `C:/repo/src/...` and keep the `C:/repo/src` prefix.
- Hotspot test `does not treat a drive letter as workspace C` uses paths `C:/repo/src/a.ts` and `C:/repo/src/b.ts` with workspace filter `C` and expects no entries.
- Scoped-binding test uses `C:/repo/src/a.ts` and expects prefixes not to contain `C:`.

### Missing Tests

None against this requirement’s verify scenarios. The bare-drive parse is asserted on the shared helper. The Go test asserts the surface string `C:` and does not itself call the splitter; the splitter test covers that parse.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 0 discrepancies, 0 missing tests.

## code-graph:workspace-integration

### Requirements Summary

**Added: Drive letters are not workspace names**

> Parsing a graph identity MUST NOT treat a Windows drive letter as a workspace name. A string that matches `^[A-Za-z]:[/\\]` or `^[A-Za-z]:$` is a drive-letter path. The character before the first `:` in that string MUST NOT become `{workspaceName}`. This applies to exclusion, hotspot classification, SQLite workspace inclusion, package surfaces, and CLI graph display. A workspace filter of `C` MUST NOT match a drive-letter path or the bare drive letter `C:`.

Verify scenarios: parsing `C:/repo/src/a.ts` does not yield workspace `C` and keeps the drive letter in the path; a workspace filter `C` does not include stored path `C:/repo/src/a.ts`; parsing `C:` does not yield workspace `C`.

### Implementation Status

Met for hotspot classification, SQLite workspace inclusion, and package surfaces, because those use the shared helper `/^[A-Za-z]:(?:[/\\]|$)/`.

Unmet for exclusion and CLI graph display. Both have a local check that requires a slash:

```ts
;/^[A-Za-z]:[/\\]/
```

That pattern matches `C:/...` and `C:\...`. It does not match `C:`.

**Shared helper** (`packages/code-graph/src/domain/services/split-workspace-identity.ts`): `splitWorkspaceIdentity('C:')` returns `null`.

**CLI copy** (`packages/cli/src/commands/graph/resolve-impact-file-selectors.ts`):

```ts
const DRIVE_LETTER_PATH = /^[A-Za-z]:[/\\]/

export function splitWorkspaceIdentity(value: string) {
  if (isDriveLetterPath(value)) return null
  const index = value.indexOf(':')
  if (index <= 0) return null
  return { workspace: value.slice(0, index), relativePath: value.slice(index + 1) }
}
```

**`splitWorkspaceIdentity('C:')` in the CLI copy returns `{ workspace: 'C', relativePath: '' }`.** `isDriveLetterPath('C:')` is false, `indexOf(':')` is 1, and the slice before the colon is `C`.

`toGraphDisplayPath` then does:

```ts
const identity = splitWorkspaceIdentity(canonicalPath)
if (identity === null || identity.relativePath.length === 0) return canonicalPath
```

So the displayed path string for `C:` stays `C:` because `relativePath` is empty. The workspace field is still `C`. CLI graph hotspots text and JSON set `workspace` from this same function (`splitWorkspaceIdentity(filePath)?.workspace`). CLI public-export impact sets `workspace` from `splitWorkspaceIdentity(canonicalSurface)?.workspace ?? 'default'`. A package surface of `C:` (the value `goPackageSurface('C:/a.go')` is required to produce) therefore becomes workspace `C` on that CLI path.

**Exclusion** (`matchesExclude` local `extractWorkspace`):

```ts
if (/^[A-Za-z]:[/\\]/.test(filePath)) return null
const idx = filePath.indexOf(':')
if (idx === -1) return filePath
if (idx === 0) return null
return filePath.slice(0, idx)
```

`extractWorkspace('C:')` returns `'C'`. `matchesExclude('C:', undefined, ['C'])` is therefore true: exclusion treats the bare drive letter as workspace `C`. `C:/repo/src/a.ts` is correctly ignored by this regex, which is what the existing test checks.

Hotspot inclusion and SQLite search use the shared splitter, so a workspace filter `C` does not include `C:/repo/src/a.ts` or `C:` (`null` workspace is not `C`).

### Discrepancies

**Bare drive letter `C:` is parsed as workspace `C` in exclusion and CLI graph display**

- The spec might be wrong if CLI display and exclusion were only meant to reject slash-form drive paths (`^[A-Za-z]:[/\\]`), and a bare `C:` was not supposed to be a graph identity those layers see. The merged sentence says otherwise: a string matching `^[A-Za-z]:[/\\]` **or** `^[A-Za-z]:$` is a drive-letter path, the character before the first `:` must not become `{workspaceName}`, and this applies to exclusion and CLI graph display. The indexer requirement in the same change says `goPackageSurface('C:/a.go')` is `C:` and that string must not parse as workspace `C`. The spec is consistent across those two requirements.
- The code might be wrong: the shared helper implements both alternatives (`/^[A-Za-z]:(?:[/\\]|$)/`) and returns `null` for `C:`. The CLI regex and the exclusion regex are `/^[A-Za-z]:[/\\]/` and then fall through to `slice` before the colon, so `C` becomes the workspace name. Evidence: CLI `splitWorkspaceIdentity('C:')` returns `{ workspace: 'C', relativePath: '' }`; exclusion `extractWorkspace('C:')` returns `'C'`.
- Both are partially involved in the display path only: `toGraphDisplayPath('C:')` returns the original string because `relativePath` is empty, so a path-only assertion can pass while the workspace label and the public-surface workspace argument are still `C`. That short-circuit does not satisfy “must not become `{workspaceName}`”.

### Test Coverage

Covered for the shared parser, hotspot inclusion, and SQLite inclusion of slash-form paths:

- `splitWorkspaceIdentity('C:')` is null in the code-graph unit test.
- Hotspots with workspace `C` exclude `C:/repo/src/a.ts`.
- SQLite `searchSymbols` with workspace `C` does not return a symbol stored at `C:/repo/src/a.ts`.
- `matchesExclude('C:/repo/src/a.ts', undefined, ['C'])` is false.
- CLI `toGraphDisplayPath(config, 'C:/repo/src/a.ts')` is `C:/repo/src/a.ts`.

Not covered: bare `C:` through CLI `splitWorkspaceIdentity` / hotspot workspace label / public-surface workspace, and bare `C:` through `matchesExclude`.

### Missing Tests

1. **CLI graph display of `C:`.** No test asserts that `splitWorkspaceIdentity('C:')` in the CLI module is null, or that a hotspot/impact workspace field for the identity `C:` is not `C`. The existing display test only uses `C:/repo/src/a.ts`, which the narrower regex already accepts.
2. **Exclusion of the bare drive letter.** No test asserts that `matchesExclude('C:', …, ['C'])` does not treat `C:` as workspace `C`. The exclusion test only uses `C:/repo/src/a.ts`.

### Summary counts: requirements, discrepancies, missing tests

1 requirement, 1 discrepancy, 2 missing tests.

## Audit totals

| Spec                             | Requirements | Discrepancies | Missing tests |
| -------------------------------- | -----------: | ------------: | ------------: |
| code-graph:sqlite-graph-store    |            1 |             0 |             0 |
| code-graph:isolated-index-worker |            1 |             0 |             2 |
| code-graph:indexer               |            1 |             0 |             0 |
| code-graph:workspace-integration |            1 |             1 |             2 |
| **Total**                        |        **4** |         **1** |         **4** |

Discrepancy title:

1. Bare drive letter `C:` is parsed as workspace `C` in exclusion and CLI graph display

---

# Partial audit: hooks

Change: `windows-platform-compatibility`
Scope: requirements added or modified by the deltas for `core:hook-runner-port`, `core:template-variables`, `core:hook-execution-model`, and `core:run-step-hooks`. Unmodified requirements in those specs were not re-audited except where they contradict a modified requirement.
Graph: `specd graph search` / `specd graph impact` located `translateHookCommand`, `NodeHookRunner`, `TemplateExpander`, `RunStepHooks`, and `expandForShell`. Graph health reported `CONTENT_KNOWN_STALE` for the skills workspace. Core symbols above resolved. The index was not rewritten.

Landed contract used as the reading of the modified text:

- Developer `run:` hooks substitute `{{...}}` verbatim. SpecD does not add quotes. `expandForShell()` stays for commands SpecD itself builds. `HookRunner` does not use it for developer hooks.
- `HookVariables` is `TemplateVariables`, not a domain value object. `run()` may omit `project`. The expander merges builtin `project.root`. `change` is `{ name, path }` and must not include `workspace`.
- `RunStepHooks` records the schema command and does not expand. `HookRunner` expands, then `translateHookCommand`.
- On cmd: POSIX single quotes, including `'\''`, become double quotes; `"` inside becomes `""`; POSIX `\"` inside an existing double-quoted span becomes `""`. Spawn is `cmd.exe /d /s /c` with `windowsVerbatimArguments` and `windowsHide`.
- On sh: `""` inside a double-quoted span becomes `\"` only when a closing quote still follows.
- Absence of an `execFile` shortcut, and absence of `%` escaping on developer hooks, are not discrepancies.

## core:hook-runner-port

### Requirements Summary

Modified requirement sections: **Shell escaping**, **HookVariables shape**. The delta also rewrote Constraints and Spec Dependencies; those are checked only where they restate the two requirements.

**Shell escaping.** Substituted `run:` values are inserted verbatim. Only string, number, and boolean values are substituted. The runner does not add quotes. After substitution it translates quote syntax and does not rewrite `%`. On Windows, a single-quoted span including `'\''` becomes a double-quoted span; `"` inside that span becomes `""`; POSIX `\"` inside an existing double-quoted span becomes `""`; existing double quotes otherwise stay; spawn is `cmd.exe` with `/d /s /c`, verbatim arguments, and a hidden console. On every other platform, `""` inside a double-quoted span becomes `\"` when a closing quote still follows; an empty `""` stays empty; single-quoted spans stay single-quoted; spawn is the POSIX shell with `-c`. The runner does not translate program names, flags, or pipes, and does not use `execFile` to skip the shell.

**HookVariables shape.** `HookVariables` is the `TemplateVariables` alias, not a domain value object. `HookResult` stays a domain value object re-exported by the port. The object passed to `run()` may omit `project`. `TemplateExpander` merges builtin `project.root`. `change`, when present, has `name` and `path` and must not include `workspace`. It is absent when there is no active change.

### Implementation Status

`NodeHookRunner.run` calls `TemplateExpander.expand`, then `translateHookCommand`, then `spawnHook`. It does not call `expandForShell`. `spawnHook` on `win32` uses `spawn('cmd.exe', ['/d', '/s', '/c', command], { windowsVerbatimArguments: true, windowsHide: true })`. Off Windows it spawns an absolute `SHELL` or `/bin/sh` with `-c`. There is no `execFile` on this path. `translateHookCommand` does not rewrite `%` or unquoted program text.

`toCmdQuotes` turns a single-quoted span, including the `'\''` idiom, into one double-quoted span and doubles `"` inside it. Inside an existing double-quoted span, `\"` becomes `""`. A double-quoted span that already uses `""` is split on each `"` and re-wrapped; adjacent close and open quotes reconstruct the same `""` sequence, so an already-cmd command stays cmd. `toPosixQuotes` leaves single-quoted spans, including `'\''`, unchanged. Inside a double-quoted span it rewrites `""` to `\"` only when `hasCloserAfterPair` finds a later closing `"`. An empty `""` has no closer after the pair, so it stays `""`.

The port types `run` as `(command: string, variables: TemplateVariables, onProgress?) => Promise<HookResult>`. It re-exports `TemplateVariables` and `HookResult`. No `HookVariables` class exists under `packages/core/src/domain`, and no `type HookVariables` alias is declared. That matches the landed reading: the parameter type is `TemplateVariables`, not a second value object. `expand` merges builtins after contextual keys, so `run(..., {})` still resolves `{{project.root}}`. `RunStepHooks` is the production caller and passes `change` without `workspace` and without `project`.

### Discrepancies

#### D1. Nested-path scenario and runner test still supply `change.workspace`

- **Spec (modified HookVariables shape):** `change`, when present, has `name` and `path` and must not include `workspace`.
- **Spec (unmodified verify scenario "Nested variable paths are resolved", same spec):** the example variables are `{ change: { name: "add-login", workspace: "auth", path: "/x" }, project: { root: "/app" } }`.
- **Code:** `RunStepHooks` builds `{ change: { name, path } }` for an active change and adds `archivedName` only on the archive fallback. It does not set `workspace`. `NodeHookRunner` does not strip extra keys. `TemplateVariables` is an open record, so a caller that passes `workspace` will expand `{{change.workspace}}`.
- **Test:** `hook-runner.spec.ts` "expands change variables when present" still passes `workspace: 'default'`.
- **Reading A (spec/test drift):** the modified shape is the landed contract. Production construction matches it. The older scenario and the runner fixture were not updated and still teach the rejected key.
- **Reading B (implementation):** the runner is not wrong to accept an open map. The must-not rule is on the object callers pass. The production caller complies. No code change is required unless the port is expected to reject `workspace`.

### Test Coverage

| Modified clause                                                                     | Where it is checked                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer quotes are not wrapped again; `%` stays one character                     | `hook-runner.spec.ts` "inserts a developer-quoted value without adding quotes" (`a b %PATH% &`)                                                                   |
| Several tokens stay one quoted string                                               | `hook-runner.spec.ts` "keeps several variables inside one pair of quotes"                                                                                         |
| Windows single-quoted path, `/d /s /c`, verbatim arguments, hidden console          | `hook-runner-spawn.spec.ts` "spawns the translated single-quoted command on Windows" and "spawns cmd.exe with verbatim arguments on Windows"                      |
| `'\''`, `"` inside single quotes, POSIX `\"` to `""`, `%` untouched, empty `''`     | `translate-hook-command.spec.ts` cmd cases                                                                                                                        |
| `""` to `\"` when a closer follows; empty `""` stays; single quotes stay; `%` stays | `translate-hook-command.spec.ts` posix cases; `hook-runner.spec.ts` "treats doubled quotes inside double quotes as one literal quote" checks the live POSIX shell |
| POSIX spawn is `-c`, absolute `SHELL` or `/bin/sh`                                  | `hook-runner-spawn.spec.ts`                                                                                                                                       |
| `project` may be omitted; builtin `project.root` is merged                          | `hook-runner.spec.ts` "expands builtin template variables in the command" with `{}`                                                                               |
| Non-primitive left unexpanded                                                       | `template-expander.spec.ts` "does not expand nested object values" through `expand()`, not through `run()`                                                        |
| `change` without `workspace`                                                        | Production path covered under `core:run-step-hooks`, not by the runner fixture in D1                                                                              |

`execFile` is not used for hooks. That absence is not a gap.

### Missing Tests

1. **Non-primitive values through `HookRunner.run`.** The modified verify scenario "Non-primitive values are not substituted" says `run` leaves the token unexpanded. Only `TemplateExpander.expand` is tested.
2. **Existing cmd `""` inside a double-quoted span stays `""`.** Probed `translateHookCommand('echo "say ""hi"""', 'cmd')` is unchanged, and `echo "a""b""c"` is unchanged. No test locks that clause. The cmd tests cover single-quote conversion and `\"` to `""`, not an already-doubled pair left in place.

### Summary counts

- Requirements audited: 2
- Discrepancies: 1
- Missing tests: 2

## core:template-variables

### Requirements Summary

Modified requirement sections: **Shell escaping for run hooks**, **TemplateExpander class**. Spec Dependencies were rewritten to point `HookRunner` at `expand()` plus host quote translation.

**Shell escaping for run hooks.** `run:` values are inserted verbatim. SpecD does not add quotes. Several variables inside one pair of quotes stay one string. `mkdir "{{project.root}}/{{change.name}}"` with root `/repo` and name `add-auth` becomes `mkdir "/repo/add-auth"`. `expandForShell()` remains for a command SpecD builds. POSIX uses single quotes and `'\''`. The cmd dialect turns an empty value into `""`, `%` into `%%`, and `"` into `""`, then wraps the value. `HookRunner` must not use `expandForShell()` for a developer `run:` hook. `instruction:` text and artifact instructions use verbatim substitution with no shell escaping and no quote translation.

**TemplateExpander class.** `expand(template, variables?)` substitutes verbatim and is the path for `GetHookInstructions`, `GetArtifactInstruction`, and `HookRunner`. `expandForShell(template, variables?, dialect?)` quotes substituted values for a command SpecD builds. `dialect` defaults to `posix`. `HookRunner` does not call it for developer hooks. Builtins win on collision. Both methods share traversal; only substitution differs.

### Implementation Status

`expand` calls `_replace` with shell escaping off, so a primitive is `String(value)` with no added quotes. `expandForShell` defaults `dialect` to `posix` and passes the dialect into `shellEscape`. POSIX wraps in single quotes and uses `'\''`. Cmd maps empty to `""`, then `%` to `%%` and `"` to `""`, then wraps in double quotes. Unknown tokens and non-primitives call `_unknown` and keep `{{token}}`. `_merge` copies contextual namespaces first and then overwrites colliding keys with builtins.

`NodeHookRunner` calls `expand` only. `GetHookInstructions` and `GetArtifactInstruction` call `expand` only. They do not call `translateHookCommand`. A search of `packages/core/src` shows `expandForShell` defined on `TemplateExpander` and not called from any other production file. Graph impact lists many dependents of the method because they import the class or sit downstream of hook composition, not because they invoke it.

### Discrepancies

None. The implementation matches both modified requirements.

The composed-path rule is demonstrated by the runner (`printf %s "{{project.root}}/{{change.name}}"` prints `/my/project/add-auth`) rather than by an `expand()` assertion of the verify string `mkdir "/repo/add-auth"`. That is coverage placement, not a behavior mismatch.

### Test Coverage

| Modified clause                                       | Where it is checked                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expandForShell` POSIX `'\''`                         | `template-expander.spec.ts` "shell-escapes substituted values" (`it's-fine`)                                                                                                                |
| cmd `%` to `%%`, `"` to `""`, empty value to `""`     | `template-expander.spec.ts` "quotes cmd values and doubles percents and quotes", "doubles an embedded quote for cmd", "quotes an empty cmd value"                                           |
| `expand()` does not add quotes around a composed path | `hook-runner.spec.ts` "keeps several variables inside one pair of quotes" (stdout has no extra quotes)                                                                                      |
| `expand()` leaves spaces, `%`, and `&` verbatim       | `hook-runner.spec.ts` "inserts a developer-quoted value without adding quotes"                                                                                                              |
| Numbers and booleans substituted verbatim             | `template-expander.spec.ts` "substitutes numbers and booleans verbatim"                                                                                                                     |
| Builtins win                                          | `template-expander.spec.ts` "prefers builtins over contextual variables on collision"                                                                                                       |
| Instruction text uses `expand`, not quote translation | `get-hook-instructions.ts` maps instruction text through `expand`; `get-hook-instructions.spec.ts` "does not inject a singular workspace into instruction context" expects `vars=my-change` |
| `HookRunner` does not call `expandForShell`           | The developer-quoted runner test would fail if values were wrapped or if `%` became `%%`                                                                                                    |

### Missing Tests

1. **`expand()` apostrophe stays verbatim.** The modified scenario "expand does not escape" expects `Read it's-a-test`. `expandForShell` covers the escaped apostrophe. No `expand()` test substitutes a value containing `'`. The runner verbatim test uses spaces, `%`, and `&`, not an apostrophe.

### Summary counts

- Requirements audited: 2
- Discrepancies: 0
- Missing tests: 1

## core:hook-execution-model

### Requirements Summary

Modified requirement sections: **Template variable expansion**, **Default hook execution for transitions and archives**. Constraints were rewritten to say developer `run:` expansion is verbatim and `HookRunner` then translates only quote syntax the host shell does not understand.

**Template variable expansion.** `HookRunner` expands `{{change.name}}`, `{{change.path}}`, and `{{project.root}}`. `{{change.workspace}}` is not a supported token and must not be injected. Unknown paths stay literal. Substituted values are verbatim. The developer writes quotes. Host quote translation is defined by `core:hook-runner-port`. The added scenario "Substituted values are not quoted by SpecD" expects `mkdir "{{project.root}}/{{change.name}}"` to become `mkdir "/repo/add-auth"` with no extra quotes.

**Default hook execution for transitions and archives.** `TransitionChange` and `ArchiveChange` delegate to `RunStepHooks`. `RunStepHooks` collects hooks and records the schema command. `HookRunner` expands `{{...}}` and translates quotes. `RunStepHooks` must not expand the command.

### Implementation Status

`TransitionChange` calls `RunStepHooks.execute` with the change name, step, and phase. `ArchiveChange` does the same for archiving pre and post, and does not expand the command before that call. `RunStepHooks` passes `hook.command` to `HookRunner.run` and stores that same string on the result. Expansion and `translateHookCommand` happen inside `NodeHookRunner`.

`{{change.workspace}}` stays unexpanded when the key is absent. `RunStepHooks` and `GetHookInstructions` do not inject it. The three supported tokens resolve when the map or the expander builtins contain them.

### Discrepancies

#### D2. Verify still assigns variable expansion to `RunStepHooks`

- **Spec (modified requirement):** `RunStepHooks` collects hooks and records the schema command. `HookRunner` expands and translates quotes. `RunStepHooks` must not expand the command.
- **Verify (same requirement, scenario "Hook execution delegated to RunStepHooks"):** the THEN clause still says `RunStepHooks` is used for collection, variable expansion, and execution. The delta did not update this scenario. The added scenario "Substituted values are not quoted by SpecD" describes the expanded command without saying which type expands it.
- **Code:** matches the modified requirement. `run-step-hooks.spec.ts` "records the schema command with template tokens intact" expects `echo "Resultado: {{change.name}}"` both as the string passed to `run` and as `result.hooks[0].command`.
- **Reading A (spec drift):** the scenario is leftover from when the use case expanded before calling the runner. Updating the THEN clause to "collection, schema-command recording, and execution" would match the requirement and the code.
- **Reading B (implementation bug):** would apply only if `RunStepHooks` were required to expand. The modified requirement forbids that. Implementing the stale THEN clause would violate the requirement and the result-shape rule in `core:run-step-hooks`.

### Test Coverage

| Modified clause                                    | Where it is checked                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Verbatim composed path, no extra quotes            | `hook-runner.spec.ts` "keeps several variables inside one pair of quotes"                                                       |
| Unknown token preserved                            | `hook-runner.spec.ts` "preserves unexpanded variables when path is unknown"                                                     |
| `{{change.workspace}}` left unexpanded when absent | `template-expander.spec.ts` "leaves {{change.workspace}} unexpanded when workspace is absent"                                   |
| Callers do not inject `workspace`                  | `run-step-hooks.spec.ts` "does not inject a singular workspace into template variables" and the archived-variable test          |
| Delegation without use-case expansion              | `archive-change.ts` and `transition-change.ts` call `RunStepHooks.execute`; `run-step-hooks.spec.ts` records the schema command |

No transition or archive test asserts the expanded command string. The expansion obligation sits on `HookRunner`, which has the tests above.

### Missing Tests

None beyond D2, which is a stale scenario rather than an untested behavior. The token-preserving `RunStepHooks` test and the runner composed-path test cover the modified behavior.

### Summary counts

- Requirements audited: 2
- Discrepancies: 1
- Missing tests: 0

## core:run-step-hooks

### Requirements Summary

Modified requirement sections: **Ports and constructor**, **Result shape**.

**Ports and constructor.** Constructor dependencies are `ChangeRepository`, `ArchiveRepository`, `HookRunner`, `ReadonlyMap<string, ExternalHookRunner>`, and `SchemaProvider`. `HookRunner` expands developer `run:` commands with `TemplateExpander.expand()` and then translates quotes. `RunStepHooks` does not call the expander. It builds `TemplateVariables` and passes them to `HookRunner.run()`. The added verify scenario "Developer hook text is passed to HookRunner verbatim" expects `echo "Resultado: {{change.name}}"` to be passed and recorded unchanged, and expects `RunStepHooks` not to call `expandForShell()`.

**Result shape.** Each hook result `command` is the schema `run:` command, still containing the developer's `{{...}}` tokens. `HookRunner` expands and translates that string. The result must not record a second expansion performed by `RunStepHooks`. An external hook records `external:<type>`.

### Implementation Status

`RunStepHooks` matches that constructor. It does not import `TemplateExpander`. `_executeHooks` sets `command` to `hook.command` for a `run` entry and to `` `external:${hook.externalType}` `` for an external entry, emits that string on `hook-start`, passes `hook.command` to `this._hooks.run`, and stores the same `command` on the result entry.

Active changes build `{ change: { name, path } }`. The archiving post fallback builds `{ change: { name, archivedName, path } }`. Neither object includes `project` or `workspace`. `archivedName` is required by the unmodified HookVariables construction requirement in this spec. The modified `core:hook-runner-port` sentence names `name` and `path` and does not mention `archivedName`. That is a narrower wording on the port, not a second expansion and not a `workspace` key.

### Discrepancies

None. The use case records and forwards the schema command. It cannot call `expandForShell` because it has no expander.

### Test Coverage

| Modified clause                                                  | Where it is checked                                                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema command passed to `run` and recorded with tokens          | `run-step-hooks.spec.ts` "records the schema command with template tokens intact"                                                             |
| External command is `external:<type>`                            | `run-step-hooks.spec.ts` "dispatches explicit external hooks through accepted-type runners" expects `external:docker`                         |
| Active `change` is `{ name, path }` and has no `workspace`       | "builds correct TemplateVariables from change context" and "does not inject a singular workspace into template variables"                     |
| Archived `change` includes `archivedName` and has no `workspace` | "builds template variables from ArchivedChange properties"                                                                                    |
| `expandForShell` is not called                                   | No spy. The use case has no expander dependency, and the token-preserving test fails if the use case expands before `run` or before recording |

### Missing Tests

None for the modified requirements. The added scenario's `expandForShell` clause is enforced by construction and by the unchanged schema string, not by a direct spy.

### Summary counts

- Requirements audited: 2
- Discrepancies: 0
- Missing tests: 0

## Batch totals

- Requirements audited: 8
- Discrepancies: 2
- Missing tests: 3
- Discrepancy titles:
  - D1. Nested-path scenario and runner test still supply `change.workspace`
  - D2. Verify still assigns variable expansion to `RunStepHooks`

---

# Spec compliance partial — core Windows paths

Change: `windows-platform-compatibility`
Scope: requirements added or modified by this change in the listed core specs (spec deltas + verify deltas). Pre-existing requirements that this change did not touch are out of scope.
Graph: `specd graph search` / `specd graph impact` located `isPathInside`, `normalizeVcsRoot`, `retryOnLock`, `toPortablePath`, `normalizeNewlines`, `isWindowsDeviceName`, and their callers. The index reported `CONTENT_KNOWN_STALE` for the skills workspace only; core symbols resolved.

Known-excluded gaps come from `design.md` (“Coverage notes from the third audit stay out of the task list”): drive-letter `load()` and archive cases already decided by `isPathInside`; no `realpath` spy; no byte-equality success tests; the private empty-string return versus `null` is not observable; `EPERM`/`EACCES` share `LOCK_CODES` with the tested `EBUSY` path. They are still listed as missing tests and tagged `known-excluded`.

---

## core:config-loader

### Requirements Summary

Modified and added requirements:

1. **Storage path containment** (modified). When `rootPath` is non-null, `changes`, `drafts`, `discarded`, and `archive` must be the root or inside it. Inside means the relative path is empty, or it does not start with `..` and is not absolute. Drive-letter case must not look outside. A `root + separator` prefix must not be the test. An outside path must throw `ConfigValidationError` naming the storage key. When `rootPath` is null, containment does not apply. `rootPath` must be the normalized VCS adapter root, not raw CLI stdout.
2. **isExternal inference for workspaces** (modified). Same inside-root rule, including drive-letter case. Outside `specsPath` means external. Null `rootPath` forces `isExternal` false.
3. **Config file stays inside the repository root** (added). The resolved config file uses the same inside-root rule. Separator mismatch and drive-letter case must not reject an inside file. An outside file throws `ConfigValidationError`.

The spec-dependency edit points `rootPath` at `core:vcs-adapter` normalization. That matches `createDefaultConfigLoader`, which passes `vcsAdapter.rootDir()` and passes `null` for `NullVcsAdapter`.

Verify scenarios added: drive-letter storage accepted; longer storage prefix rejected; specs inside the root are not external; git-style separators accept an inside config; a config outside the root is rejected.

### Implementation Status

`FsConfigLoader._buildConfig` calls `isPathInside` for the config file (`rootConfigPath`), the resolved config directory, and each fs storage `legacyPath`. `isExternal` is `!isPathInside(rootPath, specsBinding.legacyPath)` when `rootPath` is non-null. `isPathInside` resolves with `path.win32` for drive-letter paths, uppercases the drive letter, and uses `path.win32.relative`, so `C:/repo` contains `c:/repo/specd.yaml` and does not contain `C:/repository`. Null `rootPath` skips the block. The loader does not read VCS stdout itself.

### Discrepancies (both sides)

**Non-fs storage paths and workspaces skip the inside-root check.**

- Spec: every resolved storage path, and every workspace `specsPath`, must be judged with the inside-root rule whenever `rootPath` is non-null. The rewritten text does not limit that to the `fs` adapter.
- Code: storage confinement runs only when `binding.binding.adapter === 'fs'`. `isExternal` is computed only when the specs adapter is `fs`; every other workspace is forced to `isExternal: false`.
- Spec may be ahead of the adapter model. Non-fs bindings use virtual paths, and a filesystem inside-root test on those paths may be meaningless. The Windows edit replaced the separator-prefix test; it did not discuss non-fs bindings. The fs-only guard was already how the loader behaved before this rewrite.
- Code may be wrong if a non-fs workspace or storage path can still resolve to a real directory outside the repository. Those paths are accepted, and the workspace is never external.
- This is not a drive-letter bug in `isPathInside`. It is a coverage hole in who the rewritten MUST applies to.

### Test Coverage

- Config file outside `C:/repo` throws `ConfigValidationError` matching `config file resolves outside VCS root` (`config-loader-root-containment.spec.ts`).
- Config `C:/repo/specd.yaml` with root `C:\repo` loads (`config-loader-root-containment.spec.ts`). That successful load also walks relative storage paths under the mocked Windows `path.resolve`, so an inside relative storage tree is accepted, but the scenario’s explicit `C:/repo/changes` versus `c:/repo` pair is not asserted.
- Older loader tests still reject a storage path outside a real temp root and set `isExternal` from real directories. They do not use mixed drive-letter case.
- `createDefaultConfigLoader` is the wiring for “normalized adapter root, not raw stdout”. No test in this set asserts that `load()` refuses a raw `c:/repo` stdout string that `rootDir()` would have uppercased; the adapter tests cover normalization before the loader sees the value.

### Missing Tests

- Drive-letter storage acceptance (`rootPath` `c:/repo`, storage `C:/repo/changes`). **known-excluded** (drive-letter `load()` already decided by `isPathInside`).
- Longer storage prefix `C:/repository/changes` throws for that storage key. **known-excluded** (same).
- `isExternal` false when root is `C:/repo` and `specsPath` is `c:/repo/specs`. **known-excluded** (same).

### Summary counts

- Requirements: 3
- Discrepancies: 1
- Missing tests: 3

---

## core:vcs-adapter

### Requirements Summary

**Built-in adapters normalize repository roots** (added).

Git, Mercurial, and Subversion adapters from `createVcsAdapter` must normalize the root before caching it and before `rootDir()` returns it. Normalization must produce an absolute path, uppercase a Windows drive letter, and must not `realpath` the root. The normalized value must stay a valid working directory for a later CLI call of that VCS. `NullVcsAdapter.rootDir()` must still throw and must not invent a root. Modified-file paths from the three adapters must use `/` and must not collapse `.` or `..`. On Windows, spawns of `git`, `hg`, and `svn` must hide the console window.

### Implementation Status

`GitVcsAdapter`, `HgVcsAdapter`, and `SvnVcsAdapter` pass constructor roots and sync stdout through `normalizeVcsRoot`. That trims, resolves with `path.win32` when the value has a drive letter or a backslash, and uppercases the drive letter. It does not call `realpath`. `modifiedFiles` runs later commands with `this.rootDir()` as `cwd`. Paths go through `toPortablePath`, which only replaces `\` with `/`. `NullVcsAdapter.rootDir()` throws `no VCS detected`. `git`/`hg`/`svn` `execFile` and `execFileSync` use `spawnOptions`, which sets `windowsHide: true` only when `platform === 'win32'`.

### Discrepancies (both sides)

None. The normalized string is what later CLI calls use as `cwd`. Hiding the console is implemented on the spawn options those calls pass, not only on an unused helper.

### Test Coverage

- Git stdout `c:/repo` returns `C:\repo`. Hg and svn stdout `c:\repo` return `C:\repo`.
- Cached POSIX `/repo` is returned without a sync CLI call.
- Null `rootDir()` throws `no VCS detected`.
- Git, hg, and svn each return `src/../secret` for a backslash `src\..\secret` status path.
- `spawnOptions(..., 'win32')` is `{ cwd, windowsHide: true }` for all three tools, and Linux omits `windowsHide`.

### Missing Tests

- No test shows a follow-up `git`/`hg`/`svn` invocation whose `cwd` is the uppercased root after stdout was `c:/repo` or `c:\repo`. The “valid working directory for a later CLI call” clause is implemented (`modifiedFiles` / `ref` call `this.rootDir()`) and is not asserted. Not known-excluded.
- No spy asserts `realpath` is not called. The unit test title says “without calling realpath” and only checks the returned string. **known-excluded** (no `realpath` spy).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:content-hasher-port

### Requirements Summary

1. **Text newline normalization** (added). `ContentHasher.hash` and the shared text `sha256` helper must turn every `\r\n` and every remaining `\r` into `\n` before the digest. Every string is text. There is no binary string mode. Artifact hashes are a different contract: pre-hash cleanup collapses whitespace, so an artifact hash is not required to preserve line endings. Callers that hash raw file bytes must not send those bytes through the text helper.
2. **Determinism** (modified). The same input must hash the same after that normalization. Inputs that match once `\r\n` and `\r` become `\n` must return identical results.

### Implementation Status

`normalizeNewlines` replaces `\r\n` first, then remaining `\r`. `sha256` and `NodeContentHasher.hash` both digest `normalizeNewlines(content)` as UTF-8. Neither branches on binary strings. `computeArtifactHash` normalizes newlines after pre-hash cleanup and then calls `hashContent` (which normalizes again). That second pass is idempotent. `sha256` accepts a string, so raw `Buffer` bytes are not the helper’s input type.

### Discrepancies (both sides)

None. Artifact hashes are allowed to lose line-ending differences. `computeArtifactHash` normalizing before `hashContent` does not contradict that, and it is not `hashFiles`.

### Test Coverage

`hash-newlines.spec.ts` hashes `alpha\r\nbeta\r` and `alpha\nbeta\n` through `sha256` and `NodeContentHasher` and expects one digest. The mixed string fails if either CRLF or a lone CR is left in place. The same pair is equal through `computeArtifactHash` with `sha256`. An LF-only vector keeps the previous digest.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 2
- Discrepancies: 0
- Missing tests: 0

---

## core:snapshot-hasher

### Requirements Summary

**Determinism** (modified). The same text always hashes the same after the injected `hashContent` runs. `hashFiles` must forward each string unchanged. It must not detect a binary string and must not rewrite newlines. Newline normalization belongs to the text hasher from `core:content-hasher-port`. Raw file bytes are not strings and must not be passed through `hashFiles`.

The dependency section now cites that newline contract. `hashFiles` imports neither the hasher nor `normalizeNewlines`.

### Implementation Status

`hashFiles` assigns `result[filePath] = hashContent(content)` for each entry. It does not inspect or rewrite `content`.

### Discrepancies (both sides)

None. Equal CRLF and LF digests are the injected hasher’s job. Forwarding is what this requirement demands of `hashFiles`.

### Test Coverage

`hash-files.spec.ts` spies `hashContent` and expects the same `line\r\nline` string it was given.

### Missing Tests

- Scenario “Text file CRLF matches LF”: nothing calls `hashFiles` twice, once with `\r\n` and once with `\n`, and asserts equal digests. Equality is tested on `sha256` / `NodeContentHasher` / `computeArtifactHash`, not on `hashFiles` plus a normalizing hasher. Not known-excluded.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:fs-change-repository

### Requirements Summary

**Windows path containment and rename recovery** (added).

Confinement must use the inside-root rule. Drive-letter case must not look outside. A directory move that fails with `EPERM` or `EXDEV` must fall back to copy. A rename onto an existing or locked destination that fails with `EPERM`, `EBUSY`, or `EACCES` must be retried a bounded number of times and then surface the original error. Identical destination bytes must not be treated as success for change artifacts.

### Implementation Status

`_bucketKindForDir`, `_pruneEmptyParents`, and `isStrictlyInside` call `isPathInside`. Artifact paths go through `resolveConfinedPath`, which rejects `..` and then calls `isPathInside`. `moveDir` treats `EPERM` and `EXDEV` (and the older `ENOTEMPTY` / `EEXIST`) as a copy-then-remove. Lock-owner and manifest writes use `writeFileAtomic`, which renames through `retryOnLock`. That helper attempts the operation five times and rethrows the original `EPERM`, `EBUSY`, or `EACCES`. It never compares destination bytes. `saveArtifact` still uses `fs.writeFile` for artifact bodies; the retry requirement is on rename, and the byte-equality shortcut the requirement forbids is absent.

### Discrepancies (both sides)

None. Prefix containment for `C:/work/app` versus `C:/work/application` is `isPathInside` returning false, which `path-platform.spec.ts` asserts. There is no success path that treats matching destination bytes as a completed rename.

### Test Coverage

- `isPathInside('C:/work/app', 'C:/work/application')` is false. `resolveConfinedPath('C:/work/app', '../application')` throws `PathTraversalError`.
- `moveDir` copies on `EXDEV` and on `EPERM`.
- `writeFileAtomic` succeeds after one `EBUSY`, and after five `EBUSY` failures rejects with the same error object. `retryOnLock` asserts five attempts and the original error.

### Missing Tests

- No test that identical destination bytes are not success, and no test that differing destination bytes are not success. **known-excluded** (no byte-equality success tests).
- `EPERM` and `EACCES` are not driven through `retryOnLock` or `writeFileAtomic`. **known-excluded** (`EPERM`/`EACCES` share `LOCK_CODES` with tested `EBUSY`). `moveDir` does test `EPERM` as a copy fallback, which is a different clause and is covered.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:fs-spec-repository

### Requirements Summary

**Publication rename recovery** (added).

Publication renames that fail with `EPERM`, `EBUSY`, or `EACCES` must be retried a bounded number of times and then surface the original error. The temporary `.gitignore` equality check must treat `\r\n` and `\r` as `\n`. Identical normalized content counts as success for that file only. Differing artifact bytes must not count as success.

### Implementation Status

`publish` wraps the staging swap renames in `retryOnLock`. `publicationRenameError` returns the original error when its `code` is `EPERM`, `EBUSY`, or `EACCES`, so the `code` is preserved. `ensureTmpGitignore` compares `normalizeNewlines(existing)` with `normalizeNewlines` of the canonical `*\n!.gitignore\n` marker and returns without rewriting when they match. Publication does not compare artifact bytes to skip a write. Spec artifact writes go through `writeFileAtomic` and overwrite.

### Discrepancies (both sides)

None. The newline success shortcut is only in `ensureTmpGitignore`. Artifact publication has no “bytes match, so this succeeded” branch.

### Test Coverage

- Publication whose rename target always fails with `EBUSY` rejects with `{ code: 'EBUSY' }`.
- A temp `.gitignore` of `*\r\n!.gitignore\r\n` is left unchanged.

### Missing Tests

- Differing artifact bytes are not treated as success. **known-excluded** (no byte-equality success tests).
- `EPERM` and `EACCES` are not exhausted on a publication rename. **known-excluded** (same lock-code set as tested `EBUSY`).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:fs-archive-repository

### Requirements Summary

**Archive paths stay inside the repository root** (added).

Resolved archive paths must use the inside-root rule. Drive-letter case must not look outside.

### Implementation Status

`resolveArchiveDirPathSync` rejects a normalized relative path that is `..`, starts with `../`, or is POSIX-absolute, then resolves it and calls `isPathInside`. An outside path throws `CorruptedManifestError`. Drive-letter case is handled inside `isPathInside`, not by a separator prefix.

### Discrepancies (both sides)

None against the added requirement. `isPathInside('c:/repo', 'C:/repo/archive')` is true and `isPathInside('C:/repo', 'C:/repository/archive')` is false by the same helper the archive resolver calls. The archive function itself is not given those absolute pairs in a test.

### Test Coverage

No archive-repository test asserts the two new scenarios. Shared helper tests cover the same inside-root outcomes for `C:/repo` versus `c:/repo/specd.yaml` and `C:/repository`.

### Missing Tests

- Drive-letter case stays inside (`c:/repo` contains `C:/repo/archive`). **known-excluded** (drive-letter archive cases already decided by `isPathInside`).
- A longer directory name is outside (`C:/repo` does not contain `C:/repository/archive`). **known-excluded** (same).

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 2

---

## core:file-reader-port

### Requirements Summary

**Path traversal protection** (modified).

When `basePath` is set, an escaping resolved path must throw `PathTraversalError`. Escape detection must use the inside-root rule. Drive-letter case must not look outside. A `basePath + separator` prefix must not be the test.

### Implementation Status

`FsFileReader` stores `normalizeVcsRoot(basePath)` and checks `isPathInside` on `normalizeVcsRoot(absolutePath)` before reading. A miss throws `PathTraversalError`. No `basePath` skips the check.

### Discrepancies (both sides)

None.

### Test Coverage

- `FsFileReader('C:/repo').read('c:/repo/missing.txt')` resolves `null` and does not throw `PathTraversalError`.
- `read('C:/repository/file.txt')` rejects with `PathTraversalError`.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## core:refresh-implementation-tracking

### Requirements Summary

**Project-relative paths keep a separator boundary** (added).

A path is project-relative only when it is the project root or a descendant. Matching must require a separator boundary after the root. A longer string prefix must not count as inside. Drive-letter case must not change the result. The portable form of the project root is the empty string. That empty string means inside and must not be added as an exclusion prefix. An empty result is not the signal for a path outside the root; outside is `null`.

The dependency edit says the project-relative root is the normalized adapter root. Composition injects `isPathInside` and `normalizeVcsRoot`. The use case file does not import `infrastructure/`.

### Implementation Status

`_toPortableProjectRelativePath` returns `null` when `isPathInside` is false. Otherwise it recomputes a win32 relative path when the normalized root has a drive letter or a backslash, then replaces `\` with `/`. The root’s relative path is `''`. `_collectExclusions` adds a path only when `rel !== null && rel.length > 0`, so the empty root is omitted and a `null` outside path is omitted.

### Discrepancies (both sides)

None. The observable exclusion list cannot by itself prove the root was classified as `''` rather than `null`. The code returns `''` for the root and `null` for an outside path.

### Test Coverage

- Internal path `C:/work/application` with project root `C:/work/app` is not an exclusion; `c:/work/app/specd` becomes `specd`.
- Internal path equal to `C:/work/app` does not put `''` on `excludePaths`; the descendant `specd` is still listed.

### Missing Tests

- The private `''` versus `null` return is not observed directly. **known-excluded** (private empty-string versus null is not observable). The exclusion-list half of the scenario is tested.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:change

### Requirements Summary

**Change names reject Windows device names** (added).

A slug that is a Windows device name must be rejected on every operating system. Reserved names are `con`, `prn`, `aux`, `nul`, `com1` through `com9`, and `lpt1` through `lpt9`, compared case-insensitively as the whole slug. A larger segment such as `con-foo` stays legal when it matches the existing slug pattern.

### Implementation Status

`Change` construction rejects a name when `CHANGE_NAME_PATTERN` fails or `isWindowsDeviceName` is true. The helper is `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i`. It does not consult `process.platform`. `con-foo` fails the regex, so it stays legal. `com0` and `com10` are not reserved, matching “com1 through com9”.

### Discrepancies (both sides)

None.

### Test Coverage

`change-device-name.spec.ts` rejects `con` and `com1` with `InvalidChangeError` and accepts `con-foo`. `windows-device-name.spec.ts` covers `con`, `prn`, `AUX`, `NUL`, `com1`, `lpt9`, and rejects `con-foo`.

### Missing Tests

None for the added scenarios. The entity test does not repeat every reserved name; the shared predicate test covers the rest of the set, including case.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## core:workspace

### Requirements Summary

**Workspace identity** (modified).

Names must match `/^[a-z][a-z0-9-]*$/`. `default` and `root` stay reserved. Windows device names (`con`, `prn`, `aux`, `nul`, `com1` through `com9`, `lpt1` through `lpt9`) must be rejected on every operating system when the whole workspace name is the device name. `con-foo` must remain legal. Names in one configuration must be unique.

### Implementation Status

`FsConfigLoader._buildConfig` throws `ConfigValidationError` when `isWindowsDeviceName(name)` is true, before specs are resolved. `workspaces.root` is still rejected as reserved. Missing `workspaces.default` is still rejected. There is no `process.platform` check. Uniqueness remains a map-key property of the YAML object.

### Discrepancies (both sides)

None. Enforcement lives in the loader because workspace identity is a `specd.yaml` rule, and there is no separate workspace entity.

### Test Coverage

- Loader rejects workspace `con`, `prn`, and `aux` with a Windows-device-name error.
- Loader accepts workspace `con-foo`.
- An existing loader test rejects `workspaces.root` as reserved.

### Missing Tests

- Scenario “the workspace name is `nul`” is not run at the loader. The shared predicate rejects `NUL`, and the loader calls that predicate, but the verify scenario’s name is not in the loader tests. Not known-excluded. `com1`–`com9` and `lpt1`–`lpt9` are also untested at the loader; the predicate test samples `com1` and `lpt9`.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 1

---

## core:spec-id-format

### Requirements Summary

**Capability segments reject Windows device names** (added).

A capability-path segment that is a Windows device name must be rejected on every operating system. The reserved set is the same whole-segment, case-insensitive list. `con-foo` stays legal. This rule does not treat a Windows drive letter as a workspace name; spec IDs are not filesystem paths.

### Implementation Status

`SpecPath._validateSegments` rejects a segment when `isWindowsDeviceName` is true, on every platform. `con-foo` is not a match. `parseSpecId` still splits on the first colon and does not interpret `C:` as a drive or as a device name. A colon inside a capability segment is already illegal (`:` is in the reserved-character check). No new drive-letter workspace rule was added.

### Discrepancies (both sides)

None.

### Test Coverage

`SpecPath.parse` rejects `con`, `prn`, `auth/aux`, and `auth/com1`, and accepts `con-foo`.

### Missing Tests

None for the added scenarios.

### Summary counts

- Requirements: 1
- Discrepancies: 0
- Missing tests: 0

---

## Rollup

| Spec                                 | Requirements | Discrepancies | Missing tests |
| ------------------------------------ | -----------: | ------------: | ------------: |
| core:config-loader                   |            3 |             1 |             3 |
| core:vcs-adapter                     |            1 |             0 |             2 |
| core:content-hasher-port             |            2 |             0 |             0 |
| core:snapshot-hasher                 |            1 |             0 |             1 |
| core:fs-change-repository            |            1 |             0 |             2 |
| core:fs-spec-repository              |            1 |             0 |             2 |
| core:fs-archive-repository           |            1 |             0 |             2 |
| core:file-reader-port                |            1 |             0 |             0 |
| core:refresh-implementation-tracking |            1 |             0 |             1 |
| core:change                          |            1 |             0 |             0 |
| core:workspace                       |            1 |             0 |             1 |
| core:spec-id-format                  |            1 |             0 |             0 |
| **Total**                            |       **15** |         **1** |        **14** |

Discrepancy title: Non-fs storage paths and workspaces skip the inside-root check.

Missing tests that are not known-excluded (3): snapshot `hashFiles` CRLF/LF digest equality; VCS follow-up CLI `cwd` is the normalized root; workspace loader does not execute the `nul` scenario.

Known-excluded missing tests (11): three config-loader drive-letter `load()` cases; two archive drive-letter cases; VCS `realpath` spy; change-repository byte-equality; change-repository `EPERM`/`EACCES` rename retries; spec-repository differing artifact bytes; spec-repository `EPERM`/`EACCES` publication retries; refresh private `''` versus `null`.

---

# CI, testing, and docs specs

Read-only audit of requirements this change added or modified. Spec text is the change `spec-preview` for `windows-platform-compatibility`. Unchanged clauses in `default:_global/testing` and `default:_global/docs` are out of scope. Neither the spec nor the code was treated as automatically right.

Scope:

- `default:_global/continuous-integration` — new spec (no base). All five requirements.
- `default:_global/testing` — added requirement `Fixtures are valid on Windows`.
- `default:_global/docs` — modified bullet inside `Requirement: User guide documentation and frontmatter`. The base text required documenting template substitution “including shell escaping for `run:` commands.” The merged text requires verbatim `run:` insertion, quote-syntax translation only, non-Windows execution via an absolute `SHELL` or otherwise `/bin/sh`, and forbids describing that substitution as shell escaping. The matching verify scenario was updated the same way. A punctuation-only change in an ADR sentence is not a requirement change.

Checked files: `.github/workflows/ci.yml`, `.gitignore`, root `package.json` scripts, `pnpm-workspace.yaml`, `docs/guide/workflow.md`, `packages/core/src/infrastructure/node/hook-runner.ts`, and the Vitest suite under `packages/`.

## default:\_global/continuous-integration

### Requirements Summary

1. **Workflow file is tracked.** The repository must track `.github/workflows/ci.yml`. Tracking that directory must not require tracking the rest of `.github/`. Agent files, skill copies, and `copilot-instructions.md` must stay ignored. Gemini workflow files may be tracked because they share `.github/workflows/`; this spec does not define their behavior.
2. **Three operating systems.** `ci.yml` must run the same job on `macos-latest`, `ubuntu-latest`, and `windows-latest`. A failure on any one of those runners must fail the check.
3. **When the workflow runs.** The workflow must run on pull requests and on pushes to `main`. It must not call the Gemini workflows.
4. **Toolchain install.** Each job must check out the repository, install the pnpm `10.6.5` binary, install Node 22, and run `pnpm install --frozen-lockfile`. That install must be what builds `better-sqlite3`, `@ast-grep/lang-go`, `@ast-grep/lang-php`, `@ast-grep/lang-python`, and `esbuild`. The workflow must not install extra apt, brew, or Chocolatey packages for them.
5. **Checks.** Each job must run `pnpm typecheck`, `pnpm build`, and `pnpm test`, in that order. `typecheck` and `build` must skip `@specd/public-web`. `pnpm test` must run Vitest for `@specd/core`, `@specd/cli`, `@specd/code-graph`, `@specd/guide`, `@specd/sdk`, `@specd/skills`, `@specd/plugin-manager`, `@specd/plugin-agent-claude`, `@specd/plugin-agent-codex`, `@specd/plugin-agent-copilot`, `@specd/plugin-agent-opencode`, and `@specd/plugin-agent-standard`. It must not include `@specd/mcp` or `@specd/public-web`. The workflow must not run changeset status or publish.

### Implementation Status

All five requirements are met.

**Workflow file is tracked.** `.gitignore` contains `.github/*`, then `!.github/workflows/` and `!.github/workflows/**`. `git check-ignore -q` exits 1 for `.github/workflows/ci.yml` and for a hypothetical `.github/workflows/gemini-review.yml` (not ignored). It exits 0 for `.github/copilot-instructions.md`. Verbose matching ignores `.github/skills/foo` via `.github/*`, and ignores `.agents/foo`, `.claude/skills/x`, `.codex/skills/x`, `.opencode/skills/x`, `.gemini/foo`, and `skills-lock.json` via their own patterns. `.github/agents/` and `.github/skills/` are therefore ignored; only the workflows directory is re-included. `ci.yml` is present on disk. `git ls-files` does not list it yet (`?? .github/`). The verify scenario is Git’s ignore decision, which matches. An uncommitted workflow in an active change is not a failure of that scenario.

**Three operating systems.** One job, `check`, uses `strategy.matrix.os` with `macos-latest`, `ubuntu-latest`, and `windows-latest`, and the same step list on `${{ matrix.os }}`. `fail-fast: false` does not keep a red matrix job from failing the workflow; it only lets the other runners finish. GitHub marks the check failed when any matrix job fails.

**When the workflow runs.** Triggers are `pull_request` (default types include opened and synchronize) and `push` to `main`. The file has no `workflow_call`, no Gemini job, and no step that invokes a Gemini workflow. Gemini command files under `.github/commands/` stay ignored and are not called.

**Toolchain install.** Steps are `actions/checkout@v4`, `pnpm/action-setup@v4` with `version: 10.6.5`, `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm`, then `pnpm install --frozen-lockfile`. There is no apt, brew, or choco step. Root `packageManager` is `pnpm@10.6.5`. `pnpm-workspace.yaml` `onlyBuiltDependencies` lists `better-sqlite3`, the three `@ast-grep/lang-*` packages, and `esbuild`, plus `core-js` and `core-js-pure`. `@specd/code-graph` depends on `better-sqlite3` and the three `@ast-grep/lang-*` packages. `esbuild` is present in `pnpm-lock.yaml` (`esbuild@0.27.3` and `esbuild@0.27.7`). The frozen install is what builds those modules. Extra allowlist entries are not forbidden.

**Checks.** After install, the job runs `pnpm typecheck`, then `pnpm build`, then `pnpm test`, and nothing else. Root scripts:

- `typecheck`: `turbo typecheck --filter=!@specd/public-web`
- `build`: `turbo build --filter=!@specd/public-web`
- `test`: `turbo test --concurrency=3` with filters for exactly the twelve packages named above

Each of those twelve packages has `"test": "vitest run"`. `@specd/mcp` has a Vitest script and is not in the filter. `@specd/public-web` is not in the filter. The workflow does not run changeset status or publish. The spec requires `typecheck` and `build` to skip public-web; it does not require them to skip `@specd/mcp`, so including mcp in those two tasks is allowed.

### Discrepancies

None.

### Test Coverage

Workflow files have no Vitest. File inspection is the check, and the files match the spec.

| Verify scenario                                             | Result                                                                                               |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Only workflows are re-included                              | `ci.yml` is not ignored; `.github/copilot-instructions.md` is ignored                                |
| One red runner fails the check                              | Same job on the three-OS matrix; a failed matrix job fails the workflow                              |
| A pull request starts the workflow and does not call Gemini | `on.pull_request` is set; no Gemini call                                                             |
| A push to main starts the workflow                          | `on.push.branches` is `main`                                                                         |
| Native modules come from pnpm install                       | pnpm `10.6.5`, Node 22, `pnpm install --frozen-lockfile`; no apt, brew, or choco                     |
| The three commands run in order                             | `pnpm typecheck`, `pnpm build`, `pnpm test`                                                          |
| `pnpm test` includes guide, sdk, skills, and plugins        | Root `test` script lists those packages plus core, cli, and code-graph, and omits mcp and public-web |

### Missing Tests

None. The verify scenarios are properties of `ci.yml`, `.gitignore`, and the root scripts. Inspection confirms them. There is no separate test runner to add inside the workflow.

### Summary counts

- Requirements checked: 5
- Met: 5
- Discrepancies: 0
- Missing tests: 0

## default:\_global/testing

### Requirements Summary

**Fixtures are valid on Windows** (added). Filesystem tests must locate temporary directories with `os.tmpdir()` and must build file URLs from the local path. Tests must not depend on hardcoded `/tmp`, `/var/www`, or `file:///tmp/...` paths. A test that needs an unreadable file must not use `chmod 0o000` as that condition on Windows. The setup must produce a file the Windows process cannot read, or the scenario must be skipped where that permission bit has no effect.

Verify scenarios: a created temporary directory is under `os.tmpdir()` and does not hardcode `/tmp` or `file:///tmp/`; on Windows, an unreadable file is not produced with `chmod 0o000`.

### Implementation Status

Met.

Created fixtures use `os.tmpdir()` or `tmpdir()` with `mkdtemp` or `mkdtempSync`. Examples: `packages/core/test/infrastructure/fs/config-loader.spec.ts`, `spec-repository.spec.ts`, `change-repository.spec.ts`, and `packages/code-graph/test/application/use-cases/get-graph-health.spec.ts`. Worker and barrel tests build module URLs with `pathToFileURL` from a path under `tmpdir()` in `packages/code-graph/test/barrel.spec.ts`, `infrastructure/isolated-index-worker/signals.spec.ts`, `supervisor.spec.ts`, and `dist.spec.ts`.

A search of `*.{ts,js,mjs}` found no `chmod`, `chmodSync`, or `0o000`, no `/var/www`, no `file:///tmp`, and no `mkdtemp`, `mkdir`, `writeFile`, or `path.resolve` call aimed at a literal `/tmp` path.

`get-graph-health.spec.ts` creates the directory with `mkdtempSync` under `tmpdir()`, writes a real file, and mocks `node:fs/promises` `readFile` to throw `EACCES` when the path is in `deniedReads`. That is a file the process cannot read without using `chmod 0o000`.

`'/tmp/...'` strings remain in mocks, stub return values, and expected CLI arguments (for example change paths in CLI command specs and `path: '/tmp/changes/add-auth'` in `hook-runner.spec.ts`). Those tests do not create a directory at `/tmp`. This change’s design lists leftover `/tmp` strings inside mocks as outside the Windows contract. The requirement forbids depending on those paths for fixtures and file URLs. String fixtures that are never created do not violate it.

### Discrepancies

None.

### Test Coverage

The requirement is a property of the suite. Inspection is the check.

| Verify scenario                                         | Result                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Temporary paths come from the OS                        | Created temp directories use `os.tmpdir()` / `tmpdir()`. No created `/tmp` or `file:///tmp` fixture. File URLs that point at local modules use `pathToFileURL` on a `tmpdir()` path. |
| Unreadable files do not depend on chmod zero on Windows | No `chmod 0o000`. The unreadable-file case in `get-graph-health.spec.ts` throws `EACCES` from a mocked `readFile`.                                                                   |

### Missing Tests

None. A meta-test that greps the suite is not part of the requirement. The suite itself is the subject, and inspection matches both scenarios.

### Summary counts

- Requirements checked: 1
- Met: 1
- Discrepancies: 0
- Missing tests: 0

## default:\_global/docs

### Requirements Summary

Modified clause of **User guide documentation and frontmatter**:

Developer `run:` values are inserted verbatim. SpecD then translates only quote syntax the host shell does not understand. The guide must say that non-Windows hooks run with the absolute `SHELL` value when it is absolute, and otherwise `/bin/sh`. It must not describe that substitution as shell escaping.

The updated verify scenario requires `docs/guide/workflow.md` (reviewed with the other configuration guides) to document verbatim `run:` values, host quote translation, and non-Windows execution via absolute `SHELL` or `/bin/sh`.

### Implementation Status

Met.

`docs/guide/workflow.md` under Template variables / Substitution says `{{...}}` is replaced with the value exactly as it is, and that SpecD does not add quotes around it. It says `instruction:` text is substituted verbatim and is not a shell command, so quote translation does not apply.

The following section says a `run:` command is a shell command, macOS and Linux run it with the absolute `$SHELL` or `/bin/sh`, and Windows runs it with `cmd.exe`. It says SpecD does not translate program names, flags, or pipes, and that it does translate quote syntax the host shell does not understand. The quote table shows single quotes left unchanged on `$SHELL` or `/bin/sh` and rewritten to double quotes on `cmd.exe`. A search of `docs/guide/workflow.md` found no “escaping” and no “shell escaping.”

`NodeHookRunner` expands the command, then `translateHookCommand` for `cmd` on `win32` and `posix` otherwise, then `spawnHook`. On `win32`, `spawnHook` uses `cmd.exe` with `['/d', '/s', '/c', command]` and `windowsVerbatimArguments`. Otherwise it uses `process.env['SHELL']` when that value is absolute, and `/bin/sh` when `SHELL` is missing or relative, with `['-c', command]`. The guide’s “macOS and Linux” wording names the non-Windows hosts this repo runs; the code applies the same rule on every non-`win32` platform. That is the same rule, not a contradiction.

The source comment on `NodeHookRunner` mentions a POSIX escaped quote. The requirement constrains the guide, and the guide calls the step quote translation.

### Discrepancies

None.

### Test Coverage

The verify scenario is a review of the guide. File inspection is the check, and `docs/guide/workflow.md` matches the modified clause.

The behavior the guide describes is covered by `packages/core/test/infrastructure/node/hook-runner-spawn.spec.ts`: `cmd.exe` with verbatim arguments on Windows, single-quote translation on Windows, an absolute `SHELL` with `-c` off Windows, and `/bin/sh` when `SHELL` is not absolute. Those tests do not parse the markdown. The spec does not require a test that reads the guide.

### Missing Tests

None.

### Summary counts

- Requirements checked: 1
- Met: 1
- Discrepancies: 0
- Missing tests: 0

## Batch totals

- Requirements checked: 7
- Met: 7
- Discrepancies: 0
- Missing tests: 0
