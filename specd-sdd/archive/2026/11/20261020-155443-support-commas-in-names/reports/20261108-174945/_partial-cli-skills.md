# Compliance partial — CLI, Skills, SDK delivery boundary

Change: `support-commas-in-names`. Audit date: 2026-11-08. Read-only audit: no implementation/spec edits or lifecycle transitions.

## Scope and method

Eight change specs, 70 requirements and 253 compiled scenarios were reviewed. Merged artifacts were obtained independently with `changes spec-preview support-commas-in-names <id> --format text`; the compiled scenario representations in `/tmp/commas-spec-*.txt` were used for the inventory below. Spec-preview content, not raw deltas, is the review basis. Requirement and scenario counts exclude constraints and dependency/global specs.

| Spec                       | Requirements | Scenarios |
| -------------------------- | -----------: | --------: |
| cli:change-implementation  |           11 |        31 |
| cli:change-edit            |            6 |        23 |
| cli:change-deps            |            5 |        32 |
| cli:spec-deps              |           10 |        35 |
| cli:graph-index            |           11 |        51 |
| cli:change-create          |            8 |        27 |
| cli:project-init           |            9 |        29 |
| skills:workflow-automation |           10 |        25 |
| Total                      |           70 |       253 |

Primary code navigation used `graph impact --file cli:src/commands/change/implementation.ts --direction dependencies`, then direct inspection of the resulting implementation/review helpers and the paths identified in design. The parent refreshed the graph; the fresh status recorded `state: current`, `contentFresh: true`. This batch also queried `graph search createProgram --symbols` before inspecting program-level behavior. SDK exports were checked directly at the declared public delivery boundary.

The parent executed fresh tests: Core 2,889; CLI 1,285; SDK 134; Skills 52; Guide 155 (4,515 total), fresh build, direct TypeScript checks, and lint on all 151 changed/new TypeScript files. This audit inspected test assertions rather than interpreting passing suite totals as proof of every acceptance criterion. CLI unit tests mock kernel behavior; application atomicity and validation are supported by the corresponding Core suites, not independently re-proven by CLI mocks. Baseline full test results outside these packages were cached and are not claimed as new runs here.

## Findings

### CLI-S1 — Two verification scenarios still require bare dependency output (spec drift; low)

**Explicit scenario mismatch.** In merged `cli:change-deps` verification, “Remove deps from a spec in the change” requires the exact substring `dependsOn: auth/shared`, and “Set (replace) deps for a spec” requires `dependsOn: auth/session`. The use case returns fully-qualified dependency IDs per merged `core:update-spec-deps` and `core:spec-id-format`; the delivery handler correctly prints those values at `packages/cli/src/commands/change/deps.ts:167`, so real execution produces `dependsOn: default:auth/shared` and `dependsOn: default:auth/session`.

The unit tests at `packages/cli/test/commands/change-deps.spec.ts:69` and `:92` pass because their mocked results contain bare `dependsOn` values. Those fixtures are incompatible with the new Core output contract and conceal the scenario contradiction. The earlier Add scenario also ends with “the output is:” without supplying an expected output block, so that clause offers no concrete assertion.

**Interpretations:** specs may be stale (most likely; canonical fully-qualified output is explicitly required globally), implementation could instead be expected to abbreviate displayed dependencies (would require changing that contract), or both could be revised to state an explicit presentation policy. Do not “fix” the handler by introducing adapter-owned ID normalization. Recommended route: update the two verification expectations and normalize the mocked dependency fixtures, then add one real Core-to-CLI output assertion. These expectations are baseline wording retained in the merged artifact, not a newly introduced comma regression.

### CLI-S2 — All-list delegation constraint contradicts the supported operation shape (spec drift; low)

**Broader constraint mismatch, not a failing listed user scenario.** `cli:change-deps` says “Listing and display modes use GetChangeSpecDeps to retrieve dependencies”. Single-spec display does use `kernel.changes.getSpecDeps` (`packages/cli/src/commands/change/deps.ts:97`), while all-spec listing intentionally uses `kernel.changes.status` (`:117`). The all-list path is explicitly tested at `packages/cli/test/commands/change-deps.spec.ts:247`; the single-display test verifies that status is not called (`:274` onward). `GetChangeSpecDeps` accepts a required `specId`, so it does not currently supply an all-list operation.

**Interpretations:** the constraint likely overstates the single-display refactor and should name status for whole-change listing; alternatively extend Core with an all-list query and route CLI through it. Both routes are possible, but changing only this handler to omit `specId` is not valid. The all-list implementation existed before this change; the contradiction is in the resulting specification wording.

### CLI-I1 — Explicit default-valued init flags still open the wizard on a TTY (baseline implementation gap; medium)

**Broader requirement failure.** `cli:project-init` Interactive mode permits the wizard only when no configuration flags were supplied. `packages/cli/src/commands/project/init.ts:77` decides `hasFlags` by comparing option values with defaults (`opts.workspace !== 'default'`, `opts.workspacePath !== 'specs/'`) instead of checking whether the user supplied them. Consequently both `init --workspace default` and `init --workspace-path specs/` enter the wizard when stdout is a TTY. This can unexpectedly block a terminal script and allows subsequent prompt answers to override explicit input.

Confirmed without writing project files: a standalone Commander parse with the command's declared defaults reports option source `cli` for each supplied flag, but the exact `hasFlags` expression returns `false`, and `interactiveIfTTY` returns `true`. The Git diff confirms this branch is unchanged by the current change; workspace validation is new, mode detection is baseline.

`packages/cli/test/commands/project-init.spec.ts:348` exercises TTY mode only without flags. Explicit default-valued flags are exercised only with the normal non-TTY test stream, so the gap survives.

