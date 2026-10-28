# Specs compliance (re-audit): project-relative-graph-paths

Mode: change. Previous report: ../20261027-193307. Batches: code-graph, sdk-cli.

## Detailed Findings

# Partial re-audit: code-graph batch (project-relative-graph-paths)

Scope: core:config (graph reqs), code-graph:indexer, code-graph:workspace-integration, code-graph:explain-graph-path.
Evidence: merged spec/verify previews, source reading of the post-group-16 working tree, vitest run of `packages/code-graph/test/application` + `test/domain` (64 files, 746 tests, all pass).

## Previous findings status

| ID                                                                                  | Prev sev | Status                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1 repo-level .gitignore above codeRoot                                             | HIGH     | RESOLVED                                                                            | `discover-files.ts`: `ScopedIgnore.rootBelow` computed via `pathBelowDirectory` (realpath-safe); `evaluateGitignore` tests `rootBelow/relPath`; `gitignoreSource.file` project-relative via `posix.normalize([pathBase, '..', '.gitignore'])`. Tests `discover-files.spec.ts:363-398` (exclusion + file/line). Verify scenario "Repository .gitignore applies below the VCS root" is covered. |
| D2 size-limit exempt outcome                                                        | MEDIUM   | RESOLVED (spec aligned to code)                                                     | Spec step 6 now says exempt = `matched` with rule + `exempt: true`, too-large = `matched` with no rule; code matches.                                                                                                                                                                                                                                                                         |
| D3 default exclusions `.hg/` `.svn/`                                                | LOW      | RESOLVED                                                                            | core:config list now includes `.hg/`, `.svn/`.                                                                                                                                                                                                                                                                                                                                                |
| D4 stale codeRoot JSDoc                                                             | MEDIUM   | RESOLVED                                                                            | `specd-config.ts` (excludePaths, largeFilePaths, includePaths docs) now project-relative; workspace layer cannot negate global. `classify-file-category.ts:35` legacy wrapper wording left (accepted, see N6).                                                                                                                                                                                |
| D5 health size gate                                                                 | MEDIUM   | RESOLVED                                                                            | `get-graph-health.ts` `compareIndexedContent` builds `createFileSizeGate(effective)` and skips `skip` decisions for workspaces and root; tests at `get-graph-health.spec.ts:297,305`.                                                                                                                                                                                                         |
| D6 adapter stage: non-text file reported as document                                | LOW      | STILL OPEN (accepted-as-is candidate)                                               | `explain-graph-path.ts` adapter step unchanged: any file without adapter becomes `document`, no decode check. Spec ("textual without an adapter") unchanged. Spec or code: relax spec ("documents are decided at read time") or add the decode check.                                                                                                                                         |
| D7(a) excluded includePaths match                                                   | LOW      | RESOLVED                                                                            | Step 7 now decides the match with `createPathRuleSet(includePaths,'')` and keeps the root candidate whatever its verdict; spec says `not-indexed`; test `explain-graph-path.spec.ts:285`.                                                                                                                                                                                                     |
| D7(b) categories concatenated vs largeFilePaths per-list                            | LOW      | ACCEPTED (spec states largeFilePaths per list; category behaviour still not stated) | See N6.                                                                                                                                                                                                                                                                                                                                                                                       |
| D8                                                                                  | LOW      | PARTIAL                                                                             | `@throws` added; `INVALID_GRAPH_WHY_PATH` and `GRAPH_WHY_REQUIRES_CONFIG` now in spec. Open: backslash input / drive-letter paths are not normalized on POSIX (`resolve(raw)` with `isDrivePath` resolves against cwd); spec is silent on drive letters in the preview (no match for "backslash                                                                                               | drive"), so only the code vs "forward-slash normalization" wording is at issue. LOW, code. |
| D9 overlap sentence placement                                                       | LOW      | RESOLVED                                                                            | Spec now: "Hosts that render the diagnostic SHALL state ... The result itself carries only structured data."                                                                                                                                                                                                                                                                                  |
| D10 Index result fields                                                             | LOW      | RESOLVED                                                                            | indexer spec lists `workspaceOverlaps` (<=25) and `workspaceOverlapCount`. (`documentsIndexed`, `phaseMetrics`, `coverage*`, `importDiagnostics` not re-checked here; not part of this change.)                                                                                                                                                                                               |
| D11 WorkspaceIndexTarget / ProjectGraphConfig                                       | LOW      | PARTIAL                                                                             | `ProjectGraphConfig` block present in workspace-integration spec. The verify scenarios under "WorkspaceIndexTarget" still speak of `WorkspaceIndexTarget.excludePaths` / `buildWorkspaceTargets()` (verify lines ~253-259, 287). LOW, spec stale (pre-existing).                                                                                                                              |
| D12 negation replay                                                                 | LOW      | RESOLVED                                                                            | Getter `rule` on `unignored` results, `findNegation` lazy and cached; tests for several negations, directory negation, invalid pattern (`project-path-rules.spec.ts:94-115`). Design.md grep finds only one mention of replay (line 236 in indexer-side notes); design note adequate.                                                                                                         |
| D13 layering (node:fs in application, `ignore` in domain)                           | LOW      | ACCEPTED-AS-IS                                                                      | Pre-existing pattern; unchanged.                                                                                                                                                                                                                                                                                                                                                              |
| D14 gitignoreSource.file when codeRoot outside project; line lookup by pattern text | LOW      | STILL OPEN (accepted)                                                               | Non-ancestor `.gitignore` under an outside-project root still gets `buildPathSubject(pathBase, ...)` (code-root-relative). Ancestor case now correct. Line lookup still last textual match.                                                                                                                                                                                                   |

