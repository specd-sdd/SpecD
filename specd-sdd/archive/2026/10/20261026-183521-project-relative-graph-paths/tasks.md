# Tasks: project-relative-graph-paths

## 1. Domain path rules

- [x] 1.1 Create `project-path-rules.ts` with `PathRuleMatch`, `PathRuleResult`, `PathRuleSet`
      `packages/code-graph/src/domain/services/project-path-rules.ts`: new types — declare exactly the interfaces in design.md "New constructs 1"
      Approach: pure TypeScript, only import `ignore`; named exports, full JSDoc
      (Req: Project-relative path evaluation)
- [x] 1.2 Implement `isOutsideProject(path)` and `computePathBase(projectRoot, codeRoot)`
      `packages/code-graph/src/domain/services/project-path-rules.ts`: `isOutsideProject`, `computePathBase`
      Approach: `computePathBase` = `relative(projectRoot, codeRoot)` with `\\` → `/`, no leading `./`, `''` when equal; `isOutsideProject` true for `..`, prefix `../`, or absolute (`path.isAbsolute` or `^[A-Za-z]:[/\\]`)
      (Req: Project-relative graph path semantics, scenario: Code root outside the project root)
- [x] 1.3 Implement `isRootAnchoredPattern(pattern)`
      `packages/code-graph/src/domain/services/project-path-rules.ts`: `isRootAnchoredPattern`
      Approach: strip leading `!` and one trailing `/`; anchored iff the rest contains `/` and does not start with `**/`
      (Req: Project-relative graph path semantics, scenario: Unanchored patterns keep matching at any depth)
- [x] 1.4 Implement `buildPathSubject(pathBase, relativePath)`
      `packages/code-graph/src/domain/services/project-path-rules.ts`: `buildPathSubject`
      Approach: return `relativePath` when `pathBase` is `''` or outside the project, otherwise `pathBase + '/' + relativePath`
      (Req: Project-relative path evaluation)
- [x] 1.5 Implement `createPathRuleSet(patterns, pathBase)`
      `packages/code-graph/src/domain/services/project-path-rules.ts`: `createPathRuleSet`
      Approach: one `ignore()` instance, add patterns one by one inside try/catch (drop invalid), drop `isRootAnchoredPattern` patterns when `isOutsideProject(pathBase)`; `test(subject, isDir)` calls `ig.test(isDir ? subject + '/' : subject)` and maps `{ignored, unignored, rule}` (`rule.pattern`, `rule.negative` → `negated`); empty list or empty subject returns `{ignored:false, unignored:false, rule:null}`
      (Req: Project-relative path evaluation)
- [x] 1.6 Export the new service from the domain barrel
      `packages/code-graph/src/domain/services/index.ts`: add exports of everything in `project-path-rules.ts`
      Approach: named re-exports next to `classifyFileCategory`
      (Req: Project-relative path evaluation)
- [x] 1.7 Add `explainFileCategory` and its types
      `packages/code-graph/src/domain/services/classify-file-category.ts`: `CategoryPatternSource`, `FileCategoryExplanation`, `explainFileCategory`
      Approach: concatenate the patterns of `ignoreSources` in order into one `createPathRuleSet(…, pathBase)`; `ignored` → category `ignored`; else same for `testSources` → `test`; else `source` with `rule: null`; attribute `level`/`key` of the winning pattern by searching it from the end of the concatenation; do not strip `ws:` prefixes
      (Req: Project-relative path evaluation, scenario: Categorization uses the project-relative path)
- [x] 1.8 Keep `classifyFileCategory` unchanged and mark it as a compatibility wrapper
      `packages/code-graph/src/domain/services/classify-file-category.ts`: `classifyFileCategory` — only JSDoc changes
      Approach: no behaviour change; add `@remarks` that the indexer uses `explainFileCategory`
      (Req: Project-relative path evaluation)

## 2. Effective graph configuration

- [x] 2.1 Extend `EffectiveWorkspaceGraphConfig` with the new fields and remove `excludePaths`
      `packages/code-graph/src/application/use-cases/_shared/resolve-effective-graph-config.ts`: `EffectiveWorkspaceGraphConfig` — add `pathBase`, `globalExcludePaths`, `workspaceExcludePaths`, `projectTestPaths`, `workspaceTestPaths`, `projectIgnorePaths`, `workspaceIgnorePaths`; update JSDoc to "project-relative"
      Approach: types exactly as in design.md "Affected areas 2"
      (Req: Project-relative graph path semantics)
- [x] 2.2 Populate the new fields in `resolveEffectiveGraphConfig`
      `packages/code-graph/src/application/use-cases/_shared/resolve-effective-graph-config.ts`: `resolveEffectiveGraphConfig`
      Approach: `pathBase = computePathBase(projectRoot, workspace.codeRoot)`; `globalExcludePaths` = `rootExcludePaths`; `workspaceExcludePaths = workspaceGraph?.excludePaths ?? []`; project lists fall back to `DEFAULT_GRAPH_TEST_PATHS`/`DEFAULT_GRAPH_IGNORE_PATHS` from `@specd/core`; synthetic spec-root exclusions stay in the global layer
      (Req: Project-relative graph path semantics, Workspace-level graph configuration)
