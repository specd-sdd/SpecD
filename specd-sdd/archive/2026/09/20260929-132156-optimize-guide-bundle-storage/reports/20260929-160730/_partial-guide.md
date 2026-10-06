# Compliance Audit Partial Report: guide

Scope:

- `guide:bundle-guides`
- `guide:guide-model`
- `guide:slice-guide-content`
- `guide:search-guides`

## 1. Requirements Summary & Implementation Status

### Spec: `guide:bundle-guides`

- **Build-Time Compilation Script**: Implemented in `packages/guide/scripts/bundle-guides.ts`. Tested in `packages/guide/test/unit/infrastructure/bundle.test.ts`. Status: COMPLIANT.
- **Mandatory Frontmatter Validation**: Implemented in `parseFrontmatter` in `packages/guide/scripts/bundle-guides.ts`. Tested in `packages/guide/test/unit/infrastructure/bundle.test.ts`. Status: COMPLIANT.
- **Heading and Line Range Extraction**: Implemented in `extractSections` in `packages/guide/scripts/bundle-guides.ts`. Computes 1-indexed `startLine`, `endLine`, `lines`, and 0-indexed `startOffset`, `endOffset`. Tested in `packages/guide/test/unit/infrastructure/bundle.test.ts`. Status: COMPLIANT.
- **Static Catalog Artifact Generation**: Emitted at `src/infrastructure/generated/guides.ts` without serializing duplicate section content in outline arrays. Tested in `packages/guide/test/unit/infrastructure/bundle.test.ts`. Status: COMPLIANT.

### Spec: `guide:guide-model`

- **GuideTopic Entity**: Implemented in `packages/guide/src/domain/models/guide-topic.ts`. Tested in `packages/guide/test/unit/domain/models.test.ts`. Status: COMPLIANT.
- **GuideSection Value Object**: Implemented in `packages/guide/src/domain/models/guide-section.ts` with `startOffset`, `endOffset`, and optional `content`. Tested in `packages/guide/test/unit/domain/models.test.ts`. Status: COMPLIANT.
- **GuideSummary, GuideOutline, GuideSearchHit Value Objects**: Implemented in `packages/guide/src/domain/models/`. Tested in `packages/guide/test/unit/domain/models.test.ts`. Status: COMPLIANT.

### Spec: `guide:slice-guide-content`

- **GetGuideSectionQuery Implementation**: Implemented in `packages/guide/src/application/queries/get-guide-section-query.ts`. Populates `content` dynamically on demand via `guide.content.slice(startOffset, endOffset)` with line-slice fallback. Tested in `packages/guide/test/unit/application/queries.test.ts` and `packages/guide/test/integration/guide-engine.test.ts`. Status: COMPLIANT.
- **SliceGuideLinesQuery Implementation**: Implemented in `packages/guide/src/application/queries/slice-guide-lines.ts`. Tested in `packages/guide/test/unit/application/slicing.test.ts`. Status: COMPLIANT.
- **Line Number Formatting Utility**: Implemented in `packages/guide/src/application/queries/slice-guide-lines.ts`. Tested in `packages/guide/test/unit/application/slicing.test.ts`. Status: COMPLIANT.

### Spec: `guide:search-guides`

- **GuideSearchPort Contract**: Declared in `packages/guide/src/application/ports/guide-search-port.ts`. Status: COMPLIANT.
- **In-Memory Search Engine Adapter**: Implemented in `packages/guide/src/infrastructure/adapters/minisearch-guide-engine-adapter.ts`. Slices section content dynamically on the fly during MiniSearch indexing. Tested in `packages/guide/test/unit/infrastructure/search.test.ts`. Status: COMPLIANT.
- **Contextual Snippet and Read Command Generation**: Implemented in `minisearch-guide-engine-adapter.ts`. Tested in `packages/guide/test/unit/infrastructure/search.test.ts`. Status: COMPLIANT.
- **SearchGuidesQuery Implementation**: Implemented in `packages/guide/src/application/queries/search-guides-query.ts`. Tested in `packages/guide/test/unit/application/queries.test.ts`. Status: COMPLIANT.

## 2. Discrepancies & Drift

- None detected. Implementation, domain models, tests, and specs are 100% aligned.

## 3. Test Coverage Assessment

- Total tests executed: 59 in `@specd/guide`, 1013 in `@specd/cli`.
- Pass rate: 100%.
- Every scenario across all 4 specs has active automated test coverage.

## 4. Spec Dependency Chain & Global Rules

- Hexagonal architecture: pure domain models, ports in application, infrastructure adapters isolated.
- Global conventions: strict TypeScript, ESM module imports, JSDoc on public functions, error hierarchies extending SpecdGuideError.
- All dependencies registered and conformant.
