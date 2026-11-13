# Partial compliance audit: CLI + skills (change `support-commas-in-names`)

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation. Read-only audit; tests were not re-run.

## Cross-cutting checks

- No CLI option splits on commas except enum lists: remaining `split(',')` are `helpers/parse-comma-values.ts` (used by `change transition`/`change archive` `--status`-style enums and `graph/parse-graph-kinds.ts`), `graph/parse-file-categories.ts:21` (`--category` enum) and `graph/impact.ts:95` (`--type` enum). All acceptable. `graph/index-graph.ts:73-76` no longer splits (diff: `.concat(val.split(','))` -> `.concat(val)`).
- `packages/cli/src/helpers/spec-path.ts` and `test/helpers/spec-path.spec.ts` are deleted; no remaining import of `spec-path` in `packages/cli/src` (grep clean). `change-edit.spec.ts:266` and `change-create.spec.ts:176` assert it.
- CLI spec-ID handling: only `change/deps.ts:99` calls `parseSpecId` (from `@specd/sdk`), and only in display mode, which the spec explicitly requires. Everything else forwards raw values (`create.ts:42`, `edit.ts:68-71`, `implementation.ts` `specId: opts.spec`, `spec/deps.ts`).
- Invalid-spec-lock repair path: `handle-error.ts:196-209` maps `InvalidSpecLockError`/code `INVALID_SPEC_LOCK` to exit 1, adds a following-line hint only when `fieldPath` is `dependsOn` or starts with `dependsOn.`. Test: `test/handle-error.spec.ts:119-145`.
- Skills: `specd-implement` and `specd-archive` `SKILL.md.tpl` no longer teach comma lists (grep of `packages/skills/templates` finds no comma-joined `--file`/`--spec`/`--add`).

---

## cli:change-implementation

### Requirements Summary

Command signature; list (SDK projection, no CLI fallback); add; resolve/unresolve/ignore (`--file <paths...>`, whole names, never split/trimmed); remove; review; start; shared path semantics; raw values and unambiguous (one-per-line) listings.

### Implementation Status

- resolve/unresolve/ignore: `packages/cli/src/commands/change/implementation.ts:~96-146` use `requiredOption('--file <paths...>')` and pass `opts.file` as `files` unchanged. Verified with commander at runtime: `--file "a, b.md" --file c d` -> `["a, b.md","c","d"]` (repeat and variadic both work, no split, no trim).
- add/remove: single `--file`, `--symbol` via local `collectString` (no split), `--spec` forwarded raw (`implementation.ts:~62,~84`).
- Text list: one file per line (`implementation.ts:~175-183`, `    ${entry.file}`), symbols one per line; JSON/TOON emit arrays (`~226-235`).
- list/review use `enrichImplementationTracking` (SDK) and render `symbolResolutions` status/reason/target/candidates/provenance (`~188-208`); no CLI fallback logic.
- start: delegates to `updateImplementationTracking` with action `start`.
- File-existence, tracked-only, removed-state, ignore-missing-if-tracked, abort-all semantics live in core `UpdateImplementationTracking` (`core/.../update-implementation-tracking.ts:113-155`); not CLI.

### Discrepancies

- INFO: `implementation.ts` defines a private `collectString` duplicating `helpers/collect.ts`. Harmless; cleanup only.
- LOW (spec drift): verify scenario "Subcommands are reachable" lists `list, add, resolve, ignore, remove, review` but omits `unresolve` and `start`, which exist in code and in other requirements. Spec text drift, not a code bug.
- No code bugs found.

### Test Coverage (packages/cli/test/commands/change-implementation.spec.ts)

Covered: variadic resolve (`:115`), ignore comma-named file (`:143`), `f3.ts,f4.ts` as one name (`:178`), raw spec ID on add (`:215`), one-name-per-line text list incl. `a,b.ts` (`:246`), review removed files (`:282`), unresolve action (`:321`), start (`:353`), add missing file error (`:78`).

### Missing Tests

