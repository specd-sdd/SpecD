# Batch D compliance audit - change `support-commas-in-names`

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation.
Method: spec-preview needs ids without folder prefix (e.g. `cli:change-deps`) but the preview output was large; I read the change deltas (`deltas/**/spec.md.delta.yaml`, `verify.md.delta.yaml`) directly, which carry every added/modified requirement and scenario. Code was read from the working tree (git diff + files). Graph search was not used (git working tree is uncommitted so the index would be stale); direct reads/grep instead.

Common code facts:

- `packages/cli/src/helpers/spec-path.ts` deleted (parseSpecId in CLI gone). New `packages/cli/src/helpers/confirm.ts` (`confirmOrExit`).
- Core normalizes/validates in use cases: create-change.ts, edit-change.ts, update-spec-deps.ts, update-persisted-spec-deps.ts, update-implementation-tracking.ts (all modified, uncommitted).

---

## 1. cli:change-implementation

Requirements (delta): Resolve / Unresolve / Ignore take whole file names (repeated `--file` or variadic, no comma split, no trim); one missing file aborts the whole op; new "Raw values and unambiguous listings" (raw `--file`/`--symbol`/`--spec`, text lists one name per line, json/toon arrays).

Implementation status

- Resolve/Unresolve/Ignore whole names, no split/trim: OK. `packages/cli/src/commands/change/implementation.ts` `--file <paths...>` (lines ~140-190), `mutateImplementationTracking` (~L292) removed `split(',')`/`trim()`, passes `files` unchanged. Variadic + repeated both supported by commander.
- Missing file aborts all / error quotes full name: OK (delegated to core; `ImplementationFileNotFoundError` message `Implementation file "<file>" does not exist`, core/src/domain/errors/implementation-file-not-found-error.ts:10). Core validates all files before first mutation (update-implementation-tracking.ts Promise.all of `_validateMutation`).
- Raw `--spec`, `--symbol`: OK (add/remove pass `opts.spec`, `files: [opts.file]`, symbols unchanged). Core `UpdateImplementationTracking` normalizes spec id (parseSpecId).
- Text listing one name per line for tracked files: OK (implementation.ts ~L191-200).
- Text listing of "other names": DEVIATION (Low). Requirement says "Text output that lists file names or other names MUST print one name per line, never joined by a separator that a name can contain". `renderImplementationState` still joins with `', '`: out-of-scope spec IDs (`outOfScopeSpecIds.join(', ')`, ~L205), link symbols (`link.symbols.join(', ')`, ~L212), candidates ids (`...join(', ')`). Spec ids can no longer contain commas now (OK), but symbol names/target ids can (e.g. signatures, overloaded/generic names), so symbols line violates the letter of the requirement.
- Structured output arrays: OK (`trackedFiles`, `links` arrays).

Discrepancies

1. [Low] Symbols/candidates joined with ', ' in `change implementation list/review` text. Spec side: "never joined by a separator that a name can contain". Code side: symbols joined with ', ' (implementation.ts ~L212). Either spec scope ("file names or other names") should be narrowed to file names, or code should print symbols one per line.
2. [Info, pre-existing] specd-archive/specd-implement templates say "Files with active confirmed links cannot be ignored", while spec says ignore MUST preserve links and MUST NOT reject because links exist (see section 7).

Test coverage (packages/cli/test/commands/change-implementation.spec.ts): resolve repeated+variadic (L114), ignore comma-named file (L142), ignore `f3.ts,f4.ts` whole name error (L177), raw spec on add (L214), list one per line (L245), unresolve (L320).
Missing tests: resolve with comma name `a, b.md`; "one missing file aborts whole resolve" (CLI-level; core covers atomicity - not verified here); unresolve with repeated + comma name; "values never trimmed" (`" spaced.md "`); `--format json` list keeps arrays; ignore multi-file `--file f3.ts --file f4.ts`.

---

## 2. cli:change-edit

Requirements: `--add-spec/--remove-spec` forwarded raw (no comma split); command holds no workspace/ownership/spec-id logic; ReadOnly rejection from EditChange (one line per spec, no remediation); errors: InvalidSpecIdError, WorkspaceNotFoundError, readOnly, empty specIds.

Implementation status

