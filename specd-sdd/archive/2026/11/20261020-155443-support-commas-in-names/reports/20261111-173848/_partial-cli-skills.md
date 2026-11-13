# Compliance partial — CLI and Skills

Change: `support-commas-in-names`. Audit date: 2026-11-11. Scope: eight merged change specs, 70 requirement groups and 253 scenarios. This is a read-only audit of implementation/spec behavior; only this report file was written.

## Method and limits

The merged `spec.md` and `verify.md` views were retrieved through `changes spec-preview` for all eight specs. The code graph was refreshed by the parent before this review; graph search resolved the affected symbols. I inspected the handlers, related test assertions, prior audit evidence, and the global CLI, cross-platform and documentation directives. A fresh focused Vitest run passed **157 tests across seven CLI files**; a fresh Skills run passed **52 tests across eight files**. The parent also ran the package-wide suites and implementation hooks. Passing tests are supporting evidence, not a claim that each scenario has a one-to-one test. Linux and Windows were not executed locally.

| Spec                         | Requirements | Scenarios | Source and test evidence                                                                             |
| ---------------------------- | -----------: | --------: | ---------------------------------------------------------------------------------------------------- |
| `cli:change-implementation`  |           11 |        31 | `commands/change/implementation.ts`; `change-implementation.spec.ts`; Core tracking tests            |
| `cli:change-edit`            |            6 |        23 | `commands/change/edit.ts`; `change-edit.spec.ts`; Core EditChange tests                              |
| `cli:change-deps`            |            5 |        32 | `commands/change/deps.ts`; `change-deps.spec.ts`; Core UpdateSpecDeps tests and real-kernel CLI test |
| `cli:spec-deps`              |           10 |        35 | `commands/spec/deps.ts`; `spec-deps.spec.ts`; persisted-deps Core tests                              |
| `cli:graph-index`            |           11 |        51 | `commands/graph/index-graph.ts`; `graph-index.spec.ts`; SDK graph-index tests                        |
| `skills:workflow-automation` |           10 |        25 | skill templates and Skills suite, including repeated-file command examples                           |
| `cli:change-create`          |            8 |        27 | `commands/change/create.ts`; `change-create.spec.ts`; Core CreateChange tests                        |
| `cli:project-init`           |            9 |        29 | `commands/project/init.ts`; `project-init.spec.ts`; ConfigWriter tests                               |

## Findings

### CLI-S2 — Whole-change dependency listing contradicts the merged constraint (spec wording; low; deferred)

The merged `cli:change-deps` constraint says both listing and display use `GetChangeSpecDeps`. A single-spec display calls `kernel.changes.getSpecDeps.execute` at `packages/cli/src/commands/change/deps.ts:97`, but whole-change listing calls `kernel.changes.status.execute` at line 117. `GetChangeSpecDeps` requires a `specId` and has no whole-change list operation; tests exercise both paths. This is a pre-existing contract mismatch, recorded for separate exploration, and unrelated to comma preservation. Either narrow the constraint to single-spec display and name status for whole-change listing, or add a Core list query and change the handler. No change to this behavior is recommended within the present scope.

### CLI-I1 — Explicit default-valued init options can still start the wizard (baseline implementation gap; medium; deferred)

`cli:project-init` permits the interactive wizard only when no configuration flags are supplied. `packages/cli/src/commands/project/init.ts:89-96` detects flags by comparing their _values_ with defaults. Thus, on a TTY, `init --workspace default` or `init --workspace-path specs/` is treated as though no flag were supplied and can open the wizard. This predates the current workspace validator. The init tests cover TTY without flags and explicit values in non-TTY mode, but do not cover explicit default values on a TTY. Commander option-source detection and a targeted TTY test would resolve it. The previous decision journal classifies this outside the present change.

No new CLI or Skills discrepancy was established in the requested comma/ID behavior. In particular, the prior CLI-S1 conflict is resolved: merged add/remove/set verification scenarios now expect fully-qualified dependency IDs, mocked values match the Core contract, and `change-deps.spec.ts` contains a real-kernel CLI mutation that checks both resulting IDs and Core order. The prior CLI-I2 help gap is also resolved: all eight implementation leaves, all five persisted-dependency leaves and init expose `JSON/TOON output schema:`; create's schema includes `changePath`. The new tests inspect each leaf's help; built CLI help was spot-checked.

