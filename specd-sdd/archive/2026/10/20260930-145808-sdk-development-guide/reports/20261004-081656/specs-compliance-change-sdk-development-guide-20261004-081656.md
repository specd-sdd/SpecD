# Specs Compliance Report — sdk-development-guide

**Mode:** change / full verification  
**Scope:** merged change artifacts and implementation for CLI, guide-domain, and applicable global/direct dependency requirements.  
**Inputs:** `_partial-cli.md`, `_partial-guide.md`, `_partial-globals.md`.

## Aggregate Summary

The three independently produced partial audits report a functionally substantial JSON-only guide implementation, passing focused CLI and guide-package test runs, and successful manual package extraction/import evidence. Across the partials there are **6 reported discrepancies** before deduplication, including **1 blocking artifact/verification contradiction**, **2 reported medium-severity global discrepancies**, and **1 reported low-severity global discrepancy**. The partials also identify multiple missing-test areas.

The evidence is temporally mixed: the CLI partial says the `ArtifactDag` example was repaired, while the globals partial subsequently records live failures from stale documentation/README examples. This report preserves both statements verbatim rather than resolving the conflict by inference. Reconcile the current working tree and merged artifacts before signoff.

## Detailed Findings

### CLI Partial (verbatim)

# Full compliance audit — CLI batch (`sdk-development-guide`)

## Requirements Summary

Audited the current merged `spec.md` and `verify.md` artifacts for:

- `cli:guide-sdk`: SDK catalog/listing, independent scope and collection filtering,
  pagination and structured output, metadata/index/topic reads, section and line
  slices, unknown-topic diagnostics, identifier search, and public generated-topic
  metadata policy.
- `cli:guide`: existing user-guide behavior plus the structured discovery pointer to
  `specd guide-sdk`, compatible listing envelope, help text, and index behavior.
- `cli:entrypoint`: root Commander registration, lazy loading of the SDK guide engine,
  output/error conventions, help, configuration propagation, and exit behavior.

The merged verify artifacts contain 22 requirements / 101 scenarios for
`cli:guide-sdk`, 18 / 63 for `cli:guide`, and 33 / 95 for `cli:entrypoint`. The
last two include inherited broad CLI scenarios; review scope is restricted to behavior
reached by this change and its direct dependencies.

## Implementation Status

The command implementation is substantially complete and correctly wired.

- `packages/cli/src/program.ts` registers `guide-sdk` next to `guide`, with a
  memoized `import('@specd/guide/sdk')`; this satisfies the intended lazy catalog
  boundary for invocations that do not run the SDK command.
- `packages/cli/src/commands/guide-sdk/index.ts` implements list, index, topic read,
  metadata, slices and search; validates `--scope` / `--collection`; uses shared
  pagination and formatting; and maps guide-domain errors through CLI error handling.
- `packages/cli/src/commands/guide/index.ts` and
  `packages/cli/src/commands/guide/formatters.ts` emit the structured `sdkGuide`
  discovery field and the shared listing-envelope structure.
- `formatGuideIndex` correctly produces one `readHint` and renders no per-topic
  command. A real `guide-sdk --meta --page-size 2 --format json` invocation confirms
  exactly that envelope shape.
- The generated-source-path policy is now aligned: current merged requirements and
  scenarios say source paths must be withheld for generated topics; `runTopic` and
  `toPublicSearchHit` implement that omission while retaining the path for
  hand-written documents.

## Discrepancies

### 1. BLOCKING artifact contradiction: catalog-index retrieval command

`cli:guide-sdk` merged requirements require a _single_ literal retrieval hint,
`specd guide-sdk <topic>`, exactly once, and explicitly prohibit per-topic commands.
The merged verify artifact still includes the incompatible scenario **“Index reports
the page and a retrieval command per topic”**, which requires every topic to carry a
copy-pasteable retrieval command. Its immediately following scenario requires the
opposite. The implementation follows the merged requirement and the latter scenario:
the JSON index contains `readHint` once and each row carries only the fully qualified
topic identifier.

Classification: artifact/verification defect, not an implementation defect. It needs
design review before the change can truthfully pass all scenarios.

### 2. `cli:entrypoint` requires a `Guide error:` prefix that the command does not emit