## New discrepancies

N1 [LOW, spec gap / pre-existing behaviour] Intermediate `.gitignore` files between the VCS root and `codeRoot` (for example `packages/.gitignore` when codeRoot is `packages/core`) are never loaded: only `vcsRoot`, `root` and walk subdirectories are. Git applies them. Spec workspace-integration steps 1-4 only require the VCS root, `.gitignore` in subdirectories and rules relative to each file, so code matches spec literally; the spec/user expectation "hierarchical" is still incomplete. Decide: state the limitation in the spec or load intermediate ancestors.

N2 [LOW, test gap] `pathBelowDirectory` realpath handling (symlinked codeRoot with real-path vcsRoot, root outside vcsRoot) has no test. Logic reviewed and correct for: root symlink / real vcsRoot (rootBelow computed), vcsRoot realpath equal to root (falls to the non-matching prefix branch, harmless, root file loaded separately), root outside vcsRoot (null, skipped). No defect found.

N3 [LOW, code robustness] When `vcsRoot` is a different spelling of `root` (symlink), `gitRoot !== root` holds and the same `.gitignore` is loaded twice (once scoped with a bogus `../..` base that never matches, once at root). Harmless; wasted read only.

N4 [LOW, code] `rule` getter on unignored results is enumerable: any consumer that spreads/clones the result (`{...result}`, JSON) triggers the replay and freezes the value. No such consumer exists today (rg found only the category spread `...result.rule`, which spreads the rule object, not the result). Contract worth a JSDoc note on `PathRuleResult.rule` ("may be computed lazily"); current JSDoc says "the last matching pattern" without that.

N5 [LOW, code] Root candidate: the includePaths match is tested with `isDirectory=false` regardless of whether the input path is a directory, so a directory input such as `docs` against `docs/**` is `not-in-scope` while `docs/` against a directory-style include would match. Edge only; the indexer itself applies `allowedPaths` to files only.

N6 [LOW, spec] Category lists (testPaths/ignorePaths) project+workspace are concatenated so a workspace `!` can cancel a project pattern, while `largeFilePaths` project/workspace lists are OR-ed per list. core:config states the latter; the former is behaviour-only (carryover of D7b). `classify-file-category.ts:35` JSDoc "relative to codeRoot" on the legacy wrapper remains.

No HIGH or MEDIUM issues found in the group-16 changes.

## Test coverage gaps