- Resolve of a comma-named file (`"a, b.md"`) at CLI level.
- Repeated `--file a --file b` form for resolve (only variadic `--file a b` tested); ignore with several files.
- Unresolve with repeated names + comma name.
- "Values are never trimmed" (`--file " spaced.md "`).
- Structured output (`--format json`) keeping file names as arrays.
- Raw `--spec`/`--symbol` forwarding for `remove`; `--symbol` containing a comma.
- List renders SDK projection (re-export/hierarchy/ambiguous/incomplete) - test only passes `symbolResolutions: []`; "Review distinguishes missing from inconclusive" absent at CLI level (may live in sdk/core).
- Start idempotency (second run) and "Subcommands are reachable" help test.
- Scenarios for add-creates-tracked, add-enriches, remove-symbol, resolve-untracked/removed/missing, ignore-linked etc. are core behaviours (mock kernel at CLI level); assumed covered in core tests (not verified here).

---

## cli:change-edit

### Requirements Summary

Signature (`--add-spec`/`--remove-spec` raw, repeatable, never split), workspace derivation, readOnly rejection (delegated), invariant, approval invalidation, output, error cases, constraint "command holds no spec ID or ownership rule".

### Implementation Status

`packages/cli/src/commands/change/edit.ts`: `collect` accumulator (no split, `:19-20`), values passed as `addSpecIds`/`removeSpecIds` unchanged (`:66-76`), no config/workspace reads, `ReadOnlyWorkspaceError`/`InvalidSpecIdError`/`WorkspaceNotFoundError` flow through `handleError` (exit 1, message on stderr). Core `edit-change.ts:100-128` parses/normalizes IDs, builds readOnly message with one line per offender (matches `Cannot add spec "platform:auth/tokens" to change — workspace "platform" is readOnly.`).

### Discrepancies

- LOW (spec drift): Requirement "Workspace derivation" says "the CLI derives the new workspaces set", while requirement "ReadOnly workspace rejection" and the Constraints say the command MUST NOT resolve workspaces. Implementation follows the latter (core derives). Fix the spec wording (code is right), or, if the intent is CLI derivation, the code deviates - unlikely given scenario "Command resolves no workspace itself".
- LOW (pre-existing drift): code has `--invalidation-policy` and `--config`, not in the spec's signature block. Not related to this change.
- LOW: `resolveCliContext` runs before the "no flags" usage check (`edit.ts:~57-66`), so a missing config yields a config error instead of a usage error. Pre-existing.

### Test Coverage (change-edit.spec.ts)

Covered: no options (`:44`), add spec (`:55`), invalidation warning (`:83`), JSON (`:107`,`:176`), not found (`:133`), no invalidation (`:147`), raw forward + WorkspaceNotFound (`:212`), comma value (`:229`), readOnly mapping (`:247`), spec-path import absent (`:266`).

### Missing Tests

- "Invalid spec ID" (`"Bad Id"`) explicit scenario; the comma test mocks `InvalidSpecIdError` but does not assert the quoted full value `auth/a,b` in stderr.
- "Command resolves no workspace itself" (source-inspection: no `SpecdConfig`/ownership read) - only spec-path import is checked.
- Forwarding of `--remove-spec` raw; removal of last spec / remove-not-present error mapping at CLI level (core).
- readOnly "atomic rejection" and "removing is not ownership checked" are core behaviours (not covered at CLI).

---

## cli:change-deps

### Requirements Summary

Signature with `--add/--remove/--set/--clear/--force`, whole-ID values never split, display mode resolves bare `<specId>` via core parser, clear confirmation, output formats, error cases.

### Implementation Status

`packages/cli/src/commands/change/deps.ts`: `collect` for add/remove/set (`:21-27`, no split); values forwarded raw to `kernel.changes.updateSpecDeps` (`:~154-162`); mutual-exclusion fast-fails (`:~66-77`); display mode uses `parseSpecId(specId, { workspaces })` from `@specd/sdk` (`:98-99`) then membership check; clear flow uses `confirmOrExit` (`:~140-157`), prints `cancelled` on decline (exit 0), non-interactive error message "--clear requires confirmation; pass --force to skip it". `--set ""` / `--add " "` reach the use case (nonempty array), which rejects (`opts.set.length > 0` is true for `['']`).

### Discrepancies

- LOW: text output of modification mode prints the raw typed `specId` (`:~166`), while JSON prints the normalized `result.specId`. Spec says `<specId>`; ambiguous. Either accept or print normalized.
- LOW: for `--clear`, the confirmation prompt happens before the use case validates the spec/IDs, so an invalid/unknown spec still prompts first. Spec says confirmation precedes the use-case call, so this matches the spec; noted only.
- No code bugs found.

### Test Coverage (change-deps.spec.ts)

