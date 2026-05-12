# Tasks: public-web-site

## 1. Monorepo wiring

- [x] 1.1 Register the app workspace in repo tooling
      `pnpm-workspace.yaml`, `package.json`: workspace globs and root scripts — make `apps/public-web` a first-class workspace and expose `web` scripts from the root.
      Approach: add `apps/*` to `pnpm-workspace.yaml`; add root convenience scripts and extend the root `test` flow so `@specd/public-web` participates once app tests exist.
      (Req: Public site workspace, Initial API coverage)

- [x] 1.2 Align turbo outputs and ignored generated files
      `turbo.json`, `.gitignore`: build outputs and generated artifacts — make Docusaurus `build/**`, `.docusaurus/`, and generated API docs fit the repo toolchain cleanly.
      Approach: extend `turbo` build outputs beyond `dist/**` and ignore app-local generated output instead of committing derived site artifacts.
      (Req: Public site workspace, Generated API content)

- [x] 1.3 Extend lint coverage to the app and constrain framework exceptions
      `eslint.config.js`: app lint rules — lint `apps/*/src/**/*.{ts,tsx}` and allow framework-required `default export` usage only for Docusaurus-owned entrypoints.
      Approach: mirror the existing source-file rule set for apps, add TSX coverage, and implement a narrow file-based exception rather than weakening the rule globally.
      (Req: Framework-required entrypoint exceptions)

## 2. Public site app

- [x] 2.1 Scaffold the public-web package and local config
      `apps/public-web/package.json`, `apps/public-web/tsconfig.json`: workspace package metadata and TypeScript config — establish `@specd/public-web` as a unique package and resolve the graph/package-identity collision.
      Approach: create a private ESM workspace package with `dev`, `build`, `serve`, `typecheck`, `test`, and `generate:api` scripts; extend the root TypeScript base with React JSX enabled.
      (Req: Public site workspace)

- [x] 2.2 Configure Docusaurus to mount curated public docs
      `apps/public-web/docusaurus.config.ts`, `apps/public-web/sidebars.ts`, `apps/public-web/src/lib/public-docs-config.ts`: site config and docs curation — route `/docs` to the repository `docs/` tree while excluding ADR content.
      Approach: point the docs plugin at `../../docs`, store exclude globs and shared paths in `public-docs-config.ts`, and define explicit sidebar curation instead of copying docs into the app.
      (Req: Public documentation section, ADR exclusion, Documentation source of truth)

- [x] 2.3 Implement the presentation homepage
      `apps/public-web/src/pages/index.tsx`, `apps/public-web/src/components/landing-page.tsx`, `apps/public-web/src/components/home-hero.tsx`, `apps/public-web/src/components/home-features.tsx`, `apps/public-web/src/css/custom.css`: homepage route and visual sections — make `/` behave as a project presentation page.
      Approach: keep `src/pages/index.tsx` as a thin framework entrypoint with the required `default export`, move all reusable rendering into named components, and style the page so it is clearly not a stock docs index.
      (Req: Public landing page, Framework-required entrypoint exceptions)

- [x] 2.4 Consolidate the site to a single dark theme
      `apps/public-web/src/css/custom.css`, `apps/public-web/src/components/landing-page.tsx`, `apps/public-web/src/components/home-hero.tsx`: theme tokens and homepage presentation — remove the residual day-theme branch and rebalance contrast so docs chrome and landing surfaces stay readable with the IDE-style palette.
      Approach: treat the dark editor palette as the only supported visual mode, delete light-theme token overrides instead of trying to keep both in sync, and tune shared navbar/sidebar/content colors against the same dark surface scale.
      (Req: Public landing page, Public-site integration)

## 3. API reference integration

- [x] 3.1 Define generated API input/output configuration
      `apps/public-web/src/lib/public-docs-config.ts`, `apps/public-web/typedoc.json`: API source selection — lock the initial API input to `../../packages/core/src/index.ts` and target a derived output directory.
      Approach: keep the entrypoint list in shared config, feed it into TypeDoc markdown generation, and write generated output into `apps/public-web/.generated/api`.
      (Req: Generated API content, Initial API coverage)

- [x] 3.2 Add the API generation pipeline and mount it in the site
      `apps/public-web/scripts/generate-api-docs.mjs`, `apps/public-web/docusaurus.config.ts`, `apps/public-web/sidebars.ts`: generated `/api` section — generate API markdown before each build and expose it as a site-integrated section.
      Approach: make the build script run API generation before `docusaurus build`, mount `.generated/api` as a second docs instance, and give it an integrated sidebar and route base path.
      (Req: Public API reference section, Public-site integration, Generated API content)

## 4. Tests and verification

- [x] 4.1 Add app-local Vitest configuration and docs/API config tests
      `apps/public-web/vitest.config.ts`, `apps/public-web/test/lib/public-docs-config.spec.ts`, `apps/public-web/test/lib/api-generation.spec.ts`: configuration coverage — verify ADR exclusion, docs source path, generated API output path, and initial API package coverage.
      Approach: test the shared config module directly so docs selection and API generation rules stay stable without requiring a full site build in every test.
      (Req: Public documentation section, ADR exclusion, Documentation source of truth, Generated API content, Initial API coverage)

- [x] 4.2 Add homepage rendering coverage
      `apps/public-web/test/components/landing-page.spec.tsx`: landing page behaviour — verify the homepage exposes presentation content and primary routes such as docs and GitHub.
      Approach: use Vitest with jsdom and React Testing Library to render `LandingPage` directly, avoiding snapshot tests and keeping assertions explicit.
      (Req: Public landing page)

- [x] 4.3 Run end-to-end verification commands and adjust docs inputs only if required
      `apps/public-web` build/dev flow, root `docs/` files if needed: final verification — confirm the built site serves `/`, `/docs`, and `/api` correctly without ADR publication.
      Approach: run `pnpm --filter @specd/public-web build`, `pnpm --filter @specd/public-web dev`, `pnpm lint`, and `pnpm test`; if Docusaurus ingestion needs metadata changes, apply them in the repository `docs/` tree rather than creating an app-local handwritten docs copy.
      (Req: Public landing page, Public documentation section, ADR exclusion, Documentation source of truth, Public API reference section, Public-site integration)

- [x] 4.4 Re-run visual verification after the dark-only cleanup
      `apps/public-web` dev/build preview: visual QA — confirm `/`, `/docs`, and shared navigation remain legible once light-mode styling is removed.
      Approach: check the landing page, docs sidebar/navbar, and content surfaces under the single dark palette in both `pnpm web:dev` and `pnpm --filter @specd/public-web serve`, and only adjust source docs metadata if Docusaurus rendering exposes new contrast problems.
      (Req: Public landing page, Public documentation section, Public-site integration)
