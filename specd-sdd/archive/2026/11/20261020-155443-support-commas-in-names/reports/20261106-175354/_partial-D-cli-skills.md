# Partial D: cli:graph-index, cli:project-init, skills:workflow-automation + global specs

Read-only audit. Specs read via `changes spec-preview`. Tests not executed (static review of diffs only).

## cli:graph-index

Requirements touched by the change: "Command signature" (`--exclude-path` repeatable, each value whole, never comma-split, listing allowed). Related requirement "CLI reference documentation" (describe `--exclude-path`: repeatable, gitignore-syntax, project-relative, merges into global layer).

Implementation status: IMPLEMENTED.

- packages/cli/src/commands/graph/index-graph.ts:~70-74: option is `<glob...>` (variadic) and argParser is `(prev ?? []).concat(val)`, with no `split(',')`. Matches spec ("repeat the option or list them after it").
- docs/cli/cli-reference.md (graph index section) updated: signature `--exclude-path <glob...>`, comma-separated text removed, example `--exclude-path "packages/generated/*" "tmp/"` added. docs/cli/graph.md:37 also uses `<glob...>`.

Discrepancies:

- None between spec and code.
- Minor (docs, not spec-violating): docs/guide/cli.md:260 and docs/guide/code-graph.md:70 still say `--exclude-path <glob>` (singular, no variadic mention). Not wrong, just not updated. Low.
- Minor: the "CLI reference documentation" requirement does not mention variadic or no-comma-split, but the docs now state it. Spec is narrower than docs; harmless.
- Note: commander's `argParser` on a variadic option receives `prev` as the accumulated array, so `concat(val)` is correct for both `--exclude-path a b` and `--exclude-path a --exclude-path b`.

Test coverage (packages/cli/test/commands/graph-index.spec.ts):

- Existing test changed from `'foo,bar'` -> `['foo','bar']` to `'{a,b}/**'` -> `['{a,b}/**']` (:99-111).
- New: "accepts the listed --exclude-path form" (`a b` -> `['a','b']`), "keeps a brace glob as a single --exclude-path pattern" (:~289-311).

Missing tests: none material. The repeated-flag form (`--exclude-path a --exclude-path b`) is not asserted explicitly in the new tests. Low.

Counts: requirements 1 (+1 related docs), implemented 2/2, discrepancies 0 blocking, 2 minor docs nits.

## cli:project-init

Requirements touched: new "Workspace id validation" (use `isValidWorkspaceName` from core:spec-id-format, `^[a-z][a-z0-9-]+$`, >=2 chars, no Windows device names; non-interactive: exit 1, `error:` to stderr quoting full value and naming the rule, no file written; interactive: prompt rejects with same message; never trim or alter; `default` valid; CLI MUST NOT keep its own regex).

Implementation status: IMPLEMENTED.

- packages/cli/src/commands/project/init.ts:2 imports `isValidWorkspaceName` from `@specd/sdk` (re-exported from core at packages/sdk/src/core-reexports.ts:573, so the "hosts import sdk only" rule holds).
- init.ts:~63: non-interactive check runs before banner/initProject, calls `cliError(invalidWorkspaceMessage(...), format)`. Message: `Invalid workspace id '<value>': use two or more of a-z, 0-9 and "-", starting with a letter, and not a Windows device name`. It quotes the whole value and names the rule.
- init.ts:~201: the wizard validator uses `isValidWorkspaceName(value ?? '')` and the same message. The old trimmed `/^[a-z][a-z0-9-]*$/` regex is removed.

Discrepancies:

- Possible spec/code mismatch to confirm: the spec requires a `error:` prefix on stderr and exit code 1. This depends on `cliError` in packages/cli/src/handle-error.ts, which has its own diff in this change. The test asserts exit(1) and message content, not the literal `error:` prefix. Code or test gap: low. Confirm `cliError` prints `error: `.
- Possible gap: with `--format json|toon`, `cliError(msg, opts.format)` may emit structured output instead of the "stderr `error:` message" the spec states. The spec does not distinguish formats. Spec is silent, code is plausibly fine.
- The validator in the wizard returns the message via `invalidWorkspaceMessage(value ?? '')`. When value is `undefined` it quotes `''`. Harmless.
- Spec "Command signature" lists `--workspace <id>` with no mention of the grammar. Fine, covered by the new requirement.

