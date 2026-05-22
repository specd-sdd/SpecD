# cli:change-implementation

## Purpose

Implementation traceability needs an explicit workflow surface during an active change so operators and agents can review changed files, confirm spec links, and close the review loop before archive. `specd changes implementation` is the CLI command group that manages tracked implementation files and confirmed implementation links.

## Requirements

### Requirement: Command signature

Implementation tracking features SHALL be exposed under the `specd changes implementation` command group.

### Requirement: List subcommand

`specd changes implementation list <name>` MUST return the current implementation-tracking state of the change.

Its output MUST include:

- tracked implementation files grouped by review state (`open`, `resolved`, `ignored`)
- confirmed implementation links grouped by `specId` and file
- symbol-level refinements when a link has `symbols`
- stale-link diagnostics for symbol-level links whose target symbol no longer exists in the graph database

When a symbol-level link contains a composed member identifier such as `X.Y`, `X#Y`, or `X::Y`, and the exact stored symbol string is not found in the graph, the CLI SHOULD retry stale resolution against the same file using the rightmost member segment plus the graph-reported symbol kind.

This fallback is best-effort only. It MUST NOT rewrite the stored symbol string, MUST NOT mutate change state or archived sidecars, and MUST leave the symbol marked stale when multiple same-file matches make the fallback ambiguous.

### Requirement: Add subcommand

`specd changes implementation add <name> --spec <specId> --file <path> [--symbol <name> ...]` SHALL create or enrich a confirmed implementation link.

The command MUST:

- use the raw project-relative file path exactly as supplied by the user after path normalization
- validate that the file exists on disk at the supplied path; if the file is missing, the command MUST throw `ImplementationFileNotFoundError` and not modify the change manifest
- create or confirm the file-level link for the `spec + file` set
- refine that same `spec + file` set with symbol-level traceability when one or more `--symbol` values are provided
- ensure the file is present in `trackedImplementationFiles`, creating a tracked entry with state `open` when it was not already tracked
- preserve the distinction between explicit file-level links and file presence that exists only as the container for symbol-level links

### Requirement: Resolve subcommand

`specd changes implementation resolve <name> --file <paths...>` SHALL mark one or more tracked implementation files as fully reviewed for the current change.

The command MUST:

- support a comma-separated list of paths for the `--file` option
- validate that EVERY file exists on disk; throw `ImplementationFileNotFoundError` if any file is missing and abort the operation

Resolving a file means:

- all relevant spec/file/symbol links for that file have been captured for this change
- there is no remaining implementation classification work for that tracked file

`resolve` MUST update tracked-file review state only. It MUST NOT add, remove, or rewrite implementation links.

### Requirement: Ignore subcommand

`specd changes implementation ignore <name> --file <paths...>` SHALL mark one or more tracked implementation files as `ignored`.

The command MUST:

- support a comma-separated list of paths for the `--file` option
- validate that EVERY file exists on disk; throw `ImplementationFileNotFoundError` if any file is missing and abort the operation

Ignoring a file means that file remains part of tracked review history for the change but is excluded from unresolved tracked-file review. `ignore` MUST operate on tracked-file state, not by deleting the tracked entry outright.

### Requirement: Remove subcommand

`specd changes implementation remove <name> --spec <specId> --file <path> [--symbol <name> ...]` SHALL remove confirmed implementation links.

When one or more `--symbol` values are supplied, the command MUST remove only those symbol-level links for the `spec + file` set.

When no `--symbol` is supplied, the command MUST remove the whole `spec + file` set, including any symbol-level refinements attached to it.

If the last symbol is removed from a `spec + file` set whose file-level presence was never explicitly created, the command MAY remove the whole `spec + file` set. If the file-level link was explicitly created earlier, removing symbols MUST preserve that file-level link.

### Requirement: Review subcommand

`specd changes implementation review <name>` SHALL support implementation-traceability integrity review.

The review flow MUST:

- report stale symbol-level links whose target symbol is absent from the graph database
- use the current tracked implementation files and confirmed implementation links as review input
- distinguish symbol-level stale diagnostics from archive-time materialization failures and workspace-boundary validation failures
- surface when implementation-sidecar maintenance would require updates outside the current spec scope

For symbol-level stale diagnostics, the review flow SHOULD apply the same composed-member fallback used by `list` and `change status` for symbols containing `.`, `#`, or `::`, restricted to same-file matching and without mutating stored link data.

### Requirement: Shared path semantics

Manual implementation management and autodetection MUST use the same raw project-relative file-path semantics during the active change.

The CLI MUST NOT require users to enter canonical `workspace:path` identities during change-time authoring. That normalization belongs to archive-time materialization.

## Spec Dependencies

- [`core:change`](../../core/change/spec.md) — tracked implementation file state and confirmed link behavior
- [`code-graph:symbol-model`](../../code-graph/symbol-model/spec.md) — file-level and symbol-level graph relations
