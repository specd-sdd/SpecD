# Get Guide Outline Query

## Purpose

AI agents and automated tools need to inspect the structural layout of a guide (headings, depth levels, and line spans) without incurring the token cost of transmitting full document bodies. This spec defines the `GetGuideOutlineQuery` application use case, providing document metadata and the section outline array for a guide topic.

## Requirements

### Requirement: GetGuideOutlineQuery Implementation

The application layer MUST implement `GetGuideOutlineQuery`:

- The query interactor MUST receive an instance of `GuideCatalogPort`.
- The query MUST retrieve the guide from the catalog port using the same topic normalization and collection-qualified resolution as `GetGuideQuery`, and MUST propagate the errors that resolution raises rather than raising its own.
- The query MUST return a `GuideOutline` containing the document metadata (`collection`, `topic`, `file`, `lines`, `bytes`) and the section array WITHOUT serializing full section content.
- Every returned section record MUST omit its optional `content` field, even when the catalog port supplied section body content.
- `file` MUST be the real source path of the document relative to its collection root. The query MUST NOT synthesize the value from the topic identifier, and MUST NOT emit a bare `<topic>.md` filename. For a hand-written document this is the relative `.md` path (e.g. `ports.md`, `examples/implementing-a-port.md`); for a generated API topic this is the relative path of the TypeScript declaration the symbol was extracted from.
- Each returned section MUST expose the fields defined by the `GuideSection` value object, including `index`, `heading`, `level`, `startLine`, `endLine`, `lines`, `startOffset` and `endOffset`.
- A document with no headings MUST return an empty `sections` array, not `null` and not an error.

The query MUST resolve only topics within the collection served by its catalog port.

## Constraints

- Pure application query depending only on `GuideCatalogPort` and domain models/errors.
- All section boundaries MUST use 1-indexed line numbers.

## Spec Dependencies

- [`guide:conventions`](../conventions/spec.md) — package architecture and error conventions
- [`guide:guide-model`](../guide-model/spec.md) — GuideOutline and GuideSection definitions
