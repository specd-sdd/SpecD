# Guide Composition

## Purpose

Consumers of `@specd/guide` (such as `@specd/cli` or `@specd/mcp`) should not need to instantiate individual repositories, adapters, or queries manually. The composition layer provides a unified facade and factory function `createGuideEngine()` that wires internal components together, manages initialization, and exposes a clean, strongly typed public API.

## Requirements

### Requirement: GuideEngine Facade Interface

The composition layer MUST define the `GuideEngine` interface exposing all application operations:

- `listGuides(): Promise<readonly GuideSummary[]>`
- `getGuide(topic: string): Promise<GuideTopic>`
- `getGuideOutline(topic: string): Promise<GuideOutline>`
- `getGuideSection(topic: string, section: string | number): Promise<GuideSection>`
- `sliceGuideLines(content: string, startLine?: number, lineCount?: number): string`
- `formatWithLineNumbers(content: string, startLine?: number): string`
- `searchGuides(query: string, options?: GuideSearchOptions): Promise<readonly GuideSearchHit[]>`

### Requirement: createGuideEngine Factory Function

The composition layer MUST export the factory function `createGuideEngine(options?: GuideEngineOptions): GuideEngine`:

- Assembles the `PrebundledGuideCatalogAdapter` as the default catalog port.
- Assembles the `MiniSearchGuideEngineAdapter` as the default search port.
- Instantiates and wires all application queries (`ListGuidesQuery`, `GetGuideQuery`, `GetGuideOutlineQuery`, `GetGuideSectionQuery`, `SearchGuidesQuery`).
- Returns the assembled `GuideEngine` implementation.

### Requirement: Public API Export Surface

`src/index.ts` and `src/public.ts` MUST export:

- Factory function `createGuideEngine`.
- Facade interface `GuideEngine`.
- Domain entity and value object types (`GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, `GuideSummary`).
- Search options type `GuideSearchOptions`.
- Typed error classes (`GuideTopicNotFoundError`, `GuideSectionNotFoundError`).

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
