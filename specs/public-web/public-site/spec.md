# Public Site

## Purpose

`specd` needs a public-facing website that explains the project clearly to new users and gives them a guided entry point into the documentation. This spec defines the public site itself: the presentation homepage, the public documentation information architecture, and the rules for what content is and is not exposed on that site.

## Requirements

### Requirement: Public landing page

The public site MUST provide a presentation-focused landing page at the site root that explains what `specd` is, what problem it solves, and how a user gets started. The landing page MUST not behave like a default documentation index and MUST include clear navigation to documentation and to the project's public repository presence.

### Requirement: Public documentation section

The public site MUST provide a documentation section under a dedicated docs route that presents curated public documentation for `specd`. That section MUST cover onboarding and usage content needed by users of the project, including getting started, configuration, workflow, CLI usage, and selected core concepts that are useful to public consumers.

### Requirement: ADR exclusion

The public site MUST exclude repository ADR content from the public documentation information architecture. ADR files may remain in the repository for contributor and maintainer use, but they MUST NOT appear in the public site's primary navigation, generated sidebar structure, or public documentation routes.

### Requirement: Documentation source of truth

Authored project documentation MUST remain under the repository-level `docs/` tree. The public site MAY transform, select, or render that documentation for presentation, but it MUST NOT introduce a second handwritten source of truth for the same public documentation content under the app workspace.

### Requirement: Public site workspace

The public site MUST live in the `public-web` workspace with implementation code under `apps/public-web`. The workspace MUST be treated as an owned deployable app rather than as a reusable library package.

### Requirement: Framework-required entrypoint exceptions

The public site MUST follow the repository's normal TypeScript and export conventions except where the selected site framework requires a specific module shape for owned entrypoints. When Docusaurus requires a `default export` for a route, page, or framework-owned config entrypoint, that exception MAY be used only in the minimum set of files needed to satisfy the framework. All other `public-web` modules MUST continue to prefer named exports.

## Constraints

- The public site must not publish ADR content
- The public site must preserve `docs/` as the authored source of truth for public documentation
- The public site must live under `apps/public-web`
- Framework-mandated `default export` usage must be limited to Docusaurus-required entrypoints

## Spec Dependencies

- `default:_global/docs` — authored documentation must remain under the repository `docs/` tree
