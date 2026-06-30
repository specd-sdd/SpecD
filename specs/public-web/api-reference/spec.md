# API Reference

## Purpose

Public consumers of `specd` need a technical reference that explains the exported API surface without reading source code directly. This spec defines how API reference content is generated and exposed inside the public site so that technical documentation lives alongside the rest of the public web experience.

## Requirements

### Requirement: Public API reference section

The public site MUST provide a dedicated API reference section under a stable public route. The API reference MUST be part of the same website experience as the landing page and public documentation rather than a disconnected external site.

### Requirement: Generated API content

The API reference MUST be generated from package source or exported package surfaces rather than maintained as fully handwritten duplicate documentation. Generation inputs and output structure may be adapted for the public site, but the rendered reference must remain derived from the implementation-facing API source.

### Requirement: Initial API coverage

The initial API reference scope MUST cover the curated public `"."` exports of `@specd/sdk`, `@specd/core`, and `@specd/code-graph`.

Generation MUST run one TypeDoc (or equivalent) pass per package public entry point:

- `@specd/sdk` — `packages/sdk/src/index.ts` (host integrator surface)
- `@specd/core` — `packages/core/src/public.ts` (curated core public barrel)
- `@specd/code-graph` — `packages/code-graph/src/public.ts` (curated graph public barrel)

Generated output MUST be partitioned under package-scoped directories (for example `.generated/api/sdk`, `.generated/api/core`, `.generated/api/code-graph`) so routes and navigation do not collide.

The API sidebar and landing copy MUST list packages in this order: `@specd/sdk`, then `@specd/core`, then `@specd/code-graph`. The landing page MUST state that host integrations import from `@specd/sdk` while the additional package sections document their public barrels for package-level discovery.

The reference MUST NOT include `@specd/core/ports`, `@specd/core/extensions`, `@specd/core/internal`, or `@specd/code-graph/internal` unless explicitly added in a later scope expansion.

### Requirement: Public-site integration

The generated API reference MUST integrate with the public site's navigation, styling, and information architecture. Users must be able to move between the landing page, public docs, and API reference without leaving the site.

## Constraints

- API reference content must be generated, not maintained as a separate handwritten duplicate of the exported API
- Initial coverage must use the curated public `"."` entry points for `@specd/sdk`, `@specd/core`, and `@specd/code-graph`
- API reference must be served inside the public site

## Spec Dependencies

- [`public-web:public-site`](../public-site/spec.md) — the API reference is a section within the public website
- [`default:_global/docs`](../../_global/docs/spec.md) — generated reference content is part of the public documentation experience
- [`sdk:composition`](../../../sdk/composition/spec.md) — defines the public SDK surface used as the primary generation input
- [`core:composition`](../../../core/composition/spec.md) — defines the curated `@specd/core` public barrel
- [`code-graph:composition`](../../../code-graph/composition/spec.md) — defines the curated `@specd/code-graph` public barrel
