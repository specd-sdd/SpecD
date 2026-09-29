# List Guides Query

## Purpose

To enable consumers (such as CLI `specd guide` or MCP directory tools) to discover available documentation topics and present a concise summary table or JSON list, `@specd/guide` provides a dedicated listing query. This spec defines the `ListGuidesQuery` application use case and its interaction with the guide catalog port.

## Requirements

### Requirement: GuideCatalogPort Contract

The application layer MUST declare a driven port `GuideCatalogPort` containing:

- `listGuides(): Promise<readonly GuideSummary[]>`: Returns summaries of all available guides.
- `getGuide(topic: string): Promise<GuideTopic | null>`: Retrieves a guide by its unique topic ID, or `null` if not found.

### Requirement: ListGuidesQuery Implementation

The application layer MUST implement `ListGuidesQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST retrieve all guides from the catalog port.
- The returned list MUST be sorted in ascending numerical order by `order` (`sidebar_position`). If two guides share the same `order`, secondary sorting MUST be alphabetical by `topic`.
- Each element in the returned array MUST conform to the `GuideSummary` value object (`topic`, `title`, `description`, `order`, `lineCount`, `byteLength`).

## Constraints

- Pure application query with zero infrastructure or framework dependencies.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideSummary value object definition
