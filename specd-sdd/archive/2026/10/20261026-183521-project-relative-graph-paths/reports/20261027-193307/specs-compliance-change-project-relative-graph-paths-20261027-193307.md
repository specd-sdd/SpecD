# Specs compliance: project-relative-graph-paths

Mode: change. Batches: code-graph (core:config, code-graph:indexer, workspace-integration, explain-graph-path), sdk-cli (sdk:run-graph-why, cli:graph-why, cli:graph-index).

## Detailed Findings

# Partial compliance report: code-graph batch (project-relative-graph-paths)

Scope: `core:config` (graph requirements only), `code-graph:indexer`, `code-graph:workspace-integration`, `code-graph:explain-graph-path`.
Evidence: merged spec previews, source reading, `ignore@7.0.5` probe, vitest run of the 9 batch spec files (177 pass / 0 fail), eslint on the new/changed source (no issues).

## Requirements Summary

| Spec                  | Requirement                                                               | Status                                                                       |
| --------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| core:config           | Project-relative graph path semantics                                     | implemented                                                                  |
| core:config           | Workspace-level graph configuration                                       | implemented (spec text defect: default list, see D3)                         |
| core:config           | Project-level graph configuration (graph keys, categorization precedence) | implemented                                                                  |
| core:config           | Graph file size limit (code-graph side: limit, merge, exemptions)         | implemented (schema side lives in `@specd/core`, unchanged, stale JSDoc: D4) |
| indexer               | Project-relative path evaluation                                          | implemented (health content comparison: D5)                                  |
| indexer               | Workspace overlap diagnostic                                              | implemented (message text lives in the CLI, D9)                              |
| indexer               | Discovery fingerprint uses effective config                               | implemented                                                                  |
| indexer               | Multi-workspace file discovery (pathBase)                                 | implemented                                                                  |
| indexer               | Per-file size limit / Size skip in incremental runs                       | implemented (project-relative exemption matching verified)                   |
| indexer               | Index result (overlap fields)                                             | implemented, spec list incomplete (D10)                                      |
| workspace-integration | File discovery from codeRoot (pathBase)                                   | implemented                                                                  |
| workspace-integration | Workspace ownership decided by discovery rules                            | implemented                                                                  |
| workspace-integration | .gitignore handling for codeRoot                                          | PARTIAL: VCS-root `.gitignore` is not applied (D1, pre-existing)             |
| workspace-integration | WorkspaceIndexTarget                                                      | spec stale (D11)                                                             |
| explain-graph-path    | Use case contract                                                         | implemented (minor: D8)                                                      |
| explain-graph-path    | Candidates and owners                                                     | implemented (D7)                                                             |
| explain-graph-path    | Same evaluation as the indexer                                            | implemented (D6)                                                             |
| explain-graph-path    | Ordered steps                                                             | implemented, 1 spec/code wording conflict (D2)                               |
| explain-graph-path    | Verdicts and category                                                     | implemented                                                                  |
| explain-graph-path    | Observed graph state                                                      | implemented                                                                  |
| explain-graph-path    | Diagnostics                                                               | implemented                                                                  |

## Implementation Status (verify scenarios)

core:config

- Anchored workspace pattern against project root / code-root-relative form no longer matches / same pattern global vs workspace / unanchored any depth / ignorePaths + allowedPaths project-relative / global layer beats workspace negation / workspace negation only reverses earlier ws patterns / nested workspaces / outside-project codeRoot / gitignore priority: implemented (`project-path-rules.ts`, `discover-files.ts`, `classify-file-category.ts`, `resolve-effective-graph-config.ts`).
- No migration of earlier semantics: implemented (no warning path exists).
- Config-load scenarios (allowedPaths/excludePaths/respectGitignore/testPaths/maxFileBytes validation/merge): live in `@specd/core` config-schema and loader, schema already accepts all keys; not changed by this change.

indexer

