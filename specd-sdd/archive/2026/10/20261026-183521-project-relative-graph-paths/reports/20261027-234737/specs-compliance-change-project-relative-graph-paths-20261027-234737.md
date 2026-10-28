# Specs compliance (round 3): project-relative-graph-paths

Mode: change. Previous: ../20261027-193307, ../20261027-210131.

## Detailed Findings

# Partial re-audit round 3: code-graph batch (project-relative-graph-paths)

Scope: core:config (graph reqs), code-graph:indexer, code-graph:workspace-integration, code-graph:explain-graph-path.
Evidence: merged spec/verify previews, source reading of discover-files.ts (`pathBelowDirectory`, `directoriesBetween`, `loadIgnoreFile`, `evaluateGitignore`), explain-graph-path.ts (step 1 normalization), tests under packages/code-graph/test. Tests not re-run (read-only audit; previous run was green).

## Previous findings status

| ID                                                                      | Status                         | Evidence                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D8 backslash/drive input                                                | RESOLVED                       | explain-graph-path.ts:271-296 (`foreignDrivePath`, `replaceAll('\\','/')` on relative and `ws:` input); explain spec bullet line 15 now states it; tests explain-graph-path.spec.ts:177-204.                                                                                                                                                      |
| D11 verify still speaks of WorkspaceIndexTarget                         | PARTIAL / ACCEPTED             | `buildWorkspaceTargets` no longer appears in workspace-integration verify. Only line 287 mentions `WorkspaceIndexTarget.respectGitignore` (a real field still carried by the target type). LOW, no action.                                                                                                                                        |
| D6 non-text file reported as document                                   | OPEN (LOW, accepted candidate) | Spec step 8 still says "textual without an adapter"; code (adapter step) has no decode check. Spec-wrong (relax to "documents decided at read time") or add check.                                                                                                                                                                                |
| D7b category lists concatenated vs largeFilePaths per list              | ACCEPTED                       | Behaviour not stated in spec; unchanged.                                                                                                                                                                                                                                                                                                          |
| D13 layering                                                            | ACCEPTED-AS-IS                 | Pre-existing pattern.                                                                                                                                                                                                                                                                                                                             |
| D14 gitignoreSource.file outside-project root / last textual line match | OPEN (LOW, accepted)           | Unchanged; see also NN3 below.                                                                                                                                                                                                                                                                                                                    |
| N1 intermediate .gitignore not loaded                                   | RESOLVED                       | discover-files.ts:238 loads `directoriesBetween(gitRoot, root)` top-down between vcsRoot and root, then root, then walk dirs, so order is farthest to nearest. Spec workspace-integration step 2 now says "from every directory between the VCS root and the codeRoot". Tests discover-files.spec.ts:397 (apply) and :412 (nearer negation wins). |
| N2 realpath handling untested                                           | PARTIAL                        | New test :428 covers symlinked vcsRoot. Symlinked codeRoot (real vcsRoot) and root outside vcsRoot still untested.                                                                                                                                                                                                                                |
| N3 double load when vcsRoot is another spelling                         | OPEN (LOW)                     | Unchanged, harmless (loadedDirs keys on absolute spelling).                                                                                                                                                                                                                                                                                       |
| N4 lazy enumerable `rule` getter                                        | OPEN (LOW)                     | Not touched in group 17.                                                                                                                                                                                                                                                                                                                          |
| N5 root-candidate includePaths tested as file                           | OPEN (LOW)                     | Not touched.                                                                                                                                                                                                                                                                                                                                      |
| N6 category concat vs per-list; legacy JSDoc                            | OPEN (LOW, spec)               | Not touched.                                                                                                                                                                                                                                                                                                                                      |

## New discrepancies

NN1 [LOW, spec limitation] Single-letter workspace names collide with drive paths. `a:/src/x.ts` or `a:\x` with a workspace named `a` is classified as a drive path (explain-graph-path.ts:274, regex `^[A-Za-z]:([/\\]|$)`) and reported as outside the project. The spec (workspace-integration "Drive letters are not workspace names", explain-graph-path bullet) mandates exactly this, so code matches spec. `a:src/x.ts` (no slash) still resolves as workspace-qualified. Worth one sentence in the explain spec that single-letter workspaces must be addressed without a leading separator.