Covered: add/remove/set/list/display (display uses bare `auth/login` via mocked workspaces -> covers "Display mode accepts a bare spec ID"), JSON, none, not found, not in scope, set+add conflict, removing nonexistent, flags without specId, clear conflicts (add; table of other combos at `:~327-377`), clear without specId (`:379`), `--set ""` (`:392`), `--set core:a,b` one ID (`:418`), raw bare specId (`:445`), clear confirmed/declined/force/non-TTY (`:476-556`).

### Missing Tests

- "Help lists --clear and --force".
- `--add " "` blank value; unknown workspace in a dependency (`nope:auth/login`) mapping; dependency on not-yet-existing spec accepted (core-level).
- `--add` raw forward only asserted with `--add`; `--remove` raw forward not asserted.

---

## cli:spec-deps

### Requirements Summary

list/add/remove/set/clear under `specs deps`; clear confirmation; no CLI mutation logic; raw spec IDs; error mapping incl. `InvalidSpecLockError` with `dependsOn` repair hint.

### Implementation Status

`packages/cli/src/commands/spec/deps.ts`: each handler calls exactly one kernel use case with raw `specPath`/`opts.dep` (`:60-165`), `collect` accumulates without splitting, `.allowExcessArguments(false)` on every leaf. Clear uses `confirmOrExit`. Hint in `handle-error.ts:196-209`.

### Discrepancies

- MEDIUM: "Remove on an uninitialized spec reports a no-op, not an error." `add/remove/set/clear` all call `renderDepsResult({ ...result, initialized: true }, ...)` (`deps.ts:~94,~116,~138,~176`), overriding reality. Core returns `{dependsOn: [], created: false}` for `remove` on missing state (`update-persisted-spec-deps.ts:~205`), so the CLI prints `dependsOn: (empty)` as if state exists; no distinct no-op outcome. Possibilities: (a) code bug: should use `created`/read state to report "not initialized / nothing to remove"; (b) spec drift: the scenario assumes a no-op message that no layer produces (core result has no `initialized`/noop flag). This predates the change (not touched by the comma work) but the spec is in scope.
- LOW: the hint appended in `handle-error.ts:~205` is `Repair with: specd specs deps remove <spec-id>, ... set ..., or ... clear ... (use --force to skip confirmation on clear)`. The trailing `--force` parenthetical may violate "MUST NOT add any other repair instruction". Either (a) remove the parenthetical (code), or (b) relax the spec.
- LOW: non-interactive failure message for `specs deps clear` reads "--clear requires confirmation; pass --force to skip it" (`deps.ts:~160`) though that command has no `--clear` option; spec says "clearing requires confirmation". Wording only; (a) fix message, (b) spec accepts.
- INFO: `add`/`remove` `requiredOption('--dep', ..., [])` with a default plus a manual `--dep requires at least one value` check; `set` with no `--dep` correctly sends `set: []`.

### Test Coverage (spec-deps.spec.ts + handle-error.spec.ts)

Covered: list (`:46`), set delegation (`:63`), `--dep ""` (`:90`), missing target exit 1 (`:110`), invalid lock message + no stack (`:135`), repair hint (handle-error.spec `:129`), clear confirmed/declined/force/non-TTY (`:160-217`).

### Missing Tests

- `--dep "core:a,b"` forwarded as one ID (no test found in spec-deps.spec.ts).
- list on uninitialized spec (text "not initialized" + JSON `initialized:false`); remove no-op on uninitialized spec.
- add (multi-dep) / remove / clear delegation mapping (`add: [...]`, `remove: [...]`, `clear: true`); set with no `--dep`.
- Bare spec ID forwarded unchanged (`_global/architecture`) - list test uses `auth/login` partially.
- Error mapping scenarios for `ArtifactConflictError` (retry message), `ReadOnlyWorkspaceError` (no config workaround) at CLI command level; unknown spec for list; invalid/unknown workspace IDs mapping. Hint negative case (non-`dependsOn` field gets no hint) not tested.

---

## cli:graph-index

### Requirements Summary

`--exclude-path <pattern>` repeatable/listable, each value one whole pattern; plus the (unchanged) isolated-worker, output, size-skip, overlap, diagnostics, error and docs requirements.

### Implementation Status

`packages/cli/src/commands/graph/index-graph.ts:70-76`: `Option('--exclude-path <glob...>').argParser((val, prev) => (prev ?? []).concat(val))`; the value goes to task input `index.excludePaths` (`:~163`). Runtime check with commander: `--exclude-path '{a,b}/**' --exclude-path x/ y/` -> `["{a,b}/**","x/","y/"]`. Docs: `docs/cli/cli-reference.md:1289,1343-1349` document repeated and listed forms. Other (unchanged) requirements not re-audited here beyond the touched line.