- Anchored global pattern in nested workspace, directory pruning, global beats ws negation, synthetic spec-root cannot be negated, categorization project-relative, default test patterns, default exclusions, outside-project code root, explained decision equals indexing: implemented.
- Visibility agrees with indexing: implemented (`graph-input-visibility.ts` uses same effective config and size gate). Health agrees: PARTIAL (D5).
- Overlap diagnostic (two owners, partitioning, bounded list with exact count, unchanged-file incremental): implemented (`index-code-graph.ts` overlapOwners, `WORKSPACE_OVERLAP_LIST_LIMIT = 25`).
- Fingerprint scenarios (size, exemptions, equal effective limits, marker, testPaths/ignorePaths, codeRoot, synthetic exclusions): implemented (`PATH_SEMANTICS_MARKER = 'project-relative-v1'` in all three fingerprint payloads).
- Size limit scenarios: implemented; the gate evaluates project and workspace `largeFilePaths` against the project-relative path, falling back to code-root-relative path with anchored patterns dropped when outside.

workspace-integration

- discoverFiles receives pathBase: implemented. Workspace filters match project-relative path / nested not ranked / shared codeRoot partition / overlap does not fail: implemented.
- Hierarchical gitignore from VCS root: NOT working (D1).

explain-graph-path

- Input forms, unknown workspace, drive letters, missing path, no side effects: implemented.
- Candidates/owners/multiple owners/partitioned/excluded everywhere/project-global/out-of-scope/CODE_ROOT_OUTSIDE_PROJECT: implemented.
- Stage order, stop at first exclusion, gitignore origin, gitignore disabled, spec-root, default, negation blocked, negation reported, size gate, exemption (D2), category rule, binary/symlink, document: implemented.
- inGraph true/false/null, diagnostics do not alter verdict: implemented.

## Discrepancies

D1 [HIGH, code wrong, PRE-EXISTING, in scope of workspace-integration ".gitignore handling" and core:config respectGitignore "git root -> codeRoot"]
`createDiscoveryEvaluator.loadIgnoreFile` scopes the VCS-root `.gitignore` with `base = relative(root, vcsRoot)` (`..` or `../..`). `evaluateGitignore` then requires `relPath.startsWith('../')`, which never holds, so the repo-level `.gitignore` is silently ignored whenever `codeRoot` is below `vcsRoot`. Probe (tmp project: `/.gitignore` = `*.log`, codeRoot `packages/core` with `a.log`, `b.ts`, `vcsRoot` = project): `discoverFiles` returned `a.log`. The original `isIgnored` in HEAD has the identical logic, so this is not a regression of this change, but verify scenario "Hierarchical gitignore loading from VCS root: .gitignore from /project SHALL be loaded and applied" fails, and `graph why` inherits the gap. No test covers it (all discover-files gitignore tests use vcsRoot == root or no vcsRoot). Fix: for a `.gitignore` above the root, test the path relative to that directory (`join(relative(vcsDir, root), relPath)`), or load with a negative-aware prefix.

D2 [MEDIUM, spec vs code wording]
explain Ordered steps/Size exemption scenario: spec says an exempt oversized file has `size-limit` step `passed` with the exempting rule. Code sets `outcome: 'matched'` with rule + `detail.exempt = true` (`explain-graph-path.ts` ~565-583) and the test codifies `matched`. Spec rule "for `matched`, the deciding `rule`" also means a `too-large` matched step has no `rule` (only `detail`). Recommend changing spec: exemption is `matched` (rule = exempting pattern), too-large is `matched` with detail only; or change code to `passed`. Pick one and align verify.md.

D3 [LOW, spec wrong]
core:config built-in default exclusion list omits `.hg/` and `.svn/`, but `DEFAULT_EXCLUDE_PATHS` has them and indexer spec requires "MUST include `.git/`, `.hg/`, `.svn/`". Update the core:config list.

D4 [MEDIUM, code docs stale, outside the listed files but contradicts the spec]
JSDoc still states codeRoot-relative semantics:

- `packages/core/src/application/specd-config.ts:68` (workspace `allowedPaths` "relative to `codeRoot`"), `:97` (workspace `largeFilePaths` "relative to the workspace `codeRoot`"), `:143` (project `largeFilePaths` doc says workspace ones are relative to `codeRoot`), plus `excludePaths` doc saying "additive" (workspace layer cannot negate global).
- `packages/code-graph/src/domain/value-objects/index-options.ts:68` (`allowedPaths` "relative to codeRoot"), `:103` (`largeFilePaths` "relative to the workspace codeRoot").
- `packages/code-graph/src/domain/services/classify-file-category.ts:35` (legacy wrapper, acceptable).
- Test title `file-size-gate.spec.ts:206` says "evaluated relative to codeRoot" though the body uses project-relative patterns.
  Neither core nor index-options.ts is modified in the working tree.