- Raw forwarding: OK. edit.ts: `addSpecIds = opts.addSpec` / `removeSpecIds = opts.removeSpec` passed to `kernel.changes.edit.execute`. `config` no longer read; parseSpecId import removed.
- Command holds no ownership logic: OK.
- EditChange validates (parseSpecId with workspaces) and rejects readOnly: OK (core/src/application/use-cases/edit-change.ts). `--remove-spec` normalized leniently (try/catch fallback to raw), consistent with "not re-validated".
- Error mapping to exit 1 with message: OK via `handleError` (SpecdError -> exit 1, message verbatim).
- At least one flag / empty specIds: unchanged, OK.

Discrepancies

1. [Low] ReadOnly message: spec says "one line per offending spec and no remediation steps". Core message = per-spec lines + trailing paragraph "ReadOnly workspaces are protected: their specs and code cannot be modified by changes." (edit-change.ts / create-change.ts). Not remediation per se, but is extra text beyond "one line per spec". Spec-side: lines only; code-side: lines + explanatory paragraph (pre-existing wording moved from CLI to core).

Test coverage (change-edit.spec.ts): forwards raw + WorkspaceNotFoundError (L212), comma ID as one value (L229), ReadOnly mapping (L247), no helper import (L266).
Missing tests: `--add-spec "Bad Id"` -> InvalidSpecIdError exit 1 message (CLI-level mapping); "Values forwarded unchanged" asserting `auth/register` raw (partly covered by L212); `--remove-spec` raw. Core `edit-change.spec.ts` covers use case.

---

## 3. cli:change-deps

Requirements: signature adds `--clear` and `--force`; values raw, no comma split; new "Clear confirmation" (TTY prompt, --force skip, non-TTY without force -> exit 1 mentioning `--clear` requires confirmation and `--force`, declined -> "cancelled" exit 0); errors: invalid ID (empty/blank/malformed) -> InvalidSpecIdError, unknown workspace -> WorkspaceNotFoundError; dependency on non-existent spec accepted; `--set` excl. with add/remove/clear; `--clear` excl. with add/remove.

Implementation status (packages/cli/src/commands/change/deps.ts)

- Signature/help `--clear`, `--force`: OK (L22-30).
- Raw values, no parse: OK (passes `opts.add/remove/set` to `updateSpecDeps`). Core `UpdateSpecDeps` validates via parseSpecId, normalizes; remove lenient (update-spec-deps.ts).
- Clear confirm: OK via `confirmOrExit` (force -> true; non-interactive -> cliError exit 1; decline -> `output('cancelled')` exit 0). Confirmation placed after list-mode and option-conflict checks, before use case call: matches spec.
- Mutual exclusion: OK in CLI (fast-fail) and core (authority). `--clear` without specId: OK ("modification flags ... require a specId").
- `--set ""` rejected, nothing stored: OK (validation before `mutate`, update-spec-deps.ts).
- Not-yet-created dependency accepted: OK (no existence check in UpdateSpecDeps).
- Output `dependsOn: (none)` after clear: OK.

Discrepancies

1. [Low] Non-TTY error text. Spec: error "stating that `--clear` requires confirmation and that `--force` skips it". Code (confirm.ts `confirmOrExit`): derives from message -> `Clear all dependencies of <specId> requires confirmation; pass --force to skip it`. Says `--force` skips it, but does not name `--clear`. Spec-side wants the flag named; code-side says "Clear all dependencies of X".
2. [Low] Declined prints `cancelled` via `output('cancelled','text')` even with `--format json|toon` (no structured payload). Spec only says "prints that it was cancelled"; structured consumers get plain text. Same for spec deps clear.
3. [Info] Text-mode display joins dependency ids with ', ' (deps.ts L108-118); IDs can no longer contain commas, so unambiguous.

Test coverage (change-deps.spec.ts): clear + add conflict (L330), clear w/o specId (L353), `--set ""` (L366), `--set core:a,b` one ID (L392), raw bare id (L419), clear confirmed (L450), declined (L479), --force (L500), non-TTY (L525).
Missing tests: help lists `--clear`/`--force`; `--clear` with `--remove` and with `--set` (only `--add` tested); `--add " "` blank; unknown workspace `--add nope:auth/login` (CLI mapping); dependency on not-yet-created spec accepted; non-TTY error message text content.

---

## 4. cli:spec-deps

