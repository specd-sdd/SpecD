# Proposal: indexer-config-exclude-paths

## Motivation

The code graph indexer has no config-level mechanism to exclude custom paths during file discovery. Teams that want to skip generated files, large non-relevant directories, or selectively include specific subdirectories of otherwise-excluded dirs must resort to `.gitignore` — which conflates VCS ignore rules with indexing preferences.

## Current behaviour

`discoverFiles` hard-codes a fixed `EXCLUDED_DIRS` set (`node_modules`, `.git`, `.specd`, `dist`, `build`, `coverage`, `.next`, `.nuxt`) that cannot be overridden. These dirs are skipped unconditionally before any ignore evaluation, so even `.gitignore` negation patterns (`!.specd/metadata/`) cannot re-include them. Custom exclusions at indexing time are not possible from `specd.yaml`.

The only existing exclude support (`--exclude-path`, `--exclude-workspace`) applies at query time (`graph search`, `graph hotspots`) — not during indexing.

## Proposed solution

Add a `graph` block to per-workspace config in `specd.yaml`:

```yaml
workspaces:
  default:
    codeRoot: ./
    graph:
      respectGitignore: true # default: true; false = skip all .gitignore files
      excludePaths: # gitignore-syntax, supports negation with !
        - .specd/*
        - '!.specd/metadata/'
  core:
    codeRoot: packages/core
    graph:
      excludePaths:
        - dist/
```

The hardcoded `EXCLUDED_DIRS` are removed from `discoverFiles` and replaced by a built-in default list applied when `excludePaths` is not configured. When `excludePaths` is specified, it **replaces** the built-in defaults entirely — the user takes full ownership.

Evaluation order when `respectGitignore: true`:

1. `.gitignore` rules — absolute priority, cannot be overridden
2. `excludePaths` config rules — applied as an additional `ignore` layer

When `respectGitignore: false`, only `excludePaths` applies.

## Specs affected

### New specs

- none

### Modified specs

- `core:core/config`: add `graph` block to workspace config — fields `graph.respectGitignore` (boolean, default `true`) and `graph.excludePaths` (string array, gitignore-syntax). Add to startup validation rules. Add to `SpecdWorkspaceConfig` type.
  - Depends on (added): none

- `code-graph:code-graph/indexer`: update `discoverFiles` contract — remove hardcoded `EXCLUDED_DIRS`; add `excludePaths` and `respectGitignore` parameters; document default patterns and replacement semantics; update constraint that currently states hardcoded dirs cannot be overridden.
  - Depends on (added): none

- `code-graph:code-graph/workspace-integration`: extend `WorkspaceIndexTarget` to carry `graph.excludePaths` and `graph.respectGitignore` from workspace config; document how these flow from `SpecdWorkspaceConfig` → `WorkspaceIndexTarget` → `discoverFiles`.
  - Depends on (added): `core:core/config`

- `cli:cli/graph-index`: add `--exclude-path <pattern>` flag (repeatable) that merges additional gitignore-syntax patterns on top of config's `graph.excludePaths` for a one-off run without modifying `specd.yaml`; document the effect of `graph.excludePaths` and `graph.respectGitignore` config fields on indexing behaviour; add `## graph` command group (index, search, hotspots, stats, impact) to `docs/cli/cli-reference.md` — currently the entire `graph` command group is absent from the CLI reference.
  - Depends on (added): none

## Impact

- `packages/core/src/application/specd-config.ts` — add `SpecdWorkspaceGraphConfig` type and `graph?` field to `SpecdWorkspaceConfig`
- `packages/core/src/infrastructure/fs/config-loader.ts` — add `graph` block to `WorkspaceRawZodSchema` (currently `.strict()` — unknown fields are rejected)
- `packages/code-graph/src/domain/value-objects/index-options.ts` — add `excludePaths?` and `respectGitignore?` to `WorkspaceIndexTarget`
- `packages/code-graph/src/application/use-cases/discover-files.ts` — remove `EXCLUDED_DIRS`; accept new params; apply config exclude layer
- `packages/cli/src/commands/graph/build-workspace-targets.ts` — pass `ws.graph` fields to `WorkspaceIndexTarget`
- `docs/cli/cli-reference.md` — add `## graph` section covering all five graph commands (`index`, `search`, `hotspots`, `stats`, `impact`), with full flag reference and examples; document `--exclude-path` flag and the `graph.excludePaths` / `graph.respectGitignore` config fields under `graph index`

`isSpecdConfig` is a CRITICAL hotspot (118 callers) — any change to `SpecdWorkspaceConfig` will flow through it automatically since it uses `zod` inference; no manual update needed there.

## Technical context

- `discoverFiles` already uses the `ignore` npm library which natively supports gitignore-syntax including `!` negations. `isIgnored()` already handles `result.unignored` correctly for negation patterns. No new dependency needed.
- The `EXCLUDED_DIRS` check at line 126 runs **before** `isIgnored()`, which is why negation cannot currently override hardcoded dirs. Moving them to an `ignore` instance eliminates this ordering issue.
- `.gitignore` priority: when `respectGitignore: true`, the gitignore `scopedIgnores` are evaluated first (before the config `excludePaths` layer). If gitignore marks a file as ignored, the config layer cannot re-include it.
- Default `excludePaths` (applied when user omits the field): `node_modules/`, `.git/`, `.specd/`, `dist/`, `build/`, `coverage/`, `.next/`, `.nuxt/` — exactly the current `EXCLUDED_DIRS` set.
- Config is per-workspace (not project-level) because each workspace has its own `codeRoot` and its own `.gitignore` hierarchy.
- `--exclude-path` CLI flag merges with config's `excludePaths` (additive, not replace). This mirrors the pattern already used by `graph search` and `graph hotspots`. `--respect-gitignore` / `--no-respect-gitignore` is config-only — not exposed as a CLI flag.

## Open questions

- **Replace vs merge for defaults:** When a user specifies `excludePaths`, should the built-in defaults still apply (merged) or be completely replaced? Decided: **replace** — user takes full control; built-in defaults are clearly documented so users can copy-paste what they need.
