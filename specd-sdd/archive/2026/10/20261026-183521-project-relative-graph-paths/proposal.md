# Proposal: project-relative-graph-paths

## Motivation

Paths and patterns in `specd.yaml` are interpreted against different roots depending on the key and on where a list is evaluated, so a user cannot tell from the YAML alone which file a pattern refers to. Reindexing the legacy `iccms` repository (nested workspaces `default` `./`, `backend` `app`, `backoffice` `app/webroot`, `cake` `cake`) showed global `graph.excludePaths` written project-relative (`/app/vendors/*`, `!/app/vendors/iccms`, `app/tmp/`) silently misbehaving inside the `backend` workspace. The fix is a single mental model: every path in `specd.yaml` is relative to the project root.

## Current behaviour

- Global `graph.excludePaths` is one list with two reference roots: project root in project-global discovery (`index-code-graph.ts` ~614, `rootExcludePaths`) and workspace `codeRoot` in workspace discovery (~549, `discoverFiles(ws.codeRoot, …)`).
- Workspace `graph.excludePaths`, `allowedPaths`, `testPaths`, `ignorePaths`, `largeFilePaths` are `codeRoot`-relative. Global `graph.testPaths` and `graph.ignorePaths` are concatenated with workspace lists and matched on the `codeRoot`-relative path. Only global `graph.largeFilePaths` is already project-relative (`file-size-gate.ts`).
- `resolve-effective-graph-config.ts` concatenates `[...global, ...synthetic, ...workspaceLocal]` into one gitignore-style list where the last match wins, so a workspace-local `!pattern` can re-include a path excluded globally. This contradicts `core:config` ("MUST NOT remove or override global exclusions"). Deduced from code and `ignore` semantics; not yet reproduced with a real configuration.
- `core:config` does not define the root of global `excludePaths`, and defines workspace lists as `codeRoot`-relative.
- No command explains why a path is excluded, classified, or indexed.

## Proposed solution

1. **Project-relative everywhere.** Evaluate every graph path/pattern key (`includePaths`, `excludePaths`, `allowedPaths`, `testPaths`, `ignorePaths`, `largeFilePaths`) at global and workspace level against the project-relative path (`relative(projectRoot, codeRoot)` joined with the `codeRoot`-relative path). Direct cut, no transition key or dual semantics (project is alpha). `.gitignore` handling is unchanged.
2. **Global exclusions non-overridable.** Evaluate global (and synthetic spec-root) exclusions as a separate layer before the workspace layer, so workspace-local rules can only add restrictions.
3. **Fingerprint.** The discovery fingerprint must change with the new semantics so existing indexes fully reindex.
4. **`specd graph why <path>`.** New command: CLI (thin) → SDK `runGraphWhy` (thin) → code-graph use case `ExplainGraphPath` with a composition factory. The use case reuses the indexer's evaluation functions (`discoverFiles` predicate, `createFileSizeGate`, `classifyFileCategory`) via variants returning the winning rule and its origin, so explanations cannot drift from real indexing.
5. **Verification follow-ups (spec compliance audit).** Repository-level `.gitignore` files must apply when a `codeRoot` is below the VCS root (a pre-existing gap that `graph why` would otherwise inherit); graph health applies the same size gate as indexing; a path matching `includePaths` but excluded is reported as `not-indexed` with its `root` evaluation; and the specs record the exact behaviour (`.hg/`/`.svn/` defaults, `size-limit` outcome for exemptions, errors of the use case, overlap fields of the index result).

## Specs affected

### New specs

- `code-graph:explain-graph-path`: use case that accepts relative, absolute (converted) or `ws:path` input, resolves the owning workspace and reports, per decisive step (`.gitignore`, global/synthetic/workspace excludes, `allowedPaths`, size gate, category, adapter), the matching rule and its origin.
  - Depends on: `core:config`, `code-graph:indexer`, `code-graph:workspace-integration`
- `sdk:run-graph-why`: thin SDK delegation to the use case through the graph provider.
  - Depends on: `code-graph:explain-graph-path`, `sdk:host-context`
- `cli:graph-why`: `specd graph why <path>` command, options, text/JSON/TOON output.
  - Depends on: `sdk:run-graph-why`, `cli:entrypoint`, `core:config`

