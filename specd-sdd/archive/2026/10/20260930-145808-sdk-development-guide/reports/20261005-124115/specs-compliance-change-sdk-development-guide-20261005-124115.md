# Specs-compliance report — `sdk-development-guide`

## Audit summary

- **Mode:** specific change, full verification audit
- **Graph:** re-indexed and current before review
- **Requirements reviewed:** 15 changed spec surfaces plus applicable dependencies and globals
- **Result:** one medium discrepancy; query and outline corrections are conformant

## Implementation status

The direct lookup, collection-scoped candidate isolation, metadata-only outline projection, SDK-guide landing-page discovery, and exact-query ranking fixes are implemented with focused regressions. `pnpm test`, lint, and typecheck passed during verification.

## Discrepancies

| ID        | Severity | Requirement                                               | Evidence                                                                                                                                                   |
| --------- | -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-CLI-001 | Medium   | `cli:guide` / `cli:guide-sdk` structured output contracts | Merged requirements include `markdown`, while `parseGuideFormat` only accepts `text`, `json`, and `toon`; `--format markdown` fails with `INVALID_FORMAT`. |

Either implement Markdown and focused command coverage, or revise the contracts if Markdown is not intended.

## Test coverage

- Full repository suite, lint, and typecheck: passed.
- Query regressions prove direct lookup avoids enumeration and cross-collection title matches stay out of `availableTopics`.
- Outline regression proves section `content` is excluded while on-demand section retrieval retains it.
- Documentation coverage proves the guide landing page exposes `specd guide-sdk`.
- Missing required coverage: Markdown success paths for `guide` and `guide-sdk`.

## Dependency chain

`cli:guide-sdk` and `cli:guide` delegate through `@specd/guide`; guide composition reaches `GetGuideQuery`, `GetGuideOutlineQuery`, the catalog port, and the MiniSearch adapter. Global architecture permits this thin CLI delivery-adapter edge. The discrepancy is isolated to CLI formatting support.

## Summary counts

- Findings: **1 medium**
- Query-scope discrepancies: **0**
- Guide-core discrepancies: **0**
- Required missing-test categories: **1**

## Detailed findings — verbatim batch reports

### `_partial-cli.md`

