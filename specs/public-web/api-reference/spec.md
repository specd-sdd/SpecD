# API Reference

## Purpose

Public consumers of `specd` need a technical reference that explains the exported API surface without reading source code directly. This spec defines how API reference content is generated and exposed inside the public site so that technical documentation lives alongside the rest of the public web experience.

## Requirements

### Requirement: Public API reference section

The public site MUST provide a dedicated API reference section under a stable public route. The API reference MUST be part of the same website experience as the landing page and public documentation rather than a disconnected external site.

### Requirement: Generated API content

The API reference MUST be generated from package source or exported package surfaces rather than maintained as fully handwritten duplicate documentation. Generation inputs and output structure may be adapted for the public site, but the rendered reference must remain derived from the implementation-facing API source.

### Requirement: Initial API coverage

The initial API reference scope MUST cover the public surfaces selected for the first public website release. That initial scope MUST include the APIs exposed by `@specd/core`, and it MAY exclude packages whose public surface is not yet intended for public consumption.

### Requirement: Public-site integration

The generated API reference MUST integrate with the public site's navigation, styling, and information architecture. Users must be able to move between the landing page, public docs, and API reference without leaving the site.

## Constraints

- API reference content must be generated, not maintained as a separate handwritten duplicate of the exported API
- Initial coverage must include `@specd/core`
- API reference must be served inside the public site

## Spec Dependencies

- `public-web:public-web/public-site` — the API reference is a section within the public website
- `default:_global/docs` — generated reference content is part of the public documentation experience