Test coverage (packages/cli/test/commands/project-init.spec.ts, +110 lines, describe "project init workspace id validation (audit hardening)"):

- Rejects `a`, `Core`, `nul` with exit 1, error quotes id, contains `a-z`, and `initProject` not called.
- Does not trim (`ab` -> error quoting `' ab '`).
- Accepts `ab`.
- The wizard validator (via mocked @clack/prompts) rejects `a`, `Core`, `nul`, `ab` and accepts `default` and `ab`.
- Static test: no `[a-z][a-z0-9-]` regex in packages/cli/src (matches the "MUST NOT keep its own copy" rule).

Missing tests: no assertion that no file is written beyond the initProject mock not being called. The `error:` prefix and the json/toon format behaviour are not asserted. The wizard re-ask loop is not tested (only the validator function). All low.

Counts: requirements 1 new, implemented 1/1, blocking discrepancies 0, 2 items to confirm.

## skills:workflow-automation

Requirement touched: "Implementation traceability policy": when resolving or ignoring multiple files, pass one whole name per value (repeat `--file` or list after it); MUST NOT comma-join.

Implementation status: IMPLEMENTED.

- packages/skills/templates/skills/specd-implement/SKILL.md.tpl and specd-archive/SKILL.md.tpl: comma-separated examples replaced with `--file <path1> --file <path2> ...`; "comma-separated" text removed.
- The "Files with active confirmed links cannot be ignored" claim was replaced with "Ignoring a file preserves any confirmed links on it." This is an extra behaviour change in the templates. It must match cli/core `ignore` semantics; it is not covered by this spec, so check the implementation spec (cli:change-implementation) agrees. Evidence of the CLI side: packages/cli/src/commands/change/implementation.ts:109,129,149 declare `--file <paths...>` for resolve/unresolve/ignore, and the help text says commas are not separators.
- No comma-joined `--file/--spec/--add` examples remain in packages/skills, dev/ai-agents, or docs (git grep with regex found none). specd-fasttrack template has no `ignore` text and no comma lists.

Discrepancies:

- Spec scope gap: the spec does not mention the confirmed-links-on-ignore claim that the templates now assert, and the new test (template-workflow.spec.ts, "does not claim confirmed links block ignore") enforces it. Either add it to the spec or confirm it is in cli:change-implementation. Spec incomplete rather than code wrong. Low/medium.
- `--spec`/`--add`/`--add-spec` are covered by the template test but the spec text only talks about implementation files. Spec is narrower than the enforced test.

Test coverage (packages/skills/test/template-workflow.spec.ts, +37):

- No comma-joined `--file` lists or "comma-separated" in implement, archive, and fasttrack templates.
- Scans all `.tpl`/`.md` under the templates root for `--file|--spec|--add|--add-spec` followed by `a,b` or `<a>,<b>`.
- Confirmed-links wording check.

Missing tests: no check that `dev/ai-agents/skills/*` copies match. The templates are the source, so this is low. The regexes look only for a flag followed by a no-space `a,b` token, so quoted or `=`-joined forms (`--file=a,b`) would pass. Low.

Counts: requirements 1, implemented 1/1, discrepancies 0 blocking, 2 spec-scope notes.

## Project-wide specs (default:\_global/\*) vs change diff

Diff: `git diff HEAD --stat` shows 17 files in cli/skills/docs scope for this partial. Whole-change CLI diff includes many commands, core changes (untracked new files: spec-id-rules.ts, parse-spec-pattern.ts, invalid-spec-id-error.ts, invalid-spec-lock-error.ts, invalid-spec-pattern-error.ts, workspace-not-found-error.ts, get-change-spec-deps.ts, to-logical-file-path.ts, confirm.ts), and the deletion of packages/cli/src/helpers/spec-path.ts and test/helpers/spec-path.spec.ts.

