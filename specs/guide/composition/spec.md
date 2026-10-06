# Guide Composition

## Purpose

Consumers of `@specd/guide` (such as `@specd/cli` or `@specd/mcp`) should not need to instantiate individual repositories, adapters, or queries manually. The composition layer provides a unified facade and factory function `createGuideEngine()` that wires internal components together, manages initialization, and exposes a clean, strongly typed public API.

## Requirements

### Requirement: GuideEngine Facade Interface

The composition layer MUST define the `GuideEngine` interface exposing all application operations:

- `listGuides(options?: ListGuidesOptions): Promise<GuideListingResult>`: Returns a structured page of collection-aware guide summaries.
- `getCollections(): Promise<readonly GuideCollection[]>`: Returns the catalog collection descriptors.
- `getGuide(topic: string): Promise<GuideTopic>`.
- `getGuideOutline(topic: string): Promise<GuideOutline>`.
- `getGuideSection(topic: string, section: string | number): Promise<GuideSection>`.
- `sliceGuideLines(content: string, startLine?: number, lineCount?: number): string`.
- `formatWithLineNumbers(content: string, startLine?: number): string`.
- `searchGuides(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>`.

The facade MUST re-export the listing input and result types required by its methods. It MUST preserve the application layer's collection-qualified topic identity and pagination semantics without flattening the result into an array.

### Requirement: createGuideEngine Factory Function

The composition layer MUST export the factory function `createGuideEngine(options?: GuideEngineOptions): GuideEngine`:

- Assembles the `PrebundledGuideCatalogAdapter` as the default catalog port. The default catalog MUST be the user guide collection, so that existing consumers of the default factory are unaffected by the SDK collection.
- Assembles the `MiniSearchGuideEngineAdapter` as the default search port.
- Instantiates and wires all application queries (`ListGuidesQuery`, `GetGuideQuery`, `GetGuideOutlineQuery`, `GetGuideSectionQuery`, `SearchGuidesQuery`).
- Returns the assembled `GuideEngine` implementation.
- When a caller supplies a catalog port through `GuideEngineOptions`, that port MUST take precedence over the default catalog for every query.

The composition layer MUST additionally export a factory for the SDK collection that:

- Assembles the SDK collection's generated catalog as the catalog port and the same `MiniSearchGuideEngineAdapter` as the search port.
- Wires the same application queries as `createGuideEngine()`.
- Returns a `GuideEngine` implementation that resolves topics within the SDK collection only.
- Is reachable exclusively through a dedicated package subpath, so that the SDK collection is not loaded by consumers of the main entry point.

### Requirement: Public API Export Surface

`src/public.ts` MUST export the curated public facade:

- Factory function `createGuideEngine`.
- Facade interface `GuideEngine`.
- Domain entity and value object types (`GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, `GuideSummary`).
- Search options type `GuideSearchOptions`, engine factory options type `GuideEngineOptions`, and listing types `ListGuidesOptions`, `GuideListingResult`, `GuideListScope`, and `GuidePagination`.
- Base error class `SpecdGuideError` and typed error classes (`GuideTopicNotFoundError`, `GuideSectionNotFoundError`, `GuideSectionAmbiguousError`).
- Standalone utility functions exported for host use (`sliceGuideLines`, `formatWithLineNumbers`).

The two root barrels MUST have distinct roles:

- `src/public.ts` is the curated barrel and is the target of the package's main export (`.`).
- `src/index.ts` is the broader internal barrel and is the target of the package's `./internal` export. It MAY additionally export application and infrastructure implementation symbols, including driven port types, and MUST NOT be presented as the curated public surface.

The SDK collection factory and the SDK collection's generated catalog MUST NOT be exported from either root barrel. They MUST be exported only from a dedicated subpath (`./sdk`) whose build entry is separate from the main entry, so that the SDK collection is not parsed by consumers who only use the user guide.

## Constraints

- Encapsulates all wiring; consumers interact strictly through the `GuideEngine` interface and domain types.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package layout and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — domain entity definitions
- [`guide:errors`](../errors/spec.md) — error classes
- [`guide:list-guides`](../list-guides/spec.md) — list guides query
- [`guide:get-guide`](../get-guide/spec.md) — get guide query
- [`guide:get-guide-outline`](../get-guide-outline/spec.md) — get guide outline query
- [`guide:slice-guide-content`](../slice-guide-content/spec.md) — section extraction and line slicing queries
- [`guide:search-guides`](../search-guides/spec.md) — search query