- [x] 2.3 Fix the compile errors from removing `excludePaths` in the four consumers
      `compute-graph-fingerprint.ts`, `index-code-graph.ts`, `get-graph-health.ts`, `graph-input-visibility.ts` — replace `wsGraph.excludePaths` uses with the two new fields (finalised in groups 3–5)
      Approach: run `pnpm --filter @specd/code-graph typecheck` and resolve each error with the code from groups 3–5
      (Req: Project-relative graph path semantics)

## 3. Discovery evaluator

- [x] 3.1 Add `pathBase` and `workspaceExcludePaths` to `DiscoverFilesOptions`
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `DiscoverFilesOptions`
      Approach: two optional readonly fields with the JSDoc from design.md; update the `excludePaths` JSDoc to "global layer, project-relative subject"
      (Req: Multi-workspace file discovery)
- [x] 3.2 Add `DiscoveryDecision` and `DiscoveryEvaluator` types
      `packages/code-graph/src/application/use-cases/discover-files.ts`
      Approach: types exactly as in design.md "New constructs 3"
      (Req: Project-relative path evaluation)
- [x] 3.3 Extract `createDiscoveryEvaluator(root, options)` with `evaluateEntry`
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `createDiscoveryEvaluator`
      Approach: move `scopedIgnores`, `loadIgnoreFile`, the gitignore pass of `isIgnored`; add global layer `createPathRuleSet(excludePaths ?? DEFAULT_EXCLUDE_PATHS, pathBase)` checked before workspace layer `createPathRuleSet(workspaceExcludePaths ?? [], pathBase)`; each returns `excluded` on `ignored`; files only: `allowedPaths` via `createPathRuleSet(allowedPaths, pathBase)`, not `ignored` → `excluded/allowed-paths`
      (Req: Project-relative path evaluation, scenario: Global layer wins over workspace negation)
- [x] 3.4 Record the `.gitignore` source file and line in each scoped entry
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `loadIgnoreFile`
      Approach: keep absolute dir, text split into lines, and the `ignore` instance; for a gitignore decision set `gitignoreSource.file` to the project-relative `.gitignore` path (`buildPathSubject(pathBase, relDir + '/.gitignore')`) and `line` = last line whose trimmed text equals `rule.pattern`, else `null`
      (Req: Ordered steps, scenario: gitignore rule origin)
- [x] 3.5 Implement `evaluatePath` with on-demand ancestor `.gitignore` loading
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `DiscoveryEvaluator.evaluatePath`
      Approach: for each ancestor directory top-down call idempotent `ensureGitignoreLoaded(dir)` then `evaluateEntry(dir, true)`; first exclusion returns with `viaDirectory`; finally `evaluateEntry(relativePath, false)`
      (Req: Ordered steps, scenario: Stops at the first exclusion)
- [x] 3.6 Rewrite `discoverFiles` to use the evaluator
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `discoverFiles`
      Approach: keep signature and return type; directory entries pruned when `evaluateEntry(relPath, true).kind === 'excluded'`; files kept when `included`; binary-extension and `hasAdapter` checks stay in the walk
      (Req: Multi-workspace file discovery, scenario: Directory pruning uses the project-relative path)
- [x] 3.7 Export `createDiscoveryEvaluator` and its types
      `packages/code-graph/src/application/index.ts`, `packages/code-graph/src/index.ts`: add exports
      Approach: named exports next to `discoverFiles`
      (Req: Project-relative path evaluation)

## 4. Size gate

- [x] 4.1 Match both exemption lists against the project-relative path
      `packages/code-graph/src/application/services/file-size-gate.ts`: `createFileSizeGate`
      Approach: subject = `projectRelativePath` when inside the project, else `relativeToCodeRoot`; replace `createMatcher` with `createPathRuleSet(patterns, outsideProject ? '../' : '')` per file kind; remove the `relativeToCodeRoot` matching of the workspace matcher
      (Req: Per-file size limit, scenario: A workspace-level exemption applies from the project root)
- [x] 4.2 Add `exemptionRule` to the `exempt` decision
      `packages/code-graph/src/application/services/file-size-gate.ts`: `FileSizeDecision`
      Approach: optional `exemptionRule?: PathRuleMatch` on the `exempt` variant, set from `PathRuleResult.rule`
      (Req: Ordered steps, scenario: Size exemption)

## 5. Indexer wiring

- [x] 5.1 Pass the layers and `pathBase` to workspace discovery
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: workspace `discoverFiles` call (~line 549)
      Approach: `excludePaths: wsGraph.globalExcludePaths`, `workspaceExcludePaths: wsGraph.workspaceExcludePaths`, `pathBase: wsGraph.pathBase`, keep `allowedPaths`
      (Req: Multi-workspace file discovery)
