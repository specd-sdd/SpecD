# Compliance audit — guide core

## Scope and method

Read-only audit of merged change specs `guide:guide-model`, `guide:bundle-guides`, `guide:composition`, `guide:conventions`, `guide:list-guides`, `guide:get-guide-outline`, and `guide:slice-guide-content`, plus their applicable global conventions. Graph status was current (`stale: false`, `contentFresh: true`). Graph impact identifies `ListGuidesQuery` and `GetGuideQuery` as critical paths feeding the CLI, both composition factories, integration tests, and SDK command tests; the implementation and tests for those paths were inspected.

## Requirement coverage

| Spec                        | Requirement groups | Result        | Evidence                                                                                                                                                                                    |
| --------------------------- | -----------------: | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guide:guide-model`         |                  5 | Conforms      | Dependency-free readonly models carry collection identity, real source paths, offsets, line spans and search metadata; `topic-identity.ts` preserves nested paths and reserves `:`.         |
| `guide:bundle-guides`       |                  4 | Conforms      | Six configured source roots, strict frontmatter parsing, heading/offset extraction, package-root JSON assets, TypeDoc library generation, and packaged-runtime catalog loading are present. |
| `guide:composition`         |                  3 | Conforms      | User and SDK factories assemble the same facade against separate catalog assets; current `src/index.ts` does not expose the SDK factory and `src/sdk.ts` is the dedicated entry.            |
| `guide:conventions`         |                  4 | Conforms      | Layering, zero core runtime dependency, package exports/build configuration, errors, generated asset placement, and README are materially present.                                          |
| `guide:list-guides`         |                  2 | Conforms      | Port declares all required members; query uses `getAllGuides`, scopes before ordering/pagination, reports collection extents and generated-topic withholding.                               |
| `guide:get-guide-outline`   |                  1 | **Violation** | Real source path and resolution delegation conform, but optional section content is returned unchanged instead of being forcibly excluded.                                                  |
| `guide:slice-guide-content` |                  3 | Conforms      | Section selection, line slicing, and numbering utilities implement the required 1-indexed behavior and error paths.                                                                         |

## Finding

### GCORE-001 — Outline query can expose full section content

- **Severity:** Medium
- **Requirement:** `guide:get-guide-outline` requires a `GuideOutline` whose section array is returned **without serializing full section content**.
- **Evidence:** `packages/guide/src/application/queries/get-guide-outline-query.ts:40` returns `sections: guide.outline` directly. `GuideSection.content` is optional by model (`packages/guide/src/domain/models/guide-section.ts`), so a valid custom `GuideCatalogPort` may provide populated section content. The current unit fixture does exactly that: `packages/guide/test/unit/application/queries.spec.ts:25-72` gives every sample section a `content` field. Consequently `GetGuideOutlineQuery.execute()` returns those bodies, contrary to the metadata-only contract.
- **Why generated production data does not remove the issue:** the bundler currently omits section body content from JSON, so the default catalog happens not to trigger it. The query requirement is independent of that implementation detail and `GuideEngineOptions.catalogPort` expressly supports caller-provided catalog ports.
- **Recommendation:** project each section into metadata before returning it (omit `content`), preserving `index`, heading/level, line spans, and offsets. Add a unit test with populated catalog sections asserting `content` is absent from the returned outline while `GetGuideSectionQuery` still returns body content on demand.

## Detailed conformance evidence

- **Domain/model + bundling:** `compileGuide` strips frontmatter, computes UTF-8 byte length, assigns lowercased relative topics, and calls `extractSections`. The extractor handles headings 1–6, fenced-code exclusion, inclusive end lines, and exact character offsets. `bundleAllCollections` writes only `packages/guide/generated/guides.json` and `guides-sdk.json`; `PrebundledGuideCatalogAdapter` reads those package assets, not source docs. `sdk-api-generator.ts` imports TypeDoc as a library and reads public-site TypeDoc options.
- **Composition/export boundaries:** `createGuideEngine` defaults to `guides.json`; `createGuideSdkEngine` defaults to `guides-sdk.json`; both route through `assembleGuideEngine`. Graph public bindings for `createGuideSdkEngine` now show only its definition and `guide:src/sdk.ts`, satisfying the dedicated-subpath rule.
- **List behavior:** `ListGuidesQuery.execute()` obtains summaries with `getAllGuides()`, filters prior to a locale-aware sort by collection/order/topic, clamps pagination, gives returned records a 1-indexed page plus docs/api scope, and computes collection page extents. `generated: false` reports withheld generated-topic count; arrays use any-match semantics within their dimension.
- **Outline/section behavior:** outline resolution delegates to `GetGuideQuery`, carries `sourcePath` into `file`, and returns empty outlines naturally. `GetGuideSectionQuery` accepts only `topic` and `section`, recognizes digit-only numeric strings, accepts case/whitespace/slugs, emits ambiguity candidates, and slices stored offsets so nested children remain inside parent content.
- **Line utilities:** `sliceGuideLines` normalizes CRLF/lone CR, defaults/clamps the 1-indexed start, respects the maximum count, and returns empty when beyond the document. `formatWithLineNumbers` uses the highest displayed line’s width for right-aligned padding.

## Tests and coverage

Strong automated coverage exists for frontmatter failure modes; heading hierarchy and offsets; catalog isolation and extracted-package loading; list sorting, page clamping/extents, and withholding; normalized guide retrieval; section numeric/string/slug selection, ambiguity and not-found errors; CRLF slicing; and line-number padding. Integration coverage also validates user/SDK catalog separation, scoped generated listings, qualified nested lookups, real source paths, and SDK search commands.

Coverage gaps:

1. **Required regression coverage for GCORE-001 is missing.** The existing outline test only checks topic, line count, section count, and index despite its fixture containing section bodies; it should assert that body content is not returned.
2. No focused outline test verifies an empty-heading document returns `sections: []`.
3. No focused listing tests exercise collection/topic/collection-qualified **array** scopes and their any-match semantics, despite that expanded scope contract.
4. No built-export-surface test asserts `@specd/guide/internal` cannot export the SDK factory while `@specd/guide/sdk` does. Source and graph are correct now, but a regression guard is absent.
5. No two-way README-to-`generated/guides.json` parity test was found for the conventions requirement.

## Dependency consistency

`default:_global/conventions` governs `guide:conventions`, which constrains the model, bundler, composition, listing, outline, and slicing layers. `guide:guide-model` supplies the fields consumed by the catalog port, list result, outline, and section extraction. `guide:errors` supplies the not-found and ambiguous errors used by slicing. GCORE-001 is isolated to the outline projection boundary and does not challenge source-path, catalog, or section-on-demand semantics.

## Summary

- Change specs audited: 7; relevant global/direct dependencies checked: 2
- Requirement groups reviewed: 22
- Conforming: 21
- Definite discrepancies: 1 medium (GCORE-001)
- Test-coverage gaps: 5
