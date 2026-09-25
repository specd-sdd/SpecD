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
