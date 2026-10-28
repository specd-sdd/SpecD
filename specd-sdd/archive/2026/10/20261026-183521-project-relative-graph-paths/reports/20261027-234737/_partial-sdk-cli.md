# Partial re-audit (round 3): sdk:run-graph-why, cli:graph-why, cli:graph-index (overlap warning, --exclude-path)

Read-only; no code or specs modified. Spec text read via `changes spec-preview` (merged spec + verify).

## Previous findings status

| #   | Previous finding                                                                    | Status                                        | Notes                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [LOW] sdk req 3 said "path and effective project configuration from ctx"            | CLOSED                                        | Spec now reads "Delegate to the provider's `explainPath(path)` ... with the effective project configuration the provider was created with"; matches `run-graph-why.ts`. |
| 2   | [LOW] sdk req 4 "every location as projectRelativePath" though SDK projects nothing | CLOSED                                        | Spec now says "Return the use case result unchanged ... SDK adds no projection of its own". Matches code.                                                               |
| 3   | [LOW] why.ts builds SdkHostContext manually                                         | STILL OPEN (code smell, not a spec violation) | Unchanged (`kernel !== null ? {...} : createSdkContext(...)`).                                                                                                          |
| 4   | [LOW] `category: -  kind: -` for non-indexable candidates                           | CLOSED/accepted                               | Spec mandates category/kind only for `indexable`.                                                                                                                       |
| 5   | [INFO] `--exclude-path` variadic/comma splitting, spec silent                       | STILL OPEN (info)                             | Spec says "repeatable"; comma form is extra behavior, harmless.                                                                                                         |
| 6   | [LOW] diagnostics printed before candidates (spec item 5: last)                     | CLOSED                                        | `renderGraphWhyText` now prints diagnostics after all candidates; test "prints diagnostics after all candidates".                                                       |
| 7   | [LOW] cli-reference lacks indexable example                                         | CLOSED                                        | `docs/cli/cli-reference.md` L1642-1655 has an indexable text sample (with note on diagnostics order).                                                                   |
| 8   | [INFO] eslint / thin presenter                                                      | OK                                            | why.ts imports only `@specd/sdk`; test asserts it.                                                                                                                      |

Previous test gaps:

- Negation label, inGraph yes/no/unknown: CLOSED (earlier).
- `not-in-scope` text and size-limit detail: CLOSED (graph-why.spec.ts "renders not-in-scope without candidates and a size-limit step with its numbers"). `exempt` and `viaDirectory` suffix still not asserted [LOW].
- Absolute path form passed to explainPath: CLOSED (L181). `workspace:path` form: CLOSED (L175). Project-relative form: CLOSED (`a.ts`).
- Bootstrap `--path` handling: CLOSED (L187, context resolution only; `GraphWhyRequiresConfigError` rendering itself is still untested [LOW]).
- Repeated `--exclude-path` flags: CLOSED (graph-index.spec.ts L277).
- UNKNOWN_WORKSPACE exit status at error-contract level: STILL OPEN [LOW]. Test asserts the mocked provider rejection with `code`, not a rendered error / non-zero exit via the CLI error handler.
- SDK "Locations are project-relative": now N/A as an SDK behavior; the test "returns the provider explanation unchanged" (`toBe(EXPLANATION)`) covers the reworded spec. CLOSED.
- graph index hint wording: CLOSED (overlap test checks `graph.excludePaths` and `specd graph why <path>`).

## New discrepancies

No HIGH or MEDIUM.

