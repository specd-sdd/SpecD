# Get Guide Query

## Purpose

When a user or agent requests a specific documentation topic (e.g. `specd guide workflow` or `specd guide schemas`), `@specd/guide` provides a query to fetch the complete guide entity. This spec defines the `GetGuideQuery` application use case and its typed error handling when an unknown topic is requested.

## Requirements

### Requirement: GetGuideQuery Implementation

The application layer MUST implement `GetGuideQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST retrieve a guide by its topic identifier through the catalog port.
- When the catalog port exposes more than one collection, topics MUST be addressed as `collection:topic`. The query MUST pass a qualified composite key to the catalog port unmodified, so that a topic containing `:` resolves within its collection rather than being split or slugified.
- When the catalog port exposes exactly one collection, the query MUST accept an unqualified topic as a backwards-compatible shorthand and resolve it only within that collection. This shorthand MUST NOT select or redirect to another collection.
- Topic normalization MUST consist of, in order: trimming surrounding whitespace, stripping a single trailing `.md` extension, and lowercasing. No other transformation (such as slugification or prefix matching) MUST be applied.
- The query MUST reject an empty or whitespace-only topic before delegating to the catalog port, and MUST throw `GuideTopicNotFoundError` with the untrimmed input as the requested topic.
- The query MUST extract and return sections and section content on demand from the guide's `outline` spans rather than from eagerly serialized copies.

The query MUST resolve only topics within the collection served by its catalog port.

### Requirement: Topic Not Found Handling

When a topic cannot be resolved, the query MUST throw `GuideTopicNotFoundError`:

- The error MUST carry the requested topic as supplied, and a list of available topics.
- The query MUST perform direct lookup through the catalog port before it enumerates candidate topics.
- After a direct lookup misses, the query MAY enumerate the in-memory catalog solely to populate the structured error payload; this enumeration MUST NOT resolve or redirect the requested topic.
- The error MUST surface the collection-qualified form of each available topic, so that a caller receiving the alternatives can address them directly.
- For a qualified miss, ordinary available-topic candidates MUST remain scoped to the requested collection and MUST NOT contain sibling-collection suggestions. If no title-equivalent topic exists there, the structured payload MAY identify title-equivalent topics from sibling collections only as explicit cross-collection suggestions.

## Constraints

- Pure application query depending only on `GuideCatalogPort` and domain models/errors.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideTopic entity definition
- [`guide:errors`](../errors/spec.md) — GuideTopicNotFoundError definition