The merged entrypoint verify scenario **“Command uses the standard domain error
prefix”** requires `Guide error:`. Actual execution of
`node packages/cli/dist/index.js guide-sdk core:prot --format text` exits 1 and emits
`error: [UNKNOWN_GUIDE_TOPIC] Guide topic 'core:prot' not found.` The common CLI error
prefix is present, but `Guide error:` is not.

This is a compliance failure against the current merged scenario. The `Guide error:`
wording also conflicts with the project-wide standard error convention (`error:` plus
machine-readable code), so this should be resolved as an artifact decision rather than
blindly changing the implementation.

### 3. `guide-sdk --help` does not document JSON and TOON schemas

The merged entrypoint scenario **“Command help declares its json and toon schemas”**
requires both output schemas in help. Actual `guide-sdk --help` lists the
`--format <format>` option and examples but has no `JSON/TOON output schema:` section
or equivalent schema declaration.

Classification: implementation and test gap against the current merged scenario.

No discrepancy remains for the previously stale `ArtifactDag` example: help now uses
`sdk:classes/ArtifactDag`, and a focused test asserts the old interface path is absent.

## Test Coverage

Executed:

```text
pnpm --filter @specd/cli test -- test/commands/guide-sdk/guide-sdk.test.ts \
  test/commands/guide/guide.test.ts test/entrypoint.spec.ts
```

Result: **87 test files passed, 1,097 tests passed**.

Focused coverage includes SDK default suppression, scope/collection composition,
invalid flags, catalog envelopes and pagination, index `readHint`, metadata, generated
source-path omission, topic errors/suggestions, sections/slices, search, user-guide
discovery in text/JSON/TOON, and the canonical `ArtifactDag` help example. Root help
was also exercised directly: it lists `guide-sdk` as a top-level sibling of `guide`.

## Missing Tests

- A negative index assertion that individual index topic objects never expose a
  retrieval-command property; current coverage checks the single `readHint` but does
  not explicitly protect against reintroduction of per-row commands.
- A root `createProgram()` integration test that invokes `guide-sdk` through the real
  registration and verifies the SDK factory is lazy. Existing SDK tests register the
  command directly; `entrypoint.spec.ts` has no `guide-sdk` assertion.
- Tests for the exact desired domain-error convention. The current suite checks
  structured unknown-topic output but does not reconcile the `Guide error:` scenario
  with the standardized `[UNKNOWN_GUIDE_TOPIC]` output.
- A help-contract test (and implementation) for JSON/TOON schema documentation, if
  that entrypoint requirement remains intended.

## Dependency Chain

```text
cli:entrypoint
  -> packages/cli/src/program.ts
     -> registerGuideCommand (cli:guide)
        -> guide/index.ts -> guide/formatters.ts -> @specd/guide
     -> registerGuideSdkCommand (cli:guide-sdk)
        -> guide-sdk/index.ts
           -> listing-options.ts / guide/formatters.ts / CLI errors
           -> lazy @specd/guide/sdk -> GuideEngine
```

Graph analysis marks `cli:src/commands/guide-sdk/index.ts` HIGH risk. Its direct
affected surface includes the shared formatters, pagination, error mapping, root
program, focused SDK tests, and covering specs `cli:entrypoint` and `cli:guide`.
The direct spec dependency chain also includes `guide:composition`, `guide:guide-model`,
`guide:bundle-guides`, `guide:conventions`, `default:_global/docs`, and the CLI error
handling conventions.

## Counts

| Item                                 |      Count |
| ------------------------------------ | ---------: |
| Audited CLI spec IDs                 |          3 |
| Merged requirement totals reviewed   |         73 |
| Merged scenario totals reviewed      |        259 |
| Focused test command runs            |          1 |
| Vitest files passed                  |         87 |
| Vitest tests passed                  |      1,097 |
| Implementation-compliance failures   |          1 |
| Artifact/verification contradictions | 1 blocking |
| Policy/contract decision required    |          1 |
| Missing-test areas                   |          4 |

### Guide Partial (verbatim)

# Full compliance audit — guide-domain slice

**Change:** `sdk-development-guide`  
**Scope:** `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide`, `guide:get-guide-outline`, `guide:search-guides`, `guide:slice-guide-content`, and `guide:errors`, including their direct global dependencies.  
**Method:** merged `spec-preview` requirements and scenarios; current code and test review; graph-first discovery (the graph subsequently remained `GRAPH_BUSY` during concurrent indexing, so direct inspection was used as the permitted fallback); focused test/typecheck/lint; dry pack plus extracted-package runtime test. No implementation or spec artifact was edited.

