# Specs-compliance report — `sdk-development-guide`

## Audit metadata

- **Change:** `sdk-development-guide`
- **State:** `verifying`
- **Mode:** full verification compliance audit
- **Scope:** 15 changed spec surfaces and their direct global/dependency requirements
- **Graph:** re-indexed before audit; 1,207 indexed source files and 42,541 symbols

## Requirements summary

The change introduces the SDK development guide package/catalog and `specd guide-sdk`, alongside additive discovery from `specd guide`. The audit reviewed CLI registration and structured output; generated guide models, bundling, composition, listing, lookup, outline and section retrieval; error payloads and search ranking; documentation discovery; and declared architecture/convention dependencies.

## Implementation status

The functional guide-sdk command, catalog composition, scoped search, direct lookup ordering, and exact full-query ranking promotion are implemented and covered by focused tests. The full project test, lint, and typecheck gates completed successfully before this audit. The audit found three remaining requirement discrepancies, detailed below.

## Discrepancies

| ID        | Severity | Requirement                       | Summary                                                                                                               |
| --------- | -------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GQ-001    | High     | `guide:get-guide`, `guide:errors` | Cross-collection title suggestions leak into `availableTopics`, which must remain scoped to the requested collection. |
| GCORE-001 | Medium   | `guide:get-guide-outline`         | Outline results can expose optional full section body content instead of metadata-only entries.                       |
| F1        | Medium   | `default:_global/docs`            | `docs/guide/index.md` lacks the required pointer to the SDK guide.                                                    |

## Test coverage and missing tests

Focused guide search tests (133), CLI guide tests (1,098), targeted guide-sdk tests (72), and documentation coverage tests (31) passed, in addition to the project gates. The audit identified missing regression coverage for: collection-scoped `availableTopics`, direct-hit lookup without catalog enumeration, stripping outline content, an empty-outline case, array scope semantics, SDK export boundaries, and README/catalog parity. See detailed reports for context and prioritization.

## Spec dependency chain

`default:_global/conventions` → `guide:conventions` → guide model, bundle, composition, queries, search and slicing. `guide:guide-model` supplies the catalog and result shapes. `guide:errors` governs failed lookup payloads. `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture` constrain the thin CLI delivery adapter and its documentation surfaces. The reviewed implementation follows this chain; the listed discrepancies are projection/payload/document-discovery gaps, not undeclared dependency violations.

## Summary counts

- Spec surfaces reviewed: **15**
- Definite discrepancies: **3** (**1 high**, **2 medium**)
- Functional CLI discrepancies: **0**
- Conforming guide-core requirement groups: **21 / 22**
- Focused automated tests reported by audit batches: **1,334 passed**
- Missing targeted regression scenarios: **7**

## Detailed partial reports

### CLI and global-documentation audit

#### Scope and method

Reviewed the merged change artifacts for `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture`; followed their direct CLI/guide dependencies into the current implementation and documentation. Graph state was current at audit time (1,207 indexed source files, 42,541 symbols). Graph impact marks `guideSdkCmd` CRITICAL (15 affected files through command, formatter, config/error, guide-engine, and test paths) and `registerGuideSdkCommand` MEDIUM (root program, entrypoint, and focused tests).

#### Requirements evidence and implementation status