D5 [MEDIUM, code wrong vs "visibility and health use the same evaluation as indexing"]
`get-graph-health.ts` `compareIndexedContent` (fallback when no detailed freshness): discovery config is correct (global/workspace layers, pathBase) but no size gate is applied, unlike `graph-input-visibility.ts` and the indexer. Files skipped for size are counted in `discovered` but absent from the indexed map, so `discovered.size !== indexed.size` reports content as not fresh. Only reached when `assessObservedContent` returns null, so the practical impact is limited; the change-induced edits to that function are otherwise right. No health test exercises project-relative patterns (see Missing Tests).

D6 [LOW, code vs spec "Same evaluation as the indexer"]
Adapter stage: spec says a file becomes a document only when textual; explain marks any extension-less-adapter file as `document` without the indexer's decode check (`non-text-content` coverage). A binary file with an unknown extension is therefore reported `indexable`/`document` while the indexer skips it. Also the indexer assigns no category to document nodes while explain reports one for documents (spec allows it). Equivalence test covers only a `.txt` document.

D7 [LOW, spec ambiguity]

- Project-global fallback: if the path matches `includePaths` but the root-level evaluation yields `excluded`/`not-allowed`, the root candidate is dropped (`explain-graph-path.ts` ~358) and the top-level verdict becomes `not-in-scope`. Spec says `not-in-scope` only when it matches no `includePaths`; it should then say `not-indexed` with a `root` evaluation, or the spec should state this behaviour. (The `allowedPaths` filter makes "does not match includePaths" and "not-allowed" the same outcome, so only global-exclude/gitignore exclusion of an included path is affected.)
- Category lists (testPaths/ignorePaths) are concatenated so a workspace `!` can cancel a project pattern; `largeFilePaths` are evaluated per list (OR), so a workspace `!` cannot cancel a project exemption. core:config says "added to" for both and "negation within the same list" only for largeFilePaths. Intentional, but not stated for categories.

D8 [LOW, code vs spec "Use case contract"]

- Inputs MUST be normalized to forward slashes: a POSIX run does not convert backslashes in the raw input before `resolve` (Windows hosts do via `node:path`). Drive-letter absolute paths on POSIX hosts resolve against cwd, not as outside-project paths.
- JSDoc of `ExplainGraphPath.execute` has no `@throws` for `InvalidGraphWhyPathError` / `UnknownWorkspaceError` (eslint spec requires `@throws`; eslint passes so it is not enforced).
- `InvalidGraphWhyPathError` (empty input, pinned path escaping codeRoot) and `GraphWhyRequiresConfigError` are not in the spec; add them (codes `INVALID_GRAPH_WHY_PATH`, `GRAPH_WHY_REQUIRES_CONFIG`).

D9 [LOW, spec vs code placement]
Overlap diagnostic SHALL "state that overlapping ownership usually means excludePaths/allowedPaths do not partition the files and name `graph why <path>`": `IndexResult` carries only structured `{projectRelativePath, workspaces}`; the sentence is composed in `cli/src/commands/graph/index-graph.ts:359-371`. Acceptable under hexagonal rules but spec says the indexer records it; reword spec ("hosts render").

D10 [LOW, spec incomplete]
indexer "Index result" list omits `documentsIndexed`, `workspaceOverlaps` (bounded list, 25), `workspaceOverlapCount`, `phaseMetrics`, `coverage*`, `importDiagnostics`. Overlap fields are only described indirectly in the overlap requirement.

D11 [LOW, spec stale, pre-existing]
workspace-integration "WorkspaceIndexTarget": `ProjectGraphConfig` listing omits `testPaths`, `ignorePaths`, `maxFileBytes`, `largeFilePaths` (present in code) and the verify scenario still speaks of `WorkspaceIndexTarget.excludePaths` / `buildWorkspaceTargets()`.