## Requirement assessment

- `cli:change-implementation`: all eleven local requirement groups supported by source plus CLI/Core tests. Repeated/variadic file names remain arrays and comma-bearing values remain whole; output uses separate lines or arrays.
- `cli:change-edit`: all six groups supported. The adapter forwards raw IDs and delegates validation, ownership and atomic mutation to Core.
- `cli:change-deps`: the five local groups and all 32 scenarios are supported, including canonical output and confirmation. The separate whole-list constraint wording is CLI-S2.
- `cli:spec-deps`: all ten groups and 35 scenarios supported. Strict lock errors, repair hint, no-op remove and confirmation are covered at CLI/Core boundaries.
- `cli:graph-index`: all eleven groups and 51 scenarios supported by the existing index command, SDK graph task and focused CLI suite. No changed implementation branch was found in this audit.
- `skills:workflow-automation`: all ten groups and 25 scenarios supported by current templates/tests; command examples pass separate `--file` values and do not join names with commas.
- `cli:change-create`: all eight groups and 27 scenarios supported. The command forwards raw IDs; Core owns ID and ownership checks; structured output and help include `changePath`.
- `cli:project-init`: workspace-name validation, outputs and other local scenarios supported. The broader interactive-mode requirement has the explicit-default gap CLI-I1.

## Scenario inventory

The following inventory is the complete set of compiled scenario titles for the eight assigned merged specs. “Supported” means code inspection and relevant tests support the scenario, potentially through Core or SDK; it does not imply a dedicated test per line. The two deferred findings above concern a constraint and a wizard edge case outside the listed acceptance scenarios.

### cli:change-implementation (31)

|   # | Merged scenario                                                     | Assessment                                                        |
| --: | ------------------------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | Subcommands are reachable                                           | Supported by inspected implementation and relevant suite evidence |
|   2 | Add creates tracked file when none existed                          | Supported by inspected implementation and relevant suite evidence |
|   3 | Add refines an existing spec-plus-file link with symbols            | Supported by inspected implementation and relevant suite evidence |
|   4 | Adding a link to a missing file fails                               | Supported by inspected implementation and relevant suite evidence |
|   5 | Resolve closes tracked-file review for multiple files               | Supported by inspected implementation and relevant suite evidence |
|   6 | Resolving a missing file fails                                      | Supported by inspected implementation and relevant suite evidence |
|   7 | Resolving an untracked file fails                                   | Supported by inspected implementation and relevant suite evidence |
|   8 | Resolving a removed file fails                                      | Supported by inspected implementation and relevant suite evidence |
|   9 | Resolve a file whose name contains a comma                          | Supported by inspected implementation and relevant suite evidence |
|  10 | One missing file aborts the whole resolve                           | Supported by inspected implementation and relevant suite evidence |
|  11 | Unresolving an existing file reopens review                         | Supported by inspected implementation and relevant suite evidence |
|  12 | Unresolving an untracked file fails                                 | Supported by inspected implementation and relevant suite evidence |
|  13 | Unresolving a removed file fails                                    | Supported by inspected implementation and relevant suite evidence |
|  14 | Unresolve accepts repeated names and names with commas              | Supported by inspected implementation and relevant suite evidence |
|  15 | Ignore marks multiple files as ignored                              | Supported by inspected implementation and relevant suite evidence |
|  16 | Ignoring a new missing file fails                                   | Supported by inspected implementation and relevant suite evidence |
|  17 | Ignoring a missing-but-tracked file succeeds                        | Supported by inspected implementation and relevant suite evidence |
|  18 | Ignoring a linked tracked file preserves confirmed links            | Supported by inspected implementation and relevant suite evidence |
|  19 | Ignore a file whose name contains a comma                           | Supported by inspected implementation and relevant suite evidence |
|  20 | A comma-joined value is one name                                    | Supported by inspected implementation and relevant suite evidence |
|  21 | Removing one symbol preserves the remaining refinements             | Supported by inspected implementation and relevant suite evidence |
|  22 | Removing last symbol preserves explicit file-level link             | Supported by inspected implementation and relevant suite evidence |
|  23 | Remove forwards spec and symbol raw, including a comma in a symbol  | Supported by inspected implementation and relevant suite evidence |
|  24 | Manual add uses raw project-relative path instead of workspace:path | Supported by inspected implementation and relevant suite evidence |
|  25 | List renders SDK outcomes without fallback                          | Supported by inspected implementation and relevant suite evidence |
|  26 | Review distinguishes missing from inconclusive absence              | Supported by inspected implementation and relevant suite evidence |
|  27 | Start explicitly activates implementation tracking                  | Supported by inspected implementation and relevant suite evidence |
|  28 | Spec ID is passed raw                                               | Supported by inspected implementation and relevant suite evidence |
|  29 | Values are never trimmed                                            | Supported by inspected implementation and relevant suite evidence |
|  30 | Text listing prints one name per line                               | Supported by inspected implementation and relevant suite evidence |
|  31 | Structured output keeps arrays                                      | Supported by inspected implementation and relevant suite evidence |

