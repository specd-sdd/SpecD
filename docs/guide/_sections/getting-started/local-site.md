## Viewing the public site locally

This repository also ships a public website in `apps/public-web`. It combines a project landing page, the curated documentation under `docs/`, and generated API reference pages for `@specd/core`.

To run the site in development mode from the repository root:

```bash
pnpm web:dev
```

The Docusaurus dev server usually starts at `http://localhost:3000`.
Development mode intentionally skips the generated API section so the dev server does not watch the full API markdown tree.

Check these routes:

- `/` — the presentation homepage
- `/docs` — public guides and reference documentation
- `/api` — generated API reference in production preview builds

To build the static site and preview the production output instead:

```bash
pnpm web:build
pnpm --filter @specd/public-web serve
```

The build step regenerates the public API reference before compiling the site.