D12 [LOW, deliberate deviation evaluated: `ignore` does not report negation rules]
Verified with `ignore@7.0.5`: `test('gen/keep.ts')` for `['gen/**','!gen/keep.ts']` returns `{ignored:false, unignored:true}` with no `rule`. `createPathRuleSet.findNegation` replays negations from last to first, each tested alone, so it returns the last negation that matches the target. When the overall result is `unignored`, the last matching pattern is by definition a negation, so the replay yields the same pattern; attribution can only differ in exotic parent-directory interactions, which still resolve consistently because each single-pattern `ignore()` applies the same parent rules. Verdict: ACCEPTABLE and the right local fix (the library cannot be patched). Concerns: (a) design.md (lines 171-190) assumes the library reports the rule and does not record the replay; add a design note. (b) The replay runs eagerly on every `unignored` result, including discovery hot-path calls that only need the booleans; make it lazy (getter or a `ruleFor` method) to avoid per-entry `ignore()` allocations on negation-heavy lists such as `.specd/*,!.specd/metadata/`. (c) Test coverage is one case (single negation); add multi-negation and directory-negation cases.

D13 [LOW, systemic, pre-existing pattern]
Architecture spec "Application layer uses ports only": `explain-graph-path.ts`, `discover-files.ts` and `file-size-gate.ts` (application) import `node:fs` directly. The new use case follows the existing pattern; consistent with its siblings but not with the literal spec. Domain `project-path-rules.ts` and `classify-file-category.ts` import the third-party `ignore` package (pure, no I/O; allowed in spirit, spec says "standard library and domain types"). Factory `createExplainGraphPath()` matches `createGetGraphHealth()`; named exports, kebab-case file names, explicit return types and JSDoc all comply (eslint clean). Test names use "Given ..., then ..." (testing spec pattern is "given, when, then"); minor.

D14 [LOW, edge]
`gitignoreSource.file` uses `buildPathSubject(pathBase, ...)`; when `codeRoot` is outside the project it yields a code-root-relative path, not project-relative (spec: "project-relative"). Line lookup matches by pattern text, so negation lines and duplicate patterns resolve to the last textual match.

## Test Coverage

| Area                                                                                                        | Coverage                           | Notes                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| project-path-rules (isRootAnchored, computePathBase, isOutsideProject, buildPathSubject, createPathRuleSet) | covered / weak for negation replay | one negation case; no multi-negation, no directory negation, no invalid pattern drop                                            |
| classify/explainFileCategory                                                                                | covered                            | workspace `!` cancelling project pattern covered                                                                                |
| discover-files project-relative semantics                                                                   | covered                            | all core:config scenarios present; VCS-root gitignore with codeRoot below vcsRoot NOT covered (D1)                              |
| resolve-effective-graph-config                                                                              | covered                            | layers, pathBase, CLI `--exclude-path` merge                                                                                    |
| file-size-gate                                                                                              | covered                            | project/ws exemptions, outside-project fallback, single stat; title stale (D4)                                                  |
| compute-graph-fingerprint                                                                                   | covered; marker scenario weak      | marker is asserted in payload, but no test that an index stored under the old payload yields a mismatch and `fullRebuildReason` |
| index-code-graph.project-relative                                                                           | covered                            | anchored excludes, ignore category identity, spec-root negation, overlap (4 scenarios), visibility                              |
| explain-graph-path                                                                                          | covered                            | inputs, owners, steps, origins, negation blocked, size, category, inGraph, equivalence fixture                                  |
| code-graph-provider explainPath                                                                             | covered                            | injected provider and `GRAPH_WHY_REQUIRES_CONFIG`                                                                               |
| graph health agreement                                                                                      | none                               | no project-relative or size-gate test for `compareIndexedContent`                                                               |

## Missing Tests

1. discoverFiles with `vcsRoot` above `codeRoot` and a repo-level `.gitignore` (D1; spec scenario "Hierarchical gitignore loading from VCS root").
2. Health: file excluded only by a project-relative pattern, and a size-skipped file, evaluated by `GetGraphHealth` (indexer scenario "Visibility and health agree with indexing").
3. Fingerprint: persisted fingerprint without the marker (or with an older marker) -> `detectFingerprintMismatch` true and an indexing run reports a full rebuild with `fullRebuildReason` (scenario "Path-semantics marker forces a rebuild").
4. `createPathRuleSet`: several negations choose the last matching one; directory negation (`!/app/vendors/iccms`) with file subject; invalid pattern dropped.
5. Explain: binary-content file without adapter (D6); `includePaths` match that is excluded by global exclude (D7); exempt-size `outcome` once D2 is resolved; backslash input; `CODE_ROOT_OUTSIDE_PROJECT` with a nested pinned workspace.
6. Explain/indexer equivalence fixture lacks gitignore, size exemption and `respectGitignore: false` cases.
7. Size gate: workspace `!` against a project exemption (documents the per-list decision, D7).
8. Outside-project `allowedPaths` (anchored patterns dropped -> nothing allowed) is not asserted anywhere.