- architecture: CLI imports `isValidWorkspaceName` via `@specd/sdk`, not core, so the adapter-only rule holds. Core domain files are pure functions (spec-id-rules, parse-spec-pattern, to-logical-file-path); not deeply audited here (other partials cover core). New use cases get-change-spec-deps has an application file and a composition factory, consistent with the layering. OK.
- error-handling-conventions: the new errors InvalidSpecIdError (`INVALID_SPEC_ID`), InvalidSpecLockError (`INVALID_SPEC_LOCK`, carries specId/location/fieldPath/reason, message names the field), InvalidSpecPatternError and WorkspaceNotFoundError extend `SpecdError` with UPPER_SNAKE codes and actionable messages. Conforms. Note: InvalidSpecLockError message tells what is wrong but does not itself say how to repair (e.g. "regenerate with ..."); the theme "actionable repairable error" may be satisfied in the CLI layer (handle-error.ts diff), which was not verified here. Flag for the CLI-error auditor. Medium-low.
- testing: new tests are `.spec.ts` under test/ mirroring src. Cross-platform: tests use `import.meta.url`/URL for file reads (fine). The static source-scan tests (`readdir(..., {recursive:true})`) with forward-slash keys are fine. The template-test regexes assume LF; `readTemplate` should LF-normalise. Not checked, low. The new tests do not use snapshots. project-init test includes a "(audit hardening)" describe name; this is not Given/When/Then phrasing, a cosmetic deviation from "Given/When/Then" in `_global/testing`. Low.
- docs: docs/cli/_ , docs/core/_, docs/guide/\*, docs/sdk/index.md updated. `_global/docs` requires "Update docs for public composition / template / list-contract changes" -> done for the list contract (cli-reference, graph.md, changes.md, spec-deps.md), the core errors (docs/core/errors.md adds invalid spec id/lock/pattern, workspace not found), services/use-cases/ports, and the workspaces guide (spec ID grammar). The docs/guide frontmatter was not altered. Minor stale: docs/guide/cli.md:260 and docs/guide/code-graph.md:70 `--exclude-path <glob>` singular wording; no docs/skills page references the template change (none found needing it).
- cross-platform: `isValidWorkspaceName` includes Windows device name rejection, consistent. No hardcoded separators in the CLI diff seen.
- eslint/conventions: init.ts new helper has JSDoc and an explicit return type. Named exports only. OK.

## Dangling references to packages/cli/src/helpers/spec-path.ts

- `git grep "helpers/spec-path|spec-path\.js"` across packages/_/src, packages/_/test, docs, apps: only matches are the intentional negative assertions in packages/cli/test/commands/change-create.spec.ts:176-183 and change-edit.spec.ts:266-271 (assert the import is gone and the file is gone). No dangling imports. The deleted unit test packages/cli/test/helpers/spec-path.spec.ts is also removed (status ` D`).
- Other `spec-path` hits are the `<spec-path>` doc placeholders (docs/guide/deltas.md, docs/adr/0010, dev/ai-agents/skills/specd-new/SKILL.md:95) and are unrelated.
- Not verified: a fresh build/typecheck (not run, read-only audit). packages/cli/dist may still contain a stale spec-path.js; irrelevant to source.
- Untracked-file caveat: new core files and the CLI helper confirm.ts are untracked (`??`), so they must be added to the commit.

## Other comma-split spots remaining (informational, consistent with the theme)

- packages/cli/src/helpers/parse-comma-values.ts (`parseCommaSeparatedValues`) is still used by `--skip-hooks` (archive.ts:50, transition.ts:260) and graph kinds (parse-graph-kinds.ts). Values are enumerated tokens with no commas in names, so this is acceptable and not in the change's scope.
- packages/cli/src/commands/graph/impact.ts:95 splits `--type` on commas and parse-file-categories.ts:21 splits categories. Both are enum lists. OK.
- packages/skills/src/application/specd-block-manager.ts:89,185 split agent lists inside marker comments. Internal, not a CLI option.

## Overall summary

- Specs audited: 3 (+ global set). Requirements: 3 changed or added, 3 implemented (100%).
- Blocking discrepancies: 0.
- Items for follow-up: (1) confirm `cliError` prints the `error:` prefix and its behaviour with `--format json|toon` for init validation; (2) spec for workflow-automation does not cover the "ignore preserves confirmed links" wording that the templates and test now enforce, so reconcile with cli:change-implementation; (3) docs/guide/cli.md:260 and docs/guide/code-graph.md:70 are stale on `--exclude-path` variadic form; (4) InvalidSpecLockError message lacks an explicit repair hint, so check it is added in the CLI layer; (5) new untracked files need committing.