- [x] 5.2 Classify with project-relative subjects
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: categorization block (~line 1322-1335)
      Approach: replace `classifyFileCategory(relPath, …)` with `explainFileCategory(buildPathSubject(w.pathBase, relPath), w.pathBase, [project ignore, workspace ignore], [project test, workspace test]).category`; for `root:` files use `pathBase` `''` and project-only lists
      (Req: Project-relative path evaluation)
- [x] 5.3 Add `WorkspaceOverlap`, `WORKSPACE_OVERLAP_LIST_LIMIT` and the two `IndexResult` fields
      `packages/code-graph/src/domain/value-objects/index-result.ts`: `IndexResult`, new `WorkspaceOverlap`
      Approach: `workspaceOverlaps` (max 25, sorted by path) and `workspaceOverlapCount`; JSDoc as in design.md "Data models"
      (Req: Workspace overlap diagnostic)
- [x] 5.4 Detect overlaps after workspace discovery
      `packages/code-graph/src/application/use-cases/index-code-graph.ts`: `execute`
      Approach: `Map<projectRel, string[]>` filled while iterating discovered files per workspace in configuration order; groups with ≥2 names → sorted, truncated list and exact count; `root:` never participates
      (Req: Workspace overlap diagnostic)
- [x] 5.5 Add the new fields to every `IndexResult` construction
      `packages/code-graph/src` builders/mocks and `packages/*/test` helpers building a full `IndexResult`: add `workspaceOverlaps: []`, `workspaceOverlapCount: 0`
      Approach: run typecheck across the monorepo and fix each literal
      (Req: Workspace overlap diagnostic)
- [x] 5.6 Use the new workspace discovery options in graph input visibility
      `packages/code-graph/src/application/services/graph-input-visibility.ts`: `buildGraphInputVisibilitySnapshot` (~line 48)
      Approach: same options as task 5.1
      (Req: Project-relative path evaluation, scenario: Visibility and health agree with indexing)
- [x] 5.7 Use the new workspace discovery options in graph health
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `compareIndexedContent` (~line 706)
      Approach: same options as task 5.1
      (Req: Project-relative path evaluation, scenario: Visibility and health agree with indexing)

## 6. Fingerprint

- [x] 6.1 Add `PATH_SEMANTICS_MARKER` and the new normalized fields
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `NormalizedWorkspaceFingerprint`, `normalizeWorkspaceFingerprintInput`
      Approach: replace `excludePaths` with `globalExcludePaths`, `workspaceExcludePaths`, `testPaths {project, workspace}`, `ignorePaths {project, workspace}`; `export const PATH_SEMANTICS_MARKER = 'project-relative-v1'`
      (Req: Discovery fingerprint uses effective config)
- [x] 6.2 Include the marker in the payload
      `packages/code-graph/src/application/use-cases/_shared/compute-graph-fingerprint.ts`: `computeGraphFingerprint`, `computeWorkspaceFingerprint`
      Approach: add `pathSemantics: PATH_SEMANTICS_MARKER` to the `g` object of every payload (and the workspace payload)
      (Req: Discovery fingerprint uses effective config, scenario: Path-semantics marker forces a rebuild of an older index)

## 7. ExplainGraphPath use case

- [x] 7.1 Add the error classes
      `packages/code-graph/src/domain/errors/`: `UnknownWorkspaceError` (`UNKNOWN_WORKSPACE`), `InvalidGraphWhyPathError` (`INVALID_GRAPH_WHY_PATH`), `GraphWhyRequiresConfigError` (`GRAPH_WHY_REQUIRES_CONFIG`)
      Approach: extend `SpecdError` from `@specd/core`, `code` UPPER_SNAKE_CASE, message formats from design.md
      (Req: Use case contract)
- [x] 7.2 Declare the result types
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: types `ExplainStage`, `ExplainOutcome`, `ExplainRuleLayer`, `ExplainRuleOrigin`, `ExplainRule`, `ExplainStep`, `CandidateVerdict`, `ExplainVerdict`, `ExplainDiagnosticCode`, `ExplainCandidate`, `ExplainDiagnostic`, `ExplainGraphPathResult`, `ExplainGraphPathInput`
      Approach: exactly as in design.md "New constructs 4", including `detail.workspaceNegationBlocked`
      (Req: Use case contract, Ordered steps, Verdicts and category)
- [x] 7.3 Add `getFile?` and `getDocument?` to the host port
      `packages/code-graph/src/application/ports/code-graph-host-port.ts`: `CodeGraphHostPort`
      Approach: optional methods returning `Promise<FileNode | undefined>` / `Promise<DocumentNode | undefined>`
      (Req: Observed graph state)
- [x] 7.4 Implement input normalization
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `ExplainGraphPath.execute` step 1-2
      Approach: absolute (`path.isAbsolute` or drive path) → resolve; `workspace:path` (colon before first `/`, not a drive path) → join with that workspace's `codeRoot`, unknown workspace → `UnknownWorkspaceError`; else resolve against project root; empty input → `InvalidGraphWhyPathError`; compute `projectRelativePath`
      (Req: Use case contract)