**Interpretations:** implementation likely needs option-source/presence detection; if value-based wizard selection is intentional, the requirement should explicitly say so. Recommended implementation route: test TTY with explicit `--workspace default` and `--workspace-path specs/`, assert no prompt and exact ConfigWriter inputs. This is not evidence of failure of the new workspace-name validator; that validator and its no-write error behavior are covered and conformant.

### CLI-I2 — Structured output help is absent on several affected command leaves (baseline global requirement gap; low)

**Global/dependency requirement failure, not a comma scenario regression.** Direct dependency `cli:entrypoint`, Requirement “JSON/TOON output schema in help”, requires every structured-output command's help to include `JSON/TOON output schema:` and its result shape. The eight `changes implementation` leaves, five `specs deps` leaves, and init handler declare structured formats but no schema help. By inspection, `packages/cli/src/commands/change/implementation.ts:23`, `packages/cli/src/commands/spec/deps.ts:61`, and `packages/cli/src/commands/project/init.ts:43` register these leaves without `addHelpText`.

Confirmed built CLI read-only invocations: `changes implementation start --help`, `specs deps list --help`, and `init --help` list format options but no output schema. `changes create` has a schema block but omits its actual `changePath` property (`packages/cli/src/commands/change/create.ts:29`), although its local spec explicitly requires that output field.

**Interpretations:** add output shapes to the affected leaves/update create's block, or explicitly revise the global requirement to exempt these commands. The parent baseline and diff show this omission predates the current work. A command-tree help-schema assertion would protect the requirement; existing documentation coverage checks flag coverage and do not demonstrate this contract.

## Per-spec implementation and test evidence

### cli:change-implementation

Implementation: `packages/cli/src/commands/change/implementation.ts` registers all eight subcommands. Add/remove forward raw file/spec/symbol values; resolve/unresolve/ignore forward arrays in one Core mutation. Commander handles repeated/variadic values; the command introduces no comma parser. Text prints files/symbols on separate lines; JSON/TOON preserve arrays. Start renders name, tracking status, timestamp. `commands/change/_implementation-tracking.ts` calls SDK `buildImplementationReview` and adapts only health text; no matching fallback or stored-link rewrite is present. SDK reexports remain the only platform import path.

Tests: `packages/cli/test/commands/change-implementation.spec.ts` directly covers comma paths, repeated/variadic equivalence, whitespace preservation, raw IDs/symbols, missing-file error forwarding, JSON arrays, separate text lines, eight-subcommand reachability, start timestamp/structured confirmation, review rendering and second start invocation. Core `update-implementation-tracking.spec.ts` supplies actual state-machine, existence, symbols, preserved links and atomic batch evidence. SDK review tests cover resolution outcomes. CLI mocks do not themselves establish those underlying transitions. Missing global help schema is CLI-I2.

### cli:change-edit

Implementation: `commands/change/edit.ts` checks edit-option presence before resolving config, passes raw lists/policy/description to Core, prints returned workspace/spec arrays and state, maps typed errors via `handleError`, and retains only presentation-level overlap warnings. No CLI spec-ID parser or ownership lookup remains. Tests: `test/commands/change-edit.spec.ts` covers no-flags/config-error precedence, raw forwarded IDs/removals, comma-invalid input, policy errors, ownership errors, workspace/result projection and invalidation output. Actual atomic rejection, workspace derivation, ownership enforcement and lifecycle invalidation are established in Core's EditChange/Change suites. No new implementation mismatch found in the six local requirements or 23 compiled scenarios.

### cli:change-deps

Implementation: `commands/change/deps.ts`; raw repeatable add/remove/set values; clear/force fast-fail and confirmation; single-spec query through `getSpecDeps`; all-list through status; modification text/structured output consistently uses `result.specId`. Tests: `test/commands/change-deps.spec.ts` covers option conflicts, no spec, raw values, commas/blanks, normalized single-display in text/JSON/TOON, typed errors, help clear/force, confirm/decline/force/non-TTY paths, returned ID on mutation. Core validates and mutates actual dependencies. Scenario drift CLI-S1 and all-list constraint CLI-S2 remain. Tests using bare mocked dependency arrays should be updated even though the CLI correctly renders what it receives.

### cli:spec-deps

Implementation: `commands/spec/deps.ts`; five leaves reject excess args, pass raw IDs/arrays and make one kernel call; set without deps passes `[]`; clear asks and maps force; list/mutation output uses actual `initialized`; remove on an uninitialized spec prints a no-op. Only this group opts into the `handleError` lock-repair hint; hint is separate from structured `message`, scoped to `dependsOn`, and contains precisely the three allowed commands. `helpers/confirm.ts` handles TTY/force/cancellation and `handle-error.ts` handles typed fields/concurrency/readOnly messages.

Tests: `test/commands/spec-deps.spec.ts` directly covers raw forwarding, set, comma/blank values, missing target, uninitialized list/remove, JSON initialized, confirmation branches, clear wording, conflict/readOnly mapping. `test/handle-error.spec.ts` covers exact hint scope/content/structured separation; Core persisted-deps and repository tests cover strict versus lenient repair and concurrency semantics. Test “exits 1 when confirmOrExit rejects for a non-TTY shell” mocks an older `--clear` message; the later clear-wording test checks the actual passed nonInteractiveMessage. Recommend retaining the latter and cleaning that stale mock; no production wording failure was found. Missing help schema: CLI-I2.

### cli:graph-index

Implementation: `commands/graph/index-graph.ts`, `graph-index-task.ts`, SDK worker/index orchestration. Exclude-path uses one array collector and preserves brace commas. Parent creates serializable forced/discovered/bootstrap descriptors and calls `runIsolatedGraphIndex`; child replays discovery/config and calls SDK indexing once. Text-only callbacks, diagnostic/size/overlap sections, rebuild/coverage fields, error codes, and unchanged structured result are present. No raw lock, child-process, isolation bypass or direct code-graph package import exists in CLI.