## Summary counts

- Requirements reviewed: 21; implemented 19, partial 1 (.gitignore handling, pre-existing), spec-stale 1 (WorkspaceIndexTarget).
- Verify scenarios reviewed: about 130; missing 1 (VCS-root gitignore), partial 2 (health agreement, marker rebuild test), the rest implemented.
- Discrepancies: 14 (HIGH 1 pre-existing, MEDIUM 3, LOW 10). Spec-wrong: D3, D7(b), D9, D10, D11, D2 (either). Code-wrong: D1, D5, D6, D14 plus stale docs D4.
- Deliberate deviation (negation replay): accepted with 3 follow-ups.
- Test coverage: covered 8 areas, weak 2, none 1; 8 missing tests listed.
- Project-wide spec consistency: eslint clean; layering matches existing siblings; named exports, JSDoc, return types, kebab-case all compliant.

# Partial audit: sdk:run-graph-why, cli:graph-why, cli:graph-index (overlap warning, --exclude-path)

## Requirements Summary

- sdk:run-graph-why: orchestration (provider optional/transient via withOpenGraphProvider, delegate to ExplainGraphPath, project-relative locations, errors propagate); public surface (exports + JSDoc, result = ExplainGraphPathResult); no presenter formatting.
- cli:graph-why: signature; text output; json/toon unchanged; exit status; staleness notice; CLI reference docs (+ index/sidebar).
- cli:graph-index: `--exclude-path` (repeatable, project-relative, global layer, not negatable) and help/doc; workspace overlap warning (text only, max 10, remaining count, hint with `graph why`, absent when none, diagnostics in json/toon).

## Implementation Status