## Requirements Summary

The merged guide specifications require two independently loadable collections: the legacy user guide and an SDK/extension guide. Build-time compilation must recursively gather configured Markdown roots, create TypeDoc API topics, and emit deterministic package-root JSON assets (`generated/guides.json` and `generated/guides-sdk.json`). Runtime may load only those packaged JSON assets; it must not parse docs, frontmatter, or TypeDoc.

The application contract is collection-qualified identity, normalized lookup, collection-aware paging/filtering, offset-backed outlines and sections, in-memory collection-namespaced search, and typed package-local errors. The main guide factory must remain isolated from the SDK catalog, which is exposed only by `@specd/guide/sdk`. The global conventions require ESM, strict layer separation, no `@specd/core` runtime dependency, and SpecD-compatible errors.

## Implementation Status

| Spec                        | Status                                                 | Evidence                                                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide:guide-model`         | Pass                                                   | Collection-qualified models, source paths, offsets, line/byte metrics, generated import metadata, and collection-aware search hits are implemented.                                                                                                                     |
| `guide:bundle-guides`       | Pass                                                   | `bundleAllCollections()` writes both JSON catalogs directly to package-root `generated/`; it recursively compiles configured roots and invokes the TypeDoc generator.                                                                                                   |
| `guide:composition`         | Pass                                                   | `createGuideEngine()` reads only the user JSON; `createGuideSdkEngine()` is isolated behind `./sdk` and uses the SDK JSON.                                                                                                                                              |
| `guide:conventions`         | Pass                                                   | ESM exports, `generated/` package inclusion, build-before-consume scripts, dev-only documentation tooling, no SpecD runtime package dependencies, and layer boundaries pass static checks.                                                                              |
| `guide:list-guides`         | Pass                                                   | Port operations, collection identity, scope-before-ordering, pagination, extents and withheld generated-topic counts are implemented.                                                                                                                                   |
| `guide:get-guide`           | Pass                                                   | Empty input is rejected before catalog access; normalized qualified resolution delegates through `GuideCatalogPort.getGuide`; candidate lists are collection-qualified.                                                                                                 |
| `guide:get-guide-outline`   | Pass                                                   | Outline retrieval delegates through the normalized lookup and reports correct collection/topic/statistics/sections and generated import metadata.                                                                                                                       |
| `guide:search-guides`       | Pass                                                   | MiniSearch stores namespaced section documents, expands identifier terms, scopes topic/collection filters, creates collection-appropriate read commands, and clamps snippets to section bounds.                                                                         |
| `guide:slice-guide-content` | Pass                                                   | Numeric and heading/slug resolution, ambiguity/not-found handling, offset extraction, CRLF-safe line slicing and formatted absolute line numbers are present.                                                                                                           |
| `guide:errors`              | **Partial — specification-level message contract gap** | The typed hierarchy and structured fields comply; however, `GuideTopicNotFoundError.message` does not direct callers to listing, metadata index, and search commands as the merged guide spec explicitly requires. The CLI delivery adapter adds those hints correctly. |

## Discrepancies

### `guide:errors`: domain error message lacks the mandated browse/retrieval guidance

The merged `guide:errors` requirement says the unknown-topic error message must include the requested topic, must not enumerate the catalog, **and must direct callers to the listing, metadata index, and search commands**. `GuideTopicNotFoundError` currently emits only the concise headline (and a title-match suggestion when applicable), for example `Guide topic 'core:prot' not found.`. It does not mention any discovery command.

The CLI adapter supplies the missing guidance through `browseHint()` and its structured error payload, so user-facing `specd guide-sdk` behaviour is correct. Nevertheless, the package-level error itself does not meet its own merged requirement and is directly unit-tested to omit all candidates without checking any discovery guidance. This is a localized implementation discrepancy in `guide:errors`, not a reason to restore catalog enumeration.

No TypeScript generated catalog or generated-catalog symbol remains in the guide package: search found no `guides.ts`, `GUIDES_CATALOG`, `GUIDES_INDEX`, or `src/infrastructure/generated` reference. The definitive JSON migration is therefore consistent with the requested direction.

## Test Coverage

Executed during this audit:

```text
pnpm --filter @specd/guide test
10 test files passed; 130 tests passed

pnpm --filter @specd/guide typecheck
TypeScript: No errors found

