# Tasks: optimize-guide-bundle-storage

## 1. Domain Model Updates

- [x] 1.1 Update `GuideSection` interface with `startOffset`, `endOffset`, and optional `content`
      `packages/guide/src/domain/models/guide-section.ts`: `GuideSection` — add `startOffset: number` and `endOffset: number` properties; declare `content?: string`
      Approach: Add readonly `startOffset` and `endOffset` representing 0-indexed character bounds within the parent topic content.
      (Req: GuideSection Value Object)

## 2. Build-Time Bundling Updates

- [x] 2.1 Calculate `startOffset` and `endOffset` in `extractSections`
      `packages/guide/scripts/bundle-guides.ts`: `extractSections` — compute exact character bounds for each section in clean document body
      Approach: Track character offsets of lines or accumulate line lengths to compute 0-indexed `startOffset` (start of heading line) and `endOffset` (end of `endLine`).
      (Req: Heading and Line Range Extraction)

- [x] 2.2 Omit redundant `content` from outline sections in generated `GUIDES_CATALOG`
      `packages/guide/scripts/bundle-guides.ts`: `compileGuide` / `bundleGuides` — serialize outline objects containing offset coordinates without raw `content` strings
      Approach: Emit lightweight section descriptors `{ index, heading, level, startLine, endLine, lines, startOffset, endOffset }` into `GUIDES_CATALOG`.
      (Req: Static Catalog Artifact Generation)

## 3. Application and Infrastructure Runtime Extraction

- [x] 3.1 Dynamically extract section content in `GetGuideSectionQuery`
      `packages/guide/src/application/queries/get-guide-section-query.ts`: `GetGuideSectionQuery.execute()` — populate `content` on the fly
      Approach: When matching a section by index or heading/slug, slice `guide.content.slice(found.startOffset, found.endOffset)` and return the complete `GuideSection` entity.
      (Req: GetGuideSectionQuery Implementation)

- [x] 3.2 Dynamically extract section content during MiniSearch index construction
      `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`: `ensureIndex()` — supply sliced content to `SectionDocument`
      Approach: When iterating over `guide.outline`, populate `SectionDocument.content` using `guide.content.slice(section.startOffset, section.endOffset)`.
      (Req: In-Memory Search Engine Adapter)

## 4. Regeneration and Verification

- [x] 4.1 Regenerate static `guides.ts` bundle and verify size reduction
      `packages/guide/src/infrastructure/generated/guides.ts` — run bundling script to emit updated catalog
      Approach: Execute `node packages/guide/scripts/bundle-guides.ts` and verify file size decreases from ~1.3 MB to ~250-300 KB.
      (Req: Static Catalog Artifact Generation)

- [x] 4.2 Update and execute test suite for `@specd/guide`
      `packages/guide/test/**/*.spec.ts` — update unit and integration test assertions to verify offsets, on-demand slicing, and search
      Approach: Run `pnpm --filter @specd/guide test` to ensure all tests pass.
      (Req: All requirements)

- [x] 4.3 Run monorepo typecheck and CLI test suite
      `packages/cli/test/commands/guide.spec.ts` — run full build, typecheck, and CLI tests to ensure zero regressions
      Approach: Execute `pnpm typecheck` and `pnpm test`.
      (Req: All requirements)