> # CLI compliance audit — `sdk-development-guide`
>
> ## Scope and evidence
>
> Audited merged change previews for `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture`; the CLI implementation, documentation, and focused test suite; and direct `@specd/guide` integration. Graph stats were current (`stale: false`, `fingerprintMismatch: false`) at audit time.
>
> ## Requirements summary
>
> The change requires a lazily loaded top-level `guide-sdk` delivery adapter over `@specd/guide/sdk`; paginated, scoped, collection-aware catalog/list/index/topic/search behavior; standard CLI config/output/exit behavior; structured discovery from `specd guide`; documentation/site navigation; and no CLI business logic or forbidden direct core/code-graph dependency.
>
> ## Implementation status
>
> - `registerGuideSdkCommand` is registered by `createProgram`; `program.ts` caches a dynamic `import('@specd/guide/sdk')`, so normal commands do not load the SDK catalog.
> - The command delegates listing, lookup, slicing, and search through `GuideEngine`; `packages/cli/package.json` declares `@specd/guide` and does not declare direct runtime dependencies on `@specd/core` or `@specd/code-graph`.
> - Scope and collection validation, pagination, generated-topic withholding, structured listing/index envelopes, topic metadata/slicing, error output, and search formatting are implemented in the CLI adapter.
> - `specd guide` exposes `sdkGuide` in its structured listing envelope and in text/help output.
> - Required docs and navigation are present: `docs/guide/index.md`, `docs/guide/cli.md`, `docs/cli/index.md`, `docs/cli/guide-sdk.md`, and `apps/public-web/sidebars.ts`.
>
> ## Discrepancies
>
> ### F-CLI-001 — Markdown output required by merged guide contracts is not supported (medium)
>
> Both merged `cli:guide` and `cli:guide-sdk` requirements require discovery/listing and pagination behavior under `text`, `markdown`, `json`, and `toon`. `parseGuideFormat` accepts only `text`, `json`, and `toon`; invoking `node packages/cli/dist/index.js guide-sdk --format markdown` exits with `INVALID_FORMAT`. No CLI test covers Markdown output. Consequently, Markdown-specific obligations (including the `sdkGuide` discovery field and collection/page rendering) cannot be satisfied.
>
> Recommended resolution: either implement `markdown` as a supported `GuideOutputFormat` with coverage in both guide command suites, or revise the merged requirements to remove Markdown as a supported CLI format if that is the intended contract.
>
> ## Test coverage
>
> - `packages/cli/test/commands/guide-sdk/guide-sdk.spec.ts` covers registration/lazy resolution, catalog scopes and collection composition, validation errors, pagination/indexing, unknown-topic diagnostics, metadata, slicing, search, and help.
> - `packages/cli/test/commands/guide/guide.test.ts` covers SDK discovery in text/JSON/TOON and help.
> - `packages/cli/test/documentation-coverage.spec.ts` asserts the guide overview discovery link.
> - The implementation-level gates reported for this change (`pnpm test`, lint, and typecheck) were successful before this verification audit.
>
> ## Missing tests
>
> - Add success-path tests for `--format markdown` on both `guide` and `guide-sdk`, specifically asserting the structured discovery semantics and page/collection rendering required by the specs.
>
> ## Spec dependency chain
>
> `default:_global/architecture` permits the CLI delivery dependency on `@specd/guide` and lazy SDK subpath loading. `cli:entrypoint` requires top-level registration and standard command behavior. `cli:guide-sdk` defines the SDK adapter contract. `cli:guide` and `default:_global/docs` require discovery and published documentation. The CLI delegates its catalog semantics to the guide package contracts rather than duplicating them.
>
> ## Counts
>
> - Requirements reviewed: 5 spec scopes
> - Implemented/covered areas: 4 scopes substantially conformant
> - Findings: 1 (`medium`)
> - Missing-test categories: 1

### `_partial-guide-core.md`

> # Compliance Audit Partial: Guide Core
>
> ## Scope
>
> Read-only audit of `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide-outline`, and `guide:slice-guide-content`, including their direct `guide:errors` / catalog and composition dependencies. The focused regression under review is metadata-only outline serialization.
>
> ## Requirements Summary
>
> - Guide domain values retain collection-qualified identity, real source paths, byte/line metadata, 1-indexed section geometry, and offset-based on-demand section extraction.
> - Bundling and composition expose single-catalog engines, derive typed summaries and outlines, and keep document content available for explicit reads/section slicing.
> - Listing returns compact summaries with collection and pagination/scope metadata.
> - Outline retrieval resolves through the shared topic-resolution path, preserves the document's real source path, and must omit optional `GuideSection.content` from every returned outline item.
> - Section retrieval remains the on-demand body path; it supports index/name/slug selection, ambiguity reporting, and bounded line utilities.
>
> ## Implementation Status
>
> Compliant for the audited scope.
>
> `GetGuideOutlineQuery.execute` (`packages/guide/src/application/queries/get-guide-outline-query.ts`) uses `GetGuideQuery` for catalog resolution, copies the required metadata, and explicitly constructs each returned section from structural fields only (`index`, `heading`, `level`, line bounds/count, and offsets). It never spreads the catalog section, so an input `content` property cannot cross the outline boundary. The separate `GetGuideSectionQuery` remains the body-returning route.
>
> ## Test Coverage
>
> `packages/guide/test/unit/application/queries.spec.ts` asserts the returned section has no `content` and confirms explicit section retrieval returns the body. Integration and CLI metadata tests cover the two engine paths.
>
> ## Missing Tests / Residual Risk
>
> No blocking gap found. A future strengthening opportunity is a CLI JSON assertion that each individual `outline` element lacks `content`; the unit-level mapper test already covers the boundary directly. This is informational only and is not a discrepancy.
>
> ## Discrepancies
>
> None in the audited guide-core scope.
>
> ## Counts
>
> | Measure                               | Count |
> | ------------------------------------- | ----: |
> | Scoped specs reviewed                 |     7 |
> | Implementation discrepancies          |     0 |
> | Blocking findings                     |     0 |
> | Non-blocking test-strengthening notes |     1 |
> | Directly evidenced test layers        |     3 |

