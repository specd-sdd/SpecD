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
