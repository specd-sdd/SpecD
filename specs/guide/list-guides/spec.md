# List Guides Query

## Purpose

To enable consumers (such as CLI `specd guide` or MCP directory tools) to discover available documentation topics and present a concise summary table or JSON list, `@specd/guide` provides a dedicated listing query. This spec defines the `ListGuidesQuery` application use case and its interaction with the guide catalog port.

## Requirements

### Requirement: GuideCatalogPort Contract

The application layer MUST declare a driven port `GuideCatalogPort` containing:

- `listGuides(): Promise<readonly GuideSummary[]>`: Returns summaries of all available guides in the catalog.
- `getAllGuides(): Promise<readonly GuideSummary[]>`: Returns summaries of all guides in the catalog, without filtering. This member MUST be declared; a port that declares only `listGuides` is non-conforming.
- `getCollections(): Promise<readonly GuideCollection[]>`: Returns the collection descriptors the catalog contains.
- `getAllTopics(): Promise<readonly GuideTopic[]>`: Returns the full topics in the catalog for consumers that require complete content.
- `getGuide(topic: string): Promise<GuideTopic | null>`: Retrieves a guide by its collection-qualified identity, or `null` if not found.

A catalog is the unit a port serves: a port MUST serve exactly one catalog, and MUST NOT merge topics across catalogs. A catalog MAY contain more than one collection, and every topic it exposes MUST carry its collection identity. Because topic identifiers are only unique within a collection, `getGuide` MUST receive the collection-qualified `collection:topic` form and MUST resolve within that collection.

### Requirement: ListGuidesQuery Implementation

The application layer MUST implement `ListGuidesQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST retrieve all guides from the catalog port using `getAllGuides()`.
- The query MUST return a `GuideListingResult`, not a bare array. Its `topics` field MUST contain the selected `GuideListedTopic` values; its `pagination` field MUST report `page`, `pageSize`, `returned`, `total`, and `totalPages`; and its `collections` field MUST report every selected collection's total and first/last page extent.
- The returned topics MUST be sorted first by `collection`, then in ascending numerical order by `order` (`sidebar_position`), then by `topic` using locale-sensitive comparison. Each topic MUST conform to `GuideSummary` and additionally report its 1-indexed `page` and `scope` (`'docs'` or `'api'`).

The query MUST accept optional `scope` and `pagination` controls. The scope MAY restrict by one collection/topic/collection-qualified topic or an array of values for any of those dimensions, and MAY restrict generated versus hand-written topics. For an array, a topic MUST be selected when it matches any requested value in that dimension; an empty scope selects every topic. Filtering MUST be applied before ordering, and pagination MUST bound the number of returned entries without altering their relative order.

A catalog whose collection contains a large volume of generated entries MUST remain listable without returning every generated entry by default: the query MUST support a scope that selects only the hand-written topics, so that a host can present a bounded default listing, and a scope that selects the generated entries explicitly. When a scope excludes generated topics, the result MUST report the excluded count in `withheld.generatedTopics`.

## Constraints

- Pure application query with zero infrastructure or framework dependencies.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideSummary value object definition
