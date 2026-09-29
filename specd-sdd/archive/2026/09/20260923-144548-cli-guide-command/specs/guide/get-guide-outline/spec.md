# Get Guide Outline Query

## Purpose

AI agents and automated tools need to inspect the structural layout of a guide (headings, depth levels, and line spans) without incurring the token cost of transmitting full document bodies. This spec defines the `GetGuideOutlineQuery` application use case, providing document metadata and the section outline array for a guide topic.

## Requirements

### Requirement: GetGuideOutlineQuery Implementation

The application layer MUST implement `GetGuideOutlineQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST accept a `topic: string` identifier.
- If the topic is not found, the query MUST throw a `GuideTopicNotFoundError`.
- The query MUST construct and return a `GuideOutline` value object containing:
  - `topic`: Canonical topic identifier.
  - `file`: Source Markdown filename (e.g. `<topic>.md`).
  - `lines`: Total line count of the document.
  - `bytes`: Total byte length of the raw content.
  - `sections`: Array of `GuideSection` items, each specifying `index` (1-indexed section position), `heading`, `level`, `startLine`, `endLine`, and `lines`.

## Constraints

- Pure application query depending only on `GuideCatalogPort` and domain models/errors.
- All section boundaries MUST use 1-indexed line numbers.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideOutline and GuideSection definitions