Tests: `test/commands/graph-index.spec.ts` covers modes, no substitution, one SDK call, repeated/listed/brace patterns, result fields, progress/diagnostics, size caps/snippets, overlaps, no writes, failure diagnostics and JSON/TOON. `test/graph-index-task.spec.ts` covers child context and event contracts. Built integration suites and the parent's real successful graph refresh supply packaged-run evidence; this batch did not rerun all Code Graph infrastructure tests. `docs/cli/cli-reference.md` documents graph commands, flags and graph configuration; CLI documentation suite passed. No new discrepancy in these local requirements/scenarios found.

### cli:change-create

Implementation: `commands/change/create.ts` passes raw specs, no explicit schema identity, conditional includeOverlapCheck, inherited policy and typed errors; renders result path/state and delegated overlap warnings. Tests: `test/commands/change-create.spec.ts` covers empty specs, raw bare/comma/invalid IDs, ownership errors, returned path, overlap delegation and policy errors. Core tests establish actual normalization, ownership rejection, schema/event persistence and duplicate-name handling. Local output examples containing `.specd/changes/` are conventional default-layout examples; the repository's custom change storage path is not treated as a production failure. Help schema field omission is CLI-I2.

### cli:project-init

Implementation: `commands/project/init.ts`, shared registration in `program.ts`; shared `isValidWorkspaceName` validates option and wizard values without trim/lowercase; `createConfigWriter().initProject` owns all files, directories and ignores; result metadataCachePath is printed directly; selected plugins go through plugin installation. Root resolution uses VCS/CWD fallback and alias registers the same handler.

Tests: `test/commands/project-init.spec.ts` covers alias, plugin choices/output, metadata path, force, invalid one-character/uppercase/device/space values with no writes, valid two-character ID and wizard validation. Core ConfigWriter tests establish real file placement/directories/ignore idempotence. The specific validator requirement conforms. Baseline wizard mode selection fails the broader requirement with explicit default-valued options (CLI-I1). Help schema gap CLI-I2.

### skills:workflow-automation

Implementation: shared skill template and implement/archive skill templates define diagnostic text vs TOON extraction, show/context/metadata read surfaces, guide-first/graph-first, freshness/equivalence, canonical plural resource groups, next-action repair, inline-diff/merged-preview review, traceability, repeated/variadic whole file names and specialized optimizer delegation with inline fallback. Templates no longer teach comma-joined names.

Tests: `packages/skills/test/template-workflow.spec.ts` directly asserts shared read-surface guidance, optimizer gate/persistence flows, no comma-joined flags across templates and ignore/link behavior; broader rendering/catalog tests passed in the Skills suite. Runtime agent behavior is instruction-driven, so these tests prove instruction content/rendering, not compliance by every future agent. All 25 scenarios are consistent with the published instructions; no new discrepancy found.

## Dependency and global consistency

Read surfaces: merged in-change Core specs from the parent's compiled context; `specs show` for cli:entrypoint, cli:command-resource-naming, skills:agents, sdk:build-implementation-review, core:get-implementation-review, core:refresh-implementation-tracking, sdk:run-index-project-graph, sdk:host-context, code-graph:isolated-index-worker, cli:spec-context and cli:spec-metadata; project globals architecture/docs/testing/cross-platform/error-handling. Relevant direct deps already in this change use the merged view rather than canonical old content.

Architecture: handlers delegate validation, ownership, mutations and symbol resolution; platform imports are SDK-only; `packages/sdk/src/core-reexports.ts:61`, `:327`, `:489`, `:562`, `:568`, `:573` expose new getSpecDeps types/factory, errors, parser/pattern and shared rules. No business merge logic added to hosts. Dependency inconsistency limited to CLI-S1, CLI-S2 and global help requirement CLI-I2 identified above.

Cross-platform: raw option strings are unchanged; separator/case normalization belongs to Core, not CLI; init uses node:path; task modules use URLs; no shell-based filename parsing is introduced. Fresh tests ran on macOS only; no claim of running Windows/Linux CI. Test names/fixtures use platform mocks or Core-specific platform helpers.

Documentation: user docs use canonical plural groups; search of relevant changed CLI/guide/skills docs found no singular resource command examples. New repeated-file/clear/force/lock-repair/init workspace rules are represented in docs. Help discoverability has the gap above. Unrelated exploration files outside docs were not attributed to this change.

## Summary and limits

No new comma splitting/whitespace loss/adapter spec-ID normalization regression was found in this batch. Four findings: two artifact inconsistencies (CLI-S1 with two literal scenario failures; CLI-S2 broader constraint) and two baseline implementation/global-contract gaps (CLI-I1 wizard selection; CLI-I2 help schemas). These are not four new regressions. The scenario inventory below marks the two literal conflicting expectations distinctly. Remaining scenarios have supporting code and relevant direct or lower-layer tests; this is not a statement that each has an independent executable test.

## Complete requirement and scenario inventory

Supported means implementation inspection plus relevant suite evidence, including lower-layer tests where explicitly noted. It does not mean a one-to-one executable test. Requirement-only baseline/global findings are not incorrectly counted as failures of unrelated new scenarios.

### cli:change-implementation