### `_partial-guide-queries.md`

> # Compliance audit partial — guide queries
>
> ## Scope
>
> - Change: `sdk-development-guide`
> - Specs reviewed: `guide:get-guide`, `guide:errors`, `guide:search-guides`
> - Implementations reviewed: `GetGuideQuery`, `GuideTopicNotFoundError`, and `MiniSearchGuideEngineAdapter`.
> - Graph state: current; the ranking adapter reaches both user-guide and SDK composition paths, plus focused integration and unit tests.
>
> ## Requirements summary
>
> | Requirement                                                                                                                              | Implementation evidence                                                                                                                                                                          | Status    |
> | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
> | Normalize a topic, do direct collection-qualified lookup, and enumerate only after a miss                                                | `GetGuideQuery.execute()` normalizes the reference, calls `getGuide()` before `getAllTopics()`, and has an explicit successful-lookup non-enumeration regression.                                | Compliant |
> | Keep ordinary candidates collection-scoped; expose sibling title-equivalent results only through structured cross-collection suggestions | On a qualified miss, `scoped` is filtered to the requested collection; `titleMatches` uses the full catalog only if no scoped title match exists; `availableTopics` is built from `scoped` only. | Compliant |
> | Preserve the original failed lookup and surface a typed, host-neutral error                                                              | `GuideTopicNotFoundError` retains raw `topic`, supplies qualified candidates and `titleMatches`/`crossCollection`, and does not redirect or mention a host command.                              | Compliant |
> | Promote exact full-query substrings before applying `limit`, while retaining BM25 order inside each group                                | `rankExactQueryMatches()` is applied after all filters and before slicing; its stable sort partitions exact title/heading/content matches without changing order within a partition.             | Compliant |
>
> ## Implementation status
>
> `GetGuideQuery` does not resolve across collections: a failed qualified lookup is followed by catalog enumeration solely for the error payload. Its cross-collection branch removes sibling title hits from `availableTopics` and places them in `titleMatches`, setting `crossCollection` only when a sibling title hit is present.
>
> The search adapter performs filtering first, then exact-substring promotion, then applies the requested limit. `isExactQueryMatch()` covers all required indexed fields (title, heading, content), and snippets are subsequently generated from the selected document.
>
> ## Test coverage
>
> - `packages/guide/test/unit/application/queries.spec.ts`: direct normalized lookup passes the exact composite key; success does not call `getAllTopics()`; blank input does not access the catalog; sibling `ArtifactDag` stays out of `availableTopics`, appears in `titleMatches`, and sets `crossCollection`.
> - `packages/guide/test/unit/domain/errors.spec.ts`: validates raw topic, structured suggestion fields, collection-qualified candidates, and host-neutral messages.
> - `packages/guide/test/unit/infrastructure/search.test.ts`: proves an exact body substring is returned ahead of a partial-term hit when `limit: 1`, and that the snippet contains the exact phrase.
>
> ## Discrepancies
>
> None found in this scope.
>
> ## Missing tests / residual risk
>
> No required scenario lacks an implementation regression.
>
> ## Dependency chain
>
> `guide:get-guide` → `guide:errors` / `guide:guide-model` / `guide:conventions`.
>
> `guide:search-guides` → `GuideSearchPort` → `MiniSearchGuideEngineAdapter` → user-guide and SDK guide-engine composition paths.
>
> ## Counts
>
> - Requirements checked: 4
> - Compliant: 4
> - Discrepancies: 0
> - Missing required tests: 0