pnpm --filter @specd/guide lint
exit 0
```

Packaging was also checked in two layers:

1. `npm pack --dry-run --json` lists both `generated/guides.json` and `generated/guides-sdk.json`.
2. A real tarball was extracted outside the repository (without documentation roots). Its main and `./sdk` entry points initialized successfully and reported `{ "user": 22, "sdk": 1319 }` topics.

Existing tests cover the repaired package-root output directory, independent collection factories, nested paths, scope/pagination/order, qualified lookup and blank short-circuiting, source paths, identifier token expansion, section-clamped snippets, generated API symbols, and catalog isolation. This is materially stronger than the previous audit cycle: the three then-confirmed implementation faults are fixed and covered.

## Missing Tests

1. Add a package-domain assertion that `GuideTopicNotFoundError.message` itself contains all three bounded discovery routes (listing, metadata index, search), rather than validating those hints only at the CLI adapter.
2. Add an automated `npm pack`/extract regression test in the package suite. The audit manually proved it, but the existing “Published package catalog contract” test only inspects `package.json` and initializes in-repo source code.
3. Add a build freshness test that changes a controlled source fixture (or asserts output destination after an actual bundle) then loads the packed entry points; this protects the package-root JSON path against future regressions.

## Dependency Chain

```text
default:_global/conventions ──────────────┐
default:_global/error-handling-conventions ┼─ guide:conventions
                                          │    ├─ guide:guide-model
                                          │    ├─ guide:bundle-guides
                                          │    ├─ guide:list-guides ─┬─ guide:get-guide ─┬─ guide:get-guide-outline
                                          │    │                    │                    └─ guide:slice-guide-content
                                          │    │                    └─ guide:composition ─┬─ guide:search-guides
                                          │    │                                           └─ guide:errors
                                          │    └─ package artifacts (`dist/`, `generated/`)
                                          └─ CLI/MCP delivery adapters
```

The sole remaining discrepancy sits in the domain-error presentation contract. It does not compromise JSON loading, package isolation, catalog generation, query correctness, or the CLI's discovery UX; the CLI already compensates for it. It should nevertheless be fixed in the package or explicitly relaxed in the spec to achieve literal full compliance.

## Counts

- Specs audited: **10**
- Fully passing: **9**
- Partially compliant: **1** (`guide:errors` message guidance)
- Confirmed implementation discrepancies: **1**
- Previously reported implementation discrepancies now verified fixed: **3**
- Focused tests: **130 / 130 passing**
- Additional checks: **typecheck pass, lint pass, package dry-run pass, extracted-tarball runtime pass**

**Verdict:** the guide-domain implementation is functionally and packaging compliant with the JSON-only migration. Literal full compliance remains blocked by one small `GuideTopicNotFoundError.message` requirement; fix it or adjust that specific package-level requirement before signoff.

### Globals Partial (verbatim)

# Full Global and Direct-Dependency Compliance Review — SDK Development Guide

**Change:** `sdk-development-guide` (state: `verifying`, 89/89 tasks complete)

**Scope:** `default:_global/docs`, `default:_global/architecture`, `default:_global/conventions`, `default:_global/testing`, `default:_global/eslint`, `default:_global/continuous-integration`, `default:_global/error-handling-conventions`, and direct dependency `core:config`.

**Method:** Reviewed merged change artifacts (`cli:guide-sdk`, `guide:bundle-guides`, `guide:conventions`, `default:_global/docs`); inspected code, tests, package manifests, CI, and documentation; used current graph symbol and impact data. The graph is current (`1,207` indexed files, `42,470` symbols, no stale/mismatch indicators).

## Requirements Summary

| Requirement source                                       | Applicable expectation                                                                                           | Status                                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default:_global/docs`                                   | CLI contract changes update `docs/cli` and `docs/guide`; docs use approved roots; all symbols have JSDoc.        | Partially met: new docs exist in approved locations and newly inspected adapter symbols are documented; invalid generated-topic examples remain.               |
| `default:_global/architecture`                           | Layered package structure; CLI hosts use public facades, no concrete adapters; no circular workspace dependency. | Met for this change: guide composition owns adapters; CLI obtains the SDK engine through the public `@specd/guide/sdk` subpath and lazy dynamic import.        |
| `default:_global/conventions` / `default:_global/eslint` | Strict ESM TypeScript, named exports, no `any`, kebab-case production files, explicit public types and JSDoc.    | Met by inspected changed production surfaces.                                                                                                                  |
| `default:_global/testing`                                | Vitest tests under `test/`, portable paths/fixtures, test naming convention `.spec.ts`.                          | Partially met: Vitest coverage is substantial and paths use `node:path`; newly added test filenames use `.test.ts`, contrary to the global naming requirement. |
| `default:_global/continuous-integration`                 | macOS/Ubuntu/Windows, frozen pnpm install, build → typecheck → test.                                             | Met: existing CI workflow supplies the required matrix and order; no workflow change was required.                                                             |
| `default:_global/error-handling-conventions`             | Expected failures have stable SpecD-style code and actionable messaging.                                         | Met for CLI-facing topic/scope/collection failures; native errors remain limited to package/build asset-integrity failures.                                    |
| `core:config`                                            | Configuration changes preserve validated, meaningful configuration behavior.                                     | No behavioral configuration feature is introduced. One stale graph-exclusion configuration entry is recorded as an observation.                                |