Evidence: change-implementation.spec.ts + Core tracking/SDK review. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Command signature                   | Supported by inspected implementation and suite evidence |
| List subcommand                     | Supported by inspected implementation and suite evidence |
| Add subcommand                      | Supported by inspected implementation and suite evidence |
| Resolve subcommand                  | Supported by inspected implementation and suite evidence |
| Unresolve subcommand                | Supported by inspected implementation and suite evidence |
| Ignore subcommand                   | Supported by inspected implementation and suite evidence |
| Remove subcommand                   | Supported by inspected implementation and suite evidence |
| Review subcommand                   | Supported by inspected implementation and suite evidence |
| Start subcommand                    | Supported by inspected implementation and suite evidence |
| Shared path semantics               | Supported by inspected implementation and suite evidence |
| Raw values and unambiguous listings | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                            | Requirement                         | Assessment                                  |
| --: | ------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------- |
|   1 | Subcommands are reachable                                           | Command signature                   | Supported; code and relevant suite evidence |
|   2 | Add creates tracked file when none existed                          | Add subcommand                      | Supported; code and relevant suite evidence |
|   3 | Add refines an existing spec-plus-file link with symbols            | Add subcommand                      | Supported; code and relevant suite evidence |
|   4 | Adding a link to a missing file fails                               | Add subcommand                      | Supported; code and relevant suite evidence |
|   5 | Resolve closes tracked-file review for multiple files               | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   6 | Resolving a missing file fails                                      | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   7 | Resolving an untracked file fails                                   | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   8 | Resolving a removed file fails                                      | Resolve subcommand                  | Supported; code and relevant suite evidence |
|   9 | Resolve a file whose name contains a comma                          | Resolve subcommand                  | Supported; code and relevant suite evidence |
|  10 | One missing file aborts the whole resolve                           | Resolve subcommand                  | Supported; code and relevant suite evidence |
|  11 | Unresolving an existing file reopens review                         | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  12 | Unresolving an untracked file fails                                 | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  13 | Unresolving a removed file fails                                    | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  14 | Unresolve accepts repeated names and names with commas              | Unresolve subcommand                | Supported; code and relevant suite evidence |
|  15 | Ignore marks multiple files as ignored                              | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  16 | Ignoring a new missing file fails                                   | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  17 | Ignoring a missing-but-tracked file succeeds                        | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  18 | Ignoring a linked tracked file preserves confirmed links            | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  19 | Ignore a file whose name contains a comma                           | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  20 | A comma-joined value is one name                                    | Ignore subcommand                   | Supported; code and relevant suite evidence |
|  21 | Removing one symbol preserves the remaining refinements             | Remove subcommand                   | Supported; code and relevant suite evidence |
|  22 | Removing last symbol preserves explicit file-level link             | Remove subcommand                   | Supported; code and relevant suite evidence |
|  23 | Remove forwards spec and symbol raw, including a comma in a symbol  | Remove subcommand                   | Supported; code and relevant suite evidence |
|  24 | Manual add uses raw project-relative path instead of workspace:path | Shared path semantics               | Supported; code and relevant suite evidence |
|  25 | List renders SDK outcomes without fallback                          | List subcommand                     | Supported; code and relevant suite evidence |
|  26 | Review distinguishes missing from inconclusive absence              | Review subcommand                   | Supported; code and relevant suite evidence |
|  27 | Start explicitly activates implementation tracking                  | Start subcommand                    | Supported; code and relevant suite evidence |
|  28 | Spec ID is passed raw                                               | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  29 | Values are never trimmed                                            | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  30 | Text listing prints one name per line                               | Raw values and unambiguous listings | Supported; code and relevant suite evidence |
|  31 | Structured output keeps arrays                                      | Raw values and unambiguous listings | Supported; code and relevant suite evidence |

### cli:change-edit

Evidence: change-edit.spec.ts + Core edit/change. See per-spec implementation discussion for scope and limits.

| Requirement                  | Assessment                                               |
| ---------------------------- | -------------------------------------------------------- |
| Command signature            | Supported by inspected implementation and suite evidence |
| Workspace derivation         | Supported by inspected implementation and suite evidence |
| ReadOnly workspace rejection | Supported by inspected implementation and suite evidence |
| Approval invalidation        | Supported by inspected implementation and suite evidence |
| Output on success            | Supported by inspected implementation and suite evidence |
| Error cases                  | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                | Requirement                  | Assessment                                  |
| --: | ------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
|   1 | No edit flags provided                                  | Command signature            | Supported; code and relevant suite evidence |
|   2 | Values are forwarded unchanged                          | Command signature            | Supported; code and relevant suite evidence |
|   3 | A value with a comma is one ID                          | Command signature            | Supported; code and relevant suite evidence |
|   4 | Usage error precedes configuration resolution           | Command signature            | Supported; code and relevant suite evidence |
|   5 | Remove values are forwarded unchanged                   | Command signature            | Supported; code and relevant suite evidence |
|   6 | Command resolves no workspace itself                    | Command signature            | Supported; code and relevant suite evidence |
|   7 | Workspace added when new spec requires it               | Workspace derivation         | Supported; code and relevant suite evidence |
|   8 | Workspace removed when no specs reference it            | Workspace derivation         | Supported; code and relevant suite evidence |
|   9 | Workspace unchanged when other specs still reference it | Workspace derivation         | Supported; code and relevant suite evidence |
|  10 | Adding spec from readOnly workspace rejected            | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  11 | Removing spec not subject to ownership check            | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  12 | No edits applied when readOnly check fails              | ReadOnly workspace rejection | Supported; code and relevant suite evidence |
|  13 | Spec change triggers invalidation                       | Approval invalidation        | Supported; code and relevant suite evidence |
|  14 | No active approval — no invalidation event              | Approval invalidation        | Supported; code and relevant suite evidence |
|  15 | Text output shows updated specs and workspaces          | Output on success            | Supported; code and relevant suite evidence |
|  16 | JSON output with invalidation                           | Output on success            | Supported; code and relevant suite evidence |
|  17 | Change not found                                        | Error cases                  | Supported; code and relevant suite evidence |
|  18 | Removing spec not in specIds                            | Error cases                  | Supported; code and relevant suite evidence |
|  19 | Unknown workspace prefix in --add-spec                  | Error cases                  | Supported; code and relevant suite evidence |
|  20 | ReadOnly workspace in --add-spec                        | Error cases                  | Supported; code and relevant suite evidence |
|  21 | Invalid spec ID                                         | Error cases                  | Supported; code and relevant suite evidence |
|  22 | Unknown workspace                                       | Error cases                  | Supported; code and relevant suite evidence |
|  23 | Invalid invalidation policy                             | Error cases                  | Supported; code and relevant suite evidence |