### cli:change-edit (23)

|   # | Merged scenario                                         | Assessment                                                        |
| --: | ------------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | No edit flags provided                                  | Supported by inspected implementation and relevant suite evidence |
|   2 | Values are forwarded unchanged                          | Supported by inspected implementation and relevant suite evidence |
|   3 | A value with a comma is one ID                          | Supported by inspected implementation and relevant suite evidence |
|   4 | Usage error precedes configuration resolution           | Supported by inspected implementation and relevant suite evidence |
|   5 | Remove values are forwarded unchanged                   | Supported by inspected implementation and relevant suite evidence |
|   6 | Command resolves no workspace itself                    | Supported by inspected implementation and relevant suite evidence |
|   7 | Workspace added when new spec requires it               | Supported by inspected implementation and relevant suite evidence |
|   8 | Workspace removed when no specs reference it            | Supported by inspected implementation and relevant suite evidence |
|   9 | Workspace unchanged when other specs still reference it | Supported by inspected implementation and relevant suite evidence |
|  10 | Adding spec from readOnly workspace rejected            | Supported by inspected implementation and relevant suite evidence |
|  11 | Removing spec not subject to ownership check            | Supported by inspected implementation and relevant suite evidence |
|  12 | No edits applied when readOnly check fails              | Supported by inspected implementation and relevant suite evidence |
|  13 | Spec change triggers invalidation                       | Supported by inspected implementation and relevant suite evidence |
|  14 | No active approval — no invalidation event              | Supported by inspected implementation and relevant suite evidence |
|  15 | Text output shows updated specs and workspaces          | Supported by inspected implementation and relevant suite evidence |
|  16 | JSON output with invalidation                           | Supported by inspected implementation and relevant suite evidence |
|  17 | Change not found                                        | Supported by inspected implementation and relevant suite evidence |
|  18 | Removing spec not in specIds                            | Supported by inspected implementation and relevant suite evidence |
|  19 | Unknown workspace prefix in --add-spec                  | Supported by inspected implementation and relevant suite evidence |
|  20 | ReadOnly workspace in --add-spec                        | Supported by inspected implementation and relevant suite evidence |
|  21 | Invalid spec ID                                         | Supported by inspected implementation and relevant suite evidence |
|  22 | Unknown workspace                                       | Supported by inspected implementation and relevant suite evidence |
|  23 | Invalid invalidation policy                             | Supported by inspected implementation and relevant suite evidence |

### cli:change-deps (32)