- [LOW, docs wrong/incomplete] `docs/cli/cli-reference.md` graph index options table (L1279) describes `--exclude-path` only as "Gitignore-syntax pattern to exclude (repeatable; merges with config)". Spec `default:_global/docs` item for cli:graph-index (flag description) and the cli:graph-index signature say: project-root-relative and merged into the global exclusion layer (not negatable by workspace `!`). The "#### --exclude-path merging" section (L1333) also omits the project-relative / non-negatable wording. The generic sentence at L1259 ("All graph patterns ... relative to the project root") partially covers it. Fix docs.
- [LOW, docs weak] cli-reference `graph why` "excluded path" example (L1632-1636) shows only the command, not output. The output sample exists in `docs/cli/graph.md` L301. Spec requires "an example of an excluded path and of an indexable path"; satisfied, but a text sample for the excluded case would be stronger.
- [LOW, spec imprecise] cli:graph-index overlap scenarios say "overlap diagnostics" and "the diagnostics are part of the IndexResult"; the implementation exposes `workspaceOverlapCount` / `workspaceOverlaps` fields (documented in cli-reference L1259), not entries of `diagnostics`. Behavior is consistent; spec wording should say "overlap fields" (spec wrong, wording only).
- [INFO] Overlap warning text matches spec: count line, up to 10 `path — workspaces`, `... and N more`, hint naming `graph.excludePaths`, `allowedPaths/excludePaths` and `specd graph why <path>`. The section has no separate heading; spec says "warning section"; acceptable.
- [INFO] Text output of `graph why` matches all five spec items in order (path+verdict+owners; candidate with identity/verdict/category/kind; steps with pattern, negation label and origin; inGraph on candidate header line; diagnostics last) and the global-vs-workspace-negation sentence.

## Docs requirements (default:\_global/docs) for graph why

- CLI reference: `### graph why` present with signature, accepted path forms, output fields, options table, excluded and indexable examples, project-relative interpretation. OK.
- CLI docs index `docs/cli/index.md` L38 mentions `graph why`. OK.
- Sidebar `apps/public-web/sidebars.ts` includes `cli/graph`, `cli/index`, `cli/cli-reference`; `graph why` also documented in `docs/cli/graph.md` (L19, L263). OK.
- SDK docs `docs/sdk/index.md` L139 (function table), L459 (command map), L469 (export list) include `runGraphWhy`. OK. Types `RunGraphWhyInput`/`Result` exported from `packages/sdk/src/index.ts` L47-48, with Explain\* types re-exported.
- Guides reference it (`code-graph.md` L100, `configuration.md` L528, `workspaces.md` L288). OK.
- Help text in why.ts documents the JSON/TOON schema. OK.

## Test coverage gaps

All verify scenarios of sdk:run-graph-why are covered (transient, caller-owned, delegation implicit via mock, unchanged result/no added fields, error propagation incl. close on transient, export). Remaining:

- [LOW] cli:graph-why "Unknown workspace": exit status/rendered error not asserted via the standard CLI error handler (only rejected promise with code).
- [LOW] cli:graph-why "Missing configuration": covered via mocked context-resolution failure (ExitSentinel); no `GraphWhyRequiresConfigError` rendering test.
- [LOW] `exempt` flag and `viaDirectory` suffix in step rendering untested.
- [LOW] cli:graph-why "Documented": manual only.
- [LOW] cli:graph-index scenario "--exclude-path is project-relative and global / not re-includable by workspace `!`": CLI test only checks forwarding of patterns to the task input; end-to-end semantic belongs to code-graph tests (outside this batch, not verified here).
- Covered: overlap 3 / 14 (10 + "4 more") / none / json-toon carrying data, repeated `--exclude-path`, comma form, stale notice, JSON/TOON equality, excluded exit 0.

## Summary counts

- Requirements audited: sdk 3, cli:graph-why 6, cli:graph-index (overlap warning, --exclude-path) 2. Implemented 11; partial 0; missing 0.
- Previous findings: 5 closed (sdk req 3, sdk req 4, diagnostics order, indexable example, category/kind accepted), 2 open (code smell, info comma split).
- New: 0 HIGH, 0 MEDIUM, 3 LOW (1 docs wrong, 1 docs weak, 1 spec wording), 0 code-wrong.
- Remaining test gaps: 5, all LOW.