### cli:change-deps

Evidence: change-deps.spec.ts + Core update-spec-deps/get-change-spec-deps. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                                |
| ----------------------------------- | --------------------------------------------------------- |
| Command signature                   | Supported, except legacy verification expectations CLI-S1 |
| Clear confirmation                  | Supported by inspected implementation and suite evidence  |
| Output                              | Supported by inspected implementation and suite evidence  |
| Output shows the normalized spec ID | Supported by inspected implementation and suite evidence  |
| Error cases                         | Supported by inspected implementation and suite evidence  |

|   # | Scenario                                              | Requirement                         | Assessment                                                             |
| --: | ----------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
|   1 | Add deps to a spec in the change                      | Command signature                   | Mutation supported; output-is clause has no expected block (CLI-S1)    |
|   2 | Remove deps from a spec in the change                 | Command signature                   | Literal expected output contradicts canonical IDs (CLI-S1; spec drift) |
|   3 | Set (replace) deps for a spec                         | Command signature                   | Literal expected output contradicts canonical IDs (CLI-S1; spec drift) |
|   4 | List all dependencies in the change                   | Command signature                   | Supported; code and relevant suite evidence                            |
|   5 | Display dependencies for a specific spec              | Command signature                   | Supported; code and relevant suite evidence                            |
|   6 | Help lists --clear and --force                        | Command signature                   | Supported; code and relevant suite evidence                            |
|   7 | set value with a comma is one ID                      | Command signature                   | Supported; code and relevant suite evidence                            |
|   8 | Values are passed unchanged                           | Command signature                   | Supported; code and relevant suite evidence                            |
|   9 | JSON output format                                    | Output                              | Supported; code and relevant suite evidence                            |
|  10 | No deps remaining shows none                          | Output                              | Supported; code and relevant suite evidence                            |
|  11 | Error when change not found                           | Error cases                         | Supported; code and relevant suite evidence                            |
|  12 | Error when specId not in change.specIds               | Error cases                         | Supported; code and relevant suite evidence                            |
|  13 | Error when --set used with --add                      | Error cases                         | Supported; code and relevant suite evidence                            |
|  14 | Error when removing non-existent dep                  | Error cases                         | Supported; code and relevant suite evidence                            |
|  15 | Error when modification flags provided without specId | Error cases                         | Supported; code and relevant suite evidence                            |
|  16 | --set with an empty value is rejected                 | Error cases                         | Supported; code and relevant suite evidence                            |
|  17 | --add with a blank value is rejected                  | Error cases                         | Supported; code and relevant suite evidence                            |
|  18 | Unknown workspace in a dependency                     | Error cases                         | Supported; code and relevant suite evidence                            |
|  19 | Dependency on a spec not created yet is accepted      | Error cases                         | Supported; code and relevant suite evidence                            |
|  20 | Display mode accepts a bare spec ID                   | Error cases                         | Supported; code and relevant suite evidence                            |
|  21 | Confirmed on a terminal                               | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  22 | Declined on a terminal                                | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  23 | --force skips the question                            | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  24 | No terminal and no force fails                        | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  25 | clear conflicts with add, remove, and set             | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  26 | clear requires a specId                               | Clear confirmation                  | Supported; code and relevant suite evidence                            |
|  27 | Display mode holds no spec ID parser                  | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  28 | Help lists --clear and --force                        | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  29 | Blank --add value                                     | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  30 | Unknown workspace in a dependency                     | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  31 | Raw forwarding of every modification flag             | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |
|  32 | Text output prints the normalized spec ID             | Output shows the normalized spec ID | Supported; code and relevant suite evidence                            |

### cli:spec-deps

Evidence: spec-deps.spec.ts + handle-error.spec.ts + Core persisted-deps/repository. See per-spec implementation discussion for scope and limits.

| Requirement                                         | Assessment                                               |
| --------------------------------------------------- | -------------------------------------------------------- |
| Command signature                                   | Supported by inspected implementation and suite evidence |
| List subcommand                                     | Supported by inspected implementation and suite evidence |
| Add subcommand                                      | Supported by inspected implementation and suite evidence |
| Remove subcommand                                   | Supported by inspected implementation and suite evidence |
| Set subcommand                                      | Supported by inspected implementation and suite evidence |
| Clear subcommand                                    | Supported by inspected implementation and suite evidence |
| Mutation output reflects the real initialized state | Supported by inspected implementation and suite evidence |
| No repeated CLI-owned mutation logic                | Supported by inspected implementation and suite evidence |
| Raw spec IDs                                        | Supported by inspected implementation and suite evidence |
| Error mapping                                       | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                                   | Requirement                                         | Assessment                                  |
| --: | -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- |
|   1 | Every subcommand accepts --format                                          | Command signature                                   | Supported; code and relevant suite evidence |
|   2 | List prints the persisted dependsOn list                                   | List subcommand                                     | Supported; code and relevant suite evidence |
|   3 | List on an uninitialized spec reports not-yet-initialized distinctly       | List subcommand                                     | Supported; code and relevant suite evidence |
|   4 | Add appends every supplied dependency ID                                   | Add subcommand                                      | Supported; code and relevant suite evidence |
|   5 | Remove drops the given dependency                                          | Remove subcommand                                   | Supported; code and relevant suite evidence |
|   6 | Remove on an uninitialized spec reports a no-op, not an error              | Remove subcommand                                   | Supported; code and relevant suite evidence |
|   7 | Set replaces the entire dependsOn list                                     | Set subcommand                                      | Supported; code and relevant suite evidence |
|   8 | Set with no --dep flags clears the list                                    | Set subcommand                                      | Supported; code and relevant suite evidence |
|   9 | Clear empties the dependsOn list                                           | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  10 | Clear confirmed on a terminal                                              | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  11 | Clear declined                                                             | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  12 | Clear with --force                                                         | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  13 | No terminal and no force                                                   | Clear subcommand                                    | Supported; code and relevant suite evidence |
|  14 | Add, remove, and set map directly onto UpdatePersistedSpecDepsInput        | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  15 | Add, remove, and clear map onto the use case input                         | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  16 | Set without --dep sends an empty list                                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  17 | List on an uninitialized spec                                              | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  18 | Unknown spec on list                                                       | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  19 | Invalid and unknown-workspace IDs                                          | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  20 | Concurrent modification maps to a retry message                            | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  21 | Read-only workspace gives no configuration workaround                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  22 | Repair hint is exactly the three commands                                  | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  23 | No hint for other lock fields                                              | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  24 | Non-interactive clear message names no --clear option                      | No repeated CLI-owned mutation logic                | Supported; code and relevant suite evidence |
|  25 | Unknown spec maps to exit code 1                                           | Error mapping                                       | Supported; code and relevant suite evidence |
|  26 | Concurrent modification maps to exit code 1 with retry guidance            | Error mapping                                       | Supported; code and relevant suite evidence |
|  27 | Read-only workspace maps to exit code 1 without a configuration workaround | Error mapping                                       | Supported; code and relevant suite evidence |
|  28 | Invalid lock maps to exit 1 with field path                                | Error mapping                                       | Supported; code and relevant suite evidence |
|  29 | Invalid and unknown workspace IDs map to exit 1                            | Error mapping                                       | Supported; code and relevant suite evidence |
|  30 | Bare spec ID passed unchanged                                              | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  31 | Dependency with a comma is one value                                       | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  32 | Empty dependency value rejected                                            | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  33 | Missing dependency target rejected                                         | Raw spec IDs                                        | Supported; code and relevant suite evidence |
|  34 | Remove on an uninitialized spec renders initialized false                  | Mutation output reflects the real initialized state | Supported; code and relevant suite evidence |
|  35 | Add, set, and clear render initialized true                                | Mutation output reflects the real initialized state | Supported; code and relevant suite evidence |