- [x] 7.5 Resolve VCS root and effective config
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `execute` steps 3-4
      Approach: `vcsRoot = (await createVcsAdapter(projectRoot)).rootDir()` in try/catch → `null`; `buildProjectGraphConfig(config)` + `resolveEffectiveGraphConfig`
      (Req: Same evaluation as the indexer)
- [x] 7.6 Select candidates
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `execute` step 5
      Approach: candidates = workspaces whose `codeRoot` contains the path (`''` or neither `..` nor `../` prefix), configuration order; `workspace:path` restricts to that workspace
      (Req: Candidates and owners)
- [x] 7.7 Evaluate `binary-extension` and symlink steps
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: per-candidate evaluation step b
      Approach: `DEFAULT_BINARY_EXTENSIONS` check on `extname`, `lstatSync` symlink check; rule `{pattern, negated:false, origin:{layer:'builtin'}}`; verdict `excluded`
      (Req: Ordered steps, scenario: Binary extension and symlink)
- [x] 7.8 Evaluate discovery stages with the evaluator
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: per-candidate steps c-d
      Approach: `createDiscoveryEvaluator(codeRoot, {…})` with the layered options; map `DiscoveryDecision` to steps/verdicts (`excluded`, `not-allowed`); `gitignore` stage `not-applicable` when `respectGitignore` is false; `allowed-paths` `not-applicable` when absent
      (Req: Ordered steps, Verdicts and category)
- [x] 7.9 Attribute rule origins
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: helper `attributeExcludeRule`
      Approach: search the deciding pattern from the end of `[...projectExcludes, ...syntheticSpecExcludes]`: synthetic tail → layer `spec-root`; project list declared in config → `global` with key `graph.excludePaths`; defaults → `default`; workspace layer → `workspace` with key `workspaces.<name>.graph.excludePaths`
      (Req: Ordered steps, scenarios: Spec-root exclusion origin, Default exclusion origin)
- [x] 7.10 Compute `workspaceNegationBlocked`
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: global-exclude step
      Approach: when the global layer excluded the path, set `detail.workspaceNegationBlocked = createPathRuleSet(workspaceExcludePaths, pathBase).test(subject,false).unignored`
      (Req: Ordered steps, scenario: Workspace negation blocked)
- [x] 7.11 Evaluate size, category and adapter stages
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: per-candidate steps e-g
      Approach: `PATH_NOT_FOUND` when absent (size/adapter `not-applicable`); `createFileSizeGate(effective).decide(…)` → `too-large`/exempt rule/pass; `explainFileCategory` with origin `default` when `config.graph?.testPaths`/`ignorePaths` undefined; adapter lookup through a throwaway `AdapterRegistry` built from `input.adapters` → `file`/`document`
      (Req: Ordered steps, Verdicts and category)
- [x] 7.12 Compute `inGraph`
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: per-candidate step h
      Approach: `provider.getFile?.(identity)` / `getDocument?.(identity)`; missing method or exception → `null`; non-indexable candidates check both
      (Req: Observed graph state)
- [x] 7.13 Implement the project-global fallback
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `execute` step 7
      Approach: with no candidates, `createDiscoveryEvaluator(projectRoot, {allowedPaths: includePaths, excludePaths: rootExcludePaths, vcsRoot})`; included → candidate `workspace: null`, identity `root:<path>`; otherwise `PATH_OUTSIDE_PROJECT` when outside, else verdict `not-in-scope`
      (Req: Candidates and owners, scenarios: Project-global path, Out of scope)
- [x] 7.14 Aggregate owners, verdict and diagnostics
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `execute` step 8
      Approach: `owners` = indexable candidates (`'root'` for the global one); top-level verdict `indexable`/`not-indexed`/`not-in-scope`; `MULTIPLE_OWNERS`; per-candidate `CODE_ROOT_OUTSIDE_PROJECT`
      (Req: Candidates and owners, Diagnostics)
- [x] 7.15 Create the composition factory
      `packages/code-graph/src/composition/use-cases/explain-graph-path.ts`: `createExplainGraphPath`
      Approach: `new ExplainGraphPath(createVcsAdapter)` as in `createGetGraphHealth`
      (Req: Use case contract)

## 8. Provider and barrels

- [x] 8.1 Add `explainPath` to the provider interface and implementation
      `packages/code-graph/src/composition/code-graph-provider.ts`: `CodeGraphProvider`, `CodeGraphProviderImpl`
      Approach: optional constructor parameter `explainPath?: {useCase; input}` after `onWarning`; method delegates with `{...input, provider: this, path}`; without it throw `GraphWhyRequiresConfigError`
      (Req: Use case contract)
- [x] 8.2 Build the explain input in the provider factory
      `packages/code-graph/src/composition/create-code-graph-provider.ts`: `createCodeGraphProvider`
      Approach: inside the `isSpecdConfig(options)` branch reuse the health `config` and `WorkspaceIndexTarget[]`, plus `adapters: registry.getAdapters()`
      (Req: Use case contract)
