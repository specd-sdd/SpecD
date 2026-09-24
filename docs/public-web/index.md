# @specd/public-web

`@specd/public-web` is the documentation and marketing website for SpecD, built with [Docusaurus](https://docusaurus.io/). It serves the curated documentation from `docs/`, the project landing page, and automatically generated TypeScript API reference documentation.

## Architecture

The website lives in `apps/public-web` and is configured as a deployable application workspace:

- **Landing page (`src/pages/index.tsx`)**: Presentation-first homepage introducing SpecD, core value propositions, and quick links.
- **Documentation (`docs/`)**: Authored guides, CLI references, and package architecture docs are sourced directly from the repository's root `docs/` directory.
- **API reference (`.generated/api/`)**: TypeDoc generates markdown documentation for `@specd/sdk`, `@specd/core`, and `@specd/code-graph` before static compilation.

## Running Locally

### Development Mode

To start the Docusaurus development server from the repository root:

```bash
pnpm web:dev
```

The dev server starts at `http://localhost:3000`.

> [!NOTE]
> Development mode intentionally skips the full API reference generation step so the dev server starts instantly without watching large generated markdown trees.

Key routes:

- `/` — Homepage landing page
- `/docs` — User guides, CLI reference, and package documentation
- `/api` — TypeScript API reference (available in production builds)

### Production Build & Preview

To generate the full API reference and compile the production static build:

```bash
pnpm web:build
```

To preview the compiled static build locally:

```bash
pnpm --filter @specd/public-web serve
```

## Configuration & Exclusions

Site configuration lives in `apps/public-web/src/lib/public-docs-config.ts` and `apps/public-web/docusaurus.config.ts`:

- **Exclusions (`publicDocsExclude`)**: Internal Architecture Decision Records (`docs/adr/`) are excluded from public site navigation and build output.
- **API Package Entrypoints (`apiPackageEntryPoints`)**: Curated list of package barrels (`@specd/sdk`, `@specd/core`, `@specd/code-graph`) processed by TypeDoc.
- **Sidebars**: `sidebars.ts` manages documentation hierarchy, while `api-sidebars.ts` manages generated API symbol navigation.
