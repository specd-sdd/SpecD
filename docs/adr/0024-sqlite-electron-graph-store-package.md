---
status: accepted
date: 2026-07-21
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0024: SQLite Electron Graph Store as a Separate Injectable Package

## Context and Problem Statement

Studio desktop needs a local code-graph SQLite backend rebuilt for Electron’s native ABI, while CLI and API continue to use Node’s built-in `sqlite` backend. An earlier approach packaged that path as `@specd/code-graph-electron`, a composition fork that re-exported provider wiring alongside vendored `better-sqlite3`.

After main introduced injectable `createSqliteGraphStoreFactory({ loadDatabaseModule })` and SDK nested `graph` options, forking composition became the wrong seam: hosts should select a store backend id and inject a factory, not import a parallel composition package.

The question is: where should Electron-targeted SQLite live, and how should desktop (and any future Electron host) wire it without forking `@specd/code-graph`?

## Decision Drivers

- **Composition purity** — `@specd/code-graph` remains the single composition facade; backends plug in via factories
- **Runtime isolation** — Electron native rebuild/vendor assets must not collide with Node CLI/API sqlite
- **Host lifecycle** — desktop and long-lived API hosts own provider open/reuse/stale-reopen; store packaging must not dictate that lifecycle
- **Non-destructive migration** — leave `@specd/code-graph-electron` in-tree unused rather than mash or delete mid-branch

## Considered Options

1. **Keep `@specd/code-graph-electron` as the desktop composition fork** — continue importing a parallel provider surface from desktop
2. **Mash Electron vendor assets into `@specd/code-graph`** — one package, dual native runtimes
3. **New injectable store package `@specd/code-graph-sqlite-electron`** — export only a `sqlite-electron` `GraphStoreFactory` built with `createSqliteGraphStoreFactory({ loadDatabaseModule })`; hosts wire via SDK `graphStoreId` + additive factories

## Decision Outcome

Chosen option: **"New injectable store package `@specd/code-graph-sqlite-electron`"**, because it matches the injectable store seam on main and keeps Electron packaging out of composition.

### The rule

- Backend id `sqlite-electron` is additive; builtin `sqlite` remains for Node hosts
- `@specd/code-graph-sqlite-electron` owns vendored/rebuild Electron SQLite assets and exports the factory only — it MUST NOT re-export code-graph composition
- Desktop constructs providers through `@specd/sdk` / `createCodeGraphProvider` with `graphStoreId: 'sqlite-electron'` and the package factory
- Desktop MUST NOT import `@specd/code-graph-electron` on this path; that package may remain in the repo unused until a later cleanup change
- Long-lived host provider lifecycle (open once, reuse, reopen on stale, close on teardown) is owned by the host (desktop/API), not by the store package

### Consequences

- Good, because Electron SQLite is a store adapter, not a second composition API
- Good, because CLI/API keep Node `sqlite` without Electron native rebuild coupling
- Good, because future Electron hosts reuse the same factory + backend id
- Neutral, because `@specd/code-graph-electron` stays temporarily unused until explicitly removed
- Bad, because two workspace packages briefly coexist until cleanup; docs and hosts must point only at sqlite-electron

### Confirmation

This decision is confirmed when:

- `@specd/code-graph-sqlite-electron` builds a working `sqlite-electron` factory over vendored Electron better-sqlite3
- `apps/specd-studio-desktop` wires SDK graph options to that factory and does not import `@specd/code-graph-electron` for local graph
- Specs `code-graph-sqlite-electron:sqlite-electron-store` and studio-desktop/API graph host specs enforce the wiring and lifecycle contracts

## Pros and Cons of the Options

### Keep `@specd/code-graph-electron` as the desktop composition fork

- Good, because desktop already knew that import path
- Bad, because it forks composition and drifts from injectable store factories on main
- Bad, because it couples Electron packaging to provider assembly

### Mash Electron vendor assets into `@specd/code-graph`

- Good, because one less package
- Bad, because Node and Electron native rebuild flows collide in one package boundary
- Bad, because CLI/API consumers would inherit Electron packaging concerns

### New injectable store package `@specd/code-graph-sqlite-electron`

- Good, because it fits `createSqliteGraphStoreFactory` and SDK `graph` options
- Good, because composition stays singular
- Neutral, because an extra internal package is required for native isolation
- Bad, because migration leaves the old package unused until a follow-up delete

## More Information

Related package docs: `docs/studio/packages.md`, `docs/client/connection-profiles.md`.

### Spec

- [`code-graph-sqlite-electron:sqlite-electron-store`](../../specs/code-graph-sqlite-electron/sqlite-electron-store/spec.md)
- [`studio-desktop:main-kernel-lifecycle`](../../specs/studio-desktop/main-kernel-lifecycle/spec.md)
- [`code-graph:composition`](../../specs/code-graph/composition/spec.md)
- [`code-graph:sqlite-graph-store`](../../specs/code-graph/sqlite-graph-store/spec.md)
