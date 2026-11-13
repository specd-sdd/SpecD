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