1. Realpath/symlink case for ancestor `.gitignore` (N2).
2. Marker rebuild: unit test proves `detectFingerprintMismatch` is true for a legacy fingerprint, but no test that an indexing run over such a store reports a full rebuild with `fullRebuildReason` (verify scenario "Path-semantics marker forces a rebuild"). PARTIAL.
3. Health tests (`get-graph-health.spec.ts:297,305`) assert `contentFresh === true`, which also holds if the fallback path is not reached; confirm the fixtures reach `compareIndexedContent` (no detailed freshness). Likely fine, not verified.
4. Lazy getter: no test asserting the replay is not run for `ignored`/discovery paths (behavioural only).
5. Explain: binary-content file without adapter (D6), backslash/drive input on POSIX (D8), explain/indexer equivalence fixture without gitignore, size exemption and `respectGitignore: false`, workspace `!` vs project `largeFilePaths` exemption, outside-project `allowedPaths` (anchored patterns dropped), intermediate `.gitignore` (N1).
6. All other verify scenarios of the four specs map to tests or implementation as in the previous audit; no new unmapped scenario found.

## Summary counts

- Previous D1-D14: resolved 9 (D1, D2, D3, D4, D5, D7a, D9, D10, D12), partial 2 (D8, D11), open/accepted 3 (D6, D14, D13 accepted; D7b accepted).
- New discrepancies: 6 (HIGH 0, MEDIUM 0, LOW 6). Spec-wrong: N1 (gap), N6. Code-wrong: N3, N4 (doc), N5. Test-only: N2.
- Verify scenarios with no/weak test: 2 (marker-triggered full rebuild, realpath ancestor), plus the unverified health-path reachability.
- Tests: 746/746 pass in code-graph application+domain.

# Partial re-audit: sdk:run-graph-why, cli:graph-why, cli:graph-index (overlap warning, --exclude-path)

Re-audit after group 16. Read-only; no code/specs modified.

## Previous findings status

| #   | Previous finding                                                                                                       | Status                                        | Notes                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [LOW] sdk spec req 3 says "path and effective project configuration from ctx"; code calls `provider.explainPath(path)` | STILL OPEN (spec wrong/imprecise)             | `run-graph-why.ts` unchanged. Config is bound inside the provider. Spec should say "delegate to the provider's `explainPath`"; also omits `GraphWhyRequiresConfigError` for config-less (bootstrap) providers. |
| 2   | [LOW] sdk spec req 4 "every location as projectRelativePath" but SDK does no projection                                | STILL OPEN (spec wrong/ambiguous)             | Pass-through; result type must equal the use-case result (spec Public surface). Reword to "the use case result already expresses locations as projectRelativePath".                                            |
| 3   | [LOW] why.ts builds SdkHostContext manually (`kernel !== null ? {...} : createSdkContext`)                             | STILL OPEN (code smell, not a spec violation) | Unchanged.                                                                                                                                                                                                     |
| 4   | [LOW] Text mode prints `category: -  kind: -` for non-indexable candidates                                             | CLOSED/accepted                               | Spec only mandates category/kind for `indexable`.                                                                                                                                                              |
| 5   | [INFO] `--exclude-path` variadic + comma splitting                                                                     | STILL OPEN (info; spec silent)                | Unchanged.                                                                                                                                                                                                     |
| 6   | [INFO] Sidebar not located                                                                                             | RESOLVED                                      | See docs section below.                                                                                                                                                                                        |
| 7   | [INFO] eslint / thin-presenter                                                                                         | still OK                                      | why.ts imports only `@specd/sdk`.                                                                                                                                                                              |

Previous test gaps:

- Negation label in text: CLOSED. `graph-why.spec.ts` "labels a negation rule and renders inGraph for every value" asserts `(negation)`.
- inGraph yes/no/unknown rendering: CLOSED (same test plus indexable test asserting `inGraph: yes`).
- `not-indexed` verdict text: covered (excluded test, staleness test asserts `verdict: not-indexed`). `not-in-scope` verdict text and size-limit detail rendering (`size= limit= exempt`): STILL OPEN, no test.
- Absolute path / `workspace:path` forms passed to runGraphWhy: STILL OPEN (only `a.ts` / `nope:src/a.ts` used, the latter in an error test).
- Bootstrap / `GraphWhyRequiresConfigError` rendering: STILL OPEN.
- UNKNOWN_WORKSPACE exit status at error-contract level: STILL OPEN (test asserts a rejected promise with `code`, via mocked provider error, not rendered error/exit code).
- SDK locations project-relative: STILL OPEN (pass-through; see finding 2).
- graph index help text hint wording: STILL OPEN (test checks `graph.excludePaths` at L295 only).

