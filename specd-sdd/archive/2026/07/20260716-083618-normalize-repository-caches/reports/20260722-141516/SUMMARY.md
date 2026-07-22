# Compliance + verification summary — normalize-repository-caches

**Mode:** Full (scenarios + compliance)  
**Date:** 2026-07-22  
**Partials:** `_partial-core-ports-fs.md`, `_partial-usecases-cli.md`

## Scenario verification

Most scenarios PASS (tests green for core/cli list + fs-cache suites). Failures:

| Spec                           | Scenario                                                       | Class    | Notes                                                                                         |
| ------------------------------ | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `core:repository-port`         | After cursor returns next page… (`meta.after` = last returned) | **CODE** | `paginateList` echoes input `options.after`                                                   |
| `core:archive-repository-port` | Path resolved from ArchiveListEntry                            | **CODE** | `ArchivePathEntry` still requires `workspaces`; list entry has none; no derive-from-`specIds` |
| `core:get-project-summary`     | resolveGetProjectSummaryDeps field list                        | **SPEC** | Stale rule lists List\* UCs; code correctly uses count ports                                  |

## Compliance audit (additional)

| Severity | Spec / area                                | Class | Notes                                                                                                  |
| -------- | ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| CRITICAL | `core:repository-port` / `list-pagination` | CODE  | Same `meta.after` bug; no unit tests for `paginateList`                                                |
| CRITICAL | `core:archive-repository-port`             | CODE  | Same `archivePath(ArchiveListEntry)` gap                                                               |
| HIGH     | `cli:spec-list` `--workspace` JSON         | BOTH  | Spec wants all workspaces with empty for non-matches; CLI emits filtered subset only (locked by tests) |
| MEDIUM   | `core:list-specs` resolveListSpecsDeps     | SPEC  | Still mentions hasher/yaml; deps are only `listWorkspaces`                                             |
| MEDIUM   | `docs/core/use-cases.md`                   | DOCS  | Stale constructors / return shapes for list UCs                                                        |
| LOW      | `docs/cli/cli-reference.md` project init   | DOCS  | Plugin table gap                                                                                       |
| LOW      | `cli:archive-list` example                 | SPEC  | Example contradicts own requirement text                                                               |

## Recommendation

Do **not** archive yet. Prefer **Both**: fix CODE gaps (`meta.after`, `archivePath` + `workspacesFromSpecIds`), then `/specd-design` to clean SPEC/DOCS drift and decide `cli:spec-list` workspace-filter JSON semantics.