### Discrepancies

- None.

### Test Coverage (graph-index.spec.ts)

Covered: comma pattern `{a,b}/**` as one pattern (`:96-112`), repeated option accumulation (`:277`).

### Missing Tests

- "Several patterns listed after one option" (`--exclude-path 'app/tmp/' 'dist/'`).

---

## cli:change-create

### Requirements Summary

`--spec <id>` repeatable, each value passed to `CreateChange` unchanged, never split; workspace derivation and readOnly rejection delegated; schema resolved inside use case; overlap delegation; output; duplicate error; constraint "CLI holds no spec ID or ownership rule".

### Implementation Status

`packages/cli/src/commands/change/create.ts`: `collect` (`:17`), `specIds: opts.spec` raw (`:~42`), `includeOverlapCheck` only when non-empty (`:~43`), no schema call, no workspace/ownership reads, errors via `handleError`. Core `create-change.ts:~120-137` normalizes and reports readOnly offenders one per line.

### Discrepancies

- LOW (spec drift, pre-existing): Constraint "the CLI validates the kebab-case name format before invoking the use case" - validation is in core (`domain/entities/change.ts:283`, `InvalidChangeName`-style error), not CLI. (a) update spec; (b) add CLI pre-check (unnecessary).
- LOW (pre-existing drift): `--invalidation-policy`, `--config` options not in spec signature.

### Test Coverage (change-create.spec.ts)

Covered: missing name (`:52`), no `--spec` (`:62`), bare ID forwarded raw (`:84`), qualified ID raw (`:108`), unknown workspace (`:133`), comma ID one value (`:158`), spec-path gone (`:176`), success/JSON (`:189,:212`), duplicate (`:242`), no `getActiveSchema` (`:258`), overlap flag/warning (`:278,:305`), readOnly mapping (`:339`), manifest schema identity (`:431`), real DetectOverlap (`:462`).

### Missing Tests

- "Invalid ID rejected" (`"Bad Id"`) explicit; comma test should assert message quotes `auth/a,b`.
- "Multiple readOnly specs each produce an error" / "Mixed owned and readOnly" (core behaviour; CLI level only single mapping).
- "Command checks no ownership itself" and "Workspace derived by use case" (source inspection) not asserted.

---

## skills:workflow-automation

### Requirements Summary

Changed requirement: "Implementation traceability policy" - agents pass one whole file name per value (repeat `--file` or list after it), MUST NOT join with commas.

### Implementation Status

`packages/skills/templates/skills/specd-implement/SKILL.md.tpl:~185-197` and `specd-archive/SKILL.md.tpl:~103-117` now teach `--file <path1> --file <path2> ...`, drop "comma-separated" language and the false claim that linked files cannot be ignored (now "preserves any confirmed links"). No other template mentions comma-joined lists (`specd-fasttrack` checked by test).

### Discrepancies

- LOW: templates show only the repeated-option form; the listed form (`--file a.ts b.ts`) allowed by the spec is not shown. Spec says SHOULD either; acceptable.

### Test Coverage (packages/skills/test/template-workflow.spec.ts:111-130)

Covered by negative checks: no `--file x,y`, no `comma-separated`, no "cannot be ignored", has "preserves any confirmed links" (implement/archive/fasttrack).

### Missing Tests

- Positive assertion that templates show `--file <path1> --file <path2>` (scenario "resolves several files with repeated options"); only negatives are tested. The regex `/--file\s+[^\n]*\w,\w/` could false-positive on legitimate prose but passes today.

---

## Counts

Discrepancies by severity (code vs. spec, all seven specs): HIGH 0, MEDIUM 1 (spec-deps remove no-op reported as initialized), LOW 9 (change-implementation scenario list omits unresolve/start; change-edit workspace-derivation wording contradiction; change-edit/create pre-existing `--invalidation-policy`/`--config` signature drift; change-edit config-before-usage order; change-create kebab validation location; change-deps specId raw vs normalized in text output; spec-deps hint extra `--force` text; spec-deps clear message cites `--clear`; skills templates show only one form), INFO 2.

No contradictions with project or dependency specs found beyond those listed (core:spec-id-format semantics are applied in core, CLI holds no spec-ID helper).