- [x] 8.3 Export the new public surface
      `packages/code-graph/src/application/index.ts`, `composition/index.ts`, `index.ts`, `public.ts`: export `ExplainGraphPath`, its input/result/sub-types, `createExplainGraphPath`, `explainFileCategory`, `PATH_SEMANTICS_MARKER`, `WorkspaceOverlap`
      Approach: follow how `GetGraphHealth` types are exported
      (Req: Use case contract)

## 9. SDK

- [x] 9.1 Create `runGraphWhy`
      `packages/sdk/src/orchestration/run-graph-why.ts`: `RunGraphWhyInput`, `RunGraphWhyResult`, `runGraphWhy`
      Approach: provided provider → `provider.explainPath(path)`; otherwise `withOpenGraphProvider(ctx, …)`; no projection or logic; full JSDoc
      (Req: runGraphWhy orchestration, No presenter formatting)
- [x] 9.2 Export from the SDK barrels
      `packages/sdk/src/orchestration/index.ts`, `packages/sdk/src/index.ts`: export `runGraphWhy`, `RunGraphWhyInput`, `RunGraphWhyResult`
      Approach: follow the entries of `runGraphHotspots`; re-export `ExplainGraphPathResult` types through the curated code-graph re-export file
      (Req: Public surface)

## 10. CLI

- [x] 10.1 Create `registerGraphWhy`
      `packages/cli/src/commands/graph/why.ts`: `registerGraphWhy`
      Approach: copy the structure of `registerGraphStats`; `why <path>`, `.allowExcessArguments(false)`, options `--config`, `--path`, `--format`; mutual-exclusion error; `withProvider`; call `runGraphWhy` with the opened provider; help text documents the JSON/TOON schema
      (Req: Command signature, Structured output)
- [x] 10.2 Implement `renderGraphWhyText`
      `packages/cli/src/commands/graph/why.ts`: `renderGraphWhyText(result)`
      Approach: pure function; layout from design.md "New constructs 7"; every candidate with equal prominence; `a global exclusion prevented a workspace pattern from re-including this path` when `workspaceNegationBlocked`; `.gitignore` file:line; diagnostics lines
      (Req: Text output)
- [x] 10.3 Wire the staleness notice and exit status
      `packages/cli/src/commands/graph/why.ts`: action
      Approach: call `warnGraphStaleness` as `graph stats` does; no explicit `process.exit`; errors flow through `withProvider`/`handleError`
      (Req: Staleness notice, Exit status)
- [x] 10.4 Register the command
      `packages/cli/src/commands/graph/` group registration file imported by `packages/cli/src/program.ts`
      Approach: call `registerGraphWhy(graphCommand)` next to `registerGraphStats`
      (Req: Command signature)
- [x] 10.5 Render the overlap warning in `graph index`
      `packages/cli/src/commands/graph/index-graph.ts`: text rendering next to the size-skip section (~line 333-360)
      Approach: when `result.workspaceOverlapCount > 0` print count, up to ten `projectRelativePath — workspaces`, a "N more" line, and the hint to review `excludePaths`/`allowedPaths` and run `specd graph why <path>`; nothing otherwise; structured modes unchanged
      (Req: Workspace overlap warning)
- [x] 10.6 Update the `--exclude-path` help text
      `packages/cli/src/commands/graph/index-graph.ts`: option description
      Approach: "gitignore-syntax pattern relative to the project root; added to the global exclusion layer"
      (Req: Command signature)

## 11. Tests: domain and discovery

- [x] 11.1 Test the path-rule helpers
      `packages/code-graph/test/domain/services/project-path-rules.spec.ts` (new)
      Approach: cases listed in design.md Testing for `isRootAnchoredPattern`, `computePathBase`, `buildPathSubject`, `createPathRuleSet`
      (Req: Project-relative graph path semantics)
- [x] 11.2 Test `explainFileCategory`
      `packages/code-graph/test/domain/services/classify-file-category.spec.ts` (extend)
      Approach: project vs workspace level attribution, default test patterns, workspace `!` over project ignore; legacy wrapper regression
      (Req: Project-relative path evaluation)
- [x] 11.3 Test project-relative discovery
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts` (extend)
      Approach: tmp fixture tree; cases: anchored global pattern with `pathBase: 'app'`, codeRoot-relative form no longer matches, directory pruning (spy `readdirSync`), global beats workspace negation, workspace negation order, `allowedPaths`, nested `app/webroot`, gitignore priority, outside-project root, default excludes
      (Req: Project-relative path evaluation)
- [x] 11.4 Test `createDiscoveryEvaluator`
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts` (extend)
      Approach: `evaluatePath` gitignore file/line, `viaDirectory`, `allowed-paths` rule `null`
      (Req: Ordered steps)