## Implementation Status

- `@specd/guide` builds independently loadable JSON assets at `packages/guide/generated/guides.json` and `packages/guide/generated/guides-sdk.json`; its manifest publishes `generated/` together with `dist/`.
- `PrebundledGuideCatalogAdapter` uses only its selected packaged JSON asset. `createGuideEngine()` targets the user catalog and `createGuideSdkEngine()` targets the SDK catalog, preserving composition/application/infrastructure separation.
- The CLI registers `guide-sdk` through the public facade. The graph locates `registerGuideSdkCommand` in `packages/cli/src/commands/guide-sdk/index.ts` and traces its consumers to `createProgram`, `cli` entrypoint, command tests, and documentation-coverage test.
- Build-time collection compilation reads only approved `docs/{guide,sdk,core,code-graph,skills,schemas}` roots and generates TypeDoc-based symbol topics.
- The live CLI confirms the canonical class route works: `guide-sdk sdk:classes/ArtifactDag --format json` exits 0. The old interface route exits 1 and suggests the canonical class route.
- JSDoc gap identified in the preceding global review has been remedied: `loadCatalog` now documents parameters, return value, and failure condition.

## Discrepancies

### D1 — Published documentation contains an invalid generated-topic route (medium)

The merged contract declares `ArtifactDag` at `sdk:classes/ArtifactDag`. However, the following user-facing references instruct users to use `sdk:interfaces/ArtifactDag`:

- `docs/cli/guide-sdk.md` (argument example and retrieval example)
- `docs/guide/cli.md` (SDK guide overview example)
- `packages/guide/README.md` (generated-topic description and SDK collection table)

The actual command verifies the defect: `sdk:interfaces/ArtifactDag` exits 1 with `UNKNOWN_GUIDE_TOPIC`, while `sdk:classes/ArtifactDag` exits 0. This violates `default:_global/docs` requirement that CLI documentation tracks the changed command contract and makes the shipped examples non-copy-pasteable.

**Resolution:** replace every `sdk:interfaces/ArtifactDag` occurrence with `sdk:classes/ArtifactDag`, then add a documentation/example assertion or a link check that catches generated-topic kind drift.

### D2 — Required packed-artifact behavior is not covered by an automated tarball test (medium)

The merged `guide:bundle-guides` scenario requires a packed `@specd/guide` artifact with no documentation source directories to import both engines successfully. The current integration test verifies `package.json#files` contains `generated/` and loads engines from the checkout, but no test packs/extracts the package (`npm pack` or equivalent) and imports it from that isolated artifact.

Manual pack/extract evidence passed earlier in this change, but it is not a regression test. A future relative-path, `files`, or build-output change could regress publication while the existing suite stays green.

**Resolution:** create a cross-platform temporary tarball/extract integration test that imports `dist/public.js` and `dist/sdk.js` from the extracted package and asserts both catalogs load without any `docs/` source tree.

### D3 — New test filenames do not comply with the global `.spec.ts` convention (low)

The change adds `packages/guide/test/integration/sdk-catalog.test.ts` and `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts`. `default:_global/testing` requires `.spec.ts` test filenames. These tests are correctly located beneath `test/` and use Vitest, but the added names extend the repository's existing `.test.ts` convention rather than the governing spec.

**Resolution:** either rename the new tests to `.spec.ts`, or reconcile the global testing specification with the repository-wide Vitest convention before archive.