| Requirement area                                                                                                                                                                   | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cli:guide-sdk`: registered command, bounded catalog, independent scope/collection filters, index, retrieval, section/window, search, structured formats and guide-specific errors | Compliant        | `packages/cli/src/commands/guide-sdk/index.ts` validates scopes/collections, delegates all guide operations to `GuideEngine`, formats via shared renderers, and maps expected errors to typed CLI output. Runtime JSON listing showed `topics`, `pagination`, per-collection ranges, scope, and withheld-API disclosure; API+collection filtering returned the expected bounded envelope. |
| `cli:entrypoint`: config/exit/output/error/help/excess-argument conventions and lazy catalog load                                                                                  | Compliant        | `program.ts:267-269` registers the adapter with a memoized dynamic `import('@specd/guide/sdk')`; command actions call `loadConfig`; `handle-error.ts` emits standard stderr and JSON/TOON payloads. A built-CLI excess-positional smoke check exited 1. Help exposes the schema and has no root banner.                                                                                   |
| `cli:guide`: additive SDK discovery and sibling-compatible listing envelope                                                                                                        | Compliant        | `commands/guide/index.ts` defines the structured SDK discovery payload, while the shared formatter emits it in every output format. `node packages/cli/dist/index.js guide --format json` returned the unchanged guide envelope plus `sdkGuide` with `specd guide-sdk` and all five collections.                                                                                          |
| Global architecture: direct guide dependency remains a thin delivery adapter                                                                                                       | Compliant        | The merged global architecture now explicitly permits `@specd/cli -> @specd/guide` for this delivery adapter, requires delegation rather than reimplementation, and permits the lazy `/sdk` subpath. The CLI implementation follows that boundary.                                                                                                                                        |
| Global docs: command reference, CLI directory, scenario recipe, and sidebar navigation                                                                                             | Compliant        | `docs/cli/guide-sdk.md` is a dedicated command/search reference and distinguishes `guide` from `guide-sdk`; `docs/cli/index.md`, `docs/guide/cli.md`, and `apps/public-web/sidebars.ts` list/link the command. `docs/core/sdk.md` is absent, consistent with the tombstone requirement.                                                                                                   |
| Global docs: `docs/guide/index.md` points readers to the SDK guide                                                                                                                 | **Noncompliant** | See F1.                                                                                                                                                                                                                                                                                                                                                                                   |

#### Finding F1 — `docs/guide/index.md` lacks the required SDK guide pointer

- **Severity:** Medium
- **Type:** Documentation/spec conformance gap
- **Requirement:** `default:_global/docs` requires `docs/guide/index.md` to point readers to the SDK guide.
- **Evidence:** The current landing page contains the user-guide catalog and terminal quick-help block but no `guide-sdk`, “SDK guide”, or SDK/extension-development reference.
- **Recommendation:** Add a concise SDK/integrator callout or link pointing to `specd guide-sdk` and `docs/cli/guide-sdk.md`, with a coverage assertion.

#### Tests and dependency consistency

The focused guide-sdk suite passed 72 tests, documentation coverage passed 31 tests, and built CLI smoke checks passed for listing, additive discovery, help and excess positionals. The adapter chain is `CLI entrypoint → createProgram → registerGuideSdkCommand → lazy @specd/guide/sdk import → createGuideSdkEngine → GuideEngine`, with user-guide discovery remaining a separate route.

### Guide-core audit

#### Requirement coverage

| Spec                        | Requirement groups | Result        |
| --------------------------- | -----------------: | ------------- |
| `guide:guide-model`         |                  5 | Conforms      |
| `guide:bundle-guides`       |                  4 | Conforms      |
| `guide:composition`         |                  3 | Conforms      |
| `guide:conventions`         |                  4 | Conforms      |
| `guide:list-guides`         |                  2 | Conforms      |
| `guide:get-guide-outline`   |                  1 | **Violation** |
| `guide:slice-guide-content` |                  3 | Conforms      |

#### Finding GCORE-001 — Outline query can expose full section content

- **Severity:** Medium
- **Requirement:** `guide:get-guide-outline` requires sections without serializing full content.
- **Evidence:** `packages/guide/src/application/queries/get-guide-outline-query.ts:40` returns `sections: guide.outline` directly. `GuideSection.content` is optional, and the current unit fixture provides it, so custom catalog ports can leak content.
- **Recommendation:** Project each section to metadata, omitting `content`, and add a fixture-backed assertion while preserving on-demand section retrieval.

#### Coverage gaps and dependency consistency

Missing focused cases are: the GCORE-001 regression, empty-outline behavior, array scope any-match semantics, SDK export-surface boundaries, and README/catalog parity. All other core behavior conforms: model/bundling, composition boundaries, listing, outline resolution, section selection, line slicing and numbering. The gap is isolated to the outline projection boundary.

### Guide-query audit

#### Requirement status

| Requirement area                                        | Status         |
| ------------------------------------------------------- | -------------- |
| Direct topic lookup before catalog enumeration          | Implemented    |
| Normalization and no silent cross-collection resolution | Implemented    |
| Bounded structured topic-not-found payload              | **Discrepant** |
| Exact-query promotion before search limiting            | Implemented    |
| Exact-match snippet selection                           | Implemented    |
| In-memory search and collection/topic filtering         | Implemented    |

#### Finding GQ-001 — Cross-collection title suggestions leak into `availableTopics`

- **Severity:** High
- **Requirement:** `guide:get-guide` and `guide:errors` require ordinary `error.availableTopics` to stay scoped to the requested collection. Sibling title matches must appear only in `error.titleMatches`, with `error.crossCollection = true`.
- **Evidence:** `packages/guide/src/application/queries/get-guide-query.ts` builds `titleMatches` across the catalog and calls `new GuideTopicNotFoundError(topic, [...titleMatches, ...rest], titleMatches, ...)`. This exposes sibling identifiers through the scoped candidate field.
- **Recommendation:** Pass only scoped candidates as the second error argument, and cross-collection matches only as the third. Add regression assertions for scoped candidates and a direct-success spy proving no enumeration.

#### Tests and dependency consistency

The unit suite covers normalization, empty inputs, title suggestions, structured cross-collection fields, exact-query promotion with `limit: 1`, snippets, scoped search, and special-character safety. The exact-promotion test is meaningful because a partial title/heading candidate is indexed before the body exact-substring candidate. The missing tests are the two GQ-001 scenarios. The discrepancy is internal to error-payload assembly; declared layers/dependencies remain consistent.

## Preserved batch reports

The full, independently written batch reports are preserved alongside this synthesis:

- `_partial-cli.md`
- `_partial-guide-core.md`
- `_partial-guide-queries.md`

### Verbatim: `_partial-cli.md`

> # CLI and global-documentation compliance audit — `sdk-development-guide`
>
> ## Scope and method
>
> Reviewed the merged change artifacts for `cli:guide-sdk`, `cli:entrypoint`, `cli:guide`, `default:_global/docs`, and `default:_global/architecture`; followed their direct CLI/guide dependencies into the current implementation and documentation. Graph state was current at audit time (1,207 indexed source files, 42,541 symbols). Graph impact marks `guideSdkCmd` CRITICAL (15 affected files through command, formatter, config/error, guide-engine, and test paths) and `registerGuideSdkCommand` MEDIUM (root program, entrypoint, and focused tests).
>
> ## Requirements evidence and implementation status
>
> | Requirement area                                                                                                                                                                   | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
> | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `cli:guide-sdk`: registered command, bounded catalog, independent scope/collection filters, index, retrieval, section/window, search, structured formats and guide-specific errors | Compliant        | `packages/cli/src/commands/guide-sdk/index.ts` validates scopes/collections, delegates all guide operations to `GuideEngine`, formats via shared renderers, and maps expected errors to typed CLI output. Runtime JSON listing showed `topics`, `pagination`, per-collection ranges, scope, and withheld-API disclosure; API+collection filtering returned the expected bounded envelope. |
> | `cli:entrypoint`: config/exit/output/error/help/excess-argument conventions and lazy catalog load                                                                                  | Compliant        | `program.ts:267-269` registers the adapter with a memoized dynamic `import('@specd/guide/sdk')`; command actions call `loadConfig`; `handle-error.ts` emits standard stderr and JSON/TOON payloads. A built-CLI excess-positional smoke check exited 1. Help exposes the schema and has no root banner.                                                                                   |
> | `cli:guide`: additive SDK discovery and sibling-compatible listing envelope                                                                                                        | Compliant        | `commands/guide/index.ts` defines the structured SDK discovery payload, while the shared formatter emits it in every output format. `node packages/cli/dist/index.js guide --format json` returned the unchanged guide envelope plus `sdkGuide` with `specd guide-sdk` and all five collections.                                                                                          |
> | Global architecture: direct guide dependency remains a thin delivery adapter                                                                                                       | Compliant        | The merged global architecture now explicitly permits `@specd/cli -> @specd/guide` for this delivery adapter, requires delegation rather than reimplementation, and permits the lazy `/sdk` subpath. The CLI implementation follows that boundary.                                                                                                                                        |
> | Global docs: command reference, CLI directory, scenario recipe, and sidebar navigation                                                                                             | Compliant        | `docs/cli/guide-sdk.md` is a dedicated command/search reference and distinguishes `guide` from `guide-sdk`; `docs/cli/index.md`, `docs/guide/cli.md`, and `apps/public-web/sidebars.ts` list/link the command. `docs/core/sdk.md` is absent, consistent with the tombstone requirement.                                                                                                   |
> | Global docs: `docs/guide/index.md` points readers to the SDK guide                                                                                                                 | **Noncompliant** | See F1.                                                                                                                                                                                                                                                                                                                                                                                   |
>
> ## Findings
>
> ### F1 — `docs/guide/index.md` lacks the required SDK guide pointer
>
> - **Severity:** Medium
> - **Type:** Documentation/spec conformance gap
> - **Requirement:** `default:_global/docs` — “SDK guide documentation and discoverability” requires `docs/guide/index.md` to point readers to the SDK guide.
> - **Evidence:** The complete current `docs/guide/index.md` contains the user-guide catalog and terminal quick-help block but no `guide-sdk`, “SDK guide”, or SDK/extension-development reference. Targeted search found the command in `docs/guide/cli.md`, `docs/cli/guide-sdk.md`, `docs/cli/index.md`, and the public-web sidebar, but not in the required guide landing page.
> - **Impact:** Integrators beginning from the primary guides overview have no route to the package-reference/API catalog, despite other discovery surfaces being correct.
> - **Recommendation:** Add a concise SDK/integrator callout or link in `docs/guide/index.md` pointing to `specd guide-sdk` and the dedicated `docs/cli/guide-sdk.md` reference, clearly distinguishing it from the user-facing `specd guide` collection. Add a regression assertion to documentation coverage.
>
> ## Tests and scenario coverage
>
> - `pnpm --filter @specd/cli exec vitest run test/commands/guide-sdk/guide-sdk.spec.ts` — **PASS**, 1 file / **72 tests**. Covers catalog filtering/order/pagination, hidden generated API notice, index/meta, topic inspection, generated topic behavior, slicing, search, unknown-topic suggestion/error shape, output formats, root registration, and lazy engine resolution.
> - `pnpm --filter @specd/cli exec vitest run test/documentation-coverage.spec.ts` — **PASS**, 1 file / **31 tests**. Confirms command registration/documentation coverage, but does not assert the semantic landing-page discoverability requirement in F1.
> - Built CLI smoke checks — **PASS**:
>   - `guide-sdk --format json --page-size 2` returned the required bounded structured listing and hidden generated-topic reveal command.
>   - `guide --format json` returned `sdkGuide` as a structured additive field.
>   - both `guide-sdk --help` and `guide --help` state the sibling/SDK relationship and output contracts.
>   - `guide-sdk core:ports unexpected` returned exit code 1 for an excess positional.
>
> ## Dependency consistency
>
> `CLI entrypoint -> createProgram -> registerGuideSdkCommand -> lazy @specd/guide/sdk import -> createGuideSdkEngine -> GuideEngine -> prebundled SDK catalog/search adapters -> shared CLI formatters/error/config route`.
>
> The existing user-guide route remains separate: `createProgram -> registerGuideCommand -> user GuideEngine -> shared formatter + sdkGuide discovery`. The direct `@specd/guide` dependency and lazy SDK subpath are now explicitly sanctioned by the merged architecture spec, and the adapter does not reimplement guide-domain behavior.
>
> ## Summary
>
> - Merged specs/global requirements reviewed: **5**
> - Functional CLI discrepancies: **0**
> - Documentation discrepancies: **1 medium** (F1)
> - Focused CLI tests: **72 passed**
> - Documentation-coverage tests: **31 passed**
> - Built-command smoke checks: **4 passed**

### Verbatim: `_partial-guide-core.md`

> # Compliance audit — guide core
>
> ## Scope and method
>
> Read-only audit of merged change specs `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide-outline`, and `guide:slice-guide-content`, plus their applicable global conventions. Graph status was current (`stale: false`, `contentFresh: true`). Graph impact identifies `ListGuidesQuery` and `GetGuideQuery` as critical paths feeding the CLI, both composition factories, integration tests, and SDK command tests; the implementation and tests for those paths were inspected.
>
> ## Requirement coverage
>
> | Spec                        | Requirement groups | Result        | Evidence                                                                                                                                                                                    |
> | --------------------------- | -----------------: | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `guide:guide-model`         |                  5 | Conforms      | Dependency-free readonly models carry collection identity, real source paths, offsets, line spans and search metadata; `topic-identity.ts` preserves nested paths and reserves `:`.         |
> | `guide:bundle-guides`       |                  4 | Conforms      | Six configured source roots, strict frontmatter parsing, heading/offset extraction, package-root JSON assets, TypeDoc library generation, and packaged-runtime catalog loading are present. |
> | `guide:composition`         |                  3 | Conforms      | User and SDK factories assemble the same facade against separate catalog assets; current `src/index.ts` does not expose the SDK factory and `src/sdk.ts` is the dedicated entry.            |
> | `guide:conventions`         |                  4 | Conforms      | Layering, zero core runtime dependency, package exports/build configuration, errors, generated asset placement, and README are materially present.                                          |
> | `guide:list-guides`         |                  2 | Conforms      | Port declares all required members; query uses `getAllGuides`, scopes before ordering/pagination, reports collection extents and generated-topic withholding.                               |
> | `guide:get-guide-outline`   |                  1 | **Violation** | Real source path and resolution delegation conform, but optional section content is returned unchanged instead of being forcibly excluded.                                                  |
> | `guide:slice-guide-content` |                  3 | Conforms      | Section selection, line slicing, and numbering utilities implement the required 1-indexed behavior.                                                                                         |
>
> ## Finding
>
> ### GCORE-001 — Outline query can expose full section content
>
> - **Severity:** Medium
> - **Requirement:** `guide:get-guide-outline` requires a `GuideOutline` whose section array is returned **without serializing full section content**.
> - **Evidence:** `packages/guide/src/application/queries/get-guide-outline-query.ts:40` returns `sections: guide.outline` directly. `GuideSection.content` is optional by model (`packages/guide/src/domain/models/guide-section.ts`), so a valid custom `GuideCatalogPort` may provide populated section content. The current unit fixture does exactly that: `packages/guide/test/unit/application/queries.spec.ts:25-72` gives every sample section a `content` field. Consequently `GetGuideOutlineQuery.execute()` returns those bodies, contrary to the metadata-only contract.
> - **Why generated production data does not remove the issue:** the bundler currently omits section body content from JSON, so the default catalog happens not to trigger it. The query requirement is independent of that implementation detail and `GuideEngineOptions.catalogPort` expressly supports caller-provided catalog ports.
> - **Recommendation:** project each section into metadata before returning it (omit `content`), preserving `index`, heading/level, line spans, and offsets. Add a unit test with populated catalog sections asserting `content` is absent from the returned outline while `GetGuideSectionQuery` still returns body content on demand.
>
> ## Detailed conformance evidence
>
> - **Domain/model + bundling:** `compileGuide` strips frontmatter, computes UTF-8 byte length, assigns lowercased relative topics, and calls `extractSections`. The extractor handles headings 1–6, fenced-code exclusion, inclusive end lines, and exact character offsets. `bundleAllCollections` writes only `packages/guide/generated/guides.json` and `guides-sdk.json`; `PrebundledGuideCatalogAdapter` reads those package assets, not source docs. `sdk-api-generator.ts` imports TypeDoc as a library and reads public-site TypeDoc options.
> - **Composition/export boundaries:** `createGuideEngine` defaults to `guides.json`; `createGuideSdkEngine` defaults to `guides-sdk.json`; both route through `assembleGuideEngine`. Graph public bindings for `createGuideSdkEngine` now show only its definition and `guide:src/sdk.ts`, satisfying the dedicated-subpath rule.
> - **List behavior:** `ListGuidesQuery.execute()` obtains summaries with `getAllGuides()`, filters prior to a locale-aware sort by collection/order/topic, clamps pagination, gives returned records a 1-indexed page plus docs/api scope, and computes collection page extents. `generated: false` reports withheld generated-topic count; arrays use any-match semantics within their dimension.
> - **Outline/section behavior:** outline resolution delegates to `GetGuideQuery`, carries `sourcePath` into `file`, and returns empty outlines naturally. `GetGuideSectionQuery` accepts only `topic` and `section`, recognizes digit-only numeric strings, accepts case/whitespace/slugs, emits ambiguity candidates, and slices stored offsets so nested children remain inside parent content.
> - **Line utilities:** `sliceGuideLines` normalizes CRLF/lone CR, defaults/clamps the 1-indexed start, respects the maximum count, and returns empty when beyond the document. `formatWithLineNumbers` uses the highest displayed line’s width for right-aligned padding.
>
> ## Tests and coverage
>
> Strong automated coverage exists for frontmatter failure modes; heading hierarchy and offsets; catalog isolation and extracted-package loading; list sorting, page clamping/extents, and withholding; normalized guide retrieval; section numeric/string/slug selection, ambiguity and not-found errors; CRLF slicing; and line-number padding. Integration coverage also validates user/SDK catalog separation, scoped generated listings, qualified nested lookups, real source paths, and SDK search commands.
>
> Coverage gaps:
>
> 1. **Required regression coverage for GCORE-001 is missing.** The existing outline test only checks topic, line count, section count, and index despite its fixture containing section bodies; it should assert that body content is not returned.
> 2. No focused outline test verifies an empty-heading document returns `sections: []`.
> 3. No focused listing tests exercise collection/topic/collection-qualified **array** scopes and their any-match semantics, despite that expanded scope contract.
> 4. No built-export-surface test asserts `@specd/guide/internal` cannot export the SDK factory while `@specd/guide/sdk` does. Source and graph are correct now, but a regression guard is absent.
> 5. No two-way README-to-`generated/guides.json` parity test was found for the conventions requirement.
>
> ## Dependency consistency
>
> `default:_global/conventions` governs `guide:conventions`, which constrains the model, bundler, composition, listing, outline, and slicing layers. `guide:guide-model` supplies the fields consumed by the catalog port, list result, outline, and section extraction. `guide:errors` supplies the not-found and ambiguous errors used by slicing. GCORE-001 is isolated to the outline projection boundary and does not challenge source-path, catalog, or section-on-demand semantics.
>
> ## Summary
>
> - Change specs audited: 7; relevant global/direct dependencies checked: 2
> - Requirement groups reviewed: 22
> - Conforming: 21
> - Definite discrepancies: 1 medium (GCORE-001)
> - Test-coverage gaps: 5

### Verbatim: `_partial-guide-queries.md`

> # Guide query compliance partial — `sdk-development-guide`
>
> ## Scope and evidence
>
> Audited merged change specs and verification scenarios for `guide:get-guide`, `guide:errors`, and `guide:search-guides`, plus their guide-model/conventions dependencies. Graph lookup resolves the relevant implementation symbols to `GetGuideQuery`, `GuideTopicNotFoundError`, and `MiniSearchGuideEngineAdapter`; its dependency traversal confirms that the query is isolated to the catalog port, topic identity, models, and domain errors.
>
> Reviewed implementation and tests in:
>
> - `packages/guide/src/application/queries/get-guide-query.ts`
> - `packages/guide/src/domain/errors/guide-topic-not-found-error.ts`
> - `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`
> - `packages/guide/test/unit/application/queries.spec.ts`
> - `packages/guide/test/unit/domain/errors.spec.ts`
> - `packages/guide/test/unit/infrastructure/search.test.ts`
>
> ## Requirements and implementation status
>
> | Requirement area                                        | Status         | Evidence                                                                                                                                              |
> | ------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Direct topic lookup before catalog enumeration          | Implemented    | `GetGuideQuery.execute()` calls `getGuide()` before `getAllTopics()` after resolving its serving collection.                                          |
> | Normalization and no silent cross-collection resolution | Implemented    | The query uses `normalizeTopicRef`, qualifies the requested collection, and always throws after a miss.                                               |
> | Bounded structured topic-not-found payload              | **Discrepant** | See GQ-001.                                                                                                                                           |
> | Exact-query promotion before search limiting            | Implemented    | `rankExactQueryMatches()` is called after filters and before `slice(0, limit)`; stable sort preserves MiniSearch order within exact/non-exact groups. |
> | Exact-match snippet selection                           | Implemented    | `findBestMatchLine()` gives a complete substring a dominant score before partial term matching.                                                       |
> | In-memory search and collection/topic filtering         | Implemented    | Adapter indexes per-section documents in memory, applies scoped filters before ranking, and namespaces IDs by collection/topic.                       |
>
> ## Findings
>
> ### GQ-001 — High: cross-collection title suggestions leak into `availableTopics`
>
> - **Requirement:** `guide:get-guide` and `guide:errors` require a qualified miss to keep ordinary `error.availableTopics` scoped to the requested collection. Sibling title-equivalent alternatives belong only in `error.titleMatches`, with `error.crossCollection = true`.
> - **Evidence:** In `packages/guide/src/application/queries/get-guide-query.ts`, the cross-collection branch computes `titleMatches` from the whole catalog, then calls `new GuideTopicNotFoundError(topic, [...titleMatches, ...rest], titleMatches, ...)`. `rest` is collection-scoped, but the leading `titleMatches` are not. Thus a request such as `core:ArtifactDag` can expose `sdk:classes/ArtifactDag` through `availableTopics`, contrary to the merged scenarios.
> - **Test gap:** The existing cross-collection test at `packages/guide/test/unit/application/queries.spec.ts` asserts `titleMatches`, `crossCollection`, and message text, but never asserts that `availableTopics` excludes the sibling identifier. There is also no direct-hit test proving `getAllTopics()` is not called after a successful `getGuide()`.
> - **Recommendation:** Pass only the scoped candidates as the second `GuideTopicNotFoundError` argument; pass cross-collection matches exclusively as the third argument. Add a regression assertion that `availableTopics` contains only the requested collection and a spy-based direct-hit/no-enumeration test.
>
> ## Test coverage assessment
>
> - The unit suite covers normalization, empty inputs, title suggestions, cross-collection structured fields, exact-query promotion with `limit: 1`, snippets, scoped search, and special-character safety.
> - The newly added exact-query ranking test is meaningful: its partial-only title/heading candidate is indexed before the body exact-substring candidate, and the result confirms the exact candidate wins after the pre-limit promotion.
> - Coverage is incomplete for the two scenarios called out under GQ-001. The current tests would allow the observed cross-collection candidate leak.
>
> ## Dependency consistency
>
> The three audited specs are consistent with their declared dependencies: query code depends on `GuideCatalogPort`, topic identity, guide models, and package-local errors; the search adapter remains in the infrastructure layer and uses the in-memory MiniSearch engine. The discrepancy is internal to assembling the error payload, not an undeclared package or architecture dependency.
>
> ## Summary
>
> - Requirements reviewed: 3 spec surfaces.
> - Confirmed implemented: direct lookup ordering, normalization/non-resolution behavior, error shape, exact-query promotion, snippets, and search scoping.
> - Discrepancies: 1 high-severity implementation/spec mismatch (GQ-001).
> - Missing targeted tests: 2 scenarios (collection-scoped `availableTopics`; no enumeration following direct success).