|   # | Merged scenario                                       | Assessment                                                        |
| --: | ----------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | Add deps to a spec in the change                      | Supported by inspected implementation and relevant suite evidence |
|   2 | Remove deps from a spec in the change                 | Supported by inspected implementation and relevant suite evidence |
|   3 | Set (replace) deps for a spec                         | Supported by inspected implementation and relevant suite evidence |
|   4 | List all dependencies in the change                   | Supported by inspected implementation and relevant suite evidence |
|   5 | Display dependencies for a specific spec              | Supported by inspected implementation and relevant suite evidence |
|   6 | Help lists --clear and --force                        | Supported by inspected implementation and relevant suite evidence |
|   7 | set value with a comma is one ID                      | Supported by inspected implementation and relevant suite evidence |
|   8 | Values are passed unchanged                           | Supported by inspected implementation and relevant suite evidence |
|   9 | JSON output format                                    | Supported by inspected implementation and relevant suite evidence |
|  10 | No deps remaining shows none                          | Supported by inspected implementation and relevant suite evidence |
|  11 | Error when change not found                           | Supported by inspected implementation and relevant suite evidence |
|  12 | Error when specId not in change.specIds               | Supported by inspected implementation and relevant suite evidence |
|  13 | Error when --set used with --add                      | Supported by inspected implementation and relevant suite evidence |
|  14 | Error when removing non-existent dep                  | Supported by inspected implementation and relevant suite evidence |
|  15 | Error when modification flags provided without specId | Supported by inspected implementation and relevant suite evidence |
|  16 | --set with an empty value is rejected                 | Supported by inspected implementation and relevant suite evidence |
|  17 | --add with a blank value is rejected                  | Supported by inspected implementation and relevant suite evidence |
|  18 | Unknown workspace in a dependency                     | Supported by inspected implementation and relevant suite evidence |
|  19 | Dependency on a spec not created yet is accepted      | Supported by inspected implementation and relevant suite evidence |
|  20 | Display mode accepts a bare spec ID                   | Supported by inspected implementation and relevant suite evidence |
|  21 | Confirmed on a terminal                               | Supported by inspected implementation and relevant suite evidence |
|  22 | Declined on a terminal                                | Supported by inspected implementation and relevant suite evidence |
|  23 | --force skips the question                            | Supported by inspected implementation and relevant suite evidence |
|  24 | No terminal and no force fails                        | Supported by inspected implementation and relevant suite evidence |
|  25 | clear conflicts with add, remove, and set             | Supported by inspected implementation and relevant suite evidence |
|  26 | clear requires a specId                               | Supported by inspected implementation and relevant suite evidence |
|  27 | Display mode holds no spec ID parser                  | Supported by inspected implementation and relevant suite evidence |
|  28 | Help lists --clear and --force                        | Supported by inspected implementation and relevant suite evidence |
|  29 | Blank --add value                                     | Supported by inspected implementation and relevant suite evidence |
|  30 | Unknown workspace in a dependency                     | Supported by inspected implementation and relevant suite evidence |
|  31 | Raw forwarding of every modification flag             | Supported by inspected implementation and relevant suite evidence |
|  32 | Text output prints the normalized spec ID             | Supported by inspected implementation and relevant suite evidence |

### cli:spec-deps (35)