- [x] 11.5 Test the size gate
      `packages/code-graph/test/application/services/file-size-gate.spec.ts` (extend)
      Approach: both lists project-relative, outside-project fallback, `exemptionRule`
      (Req: Per-file size limit)
- [x] 11.6 Test effective config resolution
      `packages/code-graph/test/application/use-cases/_shared/resolve-effective-graph-config.spec.ts`
      Approach: `pathBase`, layer split, category defaults, synthetic exclusions in the global layer
      (Req: Project-relative graph path semantics)
- [x] 11.7 Test the fingerprint
      `packages/code-graph/test/application/use-cases/_shared/compute-graph-fingerprint.spec.ts` (extend)
      Approach: changing workspace `testPaths`/`ignorePaths`/`codeRoot` changes it; marker present in payload
      (Req: Discovery fingerprint uses effective config)

## 12. Tests: indexer and explain

- [x] 12.1 Index a nested-workspace fixture
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` (extend)
      Approach: `default ./`, `backend app`, `backoffice app/webroot` with project-relative excludes; assert vendors/iccms indexed, tmp absent, categorization identity, spec-root exclusion not negatable
      (Req: Project-relative path evaluation)
- [x] 12.2 Test the overlap diagnostic
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` (extend)
      Approach: overlap yields one record and succeeds; partitioned shared `codeRoot` yields none; >25 overlaps truncated with exact count; incremental run still reports
      (Req: Workspace overlap diagnostic)
- [x] 12.3 Test visibility and health consistency
      `packages/code-graph/test/application/services/graph-input-visibility.spec.ts` and `get-graph-health.spec.ts` (extend)
      Approach: file excluded only by a project-relative pattern is excluded by both
      (Req: Project-relative path evaluation)
- [x] 12.4 Test `discoverFiles` receives `pathBase`
      `packages/code-graph/test/application/use-cases/index-code-graph.spec.ts` (extend)
      Approach: spy on `discoverFiles`, assert `pathBase: 'app'` for `backend`
      (Req: File discovery from codeRoot)
- [x] 12.5 Test `ExplainGraphPath` inputs and candidates
      `packages/code-graph/test/application/use-cases/explain-graph-path.spec.ts` (new)
      Approach: scenarios for input forms, unknown workspace, drive path, missing file, no side effects, single/two owners, shared `codeRoot`, excluded everywhere, project-global, out of scope, outside `codeRoot`
      (Req: Use case contract, Candidates and owners)
- [x] 12.6 Test `ExplainGraphPath` steps and verdicts
      `packages/code-graph/test/application/use-cases/explain-graph-path.spec.ts` (new)
      Approach: stage order, stop at first exclusion, gitignore origin, spec-root/default origins, blocked negation, negation rule, size gate/exemption, category rule level, binary/symlink, document without adapter, directory input, verdicts, diagnostics, `inGraph` true/false/null
      (Req: Ordered steps, Verdicts and category, Observed graph state, Diagnostics)
- [x] 12.7 Equivalence test between explain and indexing
      `packages/code-graph/test/application/use-cases/explain-graph-path.spec.ts` (new)
      Approach: fixture with exclusions, `allowedPaths`, oversized file and categories; index, then assert for every file that `indexable` ⇔ indexed in that workspace with the same category
      (Req: Same evaluation as the indexer)
- [x] 12.8 Test the provider method
      `packages/code-graph/test/composition/code-graph-provider.spec.ts` (extend)
      Approach: `explainPath` delegates with the provider injected; without `SpecdConfig` throws `GRAPH_WHY_REQUIRES_CONFIG`
      (Req: Use case contract)

## 13. Tests: SDK and CLI

- [x] 13.1 Test `runGraphWhy`
      `packages/sdk/test/orchestration/run-graph-why.spec.ts` (new)
      Approach: transient provider opened/closed, caller-owned not closed, result identical to provider's, errors propagate, exports from `@specd/sdk`
      (Req: runGraphWhy orchestration, Public surface)
- [x] 13.2 Test `graph why`
      `packages/cli/test/commands/graph/why.spec.ts` (new)
      Approach: required path, `--config`/`--path` exclusive, text rendering cases, json/toon equal SDK result, exit 0 for excluded, `UNKNOWN_WORKSPACE` non-zero, missing config, stale notice, static check that the file imports `@specd/sdk` and not `@specd/code-graph`/`@specd/core`
      (Req: Command signature, Text output, Structured output, Exit status, Staleness notice)
- [x] 13.3 Test the `graph index` overlap section and `--exclude-path`
      `packages/cli/test/commands/graph/index-graph.spec.ts` (extend)
      Approach: three overlaps, fourteen overlaps (ten + "4 more"), none, json/toon carry diagnostics, `--exclude-path` global-layer semantics
      (Req: Workspace overlap warning, Command signature)

## 14. Documentation

- [x] 14.1 Document `graph why` and update `graph index`
      `docs/cli/graph.md`, `docs/cli/cli-reference.md` (`## graph`), `docs/cli/index.md`: signature, accepted path forms, output fields, excluded and indexable examples, project-relative semantics, `--exclude-path`, overlap warning
      Approach: follow the structure of the existing `graph stats` entries; keep the sidebar entry
      (Req: CLI reference documentation)
