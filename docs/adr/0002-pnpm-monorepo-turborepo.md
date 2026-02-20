# ADR-0002: pnpm Workspaces + Turborepo

## Status

Accepted

## Context

specd ships multiple packages that must be versioned and published independently (`@specd/core`, `@specd/cli`, `@specd/plugin-*`, etc.) but developed together with shared tooling and cross-package type safety. A single package would couple all concerns; a multi-repo setup would make cross-package changes painful.

## Decision

Use pnpm workspaces for package management and Turborepo for build orchestration. pnpm handles dependency hoisting, workspace linking (`workspace:*`), and lockfile integrity. Turborepo provides cached, parallel task execution with correct dependency ordering across packages (`build` depends on `^build`).

## Consequences

- Each package builds independently and can be published at its own version
- Cross-package TypeScript references are resolved via workspace symlinks
- Turborepo cache prevents redundant rebuilds — only changed packages and their dependents rebuild
- `turbo.json` must be kept up to date as new tasks are added
- pnpm version is pinned via `packageManager` field in root `package.json`

## Spec

- [`specs/_global/conventions/spec.md`](../../specs/_global/conventions/spec.md)
