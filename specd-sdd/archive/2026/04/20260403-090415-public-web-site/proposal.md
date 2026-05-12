# Proposal: public-web-site

## Motivation

`specd` does not currently have a public web presence that explains the project clearly to new users while also serving canonical public documentation. A dedicated public site is needed now to present the project more effectively, make onboarding easier, and provide a single place for docs and API reference.

## Current behaviour

Today the project documentation lives only in the repository under `docs/`, and there is no public-facing application that presents `specd` as a product. The current materials are useful for contributors, but there is no polished landing page, no curated public docs site, and no integrated public API reference. ADRs also live alongside other docs, which is useful internally but not appropriate for the public website.

## Proposed solution

Create a new public web app in the `public-web` workspace using Docusaurus. The site will provide a presentation-focused homepage at `/`, curated public documentation at `/docs`, and generated API reference at `/api`. The public site will intentionally exclude ADRs and will focus on the parts of the project that help users understand, evaluate, and adopt `specd`.

## Specs affected

### New specs

- `public-web:public-site`: Define the public-facing website, including the landing page, public docs information architecture, public navigation, and the exclusion of ADR content from the public site.
  - Depends on: `default:_global/docs`

- `public-web:api-reference`: Define how public API reference content is generated and published inside the public website.
  - Depends on: `public-web:public-site`, `default:_global/docs`

### Modified specs

None.

## Impact

- New workspace implementation under `apps/public-web`
- New specs under `specs/public-web`
- Public docs sourcing from existing repository content under `docs/guide`, `docs/config`, `docs/cli`, and selected `docs/core` pages
- Generated API reference expected to start from the public package surface in `packages/core`
- New workspace-level scripts, build wiring, and static-site output for the public website

## Technical context

The preferred implementation direction already discussed is a deployable app in `apps/public-web`, not a library package under `packages/`. The workspace `public-web` has already been added to `specd.yaml` with `ownership: owned` and `codeRoot: apps/public-web`, so the change can now introduce `public-web:*` specs cleanly.

Docusaurus was chosen as the expected site framework because it supports a custom homepage, documentation sections, and generated technical reference in a single static site. The public home must not look like a default documentation index; it should behave as a presentation page for the project and include the expected project links such as GitHub. ADRs are explicitly out of scope for the public site.

The current documentation tree contains material that can be adapted for public consumption, especially under `docs/guide`, `docs/config`, `docs/cli`, and `docs/core`. The public site should curate and present that material rather than exposing the repository documentation structure wholesale.

## Open questions

None at proposal stage.