### cli:graph-index

Evidence: graph-index.spec.ts + graph-index-task.spec.ts + SDK/worker integration. See per-spec implementation discussion for scope and limits.

| Requirement                         | Assessment                                               |
| ----------------------------------- | -------------------------------------------------------- |
| Command signature                   | Supported by inspected implementation and suite evidence |
| Indexing behaviour                  | Supported by inspected implementation and suite evidence |
| Output format                       | Supported by inspected implementation and suite evidence |
| Size-skip summary and hint          | Supported by inspected implementation and suite evidence |
| Workspace overlap warning           | Supported by inspected implementation and suite evidence |
| Worker diagnostics presentation     | Supported by inspected implementation and suite evidence |
| Resolution diagnostics presentation | Supported by inspected implementation and suite evidence |
| Forced indexing result completeness | Supported by inspected implementation and suite evidence |
| Error cases                         | Supported by inspected implementation and suite evidence |
| CLI reference documentation         | Supported by inspected implementation and suite evidence |
| Visible incompatibility repair      | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                     | Requirement                         | Assessment                                  |
| --: | ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------- |
|   1 | Minimal invocation with defaults                             | Command signature                   | Supported; code and relevant suite evidence |
|   2 | --exclude-path is project-relative and global                | Command signature                   | Supported; code and relevant suite evidence |
|   3 | --exclude-path value with a comma is one pattern             | Command signature                   | Supported; code and relevant suite evidence |
|   4 | Several patterns by repeating the option                     | Command signature                   | Supported; code and relevant suite evidence |
|   5 | Several patterns listed after one option                     | Command signature                   | Supported; code and relevant suite evidence |
|   6 | Text output shows summary including documents                | Output format                       | Supported; code and relevant suite evidence |
|   7 | Text output with errors                                      | Output format                       | Supported; code and relevant suite evidence |
|   8 | JSON output                                                  | Output format                       | Supported; code and relevant suite evidence |
|   9 | Text output lists the skipped files and the snippet          | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  10 | The list is capped at ten                                    | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  11 | Special characters are escaped in the snippet                | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  12 | Exempt files that were analysed are listed separately        | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  13 | Output is unchanged when nothing exceeded the limit          | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  14 | Structured modes carry data and no hint                      | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  15 | The command never edits the configuration                    | Size-skip summary and hint          | Supported; code and relevant suite evidence |
|  16 | Warning in text mode                                         | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  17 | More than ten overlaps                                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  18 | No overlap, no section                                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  19 | Structured modes carry the diagnostics                       | Workspace overlap warning           | Supported; code and relevant suite evidence |
|  20 | A silent worker produces a warning on standard error         | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  21 | Structured modes do not print warnings                       | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  22 | A native crash prints its cause and context                  | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  23 | Structured failure output carries the cause as data          | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  24 | Events cross the worker boundary as JSON values              | Worker diagnostics presentation     | Supported; code and relevant suite evidence |
|  25 | Diagnostics are warnings and do not fail the run             | Resolution diagnostics presentation | Supported; code and relevant suite evidence |
|  26 | Forced structured output reports complete reconsideration    | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  27 | Forced text output does not hide skipped inputs              | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  28 | CLI preserves SDK reconstruction diagnostics                 | Forced indexing result completeness | Supported; code and relevant suite evidence |
|  29 | Mutually exclusive context flags fail fast                   | Error cases                         | Supported; code and relevant suite evidence |
|  30 | Infrastructure error exits with code 3                       | Error cases                         | Supported; code and relevant suite evidence |
|  31 | Lock acquisition failure exits with code 3                   | Error cases                         | Supported; code and relevant suite evidence |
|  32 | Per-file errors do not cause non-zero exit                   | Error cases                         | Supported; code and relevant suite evidence |
|  33 | graph section present in CLI reference                       | CLI reference documentation         | Supported; code and relevant suite evidence |
|  34 | graph index flags documented                                 | CLI reference documentation         | Supported; code and relevant suite evidence |
|  35 | Size limit configuration is documented                       | CLI reference documentation         | Supported; code and relevant suite evidence |
|  36 | Command delegates exactly once to the SDK isolated worker    | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  37 | CLI does not own lock or subprocess mechanics                | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  38 | Explicit config remains forced in the child                  | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  39 | Automatic discovery replays local cascade in the child       | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  40 | Discovery replay does not silently substitute bootstrap      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  41 | Packaged task invokes SDK indexing once                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  42 | Bootstrap context remains explicit                           | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  43 | Index options cross the process boundary unchanged           | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  44 | Text progress is rendered by the parent                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  45 | Structured output remains progress-free                      | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  46 | Built structured child output contains only one final result | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  47 | Forced built index returns normally                          | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  48 | Force recovers only typed storage-open failures              | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  49 | Worker failures preserve CLI error semantics                 | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  50 | Production indexing is always process-isolated               | Indexing behaviour                  | Supported; code and relevant suite evidence |
|  51 | CLI reports provider-owned repair                            | Visible incompatibility repair      | Supported; code and relevant suite evidence |

