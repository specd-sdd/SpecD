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
