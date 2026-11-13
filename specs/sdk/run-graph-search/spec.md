# SDK Run Graph Search

## Purpose

Provides a host-agnostic SDK orchestration function `runGraphSearch` that combines `SdkHostContext` with code-graph search capabilities, returning structured search results with canonical paths projected onto `projectRelativePath` (relative to `projectRoot`). This allows CLI, MCP, and other tool hosts to query code graph symbols, files, specs, and documents without duplicating path projection and mapping logic.

## Requirements

### Requirement: runGraphSearch orchestration

`runGraphSearch(ctx: SdkHostContext, input: RunGraphSearchInput): Promise<RunGraphSearchResult>` SHALL:

1. Accept search parameters covering 100% of code-graph search options:
   - `query`: text or symbol search string.
   - `categories`: optional array of categories (`symbols`, `files`, `specs`, `documents`), defaulting to all when omitted.
   - `kinds`: optional array of symbol kinds.
   - `file` or `filePattern`: optional file path or pattern filter.
   - `exactFile`: optional boolean flag indicating if `filePattern` was pre-resolved to an exact file.
   - `workspace`: optional workspace filter.
   - `excludePaths`: optional array of path glob exclusions.
   - `excludeWorkspaces`: optional array of workspace exclusions.
   - `fileCategories`: optional array of file categories (`source`, `test`, `ignored`).
   - `includeTests`: optional boolean to include test category files.
   - `includeIgnored`: optional boolean to include ignored category files.
   - `limit`: optional maximum results per category (defaulting to 20).
   - `snippet` or `includeSnippet`: optional boolean requesting code snippet previews.
   - `specContent`: optional boolean requesting full specification requirement markdown.
   - `provider`: optional pre-opened caller-owned `CodeGraphProvider`.
2. When `input.provider` is omitted, open a transient provider using `withOpenGraphProvider(ctx, ...)`. When provided, execute queries on the supplied open provider directly.
3. Forward all search options to `provider.search(...)`.
4. Project all canonical graph locations to `projectRelativePath` using the project's configuration (`ctx.kernel.project.getConfig.execute()`):
   - On symbol entries: include `projectRelativePath` on every declaration (`declaration.location.projectRelativePath`), symbol hit (`symbol.projectRelativePath`), and logical target / public binding surface (`projectRelativePath`).
   - On file entries: include `projectRelativePath` alongside canonical `path`, and omit `configRelativePath`.
   - On document entries: include `projectRelativePath` alongside canonical `path`, and omit `configRelativePath`.
   - On spec entries: retain `specId`, `path`, `title`, and `description`.
5. Return a category-grouped `RunGraphSearchResult` containing `symbols`, `files`, `specs`, `documents`, and `omittedCounts`.

### Requirement: Elimination of legacy path properties

`RunGraphSearchResult` SHALL NOT expose `configRelativePath` or `displayPath`. All filesystem paths relative to the repository root SHALL be exposed strictly through `projectRelativePath`.

### Requirement: Pure path projection

The orchestration SHALL project canonical graph paths (`<workspace>:<relPath>`) to `projectRelativePath` using project and workspace configuration alone. Path projection SHALL NOT perform graph store reads or availability validation.

### Requirement: No presenter formatting

`runGraphSearch` SHALL return pure structured data. Terminal layout, ANSI styling, text table formatting, and CLI omission notices remain in host presenters.

## Spec Dependencies

- [`sdk:host-context`](../host-context/spec.md) — host context for kernel and provider access
- [`sdk:with-open-graph-provider`](../with-open-graph-provider/spec.md) — provider lifecycle helper
- [`core:config`](../../../../specs/core/config/spec.md) — project configuration and workspace code roots
- [`code-graph:composition`](../../../../specs/code-graph/composition/spec.md) — code graph provider search capabilities
- [`code-graph:document-model`](../../../../specs/code-graph/document-model/spec.md) — document model representation