- [x] 14.2 Update the user guide configuration pages
      `docs/guide/configuration.md`, `docs/guide/configuration-examples.md`, `docs/guide/code-graph.md`, `docs/guide/workspaces.md`
      Approach: replace every "relative to `codeRoot`" statement for graph keys with the project-relative rule, add the global-layer rule and a nested-workspace example, mention `graph why` and the overlap warning; keep frontmatter
      (Req: Project-relative graph path semantics)
- [x] 14.3 Update code-graph and SDK docs
      `docs/code-graph/use-cases.md`, `docs/sdk/` code-graph collection page
      Approach: document `ExplainGraphPath`, the `pathBase` and `workspaceExcludePaths` options in `## discoverFiles`, the `IndexResult` additions, and `runGraphWhy` with frontmatter
      (Req: Use case contract, runGraphWhy orchestration)

## 15. Final verification

- [x] 15.1 Run build, typecheck, lint and tests across the monorepo
      Repository root
      Approach: `pnpm build`, `pnpm -r typecheck`, `pnpm lint`, `pnpm -r test`; all green
      (Req: Project-relative graph path semantics)
- [x] 15.2 Run the manual checks from the design
      Repository root
      Approach: `graph index` (expect full rebuild with the fingerprint reason and no overlap section); `graph why packages/core/src/index.ts --format toon` (owner `core`, `default` excluded by `packages/`); `graph why packages/core/dist/x.js`; `graph why nope:src/a.ts` (non-zero, `UNKNOWN_WORKSPACE`); a temporary config with unpartitioned workspaces shows the overlap warning and `MULTIPLE_OWNERS`
      (Req: Workspace overlap warning, Observed graph state)

## 16. Compliance audit follow-ups

- [x] 16.1 Apply repository-level `.gitignore` files that sit above the discovery root
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `createDiscoveryEvaluator`
      Approach: for a scoped `.gitignore` whose directory is an ancestor of `root`, test `relative(thatDirectory, join(root, relPath))` instead of requiring a `../` prefix; keep `gitignoreSource.file` project-relative
      (Req: `.gitignore` handling in workspace-integration and core:config, scenario: Repository .gitignore applies below the VCS root)
- [x] 16.2 Apply the size gate in graph health content comparison
      `packages/code-graph/src/application/use-cases/get-graph-health.ts`: `compareIndexedContent`
      Approach: reuse `createFileSizeGate(effective)` as `graph-input-visibility.ts` does and skip files decided `skip`
      (Req: Project-relative path evaluation, scenario: Health applies the size gate like indexing)
- [x] 16.3 Report an excluded `includePaths` match as a `root` candidate
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `execute` step 7
      Approach: decide the `includePaths` match with `createPathRuleSet(includePaths, '')`; keep the root candidate when it matches, whatever its verdict; drop it only when it does not match
      (Req: Candidates and owners, scenario: Project-global path excluded)
- [x] 16.4 Make the negation replay in `createPathRuleSet` lazy
      `packages/code-graph/src/domain/services/project-path-rules.ts`: `createPathRuleSet`
      Approach: expose `rule` as a getter on `unignored` results so discovery never pays for the replay
      (Req: Project-relative path evaluation)
- [x] 16.5 Replace stale codeRoot-relative JSDoc
      `packages/core/src/application/specd-config.ts`, `packages/code-graph/src/domain/value-objects/index-options.ts`, `packages/code-graph/test/application/services/file-size-gate.spec.ts` (test title)
      Approach: say project-relative for workspace `allowedPaths`, `largeFilePaths`, `excludePaths` (workspace layer cannot negate global)
      (Req: Project-relative graph path semantics)
- [x] 16.6 Add `@throws` to `ExplainGraphPath.execute`
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `ExplainGraphPath.execute`
      Approach: document `UnknownWorkspaceError` and `InvalidGraphWhyPathError`
      (Req: Use case contract)
- [x] 16.7 Tests for the follow-ups
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts`, `get-graph-health.spec.ts`, `explain-graph-path.spec.ts`, `compute-graph-fingerprint.spec.ts`, `packages/code-graph/test/domain/services/project-path-rules.spec.ts`, `packages/cli/test/commands/graph-why.spec.ts`
      Approach: VCS-root gitignore below the root; health ignores a size-skipped file and a project-relative exclusion; excluded `includePaths` root candidate is `not-indexed`; old fingerprint without the marker yields a mismatch; several and directory negations in `createPathRuleSet`, invalid pattern dropped; negation label and `inGraph` in text output; `UNKNOWN_WORKSPACE` propagates
      (Req: audit Missing Tests)
- [x] 16.8 Re-run build, typecheck, lint and tests across the monorepo
      Repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`; all green
      (Req: Project-relative graph path semantics)

## 17. Second audit follow-ups

