# Partial compliance report: CLI + skills (change support-commas-in-names)

Scope: cli:change-implementation, cli:change-edit, cli:change-deps, cli:spec-deps, cli:graph-index, cli:change-create, skills:workflow-automation.
Method: spec-preview merged spec+verify read in full; source read of packages/cli/src/commands/{change,spec,graph}, helpers/confirm.ts, handle-error.ts, core UpdatePersistedSpecDeps/parseSpecLock/InvalidSpecLockError; CLI tests grep; skills templates diff; commander behaviour verified empirically (variadic + custom argParser, repeated `--file`).
Read-only: no code/spec edits.

## Cross-cutting findings

- No leftover references to the deleted `packages/cli/src/helpers/spec-path.ts` in src/ or tests (only negative "does not import helpers/spec-path" assertions in change-create.spec.ts and change-edit.spec.ts); no dist/helpers dir exists. Deletion is clean.
- No comma splitting remains in any command in scope: `collect` helper (`[...previous, value]`) for `--spec/--add-spec/--remove-spec/--add/--remove/--set/--dep/--symbol`; `implementation.ts` no longer does `f.split(',').map(trim)`; `graph index --exclude-path` argParser now `concat(val)`. Remaining `parseCommaSeparatedValues` users (`--skip-hooks`, `--kind` graph) are enum lists, out of scope.
- Committed spec artifacts outside the change still carry the old behaviour (expected until archive): `specs/cli/change-implementation/verify.md:41,97` (`--file f1.ts,f2.ts`), `specs/cli/change-implementation/spec-lock.json` rules ("comma-separated paths"). Not a defect, but the lock metadata will need regeneration on archive.
- UpdatePersistedSpecDeps repair path is real: `remove/set/clear` read the lock with `lenientDependsOn: true`; `add` stays strict. So "invalid spec-lock -> actionable error CLI can repair" is implemented end to end (parse -> use case -> handle-error hint).
- Tests in cli mock the kernel/use cases and `confirmOrExit`; true "spec IDs validated" behaviour is covered only in core (out of this partial's scope).

## cli:change-implementation

Requirements summary: list/review/start/add/remove/resolve/unresolve/ignore; resolve/unresolve/ignore take whole file names (repeat `--file` or list after one), never split on commas or trimmed; all values (`--file`, `--symbol`, `--spec`) forwarded raw; text listings one name per line; JSON/TOON arrays.

Implementation status: Implemented.

- resolve/unresolve/ignore: `--file <paths...>` required option; `files` passed unchanged; `file: files[0]` plus `files`. Verified commander accumulates `--file a --file b,c d` -> `['a','b,c','d']`.
- add/remove: `--spec` raw, single `--file`, `--symbol` via local `collectString` (no splitting).
- Text list: files by state, out-of-scope sidecars, symbols, candidates now one per line (`(none)` placeholder).
- CLI does not validate spec IDs (core does).

Discrepancies:

1. MEDIUM, code/template-wrong (adjacent to this change): `packages/skills/templates/skills/specd-archive/SKILL.md.tpl` and `specd-implement/SKILL.md.tpl` still say "Files with active confirmed links **cannot** be ignored." Spec requires ignore to preserve links and "MUST NOT reject the state transition solely because links still exist"; verify scenario "Ignoring a linked tracked file preserves confirmed links". Evidence: template diff only changed the comma lines, left that sentence. Template is wrong (spec is right; code does not reject).
2. LOW, spec-gap: spec says `--file` for `add`/`remove` is `<path>` and command list "list, add, resolve, ignore, remove, review" in the Command-signature scenario omits `unresolve` and `start` (both implemented). Spec/verify wording incomplete.
3. LOW, code-quality: `collectString` in implementation.ts duplicates `helpers/collect.ts`. Same duplication exists pre-change in graph search/impact/hotspots and spec/search.ts.
4. LOW, spec-gap: "Raw values" requirement says symbols are never split; `--symbol` text rendering still joins nothing, OK. No discrepancy; noted for completeness.

Test coverage (cli/test/commands/change-implementation.spec.ts): resolve variadic (`--file f1.ts f2.ts`) covered; ignore comma-named file covered; ignore `f3.ts,f4.ts` one name + ImplementationFileNotFoundError covered; raw spec ID on add; list text one-per-line for files (`a,b.ts`); unresolve basic; add missing file.
Missing tests:

- resolve with a comma-named file (scenario "Resolve a file whose name contains a comma"), and "One missing file aborts the whole resolve" (CLI-level forwarding of two files incl. missing).
- unresolve with repeated `--file` plus comma name (scenario "Unresolve accepts repeated names and names with commas").
- resolve with repeated `--file f1 --file f2` (only variadic form tested, though both are specified).
- `--symbol "a,b"` forwarded as one symbol on add/remove.
- one-per-line rendering of symbols, candidates and out-of-scope sidecars (only file lines asserted).
- JSON/TOON keep names as arrays (not asserted).
- "Subcommands are reachable" help scenario.

Summary counts: requirements 12 (11 met, 1 partially verified by tests); discrepancies 1 medium, 3 low; missing tests 7.

## cli:change-edit

Requirements summary: `--add-spec/--remove-spec` repeatable, forwarded unchanged to EditChange, never split; command validates/qualifies nothing; usage error without flags; use case rejects invalid ID (InvalidSpecIdError quoting full value), unknown workspace (WorkspaceNotFoundError), readOnly; invalidation warning; text/JSON output.

Implementation status: Implemented. `collect` accumulators, `addSpecIds/removeSpecIds` passed as received, no spec-path/SpecdConfig read in the command, errors via generic `handleError` (exit 1, message quotes use-case text).

Discrepancies:

1. LOW, spec-wrong: command also exposes `--invalidation-policy` (and requires at least one of four flags); spec signature lists only `--add-spec/--remove-spec/--description/--format`, and error message "at least one of --add-spec, --remove-spec, --description, or --invalidation-policy". Pre-existing; spec should list it.
2. LOW, spec-gap: spec "Output on success" JSON bullet is empty (`outputs (encoded...):` with nothing after) - truncated schema block in spec.md; code emits result,name,specIds,workspaces,invalidated,state (matches verify scenario).
3. INFO: "Workspace derivation" is stated as CLI logic ("the CLI derives...") but is now fully in EditChange; contradicts "command must not resolve workspaces". Spec wording stale, code is consistent with the newer requirements.

Test coverage: no-flags exit 1; forwards raw `--add-spec` and maps WorkspaceNotFoundError; comma ID forwarded as one value with InvalidSpecIdError; readOnly mapping; invalidation warning; JSON output; "does not import helpers/spec-path".
Missing tests: "Command resolves no workspace itself" source-inspection scenario (partially covered by the no-import check but not by a SpecdConfig-not-read assertion); invalid ID `"Bad Id"` scenario at CLI level; remove-spec raw forwarding with comma; removing-last-spec / remove-not-in-specIds error mapping.

Summary counts: requirements 7 (7 met); discrepancies 0 medium, 3 low/info; missing tests 4.

## cli:change-deps

Requirements summary: `--add/--remove/--set` repeatable whole IDs; `--clear` (exclusive with add/remove/set, requires specId), `--force` skips confirmation; non-TTY without `--force` -> exit 1 with message mentioning `--clear` requires confirmation and `--force`; decline -> "cancelled", exit 0; use case rejects empty/blank/malformed IDs, unknown workspace; deferred missing specs accepted.

Implementation status: Implemented.

- `confirmOrExit` (helpers/confirm.ts): force -> true; non-interactive -> cliError(exit 1); prompt via @clack/prompts; decline -> command prints `cancelled`.
- Conflict checks fast-fail in CLI; use case remains authority (`clear: true` forwarded).
- `--set ""` is forwarded (`opts.set.length > 0` true), so rejection happens in use case.

Discrepancies:

1. MEDIUM, code-wrong (minor behaviour): display mode (`change deps <name> <specId>` no flags) compares the raw `specId` against `change.specIds` (canonical `default:...`) and looks up `specDependsOn[specId]` by raw key. A bare ID (`auth/login`), which the spec's own modify scenarios use, therefore errors with "not in the scope" in display mode while the same ID works for `--add`. Spec requires the command not to normalise IDs, so either spec must say display needs a canonical ID or display should delegate to a core lookup (e.g. GetStatus resolving the ID). Evidence: deps.ts lines `change.specIds.includes(specId)` and `specDependsOn[specId] ?? []`.
2. LOW, code-wrong: clear confirmation ordering - conflict/specId checks run after `resolveCliContext` (fine), but the confirmation prompt appears before the spec ID is validated or existence verified, so a user can confirm and then get InvalidSpecIdError/SpecNotFound. Spec: "ask for confirmation before calling the use case" - compliant; UX nit only.
3. LOW, spec-gap: error-cases list says "`--set`, `--clear`, and `--add`/`--remove` combined in a way that is not allowed" while Constraints give the precise rule; fine. Help text listing `--set` as "repeatable" matches.
4. INFO: Output spec example for add scenario (verify "the output is:" block) is empty/truncated.

Test coverage (change-deps.spec.ts): all original scenarios; `--clear` with add/remove/set (parametrised); `--clear` without specId; `--set ""` rejection; `--set core:a,b` forwarded as one; raw bare specId forwarded; confirm accepted/declined/`--force`; non-TTY error (via mocked `confirmOrExit`).
Missing tests:

- `--add " "` blank scenario.
- "Unknown workspace in a dependency" and "dependency on a spec not created yet is accepted" at CLI level (only core-level presumably).
- Help lists `--clear` and `--force`.
- `confirmOrExit` itself has NO unit test (no test/helpers/confirm.spec.ts): real non-TTY branch, `isTTY` detection, default clack prompt cancel handling, derived message fallback are untested everywhere because all command tests mock it.
- JSON/TOON output of declined clear (`{result:'cancelled'}`), not in spec either (spec says only "prints that it was cancelled").

Summary counts: requirements 4 (4 met, 1 with edge defect); discrepancies 1 medium, 2 low, 1 info; missing tests 5.

## cli:spec-deps

Requirements summary: list/add/remove/set/clear; `clear [--force]` confirmed like change deps; raw IDs, never comma-split; one `updatePersistedDeps` call per mutation; error mapping incl. InvalidSpecLockError with message naming spec/location/field path and, for `dependsOn.*`, a following repair hint naming `specd specs deps remove`, `set`, or `clear`; `.allowExcessArguments(false)` on every leaf.

Implementation status: Implemented with two wording issues.

- All five leaves call `.allowExcessArguments(false)`; each mutation maps flags directly to `UpdatePersistedSpecDepsInput` (`add`, `remove`, `set`, `clear: true`).
- `InvalidSpecLockError` branch in handle-error.ts: exit 1, no stack, appends "Repair with: specd specs deps remove|set|clear <spec-id> (use --force to skip confirmation on clear)" when fieldPath is `dependsOn` or `dependsOn.N`.
- Core repair path verified (lenient read on remove/set/clear).

Discrepancies:

1. MEDIUM, code-wrong (core message): `InvalidSpecLockError` message ends with "Correct that field in the file." and the CLI then appends "Repair with: specd specs deps ...", so the user sees contradictory instructions (edit file by hand vs use command) for dependsOn failures. Spec wants the actionable CLI hint; the trailing sentence should be dropped or made conditional. Evidence: core/domain/errors/invalid-spec-lock-error.ts message tail + handle-error.ts hint.
2. LOW, code-wrong: the hint text is `specd specs deps remove|set|clear`, which does not literally contain `specd specs deps set` / `specd specs deps clear`; spec says the hint "naming `specd specs deps remove`, `set`, or `clear`". Borderline; a grep-style check for each command name would fail for `set`/`clear`. Also hint mentions `--force` for clear only; fine.
3. LOW, code-wrong: non-interactive error for `specs deps clear` reads "--clear requires confirmation; pass --force to skip it", but that subcommand has no `--clear` flag. Spec: "an error stating that clearing requires confirmation and that `--force` skips it". Use e.g. "clearing requires confirmation; pass --force to skip it" for specs deps clear. The test asserts only `--force`, and it uses the mocked helper so the real message is not checked.
4. LOW, spec-wrong/gap: `list` does not run through repair (as intended); the spec scenario shows `list` throwing InvalidSpecLockError with a repair hint, consistent. But `specs deps add` on an invalid lock also surfaces the hint (add stays strict) - spec does not say so; behaviour is sensible.
5. LOW: help signature in spec uses `<spec-id>`, code arg name is `<specPath>` (docs also `<specPath>`). Cosmetic.
6. INFO: `add`/`remove` use `requiredOption('--dep', ..., collect, [])` plus a dead `opts.dep.length === 0` check; since collect starts at `[]` and requiredOption demands a value, the check is unreachable. Harmless.

Test coverage (spec-deps.spec.ts): list delegates; set delegates; `--dep ""` rejected; missing target exit 1; InvalidSpecLockError exit 1, contains `dependsOn.0`, no stack; clear confirm accepted/declined/force/non-TTY (mock).
Missing tests:

- Repair hint presence/format for `dependsOn.*` and absence for other fields (handle-error.spec.ts has no InvalidSpecLockError test at all; spec-deps test does not assert the hint or location).
- `add --dep "core:a,b"` forwarded as one value and rejected (scenario "Dependency with a comma is one value").
- Bare spec ID forwarded unchanged (`_global/architecture`).
- list on uninitialized spec (text and `initialized:false` JSON); remove on uninitialized no-op; add/remove multi-`--dep` forwarding; ArtifactConflictError and ReadOnlyWorkspaceError mapping; `--format json` valid output; `.allowExcessArguments(false)` constraint.
- Integration test that remove/set/clear actually repair a lock with invalid `dependsOn.0` through the CLI (only core use case has lenient flag).

Summary counts: requirements 8 (7 met, 1 partial: error mapping hint/wording); discrepancies 1 medium, 4 low, 1 info; missing tests 8.

## cli:graph-index

Requirements summary: `--exclude-path <pattern>...` repeatable and listable, each value one whole gitignore pattern, never split on commas; remaining requirements unchanged (SDK worker, output sections, diagnostics, docs).

Implementation status: Implemented. The only source change is `argParser((val, prev) => (prev ?? []).concat(val))` (was `concat(val.split(','))`). Verified with real commander: `--e a b,c --e '{a,b}/**' d` -> `['a','b,c','{a,b}/**','d']`. Docs (`docs/cli/cli-reference.md`) updated: removed "comma-separated values accepted"; option row now `<glob...>`; no remaining comma wording.

Discrepancies:

1. LOW, spec-gap: spec text says `--exclude-path <pattern>`, code/docs use `<glob...>` metavar. Cosmetic.
2. INFO: the "CLI reference documentation" requirement lists six subcommands; not re-audited here beyond the `--exclude-path` row (unchanged by this change).

Test coverage (graph-index.spec.ts): `{a,b}/**` single pattern (forced descriptor test) and repeated `--exclude-path` flags covered.
Missing tests: "Several patterns listed after one option" (`--exclude-path 'app/tmp/' 'dist/'`) has no test; no test mixing list and repeat; no test for `a,b` plain (non-brace) value remaining unsplit (brace case is covered).

Summary counts: requirements 11 (all met); discrepancies 0 medium, 1 low, 1 info; missing tests 2.

## cli:change-create

Requirements summary: `--spec <id>` repeatable, each value passed to CreateChange unchanged, never split; no CLI workspace parsing or ownership checks; CreateChange validates IDs (InvalidSpecIdError), unknown workspace (WorkspaceNotFoundError), readOnly; no schema prelude; overlap check delegation; JSON/text output.

Implementation status: Implemented. `specIds: opts.spec` forwarded as-is; `includeOverlapCheck: true` only when specs present; no `getActiveSchema`; overlap warning from `overlapReport`; errors via `handleError`.

Discrepancies:

1. LOW, spec-wrong: Constraints say "The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case", but the command performs no validation (CreateChange/core owns it). Pre-existing; spec should say use case validates. Not verified in core here.
2. LOW, spec-gap: spec signature omits `--invalidation-policy` (present) and the Output requirement text lists `changePath` while the base "Output on success" says "No further output is produced" and "JSON output on success" duplicates "JSON output includes changePath" (the `{ result, name, state }` schema in the help text omits `changePath`: help says `{ result: "ok", name: string, state: string }` but output includes `changePath`). Code-wrong minor: help schema stale.
3. INFO: Output-on-success bullets in spec.md are truncated (empty code blocks).

Test coverage (change-create.spec.ts): missing name; empty specIds; raw bare ID forwarded; explicit workspace forwarded; unknown workspace mapping; comma ID forwarded and InvalidSpecIdError; no spec-path import; success text/JSON; duplicate name; no getActiveSchema; includeOverlapCheck; overlap warning; readOnly mapping; schema identity persisted (real use case); real DetectOverlap integration.
Missing tests: `"Bad Id"` invalid-ID scenario (only comma ID tested); "Multiple readOnly specs each produce an error" and "Mixed owned and readOnly" at CLI level; "No overlap check when specIds empty" asserting `includeOverlapCheck` is not true (the empty case exists but verify assertion unclear); a no-ownership-read source inspection.

Summary counts: requirements 9 (9 met); discrepancies 0 medium, 2 low, 1 info; missing tests 4.

## skills:workflow-automation

Requirements summary: new/changed requirement "Implementation traceability policy": when resolving/ignoring multiple files agents SHOULD pass one whole name per value (`--file a --file b` or `--file a b`) and MUST NOT join with commas. Other requirements unchanged (diagnostic priority, data extraction, spec read surface, outline, repair, canonical plural, necessity, validation, context optimization).

Implementation status: Implemented in templates. `specd-archive/SKILL.md.tpl` and `specd-implement/SKILL.md.tpl` now teach `--file <path1> --file <path2> ...` and no longer say "comma-separated". Test `template-workflow.spec.ts` "does not teach comma-joined --file lists for implementation tracking" added.

Discrepancies:

1. MEDIUM, template-wrong: both templates still state "Files with active confirmed links cannot be ignored" which contradicts cli:change-implementation (ignore preserves links; see above). Not covered by this spec but shipped in the same lines being edited.
2. LOW, test weakness: the negative regexes `/--file\s+[^\n]*\w,\w/` and `/--file\s+<path1>,<path2>/` only catch `a,b` forms with word chars on both sides; `--file a.ts, b.ts` or `--file "a, b"`-style regressions in non-listed templates are missed, and only the two named templates are checked (verify the test's file list). The positive scenario "Agent resolves several files with repeated options" is only implicitly covered (no assertion that `--file <path1> --file <path2>` appears in both templates, if not already asserted).
3. LOW, code-wrong: agent skill/doc templates elsewhere (other agent plugins, `.agents/skills`, specd-fasttrack, docs/guide/skills.md) were not audited for remaining comma-joined `--file` examples; grep over docs/ and skills templates found none, but generated `.agents/`/plugin outputs were not scanned.

Test coverage: template-workflow.spec.ts negative checks as above.
Missing tests: positive assertion that archive and implement templates show repeated `--file` (and/or list-after-one-option) forms for both resolve and ignore; assertion that `--format toon` / text guidance unchanged is pre-existing.

Summary counts: requirements 10 (10 met); discrepancies 1 medium, 2 low; missing tests 2.

## Overall

Totals: discrepancies 3 medium, 12 low, 5 info (de-duplicated: the template "cannot be ignored" item counted once under change-implementation and again under skills).
Top issues:

1. InvalidSpecLockError message ("Correct that field in the file.") contradicts the CLI repair hint (core wording).
2. `confirmOrExit` and the real non-TTY/--force flows have no direct tests (all command tests mock it); the `specs deps clear` non-TTY message mentions a non-existent `--clear` flag.
3. `change deps <name> <specId>` display mode compares raw specId against canonical specIds, so bare IDs fail while modify mode accepts them.
4. Skill templates still claim linked files cannot be ignored (contradicts cli:change-implementation).
5. Test gaps: comma-named files for resolve/unresolve, `--exclude-path` listed-after-one-option, spec-deps comma `--dep` and lock-repair hint, handle-error InvalidSpecLockError, change deps blank `--add " "`.