|   # | Merged scenario                                                            | Assessment                                                        |
| --: | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | Every subcommand accepts --format                                          | Supported by inspected implementation and relevant suite evidence |
|   2 | List prints the persisted dependsOn list                                   | Supported by inspected implementation and relevant suite evidence |
|   3 | List on an uninitialized spec reports not-yet-initialized distinctly       | Supported by inspected implementation and relevant suite evidence |
|   4 | Add appends every supplied dependency ID                                   | Supported by inspected implementation and relevant suite evidence |
|   5 | Remove drops the given dependency                                          | Supported by inspected implementation and relevant suite evidence |
|   6 | Remove on an uninitialized spec reports a no-op, not an error              | Supported by inspected implementation and relevant suite evidence |
|   7 | Set replaces the entire dependsOn list                                     | Supported by inspected implementation and relevant suite evidence |
|   8 | Set with no --dep flags clears the list                                    | Supported by inspected implementation and relevant suite evidence |
|   9 | Clear empties the dependsOn list                                           | Supported by inspected implementation and relevant suite evidence |
|  10 | Clear confirmed on a terminal                                              | Supported by inspected implementation and relevant suite evidence |
|  11 | Clear declined                                                             | Supported by inspected implementation and relevant suite evidence |
|  12 | Clear with --force                                                         | Supported by inspected implementation and relevant suite evidence |
|  13 | No terminal and no force                                                   | Supported by inspected implementation and relevant suite evidence |
|  14 | Add, remove, and set map directly onto UpdatePersistedSpecDepsInput        | Supported by inspected implementation and relevant suite evidence |
|  15 | Add, remove, and clear map onto the use case input                         | Supported by inspected implementation and relevant suite evidence |
|  16 | Set without --dep sends an empty list                                      | Supported by inspected implementation and relevant suite evidence |
|  17 | List on an uninitialized spec                                              | Supported by inspected implementation and relevant suite evidence |
|  18 | Unknown spec on list                                                       | Supported by inspected implementation and relevant suite evidence |
|  19 | Invalid and unknown-workspace IDs                                          | Supported by inspected implementation and relevant suite evidence |
|  20 | Concurrent modification maps to a retry message                            | Supported by inspected implementation and relevant suite evidence |
|  21 | Read-only workspace gives no configuration workaround                      | Supported by inspected implementation and relevant suite evidence |
|  22 | Repair hint is exactly the three commands                                  | Supported by inspected implementation and relevant suite evidence |
|  23 | No hint for other lock fields                                              | Supported by inspected implementation and relevant suite evidence |
|  24 | Non-interactive clear message names no --clear option                      | Supported by inspected implementation and relevant suite evidence |
|  25 | Unknown spec maps to exit code 1                                           | Supported by inspected implementation and relevant suite evidence |
|  26 | Concurrent modification maps to exit code 1 with retry guidance            | Supported by inspected implementation and relevant suite evidence |
|  27 | Read-only workspace maps to exit code 1 without a configuration workaround | Supported by inspected implementation and relevant suite evidence |
|  28 | Invalid lock maps to exit 1 with field path                                | Supported by inspected implementation and relevant suite evidence |
|  29 | Invalid and unknown workspace IDs map to exit 1                            | Supported by inspected implementation and relevant suite evidence |
|  30 | Bare spec ID passed unchanged                                              | Supported by inspected implementation and relevant suite evidence |
|  31 | Dependency with a comma is one value                                       | Supported by inspected implementation and relevant suite evidence |
|  32 | Empty dependency value rejected                                            | Supported by inspected implementation and relevant suite evidence |
|  33 | Missing dependency target rejected                                         | Supported by inspected implementation and relevant suite evidence |
|  34 | Remove on an uninitialized spec renders initialized false                  | Supported by inspected implementation and relevant suite evidence |
|  35 | Add, set, and clear render initialized true                                | Supported by inspected implementation and relevant suite evidence |

### cli:graph-index (51)