NN2 [LOW, spec-vs-code wording] On POSIX a drive path yields `projectRelativePath = "C:/other/a.ts"` (the absolute text, not project-relative) and zero candidates. The spec says "(it is then outside the project)" but does not say what `projectRelativePath` holds for outside paths; the existing PATH_OUTSIDE_PROJECT convention for other absolute paths should be confirmed consistent (test :155 covers the POSIX-absolute case). On Windows hosts a drive path takes the `resolve()` branch and is handled normally. Behaviour is host-dependent by design.

NN3 [LOW, code] `gitignoreSource.file` for an above-root .gitignore is built with `posix.normalize([pathBase, base, '.gitignore'])` where `base = relative(root, absoluteDir)`. When the root is passed through a symlink spelling and the intermediate/VCS dir is the real path (directoriesBetween joins `realpathSync(ancestor)`), `base` becomes a long `../../real/...` string and the reported file path is wrong (cosmetic; the rule decision itself uses `rootBelow` from realpath and is correct). Also when `pathBase` is `''` (codeRoot is the project root and the VCS root is above it), the reported file is `../.gitignore`, a path outside the project; spec says project-relative. Edge cases only.

NN4 [LOW, behaviour vs git] A farther .gitignore that ignores a directory (`build/`) combined with a nearer file that negates a path inside it (`!build/keep.txt`) re-includes the file in `evaluateGitignore` (`unignored -> decided = null`). Git never re-includes under an excluded parent. In discovery the walker prunes the ignored directory first so the indexer is unaffected; `explain` evaluates ancestors top-down too, so it should also stop at the directory. Pre-existing across scopes, newly reachable via intermediate files. Not specified; spec silent. No test.

NN5 [LOW, robustness] `directoriesBetween` uses `realpathSync(ancestor)` for the join but `loadedDirs` and walk-time `loadDirectory` use root-spelled paths. No overlap exists (intermediates are strictly above root) so there is no double load. On a failed realpath (missing dir) it falls back to the given spelling; fine. Windows: `relative()` is case-insensitive there, `realpath` normalizes case; no defect found.

NN6 [LOW, staleness] Incremental/health freshness does not appear to hash any `.gitignore` (grep of application/ outside discover-files and explain finds none). Changing an intermediate or VCS-root .gitignore therefore does not trigger a re-discovery by itself; pre-existing, not introduced by group 17, and not required by the specs reviewed. Mention only.

No HIGH or MEDIUM discrepancies.

## Test coverage gaps

1. Symlinked codeRoot with real-path intermediate (NN3/N2): untested. Intermediate .gitignore is only tested through `discoverFiles`, not through `explain` (`gitignoreSource.file` for an intermediate file, e.g. `packages/.gitignore`): no test.
2. Marker rebuild (previous gap 2): now covered by workspace-indexing.spec.ts:159 (`fullRebuildReason` with `FULL_REBUILD_FINGERPRINT_REASON`) and fingerprint spec; the legacy-store-without-marker variant is covered at unit level only. Treat as covered.
3. Explain: binary-content file without adapter (D6), size exemption with `respectGitignore:false`, workspace `!` vs project `largeFilePaths`, outside-project `allowedPaths` anchored patterns remain unmapped (carried over).
4. Drive-letter on a Windows host (`process.platform === 'win32'` branch) untestable on this host; no mocked-platform test. Single-letter workspace collision (NN1) untested.
5. All other verify scenarios of the four specs map to tests or implementation; new group-17 verify scenarios (intermediate gitignore, backslash/drive inputs) map to tests listed above.

## Summary counts

- Previous items: resolved 3 (D8, N1, D11 effectively), partial 1 (N2), accepted 4 (D7b, D13, D11 residue, D14), still open LOW 5 (D6, N3, N4, N5, N6).
- New: 6 (HIGH 0, MEDIUM 0, LOW 6). Spec-wrong/gap: NN1, NN2 (wording), NN4 (silent). Code-wrong: NN3. Info only: NN5, NN6.
- Verify scenarios without a test: 0 new; weak: intermediate gitignore via explain, symlinked codeRoot.

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