### cli:change-create

Evidence: change-create.spec.ts + Core create-change. See per-spec implementation discussion for scope and limits.

| Requirement                     | Assessment                                               |
| ------------------------------- | -------------------------------------------------------- |
| Command signature               | Supported by inspected implementation and suite evidence |
| Workspace resolution            | Supported by inspected implementation and suite evidence |
| ReadOnly workspace rejection    | Supported by inspected implementation and suite evidence |
| Schema name and version         | Supported by inspected implementation and suite evidence |
| Overlap warning delegation      | Supported by inspected implementation and suite evidence |
| Output on success               | Supported by inspected implementation and suite evidence |
| JSON output includes changePath | Supported by inspected implementation and suite evidence |
| Duplicate name error            | Supported by inspected implementation and suite evidence |

|   # | Scenario                                          | Requirement                     | Assessment                                  |
| --: | ------------------------------------------------- | ------------------------------- | ------------------------------------------- |
|   1 | Missing name argument                             | Command signature               | Supported; code and relevant suite evidence |
|   2 | No --spec flag creates change with empty specIds  | Command signature               | Supported; code and relevant suite evidence |
|   3 | Values are forwarded unchanged                    | Command signature               | Supported; code and relevant suite evidence |
|   4 | A value with a comma is one ID                    | Command signature               | Supported; code and relevant suite evidence |
|   5 | Invalid ID rejected                               | Command signature               | Supported; code and relevant suite evidence |
|   6 | Invalid change name rejected by the core          | Command signature               | Supported; code and relevant suite evidence |
|   7 | Workspace prefix omitted defaults to default      | Workspace resolution            | Supported; code and relevant suite evidence |
|   8 | Explicit workspace prefix used                    | Workspace resolution            | Supported; code and relevant suite evidence |
|   9 | Unknown workspace prefix                          | Workspace resolution            | Supported; code and relevant suite evidence |
|  10 | Workspace derived by the use case                 | Workspace resolution            | Supported; code and relevant suite evidence |
|  11 | Spec targeting readOnly workspace rejected        | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  12 | Multiple readOnly specs each produce an error     | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  13 | Mixed owned and readOnly specs rejected           | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  14 | Owned workspace specs accepted normally           | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  15 | Command checks no ownership itself                | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  16 | Mixed owned and readOnly specs                    | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  17 | Several readOnly specs each produce a line        | ReadOnly workspace rejection    | Supported; code and relevant suite evidence |
|  18 | Schema resolved inside CreateChange               | Schema name and version         | Supported; code and relevant suite evidence |
|  19 | Manifest still records effective schema identity  | Schema name and version         | Supported; code and relevant suite evidence |
|  20 | CLI passes includeOverlapCheck when specs present | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  21 | Overlap warning emitted from result report        | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  22 | CLI does not call detectOverlap directly          | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  23 | No overlap check when specIds empty               | Overlap warning delegation      | Supported; code and relevant suite evidence |
|  24 | Successful creation                               | Output on success               | Supported; code and relevant suite evidence |
|  25 | JSON output contains changePath                   | JSON output includes changePath | Supported; code and relevant suite evidence |
|  26 | Name already exists                               | Duplicate name error            | Supported; code and relevant suite evidence |
|  27 | Invalid invalidation policy                       | Duplicate name error            | Supported; code and relevant suite evidence |

### cli:project-init

Evidence: project-init.spec.ts + Core config-writer. See per-spec implementation discussion for scope and limits.