|   # | Merged scenario                                              | Assessment                                                        |
| --: | ------------------------------------------------------------ | ----------------------------------------------------------------- |
|   1 | Minimal invocation with defaults                             | Supported by inspected implementation and relevant suite evidence |
|   2 | --exclude-path is project-relative and global                | Supported by inspected implementation and relevant suite evidence |
|   3 | --exclude-path value with a comma is one pattern             | Supported by inspected implementation and relevant suite evidence |
|   4 | Several patterns by repeating the option                     | Supported by inspected implementation and relevant suite evidence |
|   5 | Several patterns listed after one option                     | Supported by inspected implementation and relevant suite evidence |
|   6 | Text output shows summary including documents                | Supported by inspected implementation and relevant suite evidence |
|   7 | Text output with errors                                      | Supported by inspected implementation and relevant suite evidence |
|   8 | JSON output                                                  | Supported by inspected implementation and relevant suite evidence |
|   9 | Text output lists the skipped files and the snippet          | Supported by inspected implementation and relevant suite evidence |
|  10 | The list is capped at ten                                    | Supported by inspected implementation and relevant suite evidence |
|  11 | Special characters are escaped in the snippet                | Supported by inspected implementation and relevant suite evidence |
|  12 | Exempt files that were analysed are listed separately        | Supported by inspected implementation and relevant suite evidence |
|  13 | Output is unchanged when nothing exceeded the limit          | Supported by inspected implementation and relevant suite evidence |
|  14 | Structured modes carry data and no hint                      | Supported by inspected implementation and relevant suite evidence |
|  15 | The command never edits the configuration                    | Supported by inspected implementation and relevant suite evidence |
|  16 | Warning in text mode                                         | Supported by inspected implementation and relevant suite evidence |
|  17 | More than ten overlaps                                       | Supported by inspected implementation and relevant suite evidence |
|  18 | No overlap, no section                                       | Supported by inspected implementation and relevant suite evidence |
|  19 | Structured modes carry the diagnostics                       | Supported by inspected implementation and relevant suite evidence |
|  20 | A silent worker produces a warning on standard error         | Supported by inspected implementation and relevant suite evidence |
|  21 | Structured modes do not print warnings                       | Supported by inspected implementation and relevant suite evidence |
|  22 | A native crash prints its cause and context                  | Supported by inspected implementation and relevant suite evidence |
|  23 | Structured failure output carries the cause as data          | Supported by inspected implementation and relevant suite evidence |
|  24 | Events cross the worker boundary as JSON values              | Supported by inspected implementation and relevant suite evidence |
|  25 | Diagnostics are warnings and do not fail the run             | Supported by inspected implementation and relevant suite evidence |
|  26 | Forced structured output reports complete reconsideration    | Supported by inspected implementation and relevant suite evidence |
|  27 | Forced text output does not hide skipped inputs              | Supported by inspected implementation and relevant suite evidence |
|  28 | CLI preserves SDK reconstruction diagnostics                 | Supported by inspected implementation and relevant suite evidence |
|  29 | Mutually exclusive context flags fail fast                   | Supported by inspected implementation and relevant suite evidence |
|  30 | Infrastructure error exits with code 3                       | Supported by inspected implementation and relevant suite evidence |
|  31 | Lock acquisition failure exits with code 3                   | Supported by inspected implementation and relevant suite evidence |
|  32 | Per-file errors do not cause non-zero exit                   | Supported by inspected implementation and relevant suite evidence |
|  33 | graph section present in CLI reference                       | Supported by inspected implementation and relevant suite evidence |
|  34 | graph index flags documented                                 | Supported by inspected implementation and relevant suite evidence |
|  35 | Size limit configuration is documented                       | Supported by inspected implementation and relevant suite evidence |
|  36 | Command delegates exactly once to the SDK isolated worker    | Supported by inspected implementation and relevant suite evidence |
|  37 | CLI does not own lock or subprocess mechanics                | Supported by inspected implementation and relevant suite evidence |
|  38 | Explicit config remains forced in the child                  | Supported by inspected implementation and relevant suite evidence |
|  39 | Automatic discovery replays local cascade in the child       | Supported by inspected implementation and relevant suite evidence |
|  40 | Discovery replay does not silently substitute bootstrap      | Supported by inspected implementation and relevant suite evidence |
|  41 | Packaged task invokes SDK indexing once                      | Supported by inspected implementation and relevant suite evidence |
|  42 | Bootstrap context remains explicit                           | Supported by inspected implementation and relevant suite evidence |
|  43 | Index options cross the process boundary unchanged           | Supported by inspected implementation and relevant suite evidence |
|  44 | Text progress is rendered by the parent                      | Supported by inspected implementation and relevant suite evidence |
|  45 | Structured output remains progress-free                      | Supported by inspected implementation and relevant suite evidence |
|  46 | Built structured child output contains only one final result | Supported by inspected implementation and relevant suite evidence |
|  47 | Forced built index returns normally                          | Supported by inspected implementation and relevant suite evidence |
|  48 | Force recovers only typed storage-open failures              | Supported by inspected implementation and relevant suite evidence |
|  49 | Worker failures preserve CLI error semantics                 | Supported by inspected implementation and relevant suite evidence |
|  50 | Production indexing is always process-isolated               | Supported by inspected implementation and relevant suite evidence |
|  51 | CLI reports provider-owned repair                            | Supported by inspected implementation and relevant suite evidence |

### skills:workflow-automation (25)

