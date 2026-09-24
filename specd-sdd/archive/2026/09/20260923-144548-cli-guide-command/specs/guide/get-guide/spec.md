# Get Guide Query

## Purpose

When a user or agent requests a specific documentation topic (e.g. `specd guide workflow` or `specd guide schemas`), `@specd/guide` provides a query to fetch the complete guide entity. This spec defines the `GetGuideQuery` application use case and its typed error handling when an unknown topic is requested.

## Requirements

### Requirement: GetGuideQuery Implementation

The application layer MUST implement `GetGuideQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST accept a `topic: string` identifier. Topic lookup MUST be case-insensitive.
- If the requested topic exists, the query MUST return the complete `GuideTopic` entity including its title, description, content, and section outline.

### Requirement: Topic Not Found Handling

If the requested topic does not exist in the catalog:

- The query MUST retrieve all available topic IDs from the catalog port.
- The query MUST throw a `GuideTopicNotFoundError` containing the attempted topic identifier and the complete array of available topic identifiers.

## Constraints

- Pure application query depending only on `GuideCatalogPort` and domain models/errors.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideTopic entity definition
- [`guide:errors`](../errors/spec.md) — GuideTopicNotFoundError definition
