# Design: optimize-guide-bundle-storage

## Context and Scope

`@specd/guide` pre-compiles Docusaurus Markdown files in `docs/guide/*.md` at package build time into a TypeScript catalog (`src/infrastructure/generated/guides.ts`). Currently, this catalog weighs ~1.3 MB because it stores both the full document body in `GuideTopic.content` and individual section bodies in `GuideTopic.outline[].content`. Furthermore, parent Markdown sections (H1/H2) duplicate all nested sub-sections (H3/H4), creating multiple copies of the same text within the generated bundle.

This design establishes a lightweight catalog architecture:

1. Pre-calculate 0-indexed character offsets (`startOffset`, `endOffset`) bounding each section in the topic body during compilation.
2. Omit the `content` property from `outline` items in the serialized static catalog `GUIDES_CATALOG`.
3. Provide $O(1)$ dynamic slicing at runtime when section content is needed for search indexing (`MiniSearchGuideEngineAdapter`) or targeted section queries (`GetGuideSectionQuery`).

## Approach and Architecture

### 1. Build-Time Compilation (`scripts/bundle-guides.ts`)

During `compileGuide(filePath, content)`:

- When extracting sections from `cleanBody`:
  - Compute line boundaries `startLine` and `endLine` as before.
  - Calculate `startOffset` as the exact character index in `cleanBody` where the section heading line starts.
  - Calculate `endOffset` as the character index in `cleanBody` at the conclusion of `endLine` (inclusive of all body text and nested sub-sections up to the next heading of equal or shallower depth, or end of document).
- When serializing `GUIDES_CATALOG`:
  - In `outline` items, serialize `{ index, heading, level, startLine, endLine, lines, startOffset, endOffset }`.
  - Omit `content` property from the generated catalog items.

### 2. Domain Models (`src/domain/models/guide-section.ts`)

Update `GuideSection` interface:

```ts
export interface GuideSection {
  readonly index: number
  readonly heading: string
  readonly level: number
  readonly startLine: number
  readonly endLine: number
  readonly lines: number
  readonly startOffset: number
  readonly endOffset: number
  readonly content?: string
}
```

### 3. Application Layer (`src/application/queries/get-guide-section-query.ts`)

In `GetGuideSectionQuery.execute(input)`:

- Resolve the target `GuideSection` from `guide.outline` via section index or heading/slug match.
- Return a `GuideSection` with `content` populated on demand:

```ts
const sectionContent = guide.content.slice(found.startOffset, found.endOffset)
return {
  ...found,
  content: sectionContent,
}
```

### 4. Infrastructure Layer (`src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`)

In `MiniSearchGuideEngineAdapter.ensureIndex()`:

- When constructing `SectionDocument` records for MiniSearch:

```ts
for (const section of guide.outline) {
  const sectionContent = guide.content.slice(section.startOffset, section.endOffset)
  const doc: SectionDocument = {
    id: `${guide.topic}#${section.index}`,
    topic: guide.topic,
    title: guide.title,
    heading: section.heading,
    sectionIndex: section.index,
    level: section.level,
    startLine: section.startLine,
    endLine: section.endLine,
    content: sectionContent,
  }
  docs.push(doc)
  this.documents.set(doc.id, doc)
}
```

## Affected Areas and File Inventory

| File                                                                            | Purpose of Change                                                                                                |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/guide/src/domain/models/guide-section.ts`                             | Add `startOffset` and `endOffset` to `GuideSection` interface. Make `content` optional or dynamically populated. |
| `packages/guide/scripts/bundle-guides.ts`                                       | Calculate `startOffset` / `endOffset` in `extractSections`, omit `content` in emitted outline items.             |
| `packages/guide/src/application/queries/get-guide-section-query.ts`             | Populate `content` on the fly using `guide.content.slice(section.startOffset, section.endOffset)`.               |
| `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts` | Slice section content dynamically during MiniSearch indexing.                                                    |
| `packages/guide/src/infrastructure/generated/guides.ts`                         | Regenerated static catalog reflecting reduced bundle size (~250-300 KB).                                         |
| `packages/guide/test/**/*.spec.ts`                                              | Update or add unit and integration test assertions verifying offset calculations, section slicing, and search.   |

## Impact / Blast Radius

- **Dependency Risk**: LOW. Changes are internal to `@specd/guide`. The public interface of `getGuideSection()` continues returning `GuideSection` with full `content` populated.
- **Performance Impact**: POSITIVE. Bundle size reduced by ~75% (~1.3 MB to ~300 KB). Runtime memory usage reduced. Section slicing is $O(1)$ substring operation with no runtime regex parsing.

## Testing Strategy

1. **Unit Tests (`test/domain/models/guide-section.spec.ts` & `test/scripts/bundle-guides.spec.ts`)**:
   - Verify `extractSections` computes exact `startOffset` and `endOffset` character spans.
   - Verify `cleanBody.slice(section.startOffset, section.endOffset)` matches expected section content across single-line, multi-line, nested headings, and final document sections.
2. **Application Tests (`test/application/queries/get-guide-section-query.spec.ts`)**:
   - Verify `execute()` returns `GuideSection` with `content` dynamically populated from parent guide body.
   - Verify numeric index, slug, and heading lookups.
3. **Integration Tests (`test/infrastructure/adapters/minisearch-guide-engine-adapter.spec.ts`)**:
   - Verify MiniSearch indexes sections correctly using sliced content and produces accurate search hits with snippets.
4. **End-to-End / CLI Tests (`packages/cli/test/commands/guide.spec.ts`)**:
   - Verify CLI commands (`specd guide`, `specd guide <topic> --section <sec>`, `specd guide search <query>`) function seamlessly.

## Documentation and Global Rules Compliance

- Follows Hexagonal Architecture (Domain $\leftarrow$ Application $\leftarrow$ Infrastructure/Composition).
- TypeScript strictness, ESM imports with `.js` extensions, JSDoc for all public types and functions.
- All tests use Vitest and BDD `given/when/then` structure.

## Open Questions

None.