|   # | Merged scenario                                                    | Assessment                                                        |
| --: | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
|   1 | Agent uses canonical plural status diagnostics                     | Supported by inspected implementation and relevant suite evidence |
|   2 | Agent chooses TOON for tool-call preparation                       | Supported by inspected implementation and relevant suite evidence |
|   3 | Agent uses JSON only for an explicit exception                     | Supported by inspected implementation and relevant suite evidence |
|   4 | Exact artifact authoring uses specs show                           | Supported by inspected implementation and relevant suite evidence |
|   5 | Semantic working context uses specs context                        | Supported by inspected implementation and relevant suite evidence |
|   6 | Materialization diagnostics use specs metadata                     | Supported by inspected implementation and relevant suite evidence |
|   7 | Metadata is not a configuration or default context source          | Supported by inspected implementation and relevant suite evidence |
|   8 | Agent fetches full outline using canonical command                 | Supported by inspected implementation and relevant suite evidence |
|   9 | Agent avoids inline outline dependency                             | Supported by inspected implementation and relevant suite evidence |
|  10 | Agent follows repair guide after transition failure                | Supported by inspected implementation and relevant suite evidence |
|  11 | Agent uses plural canonical groups in instructions                 | Supported by inspected implementation and relevant suite evidence |
|  12 | Canonical outline command example                                  | Supported by inspected implementation and relevant suite evidence |
|  13 | Agent reuses equivalent data within the same execution step        | Supported by inspected implementation and relevant suite evidence |
|  14 | Agent does not assume continuity across skill sessions             | Supported by inspected implementation and relevant suite evidence |
|  15 | Non-deterministic equivalence forces explicit command              | Supported by inspected implementation and relevant suite evidence |
|  16 | Validate passes but semantic review is still required              | Supported by inspected implementation and relevant suite evidence |
|  17 | Successful single-artifact spec validation uses inline diff review | Supported by inspected implementation and relevant suite evidence |
|  18 | Inline diff unavailability falls back to diff preview command      | Supported by inspected implementation and relevant suite evidence |
|  19 | Overlap or drift risk requires merged preview                      | Supported by inspected implementation and relevant suite evidence |
|  20 | Single-artifact review uses preview filtering                      | Supported by inspected implementation and relevant suite evidence |
|  21 | Agent resolves tracked files explicitly before archive             | Supported by inspected implementation and relevant suite evidence |
|  22 | Agent resolves several files with repeated options                 | Supported by inspected implementation and relevant suite evidence |
|  23 | Agent never joins file names with commas                           | Supported by inspected implementation and relevant suite evidence |
|  24 | Agent delegates to optimizer subagent                              | Supported by inspected implementation and relevant suite evidence |
|  25 | Inline optimization fallback                                       | Supported by inspected implementation and relevant suite evidence |

### cli:change-create (27)

|   # | Merged scenario                                   | Assessment                                                        |
| --: | ------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | Missing name argument                             | Supported by inspected implementation and relevant suite evidence |
|   2 | No --spec flag creates change with empty specIds  | Supported by inspected implementation and relevant suite evidence |
|   3 | Values are forwarded unchanged                    | Supported by inspected implementation and relevant suite evidence |
|   4 | A value with a comma is one ID                    | Supported by inspected implementation and relevant suite evidence |
|   5 | Invalid ID rejected                               | Supported by inspected implementation and relevant suite evidence |
|   6 | Invalid change name rejected by the core          | Supported by inspected implementation and relevant suite evidence |
|   7 | Workspace prefix omitted defaults to default      | Supported by inspected implementation and relevant suite evidence |
|   8 | Explicit workspace prefix used                    | Supported by inspected implementation and relevant suite evidence |
|   9 | Unknown workspace prefix                          | Supported by inspected implementation and relevant suite evidence |
|  10 | Workspace derived by the use case                 | Supported by inspected implementation and relevant suite evidence |
|  11 | Spec targeting readOnly workspace rejected        | Supported by inspected implementation and relevant suite evidence |
|  12 | Multiple readOnly specs each produce an error     | Supported by inspected implementation and relevant suite evidence |
|  13 | Mixed owned and readOnly specs rejected           | Supported by inspected implementation and relevant suite evidence |
|  14 | Owned workspace specs accepted normally           | Supported by inspected implementation and relevant suite evidence |
|  15 | Command checks no ownership itself                | Supported by inspected implementation and relevant suite evidence |
|  16 | Mixed owned and readOnly specs                    | Supported by inspected implementation and relevant suite evidence |
|  17 | Several readOnly specs each produce a line        | Supported by inspected implementation and relevant suite evidence |
|  18 | Schema resolved inside CreateChange               | Supported by inspected implementation and relevant suite evidence |
|  19 | Manifest still records effective schema identity  | Supported by inspected implementation and relevant suite evidence |
|  20 | CLI passes includeOverlapCheck when specs present | Supported by inspected implementation and relevant suite evidence |
|  21 | Overlap warning emitted from result report        | Supported by inspected implementation and relevant suite evidence |
|  22 | CLI does not call detectOverlap directly          | Supported by inspected implementation and relevant suite evidence |
|  23 | No overlap check when specIds empty               | Supported by inspected implementation and relevant suite evidence |
|  24 | Successful creation                               | Supported by inspected implementation and relevant suite evidence |
|  25 | JSON output contains changePath                   | Supported by inspected implementation and relevant suite evidence |
|  26 | Name already exists                               | Supported by inspected implementation and relevant suite evidence |
|  27 | Invalid invalidation policy                       | Supported by inspected implementation and relevant suite evidence |