### Modified specs

- `core:config`: all graph path/pattern keys project-root-relative at both levels; global exclusions cannot be overridden by workspace rules; rewrite `codeRoot`-relative wording and verify scenarios; add nested-workspace scenarios.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:indexer`: multi-workspace discovery and categorization evaluate project-relative paths with layered exclusions; fingerprint reflects the semantics change.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph:workspace-integration`: workspace-level filters are matched on `projectRelativePath`; nested-workspace ownership rule.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:graph-index`: index diagnostics/output wording for project-relative semantics, if affected.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

Graph impact on `discover-files.ts`, `resolve-effective-graph-config.ts`, `classify-file-category.ts`, `file-size-gate.ts`: **CRITICAL** (20 direct, 47 indirect, 85 affected files, mostly CLI/SDK importers via the package barrel; the real behavioural surface is much narrower).

Code areas:

- `packages/code-graph/src/application/use-cases/discover-files.ts`: accept a project-relative base so patterns match `join(base, relPath)`, including directory pruning during the walk.
- `…/_shared/resolve-effective-graph-config.ts`: separate global/synthetic layer from workspace layer; stop concatenating.
- `…/index-code-graph.ts` (~549, ~614, ~1280-1291): pass base; use project-relative paths for test/ignore classification.
- `…/_shared/compute-graph-fingerprint.ts`: semantic marker.
- `packages/code-graph/src/domain/services/classify-file-category.ts`, `application/services/file-size-gate.ts`: project-relative input for both levels.
- `application/services/graph-input-visibility.ts`, `use-cases/get-graph-health.ts`: stay consistent with the indexer.
- New: use case + `composition/use-cases/explain-graph-path.ts`; `packages/sdk/src/orchestration/run-graph-why.ts` (+ export); `packages/cli/src/commands/graph/why.ts` (+ `program.ts` registration).
- Docs per `default:_global/docs`: `docs/cli` page, index, sidebar; `docs/sdk/code-graph`; `docs/guide` graph configuration and path semantics.
- Active overlaps (accepted, resolve before archive): `core:config` with `bound-indexer-ast-resource-lifecycle`, `fs-decouple-04-config-loader-opaque-bindings`; `code-graph:indexer` with `bound-indexer-ast-resource-lifecycle`, `code-graph-symbol-contracts`, `code-graph-symbol-semantic-context`, `fs-decouple-03c-graph-spec-indexing-via-repository`; `code-graph:workspace-integration` with `fs-decouple-03c-…`; `cli:graph-index` with `bound-indexer-ast-resource-lifecycle`, `cli-graph-index-import-diagnostics`.

## Technical context

- Index already persists `files.project_relative_path` / `FileNode.projectRelativePath`, so the data needed exists.
- `file-size-gate.ts` already guards a project-relative path starting with `../`; same guard applies to `codeRoot` outside the project root.
- `allowedPaths` is glob syntax, not gitignore syntax: same project-relative root, different matcher.
- Layering: `cli → sdk → code-graph`; hosts import `@specd/sdk` only; composition factory pattern as in `get-graph-health.ts`, `get-spec-coverage.ts`; `graph-input-visibility.ts` is a candidate base.
- Rejected: keep `codeRoot`-relative and document; second key `projectExcludePaths`; evaluate each pattern against both paths (undefined for negations); `graph.pathBase` transition key; startup warning for no-longer-matching anchored patterns; `graph why` as CLI orchestration; splitting `graph why` into another change.
- Workaround to retire afterwards: duplicated codeRoot-relative patterns in `../iccms/specd.yaml`.

## Open questions

None open. Resolved with the user:

1. `graph why` input accepts a project-relative path, an absolute path (converted to project-relative), or `ws:path` (pins the workspace).
2. Nested workspaces: owner is the most specific containing `codeRoot`; other workspaces whose `codeRoot` also contains the path are listed as informational.
3. `codeRoot` outside the project root (project-relative path starts with `../`): project-relative patterns cannot match; `graph why` reports an explicit diagnostic, indexing unchanged.
4. MCP exposure: out of scope (no MCP command surface yet).

Design task (not a spec question): verify each built-in default (`DEFAULT_EXCLUDE_PATHS`, default test/ignore paths) behaves identically under project-relative matching.
