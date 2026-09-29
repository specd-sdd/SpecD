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