### cli:project-init (29)

|   # | Merged scenario                                                                        | Assessment                                                        |
| --: | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
|   1 | --plugin flag                                                                          | Supported by inspected implementation and relevant suite evidence |
|   2 | specd init alias works identically to specd project init                               | Supported by inspected implementation and relevant suite evidence |
|   3 | specd init --format json produces identical output to specd project init --format json | Supported by inspected implementation and relevant suite evidence |
|   4 | Plugin selection wizard                                                                | Supported by inspected implementation and relevant suite evidence |
|   5 | Wizard includes Open Code in known options                                             | Supported by inspected implementation and relevant suite evidence |
|   6 | Wizard includes standard agent plugin                                                  | Supported by inspected implementation and relevant suite evidence |
|   7 | Default values produce a valid minimal config                                          | Supported by inspected implementation and relevant suite evidence |
|   8 | JSON output contains plugins install results                                           | Supported by inspected implementation and relevant suite evidence |
|   9 | Text output reports metadata cache path                                                | Supported by inspected implementation and relevant suite evidence |
|  10 | JSON output includes metadataCachePath                                                 | Supported by inspected implementation and relevant suite evidence |
|  11 | Config written to git root when inside a subdirectory                                  | Supported by inspected implementation and relevant suite evidence |
|  12 | Config written to CWD when not inside a git repository                                 | Supported by inspected implementation and relevant suite evidence |
|  13 | Standard directories are created                                                       | Supported by inspected implementation and relevant suite evidence |
|  14 | .gitignore entry is added                                                              | Supported by inspected implementation and relevant suite evidence |
|  15 | Init uses createConfigWriter not InitProject use case                                  | Supported by inspected implementation and relevant suite evidence |
|  16 | tmp gitignore created idempotently                                                     | Supported by inspected implementation and relevant suite evidence |
|  17 | tmp gitignore preserved on re-init with --force                                        | Supported by inspected implementation and relevant suite evidence |
|  18 | Metadata cache directory created idempotently                                          | Supported by inspected implementation and relevant suite evidence |
|  19 | Metadata cache entry appended to root .gitignore                                       | Supported by inspected implementation and relevant suite evidence |
|  20 | CLI surfaces metadataCachePath from the InitProject result rather than re-deriving it  | Supported by inspected implementation and relevant suite evidence |
|  21 | Plugins are installed for selected plugins after init                                  | Supported by inspected implementation and relevant suite evidence |
|  22 | Non-interactive mode fails without --force                                             | Supported by inspected implementation and relevant suite evidence |
|  23 | --force overwrites existing config                                                     | Supported by inspected implementation and relevant suite evidence |
|  24 | One-character workspace id rejected                                                    | Supported by inspected implementation and relevant suite evidence |
|  25 | Windows device name rejected                                                           | Supported by inspected implementation and relevant suite evidence |
|  26 | Uppercase and underscore rejected                                                      | Supported by inspected implementation and relevant suite evidence |
|  27 | Two-character workspace id accepted                                                    | Supported by inspected implementation and relevant suite evidence |
|  28 | Interactive prompt asks again                                                          | Supported by inspected implementation and relevant suite evidence |
|  29 | No private expression                                                                  | Supported by inspected implementation and relevant suite evidence |
