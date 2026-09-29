# SpecD Public Website (`@specd/public-web`)

This package contains the public documentation and marketing website for SpecD, built with [Docusaurus](https://docusaurus.io/). It combines the curated documentation suite under `docs/`, project showcase pages, and automatically generated TypeScript API reference docs for `@specd/core`, `@specd/sdk`, and `@specd/code-graph`.

## Development

To run the site in development mode from the repository root:

```bash
pnpm web:dev
```

The Docusaurus dev server starts at `http://localhost:3000`. Development mode intentionally skips the full API documentation generation so the dev server starts quickly.

Key routes to check:

- `/` — Homepage landing page
- `/docs` — User guides, CLI reference, and architecture documentation
- `/api` — Generated package API reference (compiled in build/production mode)

## Production Build & Preview

To build the static production site and preview locally:

```bash
pnpm web:build
pnpm --filter @specd/public-web serve
```

The build script automatically runs `pnpm generate:api` using TypeDoc before compiling the Docusaurus bundle to static HTML and assets in `build/`.