## Observations (not counted as confirmed discrepancies)

- `specd.yaml` adds graph exclusions for deleted TypeScript artifacts (`src/infrastructure/generated/guides.ts` and `guides-sdk.ts`). The active generated deliverables are JSON and are already outside the code-language index. The entries are inert but stale configuration; remove them if no longer needed.
- The CLI imports `@specd/guide` / `@specd/guide/sdk`, which is an existing sanctioned dependency required by `cli:guide` and `cli:guide-sdk`. This is a public facade, not a concrete adapter import. It should not be treated as a new violation of the global host-boundary rule without an explicit architecture decision banning the established guide package dependency.
- `loadCatalog` and build tooling may throw native `Error` for corrupt/missing package assets. This is appropriately an unexpected build/package-integrity condition unless product policy chooses to expose it as an expected consumer-facing error.

## Test Coverage

| Area                                                                                         | Evidence                                                                                                                                                              | Assessment                                    |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SDK command parsing, scope/collection, pagination, metadata, errors, search, content slicing | `packages/cli/test/commands/guide-sdk/guide-sdk.test.ts` contains focused cases across all command behavior.                                                          | Strong coverage.                              |
| CLI wiring and documentation registration                                                    | Graph traces `registerGuideSdkCommand` through `createProgram`, CLI entrypoint, and `documentation-coverage.spec.ts`.                                                 | Covered.                                      |
| JSON catalog loading and isolation                                                           | `packages/guide/test/integration/sdk-catalog.test.ts` exercises both engines, catalog isolation, collections, generated symbols, search and engine asset declaration. | Covered in checkout.                          |
| Build roots, frontmatter, headings, offsets, and user-catalog isolation                      | `packages/guide/test/unit/infrastructure/bundle.test.ts`.                                                                                                             | Covered.                                      |
| Workspace/API entry-point distinction                                                        | `packages/guide/test/unit/scripts/workspace-package-roots.test.ts`.                                                                                                   | Covered.                                      |
| Real published artifact without source docs                                                  | Manual pack/extract/import verification passed in the implementation phase.                                                                                           | Manual-only; automated coverage missing (D2). |
| Documentation examples                                                                       | Live CLI execution disproves the `ArtifactDag` examples.                                                                                                              | Failing coverage / discrepancy (D1).          |

## Missing Tests

1. Portable packed-tarball import test for both generated JSON catalogs (D2).
2. Documentation command-example test for `sdk:classes/ArtifactDag`, or generated-topic examples derived from the catalog instead of hard-coded.
3. A test establishing intended behavior and error class for a corrupt/missing packaged JSON asset, if this is meant to be consumer-facing rather than an integrity fault.

## Dependency Chain

```text
sdk-development-guide
├─ cli:guide-sdk
│  ├─ cli:entrypoint ──> core:config
│  └─ default:_global/docs
├─ cli:guide ──> cli:entrypoint, default:_global/docs
├─ guide:bundle-guides ──> guide:conventions, guide:guide-model
├─ guide:composition ──> guide:conventions, guide:guide-model, guide:errors,
│                          guide:list-guides, guide:get-guide, guide:get-guide-outline,
│                          guide:slice-guide-content, guide:search-guides
├─ guide:conventions ──> default:_global/conventions
├─ guide:errors ──> default:_global/error-handling-conventions
└─ default:_global/docs ──> default:_global/conventions

Always-on global constraints reviewed:
default:_global/{architecture,conventions,testing,eslint,continuous-integration,
docs,error-handling-conventions}
```

## Summary Counts

| Category                                  | Count |
| ----------------------------------------- | ----: |
| Global/direct dependency sources reviewed |     8 |
| Requirements met                          |     5 |
| Requirements partially met                |     2 |
| Requirements not applicable to behavior   |     1 |
| Confirmed discrepancies                   |     3 |
| Medium-severity discrepancies             |     2 |
| Low-severity discrepancies                |     1 |
| High-severity discrepancies               |     0 |
| Observations                              |     3 |
| Missing tests                             |     3 |

## Conclusion

The JSON catalog architecture, CLI wiring, error treatment, CI arrangement, and most documentation integration conform to the applicable requirements. Verification cannot be considered fully clean: current published docs and README contain an invalid `ArtifactDag` topic route, publication behavior lacks an automated tarball regression, and the newly introduced test filenames conflict with the global convention. D1 is user-visible and should be corrected before completion.
