# ADR-0002: pnpm Workspaces + Turborepo

## Status

Accepted — 2026-02-19

## Context and Problem Statement

specd ships multiple packages that must be versioned and published independently (`@specd/core`, `@specd/cli`, `@specd/plugin-*`, etc.) but developed together with shared tooling and cross-package type safety. A single package would couple all concerns; a multi-repo setup would make cross-package changes painful.

## Decision Drivers

- Each package must be independently versioned and publishable
- Cross-package TypeScript type safety must work without manual build steps during development
- Shared tooling (ESLint, TypeScript config, Vitest config) must be maintained in one place
- CI must rebuild only what changed to keep build times reasonable

## Considered Options

- Single package — all code in one `package.json`
- Multi-repo — separate git repositories per package
- pnpm workspaces + Turborepo — monorepo with workspace linking and cached task orchestration

## Decision Outcome

Chosen option: "pnpm workspaces + Turborepo", because it provides independent versioning and publishing while keeping cross-package development ergonomic via workspace symlinks and cached builds.

pnpm handles dependency hoisting, workspace linking (`workspace:*`), and lockfile integrity. Turborepo provides cached, parallel task execution with correct dependency ordering across packages (`build` depends on `^build`).

### Consequences

- Good: Each package builds independently and can be published at its own version
- Good: Cross-package TypeScript references are resolved via workspace symlinks
- Good: Turborepo cache prevents redundant rebuilds — only changed packages and their dependents rebuild
- Bad: `turbo.json` must be kept up to date as new tasks are added
- Bad: pnpm version must be pinned via `packageManager` field in root `package.json` to prevent lockfile drift

### Confirmation

`pnpm install --frozen-lockfile` in CI verifies lockfile integrity. Turborepo task graph is validated by running `turbo build` from root — incorrect dependency ordering causes build failures.

## Pros and Cons of the Options

### Single package

- Good: Zero workspace overhead
- Bad: All packages must be published together at the same version
- Bad: No clear boundary enforcement between packages

### Multi-repo

- Good: Complete autonomy per package
- Bad: Cross-package changes require coordinated PRs across multiple repositories
- Bad: No shared tooling — each repo duplicates ESLint/TypeScript/Vitest configuration

### pnpm workspaces + Turborepo

- Good: Independent versioning with a single development checkout
- Good: Workspace symlinks give live cross-package type checking
- Good: Turborepo caching keeps CI fast as the package count grows
- Bad: Slightly more initial setup than a single-package repo

## Spec

- [`specs/_global/conventions/spec.md`](../../specs/_global/conventions/spec.md)