Requirements: Clear needs confirmation or `--force` (same as change deps); new "Raw spec IDs" (spec-id and each `--dep` raw, no validate/qualify/split; core applies parseSpecId; bare path -> default); error mapping adds InvalidSpecIdError, WorkspaceNotFoundError, InvalidSpecLockError (names spec, lock location, field path), SpecNotFoundError for missing dependency target.

Implementation status (packages/cli/src/commands/spec/deps.ts)

- Clear confirm: OK (L152-190), `--force` option present; confirm occurs before kernel resolve.
- Raw ids: OK; all subcommands pass `specPath` and `opts.dep` straight to `kernel.specs.*PersistedDeps`.
- Core: UpdatePersistedSpecDeps validates add/set, checks workspace + target existence (SpecNotFoundError), normalizes (update-persisted-spec-deps.ts).
- `--dep ""` on `set`: reaches core -> InvalidSpecIdError; `add`/`remove` with no `--dep` rejected by requiredOption/`--dep requires at least one value`. OK.
- InvalidSpecLockError mapping: OK via generic `handleError` (SpecdError -> exit 1, message verbatim, no stack). Message: `Invalid spec-lock for '<id>' at <location>: field '<path>' <reason>. Correct that field in the file.` (core/src/domain/errors/invalid-spec-lock-error.ts). Names spec, location, field path as required.
- InvalidSpecIdError message quotes full value: OK (`Invalid spec ID '<value>': <reason>`).

Discrepancies

1. [Medium, theme-level] Task theme says the invalid persisted spec-lock error is one "the CLI can repair". Message says "Correct that field in the file" (manual edit); no CLI repair hint/command. cli:spec-deps spec only requires name/location/field path, so spec-compliant; flag as design gap vs. theme (spec-side: no repair mandate here; code-side: manual guidance only). Possibly covered by core:spec-lock / other batches.
2. [Low] Same confirmation-message and non-structured `cancelled` notes as change-deps (confirm.ts).

Test coverage (spec-deps.spec.ts): list delegates (L46), set delegates (L63), `--dep ""` (L90), missing target (L110), InvalidSpecLockError exit 1 no stack (L135), clear confirmed/declined/force/non-TTY (L160-217).
Missing tests: bare id `_global/architecture` forwarded unchanged on `list`; `--dep "core:a,b"` forwarded as single value and InvalidSpecIdError; invalid/unknown workspace id mapping; InvalidSpecLockError assertion that message contains spec id, lock location, `dependsOn.0` (verify scenario names this field).

---

## 5. cli:graph-index

Requirements: `--exclude-path <pattern>...` values are whole patterns, never comma-split; repeat option or list after it.

Implementation status

- index-graph.ts L72-76: `new Option('--exclude-path <glob...>').argParser((val, prev) => (prev ?? []).concat(val))`: `.split(',')` removed. OK. Variadic + repeat both accumulate (commander variadic parser per value).
- Value passed as `excludePaths: opts.excludePath` in task input (L163): OK.
- Help text says "one or more gitignore-syntax patterns, relative to the project root" - OK.
- docs/cli/graph.md L37 documents `<glob...>`; matches.

Discrepancies: none material. [Info] spec text uses `<pattern>...`, code uses `<glob...>` placeholder name (help only).

Test coverage (graph-index.spec.ts L99-108): `'{a,b}/**'` becomes single pattern (updated from 'foo,bar').
Missing tests: repeated `--exclude-path a --exclude-path b`; listed form `--exclude-path a b` (not verified at runtime by tests, relies on commander semantics).

---

## 6. cli:change-create

Requirements: `--spec` raw whole IDs (no comma split); CLI does not resolve workspaces; CreateChange validates and derives workspaces, raises WorkspaceNotFoundError/InvalidSpecIdError/ReadOnlyWorkspaceError; CLI maps to exit 1; no ownership logic in CLI; slug validation "CLI validates format before invoking".

Implementation status (create.ts)

- Raw `--spec` forward `specIds: opts.spec`; includeOverlapCheck when non-empty: OK. parseSpecId/ownership removed: OK.
- CreateChange parses, readOnly check before create, normalized specIds stored (create-change.ts): OK.
- Error mapping via handleError: OK.
- Slug validation in CLI: not found in create.ts (no kebab check; grep of create-change.ts also found none). DEVIATION (Low, likely pre-existing): Constraint "The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case". Unchanged text from canonical spec; verify whether the change-name validation lives elsewhere (e.g. Change entity/repository) - not audited further.
- Option description `--spec <id>` says "spec path (repeatable)" (create.ts L16): stale wording, minor.