- runGraphWhy orchestration: implemented (packages/sdk/src/orchestration/run-graph-why.ts). Transient via withOpenGraphProvider, caller-owned provider used directly, errors propagate naturally.
- Public surface: implemented (sdk/src/index.ts:19,47-48; orchestration/index.ts:44; JSDoc present). Result is a type alias of ExplainGraphPathResult. Also re-exports Explain\* types (index.ts:132-139) used by the CLI.
- No presenter formatting: implemented.
- graph why signature: implemented (why.ts; `why <path>`, allowExcessArguments(false), --config/--path/--format, mutual exclusion check). Imports only @specd/sdk (no code-graph/core imports; eslint clean).
- Text output: implemented. Order: path, verdict+owners, diagnostics, then per candidate: identity, verdict, category, kind, inGraph, steps (stage/outcome/pattern/negation|pattern/origin layer-workspace-key-file:line). Negation and node kind ARE shown (rule.negated -> "(negation|pattern)"; "kind: ..."; step detail kind). Global-exclusion-beat-workspace-negation line printed from step.detail.workspaceNegationBlocked.
- Structured output: implemented (result passed through unchanged).
- Exit status: implemented (errors via withProvider/cliError; excluded -> 0).
- Staleness notice: implemented (warnGraphStale before runGraphWhy).
- CLI reference docs: implemented in docs/cli/cli-reference.md (### graph why, ~L1613), docs/cli/graph.md (L19, L263+), docs/cli/index.md (L38 row mentions graph why), docs/sdk/index.md (L139, L459).
- graph index --exclude-path: implemented (index-graph.ts:71-76, repeatable, comma-split, passes excludePaths to runIsolatedGraphIndex); help text states project-relative/global.
- Overlap warning: implemented (index-graph.ts:359-372; limit 10, "... and N more", hint with `specd graph why <path>`, only when count>0, text mode only).

## Discrepancies

- [LOW] sdk spec req 3 says delegate "with the path and the effective project configuration from ctx". Code calls `provider.explainPath(path)`; configuration is bound inside the provider (create-code-graph-provider.ts:108, code-graph-provider.ts:700). Spec wording vs code: behaviour equivalent; ctx is used only for provider opening. Probably spec wording should say "config-bound provider". With a caller-provided provider created without SpecdConfig (bootstrap), `GraphWhyRequiresConfigError` is thrown; not mentioned in spec (spec wrong/incomplete).
- [LOW] sdk spec req 4 "every filesystem location expressed as projectRelativePath": SDK does no projection; it relies on the code-graph use case result being already project-relative (result type unchanged, "no added fields" scenario conflicts with any projection anyway). Spec wording ambiguous; code consistent with scenarios "same fields". No test asserts location fields are project-relative at SDK level (it is a pass-through).
- [LOW] CLI uses `kernel !== null ? {kernel, createGraphProvider} : createSdkContext(...)` to build SdkHostContext manually (why.ts bottom); duplicates host-context assembly in the command, and `provider` is injected so ctx is largely unused. Not a spec violation; minor design smell.
- [LOW] Text mode: top-of-candidate line is printed even for non-indexable candidates with `category: -  kind: -` (fine; spec only requires them for indexable).
- [INFO] `--exclude-path` option declared as `<glob...>` variadic plus comma splitting (`foo,bar` => two patterns). Spec says "repeatable"; commas in gitignore patterns are legal characters so splitting could mis-split (e.g. `{a,b}` is not gitignore syntax, low risk). Spec silent.
- [INFO] Sidebar: could not locate a docs sidebar/nav file in docs/ (no .vitepress); docs index (docs/cli/index.md) includes graph row mentioning `graph why`. Cannot confirm "sidebar" requirement; likely N/A in this repo layout (public-web app may generate it). Verify with docs/public-web if required.
- [INFO] Project-wide: eslint clean for why.ts, index-graph.ts, run-graph-why.ts; CLI depends only on @specd/sdk in why.ts; JSDoc present on exported/functions. sdk importing types from @specd/code-graph is allowed by architecture (sdk may depend on code-graph).

## Test Coverage

SDK (run-graph-why.spec.ts, 5 tests): transient open/close - covered; caller-owned not closed - covered; same-fields/unchanged result - covered; errors propagate - covered; exported from entry - covered. "Pure delegation" - weak (inferred from pass-through). "Locations project-relative" - weak/none (pass-through only). "No terminal styling" - covered implicitly by unchanged result.
CLI graph-why (graph-why.spec.ts): path required - covered; --config+--path - covered; options passed to context - covered; accepted path forms - weak (single path asserted, not absolute/workspace:path variants; passed verbatim); thin presenter import check - covered; json equals SDK result - covered; toon - covered; excluded exits 0 - covered; UNKNOWN_WORKSPACE propagates - covered (mocked provider error, not exit status/code in rendered error); missing config - covered (context resolution failure); stale notice - covered; text: excluded (pattern, layer, key) - covered; global-beat-negation - covered; multiple owners + diagnostic - covered; gitignore file:line - covered; indexable category/kind/passed steps - covered.
CLI graph-index: --exclude-path pass-through - covered (graph-index.spec.ts:95-110, comma split); overlap 3 files - covered (L277); 14 overlaps -> 10 + "4 more" - covered (L298); none -> no section - covered (L317); json/toon carry diagnostics - covered (L324).
Docs scenarios: not tested (manual).

## Missing Tests

- Text rendering shows negation flag (`negation` label) for a matched negated rule (spec: "whether it is a negation").
- Text rendering of `inGraph` yes/no/unknown, `not-indexed`/`not-in-scope` verdicts, size-limit detail.
- `graph why` with absolute path and `workspace:path` forms explicitly passed to runGraphWhy.
- `graph why` in bootstrap/no-config mode (GraphWhyRequiresConfigError handling and rendered error).
- Exit status for UNKNOWN_WORKSPACE asserted at CLI error-contract level (code in output, non-zero exit).
- SDK: assertion that returned locations are project-relative (if SDK is expected to guarantee it).
- graph index help text: overlap hint wording includes `specd graph why <path>` and `excludePaths`/`allowedPaths` mention (test asserts at least partial strings only; not verified in detail).
- Semantic `--exclude-path` scenario (global layer not negatable by workspace `!`) belongs to code-graph batch, not tested at CLI level.

## Summary counts

Requirements audited: 3 (sdk) + 6 (cli:graph-why) + 2 (graph-index) = 11.
Implemented: 11; partial: 0; missing: 0.
Discrepancies: 0 high, 0 medium, 4 low, 2 info (spec wording / minor design).
Test coverage: ~25 scenarios covered, 3 weak (accepted path forms, pure delegation, project-relative locations), 0 with no coverage except docs scenarios (manual).