| Requirement                    | Assessment                                               |
| ------------------------------ | -------------------------------------------------------- |
| Command signature              | Supported by inspected implementation and suite evidence |
| Workspace id validation        | Supported by inspected implementation and suite evidence |
| Interactive mode               | Baseline requirement gap CLI-I1                          |
| Known plugin options           | Supported by inspected implementation and suite evidence |
| Non-interactive mode           | Supported by inspected implementation and suite evidence |
| Config file placement          | Supported by inspected implementation and suite evidence |
| Delegation to ConfigWriter     | Supported by inspected implementation and suite evidence |
| Skills installation after init | Supported by inspected implementation and suite evidence |
| Already initialised            | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                                               | Requirement                    | Assessment                                                        |
| --: | -------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
|   1 | --plugin flag                                                                          | Command signature              | Supported; code and relevant suite evidence                       |
|   2 | specd init alias works identically to specd project init                               | Command signature              | Supported; code and relevant suite evidence                       |
|   3 | specd init --format json produces identical output to specd project init --format json | Command signature              | Supported; code and relevant suite evidence                       |
|   4 | Plugin selection wizard                                                                | Interactive mode               | Supported; code and relevant suite evidence                       |
|   5 | Wizard includes Open Code in known options                                             | Known plugin options           | Supported; code and relevant suite evidence                       |
|   6 | Wizard includes standard agent plugin                                                  | Known plugin options           | Supported; code and relevant suite evidence                       |
|   7 | Default values produce a valid minimal config                                          | Non-interactive mode           | Supported in non-TTY; explicit default flags on TTY expose CLI-I1 |
|   8 | JSON output contains plugins install results                                           | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|   9 | Text output reports metadata cache path                                                | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|  10 | JSON output includes metadataCachePath                                                 | Non-interactive mode           | Supported; code and relevant suite evidence                       |
|  11 | Config written to git root when inside a subdirectory                                  | Config file placement          | Supported; code and relevant suite evidence                       |
|  12 | Config written to CWD when not inside a git repository                                 | Config file placement          | Supported; code and relevant suite evidence                       |
|  13 | Standard directories are created                                                       | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  14 | .gitignore entry is added                                                              | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  15 | Init uses createConfigWriter not InitProject use case                                  | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  16 | tmp gitignore created idempotently                                                     | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  17 | tmp gitignore preserved on re-init with --force                                        | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  18 | Metadata cache directory created idempotently                                          | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  19 | Metadata cache entry appended to root .gitignore                                       | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  20 | CLI surfaces metadataCachePath from the InitProject result rather than re-deriving it  | Delegation to ConfigWriter     | Supported; code and relevant suite evidence                       |
|  21 | Plugins are installed for selected plugins after init                                  | Skills installation after init | Supported; code and relevant suite evidence                       |
|  22 | Non-interactive mode fails without --force                                             | Already initialised            | Supported; code and relevant suite evidence                       |
|  23 | --force overwrites existing config                                                     | Already initialised            | Supported; code and relevant suite evidence                       |
|  24 | One-character workspace id rejected                                                    | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  25 | Windows device name rejected                                                           | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  26 | Uppercase and underscore rejected                                                      | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  27 | Two-character workspace id accepted                                                    | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  28 | Interactive prompt asks again                                                          | Workspace id validation        | Supported; code and relevant suite evidence                       |
|  29 | No private expression                                                                  | Workspace id validation        | Supported; code and relevant suite evidence                       |

### skills:workflow-automation

Evidence: template-workflow.spec.ts + template rendering/catalog. See per-spec implementation discussion for scope and limits.

| Requirement                              | Assessment                                               |
| ---------------------------------------- | -------------------------------------------------------- |
| Diagnostic Priority                      | Supported by inspected implementation and suite evidence |
| Data Extraction                          | Supported by inspected implementation and suite evidence |
| Spec read surface selection              | Supported by inspected implementation and suite evidence |
| On-demand outline retrieval              | Supported by inspected implementation and suite evidence |
| Repair Strategy                          | Supported by inspected implementation and suite evidence |
| Canonical Command References             | Supported by inspected implementation and suite evidence |
| Command Necessity and Freshness          | Supported by inspected implementation and suite evidence |
| Structural Validation and Content Review | Supported by inspected implementation and suite evidence |
| Implementation traceability policy       | Supported by inspected implementation and suite evidence |
| Context optimization policy              | Supported by inspected implementation and suite evidence |

|   # | Scenario                                                           | Requirement                              | Assessment                                  |
| --: | ------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------- |
|   1 | Agent uses canonical plural status diagnostics                     | Diagnostic Priority                      | Supported; code and relevant suite evidence |
|   2 | Agent chooses TOON for tool-call preparation                       | Data Extraction                          | Supported; code and relevant suite evidence |
|   3 | Agent uses JSON only for an explicit exception                     | Data Extraction                          | Supported; code and relevant suite evidence |
|   4 | Exact artifact authoring uses specs show                           | Spec read surface selection              | Supported; code and relevant suite evidence |
|   5 | Semantic working context uses specs context                        | Spec read surface selection              | Supported; code and relevant suite evidence |
|   6 | Materialization diagnostics use specs metadata                     | Spec read surface selection              | Supported; code and relevant suite evidence |
|   7 | Metadata is not a configuration or default context source          | Spec read surface selection              | Supported; code and relevant suite evidence |
|   8 | Agent fetches full outline using canonical command                 | On-demand outline retrieval              | Supported; code and relevant suite evidence |
|   9 | Agent avoids inline outline dependency                             | On-demand outline retrieval              | Supported; code and relevant suite evidence |
|  10 | Agent follows repair guide after transition failure                | Repair Strategy                          | Supported; code and relevant suite evidence |
|  11 | Agent uses plural canonical groups in instructions                 | Canonical Command References             | Supported; code and relevant suite evidence |
|  12 | Canonical outline command example                                  | Canonical Command References             | Supported; code and relevant suite evidence |
|  13 | Agent reuses equivalent data within the same execution step        | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  14 | Agent does not assume continuity across skill sessions             | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  15 | Non-deterministic equivalence forces explicit command              | Command Necessity and Freshness          | Supported; code and relevant suite evidence |
|  16 | Validate passes but semantic review is still required              | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  17 | Successful single-artifact spec validation uses inline diff review | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  18 | Inline diff unavailability falls back to diff preview command      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  19 | Overlap or drift risk requires merged preview                      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  20 | Single-artifact review uses preview filtering                      | Structural Validation and Content Review | Supported; code and relevant suite evidence |
|  21 | Agent resolves tracked files explicitly before archive             | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  22 | Agent resolves several files with repeated options                 | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  23 | Agent never joins file names with commas                           | Implementation traceability policy       | Supported; code and relevant suite evidence |
|  24 | Agent delegates to optimizer subagent                              | Context optimization policy              | Supported; code and relevant suite evidence |
|  25 | Inline optimization fallback                                       | Context optimization policy              | Supported; code and relevant suite evidence |

Inventory totals: 70 requirements; 253 scenarios. Two explicit literal-output scenario contradictions; no other explicit compiled scenario failure established in this batch. See four distinct findings above for broader constraints/global contracts.
