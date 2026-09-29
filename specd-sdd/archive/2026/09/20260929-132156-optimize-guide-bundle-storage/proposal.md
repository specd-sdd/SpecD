# Proposal: optimize-guide-bundle-storage

## Motivation

The pre-compiled `@specd/guide` catalog (`packages/guide/src/infrastructure/generated/guides.ts`) currently weighs ~1.3 MB because it duplicates entire section Markdown texts across `GuideTopic.content` and individual `GuideSection.content` items in outline trees. Storing pre-calculated character offsets instead of duplicating text eliminates ~75% of the bundle size with zero runtime parsing overhead.

## Current behaviour

`bundle-guides.ts` parses Markdown documents and embeds full text into `GuideTopic.content` while simultaneously storing full section text in `GuideTopic.outline[].content`. Because parent headings span across nested child headings, child section content is duplicated multiple times within the generated TypeScript file.

## Proposed solution

1. Update `bundle-guides.ts` to compute exact character bounds (`startOffset`, `endOffset`) for each section in the topic body, omitting raw `content` from the serialized `outline` array in `GUIDES_CATALOG`.
2. Update the domain model `GuideSection` / `GuideSectionMeta` to include `startOffset` and `endOffset`.
3. Provide on-demand extraction in `@specd/guide`:
   - `MiniSearchGuideEngineAdapter` slices section content on the fly (`guide.content.slice(section.startOffset, section.endOffset)`) during in-memory index construction.
   - `GetGuideSectionQuery` populates `content` on the fly when resolving a requested section by index or heading.
   - `GetGuideOutlineQuery` and CLI outline inspection return lightweight outline metadata without loading redundant section bodies.

## Specs affected

### New specs

None.

### Modified specs

- `guide:bundle-guides`: Update bundling requirements to compute and emit character offsets (`startOffset`, `endOffset`) in outline entries without storing redundant section content strings.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:guide-model`: Update `GuideSection` value object to specify `startOffset` and `endOffset` character spans, allowing section content to be sliced on demand.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:slice-guide-content`: Specify that `GetGuideSectionQuery` dynamically extracts and populates section `content` on demand from `GuideTopic.content` using character offsets.
  - Depends on (added): none
  - Depends on (removed): none
- `guide:search-guides`: Specify that `MiniSearchGuideEngineAdapter` dynamically slices section content using offsets during index construction.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- `packages/guide/scripts/bundle-guides.ts`: Modify `extractSections` and `GUIDES_CATALOG` generator to include `startOffset`/`endOffset` and omit duplicated section content.
- `packages/guide/src/domain/models/guide-section.ts`: Add `startOffset` and `endOffset` properties.
- `packages/guide/src/application/queries/get-guide-section-query.ts`: Extract section content on the fly from `guide.content`.
- `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`: Extract section content on the fly during indexing.
- `packages/guide/src/infrastructure/generated/guides.ts`: Regenerate bundle with ~75% size reduction (~1.3 MB down to ~250-300 KB).
- Test suites in `packages/guide/test/` to verify section retrieval and search indexing behave identically.

## Technical context

- **$O(1)$ substring slicing**: Character offsets (`cleanBody.slice(startOffset, endOffset)`) are pre-calculated at build time, ensuring 0 regex or line splitting overhead at runtime.
- **Backward compatibility**: Public API return types for `getGuideSection()` continue returning `GuideSection` with `content` populated, preventing any breaking changes for callers.
- **Lightweight outline queries**: `GetGuideOutlineQuery` and CLI `--meta` operations no longer carry heavy section strings in memory.

## Open questions

None. All architectural decisions and performance trade-offs have been aligned.