## New discrepancies

None high/medium. Group 16 changes (text label for negation, `inGraph` rendering) in `why.ts` match spec Text output items 3 and 4.

- [LOW] Docs: `docs/cli/cli-reference.md` `### graph why` (L1613-1643) gives only an excluded-path example (text) and a structured toon example. Spec "CLI reference documentation" requires "an example of an excluded path and of an indexable path". The indexable example exists only in `docs/cli/graph.md` (L316). Code/docs wrong (docs incomplete). Also, the cli-reference section does not list the step stages' output fields (it does list the stage names and top-level fields; acceptable) and does not show text output sample.
- [LOW] Docs: cli-reference states the project-relative interpretation of configured patterns (yes, "interpreted relative to the project root"). OK.
- [INFO] Text order: spec item 5 says diagnostics are printed last ("one line per diagnostic" after candidates/inGraph); implementation prints diagnostics right after the verdict line, before candidates. Item order in spec is a list of "in order" items, so this is a minor ordering deviation. Severity LOW; spec or code could be adjusted (code is simpler to align; the current order is arguably more useful). Spec wins by rule: LOW, code wrong.
- [INFO] Text: spec item 4 puts `inGraph` as a separate item per candidate; the implementation prints it on the candidate header line. Equivalent.

## Docs requirements (default:\_global/docs)

- CLI reference: `docs/cli/cli-reference.md` `### graph why` present (signature, accepted forms, output fields, options, 2 examples).
- CLI docs index: `docs/cli/index.md` L38 graph row mentions `graph why`. OK.
- Sidebar: defined at `apps/public-web/sidebars.ts` (CLI category contains `cli/graph`, `cli/index`, `cli/cli-reference`). `graph why` is documented inside `docs/cli/graph.md` (L19, L263) which is already in the sidebar, so no new entry is required. OK.
- SDK docs: `docs/sdk/index.md` L459 maps `graph why` to `runGraphWhy`. Guides (`docs/guide/code-graph.md` L100, `configuration.md` L528, `workspaces.md` L288) reference it. `--exclude-path` documented at cli-reference L1279.
- graph index overlap warning documented (cli-reference L1259, guides).

## Test coverage gaps

Verify scenarios without (or with weak) tests:

- sdk "Pure delegation": weak (implicit).
- sdk "Locations are project-relative": no test (pass-through) [LOW].
- cli "Accepted path forms": weak, absolute and `workspace:path` not exercised [LOW].
- cli "Unknown workspace": exit status/rendered code not asserted at error-contract level [LOW].
- cli "Missing configuration": covered only by mocked context failure (ExitSentinel) [LOW].
- cli "Documented": manual only.
- Rendering of `not-in-scope` verdict, size-limit detail, `exempt`, `viaDirectory` suffix: untested [LOW].
- `--exclude-path` repeatability (two separate flags) is untested; only comma form (`foo,bar`) at graph-index.spec.ts L101-111 [LOW].
- All other verify scenarios (transient/caller-owned provider, errors propagate, exports, no added fields, thin presenter, JSON/TOON equality, excluded exit 0, stale notice, excluded/negation-beat/multi-owner/indexable/gitignore text, overlap warning 3 / 14 / none / json-toon) are covered.

## Summary counts

- Requirements audited: 11 (sdk 3, cli:graph-why 6, cli:graph-index 2 areas). Implemented: 11; partial 0; missing 0.
- Discrepancies: 0 high, 0 medium, 3 low new/open spec-or-docs (sdk req 3 wording, sdk req 4 wording, cli-reference missing indexable example) plus 1 low text-order deviation and 1 low code smell; 1 info (comma split).
- Previous: 2 test gaps closed (negation label, inGraph); about 7 remain (all low).
- Spec wrong: sdk req 3 and 4 wording. Code/docs wrong: cli-reference indexable example, diagnostics order.