- [x] 17.1 Load `.gitignore` files between the VCS root and the discovery root
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `createDiscoveryEvaluator`
      Approach: after loading the VCS-root file, load the `.gitignore` of each directory down to the root through the same `pathBelowDirectory`-scoped path; each file once; keep source file project-relative
      (Req: .gitignore handling for codeRoot, scenario: Intermediate .gitignore files apply)
- [x] 17.2 Normalize backslash and drive-letter inputs on every host
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`: `ExplainGraphPath.execute` step 1
      Approach: convert `\` to `/` for relative inputs; a drive-letter path is absolute and outside the project on POSIX instead of being resolved against the working directory
      (Req: Use case contract, scenario: Backslash and drive-letter inputs on any host)
- [x] 17.3 Print diagnostics after the candidates in `graph why` text
      `packages/cli/src/commands/graph/why.ts`: `renderGraphWhyText`
      Approach: move the diagnostic lines to the end of the output
      (Req: Text output)
- [x] 17.4 Add an indexable-path example to the CLI reference
      `docs/cli/cli-reference.md` (`### graph why`)
      Approach: mirror the indexable example of `docs/cli/graph.md`; mention diagnostics come last
      (Req: CLI reference documentation)
- [x] 17.5 Tests for the second audit follow-ups
      `packages/code-graph/test/application/use-cases/discover-files.spec.ts`, `explain-graph-path.spec.ts`, `index-project-graph-integration.spec.ts` or fingerprint spec, `packages/cli/test/commands/graph-why.spec.ts`, `graph-index.spec.ts`, `packages/sdk/test/orchestration/run-graph-why.spec.ts`
      Approach: intermediate and symlinked-VCS-root gitignore; backslash and drive-letter inputs; fingerprint marker forces full rebuild with `fullRebuildReason`; CLI absolute and `workspace:path` forms, bootstrap, `UNKNOWN_WORKSPACE` exit, `not-in-scope` and size-limit rendering, diagnostics last, repeated `--exclude-path`
      (Req: audit Missing Tests)
- [x] 17.6 Re-run build, typecheck, lint and tests across the monorepo
      Repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`; all green
      (Req: Project-relative graph path semantics)

## 18. Third audit follow-ups (everything left open)

- [x] 18.1 Report `.gitignore` sources consistently and load each file once
      `packages/code-graph/src/application/use-cases/discover-files.ts`: `createDiscoveryEvaluator`, `DiscoverFilesOptions`; `explain-graph-path.ts` passes `projectRoot`
      Approach: optional `projectRoot` option; file path from real paths relative to it; deciding line = first matching line; `loadedDirs` keyed by real path
      (Req: Ordered steps, scenario: Intermediate .gitignore origin)
- [x] 18.2 Never re-include below an excluded directory and hide the lazy rule getter
      `packages/code-graph/src/application/use-cases/discover-files.ts`, `packages/code-graph/src/domain/services/project-path-rules.ts`
      Approach: pin nearer-negates-farther behaviour for `evaluatePath`/walk with a test; define `rule` non-enumerable
      (Req: .gitignore handling for codeRoot, scenario: A negation cannot re-include below an excluded directory)
- [x] 18.3 Align `explain` with the indexer on directories and non-text content
      `packages/code-graph/src/application/use-cases/explain-graph-path.ts`, `index-code-graph.ts` (export the textual-content helper)
      Approach: `includePaths` match uses the on-disk kind; files without an adapter go through the textual check and yield `excluded`/`non-text-content`
      (Req: Same evaluation as the indexer, scenario: Binary content without adapter)
- [x] 18.4 Single CLI host-context helper
      `packages/cli/src/commands/graph/` new `host-context.ts`; use it in `search.ts`, `hotspots.ts`, `impact.ts`, `why.ts`
      Approach: `createGraphHostContext(config, kernel)` returning the kernel-backed or freshly created `SdkHostContext`
      (Req: thin presenter)
- [x] 18.5 Documentation fixes
      `docs/cli/cli-reference.md`
      Approach: `--exclude-path` row and merging section (project-relative, comma-separated, workspace `!` cannot re-include); output sample for the excluded `graph why` example
      (Req: CLI reference documentation)
- [x] 18.6 Tests for the third audit follow-ups
      `discover-files.spec.ts` (symlinked codeRoot, outside-project source file, nearer negation under excluded parent, first-line match, enumerability), `explain-graph-path.spec.ts` (intermediate `.gitignore` source file, symlinked code root, binary content, directory `includePaths`), `packages/cli/test/commands/graph-why.spec.ts` (`UNKNOWN_WORKSPACE` rendered exit, `GRAPH_WHY_REQUIRES_CONFIG`, `exempt` and `via` rendering)
      Approach: temp-dir fixtures with symlinks; static checks of the helper usage
      (Req: audit Missing Tests)
- [x] 18.7 Re-run build, typecheck, lint and tests across the monorepo
      Repository root
      Approach: `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`; all green
      (Req: Project-relative graph path semantics)