Discrepancies

1. [Low] Slug validation constraint not visible in CLI (pre-existing, outside this change's delta but sits in "Constraints" that the delta rewrote while keeping that line).
2. [Low] ReadOnly message extra paragraph (see change-edit #1).

Test coverage (change-create.spec.ts): bare id raw (L84), explicit ws raw (L108), WorkspaceNotFoundError (L133), comma id one value (L158), no helper import (L176), ReadOnly mapping (L339), integration tests (L367+).
Missing tests: `--spec "Bad Id"` -> exit 1, no change created (InvalidSpecIdError mapping); CLI-level assertion that comma value yields InvalidSpecIdError message (only forwarding is asserted).

---

## 7. skills:workflow-automation

Requirement (Implementation traceability policy): when resolving/ignoring multiple files, agents SHOULD pass one whole name per value (`--file a --file b` or `--file a b`); MUST NOT join file names with commas. Scenarios: agent uses repeated options; never writes `--file a.ts,b.ts`.

Implementation status

- packages/skills/templates/skills/specd-implement/SKILL.md.tpl: examples changed to `--file <path1> --file <path2> ...` (L182, L194): OK for command examples.
- specd-archive/SKILL.md.tpl: examples changed (L109-119): OK for command examples.
- DEVIATION (Medium): prose still teaches commas. specd-archive/SKILL.md.tpl L110-111 "It supports a comma-separated list of paths for efficient bulk resolution." and L114 "It also supports comma-separated lists."; specd-implement/SKILL.md.tpl L191-192, L194 same text. These contradict the spec ("MUST NOT join file names with commas") and the new CLI behavior (commas are not separators), and sit right next to updated examples. The new test regex only checks `--file ...x,y` patterns, so it does not catch this prose.
- specd-fasttrack template: no comma-list guidance found.
- Pre-existing: both templates say "Files with active confirmed links cannot be ignored", contradicting cli:change-implementation Ignore requirement (MUST NOT reject solely because links exist). Not introduced by this change but now adjacent to touched lines.

Discrepancies

1. [Medium] Stale "comma-separated list" prose in specd-implement and specd-archive templates (spec-side: no comma joining; template-side: tells agent it is supported).
2. [Low, pre-existing] "cannot be ignored" vs cli:change-implementation spec.

Test coverage (packages/skills/test/template-workflow.spec.ts L109-120): asserts no `--file ...\w,\w` and no `--file <path1>,<path2>` in implement/archive/fasttrack templates.
Missing: test asserting presence of repeated-`--file` guidance; nothing catches prose "comma-separated".

---

## Docs check

- docs/cli/changes.md: create/edit/deps/implementation sections updated (raw ID, never comma-split, `--clear`, `--force`, `--file <paths...>`). Matches code. OK.
- docs/cli/cli-reference.md L41-47: matches create.
- docs/cli/spec-deps.md: documents `clear [--force]` and confirmation prompt; OK. Does not document InvalidSpecLockError behavior (optional).
- docs/cli/graph.md L37: `--exclude-path <glob...>` - truncated in grep output, not verified to state "never comma-split".
- `specs/cli/*` canonical specs still carry comma wording; expected until archive.

## Cross-spec / global checks

- No contradictions with default:\_global/\* found for these specs. Error handling: typed errors exit 1 consistently.
- Direct deps: cli:change-edit depends on cli:change-create and core:spec-id-format - consistent (both CLI commands now forward raw). core:spec-id-format requires validation in use cases; cli:change-deps/spec-deps rely on it correctly.

## Counts

- Specs audited: 7
- Requirements/scenario groups checked: ~45 scenarios in verify deltas
- Implementation status: all requirements OK except partial deviations below
- Discrepancies: Medium 2 (stale comma prose in skill templates; invalid lock error has no CLI repair hint vs theme), Low 7 (symbols joined with ', '; ReadOnly extra paragraph; non-TTY message omits `--clear`; `cancelled` unstructured; slug validation not in CLI; stale `--spec` option help "spec path"; pre-existing "cannot be ignored" text), Info 2.
- Missing code: 0. Missing tests: ~20 scenarios lack direct tests (listed per spec), none critical.
